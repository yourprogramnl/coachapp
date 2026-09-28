// Winkel-catalogus voor de etalage (programmering.yourprogram.nl) en winkel.html.
// Openbaar leesbaar; alleen etalage-velden, nooit meer dan dat.
// Gratis programma's (prijs leeg of 0) met open aanmeldlink krijgen een join_url mee
// (naar het dashboard-adres, dat de aanmelding afhandelt); betaalde programma's gaan via shop-checkout.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const DASHBOARD = "https://app.yourprogram.nl";
// Alleen programma's van deze bedrijven staan in de winkel en worden via ons Stripe-account
// verkocht. Iedereen kan zelf een omgeving starten; die programma's horen hier niet.
const WINKEL_BEDRIJVEN = (Deno.env.get("SHOP_COMPANY_IDS") || "d927c766-832c-4b8e-8001-4d416b9a35bc")
  .split(",").map((x) => x.trim()).filter(Boolean);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.from("blog_programs")
    .select("id,slug,name,description,description_long,cover_url,level,days_per_week,sort,price_cents,price_interval,join_open,join_token")
    .eq("for_sale", true)
    .in("company_id", WINKEL_BEDRIJVEN)
    .eq("price_interval", "month") // de voorwaarden gaan uit van een maandabonnement
    .order("sort")
    .order("name");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const uit = (data ?? []).map((p) => {
    const free = !p.price_cents || p.price_cents < 100;
    return {
      id: p.id, slug: p.slug, name: p.name, description: p.description,
      description_long: p.description_long, cover_url: p.cover_url,
      level: p.level, days_per_week: p.days_per_week,
      price_cents: free ? 0 : p.price_cents, price_interval: p.price_interval || "month",
      free,
      join_url: free && p.join_open && p.join_token ? DASHBOARD + "/?blog=" + p.join_token : null,
    };
  });
  return new Response(JSON.stringify(uit), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
