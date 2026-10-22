// app/testdata-nl.js: Nederlandse weergave van de Engelse teksten op Data › Atleten.
// Michels rekenlogica (app/testdata-engine.js) schrijft bewust Engels, zodat hij het dashboard met Kyle Ruth kan
// bespreken, en moet byte-identiek blijven aan zijn Python (controle tools/testdata-engine-check.js, 43/43).
// Dit bestand vertaalt daarom alleen bij het tonen (verzoek Stefan, 22 okt 2026): in de Nederlandse app (LANG "nl")
// worden de zinnen, statussen en koppen vertaald; namen van liften, tests en Kyle's SRI-banden (Power outlier, Mixed,
// Endurance-biased) blijven zoals Michel ze schrijft. In de Engelse app (LANG "en") doet dit bestand niets.
// Werking: alleen tekst tussen de tags wordt vertaald, nooit iets in tags (ids, onclick, value) of in <textarea>
// (de bewerk-velden met Michels ruwe invoer), zodat opslaan nooit vertaalde tekst terugschrijft.
const TDS_NL_TEKST=[
  // koppen, statussen en lagen van de kaart (app/testdata.js)
  ["Strength","Kracht"],["Weightlifting","Gewichtheffen"],["Conditioning","Conditie"],["Olympic","Olympisch"],
  ["Accessory / special strength","Accessory / speciale kracht"],
  ["Developing","In ontwikkeling"],["Approaching","Bijna op norm"],["At standard","Op norm"],["Above standard","Boven norm"],["At norm","Op norm"],
  ["Measured","Gemeten"],["Competition","Wedstrijd"],["Why","Waarom"],
  ["Blind spot: ","Blinde vlek: "],[" (tested "," (getest "],[", self ",", zelf "],
  ["Anaerobic power","Anaeroob vermogen"],["anaerobic power","anaeroob vermogen"],["Aerobic base/LSD","Aerobe basis/LSD"],
  ["row 2K→5K","roeien 2K→5K"],["run 1mi→5K","lopen 1 mijl→5K"],["run 1mi→10K","lopen 1 mijl→10K"],["near-max","bijna max"],
  // kracht / olympisch (prioriteiten)
  ["No strength tests on file yet.","Nog geen krachttests ingevuld."],
  ["No weightlifting tests on file yet.","Nog geen gewichthef-tests ingevuld."],
  ["No gymnastics tests on file yet.","Nog geen gymnastics-tests ingevuld."],
  ["No conditioning tests on file yet.","Nog geen conditietests ingevuld."],
  ["already in good shape","al goed op orde"],
  ["lower absolute strength","absolute kracht onderlichaam"],
  ["upper absolute strength","absolute kracht bovenlichaam"],
  ["upper pulling strength-endurance","kracht-uithouding trekken bovenlichaam"],
  ["Gymnastic strength","Gymnastische kracht"],
  [" at or above standard"," op of boven de norm"],
  ["at or above the standard","op of boven de norm"],
  ["close to the standard (not past 65% yet)","dicht bij de norm (nog niet voorbij 65%)"],
  [" is the limiter — build "," is de beperking — bouw "],
  [" — maintain, no measured limiter."," — onderhouden, geen gemeten beperking."],
  [" — maintain, no measured limiter"," — onderhouden, geen gemeten beperking"],
  [" lags behind — work on "," blijft achter — werk aan "],
  ["the clean","de clean"],["the jerk","de jerk"],
  ["Strength is sufficient but the snatch ratio lags — that points to positions/skill, not strength. ","Kracht is voldoende, maar de snatch-ratio blijft achter — dat wijst op posities/skill, niet op kracht. "],
  ["Work on overhead stability and position, e.g. OHS, snatch balance and halting snatch deadlifts.","Werk aan overhead-stabiliteit en positie, bijv. OHS, snatch balance en halting snatch deadlifts."],
  ["Snatch ratio is low and the underlying strength is not at level either — build absolute ","De snatch-ratio is laag en de onderliggende kracht is ook niet op niveau — bouw eerst absolute "],
  ["strength (squat/hinge) first before adding much extra snatch skill volume.","kracht (squat/hinge) voordat je veel extra snatch-skillvolume toevoegt."],
  ["The ratio itself is ","De ratio zelf is "],
  [" — so position/efficiency is good. But the underlying "," — positie en efficiëntie zijn dus goed. Maar de onderliggende "],
  ["strength (squat/hinge/press) is still light, so the snatch in kg stays capped by absolute strength, not ","kracht (squat/hinge/press) is nog licht, dus de snatch in kilo's blijft begrensd door absolute kracht, niet "],
  ["by technique. Build base strength — the skill is already good enough to convert it directly.","door techniek. Bouw basiskracht — de skill is al goed genoeg om die direct om te zetten."],
  ["Ratio is ","De ratio is "],
  [" and the underlying strength is at level too — technique and strength are balanced, maintain via technical/positional work."," en de onderliggende kracht is ook op niveau — techniek en kracht zijn in balans, onderhouden met technisch/positiewerk."],
  ["Clean and jerk are at or above their (sub)standard — no weightlifting main priority based on the available data.","Clean en jerk zitten op of boven hun (sub)norm — geen hoofdprioriteit gewichtheffen op basis van de beschikbare data."],
  [", but the clean (sub-target) lags behind front squat strength — that points to ",", maar de clean (subdoel) blijft achter bij de front squat-kracht — dat wijst op "],
  ["the receiving position/speed under the bar, not strength. Work on receiving position, speed under the bar and ","de vangpositie/snelheid onder de stang, niet op kracht. Werk aan de vangpositie, snelheid onder de stang en "],
  ["front squat confidence out of the catch (e.g. tempo front squats, clean pulls, drop-and-catch).","vertrouwen in de front squat vanuit de vang (bijv. tempo front squats, clean pulls, drop-and-catch)."],
  [", but the jerk (sub-target) lags behind the clean standard — there is too little margin ",", maar de jerk (subdoel) blijft achter bij de clean-norm — er is te weinig marge "],
  ["above the clean to put it overhead confidently. Work on dip/drive speed, overhead stability ","boven de clean om hem met vertrouwen overhead te brengen. Werk aan dip/drive-snelheid, overhead-stabiliteit "],
  ["and jerk-specific confidence (e.g. jerk from blocks/rack, push press speed, overhead squat stability).","en jerk-specifiek vertrouwen (bijv. jerk uit blocks/rack, push press-snelheid, overhead squat-stabiliteit)."],
  // gymnastics
  ["Pressing strength is there (strict press/CGBP at level), but strict HSPU repeatability lags ","Duwkracht is er (strict press/CGBP op niveau), maar de herhaalbaarheid van strict HSPU blijft "],
  ["behind — that is a muscular endurance pressing issue, not a strength deficit.","achter — dat is een kwestie van spieruithouding bij duwen, geen krachttekort."],
  ["Pulling strength (seal row) is there, but weighted pull-up/RMU repeatability lags behind — that is ","Trekkracht (seal row) is er, maar de herhaalbaarheid van weighted pull-up/RMU blijft achter — dat is "],
  ["a muscular endurance pulling issue (GST: from strict to volume), not a strength deficit.","een kwestie van spieruithouding bij trekken (GST: van strict naar volume), geen krachttekort."],
  ["Strict HSPU is still weak — build strict pressing strength via GST before adding volume/kipping.","Strict HSPU is nog zwak — bouw strict duwkracht via GST voordat je volume/kipping toevoegt."],
  ["Weighted pull-up/RMU are still weak — build strict pulling strength via GST before adding volume/kipping.","Weighted pull-up/RMU zijn nog zwak — bouw strict trekkracht via GST voordat je volume/kipping toevoegt."],
  ["LLRC (capacity/volume under fatigue) lags behind — work on repeatability, not on a new max test.","LLRC (capaciteit/volume onder vermoeidheid) blijft achter — werk aan herhaalbaarheid, niet aan een nieuwe maxtest."],
  ["not tested yet","nog niet getest"],
  ["Max set weak (","Maxset zwak ("],
  ["Test strict press/CGBP: strength ceiling vs muscular endurance.","Test strict press/CGBP: krachtplafond versus spieruithouding."],
  ["Strength ceiling (press ","Krachtplafond (press "],
  [" ✓, max set not) — build rep volume."," ✓, maxset niet) — bouw repvolume."],
  ["max set ","maxset "],
  ["x (moderate — density work)","x (matig — densiteitswerk)"],
  ["x (first-set athlete — short-rest density)","x (eerste-set-atleet — densiteit met korte rust)"],
  ["Run the 5-min AMRAP for repeatability.","Doe de 5-min AMRAP voor de herhaalbaarheid."],
  ["breaks down in combos (2/5) — pair with breathing pieces","valt uit elkaar in combo's (2/5) — koppel aan ademhalingsstukken"],
  ["kipping lags strict — timing, not strength","kipping blijft achter bij strict — timing, geen kracht"],
  ["RMU max weak (","RMU max zwak ("],
  ["Test weighted pull-up: strength vs skill/endurance.","Test weighted pull-up: kracht versus skill/uithouding."],
  [" ✓ but RMU max not — endurance/technique, not strength"," ✓ maar RMU max niet — uithouding/techniek, geen kracht"],
  ["pull AND RMU weak — GST first","pull EN RMU zwak — eerst GST"],
  ["RMU repeatability: max set, 2 min rest, max set (2nd <50% = gap).","RMU-herhaalbaarheid: maxset, 2 min rust, maxset (2e <50% = gat)."],
  [") — fatigue volume, not max work",") — volume onder vermoeidheid, geen maxwerk"],
  // engine / SRI
  ["power outlier — build sustained speed/pacing","power outlier — bouw volgehouden snelheid/pacing"],
  ["power-biased — bias longer intervals","power-biased — leg de nadruk op langere intervallen"],
  ["mixed — demands decide","mixed — de wedstrijdeisen beslissen"],
  ["endurance-biased — raise top-end speed","endurance-biased — verhoog de topsnelheid"],
  ["endurance outlier — flat curve, ceiling is the cap","endurance outlier — vlakke curve, het plafond is de grens"],
  ["Speed retention (SRI)","Snelheidsbehoud (SRI)"],
  [" — running economy is the limiter, not the engine."," — loopeconomie is de beperking, niet de motor."],
  [" ✓, long drops to "," ✓, lang zakt naar "],
  [" — sustained output is the limiter; long continuous work."," — volgehouden vermogen is de beperking; lang doorlopend werk."],
  [" ✓, short lags at "," ✓, kort blijft achter op "],
  [" — power ceiling; top-end intervals."," — powerplafond; intervallen op topsnelheid."],
  [" and long "," en lang "],[" in balance."," in balans."],
  [" measured; no long test."," gemeten; geen lange test."],
  ["C2 20-min watts: separates power from aerobic base + anchors pacing.","C2 20 min watt: scheidt power van aerobe basis en verankert pacing."],
  ["at level","op niveau"],
  // diagnostiek olympisch
  [" — not sitting under the bar"," — zakt niet onder de stang"],
  ["Receiving work: drop-and-catch, tempo FS, cleans from blocks.","Vangwerk: drop-and-catch, tempo FS, cleans vanaf blocks."],
  ["% of snatch (exp. 80-88) — same pattern","% van snatch (verwacht 80-88) — zelfde patroon"],
  ["% of clean — overhead not the limiter","% van clean — overhead is niet de beperking"],
  ["% of front squat — FS is the ceiling","% van front squat — FS is het plafond"],
  ["all ratios → front-rack strength + receiving position","alle ratio's → front-rack-kracht + vangpositie"],
  ["Clean 'at level' vs a below-standard front squat — the bar moved down with it; check against the absolute tier standard.","Clean 'op niveau' tegenover een front squat onder de norm — de lat ging mee omlaag; check tegen de absolute tiernorm."],
  ["% of BS (exp. ~85%) — front-rack lags the legs.","% van BS (verwacht ~85%) — front-rack blijft achter bij de benen."],
  ["Zombie FS + double-KB rack hold: position vs trunk strength.","Zombie FS + double-KB rack hold: positie versus rompkracht."],
  // zelfbeeld
  [" — rates themselves higher than the test supports."," — schat zichzelf hoger in dan de test laat zien."],
  ["Confidence, not capacity: ","Vertrouwen, geen capaciteit: "],
  [" — above standard but does not feel that way."," — boven de norm, maar voelt zo niet."],
  // crossfit-profiel
  ["Strength and/or Engine score still missing — not enough data for a CrossFit/mixed profile.","Strength- en/of Engine-score ontbreekt nog — te weinig data voor een CrossFit/mixed-profiel."],
  ["heavy/short (strength-driven)","zwaar/kort (krachtgedreven)"],
  ["longer, engine-driven workouts with less load","langere, motorgedreven workouts met minder gewicht"],
  ["short, heavy strength-driven pieces","korte, zware krachtgedreven stukken"],
  ["balanced across duration and load","in balans over duur en belasting"],
  ["Strong in ","Sterk in "],
  ["; balance the profile with more ","; breng het profiel in balans met meer "],
  [" and more skill volume (gymnastics is the limiting factor right now)."," en meer skillvolume (gymnastics is nu de beperkende factor)."],
  ["Duration/load are balanced, but skill density (gymnastics) is the limiting factor — programme more mixed skill-under-fatigue work.","Duur/belasting zijn in balans, maar skilldichtheid (gymnastics) is de beperkende factor — programmeer meer gemengd skillwerk onder vermoeidheid."],
  [" — balance the profile with more "," — breng het profiel in balans met meer "],
  ["Profile is already reasonably balanced across duration/load — maintain, keep varying skill density.","Het profiel is al redelijk in balans over duur/belasting — onderhouden, blijf de skilldichtheid variëren."],
  // SRI-trainingsrichting (Kyle)
  ["Sustained speed, threshold, pacing and economy; maintain short power.","Volgehouden snelheid, threshold, pacing en economie; onderhoud korte power."],
  ["Inherently powerful: go longer and slower to build the aerobic system. The further outside the middle band, the more strength you can afford to sacrifice for it.","Van nature krachtig: ga langer en langzamer om het aerobe systeem te bouwen. Hoe verder buiten de middenband, hoe meer kracht je ervoor mag inleveren."],
  ["The SRI outlier is who actually deserves significant zone-two time (Sydney Smith: 3×90' zone two/week + threshold-biased FTP progressions).","De SRI-outlier is wie echt veel zone-twee-tijd verdient (Sydney Smith: 3×90' zone twee per week + threshold-biased FTP-progressies)."],
  ["Speed work at the END of the session: the goal is a finishing kick.","Snelheidswerk aan het EIND van de sessie: het doel is een eindsprint."],
  ["Heavy power athlete: swap one zone-two run for bike to limit pounding.","Zware power-atleet: ruil één zone-twee-loop in voor de fiets om de impact te beperken."],
  ["Race plan: can sit in and punch at the end.","Raceplan: kan meezitten en aan het eind toeslaan."],
  ["Short speed exceeds the ability to hold it.","De korte snelheid is groter dan het vermogen om die vast te houden."],
  ["Longer intervals and sustained work; maintain short quality.","Langere intervallen en volgehouden werk; onderhoud de korte kwaliteit."],
  ["Elite CrossFitters cluster around 86%, some as low as 82 — this is a Games-typical profile, not a flaw.","Elite CrossFitters zitten rond de 86%, sommigen zelfs op 82 — dit is een Games-typisch profiel, geen tekortkoming."],
  ["Main conditioning lever = threshold / extensive intervals; zone two stays maintenance unless one modality is an outlier.","Belangrijkste conditiehefboom = threshold / extensieve intervallen; zone twee blijft onderhoud tenzij één modaliteit een outlier is."],
  ["No clear bias — the ratio alone gives no direction.","Geen duidelijke richting — de ratio alleen zegt niets."],
  ["Let the gaps, the run-vs-row comparison and the competition demands decide.","Laat de gaten, de vergelijking lopen versus roeien en de wedstrijdeisen beslissen."],
  ["Mid-band athlete: zone-two volume is not the lever; economy and skill get the time.","Middenband-atleet: zone-twee-volume is niet de hefboom; economie en skill krijgen de tijd."],
  ["Pick the accent from the weakest raw score vs the norm, not from the SRI.","Kies het accent op basis van de zwakste ruwe score tegenover de norm, niet op de SRI."],
  ["Speed held well; the short ceiling limits.","Snelheid wordt goed vastgehouden; het korte plafond beperkt."],
  ["Raise mile/2K speed and aerobic power; maintain threshold.","Verhoog de mijl/2K-snelheid en het aerobe vermogen; onderhoud threshold."],
  ["Not powerful enough to run the mile hard: develop top-end speed and trust the aerobic base to support it.","Niet krachtig genoeg om de mijl hard te lopen: ontwikkel topsnelheid en vertrouw erop dat de aerobe basis het draagt."],
  ["Speed work FIRST in the session, neurologically fresh.","Snelheidswerk EERST in de sessie, neurologisch fris."],
  ["Flat curve → template biased to neuromuscular speed and power (e.g. row at 1K pace, strides).","Vlakke curve → template gericht op neuromusculaire snelheid en power (bijv. roeien op 1K-tempo, strides)."],
  ["Race plan: no big end-punch — stay with the leaders and win through attrition.","Raceplan: geen grote eindsprint — blijf bij de kopgroep en win op uitputting."],
  ["Exceptionally flat — or a weak short anchor, or a test mismatch.","Uitzonderlijk vlak — of een zwak kort anker, of een testfout."],
  ["Validate the tests first; if valid, prioritise the short ceiling.","Controleer eerst de tests; kloppen ze, geef dan voorrang aan het korte plafond."],
  ["Develop top-end speed and trust the aerobic base to support it.","Ontwikkel topsnelheid en vertrouw erop dat de aerobe basis het draagt."],
  ["% ≥92: a flat curve usually means the short test (","% ≥92: een vlakke curve betekent meestal dat de korte test ("],
  ["% <82: check the long test first (full distance per GPS, all-out, recent) — Kyle caught a '5K' that was 4.5K.","% <82: check eerst de lange test (volledige afstand per GPS, all-out, recent) — Kyle betrapte een '5K' die 4,5K was."],
  [") and row (",") en roeien ("],
  [") disagree: compare the modalities — a gap is usually running economy, not the engine. Never compare a run test with an erg test.",") spreken elkaar tegen: vergelijk de modaliteiten — een gat is meestal loopeconomie, niet de motor. Vergelijk nooit een looptest met een ergtest."],
  ["Kyle · row-vs-run cross-check (Noah call 4)","Kyle · kruiscontrole roeien vs lopen (Noah call 4)"],
  ["Athlete's own entry in Strivee","Eigen invoer van de atleet in Strivee"],
  ["Both times are Developing vs the norm: 'just slow' — raise both before trusting the profile.","Beide tijden zijn In ontwikkeling tegenover de norm: 'gewoon traag' — verhoog beide voordat je het profiel vertrouwt."],
  // samenvattingen en diagnoses (tdTestedSummary, tdDiagnostics, crossfit-profiel)
  ["Tested: ","Getest: "],[" approaching standard"," bijna op norm"],
  ["Snatch/back squat ratio: ","Snatch/back squat-ratio: "],["% (standard 65%). ","% (norm 65%). "],
  ["Diagnosis — ","Diagnose — "],["Weightlifting ratios","Gewichthef-ratio's"],["Pressing (HSPU)","Duwen (HSPU)"],["Pulling","Trekken"],
  ["Engine: Long ","Engine: Lang "],["Engine: Short ","Engine: Kort "],["Long ","Lang "],["Short ","Kort "],["Modality gap: runs ","Modaliteitsgat: lopen "],
  ["aerobic base/LSD","aerobe basis/LSD"],["pushing, pulling","duwen, trekken"],["pushing","duwen"],["pulling","trekken"],
  ["long/high-volume (engine-driven)","lang/veel volume (motorgedreven)"],
];
// De vertaallijst: eerst Michels eigen Nederlands→Engels-tabel omgekeerd (zijn woorden, bijv. de mentale vragen en
// "Zwaar | 1RM / near-max"), dan de lijst hierboven; langste eerst zodat een zinsdeel nooit een langere zin verknoeit.
// Van elk paar ook de HTML-geëscapete vorm (esc() uit app/state.js maakt van < en & &lt; en &amp;).
const TDS_NL_LIJST=(()=>{
  const paren=[];
  if(typeof TD_NL_EN==="object"&&TD_NL_EN)for(const nl of Object.keys(TD_NL_EN)){const en=TD_NL_EN[nl];if(typeof en==="string"&&en&&en!==nl)paren.push([en,nl]);}
  for(const p of TDS_NL_TEKST)if(p[0]!==p[1])paren.push(p);
  const gezien=new Set(),uit=[];
  for(const [en,nl] of paren){
    for(const [e,n] of (typeof esc==="function"&&esc(en)!==en)?[[en,nl],[esc(en),esc(nl)]]:[[en,nl]]){
      if(gezien.has(e))continue;gezien.add(e);uit.push([e,n]);
    }
  }
  return uit.sort((a,b)=>b[0].length-a[0].length);
})();
function tdsNLTekst(s){for(const [en,nl] of TDS_NL_LIJST){if(s.indexOf(en)>=0)s=s.split(en).join(nl);}return s;}
function tdsNL(html){
  if(typeof LANG!=="undefined"&&LANG!=="nl")return html; // Engelse app: Michels teksten zoals ze zijn
  const s=String(html||"");
  // Stukken: <textarea …>…</textarea> en losse tags blijven staan; alleen de tekst ertussen wordt vertaald.
  return s.split(/(<textarea\b[^>]*>[\s\S]*?<\/textarea>|<[^>]*>)/i).map((deel,i)=>i%2?deel:(deel&&/[A-Za-z]/.test(deel)?tdsNLTekst(deel):deel)).join("");
}
