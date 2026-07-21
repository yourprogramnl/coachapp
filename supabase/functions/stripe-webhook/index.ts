// Stripe-webhook: verwerkt betaal-gebeurtenissen.
// - checkout.session.completed: bestelling op betaald + automatisch een
//   uitnodiging aanmaken (de bestaande invite-mail-trigger stuurt de klant
//   dan direct de account-link).
// - customer.subscription.deleted: lid in het archief via shop_afsluiten
//   (data blijft bewaard, app op slot).
// Eigen beveiliging: de Stripe-handtekening (STRIPE_WEBHOOK_SECRET) wordt
// gecontroleerd; zonder geldige handtekening doen we niets.
import { createClient } from "npm:@supabase/supabase-js@2";

async function handtekeningKlopt(body: string, kop: string | null, geheim: string): Promise<boolean> {
  if (!kop) return false;
  const delen = Object.fromEntries(kop.split(",").map((s) => s.split("=") as [string, string]));
  const t = delen["t"], v1 = delen["v1"];
  if (!t || !v1) return false;
  // Niet ouder dan 5 minuten (replay-bescherming)
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const sleutel = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(geheim), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", sleutel, new TextEncoder().encode(t + "." + body));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
}

Deno.serve(async (req) => {
  const geheim = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!geheim) return new Response("webhook-geheim ontbreekt", { status: 500 });
  const body = await req.text();
  if (!(await handtekeningKlopt(body, req.headers.get("Stripe-Signature"), geheim))) {
    return new Response("ongeldige handtekening", { status: 400 });
  }

  const event = JSON.parse(body);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const email = s.customer_details?.email || null;
    const naam = (s.customer_details?.name || "").trim();
    const programId = s.metadata?.program_id || null;

    const { data: order } = await db.from("shop_orders")
      .update({
        status: "paid", email,
        stripe_customer_id: s.customer || null,
        stripe_subscription_id: s.subscription || null,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_session_id", s.id).select().single();

    if (email && programId) {
      const { data: p } = await db.from("blog_programs")
        .select("id,name,company_id,created_by").eq("id", programId).single();
      if (p) {
        // Coach voor de uitnodiging: de maker van het blog, anders de eigenaar.
        let coachId = p.created_by;
        if (!coachId) {
          const { data: eig } = await db.from("profiles").select("id")
            .eq("company_id", p.company_id).eq("role", "eigenaar").limit(1);
          coachId = eig && eig[0] ? eig[0].id : null;
        }
        const delen = naam.split(/\s+/);
        const { data: inv } = await db.from("invites").insert({
          company_id: p.company_id, coach_id: coachId, email,
          first_name: delen[0] || null, last_name: delen.slice(1).join(" ") || null,
          role: "lid", membership_type: "free_blog", blog_program_id: p.id,
          expires_at: new Date(Date.now() + 14 * 864e5).toISOString(),
          created_by: coachId,
        }).select().single();
        if (inv && order) {
          await db.from("shop_orders").update({ invite_id: inv.id }).eq("id", order.id);
        }
      }
    }
  } else if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    await db.rpc("shop_afsluiten", { p_subscription_id: sub.id });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
