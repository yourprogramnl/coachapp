// app/wedstrijdanalyse.js: Data › Wedstrijdanalyses en de wedstrijd-overlay per atleet.
// Port van Michels overlay_generator.py (stap 2 van Kyle Ruth's model): een demands-analyse
// per wedstrijd en divisie (tiers per bucket, programmeer-consequenties, workout-vormen, rode
// pen, cutoffs) × de testscores van een atleet geeft per bucket een label. Trefwoorden, drempels
// en regels zijn 1-op-1 van Michel; geen data = TESTEN, nooit een gok.
// De analyses staan in de tabel competition_demands (één rij per wedstrijd, editie en divisie).
// De overlay wordt in de browser uitgerekend (tdsOverlayVan in testdata.js), zodat hij meeloopt
// zodra een testwaarde verandert. Michels vaste kopieën (athlete_testdata.comp_overlay) blijven
// als terugval staan voor atleten zonder doelwedstrijd.
// De zuivere functies bovenaan raken DOM noch database; tools/overlay-check.js gebruikt ze om
// de uitkomst naast Michels eigen overlay te leggen.

const WA={rows:null,wods:null,bewerk:null,werk:null,fout:""};

// bucket-trefwoord → [testsleutels uit het dashboard-record, self-assessment-trefwoorden] (Michels BUCKET_MAP)
const WA_BUCKET_MAP=[
  ["erg",["row_2k","row_5k","row_1k","echo_bike","c2_20min"],["row","bike","ski","erg"]],
  ["swim",[],["swim","zwem"]],
  ["run",["run_5k","run_1_mile","run_10k"],["run","lopen"]],
  ["max-effort",["snatch","clean","jerk","front_squat","back_squat","deadlift"],[]],
  ["barbell cycling",["snatch","clean","deadlift","front_squat"],["barbell cycling","cycling"]],
  ["clean",["clean","power_clean"],["clean"]],
  ["front-rack",["front_squat","clean"],["thruster","front squat"]],
  ["thruster",["front_squat","strict_press"],["thruster"]],
  ["deadlift",["deadlift"],["deadlift"]],
  ["heavy rope",[],["double under","du","touw"]],
  ["double unders",[],["double under","du"]],
  ["odd object",[],["sandbag","d-ball","farmer","carry","odd"]],
  ["burpee",[],["burpee","box jump","bjo"]],
  ["box",[],["box jump","step over","bjo"]],
  ["handstand",["strict_hspu","strict_hspu_amrap"],["handstand","hspu","hsw"]],
  ["pull-up",["rmu","weighted_pullup","llrc"],["muscle up","chest to bar","pull-up","pull up","rope"]],
  ["pulling",["rmu","weighted_pullup","llrc"],["muscle up","chest to bar","rope"]],
  ["toes",["row_burpee_ttb"],["toes to bar","t2b"]],
  ["rope climb",["llrc"],["rope climb","legless"]],
  ["ghd",[],["ghd"]],
  ["pistol",[],["pistol"]],
  ["kb",[],["kettlebell","kb"]],
  ["dumbbell",["strict_press"],["dumbbell","db "]],
  ["belast",[],["vest","weight vest","backpack"]],
];
// Tests die "niet getest" melden als ze ontbreken (Michels lijst in evidence_for).
const WA_NIET_GETEST=new Set(["strict_hspu","rmu","weighted_pullup","llrc","snatch","clean","deadlift","row_2k","echo_bike"]);
const WA_ORDER={"PRIORITEIT":0,"TESTEN":1,"EXPOSURE":2,"BESCHERMEND VOLUME":3,"ONDERHOUD":4};
const WA_LEVELS=[["finals","Finale"],["qualifier","Kwalificatie"]];

// unicodedata.normalize("NFKD") + ascii-ignore + lower: accenten en alle niet-ascii-tekens vallen weg.
function waNorm(s){return String(s==null?"":s).normalize("NFKD").replace(/[^\x00-\x7f]/g,"").toLowerCase();}
function waFix2(x){return tdPyRound(Number(x),2).toFixed(2);} // f"{x:.2f}" met Pythons afronding
function waPlus0(x){ // f"{x:+.0f}": afronden op heel getal met teken; -0.4 wordt "-0" zoals in Python
  const r=tdPyRound(Number(x),0);
  if(r===0||Object.is(r,-0))return x<0?"-0":"+0";
  return (r>0?"+":"")+String(r);
}
function waPyFloat(s){ // float(str) in Python: alleen echte getallen, anders null (ValueError)
  const t=String(s==null?"":s).trim();
  if(!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t))return null;
  const f=parseFloat(t);return isFinite(f)?f:null;
}

