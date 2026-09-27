// Stripe-webhook: verwerkt betaal-gebeurtenissen.
// - checkout.session.completed: bestelling vervullen (zie vervul hieronder):
//   account direct aanmaken (of bestaand account koppelen), lid van het programma
//   maken en een uitnodiging klaarzetten; de mail-trigger stuurt de klant de
//   "kies je wachtwoord"-mail als reserve. Op de bedankpagina kan de klant het
//   wachtwoord meteen kiezen (shop-bedankt); die functie vervult óók als de
//   webhook nog niet geweest is. Wie het eerst komt, wint (status 'processing').
// - customer.subscription.deleted: lid in het archief via shop_afsluiten
//   (data blijft bewaard, app op slot).
// Eigen beveiliging: de Stripe-handtekening (STRIPE_WEBHOOK_SECRET) wordt
// gecontroleerd; zonder geldige handtekening doen we niets.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

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

// ---- vervul begin (zelfde code staat in shop-bedankt; wijzig ze samen) ----
type Sessie = { id: string; customer_details?: { email?: string; name?: string }; customer?: string; subscription?: string; metadata?: Record<string, string> };

// Vervult één betaalde bestelling. Idempotent: claimt de bestelling eerst
// (pending -> processing); een tweede aanroep doet niets meer.
async function vervul(db: SupabaseClient, orderId: string, s: Sessie): Promise<void> {
  const nu = new Date().toISOString();
  const { data: claim } = await db.from("shop_orders")
    .update({ status: "processing", updated_at: nu })
    .eq("id", orderId).eq("status", "pending").select().maybeSingle();
  if (!claim) return; // al (bijna) vervuld door de andere kant

  const email = (s.customer_details?.email || "").trim().toLowerCase() || null;
  const naam = (s.customer_details?.name || "").trim();
  const programId = s.metadata?.program_id || claim.blog_program_id || null;
  const basis: Record<string, unknown> = {
    email, stripe_customer_id: s.customer || null, stripe_subscription_id: s.subscription || null, updated_at: nu,
  };
  try {
    const { data: p } = programId
      ? await db.from("blog_programs").select("id,name,company_id,created_by").eq("id", programId).single()
      : { data: null };
    if (!email || !p) { // niets te koppelen: alleen op betaald zetten
      await db.from("shop_orders").update({ ...basis, status: "paid" }).eq("id", orderId);
      return;
    }
    // Coach voor de koppeling: de maker van het blog, anders de eigenaar.
    let coachId = p.created_by;
    if (!coachId) {
      const { data: eig } = await db.from("profiles").select("id")
        .eq("company_id", p.company_id).eq("role", "eigenaar").limit(1);
      coachId = eig && eig[0] ? eig[0].id : null;
    }
    const delen = naam.split(/\s+/).filter(Boolean);
    const voornaam = delen[0] || null, achternaam = delen.slice(1).join(" ") || null;

    const { data: bestaandId } = await db.rpc("shop_user_id_by_email", { p_email: email });
    let profileId: string = bestaandId as string;
    let state: "nieuw" | "bestaand" = "bestaand";
    let inviteId: string | null = null;

    if (!profileId) {
      // Nieuw account met een wachtwoord dat niemand kent; de koper kiest zijn
      // echte wachtwoord op de bedankpagina of via de maillink.
      const { data: created, error: mkErr } = await db.auth.admin.createUser({
        email, email_confirm: true, password: crypto.randomUUID() + "Aa1!",
      });
      if (mkErr || !created?.user) throw new Error("account aanmaken: " + (mkErr?.message || "onbekend"));
      profileId = created.user.id;
      state = "nieuw";
      const { error: profErr } = await db.from("profiles").update({
        company_id: p.company_id, coach_id: coachId, role: "lid", membership_type: "free_blog",
        blog_program_id: p.id, first_name: voornaam, last_name: achternaam,
      }).eq("id", profileId);
      if (profErr) throw new Error("profiel koppelen: " + profErr.message);
      const { data: inv, error: invErr } = await db.from("invites").insert({
        company_id: p.company_id, coach_id: coachId, email,
        first_name: voornaam, last_name: achternaam,
        role: "lid", membership_type: "free_blog", blog_program_id: p.id, profile_id: profileId,
        expires_at: new Date(Date.now() + 14 * 864e5).toISOString(), created_by: coachId,
      }).select("id").single();
      if (invErr) console.error("uitnodiging klaarzetten mislukt:", invErr.message);
      inviteId = inv?.id || null;
    } else {
      // Bestaand account: programma erbij, uit het archief halen, en een los
      // account zonder bedrijf (nooit gekoppeld) alsnog aan dit bedrijf hangen.
      const { data: prof } = await db.from("profiles").select("id,company_id,role,blog_program_id,archived").eq("id", profileId).maybeSingle();
      const patch: Record<string, unknown> = { archived: false };
      if (prof && !prof.company_id) {
        Object.assign(patch, { company_id: p.company_id, coach_id: coachId, role: "lid", membership_type: "free_blog", first_name: voornaam, last_name: achternaam });
      }
      if (prof && !prof.blog_program_id && (!prof.company_id || prof.company_id === p.company_id)) patch.blog_program_id = p.id;
      await db.from("profiles").update(patch).eq("id", profileId);
    }
    await db.from("blog_program_members")
      .upsert({ company_id: p.company_id, blog_program_id: p.id, athlete_id: profileId }, { onConflict: "blog_program_id,athlete_id", ignoreDuplicates: true });

    await db.from("shop_orders").update({
      ...basis, status: "paid", profile_id: profileId, account_state: state, invite_id: inviteId,
    }).eq("id", orderId);
  } catch (e) {
    console.error("vervullen mislukt voor bestelling " + orderId + ":", (e as Error).message);
    // Terug naar pending zodat de andere kant (webhook/bedankpagina) het opnieuw kan proberen.
    await db.from("shop_orders").update({ ...basis, status: "pending" }).eq("id", orderId);
  }
}
// ---- vervul einde ----

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
    const s = event.data.object as Sessie & { payment_status?: string };
    if (s.payment_status && s.payment_status !== "paid") {
      return new Response(JSON.stringify({ received: true, wacht: "nog niet betaald" }), { headers: { "Content-Type": "application/json" } });
    }
    let { data: order } = await db.from("shop_orders").select("id,status").eq("stripe_session_id", s.id).maybeSingle();
    if (!order) {
      // Sessie niet via shop-checkout aangemaakt: alsnog een bestelling aanleggen.
      const programId = s.metadata?.program_id || null;
      const { data: p } = programId ? await db.from("blog_programs").select("company_id").eq("id", programId).maybeSingle() : { data: null };
      const { data: nieuw } = await db.from("shop_orders").insert({
        company_id: p?.company_id || null, blog_program_id: programId, status: "pending", stripe_session_id: s.id,
      }).select("id,status").single();
      order = nieuw;
    }
    if (order && order.status === "pending") await vervul(db, order.id, s);
    else if (order) {
      // Al vervuld door de bedankpagina: alleen de Stripe-nummers aanvullen.
      await db.from("shop_orders").update({
        stripe_customer_id: s.customer || null, stripe_subscription_id: s.subscription || null, updated_at: new Date().toISOString(),
      }).eq("id", order.id).is("stripe_subscription_id", null);
    }
  } else if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    await db.rpc("shop_afsluiten", { p_subscription_id: sub.id });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
