// shop-abonnement: "Mijn abonnement" voor een ingelogd lid (app: Profiel > Mijn abonnement).
//  actie "overzicht":  de betaalde winkelabonnementen van dit lid, met prijs, volgende betaling,
//                      einddatum (als opgezegd) en tot wanneer herroepen kan. Live uit Stripe.
//  actie "opzeggen":   opzegtermijn van één maand: het abonnement stopt aan het eind van dezelfde
//                      kalenderdag een maand later (Amsterdamse tijd; 12 oktober -> t/m 12 november).
//                      Stripe rekent de laatste periode naar rato af. Valt die dag binnen de al
//                      betaalde periode, dan stopt het aan het eind van die periode (geen verlies).
//                      Tijdens een proefperiode stopt het aan het eind van de proef, zonder kosten.
//  actie "intrekken":  opzegging ongedaan maken, zolang de einddatum nog niet bereikt is.
//  actie "herroepen":  binnen 14 dagen na de start (bedenktijd): het abonnement stopt meteen. Het
//                      ongebruikte deel van de eerste betaling betalen wij terug (interne melding
//                      met het bedrag; terugbetalen gebeurt in Stripe).
// Bij elke stap een bevestigingsmail aan het lid (naar het inlogadres) en bij opzeggen/herroepen
// een interne melding. De reden van opzeggen staat alleen in die melding en in Stripe, niet in
// de tabel die coaches kunnen lezen (het kan om gezondheid gaan).
// Wat Stripe daarna doet, verwerkt stripe-webhook (customer.subscription.updated en .deleted).
// verify_jwt staat aan: alleen ingelogde gebruikers, en alleen hun eigen abonnementen.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const BEDENKTIJD_MS = 14 * 86400_000;
const MAX_MAILS_PER_UUR = 6; // tegen misbruik: niet eindeloos bevestigingsmails laten versturen

// ---- datum ----
const TZ = "Europe/Amsterdam";
function amsDelen(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { j: +p.year, m: +p.month, d: +p.day, u: +p.hour, mi: +p.minute, s: +p.second };
}
// Het UTC-moment van een Amsterdamse kloktijd (houdt rekening met zomer- en wintertijd).
function amsNaarUtc(j: number, m: number, d: number, u: number, mi: number, s: number): Date {
  const gok = Date.UTC(j, m - 1, d, u, mi, s);
  const a = amsDelen(new Date(gok));
  const verschil = Date.UTC(a.j, a.m - 1, a.d, a.u, a.mi, a.s) - gok;
  return new Date(gok - verschil);
}
// Einde van de opzegtermijn: dezelfde kalenderdag een maand later (bestaat die niet, dan de
// laatste dag van die maand), om 23:59:59 Amsterdamse tijd.
export function eindeOpzegtermijn(nu: Date): Date {
  const a = amsDelen(nu);
  let j = a.j, m = a.m + 1;
  if (m > 12) { m = 1; j++; }
  const laatste = new Date(Date.UTC(j, m, 0)).getUTCDate();
  return amsNaarUtc(j, m, Math.min(a.d, laatste), 23, 59, 59);
}