// ---------- bewijs en label per bucket (Michels evidence_for en label) ----------
function waEvidence(bucket,athlete){
  const b=waNorm(String(bucket||"").replace(/\(.*?\)/g,""));
  const keys=new Set(),selfkw=new Set();
  for(const [kw,tk,sk] of WA_BUCKET_MAP){if(b.includes(kw)){tk.forEach(k=>keys.add(k));sk.forEach(k=>selfkw.add(k));}}
  const tests=(athlete&&athlete.tests)||{};
  const parts=[],scores=[];
  for(const k of keys){
    const t=tests[k];
    const label=(t&&t.label!=null)?t.label:k;
    if(t&&t.result!=null&&t.score!=null){
      parts.push(label+" "+String(t.result)+(t.unit==="tijd"?"":" "+String(t.unit==null?"":t.unit))+" ("+waFix2(t.score)+")");
      scores.push(Number(t.score));
    }else if(t&&t.result==null&&WA_NIET_GETEST.has(k)){
      parts.push(label+": niet getest");
    }
  }
  const sa=athlete&&athlete.self_assessment_scores;
  if(sa&&typeof sa==="object"&&!Array.isArray(sa)){
    for(const mv of Object.keys(sa)){
      const nm=waNorm(mv);
      if([...selfkw].some(kw=>nm.includes(kw))){
        const v=Number(sa[mv]);
        if(sa[mv]!==null&&sa[mv]!==""&&!isNaN(v)){parts.push("zelf: "+mv+" "+Math.trunc(v)+"/5");scores.push(0.6+(v-1)*0.15);} // 1→0.6, 3→0.9, 5→1.2
      }
    }
  }
  if(!scores.length)return {text:parts.length?parts.join("; "):"geen data",level:"geen",score:null};
  const m=tdPyRound(tdSum(scores)/scores.length,2);
  return {text:parts.join("; "),level:m>=1.0?"hoog":(m<0.9?"laag":"midden"),score:m};
}
function waLabel(tier,lvl){
  if(lvl==="geen")return "TESTEN";
  if(tier==="T1")return {laag:"PRIORITEIT",midden:"EXPOSURE",hoog:"BESCHERMEND VOLUME"}[lvl];
  if(tier==="T2")return {laag:"EXPOSURE",midden:"ONDERHOUD",hoog:"ONDERHOUD"}[lvl];
  return "ONDERHOUD";
}

