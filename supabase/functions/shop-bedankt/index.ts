// shop-bedankt: de bedankpagina na een betaling (programmering.yourprogram.nl/bedankt).
// De koper komt terug van Stripe met het sessienummer (session_id=cs_…). Dat nummer
// kent alleen zijn eigen browser en werkt hier als sleutel:
//  actie "status":     controleert bij Stripe dat de sessie betaald is, vervult de
//                      bestelling als de webhook nog niet geweest is, en zegt of er een
//                      nieuw account is (wachtwoord kiezen) of dat de koper al een
//                      account had (gewoon inloggen).
//  actie "wachtwoord": zet het gekozen wachtwoord op het nieuwe account en markeert
//                      de uitnodiging als gebruikt. Kan maar één keer.
// verify_jwt staat uit: de koper is op dit moment nog niet ingelogd.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const TESTFLIGHT_URL = Deno.env.get("TESTFLIGHT_URL") || "https://testflight.apple.com/join/JqqZHVDp";
const APP_STORE_URL = Deno.env.get("APP_STORE_URL") || "";

// Zelfde wachtwoord-eis als op de inlogpagina (auth.js): 8+ tekens, letter, cijfer.
function pwProbleem(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < 8) return "Het wachtwoord moet minimaal 8 tekens lang zijn.";
  if (!/[a-zA-Z]/.test(pw)) return "Het wachtwoord moet minstens één letter bevatten.";
  if (!/[0-9]/.test(pw)) return "Het wachtwoord moet minstens één cijfer bevatten.";
  return "";
}

// ---- vervul begin (zelfde code staat in stripe-webhook; wijzig ze samen) ----
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

async function stripeSessie(id: string): Promise<(Sessie & { payment_status?: string; status?: string }) | null> {
  const sleutel = Deno.env.get("STRIPE_SECRET_KEY");
  if (!sleutel) return null;
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(id), {
    headers: { Authorization: "Bearer " + sleutel },
  });
  if (!r.ok) return null;
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Alleen POST" });
  let body: { actie?: string; session_id?: string; wachtwoord?: string } = {};
  try { body = await req.json(); } catch { return json(400, { error: "Geen geldige aanvraag" }); }
  const sid = String(body.session_id || "");
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,}$/.test(sid)) return json(400, { error: "Ongeldig sessienummer" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const s = await stripeSessie(sid);
  if (!s) return json(404, { error: "Deze betaling is niet gevonden." });
  if (s.payment_status !== "paid") return json(200, { status: "open" });

  let { data: order } = await db.from("shop_orders")
    .select("id,status,email,account_state,profile_id,invite_id,blog_program_id")
    .eq("stripe_session_id", sid).maybeSingle();
  if (!order) return json(200, { status: "onbekend" });

  if (body.actie === "status") {
    if (order.status === "pending") {
      await vervul(db, order.id, s);
      order = (await db.from("shop_orders").select("id,status,email,account_state,profile_id,invite_id,blog_program_id").eq("id", order.id).single()).data || order;
    }
    const { data: p } = order.blog_program_id
      ? await db.from("blog_programs").select("name").eq("id", order.blog_program_id).maybeSingle() : { data: null };
    let account: "nieuw" | "bestaand" | "klaar" | null = order.account_state as "nieuw" | "bestaand" | null;
    if (account === "nieuw" && order.invite_id) {
      const { data: inv } = await db.from("invites").select("accepted_at").eq("id", order.invite_id).maybeSingle();
      if (inv?.accepted_at) account = "klaar";
    }
    return json(200, {
      status: order.status, email: order.email, programma: p?.name || null, account,
      app_url: APP_STORE_URL || TESTFLIGHT_URL, app_is_testflight: !APP_STORE_URL,
    });
  }

  if (body.actie === "wachtwoord") {
    if (order.status !== "paid" || order.account_state !== "nieuw" || !order.profile_id || !order.invite_id) {
      return json(400, { error: "Voor deze bestelling kun je hier geen wachtwoord kiezen. Log in met je bestaande wachtwoord of gebruik de link in je mail." });
    }
    const fout = pwProbleem(body.wachtwoord);
    if (fout) return json(400, { error: fout });
    const { data: inv } = await db.from("invites").select("id,accepted_at").eq("id", order.invite_id).maybeSingle();
    if (!inv) return json(400, { error: "Deze bestelling is niet meer te koppelen. Gebruik de link in je mail." });
    if (inv.accepted_at) return json(400, { error: "Je wachtwoord is al ingesteld. Log in met dat wachtwoord, of kies 'Wachtwoord vergeten' in de app." });
    const { error: upErr } = await db.auth.admin.updateUserById(order.profile_id, { password: body.wachtwoord });
    if (upErr) return json(400, { error: upErr.message || "Wachtwoord instellen mislukt" });
    await db.from("invites").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
    return json(200, { ok: true, email: order.email, app_url: APP_STORE_URL || TESTFLIGHT_URL, app_is_testflight: !APP_STORE_URL });
  }

  return json(400, { error: "Onbekende actie" });
});
