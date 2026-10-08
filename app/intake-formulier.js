// app/intake-formulier.js: het intake-formulier in de app (stap 4c). Dezelfde velden als Michels
// NL Kyle-template (YourProgram Onboarding (Mannen|Vrouwen).xlsx, oktober 2026): Self-assessment
// (bewegingen met context, de mixed-modal-patronen, twee open vragen), Max lifts & benchmarks met
// de referentiewaarden per niveau en geslacht, Mental performance (zes categorieën), Doelen en het
// optionele tabblad Praktisch. Alle teksten en waarden komen letterlijk uit zijn templates; het
// formulier vult precies dezelfde velden in `input` als de Excel-upload (app/intake.js), zodat de
// dashboardkaart en de intake-kaart er hetzelfde mee doen. Opent vanuit Bewerken op een atletenkaart.

const IF={id:null,werk:null,tab:"basis"};
const IF_SA=[
  ["BARBELL — OLYMPIC LIFTING",[["Snatch","Zwaar | 1RM / near-max"],["Snatch","Matig | workoutgewicht, cycling"],["Snatch","Licht | high-rep, KB/DB snatch"],["Clean","Zwaar | 1RM / near-max"],["Clean","Matig | workoutgewicht, cycling"],["Clean","Licht | high-rep, lichte barbell of KB"],["Clean & Jerk","Zwaar"],["Clean & Jerk","Matig"],["Clean & Jerk","Licht"]]],
  ["BARBELL — SQUATTING",[["Back Squat","Zwaar"],["Front Squat","Zwaar"],["Overhead Squat","Zwaar / matig in workouts"],["Thruster","Zwaar"],["Thruster","Matig | workout cycling"],["Thruster","Licht | high-rep"]]],
  ["BARBELL — PRESSING / SHOULDER-TO-OVERHEAD",[["Strict Press",""],["Push Press",""],["Push Jerk",""],["Split Jerk",""],["Shoulder-to-Overhead","Algemeen / workoutcontext"]]],
  ["BARBELL — PULLING",[["Deadlift","Zwaar | 1RM / near-max"],["Deadlift","Matig | workout cycling"]]],
  ["GYMNASTICS — PULLING",[["Strict Pull-up","Capaciteit"],["Kipping Pull-up","Workout-efficiëntie"],["Chest-to-Bar Pull-up",""],["Bar Muscle-Up",""],["Ring Muscle-Up",""],["Rope Climb","Standaard"],["Legless Rope Climb",""]]],
  ["GYMNASTICS — HANDSTAND / PRESSING",[["Kipping HSPU",""],["Strict HSPU",""],["Deficit HSPU",""],["Handstand Walk",""],["Wall Walk",""]]],
  ["GYMNASTICS — MIDLINE",[["Toes-to-Bar",""],["GHD Sit-up",""],["L-sit / Hanging Knee Raise",""]]],
  ["BASIC CROSSFIT MOVEMENTS",[["Burpee / Burpee Variations",""],["Box Jump / Box Jump-Over",""],["Double-Under",""],["Double-Under Crossover",""],["Wall Ball",""],["Air Squat",""],["Lunge Variations",""],["Pistol Squat",""]]],
  ["ODD OBJECT / STRONGMAN",[["Sandbag","Carry / Clean / Load"],["Sled Push",""],["Sled Pull / Drag",""],["Farmers Carry",""],["Yoke",""]]],
  ["DUMBBELL / KETTLEBELL",[["DB Snatch",""],["DB Clean & Jerk",""],["DB Overhead Squat",""]]],
  ["OVERIG",[["Ring Dip",""],["Pegboard",""],["Push-up",""]]],
];
const IF_PAT_RAW="CROSSFIT-SPECIFIEKE PATRONEN (mixed-modal, niet per beweging)";
const IF_PATRONEN=[
  "Barbell cycling onder vermoeidheid (touch-and-go thrusters/cleans/snatches laat in een metcon)",
  "Barbell cycling gecombineerd met gymnastics aan het rek (bijv. thrusters+pull-ups, cleans+bar muscle-ups)",
  "Gymnastics onder vermoeidheid (kipping HSPU/T2B/muscle-ups als je al buiten adem bent)",
  "Sprint-capaciteit (<5 min all-out effort)",
  "Lange chippers/grinders (>15 min aaneengesloten werk)",
  "Pacing/strategie (kun je een even of negative split volhouden in een lange WOD)",
  "Transities tussen stations (hoe snel/efficiënt wissel je van beweging)",
  "Herstel tussen sets/rondes (hoe snel daalt je hartslag)",
  "Mentale weerstand bij hoge intensiteit (\"redlining\")",
];
const IF_OPEN=["Welke patronen zie je vaak terugkomen als jouw beperking in workouts?","Wat is je grootste kracht in mixed-modal workouts (bijv. barbell cycling combo's, gymnastics onder vermoeidheid, pacing)?"];
const IF_SCHAAL=["Significante beperking — vermijd ik of faal ik consequent","Zwak — onder gemiddeld voor mijn niveau","Gemiddeld — voldoende, geen onderscheidende factor","Sterk — boven gemiddeld voor mijn niveau","Wapen — elite, top van mijn niveau"];
const IF_MENTAL=[
  ["Arousal-regulatie & stressmanagement",["Omgaan met zenuwen / spanning vóór een wedstrijd","Je intensiteit doseren tijdens workouts (pacen vs. redlinen)","Rustig blijven als een workout niet loopt zoals gepland","Herstellen van fouten midden in een event","Omgaan met stress buiten de sport (werk, privé) en de invloed daarvan op je training"]],
  ["Focus & concentratie",["Focus vasthouden in lange workouts (12+ min)","Afleiding buitensluiten in een wedstrijdomgeving","In het moment blijven — niet naar het leaderboard / de scores kijken tijdens een event","Je focus vernauwen bij high-skill bewegingen onder vermoeidheid"]],
  ["Zelfvertrouwen",["Vertrouwen bij events met bekende zwakke punten","Op wedstrijddag vertrouwen op je fitheid","Positieve self-talk onder druk","Geloof in je ontwikkeling op de lange termijn"]],
  ["Motivatie & commitment",["Consistent trainen als de motivatie laag is","Bereidheid om zwakke punten te trainen in plaats van sterke punten","Inzet vasthouden gedurende een heel wedstrijdweekend","Commitment aan het proces boven resultaten op korte termijn"]],
  ["Wedstrijdmentaliteit",["In een wedstrijd een hoger niveau halen dan in training","Reactie op achterstand / verliezen","Tegenstanders als motivatie gebruiken zonder reactief te worden","Ongemak / afzien in workouts omarmen"]],
  ["Communicatie & coachbaarheid",["Openstaan voor feedback en aanpassingen door de coach","Eerlijk communiceren over je training- en herstelstatus","Zelfinzicht in je fysieke en mentale staat","Vertrouwen in het coachingproces"]],
];
const IF_MENTAL_SCHAAL=["Grote uitdaging — dit ondermijnt regelmatig mijn prestatie","In ontwikkeling — ik heb hier vaker wel dan niet moeite mee","Matig — wisselend; soms effectief, soms niet","Sterk — hier ben ik meestal effectief","Elite — dit is een consistente mentale kracht"];
// Referentiewaarden (Kyle's KRC-tabel in kg en m:ss) per niveau: [Open, Quarterfinal, Semifinal, Games], mannen en vrouwen.
const IF_LIFTS=[["Back Squat",[143,166,193,"215+"],[102,120,134,"143+"]],["Front Squat",[125,143,166,"184+"],[88,104,118,"129+"]],["Overhead Squat",[102,120,143,"152+"],[70,84,95,"107+"]],["Thruster (1RM)",[102,120,134,"143+"],[70,84,95,"102+"]],["Deadlift",[184,206,234,"261+"],[125,143,156,"170+"]],["Snatch",[93,107,120,"134+"],[61,73,84,"93+"]],["Power Snatch",[84,98,109,"120+"],[54,66,75,"84+"]],["Power Clean",[125,143,156,"161+"],[84,98,109,"120+"]],["Squat Clean",[125,143,156,"170+"],[84,98,109,"120+"]],["Push Press",[93,107,118,"129+"],[59,70,79,"86+"]],["Push Jerk",[107,122,136,"147+"],[70,82,91,"100+"]],["Split Jerk",[120,138,152,"166+"],[79,93,102,"113+"]]];
const IF_COND=[["1 Mile Run",["6:30","5:50","5:25","5:00"],["7:15","6:30","6:00","5:35"]],["5K Run",["24:00","21:30","19:00","17:30"],["24:00","22:00","20:30","19:00"]],["10K Run",["48:00","43:00","40:00","37:00"],["52:00","47:00","44:00","41:00"]],["1K Row",["3:20","3:10","3:02","2:55"],["3:50","3:40","3:30","3:20"]],["2K Row",["7:00","6:40","6:25","6:10"],["8:00","7:35","7:15","7:00"]],["5K Row",["18:30","17:30","16:45","16:00"],["21:00","20:00","19:00","18:00"]],["Echo Bike 10 min TT (cals)",[180,180,200,"220+"],[115,135,155,"175+"]],["Bike Erg 20 min FTP (watts)",[250,285,305,"350+"],[140,190,225,"275+"]]];
const IF_NIVEAUS=["Open","Quarterfinal","Semifinal","Games"];
// Welke benchmarks ook de canonieke testwaarde vullen (parse_ref_basics in Michels script: dezelfde elf).
const IF_REF_KEY={"Back Squat":"back_squat","Front Squat":"front_squat","Deadlift":"deadlift","Snatch":"snatch","Power Clean":"power_clean","Squat Clean":"squat_clean","Split Jerk":"jerk","5K Run":"run_5k","2K Row":"row_2k","Echo Bike 10 min TT (cals)":"echo_bike","Bike Erg 20 min FTP (watts)":"c2_20min"};
// Voorinvullen uit de testwaarden als er nog geen sport-referentie is (alleen lezen, nooit andersom).
const IF_VOORVUL_KEY=Object.assign({"Overhead Squat":"ohs","Power Snatch":"power_snatch","1 Mile Run":"run_1_mile","10K Run":"run_10k","1K Row":"row_1k","5K Row":"row_5k"},IF_REF_KEY);
const IF_FREQ=["Dagelijks","Meerdere keren per week","Wekelijks","Elke training","Elke wedstrijd"];
const IF_WAARDEN="Excellentie · Groei · Discipline · Veerkracht · Community · Gezondheid / lang blijven sporten · Competitie · Meesterschap · Plezier · Autonomie · Leiderschap · Doorzettingsvermogen · Balans · Nalatenschap · Moed · Consistentie · Integriteit · Authenticiteit · Verantwoordelijkheid · Nieuwsgierigheid · Bijdragen · Dankbaarheid · Nederigheid · Vertrouwen · Volharding · Geloof · Respect · Dienstbaarheid · Aanpassingsvermogen · Zelfvertrouwen · Focus · Geduld · Zelfinzicht · Teamwork · Doelgerichtheid · Commitment";
const IF_DAGEN=["Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
const IF_TABS=[["basis","Basis"],["sa","Self-assessment"],["ref","Max lifts & benchmarks"],["mp","Mentale prestatie"],["doelen","Doelen"],["pr","Praktisch"]];
const IF_SA_FLAT=(()=>{const f=[];IF_SA.forEach(c=>c[1].forEach(it=>f.push({raw:c[0],movement:it[0],context:it[1]})));IF_PATRONEN.forEach(t=>f.push({raw:IF_PAT_RAW,movement:t,context:"",patroon:true}));return f;})();
const IF_MP_FLAT=(()=>{const f=[];IF_MENTAL.forEach(c=>c[1].forEach(q=>f.push({category:c[0],vraag:q})));return f;})();
const IF_REF_FLAT=IF_LIFTS.map(x=>({naam:x[0],kind:"lift",refM:x[1],refV:x[2]})).concat(IF_COND.map(x=>({naam:x[0],kind:"cond",refM:x[1],refV:x[2],tijd:/Run|Row/.test(x[0])})));

// ---------- werkkopie uit de invoer en terug ----------
function ifSleutel(movement,context){return movement+"|"+(context||"");}
function ifVanInput(inp){
  inp=inp||{};
  const w={bw:inp.bw!=null?String(inp.bw):"",target_level:inp.target_level||"Quarterfinal",sa:{},open:["",""],ref:{},mp:{},
    goals:{values:[],g:[],p:[]},pr:{days:IF_DAGEN.map(d=>({day:d,on:false,min:"",double:false,time:"",note:""})),where:"",equipment:"",equipment_missing:"",equipment_note:"",injuries:[{},{},{}],wearable:"",hr_strap:false,sleep:"",work:""}};
  for(const r of (inp.self_assessment_detail||[])){
    const k=ifSleutel(r.movement,r.context);
    if(!w.sa[k]||w.sa[k].score===""){w.sa[k]={score:r.score!=null?String(r.score):"",note:r.note||""};}
  }
  (inp.self_reflection||[]).forEach((r,i)=>{if(i<2)w.open[i]=r.antwoord||"";});
  const sr=inp.sport_reference||{};
  for(const it of (sr.max_lifts||[]).concat(sr.conditioning||[])){w.ref[it.naam]={waarde:it.jouw_waarde!=null?String(it.jouw_waarde):"",datum:it.datum!=null?String(it.datum):""};}
  for(const r of IF_REF_FLAT){if(!w.ref[r.naam]){const k=IF_VOORVUL_KEY[r.naam];const v=k?inp[k]:null;w.ref[r.naam]={waarde:v!=null?String(v):"",datum:""};}}
  for(const r of (inp.mental_performance||[])){if(r.vraag)w.mp[r.vraag]={score:r.score!=null?String(r.score):"",note:r.toelichting||""};}
  const g=inp.goal_setting||{};
  w.goals.values=[0,1,2,3,4].map(i=>({value:(g.values&&g.values[i]&&g.values[i].value)||"",why:(g.values&&g.values[i]&&g.values[i].why)||""}));
  w.goals.g=[0,1].map(i=>{const o=(g.outcome_goals||[])[i]||{};return {goal:o.goal||"",timeline:o.timeline||"",obstacles:[0,1,2].map(j=>(o.obstacles||[])[j]||""),alignment:o.alignment||""};});
  w.goals.p=[0,1,2].map(i=>{const p=(g.process_goals||[])[i]||{};return {goal:p.goal||"",obstacle:p.obstacle||"",measure:p.measure||"",frequency:p.frequency||""};});
  const pr=inp.practical||null;
  if(pr){
    w.pr.days=IF_DAGEN.map(d=>{const x=(pr.days||[]).find(y=>y.day===d);return x?{day:d,on:true,min:x.min!=null?String(x.min):"",double:!!x.double,time:x.time||"",note:x.note||""}:{day:d,on:false,min:"",double:false,time:"",note:""};});
    w.pr.where=pr.where||"";w.pr.equipment=(pr.equipment||[]).join(", ");w.pr.equipment_missing=(pr.equipment_missing||[]).join(", ");w.pr.equipment_note=pr.equipment_note||"";
    w.pr.injuries=[0,1,2].map(i=>(pr.injuries||[])[i]||{});w.pr.wearable=pr.wearable||"";w.pr.hr_strap=!!pr.hr_strap;w.pr.sleep=pr.sleep!=null?String(pr.sleep):"";w.pr.work=pr.work||"";
  }
  return w;
}
function ifGetal(s){if(s===""||s==null)return null;const t=String(s).replace(",",".").trim();if(!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t))return undefined;return Number(t);} // undefined = ongeldig
function ifTijdOk(s){return /^\d{1,3}:[0-5]\d$/.test(String(s).trim());}
// Werkkopie → patch (zelfde vorm als app/intake.js uit de Excel) + sleutels die weg mogen.
function ifNaarPatch(w,inp,gender,vandaag){
  inp=inp||{};const patch={},remove=[],fouten=[];
  const bw=ifGetal(w.bw);if(bw===undefined)fouten.push("Lichaamsgewicht moet een getal zijn");
  if(bw!=null)patch.bw=bw;else if(inp.bw!=null)remove.push("bw");
  patch.target_level=IF_NIVEAUS.includes(w.target_level)?w.target_level:"Quarterfinal";
  // self-assessment (alleen rijen met een score), gemiddelden per radar-as zoals parse_self_assessment
  const detail=[],buckets={Strength:[],Weightlifting:[],Gymnastics:[],CrossFit:[]};
  for(const f of IF_SA_FLAT){
    const v=w.sa[ifSleutel(f.movement,f.context)];if(!v||v.score==="")continue;
    const sc=parseInt(v.score,10);if(!(sc>=1&&sc<=5))continue;
    detail.push({category:f.patroon?"CROSSFIT-SPECIFIEKE PATRONEN":f.raw,movement:f.movement,context:f.context||null,score:sc,note:v.note&&v.note.trim()?v.note.trim():null});
    const cat=IK_SA_CAT[f.raw];if(cat)buckets[cat].push(sc);
  }
  if(detail.length){patch.self_assessment_detail=detail;const avg={};for(const k in buckets)if(buckets[k].length)avg[k]=tdPyRound(tdSum(buckets[k])/buckets[k].length,2);patch.self_assessment=avg;}
  else{if(inp.self_assessment_detail)remove.push("self_assessment_detail");if(inp.self_assessment)remove.push("self_assessment");}
  const refl=[];IF_OPEN.forEach((q,i)=>{const a=(w.open[i]||"").trim();if(a)refl.push({vraag:q,antwoord:a});});
  if(refl.length)patch.self_reflection=refl;else if(inp.self_reflection)remove.push("self_reflection");
  // sport-referentie: alle rijen (zoals het blad), eigen waarde of null, referenties per geslacht, doel op eigen niveau
  const refs=r=>gender==="F"?r.refV:r.refM;const lvl=IF_NIVEAUS.indexOf(patch.target_level);
  const item=r=>{
    const v=(w.ref[r.naam]||{}).waarde,d=(w.ref[r.naam]||{}).datum;let jouw=null;
    if(v!=null&&String(v).trim()!==""){
      if(r.tijd){if(!ifTijdOk(v)){fouten.push(r.naam+": tijd als m:ss, bijvoorbeeld 6:40");}else jouw=String(v).trim();}
      else{const n=ifGetal(v);if(n===undefined)fouten.push(r.naam+": getal verwacht");else jouw=n;}
    }
    const rf=refs(r);const o={naam:r.naam,jouw_waarde:jouw,open:rf[0],quarterfinal:rf[1],semifinal:rf[2],games:rf[3]};
    if(d&&String(d).trim())o.datum=String(d).trim();
    o.doel=rf[lvl];
    return o;
  };
  const maxLifts=IF_REF_FLAT.filter(r=>r.kind==="lift").map(item),cond=IF_REF_FLAT.filter(r=>r.kind==="cond").map(item);
  const eigen=maxLifts.concat(cond).filter(x=>x.jouw_waarde!=null).length;
  if(eigen)patch.sport_reference={max_lifts:maxLifts,conditioning:cond};else if(inp.sport_reference)remove.push("sport_reference");
  // de elf canonieke testwaarden uit het referentieblad (parse_ref_basics): alleen zetten als ingevuld
  for(const r of IF_REF_FLAT){const k=IF_REF_KEY[r.naam];if(!k)continue;const it=maxLifts.concat(cond).find(x=>x.naam===r.naam);if(it&&it.jouw_waarde!=null)patch[k]=it.jouw_waarde;}
  // mentale prestatie
  const mp=[];for(const f of IF_MP_FLAT){const v=w.mp[f.vraag];if(!v||v.score==="")continue;const sc=parseInt(v.score,10);if(!(sc>=1&&sc<=5))continue;mp.push({category:f.category,vraag:f.vraag,score:sc,toelichting:v.note&&v.note.trim()?v.note.trim():null});}
  if(mp.length)patch.mental_performance=mp;else if(inp.mental_performance)remove.push("mental_performance");
  // doelen (zelfde opbouw als parse_goal_setting)
  const t=s=>(s||"").trim();
  const values=w.goals.values.filter(v=>t(v.value)||t(v.why)).map(v=>({value:t(v.value)||null,why:t(v.why)||null}));
  const outcome=w.goals.g.map(g=>{const o={};if(t(g.goal))o.goal=t(g.goal);if(t(g.timeline))o.timeline=t(g.timeline);const obs=g.obstacles.map(t).filter(Boolean);if(obs.length)o.obstacles=obs;if(t(g.alignment))o.alignment=t(g.alignment);return o;}).filter(o=>Object.keys(o).length);
  const proc=w.goals.p.filter(p=>t(p.goal)||t(p.obstacle)||t(p.measure)).map(p=>{const o={};if(t(p.goal))o.goal=t(p.goal);if(t(p.obstacle))o.obstacle=t(p.obstacle);if(t(p.measure))o.measure=t(p.measure);if(t(p.frequency))o.frequency=t(p.frequency);return o;});
  if(values.length||outcome.length||proc.length)patch.goal_setting={values,outcome_goals:outcome,process_goals:proc};else if(inp.goal_setting)remove.push("goal_setting");
  // praktisch (vorm van read_practical)
  const days=w.pr.days.filter(d=>d.on).map(d=>{const m=ifGetal(d.min);if(m===undefined)fouten.push("Minuten op "+d.day+" moet een getal zijn");return {day:d.day,min:m==null?null:m,double:!!d.double,time:t(d.time),note:t(d.note)};});
  const have=t(w.pr.equipment).split(",").map(s=>s.trim()).filter(Boolean),missing=t(w.pr.equipment_missing).split(",").map(s=>s.trim()).filter(Boolean);
  const injuries=w.pr.injuries.filter(i=>t(i.what)).map(i=>({what:t(i.what),since:t(i.since),status:t(i.status),treated:t(i.treated),note:t(i.note)}));
  const sleep=ifGetal(w.pr.sleep);if(sleep===undefined)fouten.push("Slaap moet een getal zijn (uren)");
  const minWeek=Math.trunc(tdSum(days.map(d=>d.min||0)));
  const pr={days,n_days:days.length,min_week:minWeek||null,doubles:days.filter(d=>d.double).map(d=>d.day),where:t(w.pr.where),equipment:have,equipment_missing:have.length?missing:[],equipment_note:t(w.pr.equipment_note),injuries,wearable:t(w.pr.wearable),hr_strap:!!w.pr.hr_strap,sleep:sleep==null?null:sleep,work:t(w.pr.work)};
  const prFilled=days.length||pr.where||have.length||injuries.length||pr.wearable||pr.sleep||pr.work;
  if(prFilled)patch.practical=pr;else if(inp.practical)remove.push("practical");
  if(!inp.template)patch.template="onboarding-kyle";
  patch.intake_source="Intake-formulier in de app (bijgewerkt "+vandaag+" via dashboard)"+(inp.intake_source&&!String(inp.intake_source).startsWith("Intake-formulier")?"; eerder: "+inp.intake_source:"");
  return {patch,remove,fouten};
}

