// Winkel-afrekenen: maakt een Stripe Checkout-sessie (abonnement) voor een
// blogprogramma en geeft de betaal-URL terug. De klant rekent af op de
// beveiligde pagina van Stripe; kaartgegevens komen nooit bij ons.
// Voorwaarden: de koper moet op onze eigen pagina het vinkje "ik ga akkoord" zetten
// (`akkoord: true` + `voorwaarden_versie`); zonder dat vinkje start er geen betaling.
// Het moment van akkoord staat in shop_orders.terms_accepted_at.
// Terugkeeradres: na betalen gaat de koper naar de bedankpagina op de etalage
// (programmering.yourprogram.nl/bedankt) met het sessienummer en een eigen geheime sleutel
// (thanks_token), zodat hij daar direct zijn wachtwoord kan kiezen (shop-bedankt). Afbreken =
// terug naar de site waar hij vandaan kwam. Alleen vaste, bekende adressen zijn toegestaan.
// Betaalmethoden (iDEAL, kaart, SEPA-incasso, Bancontact) stel je in het Stripe-dashboard in.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const DASHBOARD = "https://app.yourprogram.nl";
const DASHBOARD_OUD = "https://coachapp-steel.vercel.app";
const ETALAGE = "https://programmering.yourprogram.nl";
const ETALAGE_VERCEL = "https://yp-programmering.vercel.app";
const VOORWAARDEN_VERSIE = "2026-09";
// Alleen programma's van deze bedrijven staan in de winkel en worden via ons Stripe-account
// verkocht. Iedereen kan zelf een omgeving starten; die programma's horen hier niet.
const WINKEL_BEDRIJVEN = (Deno.env.get("SHOP_COMPANY_IDS") || "d927c766-832c-4b8e-8001-4d416b9a35bc")
  .split(",").map((x) => x.trim()).filter(Boolean);
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Geen jokertekens: een los *.vercel.app-adres kan iedereen registreren, en naar dat adres
// zou dan de sleutel van de bedankpagina gaan. localhost alleen voor lokaal testen.
function siteVan(s: string | undefined): string | null {
  if (!s) return null;
  try {
    const u = new URL(s);
    if ([DASHBOARD, DASHBOARD_OUD, ETALAGE, ETALAGE_VERCEL].includes(u.origin)) return u.origin;
    if (u.protocol === "http:" && u.hostname === "localhost") return u.origin;
    return null;
  } catch (_e) { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);
  const sleutel = Deno.env.get("STRIPE_SECRET_KEY");
  if (!sleutel) return json({ error: "Betalen is nog niet ingesteld (STRIPE_SECRET_KEY ontbreekt)." }, 500);

  let body: { program_id?: string; site?: string; akkoord?: boolean; voorwaarden_versie?: string } = {};
  try { body = await req.json(); } catch (_e) { /* leeg */ }
  if (!body.program_id) return json({ error: "program_id ontbreekt" }, 400);
  if (body.akkoord !== true) return json({ error: "Ga eerst akkoord met de voorwaarden." }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: p } = await db.from("blog_programs")
    .select("id,name,company_id,price_cents,price_interval,for_sale")
    .eq("id", body.program_id).maybeSingle();
  if (!p || !p.for_sale || !p.price_cents || p.price_cents < 100 || !WINKEL_BEDRIJVEN.includes(p.company_id)) {
    return json({ error: "Dit programma is niet (meer) te koop." }, 400);
  }

  const site = siteVan(body.site) || DASHBOARD;
  const dashboardSite = site === DASHBOARD || site === DASHBOARD_OUD;
  const bedanktSite = dashboardSite ? ETALAGE : site;
  const token = crypto.randomUUID();
  const gelukt = bedanktSite + "/bedankt?besteld=1&session_id={CHECKOUT_SESSION_ID}&t=" + token;
  const afgebroken = dashboardSite ? site + "/winkel.html?geannuleerd=1" : site + "/bedankt?geannuleerd=1";
  const versie = String(body.voorwaarden_versie || VOORWAARDEN_VERSIE).slice(0, 20);

  const vorm = new URLSearchParams();
  vorm.set("mode", "subscription");
  vorm.set("locale", "nl");
  vorm.set("line_items[0][quantity]", "1");
  vorm.set("line_items[0][price_data][currency]", "eur");
  vorm.set("line_items[0][price_data][unit_amount]", String(p.price_cents));
  vorm.set("line_items[0][price_data][recurring][interval]", p.price_interval || "month");
  vorm.set("line_items[0][price_data][product_data][name]", p.name);
  vorm.set("success_url", gelukt);
  vorm.set("cancel_url", afgebroken);
  vorm.set("metadata[program_id]", p.id);
  vorm.set("metadata[voorwaarden_versie]", versie);
  vorm.set("subscription_data[metadata][program_id]", p.id);
  vorm.set("subscription_data[metadata][voorwaarden_versie]", versie);

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + sleutel, "Content-Type": "application/x-www-form-urlencoded" },
    body: vorm,
  });
  const sessie = await r.json();
  if (!r.ok || !sessie.url) {
    console.error("Stripe checkout mislukt:", JSON.stringify(sessie).slice(0, 500));
    return json({ error: "Afrekenen kon niet gestart worden. Probeer het later opnieuw." }, 502);
  }

  // Zonder vastgelegde bestelling (en dus zonder bewijs van akkoord) niet naar Stripe.
  const { error: insErr } = await db.from("shop_orders").insert({
    company_id: p.company_id, blog_program_id: p.id,
    status: "pending", stripe_session_id: sessie.id, thanks_token: token,
    terms_accepted_at: new Date().toISOString(), terms_version: versie,
  });
  if (insErr) {
    console.error("bestelling vastleggen mislukt:", insErr.message);
    await fetch("https://api.stripe.com/v1/checkout/sessions/" + sessie.id + "/expire", {
      method: "POST", headers: { Authorization: "Bearer " + sleutel },
    }).catch(() => {});
    return json({ error: "Afrekenen kon niet gestart worden. Probeer het later opnieuw." }, 500);
  }

  return json({ url: sessie.url });
});
