// shop-bedankt: de bedankpagina na een betaling (programmering.yourprogram.nl/bedankt).
// De koper komt terug van Stripe met het sessienummer (session_id) én een eigen geheime
// sleutel (t) die alleen in die terugkeerlink staat, niet in de betaallink. Beide moeten
// kloppen. Daarna vragen we Stripe altijd zelf of er betaald is.
//  actie "status":     stand van de bestelling; levert zelf als de webhook nog niet geweest is.
//  actie "wachtwoord": zet het gekozen wachtwoord op een NIEUW account. Alleen binnen 48 uur
//                      na de bestelling, zolang de uitnodiging ongebruikt is en er nog nooit
//                      met het account is ingelogd. Daarna blijft de reservemail weg.
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
const WACHTWOORD_VENSTER_MS = 48 * 3600_000;
const app = () => ({ app_url: APP_STORE_URL || TESTFLIGHT_URL, app_is_testflight: !APP_STORE_URL });

// Zelfde wachtwoord-eis als op de inlogpagina (auth.js): 8+ tekens, letter, cijfer.
function pwProbleem(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < 8) return "Het wachtwoord moet minimaal 8 tekens lang zijn.";
  if (pw.length > 72) return "Het wachtwoord mag maximaal 72 tekens lang zijn.";
  if (!/[a-zA-Z]/.test(pw)) return "Het wachtwoord moet minstens één letter bevatten.";
  if (!/[0-9]/.test(pw)) return "Het wachtwoord moet minstens één cijfer bevatten.";
  return "";
}

// ---- vervul begin (gegenereerd: zelfde blok in stripe-webhook en shop-bedankt; wijzig ze samen) ----
type Sessie = {
  id: string;
  customer_details?: { email?: string | null; name?: string | null } | null;
  customer?: string | null;
  subscription?: string | null;
  metadata?: Record<string, string> | null;
  payment_status?: string;
  status?: string;
};
// Betaalstatussen van Stripe waarbij we het programma meteen leveren. no_payment_required =
// proefperiode of 100%-kortingscode. unpaid (SEPA-incasso) wacht op async_payment_succeeded.
const BETAALD = ["paid", "no_payment_required"];
const VASTGELOPEN_MS = 5 * 60_000; // een claim die zo lang op processing staat, is afgebroken

// Interne melding voor ons (komt in het dashboard en als mail). Zonder bekend profiel
// melden we namens de eerste beheerder, zodat de melding nooit stil verdwijnt.
async function meldIntern(db: SupabaseClient, companyId: string | null, profileId: string | null, onderwerp: string, bericht: string, context: Record<string, unknown>) {
  let melder = profileId;
  if (!melder) {
    const { data: a } = await db.from("profiles").select("id").eq("role", "platform_admin").order("created_at").limit(1);
    melder = a && a[0] ? a[0].id : null;
  }
  if (!melder) { console.error("interne melding zonder profiel:", onderwerp, JSON.stringify(context)); return; }
  const { error } = await db.from("app_meldingen").insert({
    company_id: companyId, profile_id: melder, soort: "vraag", onderwerp, bericht, pagina: "winkel", context,
  });
  if (error) console.error("interne melding mislukt:", error.message);
}

