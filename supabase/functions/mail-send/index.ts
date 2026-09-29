// mail-send: verwerkt de mail_queue en verstuurt via Resend.
// Draait elke minuut via pg_cron. Regels:
// - Vinkjes: staf krijgt alleen mail als notify_prefs.mail[event] aan staat
//   (standaard uit); een lid krijgt mail tenzij expliciet uitgezet.
//   Uitzondering: 'dagworkout' is voor iedereen opt-in (vinkje moet aan staan).
// - Werkuren: staat de ontvanger op "alleen tijdens werkuren", dan schuift de
//   mail door naar het eerstvolgende toegestane moment (Europe/Amsterdam).
// - Mislukt versturen: 3 pogingen met 10 min tussenruimte, daarna failed.
// - opzegging (28 sep 2026): bevestiging van opzeggen/intrekken aan het lid, altijd (geen vinkje).
// - Taal (27 sep 2026): elke mail in de taal van de ontvanger (profiles.lang,
//   nl of en). Een uitnodiging volgt de taal van wie uitnodigde (created_by).
// - Dag-link (29 sep 2026): coach-mails over een reactie, afgetekende workout of
//   video krijgen een knop rechtstreeks naar die dag op de klantkalender.
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const AFZENDER_ADRES = "coach@mail.yourprogram.nl";
// Downloadlink voor de app in de uitnodigingsmail. Zolang de app in test is:
// zet de publieke TestFlight-link in de Supabase-secret TESTFLIGHT_URL, dan
// staat hij meteen in de mail. Staat de app straks in de App Store, dan
// APP_STORE_URL vullen (zelfde naam als in app/auth.js van het dashboard).
const APP_STORE_URL = Deno.env.get("APP_STORE_URL") || "";
// Publieke TestFlight-link van de groep "Pilot" (26 juli 2026). Deze link is
// bedoeld om te delen, dus hij mag hier staan. Vervangen door de App Store-link
// zodra de app publiek is: dan APP_STORE_URL vullen, die gaat voor.
const TESTFLIGHT_URL = Deno.env.get("TESTFLIGHT_URL") || "https://testflight.apple.com/join/JqqZHVDp";

