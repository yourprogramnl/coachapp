// shop-beheer: winkelabonnementen beheren vanuit het dashboard (Blog > Klanten), door de
// eigenaar of beheerder (platform_admin). Een coach mag kijken, niet ingrijpen.
//  actie "info":         stand van één abonnement, live uit Stripe: status, volgende betaling,
//                        einddatum, laatste betaling (bedrag en datum) en wat er nog terug te
//                        betalen valt.
//  actie "opzeggen":     dezelfde regel als in de app: opzegtermijn van één maand (stopt aan
//                        het eind van dezelfde kalenderdag een maand later, Amsterdamse tijd;
//                        laatste periode naar rato). Het lid krijgt de gewone opzegbevestiging.
//  actie "intrekken":    opzegging ongedaan maken, zolang de einddatum niet bereikt is.
//  actie "stoppen":      per direct beëindigen (bijvoorbeeld bij een afspraak met de klant).
//                        Terugbetalen gebeurt apart met "terugbetalen"; stripe-webhook zet de
//                        bestelling daarna op canceled en haalt het programma weg.
//  actie "terugbetalen": een bedrag (centen) terugbetalen op de laatste geslaagde betaling van
//                        deze klant. Interne melding als vastlegging.
// verify_jwt staat aan; de rol wordt hier nog eens uit profiles gelezen (niet uit de client).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---- datum (zelfde regels als shop-abonnement) ----
const TZ = "Europe/Amsterdam";
function amsDelen(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { j: +p.year, m: +p.month, d: +p.day, u: +p.hour, mi: +p.minute, s: +p.second };
}
function amsNaarUtc(j: number, m: number, d: number, u: number, mi: number, s: number): Date {
  const gok = Date.UTC(j, m - 1, d, u, mi, s);
  const a = amsDelen(new Date(gok));
  const verschil = Date.UTC(a.j, a.m - 1, a.d, a.u, a.mi, a.s) - gok;
  return new Date(gok - verschil);
}
function eindeBedenktijd(start: Date): Date {
  const a = amsDelen(start);
  return amsNaarUtc(a.j, a.m, a.d + 14, 23, 59, 59);
}
const amsDag = (d: Date) => { const a = amsDelen(d); return a.j * 10000 + a.m * 100 + a.d; };
function eindeOpzegtermijn(nu: Date): Date {
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

// deno-lint-ignore no-explicit-any
function opzegPlan(sub: any): { periodeEinde: boolean; eind: Date } {
  const item = sub?.items?.data?.[0] || {};
  const pe = (item.current_period_end || sub?.current_period_end || 0) * 1000;
  const eind = eindeOpzegtermijn(new Date());
  if (sub?.status === "trialing" || eind.getTime() <= pe || (pe && amsDag(eind) === amsDag(new Date(pe)))) return { periodeEinde: true, eind: new Date(pe) };
  return { periodeEinde: false, eind };
}
// deno-lint-ignore no-explicit-any
function samenvatting(sub: any) {
  const item = sub?.items?.data?.[0] || {};
  const periodeEinde = item.current_period_end || sub?.current_period_end || null; // nieuwe en oude API-versie
  const stoptOp = sub?.cancel_at || (sub?.cancel_at_period_end ? periodeEinde : null);
  const actief = ["active", "trialing", "past_due"].includes(sub?.status);
  const herroepTot = sub?.start_date ? eindeBedenktijd(new Date(sub.start_date * 1000)).getTime() : null;
  return {
    stripe_status: sub?.status || null,
    prijs_cents: item.price?.unit_amount ?? null,
    interval: item.price?.recurring?.interval || "month",
    volgende_betaling: actief && periodeEinde && (!stoptOp || periodeEinde < stoptOp) ? new Date(periodeEinde * 1000).toISOString() : null,
    stopt_op: stoptOp ? new Date(stoptOp * 1000).toISOString() : null,
    herroepbaar_tot: actief && herroepTot && Date.now() < herroepTot ? new Date(herroepTot).toISOString() : null,
    opzeg_einde: actief && !stoptOp ? opzegPlan(sub).eind.toISOString() : null,
    actief,
  };
}

// Laatste geslaagde betaling van deze klant (via de charges-lijst: die is stabiel over
// API-versies heen), met wat er nog terug te betalen valt.
async function laatsteBetaling(customerId: string | null) {
  if (!customerId) return null;
  const lijst = await stripe("charges?customer=" + encodeURIComponent(customerId) + "&limit=10");
  // deno-lint-ignore no-explicit-any
  const ch = (lijst?.data || []).find((c: any) => c.status === "succeeded" && c.amount > c.amount_refunded);
  if (!ch) return null;
  return { charge_id: ch.id as string, bedrag_cents: ch.amount as number, terugbetaald_cents: ch.amount_refunded as number, nog_cents: (ch.amount - ch.amount_refunded) as number, datum: new Date(ch.created * 1000).toISOString(), valuta: ch.currency as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Alleen POST" });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: wie } = jwt ? await db.auth.getUser(jwt) : { data: null };
  const uid = wie?.user?.id;
  if (!uid) return json(401, { error: "Log opnieuw in." });

  // Wie vraagt dit? Alleen eigenaar en beheerder mogen ingrijpen in abonnementen.
  const { data: ik } = await db.from("profiles").select("id,role,company_id,first_name,last_name").eq("id", uid).maybeSingle();
  if (!ik || !["eigenaar", "platform_admin"].includes(ik.role)) return json(403, { error: "Alleen de eigenaar of beheerder kan abonnementen beheren." });
  const ikNaam = [ik.first_name, ik.last_name].filter(Boolean).join(" ") || wie?.user?.email || "een beheerder";

  let body: { actie?: string; order_id?: string; reden?: string; bedrag_cents?: number } = {};
  try { body = await req.json(); } catch { /* leeg */ }
  if (!body.order_id) return json(400, { error: "Geen bestelling opgegeven." });

  const { data: o, error: oErr } = await db.from("shop_orders")
    .select("id,company_id,blog_program_id,status,email,profile_id,stripe_subscription_id,stripe_customer_id,cancel_at,cancel_requested_at,withdrawn_at,created_at")
    .eq("id", body.order_id).maybeSingle();
  if (oErr) return json(502, { error: "De bestelling kan nu niet geladen worden." });
  if (!o) return json(404, { error: "Bestelling niet gevonden." });
  if (ik.role !== "platform_admin" && o.company_id !== ik.company_id) return json(403, { error: "Deze bestelling hoort bij een ander bedrijf." });

  const { data: p } = o.blog_program_id ? await db.from("blog_programs").select("name").eq("id", o.blog_program_id).maybeSingle() : { data: null };
  const programma = p?.name || "het programma";
  const { data: lid } = o.profile_id ? await db.from("profiles").select("first_name,last_name,email").eq("id", o.profile_id).maybeSingle() : { data: null };
  const lidNaam = [lid?.first_name, lid?.last_name].filter(Boolean).join(" ") || o.email || "de klant";
  // Bevestigingen gaan naar het inlogadres van het lid, anders naar het adres van de bestelling.
  let naar: string | null = o.email || null;
  if (o.profile_id) { try { const { data: u } = await db.auth.admin.getUserById(o.profile_id); if (u?.user?.email) naar = u.user.email; } catch { /* dan het besteladres */ } }
  const nlDatum = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }) : "";
  const euro = (c: number) => "€" + (c / 100).toFixed(2).replace(".", ",");

  const plantMail = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!naar) return false;
    const { error } = await db.from("mail_queue").insert({ company_id: o.company_id, recipient_email: naar, event: "opzegging", payload: { order_id: o.id, ...payload } });
    if (error) { console.error("bevestigingsmail niet ingepland:", error.message); return false; }
    return true;
  };
  const meld = async (onderwerp: string, bericht: string, context: Record<string, unknown>) => {
    const { error } = await db.from("app_meldingen").insert({ company_id: o.company_id, profile_id: uid, soort: "vraag", pagina: "winkel", onderwerp, bericht, context });
    if (error) console.error("melding mislukt:", error.message, onderwerp, JSON.stringify(context));
  };
  const zetOrder = async (patch: Record<string, unknown>): Promise<boolean> => {
    for (let i = 0; i < 2; i++) {
      const { error } = await db.from("shop_orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", o.id);
      if (!error) return true;
      console.error("bestelling bijwerken mislukt:", error.message);
    }
    return false;
  };

  // Terugbetalen kan ook als het abonnement al gestopt is (daarna nog iets rechtzetten).
  if (body.actie === "terugbetalen") {
    const bedrag = Math.round(Number(body.bedrag_cents || 0));
    if (!(bedrag > 0)) return json(400, { error: "Geef een bedrag op." });
    let bet;
    try { bet = await laatsteBetaling(o.stripe_customer_id); } catch (e) { console.error((e as Error).message); return json(502, { error: "Stripe reageert niet. Probeer het zo opnieuw." }); }
    if (!bet) return json(400, { error: "Er is geen geslaagde betaling (meer) om terug te betalen." });
    if (bedrag > bet.nog_cents) return json(400, { error: "Maximaal " + euro(bet.nog_cents) + " kan nog terugbetaald worden op de laatste betaling." });
    const vorm = new URLSearchParams();
    vorm.set("charge", bet.charge_id);
    vorm.set("amount", String(bedrag));
    vorm.set("reason", "requested_by_customer");
    vorm.set("metadata[order_id]", o.id);
    vorm.set("metadata[door]", ikNaam);
    let refund;
    try { refund = await stripe("refunds", "POST", vorm); }
    catch (e) { console.error("terugbetalen mislukt:", (e as Error).message); return json(502, { error: "Terugbetalen lukt nu niet: " + (e as Error).message.replace(/^Stripe: /, "") }); }
    await meld("Winkel: terugbetaling " + euro(bedrag) + " aan " + lidNaam,
      ikNaam + " heeft " + euro(bedrag) + " terugbetaald aan " + lidNaam + " (" + programma + ") op de betaling van " + nlDatum(bet.datum) + ". Stripe-terugbetaling " + refund.id + ".",
      { order_id: o.id, refund_id: refund.id, bedrag_cents: bedrag, door: uid });
    return json(200, { ok: true, refund_id: refund.id, bedrag_cents: bedrag, nog_cents: bet.nog_cents - bedrag });
  }

  if (!o.stripe_subscription_id) return json(400, { error: "Bij deze bestelling hoort geen Stripe-abonnement." });
  // deno-lint-ignore no-explicit-any
  let sub: any;
  try { sub = await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id)); }
  catch (_e) { return json(502, { error: "Stripe reageert niet. Probeer het zo opnieuw." }); }
  const actief = ["active", "trialing", "past_due"].includes(sub.status);

  if (body.actie === "info") {
    let bet = null;
    try { bet = await laatsteBetaling(o.stripe_customer_id); } catch { /* dan zonder */ }
    return json(200, { ok: true, programma: p?.name || null, lid: lidNaam, email: naar, laatste_betaling: bet, ...samenvatting(sub) });
  }

  if (body.actie === "opzeggen") {
    if (!actief) return json(400, { error: "Dit abonnement is al gestopt." });
    if (sub.cancel_at || sub.cancel_at_period_end) return json(200, { ok: true, al: true, ...samenvatting(sub) });
    const reden = String(body.reden || "").trim().slice(0, 450);
    const plan = opzegPlan(sub);
    const vorm = new URLSearchParams();
    if (plan.periodeEinde) vorm.set("cancel_at_period_end", "true");
    else { vorm.set("cancel_at", String(Math.floor(plan.eind.getTime() / 1000))); vorm.set("proration_behavior", "create_prorations"); }
    vorm.set("metadata[opgezegd_via]", "dashboard");
    vorm.set("metadata[opgezegd_door]", ikNaam);
    if (reden) vorm.set("cancellation_details[comment]", reden);
    let nieuw;
    try { nieuw = await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id), "POST", vorm); }
    catch (e) { console.error("opzeggen mislukt:", (e as Error).message); return json(502, { error: "Opzeggen lukt nu niet. Probeer het zo opnieuw." }); }
    const info = samenvatting(nieuw);
    const dbOk = await zetOrder({ cancel_at: info.stopt_op, cancel_requested_at: new Date().toISOString() });
    const mailOk = await plantMail({ soort: "opgezegd", stopt_op: info.stopt_op, laatste_betaling: info.volgende_betaling, herroepbaar_tot: info.herroepbaar_tot, db_ok: dbOk, door: "dashboard" });
    return json(200, { ok: true, mail: mailOk, ...info });
  }

  if (body.actie === "intrekken") {
    if (!actief) return json(400, { error: "Dit abonnement is al gestopt." });
    if (!sub.cancel_at && !sub.cancel_at_period_end) return json(200, { ok: true, ...samenvatting(sub) });
    const itemI = sub.items?.data?.[0] || {};
    const peI = itemI.current_period_end || sub.current_period_end || 0;
    const inhaal = !sub.cancel_at_period_end && !!sub.cancel_at && !!peI && sub.cancel_at <= peI;
    const vorm = new URLSearchParams();
    if (sub.cancel_at_period_end) vorm.set("cancel_at_period_end", "false");
    else vorm.set("cancel_at", "");
    vorm.set("metadata[opgezegd_via]", "");
    vorm.set("metadata[opgezegd_door]", "");
    let nieuw;
    try { nieuw = await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id), "POST", vorm); }
    catch (e) { console.error("intrekken mislukt:", (e as Error).message); return json(502, { error: "Dat lukt nu niet. Probeer het zo opnieuw." }); }
    await zetOrder({ cancel_at: null, cancel_requested_at: null });
    const mailOk = await plantMail({ soort: "ingetrokken", inhaal, door: "dashboard" });
    return json(200, { ok: true, mail: mailOk, inhaal, ...samenvatting(nieuw) });
  }

  if (body.actie === "stoppen") {
    if (!actief) return json(400, { error: "Dit abonnement is al gestopt." });
    try { await stripe("subscriptions/" + encodeURIComponent(o.stripe_subscription_id), "DELETE"); }
    catch (e) { console.error("stoppen mislukt:", (e as Error).message); return json(502, { error: "Stoppen lukt nu niet. Probeer het zo opnieuw." }); }
    const nu = new Date().toISOString();
    await zetOrder({ cancel_at: nu, cancel_requested_at: nu });
    const mailOk = await plantMail({ soort: "opgezegd", stopt_op: nu, laatste_betaling: null, herroepbaar_tot: null, db_ok: true, door: "dashboard" });
    await meld("Winkel: abonnement " + programma + " van " + lidNaam + " direct gestopt",
      ikNaam + " heeft het abonnement van " + lidNaam + " op " + programma + " per direct beëindigd via het dashboard. Terugbetalen, als dat is afgesproken, gaat apart via Terugbetalen in Blog > Klanten.",
      { order_id: o.id, door: uid });
    return json(200, { ok: true, gestopt: true, mail: mailOk });
  }

  return json(400, { error: "Onbekende actie" });
});
