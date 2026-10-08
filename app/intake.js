// app/intake.js: een ingevulde intake-Excel (onboarding) inlezen in Data › Atleten.
// Port van Michels parse_onboarding.py (pipeline/onboarding): dezelfde tabbladen, cellen,
// vertaaltabellen, tijdreparaties en plausibiliteitsgrenzen. De Excel wordt in de browser
// gelezen (SheetJS, alleen geladen als het nodig is; in tools/onboarding-check.js via Node).
// Alleen mechanisch: cijfers en teksten uit het blad. Prio's, notities en synthese blijven
// coachwerk. Leeg blijft leeg, nooit een schatting. Drie templates: de oude NL (Testbatterij),
// de Engelse YourProgram-template (Test Battery) en de nieuwe NL Kyle-template (oktober 2026,
// zonder testbatterij; basisvelden op het referentieblad). Een los testweek-bestand (met een
// Testbatterij-tab) lees je als tweede upload in; lege cellen wissen nooit een bestaande waarde.
// De zuivere functies bovenaan raken DOM noch database.

const IK={bestand:null,data:null,voor:null,geslacht:""};

const IK_SHEETS={
  Testbatterij:["Testbatterij","Test Battery"],
  "Self-assessment":["Self-assessment","Self-Assessment"],
  "Mental performance":["Mental performance","Mental Performance"],
  "Sport-specifieke referentie":["Sport-specifieke referentie","Sport Reference"],
  "Goal Setting":["Goal Setting","Doelen"],
};
// Self-assessment categorie-koppen (kolom A) → radar-as. (SELF_ASSESSMENT_CATEGORY_MAP)
const IK_SA_CAT={
  "BARBELL — OLYMPIC LIFTING":"Weightlifting",
  "BARBELL — SQUATTING":"Strength",
  "BARBELL — PRESSING / SHOULDER-TO-OVERHEAD":"Strength",
  "BARBELL — PULLING":"Strength",
  "GYMNASTICS — PULLING":"Gymnastics",
  "GYMNASTICS — HANDSTAND / PRESSING":"Gymnastics",
  "GYMNASTICS — MIDLINE":"Gymnastics",
  "BASIC CROSSFIT MOVEMENTS":"CrossFit",
  "ODD OBJECT / STRONGMAN":"CrossFit",
  "DUMBBELL / KETTLEBELL":"CrossFit",
  "OVERIG":"Gymnastics",
  "CROSSFIT-SPECIFIEKE PATRONEN (mixed-modal, niet per beweging)":"CrossFit",
  "DUMBBELL":"CrossFit",
  "OTHER":"Gymnastics",
  "CROSSFIT-SPECIFIC PATTERNS (mixed-modal, not per movement)":"CrossFit",
};
// Engelse template → dezelfde interne (Nederlandse) sleutels als de NL-template. (EN_TO_CANONICAL)
const IK_EN_NL={
  "OTHER":"OVERIG",
  "CROSSFIT-SPECIFIC PATTERNS (mixed-modal, not per movement)":"CROSSFIT-SPECIFIEKE PATRONEN (mixed-modal, niet per beweging)",
  "Barbell cycling under fatigue (touch-and-go thrusters/cleans/snatches late in a metcon)":"Barbell cycling onder vermoeidheid (touch-and-go thrusters/cleans/snatches laat in een metcon)",
  "Barbell cycling combined with gymnastics on the rig (e.g. thrusters+pull-ups, cleans+bar muscle-ups)":"Barbell cycling gecombineerd met gymnastics aan het rek (bijv. thrusters+pull-ups, cleans+bar muscle-ups)",
  "Gymnastics under fatigue (kipping HSPU/T2B/muscle-ups when already out of breath)":"Gymnastics onder vermoeidheid (kipping HSPU/T2B/muscle-ups als je al buiten adem bent)",
  "Sprint capacity (<5 min all-out effort)":"Sprint-capaciteit (<5 min all-out effort)",
  "Long chippers/grinders (>15 min continuous work)":"Lange chippers/grinders (>15 min aaneengesloten werk)",
  "Pacing/strategy (can you hold an even or negative split in a long WOD)":"Pacing/strategie (kun je een even of negative split volhouden in een lange WOD)",
  "Transitions between stations (how fast/efficiently you switch movements)":"Transities tussen stations (hoe snel/efficiënt wissel je van beweging)",
  "Recovery between sets/rounds (how quickly your heart rate drops)":"Herstel tussen sets/rondes (hoe snel daalt je hartslag)",
  'Mental toughness at high intensity ("redlining")':'Mentale weerstand bij hoge intensiteit ("redlining")',
};
// Nieuwe NL-onboarding (Kyle-model): basisvelden op 'Sport-specifieke referentie'.
const IK_REF_BASICS={back_squat:"B6",front_squat:"B7",deadlift:"B10",snatch:"B11",power_clean:"B13",squat_clean:"B14",jerk:"B17",run_5k:"B23",row_2k:"B26",echo_bike:"B28",c2_20min:"B29"};
const IK_REF_TIME_ROW={run_5k:66,row_2k:63};
// Testbatterij: rijen met een tijd (m:ss) en ruime plausibiliteitsgrenzen in seconden.
const IK_TIME_ROWS={46:"30 RMU for time",52:"snatch 25 reps for time",55:"Fran-style: 5RFT Thrusters/Pull-ups",57:"Row/Burpee/TTB 30-20-10",63:"2K Row",64:"3K run",65:"1 Mile Run",66:"5K Run",67:"10K Run",68:"1K Row",69:"5K Row"};
const IK_TIME_BOUNDS={46:[60,900],52:[90,1500],55:[90,1800],57:[180,2400],63:[330,1500],64:[480,2400],65:[240,1200],66:[720,3600],67:[1500,7200],68:[140,700],69:[900,4200]};
const IK_TB_CELLS={deadlift:"C10",back_squat:"C7",front_squat:"C8",strict_press:"C26",cgbp:"C25",seal_row_8rm:"C28",power_clean:"C14",squat_clean:"C20",jerk:"C19",snatch:"C17",strict_hspu_amrap:"C41",strict_hspu_unbroken:"C42",weighted_pullup_extra:"C29",llrc:"C45",rmu:"C47",echo_bike:"C62",c2_20min:"C61",diane_amrap:"C56"};
const IK_TB_TIME_CELLS={row_2k:["C63",63],run_5k:["C66",66],fran_5rft:["C55",55],row_burpee_ttb:["C57",57]};
const IK_TB_SECTIONS={13:"Weightlifting",24:"Upper Strength",34:"Odd objects",40:"Gymnastics tester",49:"Barbell tester",54:"CrossFit tester",60:"Conditie tester"};
const IK_TEST_KEYS=["deadlift","back_squat","front_squat","strict_press","cgbp","seal_row_8rm","power_clean","squat_clean","jerk","snatch","strict_hspu_amrap","strict_hspu_unbroken","weighted_pullup_extra","llrc","rmu","echo_bike","row_2k","run_5k","c2_20min","fran_5rft","diane_amrap","row_burpee_ttb"];
const IK_LABEL={bw:"Lichaamsgewicht (kg)",target_level:"Doelniveau",deadlift:"Deadlift 1RM",back_squat:"Back squat 1RM",front_squat:"Front squat 1RM",strict_press:"Strict press 1RM",cgbp:"CGBP 1RM",seal_row_8rm:"Prone/seal row (6RM, als 8RM)",power_clean:"Power clean 1RM",squat_clean:"Squat clean 1RM",jerk:"Split jerk 1RM",snatch:"Snatch 1RM",strict_hspu_amrap:"Strict HSPU 5 min",strict_hspu_unbroken:"Strict HSPU unbroken",weighted_pullup_extra:"Weighted pull-up (extra kg)",llrc:"Legless rope climb 10 min",rmu:"RMU unbroken",echo_bike:"Echo bike 10 min (cal)",row_2k:"2K row",run_5k:"5K run",c2_20min:"Bike erg 20 min (watt)",fran_5rft:"Fran-style 5RFT",diane_amrap:"Diane-style 5 min",row_burpee_ttb:"Row/burpee/TTB 30-20-10"};

