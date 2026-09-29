// account-delete: een lid verwijdert zijn eigen account vanuit de app
// (Profiel > Account verwijderen). Apple (richtlijn 5.1.1) en de AVG vragen
// dat een gebruiker zijn account zelf kan laten verwijderen. Volgorde:
//  1. Wie ben je? (JWT). Alleen een lid (role = lid) mag dit; coaches, eigenaren
//     en beheerders lopen via een beheerder, want daar hangen klanten en
//     programma's aan.
//  2. Bestanden weg uit Storage: uploads bij resultaten en chatbijlagen (media),
//     voortgangsfoto's (progress), profielfoto (avatars), documenten (documents).
//  3. Rijen weg die niet automatisch mee-verwijderen: de workouts van dit lid
//     (met blokken en resultaten), chatberichten, aandacht-snoozes, feedback.
//  4. De inlog weg (auth.users). De profielrij en alle tabellen met
//     "on delete cascade" (resultaten, reacties, metingen, notities, meldingen,
//     pushtokens, mailwachtrij, …) gaan daarmee vanzelf mee.
// verify_jwt staat aan: alleen een ingelogde gebruiker, en alleen zijn eigen
// account. De app stuurt {bevestiging:"VERWIJDER"} mee als extra slot.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Alleen POST" });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: wie } = jwt ? await db.auth.getUser(jwt) : { data: null };
  const uid = wie?.user?.id;
  if (!uid) return json(401, { error: "Niet ingelogd" });
  let body: { bevestiging?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  if (body.bevestiging !== "VERWIJDER") return json(400, { error: "Bevestiging ontbreekt" });

  const { data: prof } = await db.from("profiles").select("id,role,company_id,avatar_url").eq("id", uid).maybeSingle();
  if (!prof) return json(404, { error: "Profiel niet gevonden" });
  if (prof.role !== "lid") return json(403, { error: "Een coach- of beheerdersaccount verwijder je via een beheerder van het dashboard." });

  const fouten: string[] = [];

  // 2. Bestanden in Storage (paden uit de tabellen; de rijen zelf gaan straks via cascade)
  const paden: Record<string, Set<string>> = { media: new Set(), progress: new Set(), avatars: new Set(), documents: new Set() };
  const [{ data: rm }, { data: pf }, { data: docs }, { data: msgs }] = await Promise.all([
    db.from("result_media").select("storage_path").eq("athlete_id", uid),
    db.from("progress_photos").select("storage_path").eq("athlete_id", uid),
    db.from("documents").select("storage_path").eq("athlete_id", uid),
    db.from("messages").select("media").or(`athlete_id.eq.${uid},sender_id.eq.${uid}`),
  ]);
  (rm || []).forEach((r) => { if (r.storage_path) paden.media.add(r.storage_path); });
  (pf || []).forEach((r) => { if (r.storage_path) paden.progress.add(r.storage_path); });
  (docs || []).forEach((r) => { if (r.storage_path) paden.documents.add(r.storage_path); });
  (msgs || []).forEach((m) => {
    const lijst = Array.isArray(m.media) ? m.media : [];
    lijst.forEach((x: { path?: string }) => { if (x && x.path) paden.media.add(x.path); });
  });
  const av = String(prof.avatar_url || "").match(/\/avatars\/([^?]+)/);
  if (av && av[1]) paden.avatars.add(decodeURIComponent(av[1]));
  for (const bucket of Object.keys(paden)) {
    const lijst = [...paden[bucket]];
    for (let i = 0; i < lijst.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(lijst.slice(i, i + 100));
      if (error) fouten.push(bucket + ": " + error.message);
    }
  }

  // 3. Rijen zonder cascade (in deze volgorde, vanwege de onderlinge verwijzingen)
  // deno-lint-ignore no-explicit-any
  const weg = async (tabel: string, filter: (q: any) => any) => {
    const { error } = await filter(db.from(tabel).delete());
    if (error) fouten.push(tabel + ": " + error.message);
  };
  await weg("feedback_replies", (q) => q.or(`athlete_id.eq.${uid},author_id.eq.${uid}`));
  await weg("feedback", (q) => q.eq("athlete_id", uid));
  await weg("attention_snooze", (q) => q.eq("athlete_id", uid));
  await weg("messages", (q) => q.or(`athlete_id.eq.${uid},sender_id.eq.${uid}`));
  await weg("workouts", (q) => q.eq("client_id", uid));

  // 4. Inlog weg; profiel en cascades gaan mee
  const { error: authFout } = await db.auth.admin.deleteUser(uid);
  if (authFout) return json(500, { error: "Verwijderen is niet gelukt: " + authFout.message, fouten });
  return json(200, { ok: true, fouten });
});