// ======================= scherm =======================
function ifOpen(id){
  const row=(typeof TDS!=="undefined"?TDS.rows:[]).find(r=>r.id===id);if(!row)return;
  IF.id=id;IF.werk=ifVanInput(row.input||{});IF.tab="basis";
  if(typeof ikSluit==="function")ikSluit();
  ifTeken();
}
function ifSluit(){IF.id=null;IF.werk=null;const h=document.getElementById("td-intake-paneel");if(h)h.innerHTML="";}
function ifHost(){if(typeof ikPaneelHost==="function")return ikPaneelHost();return document.getElementById("td-intake-paneel");}
function ifTab(t){ifLees();IF.tab=t;ifTeken();}
function ifTeken(){
  const h=ifHost();if(!h||!IF.werk)return;
  const row=TDS.rows.find(r=>r.id===IF.id);const naam=row?row.name:"";
  const tabs=IF_TABS.map(t=>'<button type="button" class="td-chip'+(IF.tab===t[0]?" on":"")+'" onclick="ifTab(\''+t[0]+'\')">'+esc(t[1])+'</button>').join("");
  h.innerHTML='<div class="td-form td-intake if-form" id="if-form">'+
    '<div class="td-f-h">Intake-formulier: '+esc(naam)+' <span class="td-norm-basis">(dezelfde velden als Michels NL-onboarding; leeg = niet ingevuld)</span></div>'+
    '<div class="td-toolbar" style="margin-bottom:8px">'+tabs+'</div>'+
    '<div id="if-tab">'+ifTabHtml()+'</div>'+
    '<div class="td-f-acties"><button class="btn sm" onclick="ifOpslaan()">Opslaan</button><button class="btn ghost sm" onclick="ifSluit()">Annuleren</button><span class="td-hint" style="margin:0">Opslaan bewaart alle tabbladen tegelijk.</span></div>'+
  '</div>';
  h.scrollIntoView({block:"start"});
}
function ifInp(id,val,extra){return '<input class="lid-in" id="'+id+'" value="'+esc(val==null?"":val)+'"'+(extra||"")+'>';}
function ifScoreSel(id,val,schaal){return '<select class="lid-in if-score" id="'+id+'" title="'+esc((schaal||[]).map((s,i)=>(i+1)+" = "+s).join("\n"))+'"><option value="">–</option>'+[1,2,3,4,5].map(n=>'<option'+(String(val)===String(n)?" selected":"")+'>'+n+'</option>').join("")+'</select>';}
function ifTabHtml(){
  const w=IF.werk,t=IF.tab;
  if(t==="basis"){
    const row=TDS.rows.find(r=>r.id===IF.id);const g=(row&&row.input&&row.input.gender)||"M";
    return '<div class="td-f-grid">'+
      '<label>Lichaamsgewicht (kg)'+ifInp("if-bw",w.bw,' placeholder="bijv. 82.5"')+'</label>'+
      '<label>Doelniveau<select class="lid-in" id="if-level">'+IF_NIVEAUS.map(n=>'<option'+(w.target_level===n?" selected":"")+'>'+n+'</option>').join("")+'</select></label>'+
      '<label>Geslacht (uit de kaart)<input class="lid-in" value="'+(g==="F"?"Vrouw":"Man")+'" disabled></label>'+
      '</div><div class="td-hint">Het doelniveau stuurt de kolom Doel bij Max lifts & benchmarks en de intake-kaart. Geslacht pas je aan via Bewerken op de kaart; het bepaalt welke referentietabel geldt.</div>';
  }
  if(t==="sa"){
    let html='<div class="td-hint" style="margin:0 0 6px">Beoordeel elke beweging 1 tot 5 op het huidige niveau. '+IF_SCHAAL.map((s,i)=>(i+1)+" = "+esc(s)).join(" · ")+'</div><table class="td-table if-table"><thead><tr><th>Beweging</th><th>Context</th><th>Score</th><th>Toelichting (optioneel)</th></tr></thead><tbody>';
    let i=0;
    for(const c of IF_SA){html+='<tr class="td-sectie"><td colspan="4">'+esc(c[0])+'</td></tr>';for(const it of c[1]){const v=w.sa[ifSleutel(it[0],it[1])]||{};html+='<tr><td>'+esc(it[0])+'</td><td class="muted">'+esc(it[1])+'</td><td>'+ifScoreSel("if-sa-"+i+"-score",v.score,IF_SCHAAL)+'</td><td>'+ifInp("if-sa-"+i+"-note",v.note)+'</td></tr>';i++;}}
    html+='<tr class="td-sectie"><td colspan="4">'+esc(IF_PAT_RAW)+'</td></tr>';
    for(const p of IF_PATRONEN){const v=w.sa[ifSleutel(p,"")]||{};html+='<tr><td colspan="2">'+esc(p)+'</td><td>'+ifScoreSel("if-sa-"+i+"-score",v.score,IF_SCHAAL)+'</td><td>'+ifInp("if-sa-"+i+"-note",v.note)+'</td></tr>';i++;}
    html+='</tbody></table><div class="td-f-h">Open vragen</div>';
    IF_OPEN.forEach((q,j)=>{html+='<div class="td-f-row"><label style="width:260px;flex:none;white-space:normal">'+esc(q)+'</label><textarea class="lid-in" id="if-open-'+j+'" rows="2" style="flex:1">'+esc(w.open[j]||"")+'</textarea></div>';});
    return html;
  }
  if(t==="ref"){
    const row=TDS.rows.find(r=>r.id===IF.id);const g=(row&&row.input&&row.input.gender)||"M";
    const lvl=IF_NIVEAUS.indexOf(w.target_level);
    const rij=(r,i)=>{const v=w.ref[r.naam]||{};const rf=g==="F"?r.refV:r.refM;return '<tr><td>'+esc(r.naam)+'</td><td>'+ifInp("if-ref-"+i+"-w",v.waarde,' style="width:90px" placeholder="'+(r.tijd?"m:ss":(r.kind==="lift"?"kg":""))+'"')+'</td><td>'+ifInp("if-ref-"+i+"-d",v.datum,' style="width:120px" placeholder="jjjj-mm-dd of 2024"')+'</td>'+rf.map((x,k)=>'<td class="'+(k===lvl?"if-doel":"muted")+'">'+esc(x)+'</td>').join("")+'</tr>';};
    let html='<div class="td-hint" style="margin:0 0 6px">Beste huidige cijfers (kg, tijden als m:ss, Echo Bike in calorieën, Bike Erg in watt). Referentiewaarden: Kyle\'s tabel voor '+(g==="F"?"vrouwen":"mannen")+'; de kolom van het doelniveau is gemarkeerd. Datum getest: jjjj-mm-dd, een jaartal of bijv. "3 maanden geleden".</div>';
    html+='<table class="td-table if-table"><thead><tr><th>Lift</th><th>Jouw max</th><th>Datum getest</th>'+IF_NIVEAUS.map(n=>'<th>'+n+'</th>').join("")+'</tr></thead><tbody>';
    IF_REF_FLAT.forEach((r,i)=>{if(r.kind==="lift")html+=rij(r,i);});
    html+='</tbody></table><div class="td-f-h">Conditioning benchmarks</div><table class="td-table if-table"><thead><tr><th>Benchmark</th><th>Jouw score</th><th>Datum getest</th>'+IF_NIVEAUS.map(n=>'<th>'+n+'</th>').join("")+'</tr></thead><tbody>';
    IF_REF_FLAT.forEach((r,i)=>{if(r.kind==="cond")html+=rij(r,i);});
    html+='</tbody></table><div class="td-hint">De elf waarden die Michels script ook overneemt (back squat, front squat, deadlift, snatch, power clean, squat clean, split jerk, 5K run, 2K row, Echo Bike, Bike Erg) komen bij Opslaan ook in de testbatterij van de kaart.</div>';
    return html;
  }
  if(t==="mp"){
    let html='<div class="td-hint" style="margin:0 0 6px">Beoordeel elke mentale vaardigheid 1 tot 5. '+IF_MENTAL_SCHAAL.map((s,i)=>(i+1)+" = "+esc(s)).join(" · ")+'</div><table class="td-table if-table"><thead><tr><th>Vraag</th><th>Score</th><th>Toelichting (optioneel)</th></tr></thead><tbody>';
    let i=0;
    for(const c of IF_MENTAL){html+='<tr class="td-sectie"><td colspan="3">'+esc(c[0])+'</td></tr>';for(const q of c[1]){const v=w.mp[q]||{};html+='<tr><td>'+esc(q)+'</td><td>'+ifScoreSel("if-mp-"+i+"-score",v.score,IF_MENTAL_SCHAAL)+'</td><td>'+ifInp("if-mp-"+i+"-note",v.note)+'</td></tr>';i++;}}
    return html+'</tbody></table>';
  }
  if(t==="doelen"){
    const g=w.goals;
    let html='<div class="td-f-h">01 — Kernwaarden</div><div class="td-hint" style="margin:0 0 6px">Kies de top 3 tot 5 uit de lijst, of eigen waarden: '+esc(IF_WAARDEN)+'</div>';
    g.values.forEach((v,i)=>{html+='<div class="td-f-row"><label style="width:150px;flex:none">Waarde '+(i+1)+(i>=3?" (optioneel)":"")+'</label>'+ifInp("if-g-v"+i+"-value",v.value,' style="flex:1"')+'<label style="flex:none">Waarom belangrijk</label>'+ifInp("if-g-v"+i+"-why",v.why,' style="flex:2"')+'</div>';});
    html+='<div class="td-f-h">02 — Resultaatdoelen en obstakels</div>';
    g.g.forEach((o,i)=>{html+='<div class="td-ce"><div class="td-f-row"><label style="width:150px;flex:none">Doel '+(i+1)+': resultaatdoel</label>'+ifInp("if-g-g"+i+"-goal",o.goal,' style="flex:1"')+'</div><div class="td-f-row"><label style="width:150px;flex:none">Wanneer (tijdlijn)</label>'+ifInp("if-g-g"+i+"-timeline",o.timeline,' style="flex:1"')+'</div>'+o.obstacles.map((ob,j)=>'<div class="td-f-row"><label style="width:150px;flex:none">Obstakel '+(j+1)+(j===2?" (optioneel)":"")+'</label>'+ifInp("if-g-g"+i+"-ob"+j,ob,' style="flex:1"')+'</div>').join("")+'<div class="td-f-row"><label style="width:150px;flex:none">Verbinding met je waarden</label><textarea class="lid-in" id="if-g-g'+i+'-align" rows="2" style="flex:1">'+esc(o.alignment)+'</textarea></div></div>';});
    html+='<div class="td-f-h">04 — Procesdoelen</div>';
    g.p.forEach((p,i)=>{html+='<div class="td-ce"><div class="td-f-row"><label style="width:150px;flex:none">Procesdoel '+(i+1)+(i===2?" (optioneel)":"")+'</label>'+ifInp("if-g-p"+i+"-goal",p.goal,' style="flex:1"')+'</div><div class="td-f-row"><label style="width:150px;flex:none">Welk obstakel pak je aan?</label>'+ifInp("if-g-p"+i+"-obstacle",p.obstacle,' style="flex:1"')+'</div><div class="td-f-row"><label style="width:150px;flex:none">Hoe meet / volg je dit?</label>'+ifInp("if-g-p"+i+"-measure",p.measure,' style="flex:1"')+'</div><div class="td-f-row"><label style="width:150px;flex:none">Frequentie</label><select class="lid-in" id="if-g-p'+i+'-freq" style="width:auto"><option value="">–</option>'+IF_FREQ.map(f=>'<option'+(p.frequency===f?" selected":"")+'>'+esc(f)+'</option>').join("")+'</select></div></div>';});
    return html;
  }
  if(t==="pr"){
    const p=w.pr;
    let html='<div class="td-hint" style="margin:0 0 6px">Optioneel; dit tabblad voedt de gespreksvragen en het draaiboek van de intake-kaart.</div><div class="td-f-h">Trainingsdagen</div><table class="td-table if-table"><thead><tr><th>Dag</th><th>Beschikbaar</th><th>Minuten</th><th>Tweede sessie mogelijk</th><th>Tijdstip</th><th>Notitie</th></tr></thead><tbody>';
    p.days.forEach((d,i)=>{html+='<tr><td>'+esc(d.day)+'</td><td><input type="checkbox" id="if-pr-d'+i+'-on"'+(d.on?" checked":"")+'></td><td>'+ifInp("if-pr-d"+i+"-min",d.min,' style="width:70px"')+'</td><td><input type="checkbox" id="if-pr-d'+i+'-double"'+(d.double?" checked":"")+'></td><td>'+ifInp("if-pr-d"+i+"-time",d.time,' style="width:80px" placeholder="18:00"')+'</td><td>'+ifInp("if-pr-d"+i+"-note",d.note)+'</td></tr>';});
    html+='</tbody></table>';
    html+='<div class="td-f-row"><label style="width:150px;flex:none">Waar train je</label>'+ifInp("if-pr-where",p.where,' style="flex:1" placeholder="bijv. thuis, box, beide"')+'</div>';
    html+='<div class="td-f-h">Materiaal</div><div class="td-f-row"><label style="width:150px;flex:none">Aanwezig</label>'+ifInp("if-pr-eq",p.equipment,' style="flex:1" placeholder="komma\'s ertussen, bijv. roeier, echo bike, rig"')+'</div><div class="td-f-row"><label style="width:150px;flex:none">Ontbreekt</label>'+ifInp("if-pr-eqmissing",p.equipment_missing,' style="flex:1" placeholder="komma\'s ertussen"')+'</div><div class="td-f-row"><label style="width:150px;flex:none">Opmerking</label>'+ifInp("if-pr-eqnote",p.equipment_note,' style="flex:1"')+'</div>';
    html+='<div class="td-f-h">Blessures</div><div class="td-hint" style="margin:0 0 4px">Status "Oud, geen last meer" telt niet mee als actieve blessure.</div>';
    p.injuries.forEach((inj,i)=>{html+='<div class="td-f-row">'+ifInp("if-pr-i"+i+"-what",inj.what,' style="flex:1.2" placeholder="Wat"')+ifInp("if-pr-i"+i+"-since",inj.since,' style="width:90px" placeholder="Sinds"')+ifInp("if-pr-i"+i+"-status",inj.status,' style="flex:1" placeholder="Status" list="if-status-list"')+ifInp("if-pr-i"+i+"-treated",inj.treated,' style="flex:1" placeholder="Behandeld door"')+ifInp("if-pr-i"+i+"-note",inj.note,' style="flex:1.2" placeholder="Notitie"')+'</div>';});
    html+='<datalist id="if-status-list"><option value="Oud, geen last meer"></datalist>';
    html+='<div class="td-f-h">Herstel en werk</div><div class="td-f-grid">'+
      '<label>Wearable'+ifInp("if-pr-wearable",p.wearable,' placeholder="bijv. Garmin, Whoop, Geen"')+'</label>'+
      '<label>Hartslagband<select class="lid-in" id="if-pr-hr"><option value="0"'+(p.hr_strap?"":" selected")+'>nee</option><option value="1"'+(p.hr_strap?" selected":"")+'>ja</option></select></label>'+
      '<label>Slaap (uur per nacht)'+ifInp("if-pr-sleep",p.sleep,' placeholder="bijv. 7.5"')+'</label>'+
      '<label>Werk'+ifInp("if-pr-work",p.work,' placeholder="bijv. kantoor, 40 uur"')+'</label></div>';
    return html;
  }
  return "";
}
// Huidig tabblad teruglezen in de werkkopie.
function ifLees(){
  const w=IF.werk;if(!w||!document.getElementById("if-tab"))return;
  const v=id=>{const e=document.getElementById(id);return e?e.value:null;};
  const chk=id=>{const e=document.getElementById(id);return e?e.checked:false;};
  const t=IF.tab;
  if(t==="basis"){w.bw=v("if-bw")||"";w.target_level=v("if-level")||"Quarterfinal";}
  else if(t==="sa"){IF_SA_FLAT.forEach((f,i)=>{w.sa[ifSleutel(f.movement,f.context)]={score:v("if-sa-"+i+"-score")||"",note:v("if-sa-"+i+"-note")||""};});IF_OPEN.forEach((q,j)=>{w.open[j]=v("if-open-"+j)||"";});}
  else if(t==="ref"){IF_REF_FLAT.forEach((r,i)=>{w.ref[r.naam]={waarde:(v("if-ref-"+i+"-w")||"").trim(),datum:(v("if-ref-"+i+"-d")||"").trim()};});}
  else if(t==="mp"){IF_MP_FLAT.forEach((f,i)=>{w.mp[f.vraag]={score:v("if-mp-"+i+"-score")||"",note:v("if-mp-"+i+"-note")||""};});}
  else if(t==="doelen"){
    w.goals.values=w.goals.values.map((x,i)=>({value:v("if-g-v"+i+"-value")||"",why:v("if-g-v"+i+"-why")||""}));
    w.goals.g=w.goals.g.map((x,i)=>({goal:v("if-g-g"+i+"-goal")||"",timeline:v("if-g-g"+i+"-timeline")||"",obstacles:[0,1,2].map(j=>v("if-g-g"+i+"-ob"+j)||""),alignment:v("if-g-g"+i+"-align")||""}));
    w.goals.p=w.goals.p.map((x,i)=>({goal:v("if-g-p"+i+"-goal")||"",obstacle:v("if-g-p"+i+"-obstacle")||"",measure:v("if-g-p"+i+"-measure")||"",frequency:v("if-g-p"+i+"-freq")||""}));
  }else if(t==="pr"){
    w.pr.days=w.pr.days.map((d,i)=>({day:d.day,on:chk("if-pr-d"+i+"-on"),min:v("if-pr-d"+i+"-min")||"",double:chk("if-pr-d"+i+"-double"),time:v("if-pr-d"+i+"-time")||"",note:v("if-pr-d"+i+"-note")||""}));
    w.pr.where=v("if-pr-where")||"";w.pr.equipment=v("if-pr-eq")||"";w.pr.equipment_missing=v("if-pr-eqmissing")||"";w.pr.equipment_note=v("if-pr-eqnote")||"";
    w.pr.injuries=[0,1,2].map(i=>({what:v("if-pr-i"+i+"-what")||"",since:v("if-pr-i"+i+"-since")||"",status:v("if-pr-i"+i+"-status")||"",treated:v("if-pr-i"+i+"-treated")||"",note:v("if-pr-i"+i+"-note")||""}));
    w.pr.wearable=v("if-pr-wearable")||"";w.pr.hr_strap=v("if-pr-hr")==="1";w.pr.sleep=v("if-pr-sleep")||"";w.pr.work=v("if-pr-work")||"";
  }
}
async function ifOpslaan(){
  ifLees();
  const row=TDS.rows.find(r=>r.id===IF.id);if(!row){toast("Atleet niet gevonden");return;}
  const gender=(row.input&&row.input.gender)||"M";
  const {patch,remove,fouten}=ifNaarPatch(IF.werk,row.input||{},gender,tdsVandaag());
  if(fouten.length){toast(fouten[0]);return;}
  patch.updated=tdsUpdatedTekst(row.input&&row.input.updated,"intake","formulier");
  const ok=await tdsPatch(row.id,patch,remove);
  if(!ok)return;
  const naam=row.name;ifSluit();toast("Intake opgeslagen");
  if(!TDS.klant){TDS.naam=naam;TDS.zoek="";}
  const h=document.getElementById("data-inhoud");if(h&&!TDS.klant)tdsRender(h);else tdsGrid();
}