// ---------- cellen lezen (SheetJS) ----------
function ikWs(wb,key){for(const n of IK_SHEETS[key]){if(wb.Sheets[n])return wb.Sheets[n];}return null;}
function ikCel(ws,addr){const c=ws[addr];if(!c||c.t==="e"||c.v===undefined||c.v===null)return null;return c;}
function ikV(ws,addr){const c=ikCel(ws,addr);if(!c)return null;if(typeof c.v==="string"&&c.v==="")return null;return c.v;} // openpyxl .value
function ikS(v){return (typeof v==="string")?v:null;} // alleen tekst
function ikNum(v){return (typeof v==="number"||typeof v==="boolean");} // isinstance(v,(int,float))
function ikMaxRow(ws){const ref=ws["!ref"];if(!ref)return 0;return XLSX.utils.decode_range(ref).e.r+1;}
function ikCanon(v){return (typeof v==="string"&&IK_EN_NL[v])?IK_EN_NL[v]:v;}
function ikRepr(v){return typeof v==="string"?"'"+v+"'":(typeof v==="number"?tdFloatStr(v):String(v));}
function ikFmt(sec){if(sec==null)return null;const m=Math.floor(sec/60),s=sec%60;return m+":"+String(s).padStart(2,"0");}
// Tijdcel → [seconden, waarschuwing]. Zoals normalize_time_cell: duur-opmaak ([m]:ss, [h]:mm:ss) = timedelta;
// tijdstip-opmaak (h:mm) = legacy uur:minuut als minuut:seconde; tekst "m:ss"/"7,03"; kaal getal = minuten.seconden
// (de invoerfout waarbij 25 als 25 dagen werd gelezen).
function ikTijd(cell){
  if(!cell)return [null,null];
  const v=cell.v;
  if(cell.t==="n"&&typeof v==="number"){
    const z=String(cell.z||"");
    if(z.includes("["))return [Math.round(v*86400),null];
    if(z.includes(":")&&/[hms]/i.test(z)){const h=Math.floor(v*24),m=Math.floor(v*1440)%60;return [h*60+m,null];}
    if(v>0&&v<1)return [Math.round(v*86400),null];
    const minutes=Math.trunc(v),seconds=Math.round((v-minutes)*100);
    if(seconds>=60)return [null,"tijd "+ikRepr(v)+" als kaal getal ingevuld en niet betrouwbaar te herstellen (secondendeel >= 60)"];
    return [minutes*60+seconds,"tijd was als kaal getal "+ikRepr(v)+" ingevuld, gelezen als "+minutes+":"+String(seconds).padStart(2,"0")];
  }
  if(typeof v==="string"){
    if(!v.trim())return [null,null];
    const parts=v.trim().replace(/,/g,":").split(":").map(p=>p.trim());
    if(parts.some(p=>!/^[-+]?\d+$/.test(p)))return [null,"onleesbare tijd "+ikRepr(v)];
    const nums=parts.map(p=>parseInt(p,10));
    if(nums.length===2)return [nums[0]*60+nums[1],null];
    if(nums.length===3)return [nums[0]*3600+nums[1]*60+nums[2],null];
    return [null,"onleesbare tijd "+ikRepr(v)];
  }
  if(v instanceof Date)return [v.getHours()*60+v.getMinutes(),null];
  return [null,"onverwacht celtype "+(cell.t||typeof v)];
}
function ikGrens(sec,row,label){
  if(sec==null||!IK_TIME_BOUNDS[row])return null;
  const [lo,hi]=IK_TIME_BOUNDS[row];
  if(sec<lo||sec>hi)return label+": "+ikFmt(sec)+" valt buiten de plausibele range "+ikFmt(lo)+"-"+ikFmt(hi)+" — controleer handmatig";
  return null;
}
function ikT2s(cell){const [s]=ikTijd(cell);return ikFmt(s);} // tijdcel → "m:ss" of null
// _stringify: tijdcellen (opmaak met uren/minuten) → "m:ss"; gewone getallen en tekst blijven.
function ikStringify(cell){
  if(!cell)return null;
  if(cell.t==="n"&&typeof cell.v==="number"){const z=String(cell.z||"");if(z.includes("[")||(z.includes(":")&&/[hms]/i.test(z)))return ikT2s(cell);return cell.v;}
  if(cell.v instanceof Date)return ikT2s(cell);
  return (cell.v===""?null:cell.v);
}