// ---------- de demands-analyse (markdown volgens Michels prompt) inlezen ----------
// §2a (qualifier) en §2b (finals): rijen met een tier; §6: programmeer-consequenties (bucket,
// vloer, programmeer, stijl), de genummerde workout-vormen en de regel "Weglaten of onderhoud".
function waCells(line){return line.trim().replace(/^\|+/,"").replace(/\|+$/,"").split("|").map(c=>c.trim());}
function waParseDemands(md){
  const finals=[],qual=[];let sec=null;
  for(const line of String(md||"").split(/\r?\n/)){
    if(line.startsWith("### 2a"))sec=qual;
    else if(line.startsWith("### 2b"))sec=finals;
    else if(line.startsWith("## 3"))sec=null;
    if(sec!==null&&line.startsWith("|")&&(line.includes("**T1**")||line.includes(" T2 ")||line.includes("| T2 |")||line.includes("| T3 |")||line.includes("**T1** |"))){
      const cells=waCells(line);
      if(cells.length<4)continue;
      const name=cells[0].replace(/\*+/g,"").trim();
      let tier=cells[3].replace(/\*+/g,"").trim();
      if(!["T1","T2","T3"].includes(tier))tier=cells.map(c=>c.replace(/\*+/g,"").trim()).find(c=>["T1","T2","T3"].includes(c))||null;
      if(!tier)continue;
      sec.push({bucket:name,tier,count:cells[1],load:cells.length>4?cells[4]:"",volume:cells.length>5?cells[5]:""});
    }
  }
  return {finals,qual};
}
function waParseProgram(md){
  const txt=String(md||"");
  const i=txt.indexOf("## 6."),j=txt.indexOf("## 7.");
  if(i<0)return {rows:[],styles:[],omit:""};
  const sec=txt.slice(i,j>i?j:undefined);
  const rows=[],styles=[];let omit="";
  for(const line of sec.split(/\r?\n/)){
    if(line.startsWith("|")&&!line.startsWith("|---")&&!line.startsWith("| Bucket")){
      const c=waCells(line);
      if(c.length>=3)rows.push({bucket:c[0],floor:c[1],program:c[2],style:c.length>3?c[3].replace(/\*+/g,""):""});
    }
    const m=line.trim().match(/^(\d+)\.\s+(.*)$/);
    if(m)styles.push(m[2].replace(/\*+/g,"").trim());
    if(line.startsWith("**Wat je bewust weglaat")||line.startsWith("**Weglaten")){
      const after=line.includes(":")?line.slice(line.indexOf(":")+1):line;
      omit=after.replace(/\*+/g,"").trim();
    }
  }
  return {rows,styles,omit};
}
// Koppel een §2b-bucket aan een §6-rij op gedeelde kernwoorden (eerste woord, of 2+ tokens van 4+ letters).
function waMatchProgram(bucket,rows){
  const ALIAS=[["toes-to-bar","t2b"],["toes to bar","t2b"],["double unders","du"],["double-unders","du"],["dumbbell","db"],["handstand walk","hsw"],["ring muscle","rmu"]];
  const prep=x=>{x=waNorm(String(x==null?"":x).replace(/\(.*?\)/g,""));for(const [a,b2] of ALIAS)x=x.split(a).join(b2);return x;};
  const SHORT=new Set(["t2b","du","db","hsw","rmu","erg","c2b"]);
  const toks=x=>new Set(x.split(/[^a-z0-9]+/).filter(t=>t.length>=4||SHORT.has(t)));
  const ft=x=>(x.trim().split(/[^a-z0-9]+/)[0]||"");
  const b=prep(bucket),btoks=toks(b);
  let best=null,score=0;
  for(const r of (rows||[])){
    const rb=prep(r.bucket),rtoks=toks(rb);
    let shared=0;btoks.forEach(t=>{if(rtoks.has(t))shared++;});
    const first=ft(b)===ft(rb)&&ft(b)!=="";
    const sc=shared+(first?2:0);
    if((first||shared>=2)&&sc>score){best=r;score=sc;}
  }
  return best;
}
// Titelregel "# Wedstrijd — demands analysis (Divisie)" → wedstrijd en divisie.
function waTitelUitMd(md){
  const first=String(md||"").split(/\r?\n/).find(l=>l.startsWith("# "))||"";
  const m=first.replace(/^#\s*/,"").match(/^(.*?)\s+[—–-]+\s+demands analysis\s*\((.*?)\)\s*$/i);
  return m?{competition:m[1].trim(),division:m[2].trim()}:{competition:"",division:""};
}
// Hele analyse uit de markdown: buckets (finals + qualifier, met stijl/programmeer/vloer uit §6), workout-vormen, rode pen.
function waUitMd(md){
  const d=waParseDemands(md),p=waParseProgram(md),t=waTitelUitMd(md);
  // Alleen de finals-buckets krijgen stijl/programmeer/vloer uit §6 (zo doet Michels generator het ook);
  // de qualifier-rijen blijven leeg, de overlay gebruikt ze niet.
  const met=b=>{const pr=waMatchProgram(b.bucket,p.rows)||{};return Object.assign({level:"finals"},b,{style:pr.style||"",program:pr.program||"",floor:pr.floor||""});};
  return {competition:t.competition,division:t.division,buckets:d.finals.map(met).concat(d.qual.map(b=>Object.assign({level:"qualifier"},b,{style:"",program:"",floor:""}))),program:p.rows,styles:p.styles,omit:p.omit};
}

// ---------- cutoffs (Michels benchmarks.csv) ----------
function waParseCsv(text){
  const rows=[];let row=[],cell="",inQ=false;const s=String(text||"");
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(inQ){if(ch==='"'){if(s[i+1]==='"'){cell+='"';i++;}else inQ=false;}else cell+=ch;}
    else if(ch==='"')inQ=true;
    else if(ch===","){row.push(cell);cell="";}
    else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&s[i+1]==="\n")i++;row.push(cell);rows.push(row);row=[];cell="";}
    else cell+=ch;
  }
  if(cell!==""||row.length){row.push(cell);rows.push(row);}
  if(!rows.length)return [];
  const head=rows[0].map(h=>h.trim());
  return rows.slice(1).filter(r=>r.length>1&&r.some(c=>c!=="")).map(r=>{const o={};head.forEach((h,i)=>{o[h]=r[i]!==undefined?r[i]:"";});return o;});
}
const WA_CUTOFF_VELDEN=["competition","edition","level","division","event","format","cap_min","movements","n","winner","p5","p15","median","pct_capped","leverage"];
// Rijen uit de csv voor één wedstrijd (alle divisies en edities; de overlay filtert per atleet).
function waCutoffUitCsv(text,competition){
  return waParseCsv(text).filter(r=>waNorm(r.competition)===waNorm(competition)).map(r=>{const o={};WA_CUTOFF_VELDEN.forEach(k=>{o[k]=r[k]!==undefined?r[k]:"";});return o;});
}
function waGap(own,p15){
  const v=waPyFloat(String(p15==null?"":p15).replace("kg","").trim());
  if(v===null)return "";
  return waPlus0((own-v)/v*100)+"% t.o.v. 15e";
}
function waCutoffRows(cutoff,competition,division,athlete){
  const rows=[];const tests=(athlete&&athlete.tests)||{};
  const tv=k=>{const t=tests[k];return t?(t.result!=null?t.result:null):null;};
  for(const r of (cutoff||[])){
    if(waNorm(r.competition)!==waNorm(competition)||r.level!=="finals")continue;
    if(division&&waNorm(r.division)!==waNorm(division))continue;
    let own="",gap="";
    const mv=waNorm(r.movements),fmt=String(r.format||"").toLowerCase();
    if((mv.includes("snatch")&&fmt.includes("1"))||(mv.includes("snatch")&&fmt.includes("ladder"))){
      const v=tv("snatch");if(v){own="snatch 1RM "+v+" kg";gap=waGap(v,r.p15);}
    }else if(mv.includes("clean & jerk")||mv.includes("clean and jerk")){
      const c=tv("clean"),j=tv("jerk");
      if(c&&j){const m=Math.min(c,j);own="C&J ≈ "+m+" kg (clean "+c+" / jerk "+j+")";gap=waGap(m,r.p15);}
    }else if(mv.includes("1rm clean")||fmt.includes("emom 5")){
      const c=tv("clean");
      if(c){
        let p15v=r.p15?String(r.p15).trim().split(/\s+/)[0]:"";
        const f=waPyFloat(p15v);
        if(f!==null&&f>250&&String(r.format||"").includes("5")){p15v=tdFloatStr(tdPyRound(f/5,1));own="clean 1RM "+c+" kg (cutoff ≈ "+p15v+"/lift)";}
        else own="clean 1RM "+c+" kg";
        gap=waGap(c,p15v);
      }
    }
    rows.push({event:r.event,format:r.format,movements:r.movements,p5:r.p5,p15:r.p15,median:r.median,pct_capped:r.pct_capped,leverage:r.leverage,own,gap,edition:r.edition});
  }
  return rows;
}