type Taal = "nl" | "en";
const taalVan = (l: unknown): Taal => (l === "en" ? "en" : "nl");

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Alle teksten per taal. Nederlands is de bron; Engels Brits, "program".
const TXT = {
  nl: {
    onbekend: "Onbekend", workout: "Workout", vandaag: "vandaag", sporter: "sporter", jeCoach: "je coach", JeCoach: "Je coach",
    gemist: "gemist", rondes: "rondes", reps: "reps", voltooid: "voltooid", nogNietGelogd: "nog niet gelogd",
    coachNotities: "Notities van je coach", warmup: "Warming-up", cooldown: "Cooldown",
    dagKop: "Je workout voor vandaag",
    dagIntro: (naam: string, datum: string) => `Goedemorgen ${naam}, dit staat er vandaag (${datum}) voor je klaar.`,
    dagVoet: "Je krijgt deze mail elke ochtend omdat je 'Workout per e-mail' hebt aangezet op je Profiel in de app. Daar kun je hem ook weer uitzetten.",
    dagOnderwerp: (datum: string) => `Je workout voor vandaag · ${datum}`,
    coachVoet: "Mail-meldingen beheer je in het dashboard onder Instellingen > Notificaties.",
    berichtOnderwerp: (naam: string) => `${naam} heeft je een bericht gestuurd`,
    berichtTitel: (naam: string) => `Nieuw bericht van ${naam}`,
    berichtIntro: "De laatste berichten:",
    berichtVoet: "Antwoorden doe je via Berichten in het dashboard. ",
    workoutOnderwerp: (naam: string) => `${naam} heeft een workout afgetekend`,
    workoutTitel: (naam: string) => `${naam} heeft getraind`,
    workoutVoet: "Bekijk de details in de activiteit-feed van het dashboard. ",
    videoOnderwerp: (naam: string, n: number) => `${naam} heeft ${n === 1 ? "een video" : n + " video's"} geüpload`,
    videoTitel: (naam: string) => `Nieuwe video's van ${naam}`,
    videoIntro: (titel: string, datum: string, n: number) => `Bij ${titel} van ${datum} ${n === 1 ? "staat nu een video" : "staan nu " + n + " video's"}.`,
    deWorkout: "de workout",
    videoVoet: "Bekijk en beoordeel ze in de activiteit-feed van het dashboard. ",
    fotoOnderwerp: (naam: string) => `${naam} heeft voortgangsfoto's geüpload`,
    fotoTitel: (naam: string) => `Nieuwe voortgangsfoto's van ${naam}`,
    fotoIntro: (n: number, datum: string) => `Er ${n === 1 ? "staat 1 nieuwe foto" : "staan " + n + " nieuwe foto's"} klaar (datum ${datum}).`,
    fotoVoet: "Bekijk ze via het klantprofiel > Voortgangsfoto's. ",
    reactieIntroLid: (datum: string) => `Er is een nieuwe reactie op je workout van ${datum}.`,
    reactieIntroCoach: (naam: string, datum: string) => `${naam} heeft een reactie geplaatst op de workout-dag van ${datum}.`,
    reactieVoetLid: "Open de app om te reageren. Deze mail staat aan in je meldingsinstellingen.",
    reactieVoetCoach: "Open het dashboard om te reageren. Mail-meldingen beheer je onder Instellingen > Notificaties.",
    knopDag: "Bekijk de sessie in het dashboard",
    knopReactie: "Bekijk en reageer in het dashboard",
    reactieTitel: (naam: string) => `${naam} heeft gereageerd`,
    reactieWorkout: (titel: string | null, datum: string) => titel ? `Workout: ${titel} · ${datum}` : `Workout van ${datum}`,
    reactieOnderwerpLid: (datum: string) => `Nieuwe reactie op je workout van ${datum}`,
    reactieOnderwerpCoach: (naam: string) => `${naam} reageerde op een workout-dag`,
    // uitnodiging
    invOnderwerpLid: (bedrijf: string) => `Je account bij ${bedrijf} staat klaar`,
    invOnderwerpCoach: (bedrijf: string) => `Je coach-account bij ${bedrijf} staat klaar`,
    invWelkom: (voornaam: string) => `Welkom${voornaam ? " " + voornaam : ""}!`,
    invIntro: (bedrijf: string) => `${bedrijf} heeft een account voor je klaargezet. In drie stappen ben je binnen.`,
    invAppStore: (a: string) => `Zoek <b style="color:#e6e6ea">YourProgram</b> in de App Store, of gebruik <a href="${APP_STORE_URL}" style="color:${a}">deze link</a>.`,
    invTestflight: (a: string) => `De app is nog in test en loopt via TestFlight van Apple. Installeer eerst <b style="color:#e6e6ea">TestFlight</b> uit de App Store en open daarna <a href="${TESTFLIGHT_URL}" style="color:${a}">deze link</a> op je telefoon.`,
    invGeenApp: "De app staat nog niet in de App Store. Je coach stuurt je de downloadlink, dat gaat via TestFlight van Apple.",
    invStap1Kop: "Kies je wachtwoord",
    invStap1: (naar: string) => `Klik op de knop hieronder en kies een wachtwoord. Gebruik het e-mailadres waarop je deze mail kreeg: <b style="color:#e6e6ea">${naar}</b>.`,
    invStap2LidKop: "Zet de app op je telefoon",
    invStap3LidKop: "Log in en je bent binnen",
    invStap3Lid: "Inloggen doe je met hetzelfde e-mailadres en je nieuwe wachtwoord. Je programma staat dan al voor je klaar.",
    invStap2CoachKop: "Log in op het dashboard",
    invStap2Coach: (a: string) => `Je werkt op de computer, op <a href="https://app.yourprogram.nl" style="color:${a}">app.yourprogram.nl</a>. Daar staan je klanten, je programmering en je berichten.`,
    invStap3CoachKop: "Lees je even in",
    invStap3Coach: "Rechtsboven zit een vraagteken met de handleiding: per onderdeel een schermafbeelding met uitleg. Begin bij Dashboard en Klant-scherm.",
    invWatKanJe: "In de app zie je elke dag je training, vul je je scores in en chat je met je coach.",
    invKnop: "Wachtwoord kiezen",
    invVast: "Loopt het ergens vast?",
    invV1: "Knop doet niks?", invA1: "Kopieer deze link naar je browser:",
    invV2: "Wachtwoord kwijt?", invA2: "Kies bij het inloggen \"Wachtwoord vergeten\", dan krijg je een nieuwe link.",
    invV3: "Verkeerd e-mailadres?", invA3Lid: "Laat het je coach weten, dan krijg je een nieuwe uitnodiging.", invA3Coach: "Laat het weten aan wie je uitnodigde, dan krijg je een nieuwe uitnodiging.",
    invV4: "Nog vragen?", invA4Lid: "Stuur je coach een berichtje, dan komt het goed.", invA4Coach: "Stel ze aan wie je uitnodigde, of stuur een bericht via het dashboard.",
    invGeldig: "Deze uitnodiging is 14 dagen geldig.",
  },
  en: {
    onbekend: "Unknown", workout: "Workout", vandaag: "today", sporter: "athlete", jeCoach: "your coach", JeCoach: "Your coach",
    gemist: "missed", rondes: "rounds", reps: "reps", voltooid: "completed", nogNietGelogd: "not logged yet",
    coachNotities: "Notes from your coach", warmup: "Warm-up", cooldown: "Cool-down",
    dagKop: "Your workout for today",
    dagIntro: (naam: string, datum: string) => `Good morning ${naam}, here's what's ready for you today (${datum}).`,
    dagVoet: "You get this email every morning because you switched on 'Workout by email' on your Profile in the app. You can switch it off there too.",
    dagOnderwerp: (datum: string) => `Your workout for today · ${datum}`,
    coachVoet: "Manage email notifications in the dashboard under Settings > Notifications.",
    berichtOnderwerp: (naam: string) => `${naam} sent you a message`,
    berichtTitel: (naam: string) => `New message from ${naam}`,
    berichtIntro: "The latest messages:",
    berichtVoet: "Reply via Messages in the dashboard. ",
    workoutOnderwerp: (naam: string) => `${naam} completed a workout`,
    workoutTitel: (naam: string) => `${naam} has trained`,
    workoutVoet: "See the details in the activity feed of the dashboard. ",
    videoOnderwerp: (naam: string, n: number) => `${naam} uploaded ${n === 1 ? "a video" : n + " videos"}`,
    videoTitel: (naam: string) => `New videos from ${naam}`,
    videoIntro: (titel: string, datum: string, n: number) => `${titel} from ${datum} now has ${n === 1 ? "a video" : n + " videos"}.`,
    deWorkout: "the workout",
    videoVoet: "Watch and review them in the activity feed of the dashboard. ",
    fotoOnderwerp: (naam: string) => `${naam} uploaded progress photos`,
    fotoTitel: (naam: string) => `New progress photos from ${naam}`,
    fotoIntro: (n: number, datum: string) => `There ${n === 1 ? "is 1 new photo" : "are " + n + " new photos"} (date ${datum}).`,
    fotoVoet: "View them via the client profile > Progress photos. ",
    reactieIntroLid: (datum: string) => `There's a new comment on your workout of ${datum}.`,
    reactieIntroCoach: (naam: string, datum: string) => `${naam} commented on the workout day of ${datum}.`,
    reactieVoetLid: "Open the app to reply. This email is switched on in your notification settings.",
    reactieVoetCoach: "Open the dashboard to reply. Manage email notifications under Settings > Notifications.",
    knopDag: "Open the session in the dashboard",
    knopReactie: "View and reply in the dashboard",
    reactieTitel: (naam: string) => `${naam} replied`,
    reactieWorkout: (titel: string | null, datum: string) => titel ? `Workout: ${titel} · ${datum}` : `Workout of ${datum}`,
    reactieOnderwerpLid: (datum: string) => `New comment on your workout of ${datum}`,
    reactieOnderwerpCoach: (naam: string) => `${naam} commented on a workout day`,
    invOnderwerpLid: (bedrijf: string) => `Your account at ${bedrijf} is ready`,
    invOnderwerpCoach: (bedrijf: string) => `Your coach account at ${bedrijf} is ready`,
    invWelkom: (voornaam: string) => `Welcome${voornaam ? " " + voornaam : ""}!`,
    invIntro: (bedrijf: string) => `${bedrijf} has set up an account for you. Three steps and you're in.`,
    invAppStore: (a: string) => `Search for <b style="color:#e6e6ea">YourProgram</b> in the App Store, or use <a href="${APP_STORE_URL}" style="color:${a}">this link</a>.`,
    invTestflight: (a: string) => `The app is still in testing and runs through Apple's TestFlight. First install <b style="color:#e6e6ea">TestFlight</b> from the App Store, then open <a href="${TESTFLIGHT_URL}" style="color:${a}">this link</a> on your phone.`,
    invGeenApp: "The app isn't in the App Store yet. Your coach will send you the download link, via Apple's TestFlight.",
    invStap1Kop: "Choose your password",
    invStap1: (naar: string) => `Click the button below and choose a password. Use the email address this message was sent to: <b style="color:#e6e6ea">${naar}</b>.`,
    invStap2LidKop: "Get the app on your phone",
    invStap3LidKop: "Log in and you're in",
    invStap3Lid: "Log in with the same email address and your new password. Your program will be waiting for you.",
    invStap2CoachKop: "Log in to the dashboard",
    invStap2Coach: (a: string) => `You work on your computer at <a href="https://app.yourprogram.nl" style="color:${a}">app.yourprogram.nl</a>. That's where your clients, programming and messages live.`,
    invStap3CoachKop: "Have a quick read",
    invStap3Coach: "Top right there's a question mark with the manual: a screenshot with explanation for every section. Start with Dashboard and Client screen.",
    invWatKanJe: "In the app you see your training every day, enter your scores and chat with your coach.",
    invKnop: "Choose password",
    invVast: "Stuck somewhere?",
    invV1: "Button not working?", invA1: "Copy this link into your browser:",
    invV2: "Lost your password?", invA2: "Choose \"Forgot password\" when logging in and you'll get a new link.",
    invV3: "Wrong email address?", invA3Lid: "Let your coach know and you'll get a new invitation.", invA3Coach: "Let the person who invited you know and you'll get a new invitation.",
    invV4: "Any questions?", invA4Lid: "Send your coach a message and it'll be sorted.", invA4Coach: "Ask the person who invited you, or send a message via the dashboard.",
    invGeldig: "This invitation is valid for 14 days.",
  },
};
type Teksten = typeof TXT.nl;
const T = (taal: Taal): Teksten => (taal === "en" ? (TXT.en as unknown as Teksten) : TXT.nl);