// Levert één betaalde bestelling: account (nieuw of bestaand), lid van het programma,
// uitnodiging als reservemail. Stap voor stap vastgelegd op de bestelling, zodat een
// nieuwe poging na een fout verder gaat waar de vorige stopte.
// Geeft "vervuld" of "bezet" (de andere kant is er nu mee bezig of was al klaar).
// Gooit een fout als er iets misging; de bestelling staat dan weer op pending.
async function vervul(db: SupabaseClient, orderId: string, s: Sessie): Promise<"vervuld" | "bezet"> {
  const grens = new Date(Date.now() - VASTGELOPEN_MS).toISOString();
  const { data: claim, error: claimErr } = await db.from("shop_orders")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .or(`status.eq.pending,and(status.eq.processing,updated_at.lt."${grens}")`)
    .select().maybeSingle();
  if (claimErr) throw new Error("bestelling claimen: " + claimErr.message);
  if (!claim) return "bezet";

  const email = (s.customer_details?.email || claim.email || "").trim().toLowerCase() || null;
  const naam = (s.customer_details?.name || "").trim();
  const programId = s.metadata?.program_id || claim.blog_program_id || null;
  const basis: Record<string, unknown> = {
    email,
    stripe_customer_id: s.customer || claim.stripe_customer_id || null,
    stripe_subscription_id: s.subscription || claim.stripe_subscription_id || null,
  };
  const zet = async (patch: Record<string, unknown>) => {
    const { error } = await db.from("shop_orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", orderId);
    if (error) throw new Error("bestelling bijwerken: " + error.message);
  };
  // Eindstand alleen zetten als wij de bestelling nog in handen hebben (niet over een
  // opzegging of een andere afhandeling heen die intussen plaatsvond).
  const afronden = async (patch: Record<string, unknown>) => {
    const { data, error } = await db.from("shop_orders").update({ ...basis, ...patch, status: "paid", updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("status", "processing").select("id");
    if (error) throw new Error("bestelling afronden: " + error.message);
    if (!data || !data.length) console.error("bestelling " + orderId + " was intussen al afgehandeld; status niet overschreven");
  };

  try {
    const { data: p, error: pErr } = programId
      ? await db.from("blog_programs").select("id,name,company_id,created_by").eq("id", programId).maybeSingle()
      : { data: null, error: null };
    if (pErr) throw new Error("programma ophalen: " + pErr.message);

    // Coach voor de koppeling: de maker van het blog, anders de eigenaar van het bedrijf.
    let coachId: string | null = p?.created_by || null;
    if (p && !coachId) {
      const { data: eig } = await db.from("profiles").select("id").eq("company_id", p.company_id).eq("role", "eigenaar").limit(1);
      coachId = eig && eig[0] ? eig[0].id : null;
    }

    if (!email || !p) {
      // Betaald, maar niets om aan te koppelen. Niet stil laten verdwijnen: melden.
      await afronden({});
      await meldIntern(db, p?.company_id || claim.company_id || null, coachId,
        "Winkel: betaalde bestelling zonder " + (!email ? "e-mailadres" : "programma"),
        "Er is betaald, maar de bestelling kon niet automatisch gekoppeld worden. Zoek de klant op in Stripe en koppel met de hand of betaal terug.",
        { order_id: orderId, stripe_session_id: s.id, email, program_id: programId });
      return "vervuld";
    }

    const delen = naam.split(/\s+/).filter(Boolean);
    const voornaam = delen[0] || null, achternaam = delen.slice(1).join(" ") || null;

    // 1. Welk account? (bij een nieuwe poging: wat de vorige al vastlegde)
    let profileId: string | null = claim.profile_id || null;
    let state: string | null = claim.account_state || null;
    if (!profileId || !state) {
      const { data: bestaandId, error: zoekErr } = await db.rpc("shop_user_id_by_email", { p_email: email });
      if (zoekErr) throw new Error("account zoeken: " + zoekErr.message);
      if (!bestaandId) {
        // Stempel met het bestelnummer: zo herkent een nieuwe poging dit account zeker als het
        // onze (en nooit een account dat iemand anders intussen aanmaakte).
        const { data: created, error: mkErr } = await db.auth.admin.createUser({
          email, email_confirm: true, password: crypto.randomUUID() + "Aa1!",
          app_metadata: { shop_order_id: orderId },
        });
        if (mkErr || !created?.user) throw new Error("account aanmaken: " + (mkErr?.message || "onbekend"));
        profileId = created.user.id;
        state = "nieuw";
      } else {
        profileId = bestaandId as string;
        const { data: u, error: uErr } = await db.auth.admin.getUserById(profileId);
        if (uErr || !u?.user) throw new Error("account ophalen: " + (uErr?.message || "niet gevonden"));
        if (u.user.app_metadata?.shop_order_id === orderId) state = "nieuw"; // door een eerdere poging van deze bestelling gemaakt
        else {
          const { data: prof, error: profErr } = await db.from("profiles").select("company_id,role").eq("id", profileId).maybeSingle();
          if (profErr) throw new Error("profiel ophalen: " + profErr.message);
          if (!prof) {
            // Inlog zonder profiel (bijvoorbeeld na "coach definitief verwijderen"): profiel
            // herstellen als los lid; stap 2 koppelt het daarna aan bedrijf en programma.
            const { error: herstelErr } = await db.from("profiles").upsert({ id: profileId, email, role: "lid" }, { onConflict: "id", ignoreDuplicates: true });
            if (herstelErr) throw new Error("profiel herstellen: " + herstelErr.message);
            state = "bestaand";
          } else {
            const zelfdeBedrijf = prof.company_id === p.company_id;
            const losLid = !prof.company_id && (prof.role || "lid") === "lid";
            state = zelfdeBedrijf || losLid ? "bestaand" : "ander_bedrijf";
          }
        }
      }
      await zet({ ...basis, profile_id: profileId, account_state: state });
    }

    // 2. Account bijwerken
    if (state === "nieuw") {
      const patch: Record<string, unknown> = {
        company_id: p.company_id, coach_id: coachId, role: "lid", membership_type: "free_blog",
        blog_program_id: p.id, archived: false,
      };
      if (voornaam) patch.first_name = voornaam;
      if (achternaam) patch.last_name = achternaam;
      const { data: rij, error } = await db.from("profiles").update(patch).eq("id", profileId).select("id");
      if (error) throw new Error("profiel koppelen: " + error.message);
      if (!rij || !rij.length) throw new Error("profiel koppelen: geen profiel gevonden voor het nieuwe account");
    } else if (state === "bestaand") {
      const { data: prof, error: profErr } = await db.from("profiles")
        .select("company_id,role,archived,blog_program_id,first_name,last_name").eq("id", profileId).single();
      if (profErr) throw new Error("profiel ophalen: " + profErr.message);
      const patch: Record<string, unknown> = {};
      if (prof.role === "lid") {
        if (!prof.company_id) Object.assign(patch, { company_id: p.company_id, coach_id: coachId, membership_type: "free_blog", blog_program_id: p.id });
        if (prof.archived) {
          // Oud-klant komt terug als blog-klant (ook een voormalige 1-op-1-klant); de coach
          // kan hem daarna zelf weer op 1-op-1 zetten.
          Object.assign(patch, { archived: false, membership_type: "free_blog", blog_program_id: p.id });
        } else if (!prof.blog_program_id) patch.blog_program_id = p.id;
        if (!prof.first_name && voornaam) patch.first_name = voornaam;
        if (!prof.last_name && achternaam) patch.last_name = achternaam;
      }
      // Coaches, eigenaren en beheerders: rol en lidmaatschap blijven zoals ze zijn.
      if (Object.keys(patch).length) {
        const { error } = await db.from("profiles").update(patch).eq("id", profileId);
        if (error) throw new Error("profiel bijwerken: " + error.message);
      }
    } else {
      // ander_bedrijf: het account hoort bij een ander bedrijf en ziet dit programma dus niet.
      // Niets aan het account veranderen; wij lossen het met de hand op.
      await afronden({});
      await meldIntern(db, p.company_id, profileId,
        "Winkel: koper heeft al een account bij een ander bedrijf",
        email + " kocht " + p.name + ", maar dit e-mailadres hoort bij een account van een ander bedrijf. " +
        "Daardoor ziet deze klant het programma niet. Neem contact op: ander e-mailadres gebruiken of terugbetalen.",
        { order_id: orderId, stripe_session_id: s.id, email, program_id: p.id });
      return "vervuld";
    }

    // 3. Lid van het programma
    const { error: mErr } = await db.from("blog_program_members")
      .upsert({ company_id: p.company_id, blog_program_id: p.id, athlete_id: profileId }, { onConflict: "blog_program_id,athlete_id", ignoreDuplicates: true });
    if (mErr) throw new Error("programma koppelen: " + mErr.message);

    // 4. Nieuw account: uitnodiging als reservemail ("kies je wachtwoord"). De database zet
    //    winkel-uitnodigingen (bron = winkel) zelf in het Nederlands en 10 minuten later in de
    //    wachtrij. Een eerdere poging kan hem al gemaakt hebben: dan die gebruiken.
    let inviteId: string | null = claim.invite_id || null;
    if (state === "nieuw" && !inviteId) {
      const { data: eerder, error: zErr } = await db.from("invites").select("id")
        .eq("profile_id", profileId).eq("bron", "winkel").eq("blog_program_id", p.id).is("accepted_at", null).limit(1);
      if (zErr) throw new Error("uitnodiging zoeken: " + zErr.message);
      if (eerder && eerder[0]) inviteId = eerder[0].id;
      else {
        const { data: inv, error: invErr } = await db.from("invites").insert({
          company_id: p.company_id, coach_id: coachId, email,
          first_name: voornaam, last_name: achternaam,
          role: "lid", membership_type: "free_blog", blog_program_id: p.id, profile_id: profileId,
          expires_at: new Date(Date.now() + 14 * 864e5).toISOString(), created_by: coachId, bron: "winkel",
        }).select("id").single();
        if (invErr) throw new Error("uitnodiging klaarzetten: " + invErr.message);
        inviteId = inv.id;
      }
    }

    await afronden(inviteId ? { invite_id: inviteId } : {});
    return "vervuld";
  } catch (e) {
    console.error("vervullen mislukt voor bestelling " + orderId + ":", (e as Error).message);
    // Terug naar pending (wat al gelukt is, blijft vastgelegd) zodat een nieuwe poging verder kan.
    await db.from("shop_orders").update({ ...basis, status: "pending", updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("status", "processing");
    throw e;
  }
}
// ---- vervul einde ----

async function stripeSessie(id: string): Promise<Sessie | null> {
  const sleutel = Deno.env.get("STRIPE_SECRET_KEY");
  if (!sleutel) return null;
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(id), {
    headers: { Authorization: "Bearer " + sleutel },
  });
  if (!r.ok) return null;
  return await r.json();
}

type Order = {
  id: string; status: string; email: string | null; account_state: string | null; profile_id: string | null;
  invite_id: string | null; blog_program_id: string | null; thanks_token: string | null; created_at: string;
};
const ORDER_KOLOMMEN = "id,status,email,account_state,profile_id,invite_id,blog_program_id,thanks_token,created_at";

// Stand van een NIEUW account: kan de koper hier nog een wachtwoord kiezen ("nieuw"), is het
// al ingesteld ("klaar"), of is de tijd hier om maar staat er nog geen wachtwoord ("verlopen":
// dan via de mail of "Wachtwoord vergeten"). De 48 uur tellen vanaf het moment dat het
// account klaarstond, zodat ook een incasso die dagen duurt nog op tijd is.
async function nieuwStand(db: SupabaseClient, o: Order): Promise<"nieuw" | "klaar" | "verlopen"> {
  if (!o.profile_id || !o.invite_id) return "verlopen";
  const { data: inv, error: invErr } = await db.from("invites").select("accepted_at,created_at").eq("id", o.invite_id).maybeSingle();
  if (invErr) throw new Error("uitnodiging ophalen: " + invErr.message);
  const { data: u, error: uErr } = await db.auth.admin.getUserById(o.profile_id);
  if (uErr) throw new Error("account ophalen: " + uErr.message);
  if (!inv || !u?.user) return "verlopen";
  if (inv.accepted_at || u.user.last_sign_in_at) return "klaar";
  if (Date.now() - new Date(inv.created_at).getTime() > WACHTWOORD_VENSTER_MS) return "verlopen";
  return "nieuw";
}
const wachtwoordOpen = async (db: SupabaseClient, o: Order) =>
  o.status === "paid" && o.account_state === "nieuw" && (await nieuwStand(db, o)) === "nieuw";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Alleen POST" });
  let body: { actie?: string; session_id?: string; t?: string; wachtwoord?: string } = {};
  try { body = await req.json(); } catch { return json(400, { error: "Geen geldige aanvraag" }); }
  const sid = String(body.session_id || "");
  const t = String(body.t || "");
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,}$/.test(sid) || !/^[0-9a-f-]{36}$/i.test(t)) {
    return json(400, { error: "Deze link is niet compleet. Gebruik de link in je mail." });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const leesOrder = async () => {
    const { data, error } = await db.from("shop_orders").select(ORDER_KOLOMMEN).eq("stripe_session_id", sid).maybeSingle();
    if (error) throw new Error("bestelling lezen: " + error.message);
    return data as Order | null;
  };
  const tijdelijk = () => json(502, { error: "Er ging even iets mis aan onze kant. Probeer het zo opnieuw." });
  let o: Order | null;
  try { o = await leesOrder(); } catch (_e) { return tijdelijk(); }
  if (!o || !o.thanks_token || o.thanks_token !== t) return json(404, { error: "Deze link is ongeldig. Gebruik de link in je mail." });

  if (body.actie === "status") {
    if (o.status === "failed") return json(200, { status: "mislukt" });
    if (o.status === "canceled") return json(200, { status: "gestopt" });
    const s = await stripeSessie(sid);
    if (!s) return json(502, { error: "We kunnen je betaling nu niet controleren. Probeer het zo opnieuw." });
    if (!BETAALD.includes(s.payment_status || "")) {
      return json(200, s.status === "complete" ? { status: "verwerking", email: o.email } : { status: "open" });
    }
    if (o.status === "pending" || o.status === "processing") {
      try { await vervul(db, o.id, s); } catch (_e) { /* webhook probeert het ook; de pagina vraagt zo opnieuw */ }
      try { o = (await leesOrder()) || o; } catch (_e) { return tijdelijk(); }
    }
    if (o.status !== "paid") return json(200, { status: "bezig" });
    const { data: p } = o.blog_program_id
      ? await db.from("blog_programs").select("name").eq("id", o.blog_program_id).maybeSingle() : { data: null };
    let account: string = o.account_state || "onbekend"; // onbekend = betaald, maar niets om aan te koppelen (wij nemen contact op)
    if (account === "nieuw") { try { account = await nieuwStand(db, o); } catch (_e) { return tijdelijk(); } }
    return json(200, { status: "paid", email: o.email, programma: p?.name || null, account, ...app() });
  }

  if (body.actie === "wachtwoord") {
    const fout = pwProbleem(body.wachtwoord);
    if (fout) return json(400, { error: fout });
    let open = false;
    try { open = await wachtwoordOpen(db, o); } catch (_e) { return tijdelijk(); }
    if (!open) {
      return json(400, { error: "Hier kun je geen wachtwoord (meer) kiezen. Log in met je wachtwoord, of kies 'Wachtwoord vergeten' op het inlogscherm." });
    }
    const { error: upErr } = await db.auth.admin.updateUserById(o.profile_id!, { password: body.wachtwoord });
    if (upErr) return json(400, { error: upErr.message || "Wachtwoord instellen mislukt" });
    const { data: inv } = await db.from("invites").update({ accepted_at: new Date().toISOString() })
      .eq("id", o.invite_id!).select("token").maybeSingle();
    // Reservemail is niet meer nodig
    if (inv?.token) {
      await db.from("mail_queue").update({ status: "skipped", last_error: "wachtwoord gekozen op de bedankpagina" })
        .eq("event", "invite").eq("status", "pending").eq("payload->>token", inv.token);
    }
    return json(200, { ok: true, email: o.email, ...app() });
  }

  return json(400, { error: "Onbekende actie" });
});
