// Winkel-afrekenen: maakt een Stripe Checkout-sessie (abonnement) voor een
// blogprogramma en geeft de betaal-URL terug. De klant rekent af op de
// beveiligde pagina van Stripe; kaartgegevens komen nooit bij ons.
// Terugkeeradres: de etalage (programmering.yourprogram.nl) stuurt haar eigen adres mee als
// `site` en krijgt /bedankt; het dashboard (app.yourprogram.nl) houdt winkel.html. Alleen
// bekende adressen zijn toegestaan.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const DASHBOARD = "https://app.yourprogram.nl";
const DASHBOARD_OUD = "https://coachapp-steel.vercel.app";
const ETALAGE = "https://programmering.yourprogram.nl";
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

function siteOk(s: string): boolean {
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return false;
    return [DASHBOARD, DASHBOARD_OUD, ETALAGE].includes(u.origin) ||
      /^yp-programmering(-[a-z0-9-]+)?\.vercel\.app$/.test(u.hostname) ||
      /^yp-programmering-[a-z0-9-]+-yourprogramnl1\.vercel\.app$/.test(u.hostname) ||
      u.hostname === "localhost";
  } catch (_e) { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);
  const sleutel = Deno.env.get("STRIPE_SECRET_KEY");
  if (!sleutel) return json({ error: "Betalen is nog niet ingesteld (STRIPE_SECRET_KEY ontbreekt)." }, 500);

  let body: { program_id?: string; site?: string } = {};
  try { body = await req.json(); } catch (_e) { /* leeg */ }
  if (!body.program_id) return json({ error: "program_id ontbreekt" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: p } = await db.from("blog_programs")
    .select("id,name,company_id,price_cents,price_interval,for_sale")
    .eq("id", body.program_id).single();
  if (!p || !p.for_sale || !p.price_cents || p.price_cents < 100) {
    return json({ error: "Dit programma is niet (meer) te koop." }, 400);
  }

  const site = body.site && siteOk(body.site) ? new URL(body.site).origin : DASHBOARD;
  const dashboardSite = site === DASHBOARD || site === DASHBOARD_OUD;
  const gelukt = dashboardSite ? site + "/winkel.html?besteld=1" : site + "/bedankt?besteld=1";
  const afgebroken = dashboardSite ? site + "/winkel.html?geannuleerd=1" : site + "/bedankt?geannuleerd=1";

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
  vorm.set("subscription_data[metadata][program_id]", p.id);

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

  await db.from("shop_orders").insert({
    company_id: p.company_id, blog_program_id: p.id,
    status: "pending", stripe_session_id: sessie.id,
  });

  return json({ url: sessie.url });
});
