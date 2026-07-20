// mail-send: verwerkt de mail_queue en verstuurt via Resend.
// Draait elke minuut via pg_cron. Regels:
// - Vinkjes: staf krijgt alleen mail als notify_prefs.mail[event] aan staat
//   (standaard uit); een lid krijgt mail tenzij expliciet uitgezet.
//   Uitzondering: 'dagworkout' is voor iedereen opt-in (vinkje moet aan staan).
// - Werkuren: staat de ontvanger op "alleen tijdens werkuren", dan schuift de
//   mail door naar het eerstvolgende toegestane moment (Europe/Amsterdam).
// - Mislukt versturen: 3 pogingen met 10 min tussenruimte, daarna failed.
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const AFZENDER_ADRES = "coach@mail.yourprogram.nl";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function naamVan(p: { first_name?: string; last_name?: string } | null): string {
  if (!p) return "Onbekend";
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Onbekend";
}

// Huidige tijd in Amsterdam: { dag 0=ma..6=zo, uur }
function amsterdamNu(): { dag: number; uur: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", weekday: "short", hour: "numeric", hour12: false }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value || "Mon";
  const uur = parseInt(parts.find((p) => p.type === "hour")?.value || "12", 10);
  const dag = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[wd] ?? 0;
  return { dag, uur };
}

// Mag nu gemaild worden volgens mail_tijden? Zo nee: hoeveel uur wachten (grof)?
function werkurenCheck(tijden: { modus?: string; van?: number; tot?: number; dagen?: boolean[] } | null): { magNu: boolean; wachtUren: number } {
  const t = Object.assign({ modus: "altijd", van: 9, tot: 17, dagen: [true, true, true, true, true, false, false] }, tijden || {});
  if (t.modus !== "werkuren") return { magNu: true, wachtUren: 0 };
  const { dag, uur } = amsterdamNu();
  const dagen = Array.isArray(t.dagen) && t.dagen.length === 7 ? t.dagen : [true, true, true, true, true, false, false];
  if (dagen[dag] && uur >= t.van && uur < t.tot) return { magNu: true, wachtUren: 0 };
  // Zoek het eerstvolgende toegestane uur (maximaal 8 dagen vooruit kijken)
  for (let extra = 0; extra <= 8 * 24; extra++) {
    const totUur = uur + extra;
    const d = (dag + Math.floor(totUur / 24)) % 7;
    const u = totUur % 24;
    if (dagen[d] && u >= t.van && u < t.tot) return { magNu: false, wachtUren: Math.max(extra, 1) };
  }
  return { magNu: false, wachtUren: 24 };
}

function datumNL(iso: string): string {
  try {
    return new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso + "T12:00:00"));
  } catch {
    return iso;
  }
}

const KADER_OPEN = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:26px;background:#0E0E10;color:#f4f4f5;border-radius:14px">`;

function reactieHtml(opts: { titel: string; intro: string; draad: { naam: string; body: string; vanMij: boolean }[]; workoutTitel: string; voet: string }): string {
  const bubbels = opts.draad.map((c) =>
    `<div style="margin:6px 0;padding:10px 12px;border-radius:10px;background:${c.vanMij ? "#26221a" : "#1d1d21"};border:1px solid #2c2c31">` +
    `<div style="font-size:12px;color:#D9B44A;margin-bottom:3px">${esc(c.naam)}</div>` +
    `<div style="font-size:14px;line-height:1.45;color:#f4f4f5;white-space:pre-wrap">${esc(c.body)}</div></div>`).join("");
  return KADER_OPEN +
    `<h2 style="color:#D9B44A;margin:0 0 6px;font-size:20px">${esc(opts.titel)}</h2>` +
    `<p style="margin:0 0 14px;line-height:1.5;color:#c9c9ce">${esc(opts.intro)}</p>` +
    `<div style="font-size:13px;color:#8a919c;margin-bottom:4px">${esc(opts.workoutTitel)}</div>` +
    bubbels +
    `<p style="margin:18px 0 0;color:#8a919c;font-size:12px;line-height:1.5">${esc(opts.voet)}</p></div>`;
}

type Blok = { label: string | null; exercise: string | null; prescription: string | null; notes: string | null };
type WorkoutMail = { title: string | null; coach_notes: string | null; warmup: string | null; cooldown: string | null; blokken: Blok[] };

