// showdown-uitnodiging: mail aan de gratis YP Showdown-deelnemers die uit Strivee overkomen (20 nov 2026).
// Hun account staat al klaar. De mail zegt dat de Showdown naar de app is verhuisd, dat het account
// alleen voor de YP Showdown is, en heeft de knop Wachtwoord kiezen (dezelfde link als de gewone uitnodiging).
// Alleen platform_admin. Body: { profile_ids: string[], opnieuw?: boolean }
// Per profiel: de open uitnodiging met bron 'showdown_overstap' opzoeken, versturen via Resend, en een rij
// in mail_queue zetten (event 'showdown_uitnodiging', status sent of failed) zodat te zien is wie hem kreeg.
// Wie hem al kreeg wordt overgeslagen, tenzij opnieuw:true is meegegeven.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const AFZENDER_ADRES = "coach@mail.yourprogram.nl";
const ANTWOORD_ADRES = "info@yourprogram.nl";
const APP_STORE_URL = Deno.env.get("APP_STORE_URL") || "https://apps.apple.com/nl/app/id6792739065";
const PLAY_STORE_URL = Deno.env.get("PLAY_STORE_URL") || "https://play.google.com/store/apps/details?id=nl.yourprogram.forge";
const ONDERWERP = "De YP Showdown staat vanaf nu in de YourProgram-app";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function mailHtml(o: { voornaam: string; naar: string; link: string; accent: string; logoUrl: string | null; bedrijfsNaam: string }): string {
  const a = o.accent;
  const kop = o.logoUrl
    ? `<img src="${o.logoUrl}" alt="${esc(o.bedrijfsNaam)}" height="26" style="height:26px;display:block;margin-bottom:16px">`
    : `<div style="font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#8a919c;margin-bottom:14px">${esc(o.bedrijfsNaam)}</div>`;
  const stap = (n: number, titel: string, tekst: string) =>
    `<div style="margin:10px 0;padding:13px 15px;background:#141417;border:1px solid #26262b;border-radius:12px">` +
    `<div style="font-size:14px;font-weight:700;color:#f4f4f5">` +
    `<span style="display:inline-block;width:21px;height:21px;border-radius:50%;background:${a};color:#0E0E10;text-align:center;line-height:21px;font-size:12px;font-weight:800;margin-right:9px">${n}</span>${esc(titel)}</div>` +
    `<div style="font-size:13px;line-height:1.6;color:#c9c9ce;margin:7px 0 0 30px">${tekst}</div></div>`;
  const vraag = (v: string, antw: string) =>
    `<div style="margin:7px 0"><span style="color:#e6e6ea;font-weight:600">${esc(v)}</span> <span style="color:#8a919c">${antw}</span></div>`;
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:26px;background:#0E0E10;color:#f4f4f5;border-radius:14px">` + kop +
    `<h2 style="color:${a};margin:0 0 8px;font-size:20px">${esc("Welkom" + (o.voornaam ? " " + o.voornaam : "") + "!")}</h2>` +
    `<p style="margin:0 0 14px;line-height:1.6;color:#c9c9ce">De YP Showdown is verhuisd naar onze eigen app: YourProgram. In Strivee plaatsen we geen Showdowns meer. Je account voor de YP Showdown staat al klaar. In drie stappen doe je weer mee.</p>` +
    stap(1, "Kies je wachtwoord", `Klik op de knop hieronder en kies een wachtwoord. Je e-mailadres is al ingevuld: <b style="color:#e6e6ea">${esc(o.naar)}</b>.`) +
    stap(2, "Zet de app op je telefoon", `Zoek <b style="color:#e6e6ea">YourProgram</b> in de App Store (iPhone) of Google Play (Android), of gebruik deze link: <a href="${APP_STORE_URL}" style="color:${a}">App Store</a> / <a href="${PLAY_STORE_URL}" style="color:${a}">Google Play</a>.`) +
    stap(3, "Log in en doe mee", `Log in met hetzelfde e-mailadres en je nieuwe wachtwoord. De Showdown staat bij vrijdag: tik bovenaan op <b style="color:#e6e6ea">vr</b>. Log je score en je staat op het leaderboard. Staat er een kruisje bij vrijdag? Geen probleem, je kunt hem het hele weekend nog loggen.`) +
    `<div style="margin:18px 0 0"><a href="${o.link}" style="display:inline-block;background:${a};color:#0E0E10;font-weight:700;padding:13px 24px;border-radius:10px;text-decoration:none">Wachtwoord kiezen</a></div>` +
    `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#c9c9ce">Dit account is alleen voor de YP Showdown en blijft gratis. Had je deze week al gelogd in Strivee? Dan hoef je niets opnieuw in te vullen, die score zetten wij over.</p>` +
    `<div style="margin:20px 0 0;padding-top:14px;border-top:1px solid #26262b;font-size:12.5px;line-height:1.55">` +
    `<div style="color:#e6e6ea;font-weight:700;margin-bottom:6px">Loopt het ergens vast?</div>` +
    vraag("Knop doet niks?", `Kopieer deze link naar je browser:<br><span style="color:#6f747c">${esc(o.link)}</span>`) +
    vraag("Wachtwoord kwijt?", `Kies bij het inloggen "Wachtwoord vergeten", dan krijg je een nieuwe link.`) +
    vraag("Nog vragen?", `Mail naar <a href="mailto:${ANTWOORD_ADRES}" style="color:${a}">${ANTWOORD_ADRES}</a>.`) +
    `<div style="margin:12px 0 0;color:#6f747c">Deze uitnodiging is 14 dagen geldig.</div></div></div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any; try { body = await req.json(); } catch { return json(400, { error: "Geen geldige aanvraag" }); }
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!jwt) return json(401, { error: "Niet ingelogd" });
  const { data: caller } = await admin.auth.getUser(jwt);
  if (!caller?.user) return json(401, { error: "Niet ingelogd" });
  const { data: mij } = await admin.from("profiles").select("id,role").eq("id", caller.user.id).single();
  if (!mij || mij.role !== "platform_admin") return json(403, { error: "Alleen platform_admin" });
  if (!RESEND_KEY) return json(500, { error: "RESEND_API_KEY ontbreekt" });

  const ids: string[] = Array.isArray(body.profile_ids) ? body.profile_ids.filter((x: unknown) => typeof x === "string").slice(0, 60) : [];
  if (!ids.length) return json(400, { error: "Geef profile_ids mee" });
  const bedrijven: Record<string, any> = {};
  const uit: any[] = [];
  let verstuurd = 0;
  for (const id of ids) {
    const { data: p } = await admin.from("profiles").select("id,first_name,email,company_id").eq("id", id).maybeSingle();
    if (!p || !p.email) { uit.push({ profile_id: id, error: "geen profiel of e-mailadres" }); continue; }
    const { data: inv } = await admin.from("invites").select("token,expires_at").eq("profile_id", id).eq("bron", "showdown_overstap")
      .is("accepted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!inv || (inv.expires_at && new Date(inv.expires_at) < new Date())) { uit.push({ profile_id: id, error: "geen open uitnodiging" }); continue; }
    if (body.opnieuw !== true) {
      const { data: al } = await admin.from("mail_queue").select("id").eq("recipient_id", id).eq("event", "showdown_uitnodiging").eq("status", "sent").limit(1);
      if (al && al.length) { uit.push({ profile_id: id, overgeslagen: "al verstuurd" }); continue; }
    }
    if (!(p.company_id in bedrijven)) {
      const { data: b } = await admin.from("companies").select("name,theme,logo_url").eq("id", p.company_id).maybeSingle();
      bedrijven[p.company_id] = b || {};
    }
    const b = bedrijven[p.company_id];
    const kleur = String(b?.theme?.color || "");
    const html = mailHtml({
      voornaam: String(p.first_name || "").trim(), naar: p.email, link: `https://app.yourprogram.nl/?invite=${inv.token}`,
      accent: /^#[0-9a-fA-F]{6}$/.test(kleur) ? kleur : "#D9B44A", logoUrl: b?.logo_url || null, bedrijfsNaam: b?.name || "YourProgram",
    });
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${b?.name || "YourProgram"} <${AFZENDER_ADRES}>`, to: [p.email], subject: ONDERWERP, html, reply_to: ANTWOORD_ADRES }),
    });
    const fout = r.ok ? null : (await r.text().catch(() => String(r.status))).slice(0, 300);
    const nu = new Date().toISOString();
    await admin.from("mail_queue").insert({
      company_id: p.company_id, recipient_id: id, recipient_email: p.email, event: "showdown_uitnodiging",
      payload: { token: inv.token, first_name: p.first_name || null }, status: r.ok ? "sent" : "failed",
      sent_at: r.ok ? nu : null, last_error: fout, send_after: nu,
    });
    if (r.ok) { verstuurd++; uit.push({ profile_id: id, ok: true }); } else uit.push({ profile_id: id, error: fout });
    await new Promise((klaar) => setTimeout(klaar, 600)); // rustig aan voor de maildienst
  }
  return json(200, { gevraagd: ids.length, verstuurd, resultaat: uit });
});
