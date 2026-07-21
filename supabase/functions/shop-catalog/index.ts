// Winkel-catalogus: de blogprogramma's die te koop staan (for_sale).
// Openbaar leesbaar; alleen naam/omschrijving/prijs, nooit meer dan dat.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.from("blog_programs")
    .select("id,name,description,price_cents,price_interval")
    .eq("for_sale", true)
    .order("name");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(data ?? []), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
