// Stripe-webhook: verwerkt betaal-gebeurtenissen.
// - checkout.session.completed: bij een directe betaling (iDEAL, kaart, Bancontact) of zonder
//   betaling (proefperiode, 100%-code) de bestelling leveren via vervul(). Bij SEPA-incasso
//   is de betaling nog onderweg: gegevens vastleggen en wachten.
// - checkout.session.async_payment_succeeded: incasso gelukt, nu leveren.
// - checkout.session.async_payment_failed: incasso mislukt, bestelling op failed.
// - customer.subscription.deleted: opgezegd; shop_afsluiten haalt het programma weg en zet
//   alleen een gratis blog-lid zonder andere programma's in het archief.
// Lukt het leveren niet, dan antwoorden we met een foutcode, zodat Stripe het later opnieuw
// probeert (tot drie dagen lang). De bedankpagina (shop-bedankt) levert ook, wie het eerst komt.
// Eigen beveiliging: de Stripe-handtekening (STRIPE_WEBHOOK_SECRET) wordt gecontroleerd.
// LET OP in het Stripe-dashboard: het webhook-adres moet ook de twee async_payment-gebeurtenissen
// ontvangen (Ontwikkelaars > Webhooks > dit adres > Gebeurtenissen).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

function gelijk(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function handtekeningKlopt(body: string, kop: string | null, geheim: string): Promise<boolean> {
  if (!kop) return false;
  const delen = kop.split(",").map((s) => s.trim().split("="));
  const t = delen.find(([k]) => k === "t")?.[1];
  const v1s = delen.filter(([k]) => k === "v1").map(([, v]) => v || ""); // bij het wisselen van geheim staan er twee
  if (!t || !v1s.length) return false;
  // Niet ouder dan 5 minuten (replay-bescherming)
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const sleutel = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(geheim), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", sleutel, new TextEncoder().encode(t + "." + body));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return v1s.some((v) => gelijk(v, hex));
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

// Stripe-abonnement stoppen. Bestaat het niet (meer) of is het al gestopt, dan is dat goed.
async function stopAbonnement(subId: string): Promise<void> {
  const sleutel = Deno.env.get("STRIPE_SECRET_KEY");
  if (!sleutel) throw new Error("STRIPE_SECRET_KEY ontbreekt");
  const url = "https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(subId);
  const r = await fetch(url, { method: "DELETE", headers: { Authorization: "Bearer " + sleutel } });
  if (r.ok || r.status === 404) return;
  const nu = await fetch(url, { headers: { Authorization: "Bearer " + sleutel } });
  const sub = nu.ok ? await nu.json() : null;
  if (sub && ["canceled", "incomplete_expired"].includes(sub.status)) return;
  throw new Error("abonnement stoppen mislukt: " + (await r.text()).slice(0, 200));
}

const antwoord = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

// Bestelling bij deze Stripe-sessie. Bestaat hij niet, dan maken we hem alsnog aan, maar alleen
// als het een sessie van onze winkel is (met program_id). Andere betalingen op het Stripe-account
// (betaallinks, andere koppelingen) laten we met rust: dan geeft deze functie null.
async function bestellingVan(db: SupabaseClient, s: Sessie) {
  const kolommen = "id,status";
  const { data: o, error } = await db.from("shop_orders").select(kolommen).eq("stripe_session_id", s.id).maybeSingle();
  if (error) throw new Error("bestelling zoeken: " + error.message);
  if (o) return o;
  if (!s.metadata?.program_id) return null;
  const programId = s.metadata?.program_id || null;
  const { data: p } = programId ? await db.from("blog_programs").select("company_id").eq("id", programId).maybeSingle() : { data: null };
  const { data: nieuw, error: insErr } = await db.from("shop_orders").insert({
    company_id: p?.company_id || null, blog_program_id: programId, status: "pending", stripe_session_id: s.id,
  }).select(kolommen).single();
  if (!insErr) return nieuw;
  // Tegelijk door de andere kant aangemaakt (unieke index op stripe_session_id): opnieuw lezen.
  const { data: o2, error: e2 } = await db.from("shop_orders").select(kolommen).eq("stripe_session_id", s.id).single();
  if (e2) throw new Error("bestelling aanmaken: " + insErr.message);
  return o2;
}

Deno.serve(async (req) => {
  const geheim = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!geheim) return new Response("webhook-geheim ontbreekt", { status: 500 });
  const body = await req.text();
  if (!(await handtekeningKlopt(body, req.headers.get("Stripe-Signature"), geheim))) {
    return new Response("ongeldige handtekening", { status: 400 });
  }

  const event = JSON.parse(body);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const s = event.data.object as Sessie;
      const o = await bestellingVan(db, s);
      if (!o) return antwoord(200, { received: true, genegeerd: "geen winkelbestelling" });
      if (!BETAALD.includes(s.payment_status || "")) {
        // SEPA-incasso: betaling onderweg. Alvast vastleggen wie het is; leveren volgt bij
        // async_payment_succeeded.
        await db.from("shop_orders").update({
          email: (s.customer_details?.email || "").trim().toLowerCase() || null,
          stripe_customer_id: s.customer || null, stripe_subscription_id: s.subscription || null,
          updated_at: new Date().toISOString(),
        }).eq("id", o.id).eq("status", "pending");
        return antwoord(200, { received: true, wacht: "betaling onderweg" });
      }
      if (o.status === "pending" || o.status === "processing") {
        const uitkomst = await vervul(db, o.id, s);
        if (uitkomst === "bezet") {
          const { data: nu } = await db.from("shop_orders").select("status").eq("id", o.id).single();
          // De bedankpagina is ermee bezig: straks opnieuw proberen tot hij echt klaar is.
          if (nu?.status !== "paid") return antwoord(409, { error: "bestelling wordt al verwerkt, later opnieuw" });
        }
      } else if (o.status === "paid") {
        // Al geleverd via de bedankpagina: alleen de Stripe-nummers aanvullen als die ontbreken.
        await db.from("shop_orders").update({
          stripe_customer_id: s.customer || null, stripe_subscription_id: s.subscription || null,
          updated_at: new Date().toISOString(),
        }).eq("id", o.id).is("stripe_subscription_id", null);
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      const s = event.data.object as Sessie;
      const { data: rijen, error } = await db.from("shop_orders").update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("stripe_session_id", s.id).in("status", ["pending", "processing"]).select("id,company_id,email");
      if (error) throw new Error("status failed zetten: " + error.message);
      if (rijen && rijen.length) {
        await meldIntern(db, rijen[0].company_id, null, "Winkel: incasso mislukt",
          (rijen[0].email || "Een koper") + " betaalde met automatische incasso, maar de bank heeft de betaling geweigerd. Het abonnement is gestopt; de klant heeft geen toegang. Neem eventueel contact op zodat hij opnieuw kan bestellen, bijvoorbeeld met iDEAL.",
          { order_id: rijen[0].id, stripe_session_id: s.id, email: rijen[0].email });
      }
      // Het abonnement dat Stripe al aanmaakte stoppen: anders probeert Stripe later opnieuw
      // te incasseren voor iets wat we niet leveren. De klant bestelt gewoon opnieuw.
      if (s.subscription && s.metadata?.program_id) await stopAbonnement(String(s.subscription));
    } else if (event.type === "customer.subscription.updated") {
      // Einddatum bijhouden: na opzeggen in de app (shop-abonnement), maar ook als wij in het
      // Stripe-dashboard opzeggen of een opzegging intrekken. Het dashboard toont deze datum.
      // We lezen de actuele stand bij Stripe: gebeurtenissen kunnen laat of dubbel binnenkomen.
      const { data: o, error: zErr } = await db.from("shop_orders").select("id,company_id,email,profile_id,cancel_at,cancel_requested_at,status")
        .eq("stripe_subscription_id", event.data.object.id).maybeSingle();
      if (zErr) throw new Error("bestelling zoeken: " + zErr.message);
      if (o && o.status === "paid") {
        const sleutel = Deno.env.get("STRIPE_SECRET_KEY");
        const r = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(event.data.object.id), { headers: { Authorization: "Bearer " + sleutel } });
        if (!r.ok) throw new Error("abonnement ophalen: " + r.status);
        const sub = await r.json();
        const item = sub.items?.data?.[0] || {};
        const periodeEinde = item.current_period_end || sub.current_period_end || null;
        const stopt = sub.cancel_at || (sub.cancel_at_period_end ? periodeEinde : null);
        const stoptIso = stopt ? new Date(stopt * 1000).toISOString() : null;
        const nu = new Date().toISOString();
        const patch: Record<string, unknown> = { cancel_at: stoptIso, updated_at: nu };
        if (stopt && !o.cancel_requested_at) patch.cancel_requested_at = nu;
        if (!stopt) patch.cancel_requested_at = null;
        const { error } = await db.from("shop_orders").update(patch).eq("id", o.id);
        if (error) throw new Error("einddatum bijwerken: " + error.message);
        // Opgezegd buiten de app om (door ons in Stripe): het lid krijgt ook dan een bevestiging.
        // Via de app regelt shop-abonnement de mail zelf (metadata opgezegd_via = app).
        if (stopt && !o.cancel_at && sub.metadata?.opgezegd_via !== "app") {
          let naar = o.email;
          if (o.profile_id) {
            const { data: u } = await db.auth.admin.getUserById(o.profile_id);
            naar = u?.user?.email || naar;
          }
          if (naar) {
            const { error: mErr } = await db.from("mail_queue").insert({ company_id: o.company_id, recipient_email: naar, event: "opzegging", payload: { order_id: o.id, soort: "opgezegd", stopt_op: stoptIso, laatste_betaling: periodeEinde && periodeEinde < stopt ? new Date(periodeEinde * 1000).toISOString() : null } });
            if (mErr) console.error("bevestigingsmail (Stripe-opzegging) niet ingepland:", mErr.message);
          }
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const { error } = await db.rpc("shop_afsluiten", { p_subscription_id: sub.id });
      if (error) throw new Error("opzegging verwerken: " + error.message);
    }
  } catch (e) {
    console.error("webhook " + event.type + " mislukt:", (e as Error).message);
    return antwoord(500, { error: "verwerken mislukt, Stripe probeert het opnieuw" });
  }
  return antwoord(200, { received: true });
});
