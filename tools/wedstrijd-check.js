#!/usr/bin/env node
// Wekelijkse controle van de wedstrijddata (Data > Wedstrijden, tabel competition_workouts)
// tegen Competition Corner en de andere bronnen. Draait zonder geheimen: Competition Corner
// heeft een open JSON-API, en het schrijven naar Supabase doet de aanroeper (Supabase MCP)
// met de SQL-bestanden die dit script klaarzet.
//
// Gebruik:
//   node tools/wedstrijd-check.js --bestaand bestaand.json --log synclog.json --uit ./uit
//
//   bestaand.json = uitkomst van:
//     select event, jaar, fase, count(*) as n,
//            string_agg(distinct coalesce(bron_url,'(geen)'), ' | ') as bronnen
//     from competition_workouts group by 1,2,3 order by 1,2,3
//   synclog.json  = uitkomst van:
//     select bron, bron_id, status, aantal from competition_sync_log order by created_at
//
// Schrijft in --uit: rapport.md (leesbaar verslag), kandidaten.json, upsert-01.sql ... en
// synclog.sql. De SQL is idempotent: upsert op (event,jaar,fase,naam,divisie) en een
// bestaande rij wordt alleen overschreven als die uit dezelfde bron (bron_url) komt.
// Elk upsert-bestand geeft één getal terug: het aantal geschreven rijen.
//
// De classificatie (movements/format/tijd/maxload) komt uit app/data.js van deze repo,
// zodat het script automatisch dezelfde tags geeft als het Invoer-scherm in de app.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = (() => {
  const o = {}; const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) o[a[i].slice(2)] = (a[i + 1] && !a[i + 1].startsWith('--')) ? a[++i] : true;
  }
  return o;
})();

const COMPANY = args.company || 'd927c766-832c-4b8e-8001-4d416b9a35bc'; // bedrijf van de bestaande wedstrijddata
const UIT = args.uit || './wedstrijd-uit';
const BATCH = 25; // rijen per SQL-bestand (klein genoeg om via de Supabase MCP te sturen)
// Basis-URL van de Competition Corner-API; via CC_BASE te vervangen door een proxy als een omgeving
// (bijv. GitHub-runners) door Competition Corner wordt geweigerd.
const BASE = (process.env.CC_BASE || 'https://competitioncorner.net/api2/v1').replace(/\/+$/, '');
const H = { headers: { 'User-Agent': 'Mozilla/5.0 (coachapp wedstrijd-check)', accept: 'application/json' } };
const LANDEN = ['Netherlands', 'Belgium', 'Spain'];
const VANDAAG = new Date().toISOString().slice(0, 10);
const dagenGeleden = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// Wedstrijden die we volgen: naam in de database + herkenning in de Competition Corner-naam.
const GEVOLGD = [
  { event: 'Dutch Throwdown', re: /dutch throwdown/i },
  { event: 'Lowlands Throwdown', re: /lowlands throwdown/i },
  { event: 'Amsterdam Throwdown', re: /amsterdam throwdown/i },
  { event: 'Marbella Championship', re: /marbella championship/i },
];
// Grotere wedstrijden die we (nog) niet volgen: één keer melden als tip, verder niets mee doen.
const KANDIDATEN_RE = /beach showdown|belgium showdown|iberian throwdown|continental classic|crown series/i;