// ---------- tabbladen ----------
function ikTestbatterij(ws){
  const out={bw:ikV(ws,"B3"),target_level:ikV(ws,"B5")||null};
  for(const k in IK_TB_CELLS)out[k]=ikV(ws,IK_TB_CELLS[k]);
  for(const k in IK_TB_TIME_CELLS)out[k]=ikT2s(ikCel(ws,IK_TB_TIME_CELLS[k][0]));
  const naam=ikV(ws,"B1");if(typeof naam==="string"&&naam.trim())out.name_in_sheet=naam.trim();
  return out;
}
function ikRefBasics(ws){
  const out={bw:ikV(ws,"I2"),target_level:ikV(ws,"I3")||null};
  IK_TEST_KEYS.forEach(k=>{out[k]=null;});
  for(const k in IK_REF_BASICS){
    const cel=ikCel(ws,IK_REF_BASICS[k]);if(!cel||cel.v==="")continue;
    out[k]=IK_REF_TIME_ROW[k]?ikT2s(cel):cel.v;
  }
  const naam=ikV(ws,"I1");if(typeof naam==="string"&&naam.trim())out.name_in_sheet=naam.trim();
  return out;
}
function ikTestbatterijFull(ws,warnings){
  const out=[];let sectie="Lower Strength";
  const max=ikMaxRow(ws);
  for(let r=7;r<=max;r++){
    if(IK_TB_SECTIONS[r]){sectie=IK_TB_SECTIONS[r];continue;}
    const naam=ikV(ws,"A"+r);if(!naam)continue;
    const scoreCel=ikCel(ws,"C"+r);if(!scoreCel||scoreCel.v==="")continue;
    const pct=ikV(ws,"E"+r),doelCel=ikCel(ws,"D"+r);
    if(IK_TIME_ROWS[r]){
      const label=IK_TIME_ROWS[r];
      const [scoreS,wScore]=ikTijd(scoreCel),[doelS,wDoel]=ikTijd(doelCel);
      if(wScore)warnings.push(label+" (C"+r+"): "+wScore);
      if(wDoel)warnings.push(label+" doel (D"+r+"): "+wDoel);
      for(const w of [ikGrens(scoreS,r,label),ikGrens(doelS,r,label+" doel")])if(w)warnings.push(w);
      const pctVal=(scoreS!==null&&doelS)?((doelS-scoreS)/doelS*100):null;
      out.push({section:sectie,naam,beschrijving:ikStringify(ikCel(ws,"B"+r)),score:ikFmt(scoreS),doel:ikFmt(doelS),percentage:pctVal!==null?tdPyRound(pctVal,1):null});
      continue;
    }
    out.push({section:sectie,naam,beschrijving:ikStringify(ikCel(ws,"B"+r)),score:ikStringify(scoreCel),doel:ikStringify(doelCel),percentage:ikNum(pct)?tdPyRound(pct*100,1):null});
  }
  return out;
}
function ikSelfAssessment(ws){
  const buckets={Strength:[],Weightlifting:[],Gymnastics:[],CrossFit:[]};let cat=null;
  const max=ikMaxRow(ws);
  for(let r=12;r<=max;r++){
    const a=ikV(ws,"A"+r),c=ikV(ws,"C"+r);
    if(a===null)continue;
    if(IK_SA_CAT[a]!==undefined){cat=IK_SA_CAT[a];continue;}
    if(cat&&ikNum(c))buckets[cat].push(c);
  }
  const out={};for(const k in buckets){if(buckets[k].length)out[k]=tdPyRound(tdSum(buckets[k])/buckets[k].length,2);}
  return out;
}
function ikSelfAssessmentDetail(ws){
  const out=[];let catLabel=null;const max=ikMaxRow(ws);
  for(let r=12;r<=max;r++){
    const a=ikV(ws,"A"+r),b=ikV(ws,"B"+r),c=ikV(ws,"C"+r),d=ikV(ws,"D"+r);
    if(a===null)continue;
    if(IK_SA_CAT[a]!==undefined){catLabel=String(ikCanon(a)).replace(" (mixed-modal, niet per beweging)","");continue;}
    if(ikNum(c))out.push({category:catLabel,movement:ikCanon(a),context:ikS(b),score:c,note:(typeof d==="string"&&d.trim())?d:null});
  }
  return out;
}
function ikSelfReflection(ws){
  const out=[];let open=false;const max=ikMaxRow(ws);
  for(let r=12;r<=max;r++){
    const a=ikV(ws,"A"+r);if(a===null)continue;
    if(typeof a==="string"&&["OPEN VRAGEN","OPEN QUESTIONS"].includes(a.trim().toUpperCase())){open=true;continue;}
    if(!open)continue;
    const c=ikV(ws,"C"+r),d=ikV(ws,"D"+r);
    const antwoord=(typeof c==="string"&&c.trim())?c:d;
    if(typeof antwoord==="string"&&antwoord.trim())out.push({vraag:a,antwoord:antwoord.trim()});
  }
  return out;
}
function ikMental(ws){
  const out=[];const max=ikMaxRow(ws);
  for(let r=12;r<=max;r++){
    const a=ikV(ws,"A"+r),b=ikV(ws,"B"+r),c=ikV(ws,"C"+r),d=ikV(ws,"D"+r);
    if(a===null||!ikNum(c))continue;
    out.push({category:a,vraag:ikS(b),score:c,toelichting:(typeof d==="string"&&d.trim())?d:null});
  }
  return out;
}
const IK_GOAL_LABELS={"DOEL 1":"GOAL 1","DOEL 2":"GOAL 2","RESULTAATDOEL":"OUTCOME GOAL","WANNEER (TIJDLIJN)":"TARGET TIMELINE","PROCESDOEL":"PROCESS GOAL","FREQUENTIE":"FREQUENCY"};
const IK_GOAL_PREFIXES=[["WAARDE ","VALUE "],["OBSTAKEL","OBSTACLE"],["PROCESDOEL ","PROCESS GOAL "],["DOEL 1 — HOE DIT VERBONDEN","GOAL 1 — HOW THIS CONNECTS"],["DOEL 2 — HOE DIT VERBONDEN","GOAL 2 — HOW THIS CONNECTS"],["WELK OBSTAKEL","WHICH OBSTACLE"],["HOE MEET / VOLG JE DIT","HOW WILL YOU MEASURE"]];
function ikGoals(ws){
  const answer=(r,cols)=>{for(const col of (cols||["B","C","D"])){const v=ikV(ws,col+r);if(typeof v==="string"&&v.trim())return v.trim();if(ikNum(v))return v;}return null;};
  const values=[],goals={1:{},2:{}},process={1:{},2:{},3:{}};
  let curGoal=null,curProc=null;const max=ikMaxRow(ws);
  for(let r=1;r<=max;r++){
    const a=ikV(ws,"A"+r);if(typeof a!=="string")continue;
    let label=a.split(/\s+/).join(" ").toUpperCase();
    label=IK_GOAL_LABELS[label]||label;
    for(const [nl,en] of IK_GOAL_PREFIXES){if(label.startsWith(nl)){label=en+label.slice(nl.length);break;}}
    if(label.startsWith("VALUE ")){const v=answer(r,["B"]),why=answer(r,["D"]);if(v||why)values.push({value:v,why});}
    else if(label==="GOAL 1"||label==="GOAL 2"){curGoal=parseInt(label.slice(-1),10);curProc=null;}
    else if(label.startsWith("PROCESS GOAL ")&&/\d/.test(label.slice(13,14))){curProc=parseInt(label.slice(13,14),10);curGoal=null;}
    else if(label.startsWith("GOAL 1 — HOW THIS CONNECTS")||label.startsWith("GOAL 2 — HOW THIS CONNECTS")){const val=answer(r);if(val)goals[parseInt(label.slice(5,6),10)].alignment=val;}
    else if(curGoal&&label==="OUTCOME GOAL")goals[curGoal].goal=answer(r);
    else if(curGoal&&label==="TARGET TIMELINE")goals[curGoal].timeline=answer(r);
    else if(curGoal&&label.startsWith("OBSTACLE")){const val=answer(r);if(val)(goals[curGoal].obstacles=goals[curGoal].obstacles||[]).push(val);}
    else if(curProc&&label==="PROCESS GOAL")process[curProc].goal=answer(r);
    else if(curProc&&label.startsWith("WHICH OBSTACLE"))process[curProc].obstacle=answer(r);
    else if(curProc&&label.startsWith("HOW WILL YOU MEASURE"))process[curProc].measure=answer(r);
    else if(curProc&&label==="FREQUENCY")process[curProc].frequency=answer(r);
  }
  const clean=d=>{const o={};for(const k in d)if(d[k])o[k]=d[k];return o;};
  const outcome=Object.values(goals).map(clean).filter(g=>Object.keys(g).length);
  const proc=Object.values(process).filter(p=>p.goal||p.obstacle||p.measure).map(clean);
  if(!values.length&&!outcome.length&&!proc.length)return null;
  return {values,outcome_goals:outcome,process_goals:proc};
}
function ikSportRef(ws){
  const sectie=(start,end)=>{
    const items=[];
    for(let r=start;r<=end;r++){
      const naam=ikV(ws,"A"+r);if(!naam)continue;
      const jouw=ikCel(ws,"B"+r);
      const it={naam,jouw_waarde:(jouw&&jouw.v!=="")?ikStringify(jouw):null,open:ikStringify(ikCel(ws,"D"+r)),quarterfinal:ikStringify(ikCel(ws,"E"+r)),semifinal:ikStringify(ikCel(ws,"F"+r)),games:ikStringify(ikCel(ws,"G"+r))};
      const extra={datum:ikStringify(ikCel(ws,"C"+r)),doel:ikStringify(ikCel(ws,"H"+r)),gap:ikV(ws,"I"+r)};
      for(const k in extra){const v=extra[k];if(v===null||v===undefined||v==="")continue;it[k]=(k==="gap"&&ikNum(v))?tdPyRound(v*100,1):v;}
      items.push(it);
    }
    return items;
  };
  return {max_lifts:sectie(6,17),conditioning:sectie(22,29)};
}
// Geslacht uit de titel van het referentieblad ("(Men)", "(mannen)", "(Women)", "(vrouwen)"); alleen een voorzet.
function ikGeslachtUit(wb){
  const ws=ikWs(wb,"Sport-specifieke referentie");const t=ws?String(ikV(ws,"A1")||""):"";
  if(/\((men|mannen)\)/i.test(t))return "M";if(/\((women|vrouwen)\)/i.test(t))return "F";return "";
}
// Hele werkmap → record in de vorm van Michels athletes_input (zonder gender/day; die kiest de coach).
function ikParse(wb){
  const wsTb=ikWs(wb,"Testbatterij"),wsSa=ikWs(wb,"Self-assessment"),wsRef=ikWs(wb,"Sport-specifieke referentie");
  const warnings=[];let tests,full,template;
  if(wsTb){tests=ikTestbatterij(wsTb);full=ikTestbatterijFull(wsTb,warnings);template="onboarding+testbatterij";}
  else if(wsRef){tests=ikRefBasics(wsRef);full=[];template="onboarding-kyle";}
  else throw new Error("Geen Testbatterij- en geen Sport-specifieke referentie-tab gevonden. Is dit een YourProgram-intake?");
  const out=Object.assign({},tests);
  if(wsSa){
    const sa=ikSelfAssessment(wsSa);if(Object.keys(sa).length)out.self_assessment=sa;
    out.self_assessment_detail=ikSelfAssessmentDetail(wsSa);
    out.self_reflection=ikSelfReflection(wsSa);
  }
  out.testbatterij_full=full;out.time_warnings=warnings;
  if(template!=="onboarding+testbatterij")out.template=template;
  const wsMp=ikWs(wb,"Mental performance");if(wsMp)out.mental_performance=ikMental(wsMp);
  if(wsRef)out.sport_reference=ikSportRef(wsRef);
  const wsGs=ikWs(wb,"Goal Setting");if(wsGs){const g=ikGoals(wsGs);if(g)out.goal_setting=g;}
  out._template=template;out._gender_hint=ikGeslachtUit(wb);
  return out;
}