async function stripe(pad: string, methode = "GET", vorm?: URLSearchParams) {
  const sleutel = Deno.env.get("STRIPE_SECRET_KEY");
  if (!sleutel) throw new Error("STRIPE_SECRET_KEY ontbreekt");
  const r = await fetch("https://api.stripe.com/v1/" + pad, {
    method: methode,
    headers: { Authorization: "Bearer " + sleutel, ...(vorm ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: vorm,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Stripe: " + (j?.error?.message || r.status));
  return j;
}

// Wanneer zou dit abonnement stoppen als het lid nu opzegt? Eén regel, gebruikt voor het
// voorbeeld in de app én bij het echte opzeggen.
function opzegPlan(sub: any): { periodeEinde: boolean; eind: Date } {
  const item = sub?.items?.data?.[0] || {};
  const pe = (item.current_period_end || sub?.current_period_end || 0) * 1000;
  const eind = eindeOpzegtermijn(new Date());
  if (sub?.status === "trialing" || eind.getTime() <= pe) return { periodeEinde: true, eind: new Date(pe) };
  return { periodeEinde: false, eind };
}

// Stripe-abonnement omzetten naar wat de app nodig heeft.
function samenvatting(sub: any) {
  const item = sub?.items?.data?.[0] || {};
  const periodeEinde = item.current_period_end || sub?.current_period_end || null; // nieuwe en oude API-versie
  const stoptOp = sub?.cancel_at || (sub?.cancel_at_period_end ? periodeEinde : null);
  const actief = ["active", "trialing", "past_due"].includes(sub?.status);
  const herroepTot = sub?.start_date ? sub.start_date * 1000 + BEDENKTIJD_MS : null;
  return {
    stripe_status: sub?.status || null,
    prijs_cents: item.price?.unit_amount ?? null,
    interval: item.price?.recurring?.interval || "month",
    // Volgende (bij opzeggen: laatste, naar rato) betaling, alleen als die vóór de einddatum valt.
    volgende_betaling: actief && periodeEinde && (!stoptOp || periodeEinde < stoptOp) ? new Date(periodeEinde * 1000).toISOString() : null,
    stopt_op: stoptOp ? new Date(stoptOp * 1000).toISOString() : null,
    herroepbaar_tot: actief && herroepTot && Date.now() < herroepTot ? new Date(herroepTot).toISOString() : null,
    // voorbeeld voor de app: zo laat stopt het als je nu opzegt
    opzeg_einde: actief && !stoptOp ? opzegPlan(sub).eind.toISOString() : null,
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
      catch (_e) { info = { stripe_status: null, prijs_cents: null, interval: "month", volgende_betaling: null, stopt_op: o.cancel_at, herroepbaar_tot: null, opzeg_einde: null, actief: true, onbekend: true }; }
      if (!info.actief && !info.onbekend) continue; // al beëindigd
      lijst.push({ order_id: o.id, programma: p?.name || "Programma", sinds: o.created_at, opgezegd_op: o.cancel_requested_at, ...info });
    }
    return json(200, { abonnementen: lijst });
  }

  const o = (orders || []).find((x) => x.id === body.order_id);
  if (!o) return json(404, { error: "Dit abonnement is niet (meer) gevonden." });
  const { data: p } = o.blog_program_id ? await db.from("blog_programs").select("name").eq("id", o.blog_program_id).maybeSingle() : { data: null };
  const programma = p?.name || "het programma";
  // Bevestigingen gaan naar het inlogadres (bevestigd), anders naar het adres van de bestelling.
  const naar = wie?.user?.email || o.email || null;
  const { data: prof } = await db.from("profiles").select("first_name,last_name").eq("id", uid).maybeSingle();
  const naam = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ") || naar || "Een lid";
  const nlDatum = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }) : "";

  // Bevestigingsmail in de wachtrij. Geeft false als dat niet lukte (dan zetten we het in de melding).
  const plantMail = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!naar) return false;
    const { count } = await db.from("mail_queue").select("id", { count: "exact", head: true })
      .eq("event", "opzegging").eq("payload->>order_id", o.id).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count || 0) >= MAX_MAILS_PER_UUR) return false;
    const { error } = await db.from("mail_queue").insert({ company_id: o.company_id, recipient_email: naar, event: "opzegging", payload: { order_id: o.id, ...payload } });
    if (error) { console.error("bevestigingsmail niet ingepland:", error.message); return false; }
    return true;
  };
  const meld = async (onderwerp: string, bericht: string, context: Record<string, unknown>) => {
    const { error } = await db.from("app_meldingen").insert({ company_id: o.company_id, profile_id: uid, soort: "vraag", pagina: "winkel", onderwerp, bericht, context });
    if (error) console.error("melding mislukt:", error.message);
  };
  // Bestelling bijwerken; bij een fout één keer opnieuw (Stripe is dan al aangepast).
  const zetOrder = async (patch: Record<string, unknown>) => {
    for (let i = 0; i < 2; i++) {
      const { error } = await db.from("shop_orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", o.id);
      if (!error) return;
      console.error("bestelling bijwerken mislukt:", error.message);
    }
  };

  let sub;
  try { sub = await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id)); }
  catch (_e) { return json(502, { error: "Dat lukt nu niet. Probeer het zo opnieuw." }); }
  const actief = ["active", "trialing", "past_due"].includes(sub.status);

  if (body.actie === "opzeggen") {
    if (!actief) return json(400, { error: "Dit abonnement is al gestopt." });
    if (sub.cancel_at || sub.cancel_at_period_end) return json(200, { ok: true, al: true, ...samenvatting(sub) }); // al opgezegd: einddatum blijft staan
    const reden = String(body.reden || "").trim().slice(0, 450);
    const plan = opzegPlan(sub);
    const eind = plan.eind;
    const vorm = new URLSearchParams();
    if (plan.periodeEinde) {
      // Proefperiode, of de einddatum valt in de al betaalde periode: stoppen aan het eind daarvan.
      vorm.set("cancel_at_period_end", "true");
    } else {
      vorm.set("cancel_at", String(Math.floor(eind.getTime() / 1000)));
      vorm.set("proration_behavior", "create_prorations"); // laatste periode alleen tot de einddatum
    }
    vorm.set("metadata[opgezegd_via]", "app");
    if (reden) vorm.set("cancellation_details[comment]", reden);
    let nieuw;
    try { nieuw = await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id), "POST", vorm); }
    catch (e) { console.error("opzeggen mislukt:", (e as Error).message); return json(502, { error: "Opzeggen lukt nu niet. Probeer het zo opnieuw." }); }
    const info = samenvatting(nieuw);
    await zetOrder({ cancel_at: info.stopt_op, cancel_requested_at: new Date().toISOString() });
    const mailOk = await plantMail({ soort: "opgezegd", stopt_op: info.stopt_op, laatste_betaling: info.volgende_betaling });
    await meld("Winkel: opzegging " + programma,
      naam + " heeft " + programma + " opgezegd. Het abonnement stopt op " + nlDatum(info.stopt_op) + "." +
      (reden ? " Reden: " + reden : " Geen reden opgegeven.") +
      (mailOk ? "" : " LET OP: de bevestigingsmail kon niet worden ingepland; stuur het lid zelf een bevestiging."),
      { order_id: o.id, stopt_op: info.stopt_op });
    return json(200, { ok: true, programma: p?.name || null, mail: mailOk, ...info });
  }

  if (body.actie === "intrekken") {
    if (!actief) return json(400, { error: "Dit abonnement is al gestopt; bestel het programma opnieuw als je weer wilt starten." });
    if (!sub.cancel_at && !sub.cancel_at_period_end) return json(200, { ok: true, ...samenvatting(sub) });
    const vorm = new URLSearchParams();
    // Eén van beide tegelijk: een einddatum (zo zeggen wij op) of "einde periode".
    if (sub.cancel_at_period_end) vorm.set("cancel_at_period_end", "false");
    else vorm.set("cancel_at", "");
    vorm.set("metadata[opgezegd_via]", "");
    let nieuw;
    try { nieuw = await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id), "POST", vorm); }
    catch (e) { console.error("intrekken mislukt:", (e as Error).message); return json(502, { error: "Dat lukt nu niet. Probeer het zo opnieuw." }); }
    await zetOrder({ cancel_at: null, cancel_requested_at: null });
    const mailOk = await plantMail({ soort: "ingetrokken" });
    return json(200, { ok: true, programma: p?.name || null, mail: mailOk, ...samenvatting(nieuw) });
  }

  if (body.actie === "herroepen") {
    const info = samenvatting(sub);
    if (!actief) return json(400, { error: "Dit abonnement is al gestopt." });
    if (!info.herroepbaar_tot) return json(400, { error: "De bedenktijd van 14 dagen is voorbij. Je kunt wel opzeggen." });
    // Wat is er van de eerste betaling nog niet gebruikt? (schatting voor de terugbetaling)
    const item = sub.items?.data?.[0] || {};
    const start = (item.current_period_start || sub.current_period_start || sub.start_date) * 1000;
    const einde = (item.current_period_end || sub.current_period_end || 0) * 1000;
    const prijs = item.price?.unit_amount || 0;
    const nuMs = Date.now();
    const terug = sub.status === "trialing" || einde <= start ? 0 : Math.max(0, Math.round(prijs * (einde - nuMs) / (einde - start)));
    try { await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id), "DELETE"); }
    catch (e) { console.error("herroepen mislukt:", (e as Error).message); return json(502, { error: "Herroepen lukt nu niet. Probeer het zo opnieuw." }); }
    const nu = new Date().toISOString();
    await zetOrder({ cancel_at: nu, cancel_requested_at: nu, withdrawn_at: nu });
    const bedrag = "€" + (terug / 100).toFixed(2).replace(".", ",");
    const mailOk = await plantMail({ soort: "herroepen", ontvangen_op: nu, terug_cents: terug });
    await meld("Winkel: herroeping " + programma + " (terugbetalen " + bedrag + ")",
      naam + " heeft " + programma + " herroepen binnen de bedenktijd. Het abonnement is direct gestopt. " +
      (terug > 0 ? "Betaal " + bedrag + " terug (ongebruikte deel van de eerste betaling) in Stripe: Betalingen > deze klant > Terugbetalen. Wettelijk binnen 14 dagen." : "Er hoeft niets terugbetaald te worden (proefperiode of niets betaald).") +
      (mailOk ? "" : " LET OP: de bevestigingsmail kon niet worden ingepland; stuur het lid zelf een bevestiging."),
      { order_id: o.id, terug_cents: terug, stripe_subscription_id: o.stripe_subscription_id });
    return json(200, { ok: true, herroepen: true, terug_cents: terug, mail: mailOk });
  }

  return json(400, { error: "Onbekende actie" });
});