// Bronnen buiten Competition Corner: alleen signaleren, importeren blijft handwerk.
const NATIONALS_PAGINAS = ['https://jointhenationals.com/', 'https://jointhenationals.com/season-10/', 'https://jointhenationals.com/events/'];
// Edities die niet openbaar op Competition Corner staan (Circle21, PDF's): na deze datum melden als ze nog ontbreken.
const VERWACHT_HANDMATIG = [
  { event: 'Marbella Championship', jaar: 2026, fase: 'finale', na: '2026-10-20', bron: 'Circle21: scorecard-PDF\'s van de finale (oktober 2026) aanleveren' },
  { event: 'Amsterdam Throwdown', jaar: 2026, fase: 'finale', na: '2026-11-01', bron: 'Circle21 / Instagram @theamsterdamthrowdown: finale-workouts als screenshot of tekst aanleveren' },
  { event: 'The Nationals', jaar: 2027, fase: 'kwalificatie', na: '2026-10-19', bron: 'jointhenationals.com: scorecard-PDF\'s van Season 10 (placement + events) importeren' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lees = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// Cache van alle opgehaalde antwoorden, in één JSON-bestand ({opgehaald, antwoorden: {url: data}}).
// Twee standen:
//   --vul-cache <bestand>  alles live ophalen en bewaren; draait wekelijks als GitHub Action
//                          (.github/workflows/wedstrijd-cache.yml), want de cloud-omgeving van de
//                          routine mag alleen GitHub en pakketbronnen bereiken (HTTP 403 op de rest).
//   --cache <bestand>      live proberen en bij een fout terugvallen op de bewaarde antwoorden.
const VUL_CACHE = args['vul-cache'] || null;
const CACHE = VUL_CACHE || args.cache || null;
const cacheStats = { live: 0, hits: 0, fouten: 0 };
let cacheData = null;
function laadCache() {
  if (cacheData) return cacheData;
  // Ook bij --vul-cache beginnen we met de bestaande cache: wat live mislukt blijft dan bewaard.
  try { cacheData = (CACHE && fs.existsSync(CACHE)) ? lees(CACHE) : { opgehaald: null, antwoorden: {} }; }
  catch (err) { cacheData = { opgehaald: null, antwoorden: {} }; }
  if (!cacheData.antwoorden) cacheData.antwoorden = {};
  return cacheData;
}
async function haalLive(url, alsTekst) {
  if (args.offline) throw new Error('offline (testschakelaar --offline) op ' + url); // om de terugval op de cache te testen
  const res = await fetch(url, H);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' op ' + url);
  return alsTekst ? res.text() : res.json();
}
async function haal(url, alsTekst) {
  if (VUL_CACHE) {
    const data = await haalLive(url, alsTekst);
    laadCache().antwoorden[url] = data;
    cacheStats.live++;
    return data;
  }
  try { const data = await haalLive(url, alsTekst); cacheStats.live++; return data; }
  catch (err) {
    const c = laadCache();
    if (CACHE && Object.prototype.hasOwnProperty.call(c.antwoorden, url)) { cacheStats.hits++; return c.antwoorden[url]; }
    cacheStats.fouten++;
    throw err;
  }
}
const getJson = (url) => haal(url, false);
const cacheDatum = () => laadCache().opgehaald;

function stripHtml(html) {
  if (!html) return '';
  let t = String(html).replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\/?(html|head|body)[^>]*>/gi, '');
  t = t.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, '');
  const ent = { '&nbsp;': ' ', '&amp;': '&', '&rsquo;': "'", '&lsquo;': "'", '&hellip;': '...', '&ldquo;': '"', '&rdquo;': '"', '&gt;': '>', '&lt;': '<', '&quot;': '"', '&ndash;': '-', '&mdash;': '-', '&eacute;': 'e', '&oacute;': 'o', '&aacute;': 'a', '&iacute;': 'i', '&uacute;': 'u', '&ntilde;': 'n', '&deg;': '°' };
  for (const [k, v] of Object.entries(ent)) t = t.split(k).join(v);
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  return t.replace(/[■□●○•▪]/g, '-').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Tweetalige teksten (Marbella): alleen het Engelse deel houden.
function engelsAlleen(text) {
  if (!/castellano|español|espanol/i.test(text)) return text;
  let s = text.replace(/\*+\s*En Castellano Abajo\s*/i, '');
  const engM = s.match(/(^|\n)\s*\**\s*English\s*:?\s*\**\s*(\n|$)/i);
  if (engM) s = s.slice(engM.index + engM[0].length);
  const spM = s.match(/(^|\n)\s*\**\s*(Castellano|En Castellano|Español|Espanol)\s*:?\s*\**\s*(\n|$)/i);
  if (spM) s = s.slice(0, spM.index);
  return s.trim() || text;
}