function naamVan(p: { first_name?: string; last_name?: string } | null, taal: Taal = "nl"): string {
  if (!p) return T(taal).onbekend;
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || T(taal).onbekend;
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

function datumTxt(iso: string, taal: Taal): string {
  try {
    return new Intl.DateTimeFormat(taal === "en" ? "en-GB" : "nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso + "T12:00:00"));
  } catch {
    return iso;
  }
}

const KADER_OPEN = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:26px;background:#0E0E10;color:#f4f4f5;border-radius:14px">`;

// Merkkleur uit het bedrijfsthema (Instellingen > Thema); anders FORGE-goud.
const accentVan = (theme: unknown): string => {
  const kleur = (theme as { color?: string } | null)?.color || "";
  return /^#[0-9a-fA-F]{6}$/.test(kleur) ? kleur : "#D9B44A";
};

// Knop met directe link (bijv. naar de dag op de klantkalender); niets als er geen link is.
type Knop = { url: string; tekst: string } | null | undefined;
const knopHtml = (k: Knop, accent: string): string => k
  ? `<div style="margin:16px 0 0"><a href="${k.url}" style="display:inline-block;background:${accent};color:#0E0E10;font-weight:700;padding:11px 20px;border-radius:10px;text-decoration:none;font-size:14px">${esc(k.tekst)}</a></div>`
  : "";

function reactieHtml(opts: { titel: string; intro: string; draad: { naam: string; body: string; vanMij: boolean }[]; workoutTitel: string; voet: string; accent: string; knop?: Knop }): string {
  const accent = opts.accent;
  const bubbels = opts.draad.map((c) =>
    `<div style="margin:6px 0;padding:10px 12px;border-radius:10px;background:${c.vanMij ? "#26221a" : "#1d1d21"};border:1px solid #2c2c31">` +
    `<div style="font-size:12px;color:${accent};margin-bottom:3px">${esc(c.naam)}</div>` +
    `<div style="font-size:14px;line-height:1.45;color:#f4f4f5;white-space:pre-wrap">${esc(c.body)}</div></div>`).join("");
  return KADER_OPEN +
    `<h2 style="color:${accent};margin:0 0 6px;font-size:20px">${esc(opts.titel)}</h2>` +
    `<p style="margin:0 0 14px;line-height:1.5;color:#c9c9ce">${esc(opts.intro)}</p>` +
    `<div style="font-size:13px;color:#8a919c;margin-bottom:4px">${esc(opts.workoutTitel)}</div>` +
    bubbels +
    knopHtml(opts.knop, accent) +
    `<p style="margin:18px 0 0;color:#8a919c;font-size:12px;line-height:1.5">${esc(opts.voet)}</p></div>`;
}

type Blok = { label: string | null; exercise: string | null; prescription: string | null; notes: string | null };
type WorkoutMail = { title: string | null; coach_notes: string | null; warmup: string | null; cooldown: string | null; blokken: Blok[] };

function dagworkoutHtml(opts: { naam: string; datum: string; workouts: WorkoutMail[]; voet: string; accent: string; taal: Taal }): string {
  const accent = opts.accent, t = T(opts.taal);
  const sectie = (kop: string, tekst: string | null) => tekst
    ? `<div style="margin:8px 0"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a919c;margin-bottom:2px">${esc(kop)}</div><div style="font-size:13.5px;line-height:1.5;color:#e6e6ea;white-space:pre-wrap">${esc(tekst)}</div></div>`
    : "";
  const kaarten = opts.workouts.map((w) => {
    const blokken = w.blokken.map((b) => {
      const kop = [b.label, b.exercise].filter(Boolean).join(" · ");
      const regels = [b.prescription, b.notes].filter(Boolean).join("\n");
      return `<div style="margin:8px 0;padding:9px 11px;border-left:3px solid ${accent};background:#1a1a1e;border-radius:0 8px 8px 0">` +
        (kop ? `<div style="font-size:13.5px;font-weight:600;color:#f4f4f5;margin-bottom:2px">${esc(kop)}</div>` : "") +
        (regels ? `<div style="font-size:13px;line-height:1.5;color:#c9c9ce;white-space:pre-wrap">${esc(regels)}</div>` : "") +
        `</div>`;
    }).join("");
    return `<div style="margin:14px 0;padding:14px 16px;background:#141417;border:1px solid #26262b;border-radius:12px">` +
      `<div style="font-size:16px;font-weight:700;color:${accent};margin-bottom:6px">${esc(w.title || t.workout)}</div>` +
      sectie(t.coachNotities, w.coach_notes) +
      sectie(t.warmup, w.warmup) +
      blokken +
      sectie(t.cooldown, w.cooldown) +
      `</div>`;
  }).join("");
  return KADER_OPEN +
    `<h2 style="color:${accent};margin:0 0 6px;font-size:20px">${esc(t.dagKop)}</h2>` +
    `<p style="margin:0 0 6px;line-height:1.5;color:#c9c9ce">${esc(t.dagIntro(opts.naam, opts.datum))}</p>` +
    kaarten +
    `<p style="margin:18px 0 0;color:#8a919c;font-size:12px;line-height:1.5">${esc(opts.voet)}</p></div>`;
}

// Compacte weergave van een gelogde score (zelfde volgorde als de apps)
function scoreTxt(r: { score_text?: string | null; time_seconds?: number | null; load_kg?: number | null; reps?: number | null; rounds?: number | null; status?: string; capped?: boolean | null } | null, taal: Taal): string {
  const t = T(taal);
  if (!r) return "";
  if (r.status === "missed") return t.gemist;
  if (r.score_text) return r.score_text;
  const cap = r.capped ? "CAP · " : "";
  if (!r.capped && r.time_seconds != null) { const m = Math.floor(r.time_seconds / 60), s = r.time_seconds % 60; return `${m}:${String(s).padStart(2, "0")}`; }
  if (r.load_kg != null) return `${cap}${r.load_kg} kg`;
  if (r.rounds != null) return `${cap}${r.rounds} ${t.rondes}${r.reps != null ? " + " + r.reps : ""}`;
  if (r.reps != null) return `${cap}${r.reps} ${t.reps}`;
  return t.voltooid;
}

// Eenvoudige mail: titel + intro + losse regels (voor bericht/workout/video/foto)
function simpelHtml(opts: { titel: string; intro: string; regels: string[]; voet: string; accent: string; knop?: Knop }): string {
  const accent = opts.accent;
  const rijen = opts.regels.map((r) =>
    `<div style="margin:6px 0;padding:9px 11px;border-left:3px solid ${accent};background:#1a1a1e;border-radius:0 8px 8px 0;font-size:13.5px;line-height:1.5;color:#e6e6ea;white-space:pre-wrap">${r}</div>`).join("");
  return KADER_OPEN +
    `<h2 style="color:${accent};margin:0 0 6px;font-size:20px">${esc(opts.titel)}</h2>` +
    `<p style="margin:0 0 12px;line-height:1.5;color:#c9c9ce">${esc(opts.intro)}</p>` +
    rijen +
    knopHtml(opts.knop, accent) +
    `<p style="margin:18px 0 0;color:#8a919c;font-size:12px;line-height:1.5">${esc(opts.voet)}</p></div>`;
}

// ---- inviteHtml begin (het voorbeeld-script leest deze functie uit het bestand) ----
// Uitnodigingsmail. De drempel zit niet in de app maar ervóór: wachtwoord
// kiezen, app installeren, inloggen. Daarom drie genummerde stappen en onderaan
// de vragen die mensen echt stellen (mail niet gezien, knop doet niks,
// wachtwoord kwijt).
function inviteHtml(o: { bedrijfsNaam: string; voornaam: string; naar: string; link: string; accent: string; isLid: boolean; logoUrl?: string | null; taal: Taal }): string {
  const a = o.accent, t = T(o.taal);
  // Kopregel: het bedrijfslogo als het in Instellingen > Thema staat, anders de
  // bedrijfsnaam. Zo werkt het ook voor een ander bedrijf dan YourProgram, en
  // blijft de mail leesbaar als de ontvanger afbeeldingen blokkeert.
  const kop = o.logoUrl
    ? `<img src="${o.logoUrl}" alt="${esc(o.bedrijfsNaam)}" height="26" style="height:26px;display:block;margin-bottom:16px">`
    : `<div style="font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#8a919c;margin-bottom:14px">${esc(o.bedrijfsNaam)}</div>`;
  const stap = (n: number, kop: string, tekst: string) =>
    `<div style="margin:10px 0;padding:13px 15px;background:#141417;border:1px solid #26262b;border-radius:12px">` +
    `<div style="font-size:14px;font-weight:700;color:#f4f4f5">` +
    `<span style="display:inline-block;width:21px;height:21px;border-radius:50%;background:${a};color:#0E0E10;text-align:center;line-height:21px;font-size:12px;font-weight:800;margin-right:9px">${n}</span>${esc(kop)}</div>` +
    `<div style="font-size:13px;line-height:1.6;color:#c9c9ce;margin:7px 0 0 30px">${tekst}</div></div>`;
  const appTekst = APP_STORE_URL ? t.invAppStore(a) : (TESTFLIGHT_URL ? t.invTestflight(a) : t.invGeenApp);
  const stappen = o.isLid
    ? stap(1, t.invStap1Kop, t.invStap1(esc(o.naar))) +
      stap(2, t.invStap2LidKop, appTekst) +
      stap(3, t.invStap3LidKop, t.invStap3Lid)
    : stap(1, t.invStap1Kop, t.invStap1(esc(o.naar))) +
      stap(2, t.invStap2CoachKop, t.invStap2Coach(a)) +
      stap(3, t.invStap3CoachKop, t.invStap3Coach);
  const watKanJe = o.isLid
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#c9c9ce">${t.invWatKanJe}</p>`
    : "";
  const vraag = (v: string, antw: string) =>
    `<div style="margin:7px 0"><span style="color:#e6e6ea;font-weight:600">${esc(v)}</span> <span style="color:#8a919c">${antw}</span></div>`;
  return KADER_OPEN + kop +
    `<h2 style="color:${a};margin:0 0 8px;font-size:20px">${esc(t.invWelkom(o.voornaam))}</h2>` +
    `<p style="margin:0 0 14px;line-height:1.6;color:#c9c9ce">${esc(t.invIntro(o.bedrijfsNaam))}</p>` +
    stappen +
    `<div style="margin:18px 0 0"><a href="${o.link}" style="display:inline-block;background:${a};color:#0E0E10;font-weight:700;padding:13px 24px;border-radius:10px;text-decoration:none">${esc(t.invKnop)}</a></div>` +
    watKanJe +
    `<div style="margin:20px 0 0;padding-top:14px;border-top:1px solid #26262b;font-size:12.5px;line-height:1.55">` +
    `<div style="color:#e6e6ea;font-weight:700;margin-bottom:6px">${esc(t.invVast)}</div>` +
    vraag(t.invV1, `${esc(t.invA1)}<br><span style="color:#6f747c">${esc(o.link)}</span>`) +
    vraag(t.invV2, esc(t.invA2)) +
    vraag(t.invV3, esc(o.isLid ? t.invA3Lid : t.invA3Coach)) +
    vraag(t.invV4, esc(o.isLid ? t.invA4Lid : t.invA4Coach)) +
    `<div style="margin:12px 0 0;color:#6f747c">${esc(t.invGeldig)}</div></div></div>`;
}
// ---- inviteHtml einde ----

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

  // Uitnodigingsmail: de ontvanger heeft nog geen profiel, dus geen vinkjes of
  // werkuren; gaat rechtstreeks naar het e-mailadres uit de uitnodiging.
  // Taal: die van wie uitnodigde (created_by), tenzij de payload een taal geeft.
  if (event === "invite") {
    const naar = rij.recipient_email as string;
    if (!naar) { await klaar({ status: "skipped", last_error: "geen e-mailadres" }); return "skipped"; }
    const { data: bedrijfI } = await db.from("companies").select("name,theme,logo_url").eq("id", rij.company_id).maybeSingle();
    const accent = accentVan(bedrijfI?.theme);
    const link = `https://app.yourprogram.nl/?invite=${payload.token}`;
    const voornaam = (payload.first_name as string) || "";
    const { data: invRij } = await db.from("invites").select("role,created_by").eq("token", payload.token as string).maybeSingle();
    const isLidInvite = !invRij || invRij.role === "lid";
    let taal: Taal = taalVan(payload.lang);
    if (payload.lang == null && invRij?.created_by) {
      const { data: maker } = await db.from("profiles").select("lang").eq("id", invRij.created_by).maybeSingle();
      taal = taalVan(maker?.lang);
    }
    const t = T(taal);
    const bedrijfsNaam = bedrijfI?.name || t.jeCoach;
    const html = inviteHtml({ bedrijfsNaam, voornaam, naar, link, accent, isLid: isLidInvite, logoUrl: bedrijfI?.logo_url || null, taal });
    const r = await verstuur(naar, bedrijfsNaam, isLidInvite ? t.invOnderwerpLid(bedrijfsNaam) : t.invOnderwerpCoach(bedrijfsNaam), html);
    if (r.ok) { await klaar({ status: "sent", sent_at: new Date().toISOString() }); return "sent"; }
    const foutI = await r.text().catch(() => String(r.status));
    const pogingenI = ((rij.attempts as number) || 0) + 1;
    await klaar({ attempts: pogingenI, last_error: foutI.slice(0, 500), status: pogingenI >= 3 ? "failed" : "pending", send_after: new Date(Date.now() + 10 * 60_000).toISOString() });
    return "fout";
  }

  // Bevestiging van opzeggen, intrekken of herroepen aan het lid. Altijd versturen, los van
  // meldingsvinkjes: dit is de schriftelijke bevestiging die daarbij hoort.
  if (event === "opzegging") {
    const naar = rij.recipient_email as string;
    if (!naar) { await klaar({ status: "skipped", last_error: "geen e-mailadres" }); return "skipped"; }
    const { data: o } = await db.from("shop_orders").select("cancel_at,withdrawn_at,blog_program_id,company_id,profile_id").eq("id", payload.order_id as string).maybeSingle();
    if (!o) { await klaar({ status: "skipped", last_error: "bestelling niet gevonden" }); return "skipped"; }
    const soort = ["ingetrokken", "herroepen"].includes(payload.soort as string) ? payload.soort as string : "opgezegd";
    // Intussen herroepen? Dan vervangt de herroepingsmail alle eerdere.
    if (soort !== "herroepen" && o.withdrawn_at) { await klaar({ status: "skipped", last_error: "intussen herroepen" }); return "skipped"; }
    // Intussen alweer ingetrokken (of juist opnieuw opgezegd)? Dan klopt deze mail niet meer.
    // (db_ok false: het vastleggen bij ons mislukte; dan geldt de datum uit de mail zelf.)
    if (soort === "opgezegd" && !o.cancel_at && payload.db_ok !== false) { await klaar({ status: "skipped", last_error: "opzegging intussen ingetrokken" }); return "skipped"; }
    if (soort === "ingetrokken" && o.cancel_at) { await klaar({ status: "skipped", last_error: "intussen opnieuw opgezegd" }); return "skipped"; }
    const [{ data: prof }, { data: prog }, { data: bedrijfO }] = await Promise.all([
      o.profile_id ? db.from("profiles").select("first_name,lang").eq("id", o.profile_id).maybeSingle() : Promise.resolve({ data: null }),
      o.blog_program_id ? db.from("blog_programs").select("name").eq("id", o.blog_program_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from("companies").select("name,theme").eq("id", o.company_id).maybeSingle(),
    ]);
    const taalO: Taal = taalVan(prof?.lang);
    const en = taalO === "en";
    const programma = prog?.name || (en ? "your program" : "je programma");
    const naam = prof?.first_name || "";
    const hoi = en ? `Hi${naam ? " " + naam : ""}` : `Hoi${naam ? " " + naam : ""}`;
    const dat = (iso: unknown, metTijd = false) => iso ? new Date(String(iso)).toLocaleString(en ? "en-GB" : "nl-NL", {
      day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam", ...(metTijd ? { hour: "2-digit", minute: "2-digit" } : {}),
    }) : "";
    const datum = dat(o.cancel_at || payload.stopt_op);
    const laatste = dat(payload.laatste_betaling);
    const accentO = accentVan(bedrijfO?.theme);
    const afzender = bedrijfO?.name || "YourProgram";
    let onderwerp: string, html: string;
    if (soort === "opgezegd") {
      onderwerp = en ? `Cancellation confirmed: ${programma}` : `Bevestiging opzegging ${programma}`;
      html = simpelHtml({
        titel: en ? "We've received your cancellation" : "Je opzegging is ontvangen",
        intro: en ? `${hoi}, you've cancelled your subscription to ${programma}.` : `${hoi}, je hebt je abonnement op ${programma} opgezegd.`,
        regels: (en ? [
          `Your subscription ends on ${datum}. Until then you can keep training as usual.`,
          laatste
            ? `The notice period is one month. On ${laatste} we'll charge you one last time, only for the days up to ${datum}. After that nothing more is charged.`
            : `The notice period is one month. After ${datum} nothing more is charged.`,
          "Changed your mind? Withdraw your cancellation in the app: Profile > My subscription.",
          ...(payload.herroepbaar_tot && new Date(String(payload.herroepbaar_tot)) > new Date()
            ? [`You're still within your cooling-off period. Until ${dat(payload.herroepbaar_tot)} you can also withdraw in the app (Profile > My subscription): it ends right away and you get the unused part back.`] : []),
        ] : [
          `Je abonnement stopt op ${datum}. Tot die dag kun je gewoon trainen.`,
          laatste
            ? `De opzegtermijn is één maand. Op ${laatste} schrijven we nog één keer af, alleen voor de dagen tot en met ${datum}. Daarna schrijven we niets meer af.`
            : `De opzegtermijn is één maand. Na ${datum} schrijven we niets meer af.`,
          "Toch door? Trek je opzegging in via de app: Profiel > Mijn abonnement.",
          ...(payload.herroepbaar_tot && new Date(String(payload.herroepbaar_tot)) > new Date()
            ? [`Je zit nog in je bedenktijd. Tot en met ${dat(payload.herroepbaar_tot)} kun je ook herroepen in de app (Profiel > Mijn abonnement): dan stopt het meteen en krijg je het ongebruikte deel terug.`] : []),
        ]).map(esc),
        voet: en ? "This email is your confirmation of the cancellation. Please keep it." : "Deze mail is de bevestiging van je opzegging. Bewaar hem goed.",
        accent: accentO,
      });
    } else if (soort === "herroepen") {
      const terug = Number(payload.terug_cents || 0);
      const bedrag = "€" + (terug / 100).toFixed(2).replace(".", ",");
      onderwerp = en ? `Withdrawal confirmed: ${programma}` : `Bevestiging herroeping ${programma}`;
      html = simpelHtml({
        titel: en ? "We've received your withdrawal" : "Je herroeping is ontvangen",
        intro: en ? `${hoi}, you've withdrawn from your subscription to ${programma} within the 14-day cooling-off period.` : `${hoi}, je hebt je abonnement op ${programma} herroepen binnen de bedenktijd van 14 dagen.`,
        regels: (en ? [
          `Received on ${dat(payload.ontvangen_op, true)}. Your subscription has ended right away.`,
          terug > 0 ? `You'll get the unused part of your first payment back (${bedrag}) within 14 days, via the same payment method.` : "Nothing was charged, so there's nothing to refund.",
        ] : [
          `Ontvangen op ${dat(payload.ontvangen_op, true)}. Je abonnement is direct gestopt.`,
          terug > 0 ? `Je krijgt het ongebruikte deel van je eerste betaling (${bedrag}) binnen 14 dagen terug, via dezelfde betaalmethode.` : "Er is niets afgeschreven, dus er hoeft niets terug.",
        ]).map(esc),
        voet: en ? "This email is your confirmation of the withdrawal. Please keep it." : "Deze mail is de bevestiging van je herroeping. Bewaar hem goed.",
        accent: accentO,
      });
    } else {
      onderwerp = en ? `Your subscription to ${programma} continues` : `Je abonnement op ${programma} loopt door`;
      html = simpelHtml({
        titel: en ? "Your subscription continues" : "Je abonnement loopt door",
        intro: en ? `${hoi}, you've withdrawn your cancellation of ${programma}.` : `${hoi}, je hebt je opzegging van ${programma} ingetrokken.`,
        regels: [esc(en ? "Your subscription simply continues and the monthly payments carry on as before your cancellation." : "Je abonnement loopt gewoon door en de maandelijkse betalingen gaan verder zoals voor je opzegging."),
          ...(payload.inhaal ? [esc(en ? "You were already in your last, shortened period. It becomes a full month again; the difference is added to your next payment." : "Je zat al in je laatste, ingekorte periode. Die wordt weer een volle maand; het verschil komt bij je volgende betaling.")] : [])],
        voet: en ? "You can cancel at any time in the app: Profile > My subscription." : "Opzeggen kan altijd in de app: Profiel > Mijn abonnement.",
        accent: accentO,
      });
    }
    const rO = await verstuur(naar, afzender, onderwerp, html);
    if (rO.ok) { await klaar({ status: "sent", sent_at: new Date().toISOString() }); return "sent"; }
    const foutO = await rO.text().catch(() => String(rO.status));
    const pogingenO = ((rij.attempts as number) || 0) + 1;
    await klaar({ attempts: pogingenO, last_error: foutO.slice(0, 500), status: pogingenO >= 3 ? "failed" : "pending", send_after: new Date(Date.now() + 10 * 60_000).toISOString() });
    return "fout";
  }

  // Melding van een coach over de app zelf (bug, idee of vraag). Gaat naar een
  // vast adres van ons, dus altijd Nederlands; geen profiel, vinkjes of werkuren.
  if (event === "melding") {
    const naar = rij.recipient_email as string;
    if (!naar) { await klaar({ status: "skipped", last_error: "geen e-mailadres" }); return "skipped"; }
    const { data: m } = await db.from("app_meldingen").select("*").eq("id", payload.melding_id as string).maybeSingle();
    if (!m) { await klaar({ status: "skipped", last_error: "melding niet meer gevonden" }); return "skipped"; }
    const [{ data: melder }, { data: bedrijfM }] = await Promise.all([
      db.from("profiles").select("first_name,last_name,email,role").eq("id", m.profile_id).maybeSingle(),
      db.from("companies").select("name").eq("id", m.company_id).maybeSingle(),
    ]);
    const soortLabel: Record<string, string> = { bug: "Er gaat iets mis", idee: "Idee of verbetering", vraag: "Vraag" };
    const ctx = (m.context || {}) as Record<string, unknown>;
    const html = simpelHtml({
      titel: m.onderwerp as string,
      intro: `${soortLabel[m.soort as string] || "Melding"} van ${naamVan(melder)}${bedrijfM?.name ? " (" + bedrijfM.name + ")" : ""}.`,
      regels: [
        esc(m.bericht),
        esc(`Scherm: ${m.pagina || "onbekend"}\nRol: ${melder?.role || "onbekend"}\nE-mail: ${melder?.email || "onbekend"}` +
          (ctx.browser ? `\nBrowser: ${ctx.browser}` : "") + (ctx.scherm ? `\nSchermbreedte: ${ctx.scherm}` : "")),
      ],
      voet: "Je vindt deze melding ook in het dashboard onder het vraagteken > Meldingen, waar je hem op afgehandeld kunt zetten.",
      accent: "#D9B44A",
    });
    const rM = await verstuur(naar, "YourProgram meldingen", `[${m.soort}] ${m.onderwerp}`, html);
    if (rM.ok) { await klaar({ status: "sent", sent_at: new Date().toISOString() }); return "sent"; }
    const foutM = await rM.text().catch(() => String(rM.status));
    const pogingenM = ((rij.attempts as number) || 0) + 1;
    await klaar({ attempts: pogingenM, last_error: foutM.slice(0, 500), status: pogingenM >= 3 ? "failed" : "pending", send_after: new Date(Date.now() + 10 * 60_000).toISOString() });
    return "fout";
  }

  const { data: ontvanger } = await db.from("profiles").select("id,first_name,last_name,email,role,notify_prefs,company_id,lang").eq("id", rij.recipient_id).single();
  if (!ontvanger || !ontvanger.email) { await klaar({ status: "skipped", last_error: "geen ontvanger/e-mail" }); return "skipped"; }
  const taal = taalVan(ontvanger.lang);
  const t = T(taal);

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

  const { data: bedrijf } = await db.from("companies").select("name,theme").eq("id", ontvanger.company_id).maybeSingle();
  const afzenderNaam = bedrijf?.name || "CoachApp";
  const accent = accentVan(bedrijf?.theme);

  if (event === "dagworkout") {
    const ids = (payload.workout_ids || []) as string[];
    const datum = datumTxt(String(payload.datum || ""), taal);
    const { data: ws } = await db.from("workouts").select("id,title,coach_notes,warmup,cooldown").in("id", ids);
    if (!ws || !ws.length) { await klaar({ status: "skipped", last_error: "workout(s) niet meer gevonden" }); return "skipped"; }
    const { data: bs } = await db.from("blocks").select("workout_id,sort,label,exercise,prescription,notes").in("workout_id", ids).order("sort");
    const workouts: WorkoutMail[] = ws.map((w) => ({
      title: w.title, coach_notes: w.coach_notes, warmup: w.warmup, cooldown: w.cooldown,
      blokken: (bs || []).filter((b) => b.workout_id === w.id),
    }));
    const html = dagworkoutHtml({ naam: ontvanger.first_name || t.sporter, datum, workouts, voet: t.dagVoet, accent, taal });
    const r = await verstuur(ontvanger.email, afzenderNaam, t.dagOnderwerp(datum), html);
    if (r.ok) { await klaar({ status: "sent", sent_at: new Date().toISOString() }); return "sent"; }
    const fout = await r.text().catch(() => String(r.status));
    const pogingen = ((rij.attempts as number) || 0) + 1;
    await klaar({ attempts: pogingen, last_error: fout.slice(0, 500), status: pogingen >= 3 ? "failed" : "pending", send_after: new Date(Date.now() + 10 * 60_000).toISOString() });
    return "fout";
  }

  const coachVoet = t.coachVoet;
  // Directe link naar die dag op de klantkalender (feedbackronde 4 coach, 29 sep):
  // #klant/<id>/dag/<datum>[/reacties/<workout-id>] opent de dag, evt. met het reactiepaneel erbij.
  const dagLink = (aid: string, datum: string | null | undefined, reactiesWid: string | null, tekst: string): Knop =>
    datum ? { url: `https://app.yourprogram.nl/#klant/${aid}/dag/${datum}${reactiesWid ? "/reacties/" + reactiesWid : ""}`, tekst } : null;
  const klantNaam = async (aid: string) => {
    const { data } = await db.from("profiles").select("first_name,last_name").eq("id", aid).maybeSingle();
    return naamVan(data || null, taal);
  };
  const stuurEnBoek = async (onderwerp: string, html: string): Promise<string> => {
    const r = await verstuur(ontvanger.email, afzenderNaam, onderwerp, html);
    if (r.ok) { await klaar({ status: "sent", sent_at: new Date().toISOString() }); return "sent"; }
    const fout = await r.text().catch(() => String(r.status));
    const pogingen = ((rij.attempts as number) || 0) + 1;
    await klaar({ attempts: pogingen, last_error: fout.slice(0, 500), status: pogingen >= 3 ? "failed" : "pending", send_after: new Date(Date.now() + 10 * 60_000).toISOString() });
    return "fout";
  };

  // Klant stuurde chatberichten (mail naar de coach, laatste berichten erbij)
  if (event === "bericht") {
    const aid = payload.athlete_id as string;
    const naam = await klantNaam(aid);
    const { data: ms } = await db.from("messages").select("body,created_at").eq("athlete_id", aid).eq("sender_id", aid).order("created_at", { ascending: false }).limit(4);
    const regels = (ms || []).reverse().map((m) => esc(m.body));
    if (!regels.length) { await klaar({ status: "skipped", last_error: "geen berichten gevonden" }); return "skipped"; }
    return await stuurEnBoek(t.berichtOnderwerp(naam), simpelHtml({
      titel: t.berichtTitel(naam),
      intro: t.berichtIntro,
      regels,
      voet: t.berichtVoet + coachVoet,
      accent,
    }));
  }

  // Klant tekende een workout af (mail naar de coach met de scores per blok)
  if (event === "workout") {
    const wid = payload.workout_id as string, aid = payload.athlete_id as string;
    const naam = await klantNaam(aid);
    const [{ data: workout }, { data: blokken }, { data: results }] = await Promise.all([
      db.from("workouts").select("title,workout_date").eq("id", wid).maybeSingle(),
      db.from("blocks").select("id,label,exercise").eq("workout_id", wid).order("sort"),
      db.from("results").select("block_id,status,score_text,time_seconds,load_kg,reps,rounds,capped").eq("workout_id", wid).eq("athlete_id", aid),
    ]);
    if (!workout) { await klaar({ status: "skipped", last_error: "workout niet meer gevonden" }); return "skipped"; }
    const datum = workout.workout_date ? datumTxt(workout.workout_date, taal) : t.vandaag;
    const regels = (blokken || []).map((b) => {
      const r = (results || []).find((x) => x.block_id === b.id) || null;
      const sc = scoreTxt(r, taal);
      return `<b>${esc([b.label, b.exercise].filter(Boolean).join(" · "))}</b>${sc ? `: ${esc(sc)}` : ": " + esc(t.nogNietGelogd)}`;
    });
    return await stuurEnBoek(t.workoutOnderwerp(naam), simpelHtml({
      titel: t.workoutTitel(naam),
      intro: `${workout.title || t.workout} · ${datum}`,
      regels,
      voet: t.workoutVoet + coachVoet,
      accent,
      knop: dagLink(aid, workout.workout_date, null, t.knopDag),
    }));
  }

  // Klant uploadde video's (mail naar de coach)
  if (event === "video") {
    const wid = payload.workout_id as string, aid = payload.athlete_id as string;
    const naam = await klantNaam(aid);
    const [{ data: workout }, { count }] = await Promise.all([
      db.from("workouts").select("title,workout_date").eq("id", wid).maybeSingle(),
      db.from("result_media").select("id", { count: "exact", head: true }).eq("workout_id", wid).eq("athlete_id", aid),
    ]);
    const datum = workout?.workout_date ? datumTxt(workout.workout_date, taal) : t.vandaag;
    const n = count || 1;
    return await stuurEnBoek(t.videoOnderwerp(naam, n), simpelHtml({
      titel: t.videoTitel(naam),
      intro: t.videoIntro(workout?.title || t.deWorkout, datum, n),
      regels: [],
      voet: t.videoVoet + coachVoet,
      accent,
      knop: dagLink(aid, workout?.workout_date, null, t.knopDag),
    }));
  }

  // Klant uploadde voortgangsfoto's (mail naar de coach)
  if (event === "foto") {
    const aid = payload.athlete_id as string;
    const naam = await klantNaam(aid);
    const { count } = await db.from("progress_photos").select("id", { count: "exact", head: true }).eq("athlete_id", aid).eq("taken_on", payload.taken_on as string);
    const n = count || 1;
    return await stuurEnBoek(t.fotoOnderwerp(naam), simpelHtml({
      titel: t.fotoTitel(naam),
      intro: t.fotoIntro(n, datumTxt(String(payload.taken_on || ""), taal)),
      regels: [],
      voet: t.fotoVoet + coachVoet,
      accent,
    }));
  }

  if (event !== "reactie") { await klaar({ status: "skipped", last_error: "onbekend event" }); return "skipped"; }

  // Gegevens voor de reactie-mail: workout + draad + namen
  const [{ data: workout }, { data: draad }] = await Promise.all([
    db.from("workouts").select("id,title,workout_date").eq("id", payload.workout_id as string).maybeSingle(),
    db.from("workout_comments").select("author_id,body,created_at").eq("workout_id", payload.workout_id as string).eq("athlete_id", payload.athlete_id as string).order("created_at").limit(6),
  ]);
  const auteurIds = [...new Set((draad || []).map((c) => c.author_id))];
  const { data: auteurs } = await db.from("profiles").select("id,first_name,last_name").in("id", auteurIds);
  const naamBij = (aid: string) => naamVan((auteurs || []).find((a) => a.id === aid) || null, taal);

  const laatste = (draad || [])[(draad || []).length - 1];
  const anderNaam = laatste ? naamBij(laatste.author_id) : t.JeCoach;
  const datum = workout?.workout_date ? datumTxt(workout.workout_date, taal) : t.vandaag;
  const intro = isLid ? t.reactieIntroLid(datum) : t.reactieIntroCoach(anderNaam, datum);
  const voet = isLid ? t.reactieVoetLid : t.reactieVoetCoach;

  const html = reactieHtml({
    titel: t.reactieTitel(anderNaam),
    intro,
    draad: (draad || []).slice(-4).map((c) => ({ naam: naamBij(c.author_id), body: c.body, vanMij: c.author_id === ontvanger.id })),
    workoutTitel: t.reactieWorkout(workout?.title || null, datum),
    voet,
    accent,
    // De coach krijgt een knop rechtstreeks naar die dag mét het reactiepaneel open; het lid reageert in de app.
    knop: isLid ? null : dagLink(payload.athlete_id as string, workout?.workout_date, (workout?.id as string) || (payload.workout_id as string), t.knopReactie),
  });

  const r = await verstuur(ontvanger.email, afzenderNaam, isLid ? t.reactieOnderwerpLid(datum) : t.reactieOnderwerpCoach(anderNaam), html);
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