// ---------- overnemen in de atleet ----------
// Testwaarden en basisvelden: standaard alleen lege velden invullen; met overschrijven ook bestaande.
// Intake-blokken (self-assessment, zelfreflectie, mentaal, sport-referentie, doelen, testbatterij)
// vervangen de oude versie als het bestand ze heeft. Lege cellen wissen nooit iets.
function ikPatch(data,huidig,overschrijven,bestandsnaam,vandaag){
  const patch={};
  const vul=(k,v)=>{if(v===null||v===undefined||v==="")return;if(overschrijven||huidig[k]===undefined||huidig[k]===null)patch[k]=v;};
  vul("bw",data.bw);vul("target_level",data.target_level);
  IK_TEST_KEYS.forEach(k=>vul(k,data[k]));
  if(data.self_assessment&&Object.keys(data.self_assessment).length)patch.self_assessment=data.self_assessment;
  for(const k of ["self_assessment_detail","self_reflection","mental_performance"])if(Array.isArray(data[k])&&data[k].length)patch[k]=data[k];
  if(data.sport_reference&&((data.sport_reference.max_lifts||[]).length||(data.sport_reference.conditioning||[]).length))patch.sport_reference=data.sport_reference;
  if(data.goal_setting)patch.goal_setting=data.goal_setting;
  if(Array.isArray(data.testbatterij_full)&&data.testbatterij_full.length)patch.testbatterij_full=data.testbatterij_full;
  if(data.template)patch.template=data.template;
  patch.intake_source="Onboarding intake - "+bestandsnaam+" ("+(data._template==="onboarding-kyle"?"NL Kyle-template":"template met testbatterij")+", ingelezen "+vandaag+" via dashboard)";
  return patch;
}