function dagworkoutHtml(opts: { naam: string; datum: string; workouts: WorkoutMail[]; voet: string }): string {
  const sectie = (kop: string, tekst: string | null) => tekst
    ? `<div style="margin:8px 0"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a919c;margin-bottom:2px">${esc(kop)}</div><div style="font-size:13.5px;line-height:1.5;color:#e6e6ea;white-space:pre-wrap">${esc(tekst)}</div></div>`
    : "";
  const kaarten = opts.workouts.map((w) => {
    const blokken = w.blokken.map((b) => {
      const kop = [b.label, b.exercise].filter(Boolean).join(" · ");
      const regels = [b.prescription, b.notes].filter(Boolean).join("\n");
      return `<div style="margin:8px 0;padding:9px 11px;border-left:3px solid #D9B44A;background:#1a1a1e;border-radius:0 8px 8px 0">` +
        (kop ? `<div style="font-size:13.5px;font-weight:600;color:#f4f4f5;margin-bottom:2px">${esc(kop)}</div>` : "") +
        (regels ? `<div style="font-size:13px;line-height:1.5;color:#c9c9ce;white-space:pre-wrap">${esc(regels)}</div>` : "") +
        `</div>`;
    }).join("");
    return `<div style="margin:14px 0;padding:14px 16px;background:#141417;border:1px solid #26262b;border-radius:12px">` +
      `<div style="font-size:16px;font-weight:700;color:#D9B44A;margin-bottom:6px">${esc(w.title || "Workout")}</div>` +
      sectie("Notities van je coach", w.coach_notes) +
      sectie("Warming-up", w.warmup) +
      blokken +
      sectie("Cooldown", w.cooldown) +
      `</div>`;
  }).join("");
  return KADER_OPEN +
    `<h2 style="color:#D9B44A;margin:0 0 6px;font-size:20px">Je workout voor vandaag</h2>` +
    `<p style="margin:0 0 6px;line-height:1.5;color:#c9c9ce">Goedemorgen ${esc(opts.naam)}, dit staat er vandaag (${esc(opts.datum)}) voor je klaar.</p>` +
    kaarten +
    `<p style="margin:18px 0 0;color:#8a919c;font-size:12px;line-height:1.5">${esc(opts.voet)}</p></div>`;
}