// ---------- de overlay per atleet (Michels main) ----------
// athlete = dashboard-record (tdBuild), analysis = rij uit competition_demands,
// target = {division, date, role, next, note} uit input.comp_target, today = "jjjj-mm-dd".
function waOverlay(athlete,analysis,target,today){
  const t=target||{};
  const finals=(analysis.buckets||[]).filter(b=>(b.level||"finals")==="finals");
  const buckets=finals.map(b=>{
    const ev=waEvidence(b.bucket,athlete);
    const eigen=("style" in b)||("program" in b)||("floor" in b);
    const pr=eigen?null:(waMatchProgram(b.bucket,analysis.program||[])||{});
    return {bucket:b.bucket,tier:b.tier,count:b.count,load:b.load,volume:b.volume,evidence:ev.text,level:ev.level,label:waLabel(b.tier,ev.level),score:ev.score,
      style:eigen?(b.style||""):(pr.style||""),program:eigen?(b.program||""):(pr.program||""),floor:eigen?(b.floor||""):(pr.floor||"")};
  });
  buckets.sort((x,y)=>(WA_ORDER[x.label]-WA_ORDER[y.label])||tdCmpStr(String(x.tier),String(y.tier)));
  const division=t.division||analysis.division||"";
  const cut=waCutoffRows(analysis.cutoff,analysis.competition,division,athlete);
  let weeks="";
  if(t.date&&/^\d{4}-\d{2}-\d{2}$/.test(t.date)){
    const d=Date.UTC(+t.date.slice(0,4),+t.date.slice(5,7)-1,+t.date.slice(8,10)),n=Date.UTC(+today.slice(0,4),+today.slice(5,7)-1,+today.slice(8,10));
    weeks=Math.floor(Math.round((d-n)/86400000)/7);
  }
  const prioNow=(athlete.top_priorities||[]).map(p=>p.cat+": "+p.focus);
  return {competition:(String(analysis.competition||"")+" "+String(analysis.edition||"")).trim(),division,role:t.role||"doel",date:t.date||"",weeks_to_go:weeks,next:t.next||"",
    generated:today,demands_file:analysis.source_name||[analysis.competition,analysis.division].filter(Boolean).join(" "),
    buckets,cutoff:cut,history:[],current_priorities:prioNow,styles:analysis.styles||[],omit:analysis.omit||"",note:t.note||"",live:true};
}