// ======================= scherm =======================
function ikLaadXlsx(){
  if(typeof XLSX!=="undefined")return Promise.resolve();
  return new Promise((res,rej)=>{
    const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload=()=>res();s.onerror=()=>rej(new Error("Excel-lezer (SheetJS) kon niet geladen worden"));document.head.appendChild(s);
  });
}
// Bestand kiezen (werkbalk Data › Atleten, of knop in het bewerkformulier met de atleet vooraf gekozen).
function ikKies(voorId){
  IK.voor=voorId||null;
  let inp=document.getElementById("td-intake-file");
  if(!inp){inp=document.createElement("input");inp.type="file";inp.id="td-intake-file";inp.accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";inp.style.display="none";inp.onchange=()=>ikBestand(inp);document.body.appendChild(inp);}
  inp.value="";inp.click();
}
async function ikBestand(inp){
  const f=inp.files&&inp.files[0];if(!f)return;
  try{await ikLaadXlsx();}catch(e){toast(e.message);return;}
  const buf=await f.arrayBuffer();
  ikVerwerk(buf,f.name);
}
function ikVerwerk(buf,naam){
  let wb;
  try{wb=XLSX.read(buf,{type:"array",cellNF:true,cellDates:false});}catch(e){toast("Dit bestand kan niet als Excel gelezen worden");return false;}
  let data;
  try{data=ikParse(wb);}catch(e){toast("Inlezen mislukt: "+e.message);return false;}
  IK.bestand=naam;IK.data=data;IK.geslacht=data._gender_hint||"";
  ikPaneelTeken();return true;
}
function ikPaneelHost(){
  let h=document.getElementById("td-intake-paneel");
  if(h)return h;
  const grid=document.getElementById("td-grid");if(!grid)return null;
  h=document.createElement("div");h.id="td-intake-paneel";grid.parentNode.insertBefore(h,grid);return h;
}
function ikSluit(){IK.data=null;IK.bestand=null;const h=document.getElementById("td-intake-paneel");if(h)h.innerHTML="";}
function ikPaneelTeken(){
  const h=ikPaneelHost();if(!h||!IK.data)return;
  const d=IK.data;
  const lijst=(typeof TDS!=="undefined"?TDS.rows:[]).slice().sort((a,b)=>a.name.localeCompare(b.name));
  const hint=(d.name_in_sheet||"").trim().toLowerCase();
  const match=hint?lijst.find(r=>r.name.trim().toLowerCase()===hint):null;
  const magNieuw=typeof TDS!=="undefined"&&TDS.magAlles!==false;
  const gekozen=IK.voor||(match?match.id:"")||"";
  const gevonden=["bw","target_level"].concat(IK_TEST_KEYS).filter(k=>d[k]!==null&&d[k]!==undefined&&d[k]!=="");
  const tekstWaarden=gevonden.filter(k=>k!=="target_level"&&typeof d[k]==="string"&&!/^\d{1,3}:[0-5]\d$/.test(d[k]));
  const rijen=gevonden.map(k=>'<tr><td>'+esc(IK_LABEL[k]||k)+'</td><td><b>'+esc(String(d[k]))+'</b>'+(tekstWaarden.includes(k)?' <span class="td-pct td-pct-orange">tekst, geen getal</span>':"")+'</td></tr>').join("");
  const tel=[["Self-assessment",(d.self_assessment_detail||[]).length,"bewegingen"],["Zelfreflectie",(d.self_reflection||[]).length,"antwoorden"],["Mentale prestatie",(d.mental_performance||[]).length,"vragen"],["Sport-referentie",d.sport_reference?(d.sport_reference.max_lifts||[]).filter(x=>x.jouw_waarde!=null).length+(d.sport_reference.conditioning||[]).filter(x=>x.jouw_waarde!=null).length:0,"eigen waarden"],["Doelen",d.goal_setting?((d.goal_setting.values||[]).length+(d.goal_setting.outcome_goals||[]).length+(d.goal_setting.process_goals||[]).length):0,"regels"],["Testbatterij (volledig)",(d.testbatterij_full||[]).length,"rijen"]];
  const waarsch=(d.time_warnings||[]).map(w=>'<li>'+esc(w)+'</li>').join("");
  h.innerHTML='<div class="td-form td-intake">'+
    '<div class="td-f-h">Intake-Excel inlezen: '+esc(IK.bestand)+' <span class="td-norm-basis">('+(d._template==="onboarding-kyle"?"NL Kyle-template, zonder testbatterij":"template met testbatterij")+(d.name_in_sheet?' · naam in het blad: '+esc(d.name_in_sheet):"")+')</span></div>'+
    (waarsch?'<div class="td-flags" style="margin-bottom:8px"><b>Let op bij de tijden:</b><ul style="margin:4px 0 0;padding-left:16px">'+waarsch+'</ul></div>':"")+
    '<div class="td-f-grid">'+
      '<label>Voor atleet<select class="lid-in" id="ik-voor" onchange="ikNieuwToggle()"><option value="">– kies –</option>'+lijst.map(r=>'<option value="'+esc(r.id)+'"'+(r.id===gekozen?" selected":"")+'>'+esc(r.name)+'</option>').join("")+(magNieuw?'<option value="__nieuw"'+(gekozen===""&&!match?"":"")+'>+ Nieuwe atleet</option>':"")+'</select></label>'+
      '<label>Testwaarden<select class="lid-in" id="ik-modus"><option value="vul">Alleen lege velden invullen</option><option value="over">Ook bestaande waarden overschrijven</option></select></label>'+
    '</div>'+
    '<div class="td-f-grid" id="ik-nieuw" style="display:none;margin-top:8px">'+
      '<label>Naam<input class="lid-in" id="ik-naam" value="'+esc(d.name_in_sheet||"")+'"></label>'+
      '<label>Geslacht<select class="lid-in" id="ik-gender"><option value="">– kies –</option><option value="M"'+(IK.geslacht==="M"?" selected":"")+'>Man</option><option value="F"'+(IK.geslacht==="F"?" selected":"")+'>Vrouw</option></select></label>'+
      '<label>Dag<select class="lid-in" id="ik-day"><option value="">– dag –</option>'+TDS_DAGEN.map(x=>'<option>'+x+'</option>').join("")+'</select></label>'+
    '</div>'+
    '<div class="td-f-h">Gevonden in het bestand</div>'+
    (rijen?'<table class="td-table" style="max-width:520px"><tbody>'+rijen+'</tbody></table>':'<div class="td-leeg-note">Geen testwaarden of basisgegevens gevonden.</div>')+
    '<div class="td-hint" style="margin-top:6px">'+tel.map(t=>esc(t[0])+": "+t[1]+" "+esc(t[2])).join(" · ")+'</div>'+
    '<div class="td-hint">Intake-blokken (self-assessment, zelfreflectie, mentaal, sport-referentie, doelen, testbatterij) vervangen de oude versie als het bestand ze heeft. Lege cellen wissen nooit een bestaande waarde. Prio\'s en notities schrijf je zelf.</div>'+
    '<div class="td-f-acties"><button class="btn sm" onclick="ikOvernemen()">Overnemen</button><button class="btn ghost sm" onclick="ikSluit()">Annuleren</button></div>'+
  '</div>';
  if(!gekozen&&magNieuw){const s=document.getElementById("ik-voor");if(s&&!match){s.value="__nieuw";}}
  ikNieuwToggle();
  h.scrollIntoView({block:"start"});
}
function ikNieuwToggle(){const s=document.getElementById("ik-voor"),n=document.getElementById("ik-nieuw");if(s&&n)n.style.display=s.value==="__nieuw"?"":"none";}
async function ikOvernemen(){
  const d=IK.data;if(!d)return;
  const v=id=>{const e=document.getElementById(id);return e?e.value.trim():"";};
  const voor=v("ik-voor");if(!voor){toast("Kies een atleet");return;}
  const overschrijven=v("ik-modus")==="over";
  if(voor==="__nieuw"){
    const name=v("ik-naam");if(!name){toast("Vul een naam in");return;}
    if(TDS.athletes[name]){toast("Er bestaat al een atleet met deze naam; kies die in de lijst");return;}
    const gender=v("ik-gender");if(!gender){toast("Kies het geslacht; de normen hangen ervan af");return;}
    const day=v("ik-day");if(!day){toast("Kies een dag (trainingsdag of groep)");return;}
    const input=Object.assign({gender,day,updated:tdsVandaag()+" (intake "+IK.bestand+" via dashboard)"},ikPatch(d,{},true,IK.bestand,tdsVandaag()));
    if(!input.target_level)input.target_level="Quarterfinal";
    const company=ME.profile&&ME.profile.company_id;
    const q=await db.from("athlete_testdata").insert({company_id:company,name,input}).select("id,name,profile_id,input,comp_overlay,updated_at").single();
    if(q.error){toast("Toevoegen mislukt: "+(q.error.message||""));return;}
    TDS.rows.push(q.data);tdsZetRij(q.data);ikSluit();toast("Atleet toegevoegd uit de intake");
    if(!TDS.klant){TDS.naam=name;TDS.zoek="";}
    const h=document.getElementById("data-inhoud");if(h&&!TDS.klant)tdsRender(h);else tdsGrid();
    return;
  }
  const row=TDS.rows.find(r=>r.id===voor);if(!row)return;
  const patch=ikPatch(d,row.input||{},overschrijven,IK.bestand,tdsVandaag());
  patch.updated=tdsUpdatedTekst(row.input&&row.input.updated,"intake",IK.bestand);
  const ok=await tdsPatch(row.id,patch,[]);
  if(!ok)return;
  ikSluit();toast(Object.keys(patch).length-2+" velden overgenomen");
  if(!TDS.klant){TDS.naam=row.name;TDS.zoek="";}
  const h=document.getElementById("data-inhoud");if(h&&!TDS.klant)tdsRender(h);else tdsGrid();
}