async function verstuur(naar: string, afzenderNaam: string, onderwerp: string, html: string): Promise<Response> {
  return await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY!.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${afzenderNaam} <${AFZENDER_ADRES}>`, to: [naar], subject: onderwerp, html }),
  });
}

async function verwerkRij(rij: Record<string, unknown>): Promise<string> {
  const id = rij.id as string;
  const event = rij.event as string;
  const payload = (rij.payload || {}) as Record<string, unknown>;
  const klaar = async (patch: Record<string, unknown>) => { await db.from("mail_queue").update(patch).eq("id", id); };

  const { data: ontvanger } = await db.from("profiles").select("id,first_name,last_name,email,role,notify_prefs,company_id").eq("id", rij.recipient_id).single();
  if (!ontvanger || !ontvanger.email) { await klaar({ status: "skipped", last_error: "geen ontvanger/e-mail" }); return "skipped"; }

  // Vinkjes: staf standaard uit, lid standaard aan; dagworkout altijd opt-in.
  const prefs = (ontvanger.notify_prefs || {}) as { mail?: Record<string, boolean>; mail_tijden?: Record<string, unknown> };
  const vinkje = (prefs.mail || {})[event];
  const isLid = ontvanger.role === "lid";
  const aan = event === "dagworkout" ? vinkje === true : (isLid ? vinkje !== false : vinkje === true);
  if (!aan) { await klaar({ status: "skipped", last_error: "mail-vinkje uit" }); return "skipped"; }

  // Werkuren van de ontvanger (dagworkout-mail negeert werkuren: die is juist vroeg)
  if (event !== "dagworkout") {
    const wu = werkurenCheck(prefs.mail_tijden as never);
    if (!wu.magNu) {
      const later = new Date(Date.now() + wu.wachtUren * 3600_000);
      later.setMinutes(2, 0, 0);
      await klaar({ send_after: later.toISOString() });
      return "uitgesteld";
    }
  }

  const { data: bedrijf } = await db.from("companies").select("name").eq("id", ontvanger.company_id).maybeSingle();
  const afzenderNaam = bedrijf?.name || "CoachApp";

  if (event === "dagworkout") {
    const ids = (payload.workout_ids || []) as string[];
    const datum = datumNL(String(payload.datum || ""));
    const { data: ws } = await db.from("workouts").select("id,title,coach_notes,warmup,cooldown").in("id", ids);
    if (!ws || !ws.length) { await klaar({ status: "skipped", last_error: "workout(s) niet meer gevonden" }); return "skipped"; }
    const { data: bs } = await db.from("blocks").select("workout_id,sort,label,exercise,prescription,notes").in("workout_id", ids).order("sort");
    const workouts: WorkoutMail[] = ws.map((w) => ({
      title: w.title, coach_notes: w.coach_notes, warmup: w.warmup, cooldown: w.cooldown,
      blokken: (bs || []).filter((b) => b.workout_id === w.id),
    }));
    const html = dagworkoutHtml({
      naam: ontvanger.first_name || "sporter",
      datum,
      workouts,
      voet: "Je krijgt deze mail elke ochtend omdat je 'Workout per e-mail' hebt aangezet op je Profiel in de app. Daar kun je hem ook weer uitzetten.",
    });
    const r = await verstuur(ontvanger.email, afzenderNaam, `Je workout voor vandaag · ${datum}`, html);
    if (r.ok) { await klaar({ status: "sent", sent_at: new Date().toISOString() }); return "sent"; }
    const fout = await r.text().catch(() => String(r.status));
    const pogingen = ((rij.attempts as number) || 0) + 1;
    await klaar({ attempts: pogingen, last_error: fout.slice(0, 500), status: pogingen >= 3 ? "failed" : "pending", send_after: new Date(Date.now() + 10 * 60_000).toISOString() });
    return "fout";
  }

  if (event !== "reactie") { await klaar({ status: "skipped", last_error: "onbekend event" }); return "skipped"; }

  // Gegevens voor de reactie-mail: workout + draad + namen
  const [{ data: workout }, { data: draad }] = await Promise.all([
    db.from("workouts").select("id,title,workout_date").eq("id", payload.workout_id as string).maybeSingle(),
    db.from("workout_comments").select("author_id,body,created_at").eq("workout_id", payload.workout_id as string).eq("athlete_id", payload.athlete_id as string).order("created_at").limit(6),
  ]);
  const auteurIds = [...new Set((draad || []).map((c) => c.author_id))];
  const { data: auteurs } = await db.from("profiles").select("id,first_name,last_name").in("id", auteurIds);
  const naamBij = (aid: string) => naamVan((auteurs || []).find((a) => a.id === aid) || null);

  const laatste = (draad || [])[(draad || []).length - 1];
  const anderNaam = laatste ? naamBij(laatste.author_id) : "Je coach";
  const datum = workout?.workout_date ? datumNL(workout.workout_date) : "vandaag";
  const intro = isLid
    ? `Er is een nieuwe reactie op je workout van ${datum}.`
    : `${anderNaam} heeft een reactie geplaatst op de workout-dag van ${datum}.`;
  const voet = isLid
    ? "Open de app om te reageren. Deze mail staat aan in je meldingsinstellingen."
    : "Open het dashboard om te reageren. Mail-meldingen beheer je onder Instellingen > Notificaties.";

  const html = reactieHtml({
    titel: `${anderNaam} heeft gereageerd`,
    intro,
    draad: (draad || []).slice(-4).map((c) => ({ naam: naamBij(c.author_id), body: c.body, vanMij: c.author_id === ontvanger.id })),
    workoutTitel: workout?.title ? `Workout: ${workout.title} · ${datum}` : `Workout van ${datum}`,
    voet,
  });

  const r = await verstuur(ontvanger.email, afzenderNaam, isLid ? `Nieuwe reactie op je workout van ${datum}` : `${anderNaam} reageerde op een workout-dag`, html);
  if (r.ok) { await klaar({ status: "sent", sent_at: new Date().toISOString() }); return "sent"; }
  const fout = await r.text().catch(() => String(r.status));
  const pogingen = ((rij.attempts as number) || 0) + 1;
  await klaar({ attempts: pogingen, last_error: fout.slice(0, 500), status: pogingen >= 3 ? "failed" : "pending", send_after: new Date(Date.now() + 10 * 60_000).toISOString() });
  return "fout";
}

Deno.serve(async () => {
  if (!RESEND_KEY) return new Response(JSON.stringify({ error: "RESEND_API_KEY ontbreekt" }), { status: 500 });
  const { data: rijen, error } = await db.from("mail_queue").select("*")
    .eq("status", "pending").lte("send_after", new Date().toISOString())
    .order("created_at").limit(25);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const uitkomsten: Record<string, number> = {};
  for (const rij of rijen || []) {
    try {
      const u = await verwerkRij(rij as Record<string, unknown>);
      uitkomsten[u] = (uitkomsten[u] || 0) + 1;
    } catch (e) {
      await db.from("mail_queue").update({ attempts: ((rij.attempts as number) || 0) + 1, last_error: String(e).slice(0, 500), send_after: new Date(Date.now() + 10 * 60_000).toISOString() }).eq("id", rij.id);
      uitkomsten.crash = (uitkomsten.crash || 0) + 1;
    }
  }
  return new Response(JSON.stringify({ verwerkt: (rijen || []).length, uitkomsten }), { headers: { "Content-Type": "application/json" } });
});