// ---------- voorstel uit onze eigen wedstrijdtabel (Data › Wedstrijden) ----------
// Per groep van bewegingen (woordenboek WD_MOV in data.js) tellen in hoeveel workouts en edities
// hij voorkomt. Tier-regel, naar Michels operationalisatie: T1 = in elke editie (bij vier of meer
// edities mag er één missen), T2 = in meer dan de helft, T3 = de rest. De groepsnamen dragen
// Michels trefwoorden, zodat de bewijs-stap de juiste tests pakt. Het is een voorstel: Michel
// splitst fijner (zware cycling, heavy rope, vest) en schrijft zelf de stijl en de rode pen.
const WA_GROEPEN=[
  ["Erg (row, bike, ski)",["Row","BikeErg / Echo bike","SkiErg"]],
  ["Run (shuttles, lopen)",["Run"]],
  ["Max-effort barbell",[]],
  ["Barbell cycling",["Snatch","Clean","Jerk / S2OH","Thruster","Overhead squat","Front squat","Back squat","Deadlift","Bench press","Barbell lunge"]],
  ["Dumbbell / kettlebell",["DB snatch","DB thruster","DB clean/C&J","DB squat","DB box step-over","Devil press","DB lunge","KB swing"]],
  ["Wall ball",["Wall ball"]],
  ["Pull-up-familie (pull-up, C2B, BMU, RMU)",["Pull-up","Chest to bar","Bar muscle-up","Ring muscle-up"]],
  ["Rope climb (ook legless)",["Rope climb","Legless rope climb"]],
  ["Toes-to-bar",["Toes to bar"]],
  ["Handstand push-up (kipping, strict)",["HSPU","Deficit / strict HSPU"]],
  ["Handstand walk",["Handstand walk"]],
  ["Wall walk, handstand",["Wall walk"]],
  ["Ring dip",["Ring dip"]],
  ["Burpee",["Burpee"]],
  ["Box jump (over)",["Box jump (over)"]],
  ["Pistol",["Pistol"]],
  ["GHD sit-up",["GHD sit-up"]],
  ["Push-up",["Push-up"]],
  ["Double unders",["Double unders"]],
  ["Crossover single unders",["Crossover single unders"]],
  ["Odd object / carry (sandbag, d-ball, farmers, yoke, sled, worm)",["Sandbag / D-ball","Farmers carry","Yoke","Sled","Worm","Sandbag/odd carry"]],
  ["Peg board, pulling",["Peg board"]],
];
function waVoorstel(wods,sel){
  const rows=(wods||[]).filter(w=>w.event===sel.event&&(!sel.fase||w.fase===sel.fase)&&(!sel.divisie||w.divisie===sel.divisie||w.divisie==="Alle divisies"));
  const edities=[...new Set(rows.map(w=>w.jaar))].sort((a,b)=>a-b);
  const E=edities.length,N=rows.length;
  const level=sel.fase==="kwalificatie"?"qualifier":"finals";
  if(!N)return {buckets:[],edities,n:0,level};
  const bar=new Set((typeof WD_MOV!=="undefined")?Object.keys(WD_MOV).filter(m=>WD_MOV[m].mod==="bar"):[]);
  const groups=WA_GROEPEN.map(g=>({naam:g[0],leden:new Set(g[1]),wods:[],jaren:new Set(),loads:[]}));
  const maxEff=groups.find(g=>g.naam==="Max-effort barbell");
  const tel=(g,w)=>{g.wods.push(w);g.jaren.add(w.jaar);if(w.maxload!=null&&w.maxload!=="")g.loads.push(Number(w.maxload));};
  for(const w of rows){
    const ms=w.movements||[];
    for(const g of groups){
      if(g===maxEff)continue;
      if(g.naam==="Barbell cycling"&&w.format==="max lift")continue;
      if(ms.some(m=>g.leden.has(m)))tel(g,w);
    }
    if(w.format==="max lift"&&ms.some(m=>bar.has(m)))tel(maxEff,w);
  }
  const tier=e=>(e===E||(E>=4&&e>=E-1))?"T1":(e*2>E?"T2":"T3");
  const buckets=groups.filter(g=>g.wods.length).map(g=>{
    const e=g.jaren.size,lo=g.loads.length?Math.min(...g.loads):null,hi=g.loads.length?Math.max(...g.loads):null;
    const namen=g.wods.slice().sort((a,b)=>(a.jaar-b.jaar)||String(a.naam).localeCompare(String(b.naam))).map(w=>w.naam+" ("+w.jaar+")");
    return {level,bucket:g.naam,tier:tier(e),count:g.wods.length+"/"+N+" · "+e+"/"+E+" edities",load:lo!=null?(lo===hi?lo+" kg":lo+"–"+hi+" kg"):"—",volume:namen.join("; "),style:"",program:"",floor:""};
  });
  buckets.sort((a,b)=>a.tier.localeCompare(b.tier)||b.wods-a.wods||a.bucket.localeCompare(b.bucket));
  return {buckets,edities,n:N,level};
}

