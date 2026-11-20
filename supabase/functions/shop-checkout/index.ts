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
// Overstaplink (20 nov 2026): een lid dat al ergens anders betaalt (Strivee) krijgt een
// persoonlijke link met een geheime sleutel (tabel shop_overstap). Daarmee rekent hij nu af,
// maar de eerste afschrijving volgt pas op de dag dat zijn oude abonnement zou verlengen
// (Stripe: trial_end). Met "info: true" komen alleen de gegevens voor het venster op de etalage terug.
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

// ---- eerste afschrijving voor een overstapper (Nederlandse klok) ----
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
// Stripe eist dat de eerste afschrijving minstens 48 uur vooruit ligt; twee uur speling voor
// wie de afrekenpagina even open laat staan.
const MIN_UITSTEL_MS = 50 * 3600_000;
// De opgegeven dag om 09:00 Nederlandse tijd. Ligt die te dichtbij of al achter ons, dan
// dezelfde dag van de volgende maand (bestaat die niet, dan de laatste dag van die maand): het
// oude abonnement is dan net weer een maand verlengd, dus zo betaalt niemand dubbel.
export function eersteAfschrijving(dag: string, nu: Date): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dag || ""));
  if (!m) return null;
  let j = +m[1], mnd = +m[2];
  const d = +m[3];
  if (mnd < 1 || mnd > 12 || d < 1 || d > 31) return null;
  for (let i = 0; i < 36; i++) {
    const laatste = new Date(Date.UTC(j, mnd, 0)).getUTCDate();
    const t = amsNaarUtc(j, mnd, Math.min(d, laatste), 9, 0, 0);
    if (t.getTime() - nu.getTime() >= MIN_UITSTEL_MS) return t;
    mnd++;
    if (mnd > 12) { mnd = 1; j++; }
  }
  return null;
}

type Overstap = { id: string; company_id: string; blog_program_id: string; email: string | null; eerste_afschrijving: string; geldig_tot: string };
// Zoekt de overstaplink bij een sleutel. Geeft de rij, of een tekst waarom hij niet (meer) werkt.
// deno-lint-ignore no-explicit-any
async function overstapVan(db: any, sleutel: string): Promise<{ rij?: Overstap; fout?: string; status?: number }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sleutel)) {
    return { fout: "Deze overstaplink klopt niet. Gebruik de link uit je mail.", status: 404 };
  }
  const { data: rij, error } = await db.from("shop_overstap")
    .select("id,company_id,blog_program_id,email,eerste_afschrijving,geldig_tot").eq("token", sleutel.toLowerCase()).maybeSingle();
  if (error) return { fout: "Er ging even iets mis aan onze kant. Probeer het zo opnieuw.", status: 502 };
  if (!rij) return { fout: "Deze overstaplink klopt niet. Gebruik de link uit je mail.", status: 404 };
  if (new Date(rij.geldig_tot).getTime() < Date.now()) {
    return { fout: "Deze overstaplink is verlopen. Je kunt gewoon via de site bestellen, of stuur ons een bericht.", status: 410 };
  }
  const { data: al, error: alErr } = await db.from("shop_orders").select("id").eq("overstap_id", rij.id).in("status", ["paid", "processing"]);
  if (alErr) return { fout: "Er ging even iets mis aan onze kant. Probeer het zo opnieuw.", status: 502 };
  if (al && al.length) {
    return { fout: "Deze overstaplink is al gebruikt: je abonnement bij ons loopt al. Log in in de app met het e-mailadres waarmee je afrekende.", status: 409 };
  }
  return { rij: rij as Overstap };
}

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

  let body: { program_id?: string; site?: string; akkoord?: boolean; voorwaarden_versie?: string; overstap?: string; info?: boolean } = {};
  try { body = await req.json(); } catch (_e) { /* leeg */ }
  const metOverstap = typeof body.overstap === "string" && body.overstap.length > 0;
  if (!body.program_id && !metOverstap) return json({ error: "program_id ontbreekt" }, 400);
  if (body.info === true && !metOverstap) return json({ error: "overstap ontbreekt" }, 400);
  if (body.akkoord !== true && body.info !== true) return json({ error: "Ga eerst akkoord met de voorwaarden." }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Overstaplink: het programma en de dag van de eerste afschrijving komen uit de link, niet uit
  // de aanvraag. Zo kan niemand zichzelf een latere betaaldag geven.
  let overstap: Overstap | null = null;
  if (metOverstap) {
    const gevonden = await overstapVan(db, String(body.overstap));
    if (!gevonden.rij) return json({ error: gevonden.fout }, gevonden.status || 400);
    overstap = gevonden.rij;
  }
  const programId = overstap ? overstap.blog_program_id : body.program_id;
  const { data: p } = await db.from("blog_programs")
    .select("id,name,company_id,price_cents,price_interval,for_sale")
    .eq("id", programId).maybeSingle();
  if (!p || !p.for_sale || !p.price_cents || p.price_cents < 100 || !WINKEL_BEDRIJVEN.includes(p.company_id) ||
      (p.price_interval || "month") !== "month") {
    return json({ error: "Dit programma is niet (meer) te koop." }, 400);
  }
  if (overstap && overstap.company_id !== p.company_id) return json({ error: "Deze overstaplink klopt niet. Gebruik de link uit je mail." }, 404);
  const eerste = overstap ? eersteAfschrijving(overstap.eerste_afschrijving, new Date()) : null;
  if (body.info === true) {
    return json({
      program_id: p.id, name: p.name, price_cents: p.price_cents, price_interval: p.price_interval || "month",
      eerste_betaling: eerste ? eerste.toISOString() : null,
    });
  }

  const site = siteVan(body.site) || DASHBOARD;
  const dashboardSite = site === DASHBOARD || site === DASHBOARD_OUD;
  const bedanktSite = dashboardSite ? ETALAGE : site;
  const token = crypto.randomUUID();
  const gelukt = bedanktSite + "/bedankt?besteld=1&session_id={CHECKOUT_SESSION_ID}&t=" + token + (eerste ? "&later=1" : "");
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
  if (overstap) {
    vorm.set("metadata[overstap_id]", overstap.id);
    vorm.set("subscription_data[metadata][overstap_id]", overstap.id);
    // Het adres uit de link staat vast op de afrekenpagina: zo komt het account op het adres
    // waarop het lid de mail kreeg.
    if (overstap.email) vorm.set("customer_email", overstap.email.trim().toLowerCase());
    // Nu niets afschrijven; de eerste afschrijving is op deze dag. Stripe legt bij het afrekenen
    // alleen de betaalmethode vast (met iDEAL: 0,01 euro die meteen wordt teruggestort).
    if (eerste) {
      vorm.set("subscription_data[trial_end]", String(Math.floor(eerste.getTime() / 1000)));
      // Stripe noemt dit op de afrekenpagina een proefperiode ("9 dagen gratis"). Deze regel
      // boven de knop zegt wat het voor de overstapper is (getest in de sandbox, 20 nov 2026).
      const dag = eerste.toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: TZ });
      vorm.set("custom_text[submit][message]", "Je stapt over naar onze eigen app. Tot " + dag + " betaal je bij ons niets, daarna gaat je abonnement gewoon door.");
    }
  }

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
    ...(overstap ? { overstap_id: overstap.id, eerste_betaling: eerste ? eerste.toISOString() : null } : {}),
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