// Vaste regels zonder inhoud ("see the rulebook", "movement standards HERE", links) weghalen: ze
// zeggen de coach niets en vervuilen de tags (het woord "throwdown" in een link telt anders als "Row").
const BOILERPLATE = /rulebook|movement standards|workout flow|athlete.?guide|https?:\/\/|www\./i;
const schoon = (t) => t.split('\n').filter((l) => !BOILERPLATE.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
// Alleen een kop zonder inhoud ("FOR TIME, TIMECAP 10 MIN.") of een verwijzing ("WOD 5 is the
// second part of WOD 4") is geen workout: er moet een reps-/afstand-/gewicht-/tijdregel in staan.
const alleenKop = (t) => /^(for time|amrap|emom)[\s,.:-]*(time ?cap|timecap|tc)?[\s,.:-]*(\d+\s*min(utes)?\.?)?[\s.]*$/i.test(t)
  || !/\d+\s*(x\b|reps?|m\b|km|cal|kg|lbs?|min|sec|rounds?|"|”|\/|\s*[a-z])/i.test(t.replace(/\b(wod|workout|part|round)\s*\d+/gi, ''));
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

// Jaar van de editie: het hoogste jaartal in de naam (seizoen 2025 - 2026 = 2026), anders startdatum.
function jaarUit(name, start) {
  const ys = [...String(name).matchAll(/20\d\d/g)].map((m) => +m[0]);
  return ys.length ? Math.max(...ys) : +String(start).slice(0, 4);
}
function faseUit(name, e) {
  if (/qualif|placement|online/i.test(name)) return 'kwalificatie';
  if (/final|finale/i.test(name)) return 'finale';
  return String(e.locationType).toLowerCase() === 'online' ? 'kwalificatie' : 'finale';
}

// Divisielabel voor de groep divisies die dezelfde workout delen. Het filter in de app zoekt op
// exacte naam, dus we vatten samen in vaste categorieën (zoals bij Lowlands: "Rx + Masters").
function categorie(d) {
  if (/teen|kid|boys|girls|youth|junior|young/i.test(d)) return 'Teens';
  if (/scaled|beginner|intermediate|rookie|fitness|novice/i.test(d)) return 'Scaled';
  if (/master|legend|\b(30|35|40|45|50|55|60)\s*\+|\b(30|35|40|45|50|55)\s*-\s*\d\d/i.test(d)) return 'Masters';
  if (/elite|\brx\b|regular|senior|open|individual|indy|advanced|\bpro\b|adult/i.test(d)) return 'Rx';
  if (/team|buddy|triplet|synchro|duo|pair|parent|\b[MF]\s*\/\s*[MF]\b|\b[MF]{2,3}\b/i.test(d)) return 'Teams';
  return 'Overig';
}
const CAT_VOLGORDE = ['Rx', 'Scaled', 'Masters', 'Teens', 'Teams', 'Overig'];
function divisieLabel(divs, alleDivs) {
  const u = [...new Set(divs.map((d) => d.replace(/\s+/g, ' ').trim()))];
  if (u.length >= alleDivs.length) return 'Alle divisies';
  const rest = alleDivs.map((d) => d.replace(/\s+/g, ' ').trim()).filter((d) => !u.includes(d));
  if (rest.length && rest.length <= 2) return 'Alle divisies behalve ' + rest.join(' / ');
  const cats = CAT_VOLGORDE.filter((c) => u.some((d) => categorie(d) === c));
  if (u.length <= 3) return u.join(' / ');
  if (cats.length <= 2) return cats.join(' + ');
  return 'Gemengd (' + u.length + ' divisies)';
}

// Classificatie 1-op-1 uit app/data.js (WD_MOV + wdClassify), zodat de tags gelijk blijven aan de app.
function laadClassifier() {
  const kandidaten = [path.join(__dirname, '..', 'app', 'data.js'), path.join(process.cwd(), 'app', 'data.js')];
  for (const p of kandidaten) {
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    const i = src.indexOf('const WD_MOV=');
    const j = src.indexOf('// Afgeleide structuur');
    if (i < 0 || j < 0) continue;
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(src.slice(i, j) + '\n;this.wdClassify=wdClassify;', ctx);
    if (typeof ctx.wdClassify === 'function') return ctx.wdClassify;
  }
  throw new Error('wdClassify niet gevonden in app/data.js; draai dit script vanuit de coachapp-repo');
}
const wdClassify = laadClassifier();
// Terugval voor de duur: tijdvenster (grootste minus kleinste MM:SS), zoals bij de Nationals-import.
function windowMinutes(text) {
  const ts = [...String(text).matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => parseInt(m[1]) + parseInt(m[2]) / 60);
  if (ts.length >= 2) { const d = Math.round(Math.max(...ts) - Math.min(...ts)); if (d > 0 && d <= 60) return d; }
  return null;
}
const tijdBucket = (min) => min == null ? 'onbekend' : min < 5 ? 'sprint (<5)' : min <= 10 ? 'kort (5-10)' : min <= 20 ? 'middel (10-20)' : 'lang (20+)';
function classificeer(tekst) {
  const a = wdClassify(tekst);
  // Zelfde tekst nog eens zonder koppelstreepjes tussen letters (chest-to-bar, box-jump-over), tags samenvoegen.
  const b = wdClassify(tekst.replace(/(?<=[a-zA-Z])-(?=[a-zA-Z])/g, ' '));
  const movements = [...new Set([...a.movements, ...b.movements])];
  let minutes = a.minutes, tijd = a.tijd;
  if (minutes == null && a.format !== 'max lift') {
    // Terugval: "12' TC", "(7’ TC)", "TC 8 MIN", "cap 15", of een tijdvenster (0:00 - 6:00).
    const m = tekst.match(/(\d{1,2})\s*['’′]\s*(?:tc|time ?cap)/i) || tekst.match(/\b(?:tc|time ?cap|timecap)\s*[:-]?\s*(\d{1,2})\b/i) || tekst.match(/\bcap\s*(\d{1,2})\b/i);
    minutes = m ? parseInt(m[1]) : windowMinutes(tekst);
    tijd = tijdBucket(minutes);
  }
  return { movements, format: a.format, tijd, minutes, maxload: a.maxload };
}

async function oogst(e, eventNaam, jaar, fase) {
  const divs = await getJson(`${BASE}/lookups/${e.id}/divisions/workouts`);
  if (!Array.isArray(divs) || !divs.length) return [];
  const divNamen = divs.map((d) => String(d.value || '').trim());
  const perWorkout = {};
  for (const d of divs) {
    let wos = [];
    try { wos = await getJson(`${BASE}/lookups/${e.id}/workouts?divisionId=${d.key}`); } catch (err) { /* divisie zonder workouts */ }
    for (const w of (Array.isArray(wos) ? wos : [])) {
      if (!perWorkout[w.key]) perWorkout[w.key] = { key: w.key, name: String(w.value || '').trim(), divs: [] };
      perWorkout[w.key].divs.push(String(d.value || '').trim());
    }
    await sleep(80);
  }
  // Competition Corner maakt per divisiegroep vaak een aparte workout met precies dezelfde tekst;
  // die voegen we samen (zelfde naam + zelfde tekst = één rij, divisies bij elkaar).
  const samen = {};
  for (const w of Object.values(perWorkout)) {
    let c = null;
    try { c = await getJson(`${BASE}/events/${e.id}/workouts/${w.key}/public`); } catch (err) { continue; }
    await sleep(80);
    const desc = stripHtml(c.description || '');
    const flow = (c.sections || []).filter((s) => s.type === 'text' && s.description).map((s) => '[' + (s.label || '') + '] ' + stripHtml(s.description)).join('\n');
    const tekst = schoon(engelsAlleen([desc, flow].filter(Boolean).join('\n\n')));
    if (tekst.length < 20 || !/\d/.test(tekst) || alleenKop(tekst)) continue; // leeg, nog niet gepubliceerd, of alleen een verwijzing
    const key = (w.name || w.key) + '|' + norm(tekst);
    if (!samen[key]) samen[key] = { name: w.name || ('Workout ' + w.key), tekst, divs: [], cc_workout_key: w.key };
    samen[key].divs.push(...w.divs);
  }
  const rows = [];
  const gebruikt = new Set();
  for (const s of Object.values(samen)) {
    const divisie = divisieLabel(s.divs, divNamen);
    let naam = s.name;
    let sleutel = naam + '|' + divisie; let n = 2;
    while (gebruikt.has(sleutel)) { naam = s.name + ' (' + (n++) + ')'; sleutel = naam + '|' + divisie; }
    gebruikt.add(sleutel);
    const cl = classificeer(s.tekst);
    rows.push({ company_id: COMPANY, event: eventNaam, jaar, fase, naam, divisie, tekst: s.tekst, ...cl, bron_url: `https://competitioncorner.net/events/${e.id}/workouts`, cc_workout_key: s.cc_workout_key, divisies: [...new Set(s.divs)] });
  }
  return rows;
}

const q = (s) => (s === null || s === undefined) ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const num = (n) => (n === null || n === undefined || Number.isNaN(+n)) ? 'null' : String(+n);
function upsertSql(rows) {
  const vals = rows.map((r) => `(${q(r.company_id)},${q(r.event)},${num(r.jaar)},${q(r.fase)},${q(r.naam)},${q(r.divisie)},${q(r.tekst)},${q(JSON.stringify(r.movements))}::jsonb,${q(r.format)},${q(r.tijd)},${num(r.minutes)},${num(r.maxload)},${q(r.bron_url)})`);
  return 'with ins as (\ninsert into public.competition_workouts (company_id,event,jaar,fase,naam,divisie,tekst,movements,format,tijd,minutes,maxload,bron_url) values\n'
    + vals.join(',\n')
    + '\non conflict (event,jaar,fase,naam,divisie) do update set tekst=excluded.tekst, movements=excluded.movements, format=excluded.format, tijd=excluded.tijd, minutes=excluded.minutes, maxload=excluded.maxload\nwhere competition_workouts.bron_url = excluded.bron_url\nreturning 1)\nselect count(*) as geschreven from ins;\n';
}
function logSql(items) {
  if (!items.length) return '';
  const vals = items.map((l) => `(${q(COMPANY)},${q(l.bron)},${q(l.bron_id)},${q(l.event)},${num(l.jaar)},${q(l.fase)},${q(l.status)},${num(l.aantal || 0)},${q(l.notitie || null)})`);
  return 'insert into public.competition_sync_log (company_id,bron,bron_id,event,jaar,fase,status,aantal,notitie) values\n' + vals.join(',\n') + ';\n';
}

(async () => {
  fs.mkdirSync(UIT, { recursive: true });
  const bestaand = args.bestaand ? lees(args.bestaand) : [];
  const log = args.log ? lees(args.log) : [];
  const rapport = [];
  const logItems = [];
  const kandidaten = [];
  const fouten = [];

  // Wat kennen we al?
  const ccBekend = new Set();
  const bronnenBekend = new Set();
  for (const r of bestaand) {
    for (const b of String(r.bronnen || '').split(' | ')) {
      bronnenBekend.add(b.trim());
      const m = b.match(/competitioncorner\.net\/(?:events|ff)\/(\d+)/);
      if (m) ccBekend.add(+m[1]);
    }
  }
  const editieRijen = (event, jaar, fase) => bestaand.filter((r) => r.event === event && +r.jaar === +jaar && r.fase === fase);
  const andereBron = (event, jaar, fase) => editieRijen(event, jaar, fase).some((r) => String(r.bronnen || '').split(' | ').some((b) => !/competitioncorner\.net\/(events|ff)\/\d+/.test(b)));
  const laatsteLog = {};
  for (const l of log) if (l.bron === 'competitioncorner') laatsteLog[String(l.bron_id)] = l; // gesorteerd op created_at, laatste wint

  // 1. Competition Corner: alle events (verleden + toekomst) in de landen die we volgen.
  const ccEvents = [];
  for (const land of LANDEN) {
    try {
      const lijst = await getJson(`${BASE}/events/filtered?location=${encodeURIComponent(land)}&includePastEvents=true&page=1&perPage=500`);
      for (const e of (Array.isArray(lijst) ? lijst : [])) ccEvents.push({ ...e, land });
    } catch (err) { fouten.push('Competition Corner ' + land + ': ' + err.message); }
  }
  const gezien = new Set();
  const nietGevolgd = [];
  const teDoen = [];
  for (const e of ccEvents) {
    if (gezien.has(e.id)) continue; gezien.add(e.id);
    const naam = String(e.name || '').replace(/\s+/g, ' ').trim();
    const start = String(e.startDateTime || '').slice(0, 10);
    const eind = String(e.endDateTime || '').slice(0, 10) || start;
    const g = GEVOLGD.find((x) => x.re.test(naam));
    if (!g) {
      if (KANDIDATEN_RE.test(naam) && start >= dagenGeleden(365)) nietGevolgd.push({ id: e.id, naam, start, land: e.land });
      continue;
    }
    const jaar = jaarUit(naam, start);
    const fase = faseUit(naam, e);
    const eerder = laatsteLog[String(e.id)];
    const recent = eind >= dagenGeleden(60); // nog bezig of net afgelopen: opnieuw ophalen, er kunnen workouts bij zijn gekomen
    if (ccBekend.has(e.id) && !recent) continue; // al in de database en afgerond
    if (eerder) {
      if (['overgeslagen', 'handmatig'].includes(eerder.status)) continue; // afgehandeld of wacht op een mens
      if (eerder.status === 'geimporteerd' && !recent) continue;
      if (eerder.status === 'geen_workouts' && eind < dagenGeleden(180)) continue; // oud event zonder workouts, daar komt niets meer
    }
    teDoen.push({ e, naam, start, eind, event: g.event, jaar, fase, recent, bekend: ccBekend.has(e.id), eerder });
  }

  if (VUL_CACHE) {
    // Alleen de cache vullen: lijsten staan er al in, nu ook alle workouts van de gevolgde
    // wedstrijden van de laatste 400 dagen plus toekomstige, en de pagina's van The Nationals.
    const versNodig = teDoen.filter((t) => t.eind >= dagenGeleden(400) || t.start > VANDAAG);
    for (const t of versNodig) {
      try { await oogst(t.e, t.event, t.jaar, t.fase); } catch (err) { fouten.push(`Cache vullen event ${t.e.id} (${t.naam}): ${err.message}`); }
    }
    for (const url of NATIONALS_PAGINAS) {
      try { await haal(url, true); } catch (err) { fouten.push('The Nationals ' + url + ': ' + err.message); }
    }
    // Statusbestand naast de cache (altijd), zodat je op GitHub kunt zien wat er live is gelukt.
    const statusPad = VUL_CACHE.replace(/\.json$/i, '') + '-status.json';
    const status = { opgehaald: new Date().toISOString(), events: ccEvents.length, live: cacheStats.live, gevolgd: versNodig.length, fouten, basis: BASE };
    fs.mkdirSync(path.dirname(path.resolve(VUL_CACHE)), { recursive: true });
    fs.writeFileSync(statusPad, JSON.stringify(status, null, 1));
    if (!ccEvents.length) {
      // Geen enkele eventlijst binnen: de bestaande cache NIET overschrijven met een lege.
      console.log(`Cache NIET bijgewerkt: geen eventlijsten van Competition Corner ontvangen (${fouten.length} fouten, zie ${statusPad}).`);
      fouten.forEach((f) => console.log('- ' + f));
      process.exitCode = 1;
      return;
    }
    const c = laadCache();
    c.opgehaald = status.opgehaald;
    c.events = ccEvents.length;
    c.gevolgd = versNodig.map((t) => ({ id: t.e.id, naam: t.naam, event: t.event, jaar: t.jaar, fase: t.fase }));
    fs.writeFileSync(VUL_CACHE, JSON.stringify(c));
    console.log(`Cache gevuld in ${VUL_CACHE}: ${cacheStats.live} antwoorden live, ${versNodig.length} gevolgde events geoogst, ${fouten.length} fouten.`);
    fouten.forEach((f) => console.log('- ' + f));
    return;
  }

  for (const t of teDoen) {
    const { e, naam, start, event, jaar, fase, eerder } = t;
    if (!t.bekend && andereBron(event, jaar, fase)) {
      // Deze editie/fase staat al in de database uit een andere bron (screenshot, PDF, eerdere CC-oogst zonder bron_url): niet dubbel importeren.
      logItems.push({ bron: 'competitioncorner', bron_id: String(e.id), event, jaar, fase, status: 'overgeslagen', aantal: 0, notitie: 'Al gedekt uit een andere bron; CC-event ' + e.id + ' (' + naam + ') niet geïmporteerd' });
      rapport.push(`- Al gedekt: ${event} ${jaar} ${fase} staat al in de database uit een andere bron. De Competition Corner-versie (https://competitioncorner.net/events/${e.id}/workouts, "${naam}") is overgeslagen; wil je die toch, dan kan dat handmatig.`);
      continue;
    }
    let rows = [];
    try { rows = await oogst(e, event, jaar, fase); } catch (err) { fouten.push(`Ophalen event ${e.id} (${naam}): ${err.message}`); continue; }
    if (!rows.length) {
      if (!t.bekend && !(eerder && eerder.status === 'geen_workouts' && start > VANDAAG)) {
        logItems.push({ bron: 'competitioncorner', bron_id: String(e.id), event, jaar, fase, status: 'geen_workouts', aantal: 0, notitie: naam + ' (' + start + '): nog geen workouts gepubliceerd' });
        rapport.push(`- Nog geen workouts: ${event} ${jaar} ${fase} ("${naam}", ${start}); wordt de komende weken opnieuw gecheckt.`);
      }
      continue;
    }
    if (eerder && eerder.status === 'geimporteerd' && +eerder.aantal === rows.length) continue; // niets veranderd sinds de vorige keer
    const bestaandN = editieRijen(event, jaar, fase).reduce((s, r) => s + (+r.n || 0), 0);
    kandidaten.push(...rows);
    logItems.push({ bron: 'competitioncorner', bron_id: String(e.id), event, jaar, fase, status: 'geimporteerd', aantal: rows.length, notitie: naam + ' (' + start + ')' + (t.bekend ? '; opnieuw opgehaald omdat het event nog liep' : '') });
    rapport.push(`- ${t.bekend ? 'Bijgewerkt' : 'NIEUW'}: ${event} ${jaar} ${fase}: ${rows.length} workout-rijen uit "${naam}" (${start}), divisies: ${[...new Set(rows.map((r) => r.divisie))].join(', ')}.${bestaandN ? ' Er stonden al ' + bestaandN + ' rijen voor deze editie/fase.' : ''}`);
  }

  // 2. The Nationals: nieuwe scorecard-PDF's op de site signaleren (importeren blijft handwerk).
  const nieuwePdfs = new Set();
  for (const url of NATIONALS_PAGINAS) {
    try {
      const html = await haal(url, true);
      for (const m of html.matchAll(/https?:\/\/(?:www\.)?jointhenationals\.com\/[^"'\s<>)]+?\.pdf/gi)) {
        const u = m[0];
        if (!bronnenBekend.has(u)) nieuwePdfs.add(u);
      }
    } catch (err) { fouten.push('The Nationals ' + url + ': ' + err.message); }
  }
  const pdfEerder = new Set(log.filter((l) => l.bron === 'nationals').map((l) => l.bron_id));
  for (const u of nieuwePdfs) {
    if (pdfEerder.has(u)) continue;
    logItems.push({ bron: 'nationals', bron_id: u, event: 'The Nationals', jaar: null, fase: 'kwalificatie', status: 'handmatig', aantal: 0, notitie: 'Nieuwe PDF gevonden op jointhenationals.com' });
    rapport.push(`- HANDMATIG: nieuwe PDF van The Nationals gevonden: ${u} (scorecards? dan importeren met de Nationals-werkwijze uit WEDSTRIJDDATA.md).`);
  }

  // 3. Edities die niet op Competition Corner staan (Circle21, PDF's): melden als ze na de verwachte datum nog ontbreken.
  for (const v of VERWACHT_HANDMATIG) {
    if (VANDAAG < v.na) continue;
    if (editieRijen(v.event, v.jaar, v.fase).length) continue;
    rapport.push(`- ONTBREEKT NOG: ${v.event} ${v.jaar} ${v.fase}. ${v.bron}.`);
  }

  // 4. Grotere wedstrijden in NL/BE/ES die we (nog) niet volgen: één keer als tip melden.
  const ngEerder = new Set(log.filter((l) => l.bron === 'niet_gevolgd').map((l) => l.bron_id));
  const ngNieuw = nietGevolgd.filter((x) => !ngEerder.has(String(x.id)));
  for (const x of ngNieuw) logItems.push({ bron: 'niet_gevolgd', bron_id: String(x.id), event: x.naam, jaar: jaarUit(x.naam, x.start), fase: null, status: 'overgeslagen', aantal: 0, notitie: x.land + ', ' + x.start });

  // Schrijven.
  for (const f of fs.readdirSync(UIT)) if (/^upsert-\d+\.sql$/.test(f)) fs.unlinkSync(path.join(UIT, f));
  const sqlBestanden = [];
  for (let i = 0; i < kandidaten.length; i += BATCH) {
    const f = path.join(UIT, 'upsert-' + String(sqlBestanden.length + 1).padStart(2, '0') + '.sql');
    fs.writeFileSync(f, upsertSql(kandidaten.slice(i, i + BATCH)));
    sqlBestanden.push(f);
  }
  fs.writeFileSync(path.join(UIT, 'synclog.sql'), logSql(logItems));
  fs.writeFileSync(path.join(UIT, 'kandidaten.json'), JSON.stringify(kandidaten, null, 1));

  const kop = [`# Wedstrijddata-controle ${VANDAAG}`, '', `Competition Corner: ${ccEvents.length} events bekeken in ${LANDEN.join(', ')}; ${teDoen.length} relevant voor de gevolgde wedstrijden (${GEVOLGD.map((g) => g.event).join(', ')}).`];
  if (cacheStats.hits) {
    const cd = cacheDatum();
    const oud = cd && (Date.now() - Date.parse(cd)) > 10 * 864e5;
    kop.push(`Let op: ${cacheStats.hits} antwoorden kwamen uit de cache${cd ? ' van ' + cd.slice(0, 10) : ''} (live ophalen lukte niet).${oud ? ' Die cache is ouder dan 10 dagen: controleer of de GitHub Action "Wedstrijddata cache" nog draait.' : ''}`);
  }
  kop.push('');
  const body = rapport.length ? rapport : ['- Niets nieuws gevonden. Alles is up-to-date.'];
  const staart = ['', `Klaar om te schrijven: ${kandidaten.length} workout-rijen in ${sqlBestanden.length} SQL-bestand(en), ${logItems.length} logregel(s) in synclog.sql.`];
  if (ngNieuw.length) staart.push('', 'Tip, nieuw gezien maar niet gevolgd (wil je ze erbij? zet ze dan in GEVOLGD in tools/wedstrijd-check.js):', ...ngNieuw.map((x) => `- ${x.naam} (${x.land}, ${x.start}) https://competitioncorner.net/events/${x.id}`));
  if (fouten.length) staart.push('', 'Fouten:', ...fouten.map((f) => '- ' + f));
  const md = [...kop, ...body, ...staart].join('\n') + '\n';
  fs.writeFileSync(path.join(UIT, 'rapport.md'), md);
  console.log(md);
  console.log('Bestanden in ' + UIT + ': ' + fs.readdirSync(UIT).join(', '));
})().catch((err) => { console.error('Mislukt:', err); process.exit(1); });