// ======================= scherm: Data › Wedstrijdanalyses =======================
async function waLaad(){
  WA.fout="";
  const q=await db.from("competition_demands").select("*").order("competition").order("edition").order("division");
  if(q.error){WA.fout=q.error.message||"fout";WA.rows=[];return;}
  WA.rows=q.data||[];
}
async function waWodsLaad(){
  if(WA.wods)return WA.wods;
  if(typeof WD!=="undefined"&&WD.wods&&WD.wods.length){WA.wods=WD.wods;return WA.wods;}
  const q=await db.from("competition_workouts").select("event,jaar,fase,naam,divisie,format,maxload,movements");
  WA.wods=q.error?[]:(q.data||[]);
  return WA.wods;
}
function waTitel(r){return [r.competition,r.edition].filter(Boolean).join(" ")+(r.division?" · "+r.division:"");}
function waLeeg(){return {id:null,competition:"",edition:"",division:"",source_name:"",source_md:"",buckets:[],program:[],styles:[],omit:"",cutoff:[],note:""};}
async function waRender(h){
  if(WA.rows===null){h.innerHTML='<div class="spin">Laden…</div>';await waLaad();}
  if(WA.werk){h.innerHTML='<div class="td-wrap">'+waEditorHtml()+'</div>';waVoorstelVul();return;}
  const rows=WA.rows||[];
  h.innerHTML='<div class="td-wrap">'+
    '<div class="td-toolbar"><span class="td-count" style="margin-left:0">'+rows.length+' analyses</span><span style="flex:1"></span><button class="btn sm" onclick="waNieuw()">+ Analyse</button></div>'+
    '<div class="td-hint" style="margin:0 0 12px">Een demands-analyse per wedstrijd en divisie (Kyle Ruth-model, Michels prompt): welke onderdelen elk jaar terugkomen (tier 1, 2, 3), hoe je ze programmeert, de workout-vormen en de rode pen. De wedstrijd-overlay op een atletenkaart (Bewerken › Doelwedstrijd) wordt hieruit live berekend.</div>'+
    (WA.fout?'<div class="td-card" style="margin-bottom:12px"><b>Laden mislukt.</b> '+esc(WA.fout)+'</div>':"")+
    (rows.length?'<div class="wa-lijst">'+rows.map(r=>'<div class="td-card wa-rij"><div><p class="td-name">'+esc(waTitel(r))+'</p><p class="td-meta">'+(r.buckets||[]).length+' buckets · '+(r.styles||[]).length+' workout-vormen · '+(r.cutoff||[]).length+' cutoff-rijen'+(r.source_name?' · bron '+esc(r.source_name):"")+' · bijgewerkt '+esc(String(r.updated_at||"").slice(0,10))+'</p></div><div><button class="td-editbtn" onclick="waBewerk(\''+esc(r.id)+'\')">Bewerken</button></div></div>').join("")+'</div>'
      :'<div class="td-leeg">Nog geen analyses. Plak Michels analyse als tekst, of maak een voorstel uit de wedstrijddata.</div>')+
  '</div>';
}
function waNieuw(){WA.werk=waLeeg();const h=document.getElementById("data-inhoud");if(h)waRender(h);}
function waBewerk(id){const r=(WA.rows||[]).find(x=>x.id===id);if(!r)return;WA.werk=JSON.parse(JSON.stringify(r));const h=document.getElementById("data-inhoud");if(h)waRender(h);}
function waSluit(){WA.werk=null;const h=document.getElementById("data-inhoud");if(h)waRender(h);}
function waEditorHtml(){
  const w=WA.werk;
  const inp=(id,val,ph,extra)=>'<input class="lid-in" id="'+id+'" value="'+esc(val||"")+'" placeholder="'+esc(ph||"")+'"'+(extra||"")+'>';
  const bRows=(w.buckets||[]).map((b,i)=>'<div class="wa-b" data-i="'+i+'">'+
    '<div class="td-f-row"><select class="lid-in" id="wa-b-'+i+'-level" style="width:120px">'+WA_LEVELS.map(l=>'<option value="'+l[0]+'"'+((b.level||"finals")===l[0]?" selected":"")+'>'+l[1]+'</option>').join("")+'</select>'+
      inp("wa-b-"+i+"-bucket",b.bucket,"Bucket (onderdeel)",' style="flex:1"')+
      '<select class="lid-in" id="wa-b-'+i+'-tier" style="width:70px">'+["T1","T2","T3"].map(t=>'<option'+(b.tier===t?" selected":"")+'>'+t+'</option>').join("")+'</select>'+
      inp("wa-b-"+i+"-count",b.count,"telling, bijv. 5/13",' style="width:120px"')+inp("wa-b-"+i+"-load",b.load,"load",' style="width:110px"')+
      '<button type="button" class="td-ce-x" title="Bucket verwijderen" onclick="waBucketWeg('+i+')">×</button></div>'+
    '<div class="td-f-row"><label style="width:60px;flex:none">Volume</label>'+inp("wa-b-"+i+"-volume",b.volume,"set size / volume per event",' style="flex:1"')+'</div>'+
    '<div class="td-f-row"><label style="width:60px;flex:none">Stijl</label>'+inp("wa-b-"+i+"-style",b.style,"de term voor in het programma",' style="flex:1"')+'</div>'+
    '<div class="td-f-row"><label style="width:60px;flex:none">Program.</label>'+inp("wa-b-"+i+"-program",b.program,"wat je programmeert",' style="flex:1"')+'</div>'+
    '<div class="td-f-row"><label style="width:60px;flex:none">Vloer</label>'+inp("wa-b-"+i+"-floor",b.floor,"hoe het op de vloer komt",' style="flex:1"')+'</div>'+
  '</div>').join("");
  return '<div class="td-toolbar"><span class="back" style="margin:0" onclick="waSluit()">‹ Alle analyses</span><span class="td-count" style="margin-left:12px">'+(w.id?esc(waTitel(w)):"Nieuwe analyse")+'</span></div>'+
  '<div class="td-form" id="wa-form">'+
    '<div class="td-f-h">Wedstrijd</div>'+
    '<div class="td-f-grid">'+
      '<label>Wedstrijd'+inp("wa-competition",w.competition,"bijv. Amsterdam Throwdown")+'</label>'+
      '<label>Editie (doeljaar)'+inp("wa-edition",w.edition,"bijv. 2026")+'</label>'+
      '<label>Divisie'+inp("wa-division",w.division,"bijv. Elite Women")+'</label>'+
      '<label>Bronnaam'+inp("wa-source",w.source_name,"bijv. Amsterdam TD - demands analysis (Elite Women).md")+'</label>'+
      '<label style="grid-column:1/-1">Kanttekening<input class="lid-in" id="wa-note" value="'+esc(w.note||"")+'" placeholder="bijv. loads en cutoff zijn dames-referentie"></label>'+
    '</div>'+
    '<div class="td-f-h">Analyse inlezen (markdown volgens Michels prompt)</div>'+
    '<div class="td-f-row"><textarea class="lid-in" id="wa-md" rows="4" style="flex:1" placeholder="Plak hier de hele analyse (met de tabellen van §2a/§2b en §6). Inlezen vult de buckets, de workout-vormen en de rode pen.">'+esc(w.source_md||"")+'</textarea></div>'+
    '<div class="td-f-acties" style="margin-top:4px"><button type="button" class="btn ghost sm" onclick="waMdInlezen()">Analyse inlezen</button><span class="td-hint" style="margin:0">Buckets die er al staan worden vervangen.</span></div>'+
    '<div class="td-f-h">Voorstel uit onze wedstrijddata (Data › Wedstrijden)</div>'+
    '<div class="td-f-row"><select class="lid-in" id="wa-v-event" onchange="waVoorstelVul()"><option value="">– wedstrijd –</option></select><select class="lid-in" id="wa-v-fase" onchange="waVoorstelVul()"><option value="finale">finale</option><option value="kwalificatie">kwalificatie</option></select><select class="lid-in" id="wa-v-div"><option value="">alle divisies</option></select><button type="button" class="btn ghost sm" onclick="waVoorstelMaak()">Voorstel maken</button></div>'+
    '<div class="td-hint" style="margin:0 0 6px">Telt per onderdeel in hoeveel workouts en edities het voorkomt. T1 = in elke editie (bij vier of meer edities mag er één missen), T2 = in meer dan de helft, T3 = de rest. Stijl, programmeer en rode pen blijven handwerk.</div>'+
    '<div class="td-f-h">Buckets (tier per onderdeel)</div><div id="wa-buckets">'+bRows+'</div>'+
    '<button type="button" class="btn ghost sm" onclick="waBucketBij()">+ Bucket</button>'+
    '<div class="td-f-h">Workout-vormen (handtekening van de wedstrijd), één per regel</div>'+
    '<div class="td-f-row"><textarea class="lid-in" id="wa-styles" rows="4" style="flex:1">'+esc((w.styles||[]).join("\n"))+'</textarea></div>'+
    '<div class="td-f-h">Rode pen (weglaten of onderhoud)</div>'+
    '<div class="td-f-row">'+inp("wa-omit",w.omit,"bijv. wall balls, sandbag, GHD, pistols, running, swim",' style="flex:1"')+'</div>'+
    '<div class="td-f-h">Cutoffs (15e plaats per event, uit Michels benchmarks.csv)</div>'+
    '<div class="td-f-row"><textarea class="lid-in" id="wa-csv" rows="3" style="flex:1" placeholder="Plak hier de csv (met kopregel). Alleen de rijen van deze wedstrijd worden bewaard; de overlay filtert per divisie van de atleet."></textarea><button type="button" class="btn ghost sm" onclick="waCsvInlezen()">Cutoffs inlezen</button></div>'+
    '<div class="td-hint" id="wa-cut-info" style="margin:0 0 6px">'+(w.cutoff||[]).length+' cutoff-rijen opgeslagen'+((w.cutoff||[]).length?' <button type="button" class="btn ghost sm" onclick="waCutoffLeeg()">Leegmaken</button>':"")+'</div>'+
    '<div class="td-f-acties"><button class="btn sm" onclick="waOpslaan()">Opslaan</button><button class="btn ghost sm" onclick="waSluit()">Annuleren</button><span style="flex:1"></span>'+(w.id?'<button class="btn ghost sm td-danger" onclick="waVerwijder()">Verwijder analyse</button>':"")+'</div>'+
  '</div>';
}
// Werkkopie bijwerken uit het formulier (vóór elke herteken-actie, zodat getypte tekst blijft).
function waWerkLees(){
  const w=WA.werk;if(!w||!document.getElementById("wa-form"))return w;
  const v=id=>{const e=document.getElementById(id);return e?e.value.trim():"";};
  w.competition=v("wa-competition");w.edition=v("wa-edition");w.division=v("wa-division");w.source_name=v("wa-source");w.note=v("wa-note");
  const md=document.getElementById("wa-md");if(md)w.source_md=md.value;
  w.styles=v("wa-styles").split("\n").map(s=>s.trim()).filter(Boolean);w.omit=v("wa-omit");
  w.buckets=[...document.querySelectorAll("#wa-buckets .wa-b")].map(el=>{const i=el.dataset.i;return {level:v("wa-b-"+i+"-level")||"finals",bucket:v("wa-b-"+i+"-bucket"),tier:v("wa-b-"+i+"-tier")||"T1",count:v("wa-b-"+i+"-count"),load:v("wa-b-"+i+"-load"),volume:v("wa-b-"+i+"-volume"),style:v("wa-b-"+i+"-style"),program:v("wa-b-"+i+"-program"),floor:v("wa-b-"+i+"-floor")};});
  return w;
}
function waHerteken(){const h=document.getElementById("data-inhoud");if(h)waRender(h);}
function waBucketBij(){waWerkLees();WA.werk.buckets.push({level:"finals",bucket:"",tier:"T1",count:"",load:"",volume:"",style:"",program:"",floor:""});waHerteken();}
function waBucketWeg(i){waWerkLees();WA.werk.buckets.splice(i,1);waHerteken();}
function waMdInlezen(){
  waWerkLees();const w=WA.werk;const md=w.source_md||"";
  if(!md.trim()){toast("Plak eerst de analyse");return;}
  const u=waUitMd(md);
  if(!u.buckets.length){toast("Geen tier-tabel gevonden (§2a/§2b met T1/T2/T3)");return;}
  if(w.buckets.length&&!confirm("De "+w.buckets.length+" bestaande buckets vervangen door de "+u.buckets.length+" uit de tekst?"))return;
  w.buckets=u.buckets;w.program=u.program;w.styles=u.styles;w.omit=u.omit;
  if(!w.competition&&u.competition)w.competition=u.competition;
  if(!w.division&&u.division)w.division=u.division;
  toast(u.buckets.length+" buckets, "+u.styles.length+" workout-vormen ingelezen");waHerteken();
}
function waCsvInlezen(){
  waWerkLees();const w=WA.werk;const txt=(document.getElementById("wa-csv")||{}).value||"";
  if(!txt.trim()){toast("Plak eerst de csv");return;}
  if(!w.competition){toast("Vul eerst de wedstrijd in; de csv wordt daarop gefilterd");return;}
  const rows=waCutoffUitCsv(txt,w.competition);
  if(!rows.length){toast("Geen rijen voor "+w.competition+" in de csv");return;}
  w.cutoff=rows;toast(rows.length+" cutoff-rijen ingelezen");waHerteken();
}
function waCutoffLeeg(){waWerkLees();WA.werk.cutoff=[];waHerteken();}
async function waVoorstelVul(){
  const se=document.getElementById("wa-v-event"),sd=document.getElementById("wa-v-div"),sf=document.getElementById("wa-v-fase");if(!se||!sd||!sf)return;
  const wods=await waWodsLaad();
  if(!se.options.length||se.options.length===1){
    const events=[...new Set(wods.map(w=>w.event))].sort();
    const cur=WA.werk&&WA.werk.competition;
    se.innerHTML='<option value="">– wedstrijd –</option>'+events.map(e=>'<option'+(e===cur?" selected":"")+'>'+esc(e)+'</option>').join("");
  }
  const ev=se.value,fase=sf.value;
  const divs=[...new Set(wods.filter(w=>w.event===ev&&w.fase===fase).map(w=>w.divisie))].filter(d=>d!=="Alle divisies").sort();
  const curDiv=sd.value;
  sd.innerHTML='<option value="">alle divisies</option>'+divs.map(d=>'<option'+(d===curDiv?" selected":"")+'>'+esc(d)+'</option>').join("");
}
async function waVoorstelMaak(){
  waWerkLees();const w=WA.werk;
  const ev=(document.getElementById("wa-v-event")||{}).value,fase=(document.getElementById("wa-v-fase")||{}).value,div=(document.getElementById("wa-v-div")||{}).value;
  if(!ev){toast("Kies een wedstrijd");return;}
  const wods=await waWodsLaad();
  const p=waVoorstel(wods,{event:ev,fase,divisie:div});
  if(!p.n){toast("Geen workouts gevonden voor deze keuze");return;}
  if(w.buckets.length&&!confirm("De "+w.buckets.length+" bestaande buckets vervangen door het voorstel ("+p.buckets.length+" buckets uit "+p.n+" workouts, "+p.edities.length+" edities)?"))return;
  w.buckets=p.buckets;
  if(!w.competition)w.competition=ev;
  if(!w.division&&div)w.division=div;
  toast(p.buckets.length+" buckets voorgesteld uit "+p.n+" workouts ("+p.edities.join(", ")+")");waHerteken();
}
async function waOpslaan(){
  waWerkLees();const w=WA.werk;
  if(!w.competition){toast("Vul de wedstrijd in");return;}
  const payload={competition:w.competition,edition:w.edition||"",division:w.division||"",source_name:w.source_name||null,source_md:w.source_md||null,buckets:w.buckets,program:w.program||[],styles:w.styles,omit:w.omit||null,cutoff:w.cutoff||[],note:w.note||null};
  let q;
  if(w.id)q=await db.from("competition_demands").update(payload).eq("id",w.id).select("*").single();
  else q=await db.from("competition_demands").insert(Object.assign({company_id:ME.profile&&ME.profile.company_id,created_by:ME.user&&ME.user.id},payload)).select("*").single();
  if(q.error){toast("Opslaan mislukt: "+(q.error.message||""));return;}
  const row=q.data||Object.assign({},w,payload);
  WA.rows=(WA.rows||[]).filter(r=>r.id!==row.id).concat([row]).sort((a,b)=>waTitel(a).localeCompare(waTitel(b)));
  WA.werk=null;toast("Analyse opgeslagen");waHerteken();
}
async function waVerwijder(){
  const w=WA.werk;if(!w||!w.id)return;
  if(!confirm("Analyse "+waTitel(w)+" verwijderen? Atleten met deze doelwedstrijd vallen terug op hun vaste kopie, als die er is."))return;
  const q=await db.from("competition_demands").delete().eq("id",w.id);
  if(q.error){toast("Verwijderen mislukt: "+(q.error.message||""));return;}
  WA.rows=(WA.rows||[]).filter(r=>r.id!==w.id);WA.werk=null;toast("Analyse verwijderd");waHerteken();
}
