// push-send: verwerkt de push_queue en verstuurt pushmeldingen via de Expo
// Push API naar de telefoons in push_tokens (feedbackronde 5, ronde D, 20 okt 2026).
// Aangeroepen door een databasetrigger zodra er een rij in push_queue komt
// (dus vrijwel direct) en als vangnet elke minuut door pg_cron, net als mail-send.
// Regels:
// - Per rij: alle tokens van de ontvanger; geen tokens = skipped.
// - Expo-tickets: DeviceNotRegistered = token weg (app verwijderd of uitgelogd).
// - Mislukt: 3 pogingen met 2 minuten ertussen, daarna failed.
// - Vinkjes en ontvangers zijn al in de database bepaald (private.queue_push).
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN"); // alleen nodig als "Enhanced push security" aanstaat

type Rij = { id: string; recipient_id: string; soort: string; titel: string; body: string; data: Record<string, unknown> | null; attempts: number };
type Bericht = { to: string; title: string; body: string; data: Record<string, unknown>; sound: string; channelId: string; priority: string };

async function verstuurBatch(berichten: Bericht[]): Promise<Array<{ status: string; details?: { error?: string }; message?: string }>> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (EXPO_TOKEN) headers.Authorization = `Bearer ${EXPO_TOKEN}`;
  const r = await fetch(EXPO_URL, { method: "POST", headers, body: JSON.stringify(berichten) });
  if (!r.ok) throw new Error(`Expo ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  if (!Array.isArray(j.data)) throw new Error("Expo gaf geen tickets terug: " + JSON.stringify(j).slice(0, 300));
  return j.data;
}

Deno.serve(async () => {
  const nu = new Date().toISOString();
  const { data: rijen, error } = await db.from("push_queue").select("*")
    .eq("status", "pending").lte("send_after", nu).lt("attempts", 3)
    .order("created_at").limit(300);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!rijen || !rijen.length) return new Response(JSON.stringify({ verwerkt: 0 }), { headers: { "Content-Type": "application/json" } });

  // Tokens van alle ontvangers in één keer.
  const ids = [...new Set((rijen as Rij[]).map((r) => r.recipient_id))];
  const { data: tokens } = await db.from("push_tokens").select("profile_id,token,platform").in("profile_id", ids);
  const perOntvanger: Record<string, string[]> = {};
  (tokens || []).forEach((t) => { (perOntvanger[t.profile_id] = perOntvanger[t.profile_id] || []).push(t.token); });

  // Berichten opbouwen; onthoud per bericht bij welke rij en welk token hij hoort.
  const berichten: Bericht[] = [];
  const herkomst: Array<{ rij: Rij; token: string }> = [];
  const zonderToken: string[] = [];
  for (const rij of rijen as Rij[]) {
    const toks = (perOntvanger[rij.recipient_id] || []).filter((t) => /^ExponentPushToken\[/.test(t));
    if (!toks.length) { zonderToken.push(rij.id); continue; }
    for (const token of toks) {
      berichten.push({
        to: token, title: rij.titel, body: rij.body,
        data: Object.assign({ soort: rij.soort, queue_id: rij.id }, rij.data || {}),
        sound: "default", channelId: "default", priority: "high",
      });
      herkomst.push({ rij, token });
    }
  }
  if (zonderToken.length) await db.from("push_queue").update({ status: "skipped", last_error: "geen telefoon geregistreerd" }).in("id", zonderToken);

  // In stukken van 100 naar Expo; tickets per rij samenvoegen.
  const uitkomst: Record<string, { ok: number; fout: string[] }> = {};
  const dodeTokens = new Set<string>();
  let netwerkFout: string | null = null;
  for (let i = 0; i < berichten.length; i += 100) {
    const deel = berichten.slice(i, i + 100), bron = herkomst.slice(i, i + 100);
    try {
      const tickets = await verstuurBatch(deel);
      tickets.forEach((t, k) => {
        const { rij, token } = bron[k];
        const u = (uitkomst[rij.id] = uitkomst[rij.id] || { ok: 0, fout: [] });
        if (t.status === "ok") u.ok++;
        else {
          const code = (t.details && t.details.error) || t.message || "onbekend";
          u.fout.push(code);
          if (code === "DeviceNotRegistered") dodeTokens.add(token);
        }
      });
    } catch (e) {
      netwerkFout = String(e).slice(0, 300);
      bron.forEach(({ rij }) => { const u = (uitkomst[rij.id] = uitkomst[rij.id] || { ok: 0, fout: [] }); u.fout.push(netwerkFout!); });
    }
  }
  if (dodeTokens.size) await db.from("push_tokens").delete().in("token", [...dodeTokens]);

  let sent = 0, failed = 0, retry = 0;
  for (const rij of rijen as Rij[]) {
    const u = uitkomst[rij.id];
    if (!u) continue; // zonder token, al afgehandeld
    if (u.ok > 0) {
      sent++;
      await db.from("push_queue").update({ status: "sent", sent_at: new Date().toISOString(), last_error: u.fout.length ? u.fout.join("; ").slice(0, 300) : null }).eq("id", rij.id);
    } else {
      const pogingen = (rij.attempts || 0) + 1;
      // Alleen dode tokens: niets om opnieuw te proberen.
      const alleenDood = u.fout.length && u.fout.every((f) => f === "DeviceNotRegistered");
      const status = alleenDood ? "skipped" : (pogingen >= 3 ? "failed" : "pending");
      if (status === "failed") failed++; else if (status === "pending") retry++;
      await db.from("push_queue").update({
        status, attempts: pogingen, last_error: u.fout.join("; ").slice(0, 300),
        send_after: new Date(Date.now() + 2 * 60_000).toISOString(),
      }).eq("id", rij.id);
    }
  }
  return new Response(JSON.stringify({ verwerkt: rijen.length, sent, failed, retry, skipped: zonderToken.length, dode_tokens: dodeTokens.size }), { headers: { "Content-Type": "application/json" } });
});
