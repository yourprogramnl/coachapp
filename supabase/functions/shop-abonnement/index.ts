// shop-abonnement: "Mijn abonnement" voor een ingelogd lid (app: Profiel > Mijn abonnement).
//  actie "overzicht":  de betaalde winkelabonnementen van dit lid, met prijs, volgende betaling
//                      en (als opgezegd) de einddatum. Gegevens komen live uit Stripe.
//  actie "opzeggen":   opzegtermijn van één maand. Het abonnement stopt precies een maand na
//                      het opzeggen (12 oktober -> 12 november). Stripe rekent de laatste periode
//                      naar rato af: alleen de dagen tot de einddatum. Tot die dag blijft het
//                      programma gewoon zichtbaar. Het lid krijgt een bevestigingsmail en wij
//                      een interne melding.
//  actie "intrekken":  opzegging ongedaan maken, zolang de einddatum nog niet bereikt is.
// Wat Stripe daarna doet, verwerkt stripe-webhook: customer.subscription.updated (einddatum
// bijhouden, ook als wij in het Stripe-dashboard opzeggen) en customer.subscription.deleted
// (programma eraf via shop_afsluiten).
// verify_jwt staat aan: alleen ingelogde gebruikers, en alleen hun eigen abonnementen.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Precies één kalendermaand later, op hetzelfde tijdstip. Bestaat die dag niet (31 januari),
// dan de laatste dag van die maand (28 of 29 februari).
export function eenMaandLater(d: Date): Date {
  const j = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const laatste = new Date(Date.UTC(j, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(j, m, Math.min(d.getUTCDate(), laatste), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}

async function stripe(pad: string, vorm?: URLSearchParams) {
  const sleutel = Deno.env.get("STRIPE_SECRET_KEY");
  if (!sleutel) throw new Error("STRIPE_SECRET_KEY ontbreekt");
  const r = await fetch("https://api.stripe.com/v1/" + pad, {
    method: vorm ? "POST" : "GET",
    headers: { Authorization: "Bearer " + sleutel, ...(vorm ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: vorm,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Stripe: " + (j?.error?.message || r.status));
  return j;
}

// Stripe-abonnement omzetten naar wat de app nodig heeft.
function samenvatting(sub: any) {
  const item = sub?.items?.data?.[0] || {};
  const periodeEinde = item.current_period_end || sub?.current_period_end || null; // nieuwe en oude API-versie
  const stoptOp = sub?.cancel_at || (sub?.cancel_at_period_end ? periodeEinde : null);
  const actief = ["active", "trialing", "past_due"].includes(sub?.status);
  return {
    stripe_status: sub?.status || null,
    prijs_cents: item.price?.unit_amount ?? null,
    interval: item.price?.recurring?.interval || "month",
    volgende_betaling: actief && periodeEinde && (!stoptOp || periodeEinde < stoptOp) ? new Date(periodeEinde * 1000).toISOString() : null,
    stopt_op: stoptOp ? new Date(stoptOp * 1000).toISOString() : null,
    actief,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Alleen POST" });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: wie } = jwt ? await db.auth.getUser(jwt) : { data: null };
  const uid = wie?.user?.id;
  if (!uid) return json(401, { error: "Log opnieuw in." });

  let body: { actie?: string; order_id?: string; reden?: string } = {};
  try { body = await req.json(); } catch { /* leeg */ }

  const { data: orders, error: oErr } = await db.from("shop_orders")
    .select("id,company_id,blog_program_id,status,email,stripe_subscription_id,cancel_at,cancel_requested_at,created_at")
    .eq("profile_id", uid).eq("status", "paid").not("stripe_subscription_id", "is", null)
    .order("created_at", { ascending: false });
  if (oErr) return json(502, { error: "Je abonnement kan nu niet geladen worden. Probeer het zo opnieuw." });

  if (body.actie === "overzicht") {
    const lijst = [];
    for (const o of orders || []) {
      const { data: p } = o.blog_program_id ? await db.from("blog_programs").select("name").eq("id", o.blog_program_id).maybeSingle() : { data: null };
      let info;
      try { info = samenvatting(await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id))); }
      catch (_e) { info = { stripe_status: null, prijs_cents: null, interval: "month", volgende_betaling: null, stopt_op: o.cancel_at, actief: true, onbekend: true }; }
      if (!info.actief && !info.onbekend) continue; // al beëindigd
      lijst.push({ order_id: o.id, programma: p?.name || "Programma", sinds: o.created_at, opgezegd_op: o.cancel_requested_at, ...info });
    }
    return json(200, { abonnementen: lijst });
  }

  const o = (orders || []).find((x) => x.id === body.order_id);
  if (!o) return json(404, { error: "Dit abonnement is niet (meer) gevonden." });
  const { data: p } = o.blog_program_id ? await db.from("blog_programs").select("name").eq("id", o.blog_program_id).maybeSingle() : { data: null };

  if (body.actie === "opzeggen") {
    let sub;
    try { sub = await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id)); }
    catch (_e) { return json(502, { error: "Opzeggen lukt nu niet. Probeer het zo opnieuw." }); }
    if (!["active", "trialing", "past_due"].includes(sub.status)) return json(400, { error: "Dit abonnement is al gestopt." });
    if (sub.cancel_at) return json(200, { ok: true, al: true, ...samenvatting(sub) }); // al opgezegd: einddatum blijft staan
    const eind = eenMaandLater(new Date());
    const reden = String(body.reden || "").trim().slice(0, 450);
    const vorm = new URLSearchParams();
    vorm.set("cancel_at", String(Math.floor(eind.getTime() / 1000)));
    vorm.set("proration_behavior", "create_prorations"); // laatste periode alleen tot de einddatum
    vorm.set("metadata[opgezegd_via]", "app");
    if (reden) vorm.set("cancellation_details[comment]", reden);
    let nieuw;
    try { nieuw = await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id), vorm); }
    catch (e) { console.error("opzeggen mislukt:", (e as Error).message); return json(502, { error: "Opzeggen lukt nu niet. Probeer het zo opnieuw." }); }
    const info = samenvatting(nieuw);
    const nu = new Date().toISOString();
    await db.from("shop_orders").update({ cancel_at: info.stopt_op, cancel_requested_at: nu, cancel_reason: reden || null, updated_at: nu }).eq("id", o.id);
    // Bevestiging naar het lid (verplicht bij opzeggen online) en een melding voor ons.
    const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", uid).maybeSingle();
    const naar = prof?.email || o.email;
    if (naar) await db.from("mail_queue").insert({ company_id: o.company_id, recipient_email: naar, event: "opzegging", payload: { order_id: o.id, soort: "opgezegd" } });
    const naam = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ") || naar || "Een lid";
    const { error: mErr } = await db.from("app_meldingen").insert({
      company_id: o.company_id, profile_id: uid, soort: "vraag", pagina: "winkel",
      onderwerp: "Winkel: opzegging " + (p?.name || "programma"),
      bericht: naam + " heeft " + (p?.name || "het programma") + " opgezegd. Het abonnement stopt op " +
        new Date(info.stopt_op!).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }) +
        (reden ? ". Reden: " + reden : ". Geen reden opgegeven."),
      context: { order_id: o.id, stopt_op: info.stopt_op },
    });
    if (mErr) console.error("melding opzegging mislukt:", mErr.message);
    return json(200, { ok: true, programma: p?.name || null, ...info });
  }

  if (body.actie === "intrekken") {
    let sub;
    try { sub = await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id)); }
    catch (_e) { return json(502, { error: "Dat lukt nu niet. Probeer het zo opnieuw." }); }
    if (!["active", "trialing", "past_due"].includes(sub.status)) return json(400, { error: "Dit abonnement is al gestopt; bestel het programma opnieuw als je weer wilt starten." });
    if (!sub.cancel_at && !sub.cancel_at_period_end) return json(200, { ok: true, ...samenvatting(sub) });
    const vorm = new URLSearchParams();
    // Eén van beide tegelijk: een einddatum (zo zeggen wij op) of "einde periode" (Stripe-dashboard).
    if (sub.cancel_at_period_end) vorm.set("cancel_at_period_end", "false");
    else vorm.set("cancel_at", "");
    vorm.set("metadata[opgezegd_via]", "");
    let nieuw;
    try { nieuw = await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id), vorm); }
    catch (e) { console.error("intrekken mislukt:", (e as Error).message); return json(502, { error: "Dat lukt nu niet. Probeer het zo opnieuw." }); }
    const nu = new Date().toISOString();
    await db.from("shop_orders").update({ cancel_at: null, cancel_requested_at: null, cancel_reason: null, updated_at: nu }).eq("id", o.id);
    const { data: prof } = await db.from("profiles").select("email").eq("id", uid).maybeSingle();
    const naar = prof?.email || o.email;
    if (naar) await db.from("mail_queue").insert({ company_id: o.company_id, recipient_email: naar, event: "opzegging", payload: { order_id: o.id, soort: "ingetrokken" } });
    return json(200, { ok: true, programma: p?.name || null, ...samenvatting(nieuw) });
  }

  return json(400, { error: "Onbekende actie" });
});
