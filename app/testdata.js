// app/testdata.js: Data › Atleten, het Athlete Testdata Dashboard.
// Overgenomen uit Michels "YourProgram Athlete Dashboard" (export 8 okt 2026): één kaart
// per atleet met testwaarden, normen, scores, SRI-badge, prioriteitenblokken, wedstrijddata
// en de intake-details. Data staat in de tabel athlete_testdata (één rij per atleet, de
// ruwe invoer in de kolom `input`); alle berekeningen gebeuren hier in de browser via
// tdBuild() uit app/testdata-engine.js (1-op-1 port van Michels dashboard_logic.py).
// Bewerken schrijft direct naar de database (rpc athlete_testdata_patch) en rekent de
// kaart meteen opnieuw door.
// Sinds 20 okt 2026 (verzoek Stefan): ook de klanten van een coach in de YourProgram-app krijgen
// zo'n kaart, gekoppeld aan hun account en gevuld uit wat er al in de app staat (Metingen & PR's,
// krachtlog, profiel). Zie het blok "testwaarden uit de app" onderaan. De dag (Michels vaste
// controledag) is sinds die datum optioneel: tdBuild krijgt dan een lege dag mee.

const TDS={rows:[],athletes:{},geladen:false,dag:"Alle",zoek:"",sort:"name",naam:"",klant:null,nieuwOpen:false,bewerk:null,compWerk:null,fout:"",
  app:{metrics:{},profiel:{},gesprekken:{},voorstel:{},open:null},klantenOpen:false};
// app.gesprekken = chat en dagreacties per gekoppeld account (laatste 30 dagen); app.voorstel = AI-samenvatting per kaart.
// naam = gekozen atleet in de naamkeuze (leeg = iedereen); klant = profiel-id als de kaart
// in het klantdossier staat (zijbalk > Data), dan tekent tdsGrid alleen die ene kaart.
// app.metrics / app.profiel = metingen en profielgegevens per gekoppeld account (profile_id);
// app.open = de atleet waarvan het paneel "Uit de app" openstaat; klantenOpen = het paneel
// "Kaarten voor klanten" bovenaan.

// Meting in de app (naam uit Metingen & PR's, METRICS_DEF in panelen.js) → sleutel in Michels invoer.
// `test` = de dashboard-sleutel (voor het label uit de engine); `soort` kg/cal = de hoogste meting telt
// (zoals "Huidig" in Metingen & PR's), tijd = de snelste. Alleen metingen met de passende eenheid tellen.
// Niet te koppelen (geen gelijke test in de app): run 5k/10k/1 mile, row 1k, strict HSPU, RMU, LLRC,
// de 5-minuten AMRAP's, Row/Burpee/TTB en de bike-erg FTP; die vult de coach na een testweek.
const TDS_APP_MAP=[
  {key:"deadlift",test:"deadlift",metrics:["Deadlift"],soort:"kg"},
  {key:"back_squat",test:"back_squat",metrics:["Back Squat 1RM"],soort:"kg"},
  {key:"front_squat",test:"front_squat",metrics:["Front Squat 1RM"],soort:"kg"},
  {key:"ohs",test:"ohs",metrics:["Overhead Squat"],soort:"kg"},
  {key:"strict_press",test:"strict_press",metrics:["Strict Press 1RM"],soort:"kg"},
  {key:"cgbp",test:"cgbp",metrics:["CGBP 1RM"],soort:"kg"},
  {key:"squat_clean",test:"clean",metrics:["Clean 1RM"],soort:"kg"},
  {key:"power_clean",test:"power_clean",metrics:["Power Clean 1RM"],soort:"kg"},
  {key:"jerk",test:"jerk",metrics:["Split Jerk"],soort:"kg"},
  {key:"snatch",test:"snatch",metrics:["Snatch 1RM"],soort:"kg"},
  {key:"weighted_pullup_extra",test:"weighted_pullup",metrics:["Weighted Pull-up 1RM"],soort:"kg",opm:"extra gewicht aan de gordel"},
  {key:"row_2k",test:"row_2k",metrics:["2k Row"],soort:"tijd"},
  {key:"row_5k",test:"row_5k",metrics:["5k Row"],soort:"tijd"},
  {key:"echo_bike",test:"echo_bike",metrics:["10 minute AirBike"],soort:"cal"},
];

// Dashboard-testsleutel → sleutel in de ruwe invoer (Michels athletes_input.json).
const TDS_INPUT_KEY={seal_row:"seal_row_8rm",strict_hspu:"strict_hspu_unbroken",weighted_pullup:"weighted_pullup_extra",clean:"squat_clean"};
const TDS_EDITABLE=["deadlift","back_squat","front_squat","ohs","strict_press","cgbp","seal_row",
  "clean","power_clean","jerk","snatch","strict_hspu","strict_hspu_amrap","weighted_pullup","llrc","rmu",
  "echo_bike","row_2k","run_5k","c2_20min","fran_5rft","diane_amrap","row_burpee_ttb",
  "row_1k","row_5k","run_10k","run_1_mile"];
const TDS_TIME=new Set(["row_2k","run_5k","fran_5rft","row_burpee_ttb","row_1k","row_5k","run_10k","run_1_mile"]);
const TDS_DAGEN=["Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
const TDS_TOPICS=["Strength","Weightlifting","Gymnastics","Conditioning","CrossFit"];
const TDS_NIVEAUS=["Open","Quarterfinal","Semifinal","Games"];
const TDS_TOPIC_LABEL={Strength:"Strength",Weightlifting:"Weightlifting",Gymnastics:"Gymnastics",Conditioning:"Conditioning",CrossFit:"CrossFit / mixed"};
const TDS_TOPIC_CLS={Strength:"td-p-strength",Weightlifting:"td-p-weightlifting",Gymnastics:"td-p-gymnastics",Conditioning:"td-p-conditioning",CrossFit:"td-p-crossfit"};
const TDS_OPEN_KEY="td_open_sections_v2"; // v2 (8 okt): iedereen start ingeklapt; open secties worden per atleet onthouden

// ---------- laden ----------
async function tdsLaad(){
  TDS.fout="";
  const q=await db.from("athlete_testdata").select("id,name,profile_id,input,comp_overlay,updated_at").order("name");
  if(q.error){TDS.fout=q.error.message||"fout";TDS.rows=[];TDS.athletes={};TDS.geladen=true;return;}
  TDS.rows=q.data||[];
  // Een coach ziet door de rechtenregel (RLS) alleen de atleten van zijn eigen klanten, tenzij hij het
  // recht "alle atleten" heeft (Coaches › ⋮ › Rechten). Zonder dat recht geen + Atleet en geen import.
  TDS.magAlles=true;
  if(typeof myRole==="function"&&myRole()==="coach"){const v=await db.from("athlete_testdata_viewers").select("profile_id").eq("profile_id",ME.user.id);TDS.magAlles=!!(v.data&&v.data.length);}
  if(typeof waLaad==="function"&&WA.rows===null)await waLaad(); // wedstrijdanalyses: doelwedstrijd-keuzelijst en live overlay
  await tdsAppLaad(); // metingen en profiel van de gekoppelde accounts (voor "Uit de app")
  TDS.athletes={};
  TDS.rows.forEach(r=>tdsZetRij(r));
  TDS.geladen=true;
}
function tdsZetRij(r){
  let rec;
  // Michels build() eist een dag; zonder vaste dag (optioneel sinds 20 okt 2026) krijgt hij een lege mee.
  try{rec=tdBuild(r.name,Object.assign({day:""},r.input||{}));}
  catch(e){console.error("tdBuild",r.name,e);rec={name:r.name,day:(r.input||{}).day||"",gender:(r.input||{}).gender||"M",bw:null,age:null,updated:"",tests:{},cat_scores:{},overall:null,filled:0,total:0,priorities:{},priorities_layers:{},crossfit_profile:"",crossfit_layers:[],sri_status:null,top_priorities:null,accessory_focus:null,comp:null,testbatterij_full:[],kapot:true};}
  rec.id=r.id;rec.input=r.input||{};rec.comp_overlay=r.comp_overlay||null;rec.profile_id=r.profile_id||null;
  TDS.athletes[r.name]=rec;
  return rec;
}
const tdsVandaag=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
const tdsLijst=()=>Object.values(TDS.athletes);

// ---------- weergave-hulpjes (zelfde drempels als Michels dashboard) ----------
function tdsScoreStatus(score){if(score==null)return null;if(score<0.5)return "Developing";if(score<0.8)return "Approaching";return "At standard";}
function tdsStatusCls(st){return st==="Developing"?"td-s-dev":st==="Approaching"?"td-s-close":st?"td-s-norm":"";}
function tdsBarKleur(st){return st==="Developing"?"var(--td-dev)":st==="Approaching"?"var(--td-close)":st?"var(--td-norm)":"var(--td-line)";}
function tdsFmt(v,unit){if(v==null)return "–";if(unit==="tijd")return v;if(unit==="%")return v+"%";return v+(unit?(" "+unit):"");}
function tdsPct(pct){
  if(pct===null||pct===undefined||Number.isNaN(pct))return "";
  const cls=pct>=0?"td-pct-green":(pct>=-10?"td-pct-orange":"td-pct-red");
  return '<span class="td-pct '+cls+'">'+(pct>0?"+":"")+pct+'%</span>';
}
function tdsBullets(txt){
  if(!txt)return [];
  const dayRe=/(?=\b(?:Ma|Di|Wo|Do|Vr|Za|Zo)\s+\d{1,2}\s*:)/g;
  let parts=String(txt).split(dayRe).map(s=>s.trim()).filter(Boolean);
  if(parts.length<2)parts=String(txt).split(/(?<=\.)\s+(?=[A-Z0-9])/).map(s=>s.trim()).filter(Boolean);
  return parts.length?parts:[String(txt)];
}
function tdsBulletBlok(label,txt){
  const items=tdsBullets(txt);if(!items.length)return "";
  if(items.length===1)return '<div class="td-today-row"><b>'+esc(label)+':</b>'+esc(items[0])+'</div>';
  return '<div class="td-today-row"><b>'+esc(label)+':</b></div><ul class="td-today-list">'+items.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>';
}
function tdsNote(txt,max){
  if(!txt)return "";
  const plain=String(txt).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
  const n=max||42;
  return plain.length>n?plain.slice(0,n-1).trimEnd()+"\u2026":plain;
}
// Elk tekstblok op de kaart zit achter een uitklapknop; lege blokken geven geen knop.
function tdsSec(key,title,note,body,cls){
  if(!body)return "";
  return '<details class="td-sec '+(cls||"")+'" data-sec="'+esc(key)+'"><summary><span class="td-sec-title">'+title+'</span>'+(note?'<span class="td-sec-note">'+esc(note)+'</span>':"")+'</summary><div class="td-sec-body">'+body+'</div></details>';
}

// ---------- detailtabellen ----------
function tdsTestTabel(rows,a){
  if(!rows||!rows.length)return "";
  const by={},order=[];
  for(const r of rows){if(!by[r.section]){by[r.section]=[];order.push(r.section);}by[r.section].push(r);}
  const filled=rows.filter(r=>r.score!=null).length;
  let html="";
  for(const sec of order){
    html+='<tr class="td-sectie"><td colspan="4">'+esc(sec)+'</td></tr>';
    for(const r of by[sec]){
      const label=esc(r.naam)+(r.beschrijving?' <span class="td-norm-basis">('+esc(r.beschrijving)+')</span>':"");
      let scoreCell,doelCell,pctCell;
      if(r.key&&TDS_EDITABLE.includes(r.key)&&a&&!a.kapot){
        const t=(a.tests&&a.tests[r.key])||null;
        const isTime=TDS_TIME.has(r.key);
        const val=t?(isTime?(t.result_display||""):(t.result!=null?t.result:"")):(r.score??"");
        scoreCell='<input type="text" class="td-edit" data-id="'+esc(a.id)+'" data-key="'+esc(r.key)+'" value="'+esc(val)+'" placeholder="'+(isTime?"m:ss":"–")+'">';
        const norm=t?t.norm:null;
        doelCell=norm!=null?(isTime?esc(t.norm_label||r.doel):Math.round(norm*10)/10):(r.doel??"–");
        let pct=null;
        if(t&&t.result!=null&&norm)pct=isTime?Math.round((norm-t.result)/norm*1000)/10:Math.round((t.result-norm)/norm*1000)/10;
        pctCell=tdsPct(pct);
      }else{
        scoreCell=esc(r.score??"–");doelCell=esc(r.doel??"–");pctCell=tdsPct(r.percentage);
      }
      html+='<tr><td>'+label+'</td><td>'+scoreCell+'</td><td>'+doelCell+'</td><td>'+pctCell+'</td></tr>';
    }
  }
  return '<details class="td-det" data-sec="testbatterij"><summary>Testbatterij ('+filled+'/'+rows.length+' velden ingevuld)</summary>'+
    '<table class="td-table"><thead><tr><th>Test</th><th>Score</th><th>Doel</th><th>%</th></tr></thead><tbody>'+html+'</tbody></table>'+
    '<div class="td-hint">Typ een nieuwe waarde en druk op Enter of Tab; leeg = waarde wissen. Tijden als m:ss. Alles wordt meteen opgeslagen en doorgerekend.</div></details>';
}
function tdsSelfAssessment(rows){
  if(!rows||!rows.length)return "";
  const by={},order=[];
  for(const r of rows){if(!by[r.category]){by[r.category]=[];order.push(r.category);}by[r.category].push(r);}
  let html="";
  for(const cat of order){
    html+='<tr class="td-sectie"><td colspan="3">'+esc(cat)+'</td></tr>';
    for(const r of by[cat]){
      const label=r.context?esc(r.movement)+' <span class="td-norm-basis">('+esc(r.context)+')</span>':esc(r.movement);
      html+='<tr><td>'+label+'</td><td>'+esc(r.score)+'/5</td><td>'+esc(r.note||"")+'</td></tr>';
    }
  }
  return '<details class="td-det" data-sec="selfassessment"><summary>Self-assessment ('+rows.length+' bewegingen)</summary><table class="td-table"><thead><tr><th>Beweging</th><th>Score</th><th>Notitie</th></tr></thead><tbody>'+html+'</tbody></table></details>';
}
function tdsMental(rows){
  if(!rows||!rows.length)return "";
  const body=rows.map(r=>'<tr><td>'+esc(r.category)+(r.vraag?' <span class="td-norm-basis">('+esc(r.vraag)+')</span>':"")+'</td><td>'+esc(r.score)+'/5</td><td>'+esc(r.toelichting||"")+'</td></tr>').join("");
  return '<details class="td-det" data-sec="mental"><summary>Mentale prestatie ('+rows.length+' categorieën)</summary><table class="td-table"><thead><tr><th>Categorie</th><th>Score</th><th>Notitie</th></tr></thead><tbody>'+body+'</tbody></table></details>';
}
function tdsReflectie(rows){
  if(!rows||!rows.length)return "";
  const body=rows.map(r=>'<div class="td-refl"><b>'+esc(r.vraag)+'</b><div class="td-p-text">'+esc(r.antwoord)+'</div></div>').join("");
  return '<details class="td-det" data-sec="reflectie"><summary>Zelfreflectie ('+rows.length+' '+(rows.length===1?"antwoord":"antwoorden")+')</summary><div class="td-refl-body">'+body+'</div></details>';
}
function tdsPerception(gaps,mm){
  if((!gaps||!gaps.length)&&!mm)return "";
  let html="";
  if(gaps&&gaps.length){
    const sigCls={"blind spot":"td-pct-red","confidence":"td-pct-orange","minor gap":"","matches":"td-pct-green"};
    html+='<tr class="td-sectie"><td colspan="4">Zelfbeeld vs. getest</td></tr>';
    html+=gaps.map(g=>{
      const d=g.delta>0?"+"+g.delta:g.delta;
      const badge=(g.signal==="matches"||g.signal==="minor gap")?'<span class="td-norm-basis">'+esc(g.signal)+'</span>':'<span class="td-pct '+(sigCls[g.signal]||"")+'">'+esc(g.signal)+'</span>';
      return '<tr><td>'+esc(g.label)+'</td><td>'+esc(g.test_score)+'</td><td>'+esc(g.self_score)+'/5 <span class="td-norm-basis">(verwacht '+esc(g.expected_self)+', '+esc(d)+')</span></td><td>'+badge+'</td></tr>';
    }).join("");
  }
  if(mm&&mm.rows&&mm.rows.length){
    html+='<tr class="td-sectie"><td colspan="4">Mixed-modal patronen</td></tr>';
    html+=mm.rows.map(r=>{
      const cls=r.score<=2?"td-pct-red":(r.score>=4?"td-pct-green":"td-pct-orange");
      const label=r.context?esc(r.patroon)+' <span class="td-norm-basis">('+esc(r.context)+')</span>':esc(r.patroon);
      return '<tr><td colspan="3">'+label+'</td><td><span class="td-pct '+cls+'">'+esc(r.score)+'/5</span></td></tr>';
    }).join("");
  }
  const n=(gaps?gaps.length:0)+(mm&&mm.rows?mm.rows.length:0);
  return '<details class="td-det" data-sec="perception"><summary>Zelfbeeld vs. getest &amp; mixed-modal ('+n+' rijen)</summary><table class="td-table"><thead><tr><th>Beweging / patroon</th><th>Getest</th><th>Zelf</th><th>Signaal</th></tr></thead><tbody>'+html+'</tbody></table></details>';
}
function tdsTierGap(you,target,isTime){
  if(you==null||you===""||target==null||target==="")return null;
  const t2s=s=>{const p=String(s).split(":").map(Number);return p.length===2?p[0]*60+p[1]:Number(s);};
  if(isTime){const a=t2s(you),b=t2s(target);if(!isFinite(a)||!isFinite(b)||!b)return null;return Math.round((b-a)/b*1000)/10;}
  const a=parseFloat(String(you).replace(",",".")),b=parseFloat(String(target).replace("+",""));
  if(!isFinite(a)||!isFinite(b)||!b)return null;
  return Math.round((a-b)/b*1000)/10;
}
function tdsTierGapAbs(you,target,isTime,unit){
  unit=unit||"";
  if(you==null||you===""||target==null||target==="")return null;
  const t2s=s=>{const p=String(s).split(":").map(Number);return p.length===2?p[0]*60+p[1]:Number(s);};
  const s2t=s=>{const m=Math.floor(Math.abs(s)/60),r=Math.round(Math.abs(s))%60;return m+":"+String(r).padStart(2,"0");};
  if(isTime){
    const a=t2s(you),b=t2s(target);if(!isFinite(a)||!isFinite(b)||!b)return null;
    const diff=a-b;
    if(diff<=0)return '<span class="td-pct td-pct-green">✓ '+s2t(diff)+' sneller</span>';
    return '<span class="td-abs-gap">−'+s2t(diff)+'</span>';
  }
  const a=parseFloat(String(you).replace(",",".")),b=parseFloat(String(target).replace("+",""));
  if(!isFinite(a)||!isFinite(b)||!b)return null;
  const diff=b-a;
  const f=v=>(Math.round(v*10)/10)%1===0?String(Math.round(v)):String(Math.round(v*10)/10);
  if(diff<=0)return '<span class="td-pct td-pct-green">✓ +'+f(-diff)+esc(unit)+'</span>';
  return '<span class="td-abs-gap">+'+f(diff)+esc(unit)+'</span>';
}
function tdsSportRef(ref,a){
  const level=(a&&a.target_level)||"Quarterfinal";
  const levelKey={Open:"open",Quarterfinal:"quarterfinal",Semifinal:"semifinal",Games:"games"}[level]||"quarterfinal";
  function section(title,items,isTimeSection,unitSuffix){
    if(!items||!items.length)return "";
    const rows=items.map(it=>{
      const isTime=(isTimeSection&&String(it.jouw_waarde??"").includes(":"))||(isTimeSection&&String(it[levelKey]??"").includes(":"));
      const tgt=it[levelKey];
      const gap=tdsTierGap(it.jouw_waarde,tgt,isTime);
      const absGap=tdsTierGapAbs(it.jouw_waarde,tgt,isTime,unitSuffix||"");
      return '<tr><td>'+esc(it.naam)+'</td><td><b>'+esc(it.jouw_waarde??"–")+'</b></td><td>'+esc(it.open??"–")+'</td><td>'+esc(it.quarterfinal??"–")+'</td><td>'+esc(it.semifinal??"–")+'</td><td>'+esc(it.games??"–")+'</td><td>'+(gap!=null?tdsPct(gap):"–")+'</td><td>'+(absGap??"–")+'</td></tr>';
    }).join("");
    return '<tr class="td-sectie"><td colspan="8">'+esc(title)+'</td></tr>'+rows;
  }
  const hasData=ref&&((ref.max_lifts&&ref.max_lifts.length)||(ref.conditioning&&ref.conditioning.length)||(ref.elite_extra&&ref.elite_extra.length));
  const body=hasData
    ?'<table class="td-table"><thead><tr><th>Lift / benchmark</th><th>Jouw waarde</th><th>Open</th><th>Quarterfinal</th><th>Semifinal</th><th>Games</th><th>Gat t.o.v. '+esc(level)+'</th><th>Naar '+esc(level)+'</th></tr></thead><tbody>'+section("Max lifts",ref.max_lifts,false,"kg")+section("Conditioning benchmarks",ref.conditioning,true)+section("Elite extra (eigen toevoeging Michel, alleen Games-niveau)",ref.elite_extra,false,"kg")+'</tbody></table>'
    :'<p class="td-leeg-note">Nog niet ingevuld. Verschijnt vanzelf zodra de sport-specifieke referentie van deze atleet binnenkomt.</p>';
  return '<details class="td-det" data-sec="sportref"><summary>Sport-specifieke referentie (Open/QF/Semifinal/Games)</summary>'+body+'</details>';
}

// ---------- SRI-trainingsrichting (klik op de badge) ----------
function tdsSriTraining(a){
  const t=a.sri_status&&a.sri_status.training;if(!t)return "";
  const src=s=>'<span class="td-st-src'+(String(s).startsWith("YP")?" yp":"")+'">· '+esc(s)+'</span>';
  const li=rows=>(rows||[]).map(r=>'<li>'+esc(r[0])+' '+src(r[1])+'</li>').join("");
  const raw=(t.raw||[]).map(r=>esc(r.label)+' '+esc(r.value)+' ('+esc(r.status||"–")+', norm '+esc(r.norm)+')').join(" · ");
  return '<div class="td-sri-train">'+
    '<div class="td-st-head"><span>Trainingsrichting</span> · '+esc(t.band)+' · '+esc(t.pair)+' '+esc(t.value)+'%'+(a.sri_status.estimate?' · <span>schatting</span>':"")+'</div>'+
    '<div class="td-st-curve">'+esc(t.curve)+(raw?' <span class="td-st-raw"><span>Ruw:</span> '+raw+'.</span>':"")+'</div>'+
    ((t.checks||[]).length?'<div class="td-st-sec">Eerst checken</div><ul class="td-st-check">'+li(t.checks)+'</ul>':"")+
    '<div class="td-st-sec">Richting</div><ul>'+li(t.direction)+'</ul>'+
    '<div class="td-st-sec">In de sessies</div><ul>'+li(t.sessions)+'</ul>'+
    '<div class="td-st-foot">De SRI-banden van Kyle zijn een concept tot zijn live call. De SRI zegt hoe je traint, niet wat op 1 staat: de prioriteiten blijven coach-oordeel.</div>'+
    '</div>';
}
function tdsSriBadge(a){
  const s=a.sri_status;if(!s)return "";
  const base="Speed Retention Index: hoeveel tempo blijft over van de korte naar de lange test (run 1mi→5K, row 2K→5K; 10K als tweede lens). Banden: <82% power outlier · 82-86 power-biased · 86-89 mixed · 89-92 endurance-biased · ≥92 endurance outlier.";
  const tip=s.state==="complete"
    ?base+" Run 1mi→5K: "+(s.run??"–")+"% · 1mi→10K: "+(s.run10??"–")+"% · 5K→10K: "+(s.run_5_10??"–")+"% | Row 2K→5K: "+(s.row??"–")+"%"+((s.missing||[]).length?" · Nog open: "+s.missing.join(" + ")+".":"")
    :base+" Nog geen compleet testpaar. Nodig: "+(s.missing||[]).join(" + ")+".";
  if(s.training)return '<span class="td-sri td-sri-click" title="Klik voor de trainingsrichting. '+esc(s.estimate?"SCHATTING: "+s.estimate+" ":"")+esc(tip)+'">'+esc(s.label)+(s.estimate?" · schatting":"")+'</span>';
  return '<span class="td-sri'+(s.state==="complete"?"":" td-sri-todo")+'" title="'+esc(tip)+'">'+esc(s.label)+'</span>';
}

// ---------- wedstrijddata en wedstrijd-overlay ----------
function tdsComp(a){
  if(!a.comp||!a.comp.length)return "";
  return a.comp.map(c=>{
    const events=(c.events||[]).map(e=>'<li><b>'+esc(e.naam)+':</b> '+esc(e.rank)+' · '+esc(e.detail)+'</li>').join("");
    const shortTitle=String(c.bron||"").split(" (")[0];
    return '<div class="td-comp">'+
      '<div class="td-comp-head"><span class="td-comp-label">Wedstrijddata</span><span class="td-comp-title">'+esc(shortTitle)+'</span></div>'+
      '<ul class="td-comp-list">'+tdsBullets(c.overall).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+
      '<ul class="td-comp-events">'+events+'</ul>'+
      (c.signaal?'<div class="td-comp-signal"><ul class="td-comp-list">'+tdsBullets(c.signaal).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></div>':"")+
      '<details class="td-comp-src"><summary>Bron</summary><div class="td-comp-bron">'+esc(c.bron)+'</div></details>'+
      '</div>';
  }).join("");
}
// Live overlay uit de gekozen analyse (input.comp_target) of, zonder doelwedstrijd, Michels vaste kopie.
function tdsOverlayVan(a){
  const ct=a.input&&a.input.comp_target;
  if(ct&&ct.demands_id&&typeof waOverlay==="function"&&WA.rows){
    const r=WA.rows.find(x=>x.id===ct.demands_id);
    if(r){try{return waOverlay(a,r,ct,tdsVandaag());}catch(e){console.error("waOverlay",a.name,e);}}
  }
  return a.comp_overlay||null;
}
function tdsOverlay(a){
  const o=tdsOverlayVan(a);
  if(!o||!o.buckets||!o.buckets.length)return {html:"",title:"",note:""};
  const E=x=>esc(String(x==null?"":x).replace(/\*\*/g,""));
  const lbl=l=>{const k=String(l||"").split(" ")[0].toUpperCase();return '<span class="td-ovl-lbl td-ovl-'+esc(k)+'">'+esc(String(l||"").split(" ")[0])+'</span>';};
  const term=b=>(b.style?b.style.split(" — ")[0].split(" (")[0]:b.bucket.split(" (")[0].split(" — ")[0]);
  const shortEv=b=>(b.evidence||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>({t:x.replace(/\s*\(([\d.]+)\)$/," $1"),s:parseFloat((x.match(/\(([\d.]+)\)$/)||[])[1]||"9")})).sort((p,q)=>p.s-q.s).slice(0,2).map(x=>x.t).join(" · ");
  const shortStyle=x=>{let y=x.replace(/\(.*?\)/g,"").replace(/\s+/g," ").trim().split(/\.\s|\.$/)[0];if(y.length>60)y=y.split(":")[0];return y.trim();};
  const order={"PRIORITEIT":0,"EXPOSURE":1,"TESTEN":2,"BESCHERMEND":3,"ONDERHOUD":4};
  const key=b=>String(b.label).split(" ")[0];
  const bk=o.buckets.slice().sort((x,y)=>(order[key(x)]??9)-(order[key(y)]??9)||String(x.tier).localeCompare(String(y.tier)));
  const prios=bk.filter(b=>key(b)==="PRIORITEIT"||(key(b)==="EXPOSURE"&&b.tier==="T1")).sort((x,y)=>(order[key(x)]-order[key(y)])||((x.score??9)-(y.score??9))).slice(0,3);
  const names=k=>bk.filter(b=>key(b)===k&&!prios.includes(b)).map(b=>b.bucket.split(" (")[0].split(" — ")[0]).join(" · ");
  const gaps=(o.cutoff||[]).filter(c=>c.own).map(c=>E(c.own)+' <b class="'+(String(c.gap).startsWith("-")?"td-ovl-gap-neg":"td-ovl-gap-pos")+'">'+E(String(c.gap).replace(" t.o.v. 15e",""))+'</b>').join(" · ");
  const title="Wedstrijd: "+E(o.competition);
  const note=String(o.role||"")+(o.weeks_to_go!=null?" · "+o.weeks_to_go+" wk":"");
  const prioHtml=prios.map((b,i)=>'<div class="td-ovl-prio"><span class="td-ovl-num">'+(i+1)+'</span>'+lbl(b.label)+'<b>'+E(term(b))+'</b><span class="td-ovl-ev">'+E(b.bucket.split(" (")[0].split(" — ")[0])+' \u00b7 '+E(shortEv(b))+'</span></div>').join("");
  const stylesHtml=(o.styles||[]).map(x=>'<li>'+E(shortStyle(x))+'</li>').join("");
  const detailRows=bk.map(b=>'<tr><td>'+lbl(b.label)+'</td><td><b>'+E(b.bucket)+'</b> <span class="muted">'+E(b.tier)+' '+E(b.count)+'</span>'+(b.style?'<div class="td-ovl-prog">'+E(b.style)+'</div>':"")+(b.program?'<div class="td-ovl-prog">Programmeer: '+E(b.program)+'</div>':"")+'</td><td>'+E(b.evidence)+'</td></tr>').join("");
  const cutoffRows=(o.cutoff||[]).map(c=>'<tr><td><b>'+E(c.event)+'</b> '+E(c.format)+'<div class="muted">'+E(c.movements)+'</div></td><td>'+E(c.p5)+'</td><td><b>'+E(c.p15)+'</b></td><td>'+E(c.pct_capped)+(c.pct_capped!==""&&c.pct_capped!=null?"%":"")+'</td><td>'+(E(c.own)||"–")+' '+E(c.gap)+'</td></tr>').join("");
  const html='<div class="td-ovl">'+
    '<div class="td-ovl-meta">'+E(o.division)+' · '+E(o.date)+' · <b>'+E(o.role)+'</b> · nog '+E(o.weeks_to_go)+' wk'+(o.next?" · daarna "+E(String(o.next).split(" (")[0]):"")+'</div>'+
    (o.note?'<div class="td-ovl-meta" style="font-style:italic">'+E(o.note)+'</div>':"")+
    '<div class="td-ovl-sub">Prio\'s voor deze wedstrijd</div>'+prioHtml+
    (gaps?'<div class="td-ovl-line">Cutoff-gat (15e plaats): '+gaps+'</div>':"")+
    '<div class="td-ovl-sub">Workout-vormen (zo toetst de wedstrijd)</div><ul class="td-ovl-styles">'+stylesHtml+'</ul>'+
    (o.omit?'<div class="td-ovl-line">Rode pen (laten liggen): '+E(String(o.omit).replace(/\(.*?\)/g,"").replace(/\s+,/g,",").replace(/\.$/,""))+'</div>':"")+
    (names("TESTEN")?'<div class="td-ovl-line"><b>Test eerst:</b> '+E(names("TESTEN"))+'</div>':"")+
    (names("EXPOSURE")?'<div class="td-ovl-line"><b>Exposure:</b> '+E(names("EXPOSURE"))+'</div>':"")+
    (names("BESCHERMEND")?'<div class="td-ovl-line"><b>Beschermend volume:</b> '+E(names("BESCHERMEND"))+'</div>':"")+
    (names("ONDERHOUD")?'<div class="td-ovl-line"><b>Onderhoud:</b> '+E(names("ONDERHOUD"))+'</div>':"")+
    '<details class="td-comp-src"><summary>Detail: alle buckets (tier × intake)</summary><table class="td-table td-ovl-table"><thead><tr><th>Label</th><th>Bucket</th><th>Eigen data</th></tr></thead><tbody>'+detailRows+'</tbody></table><div class="td-ovl-meta">PRIORITEIT = T1 × laag · BESCHERMEND = T1 × hoog · EXPOSURE = T2 × laag / T1 × midden · ONDERHOUD = T3 · TESTEN = geen data</div></details>'+
    (cutoffRows?'<details class="td-comp-src"><summary>Detail: cutoff per event (laatste editie)</summary><table class="td-table td-ovl-table"><thead><tr><th>Event</th><th>Top 5</th><th>15e</th><th>Gecapt</th><th>Eigen / gat</th></tr></thead><tbody>'+cutoffRows+'</tbody></table></details>':"")+
    ((o.current_priorities||[]).length?'<details class="td-comp-src"><summary>Huidige prio\'s in het dashboard</summary><ul class="td-comp-list">'+o.current_priorities.map(x=>'<li>'+E(x)+'</li>').join("")+'</ul></details>':"")+
    '<div class="td-ovl-meta">Bron: '+E(o.demands_file)+' × intake · '+E(o.generated)+(o.live?' · live berekend':' · vaste kopie uit Michels export')+'</div>'+
    '</div>';
  return {html,title,note};
}

// ---------- de kaart ----------
function tdsKaart(a){
  const overallPct=a.overall!=null?Math.round(a.overall*100):null;
  const overallSt=tdsScoreStatus(a.overall);
  const cats=["Strength","Olympic","Gymnastics","Engine","CrossFit"];
  let catsHtml="";
  for(const cat of cats){
    const sc=(a.cat_scores||{})[cat];const pct=sc!=null?Math.round(sc*100):null;const st=tdsScoreStatus(sc);
    catsHtml+='<div class="td-cat"><div class="td-cat-label"><span>'+cat+'</span><span>'+(pct!=null?pct+"%":"–")+'</span></div><div class="td-cat-bar"><div style="width:'+(pct!=null?Math.min(pct,120):0)+'%;background:'+tdsBarKleur(st)+'"></div></div></div>';
  }
  // Vandaag-paneel (coach-only `recent`; zit niet in de export, komt later terug)
  let todayHtml="";
  if(a.recent){
    const r=a.recent;
    const actions=(r.actions&&r.actions.length)?'<div class="td-today-actions"><b>Actiepunten</b><ul>'+r.actions.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></div>':"";
    todayHtml='<div class="td-today">'+tdsBulletBlok("Strivee",r.strivee)+tdsBulletBlok("WhatsApp",r.whatsapp)+tdsBulletBlok("Chat (app)",r.chat)+actions+'</div>';
  }
  const compHtml=tdsComp(a);
  const ovl=tdsOverlay(a);
  // Prioriteitenblokken: top-5 (coach-ranking), accessory, de vijf themablokken in
  // coach-volgorde, dan mentaal en zelfbeeld. Elk blok is een eigen uitklapknop.
  let prio="";
  if(a.top_priorities&&a.top_priorities.length){
    const items=a.top_priorities.map((p,i)=>'<li class="td-top-item '+(TDS_TOPIC_CLS[p.cat]||"")+'">'+(i+1)+'. <span class="td-top-topic">'+esc(TDS_TOPIC_LABEL[p.cat]||p.cat)+':</span> '+esc(p.focus)+'</li>').join("");
    const topNote=a.top_priorities.slice(0,3).map(p=>TDS_TOPIC_LABEL[p.cat]||p.cat).join(" \u00b7 ");
    prio+=tdsSec("prio","Prioriteiten",topNote,'<div class="td-p td-p-top"><ul class="td-top-list">'+items+'</ul></div>',"td-sec-top");
  }
  if(a.accessory_focus){
    const af=a.accessory_focus;let afHtml="";
    if(typeof af==="string")afHtml='<div class="td-p-text">'+esc(af)+'</div>';
    else{
      if(af.lower)afHtml+='<div class="td-p-text"><b class="td-sublabel">Onderlichaam:</b> '+esc(af.lower)+'</div>';
      if(af.upper)afHtml+='<div class="td-p-text"><b class="td-sublabel">Bovenlichaam:</b> '+esc(af.upper)+'</div>';
    }
    if(afHtml)prio+=tdsSec("acc","Accessory / special strength","",'<div class="td-p td-p-accessory">'+afHtml+'</div>',"td-sec-accessory");
  }
  const themeLabels={Strength:"Strength",Weightlifting:"Weightlifting",Gymnastics:"Skill (gymnastics)",Conditioning:"Conditioning"};
  const themes=[
    ...Object.keys(themeLabels).map(cat=>({cat,label:themeLabels[cat],cls:TDS_TOPIC_CLS[cat],text:(a.priorities&&a.priorities[cat])||"–",layers:a.priorities_layers?a.priorities_layers[cat]:null})),
    {cat:"CrossFit",label:"CrossFit / mixed",cls:"td-p-crossfit",text:a.crossfit_profile||"–",layers:a.crossfit_layers||null},
  ];
  const rankOf=c=>{if(!a.top_priorities)return null;const i=a.top_priorities.findIndex(t=>t.cat===c);return i>=0?i:null;};
  const ranked=a.top_priorities?themes.slice().sort((x,y)=>(rankOf(x.cat)??99)-(rankOf(y.cat)??99)):themes;
  for(const tb of ranked){
    const r=rankOf(tb.cat);
    const head=r!=null?(r+1)+". "+tb.label:tb.label;
    let body;
    if(tb.layers&&tb.layers.length>1){
      body='<ul class="td-layers">'+tb.layers.map(L=>'<li><b>'+esc(L.label)+':</b> '+esc(L.text)+(L.next?'<div class="td-next">→ Vervolg: '+esc(L.next)+'</div>':"")+'</li>').join("")+'</ul>';
    }else body='<div class="td-p-text">'+esc(tb.text)+'</div>';
    const tbNote=tdsNote((tb.layers&&tb.layers.length)?tb.layers[0].text:tb.text,38);
    prio+=tdsSec("theme-"+tb.cat,esc(head),tbNote,'<div class="td-p '+tb.cls+'">'+body+'</div>',"td-sec-"+tb.cls.replace("td-p-",""));
  }
  if(a.mental_performance_synthesis)prio+=tdsSec("mental","Mentaal",tdsNote(a.mental_performance_synthesis),'<div class="td-p td-p-mental"><div class="td-p-text">'+esc(a.mental_performance_synthesis)+'</div></div>',"td-sec-mental");
  if(a.perception_synthesis||(a.mixed_modal&&a.mixed_modal.zwak&&a.mixed_modal.zwak.length)){
    let p="";
    if(a.perception_synthesis)p+='<div class="td-p-text">'+esc(a.perception_synthesis)+'</div>';
    if(a.mixed_modal&&a.mixed_modal.zwak&&a.mixed_modal.zwak.length)p+='<div class="td-p-text"><b class="td-sublabel">Mixed-modal zwak:</b> '+esc(a.mixed_modal.zwak.join(", "))+'.</div>';
    prio+=tdsSec("perception","Zelfbeeld vs. getest","",'<div class="td-p td-p-perception">'+p+'</div>',"td-sec-perception");
  }
  const flagsHtml=(a.flags&&a.flags.length)?'<div class="td-flags">'+a.flags.map(esc).join("<br>")+'</div>':"";
  // Coach-notities (Michels `notes`, één zin per notitie); nooit richting atleten.
  const notesArr=Array.isArray(a.notes)?a.notes:(a.notes?[String(a.notes)]:[]);
  const notesHtml=notesArr.length?'<ul class="td-notes">'+notesArr.map(n=>'<li>'+esc(n)+'</li>').join("")+'</ul>':"";
  const todayNote=a.recent?a.recent.date:"";
  const compNote=(a.comp&&a.comp.length)?(a.comp.length>1?a.comp.length+" bronnen":String(a.comp[0].bron).split(" (")[0]):"";
  const ageStr=a.age?", "+a.age+" jr":"";
  const genderStr=a.gender==="M"?"man":"vrouw";
  const bewerk=TDS.bewerk===a.name?tdsBewerkForm(a):"";
  return '<div class="td-card'+(a.kapot?" td-kapot":"")+'" data-name="'+esc(a.name)+'">'+
    '<div class="td-head"><div>'+
      '<p class="td-name">'+esc(a.name)+tdsSriBadge(a)+'</p>'+
      '<p class="td-meta"><span>'+(a.bw!=null?esc(a.bw)+" kg":"gewicht onbekend")+esc(ageStr)+'</span> · <span>'+genderStr+'</span>'+(a.target_level?' · <span>doel '+esc(a.target_level)+'</span>':"")+' · <span>bijgewerkt '+esc(a.updated||"–")+'</span></p>'+
      tdsKlantLink(a)+
    '</div><div class="td-head-r">'+(a.day?'<span class="td-day">'+esc(a.day)+'</span>':"")+tdsAppKnop(a)+'<button class="td-editbtn" onclick="tdsBewerk(\''+esc(a.name).replace(/'/g,"\\'")+'\')">'+(TDS.bewerk===a.name?"Sluiten":"Bewerken")+'</button></div></div>'+
    (a.kapot?'<div class="td-flags">Deze atleet kon niet doorgerekend worden (controleer de ingevoerde waarden).</div>':"")+
    tdsAppPaneel(a)+
    bewerk+
    tdsSriTraining(a)+
    tdsSec("today","Vandaag: Strivee + WhatsApp",todayNote,todayHtml)+
    tdsSec("comp","Wedstrijddata",compNote,compHtml)+
    tdsSec("comp_overlay",ovl.title,ovl.note,ovl.html)+
    '<div class="td-overall"><div><div class="td-overall-num" style="color:'+tdsBarKleur(overallSt)+'">'+(overallPct!=null?overallPct+"%":"–")+'</div><div class="td-overall-label">'+a.filled+'/'+a.total+' tests ingevuld</div></div><div class="td-fill"><div style="width:'+(a.total?Math.round(a.filled/a.total*100):0)+'%"></div></div></div>'+
    '<div class="td-cats">'+catsHtml+'</div>'+
    prio+
    tdsSec("flags","Let op",(a.flags&&a.flags.length>1)?a.flags.length+" punten":"",flagsHtml,"td-sec-warn")+
    tdsSec("notes","Notities (coach)",notesArr.length>1?notesArr.length+" notities":"",notesHtml,"td-sec-notes")+
    tdsGesprekken(a)+ // chat en dagreacties uit de app (alleen bij een gekoppeld account), met AI-samenvatting naar de weekstatus
    (typeof ikkSectie==="function"?ikkSectie(a):"")+ // intake-kaart voor het consult (app/intake-kaart.js), alleen met intake-data
    tdsTestTabel(a.testbatterij_full,a)+
    tdsSelfAssessment(a.self_assessment_detail)+
    tdsReflectie(a.self_reflection)+
    tdsMental(a.mental_performance)+
    tdsPerception(a.perception_gap,a.mixed_modal)+
    tdsSportRef(a.sport_reference,a)+
    '</div>';
}

// ---------- pagina ----------
function tdsRender(h){
  TDS.klant=null; // op de Data-pagina, niet in het klantdossier
  if(!TDS.geladen){h.innerHTML='<div class="spin">Laden…</div>';return;}
  if(TDS.fout){h.innerHTML='<div class="panel" style="padding:22px"><b>Dashboard laden mislukt.</b><div class="sm muted" style="margin-top:6px">'+esc(TDS.fout)+'</div><button class="btn sm" style="margin-top:12px" onclick="TDS.geladen=false;dataZetTab(\'atleten\')">Opnieuw proberen</button></div>';return;}
  const lijst=tdsLijst();
  // Dagchips; atleten zonder vaste dag (optioneel sinds 20 okt) krijgen de chip "Geen dag".
  const dagen=["Alle",...Array.from(new Set(lijst.map(a=>a.day).filter(Boolean))).sort((x,y)=>TDS_DAGEN.indexOf(x)-TDS_DAGEN.indexOf(y)),...(lijst.some(a=>!a.day)?["Geen dag"]:[])];
  h.innerHTML='<div class="td-wrap">'+
    '<div class="td-toolbar" id="td-dagen">'+dagen.map(d=>'<button class="td-chip'+(d===TDS.dag?" on":"")+'" data-dag="'+esc(d)+'" onclick="tdsDag(this.dataset.dag)">'+esc(d)+'</button>').join("")+'</div>'+
    '<div class="td-toolbar">'+
      '<select class="lid-in" id="td-naam" style="width:auto;max-width:240px" onchange="tdsNaam(this.value)"></select>'+
      '<input type="search" class="lid-in" style="min-width:200px" placeholder="Zoek op naam…" value="'+esc(TDS.zoek)+'" oninput="tdsZoek(this.value)">'+
      '<select class="lid-in" style="width:auto" onchange="tdsSort(this.value)">'+
        [["name","Sorteer: naam"],["overall_desc","Sorteer: score (hoog→laag)"],["overall_asc","Sorteer: score (laag→hoog)"],["filled_desc","Sorteer: meest compleet"]].map(o=>'<option value="'+o[0]+'"'+(TDS.sort===o[0]?" selected":"")+'>'+o[1]+'</option>').join("")+
      '</select>'+
      '<button class="td-chip" id="td-alles" onclick="tdsAlles()">Alles uitklappen</button>'+
      '<span class="td-count" id="td-count"></span>'+
      (TDS.magAlles?'<button class="btn ghost sm" onclick="tdsNieuwToggle()">+ Atleet</button>':"")+
      '<button class="btn ghost sm" onclick="tdsKlantenToggle()" title="Een kaart aanmaken voor klanten in de app die er nog geen hebben, gekoppeld aan hun account">Kaarten voor klanten</button>'+
      '<button class="btn ghost sm" onclick="ikKies()" title="Ingevulde intake-Excel (onboarding) inlezen voor een atleet">Intake-Excel</button>'+
      '<button class="btn ghost sm" onclick="tdsExport()" title="Alle atleten als JSON in Michels formaat (athletes_input.json)">Export JSON</button>'+
      (TDS.magAlles?'<button class="btn ghost sm" onclick="document.getElementById(\'td-import\').click()" title="Verse export van Michel inlezen (athletes_input.json)">Import JSON</button>'+
      '<input type="file" id="td-import" accept=".json,application/json" style="display:none" onchange="tdsImportBestand(this)">':"")+
    '</div>'+
    tdsNieuwForm()+tdsKlantenForm()+
    (TDS.magAlles?"":'<div class="td-hint" style="margin:0 0 10px">Je ziet alleen de atleten van je eigen klanten. Een beheerder kan je via Coaches › Rechten alle atleten laten zien.</div>')+
    '<div class="td-legend"><span><span class="dot" style="background:var(--td-dev)"></span>&lt;50% Developing</span><span><span class="dot" style="background:var(--td-close)"></span>50–79% Approaching</span><span><span class="dot" style="background:var(--td-norm)"></span>≥80% At standard</span></div>'+
    '<div id="td-intake-paneel"></div>'+
    '<div class="td-grid" id="td-grid"></div><div class="td-leeg" id="td-leeg" style="display:none">Geen atleten gevonden.</div>'+
  '</div>';
  tdsGrid();
  tdsGridListeners(document.getElementById("td-grid"));
}
// Klik-, invoer- en uitklapgedrag van de kaarten (ook gebruikt in het klantdossier).
function tdsGridListeners(grid){
  if(!grid||grid.dataset.lst)return;grid.dataset.lst="1";
  grid.addEventListener("click",e=>{
    const b=e.target.closest(".td-sri-click");if(!b)return;
    const card=b.closest(".td-card");const panel=card&&card.querySelector(".td-sri-train");if(!panel)return;
    panel.classList.toggle("open");b.classList.toggle("open",panel.classList.contains("open"));
  });
  grid.addEventListener("change",e=>{if(e.target.classList.contains("td-edit"))tdsEditChange(e.target);});
  grid.addEventListener("keydown",e=>{if(e.target.classList.contains("td-edit")&&e.key==="Enter"){e.preventDefault();e.target.blur();}});
  grid.addEventListener("toggle",e=>{
    const d=e.target;if(!d||d.tagName!=="DETAILS"||!d.parentElement||!d.parentElement.classList.contains("td-card"))return;
    const open=tdsOpenLaad();const k=tdsSecKey(d);if(d.open)open[k]=1;else delete open[k];tdsOpenBewaar(open);tdsAllesKnop();
  },true);
}
function tdsGrid(){
  if(TDS.klant){tdsKlantGrid();return;} // kopje Data in het klantdossier: alleen die ene kaart
  const grid=document.getElementById("td-grid"),leeg=document.getElementById("td-leeg");if(!grid)return;
  const z=TDS.zoek.trim().toLowerCase();
  // Naamkeuze: één atleet op volle breedte; anders de dag- en zoekfilters.
  const een=(TDS.naam&&TDS.athletes[TDS.naam])?TDS.athletes[TDS.naam]:null;
  grid.classList.toggle("td-single",!!een);
  let list=een?[een]:tdsLijst().filter(a=>(TDS.dag==="Alle"||(TDS.dag==="Geen dag"?!a.day:a.day===TDS.dag))&&(!z||a.name.toLowerCase().includes(z)));
  if(TDS.sort==="name")list.sort((a,b)=>a.name.localeCompare(b.name));
  if(TDS.sort==="overall_desc")list.sort((a,b)=>(b.overall??-1)-(a.overall??-1));
  if(TDS.sort==="overall_asc")list.sort((a,b)=>(a.overall??999)-(b.overall??999));
  if(TDS.sort==="filled_desc")list.sort((a,b)=>b.filled-a.filled);
  const c=document.getElementById("td-count");if(c)c.textContent=list.length===1?"1 atleet":list.length+" atleten";
  if(!list.length){grid.innerHTML="";leeg.style.display="block";}
  else{leeg.style.display="none";grid.innerHTML=list.map(tdsKaart).join("");}
  tdsOpenToepassen();tdsAllesKnop();tdsNaamSelectVul();
}
function tdsDag(d){TDS.dag=d;TDS.naam="";document.querySelectorAll("#td-dagen .td-chip").forEach(b=>b.classList.toggle("on",b.dataset.dag===d));tdsGrid();}
function tdsZoek(v){TDS.zoek=v;TDS.naam="";tdsGrid();}
// Naamkeuze (verzoek Stefan 8 okt): één atleet kiezen in plaats van scrollen door iedereen.
function tdsNaam(v){TDS.naam=v||"";if(TDS.naam){TDS.zoek="";const z=document.querySelector("#data-inhoud input[type=search]");if(z)z.value="";}tdsGrid();}
function tdsNaamSelectVul(){
  const s=document.getElementById("td-naam");if(!s)return;
  const namen=tdsLijst().map(a=>a.name).sort((a,b)=>a.localeCompare(b));
  s.innerHTML='<option value="">Alle atleten</option>'+namen.map(n=>'<option value="'+esc(n)+'"'+(n===TDS.naam?" selected":"")+'>'+esc(n)+'</option>').join("");
  if(!namen.includes(TDS.naam))s.value="";
}
function tdsSort(v){TDS.sort=v;tdsGrid();}
// Open/dicht per atleet + sectie onthouden (localStorage), zoals in Michels dashboard.
function tdsOpenLaad(){try{return JSON.parse(localStorage.getItem(TDS_OPEN_KEY)||"{}");}catch(e){return {};}}
function tdsOpenBewaar(o){try{localStorage.setItem(TDS_OPEN_KEY,JSON.stringify(o));}catch(e){}}
function tdsSecKey(det){
  const card=det.closest(".td-card");const name=card?card.dataset.name:"";
  let own=det.dataset.sec;
  if(!own){const sum=det.querySelector(":scope > summary");own=(sum?sum.textContent:"").trim().replace(/\s*\([^()]*\)\s*$/,"");}
  return name+"||"+own;
}
const tdsSecties=()=>[...document.querySelectorAll("#td-grid .td-card > details")];
function tdsOpenToepassen(){const open=tdsOpenLaad();tdsSecties().forEach(d=>{d.open=!!open[tdsSecKey(d)];});}
function tdsAllesKnop(){const b=document.getElementById("td-alles");if(!b)return;const anyClosed=tdsSecties().some(d=>!d.open);b.textContent=anyClosed?"Alles uitklappen":"Alles inklappen";b.dataset.action=anyClosed?"open":"close";}
function tdsAlles(){
  const b=document.getElementById("td-alles");const wantOpen=(b&&b.dataset.action)!=="close";
  const store=wantOpen?tdsOpenLaad():{};
  tdsSecties().forEach(d=>{d.open=wantOpen;const k=tdsSecKey(d);if(wantOpen)store[k]=1;else delete store[k];});
  tdsOpenBewaar(store);tdsAllesKnop();
}
// Eén kaart opnieuw tekenen zonder de open secties, de scrollpositie en de focus te verliezen.
function tdsHerteken(name){
  const a=TDS.athletes[name];if(!a)return;
  if(TDS.bewerk===name&&document.getElementById("td-f-comp"))TDS.compWerk=tdsCompLees();
  const el=document.querySelector('#td-grid .td-card[data-name="'+CSS.escape(name)+'"]');
  if(!el){tdsGrid();return;}
  const openIdx=[...el.querySelectorAll("details")].map((d,i)=>d.open?i:-1).filter(i=>i>=0);
  const act=document.activeElement&&document.activeElement.classList&&document.activeElement.classList.contains("td-edit")?document.activeElement.dataset.key:null;
  const scrollY=window.scrollY;
  el.outerHTML=tdsKaart(a);
  const nieuw=document.querySelector('#td-grid .td-card[data-name="'+CSS.escape(name)+'"]');
  if(nieuw){
    const dets=[...nieuw.querySelectorAll("details")];openIdx.forEach(i=>{if(dets[i])dets[i].open=true;});
    if(act){const inp=nieuw.querySelector('.td-edit[data-key="'+CSS.escape(act)+'"]');if(inp)inp.focus({preventScroll:true});}
  }
  window.scrollTo(0,scrollY);tdsAllesKnop();
}

// ---------- opslaan ----------
async function tdsPatch(id,patch,remove){
  const q=await db.rpc("athlete_testdata_patch",{p_id:id,p_patch:patch||{},p_remove:remove&&remove.length?remove:null});
  if(q.error){toast("Opslaan mislukt: "+(q.error.message||""));return false;}
  const row=TDS.rows.find(r=>r.id===id);
  if(row){row.input=Object.assign({},row.input||{},patch||{});(remove||[]).forEach(k=>{delete row.input[k];});tdsZetRij(row);}
  return true;
}
// Bron + datum bijhouden in Michels stijl: "2026-10-08 (Deadlift 190 via dashboard); earlier: …".
// Meerdere wijzigingen op dezelfde dag worden in één vermelding samengevoegd.
function tdsUpdatedTekst(oud,label,waarde){
  const vandaag=tdsVandaag();
  const m=String(oud||"").match(/^(\d{4}-\d{2}-\d{2}) \((.*?) via dashboard\)(?:; earlier: ([\s\S]*))?$/);
  let s;
  if(m&&m[1]===vandaag){
    s=vandaag+" ("+m[2]+", "+label+" "+waarde+" via dashboard)";
    if(m[3])s+="; earlier: "+m[3];
  }else{
    s=vandaag+" ("+label+" "+waarde+" via dashboard)";
    if(oud)s+="; earlier: "+String(oud);
  }
  return s.length>600?s.slice(0,597)+"…":s;
}
async function tdsEditChange(inp){
  const id=inp.dataset.id,key=inp.dataset.key;
  const row=TDS.rows.find(r=>r.id===id);if(!row)return;
  const a=TDS.athletes[row.name];
  const ik=TDS_INPUT_KEY[key]||key;
  const raw=inp.value.trim();
  const label=(a&&a.tests&&a.tests[key]&&a.tests[key].label)||key;
  let patch={},remove=[];
  if(raw===""){
    remove=[ik];if(ik==="front_squat")remove.push("front_squat_estimate");
    patch.updated=tdsUpdatedTekst(row.input&&row.input.updated,label,"gewist");
  }else if(TDS_TIME.has(key)){
    if(!/^\d{1,3}:[0-5]\d$/.test(raw)){toast("Gebruik het formaat m:ss, bijvoorbeeld 8:56");inp.classList.add("bad");return;}
    patch[ik]=raw;patch.updated=tdsUpdatedTekst(row.input&&row.input.updated,label,raw);
  }else{
    const num=Number(raw.replace(",","."));
    if(isNaN(num)||num<0){toast("Vul een geldig getal in");inp.classList.add("bad");return;}
    patch[ik]=num;if(ik==="front_squat")remove=["front_squat_estimate"];
    patch.updated=tdsUpdatedTekst(row.input&&row.input.updated,label,num);
  }
  inp.classList.remove("bad");
  const ok=await tdsPatch(id,patch,remove);
  if(ok){toast("Opgeslagen");tdsHerteken(row.name);}
}

// ---------- bewerken: gegevens, prioriteiten en onderbouwing ----------
function tdsBewerk(name){
  const open=TDS.bewerk!==name;TDS.bewerk=open?name:null;
  const a=TDS.athletes[name];
  TDS.compWerk=open?JSON.parse(JSON.stringify((a&&a.input&&a.input.comp)||[])):null;
  tdsHerteken(name);
}
function tdsBewerkForm(a){
  const inp=a.input||{};
  const sel=(id,opts,cur,leeg)=>'<select class="lid-in" id="'+id+'">'+(leeg?'<option value="">'+leeg+'</option>':"")+opts.map(o=>'<option value="'+esc(o[0])+'"'+(String(cur)===String(o[0])?" selected":"")+'>'+esc(o[1])+'</option>').join("")+'</select>';
  const tp=inp.top_priorities||[];
  const rijen=[0,1,2,3,4].map(i=>{const p=tp[i]||{};return '<div class="td-f-row"><span class="td-f-num">'+(i+1)+'</span>'+sel("td-f-tpcat"+i,TDS_TOPICS.map(t=>[t,TDS_TOPIC_LABEL[t]]),p.cat||"","– topic –")+'<input class="lid-in" id="td-f-tpfocus'+i+'" style="flex:1" placeholder="Focus (wat ga je doen)" value="'+esc(p.focus||"")+'"></div>';}).join("");
  const af=inp.accessory_focus||{};
  const ctx=inp.priority_context||{},cpn=inp.comp_priority_notes||{};
  const topics=[["Strength","Strength"],["Weightlifting","Weightlifting"],["Gymnastics","Gymnastics"],["Conditioning","Conditioning"],["Profile","CrossFit / profiel"]];
  const ta=(pref,obj)=>topics.map(t=>'<div class="td-f-row"><label style="width:130px;flex:none">'+esc(t[1])+'</label><textarea class="lid-in" id="'+pref+t[0]+'" rows="2" style="flex:1">'+esc(obj[t[0]]||"")+'</textarea></div>').join("");
  const rec=(inp.recent&&typeof inp.recent==="object")?inp.recent:{};
  const ct=(inp.comp_target&&typeof inp.comp_target==="object")?inp.comp_target:{};
  const lijst=x=>Array.isArray(x)?x:(x?[String(x)]:[]);
  const rij=(label,id,val,ph,rows)=>'<div class="td-f-row"><label style="width:130px;flex:none">'+label+'</label><textarea class="lid-in" id="'+id+'" rows="'+rows+'" style="flex:1" placeholder="'+esc(ph)+'">'+esc(val)+'</textarea></div>';
  return '<div class="td-form" id="td-form-'+esc(a.id)+'">'+
    '<div class="td-f-h">Gegevens</div>'+
    '<div class="td-f-grid">'+
      '<label>Naam<input class="lid-in" id="td-f-name" value="'+esc(a.name)+'"></label>'+
      '<label>Dag (optioneel)'+sel("td-f-day",TDS_DAGEN.map(d=>[d,d]),inp.day||"","– geen vaste dag –")+'</label>'+
      '<label>Geslacht'+sel("td-f-gender",[["M","Man"],["F","Vrouw"]],inp.gender||"M")+'</label>'+
      '<label>Gewicht (kg)<input class="lid-in" id="td-f-bw" value="'+esc(inp.bw??"")+'" placeholder="bv. 82.5"></label>'+
      '<label>Leeftijd<input class="lid-in" id="td-f-age" value="'+esc(inp.age??"")+'"></label>'+
      '<label>Doelniveau'+sel("td-f-level",TDS_NIVEAUS.map(n=>[n,n]),inp.target_level||"Quarterfinal")+'</label>'+
      '<label style="grid-column:1/-1">Bijgewerkt (datum + bron)<input class="lid-in" id="td-f-updated" value="'+esc(inp.updated||"")+'"></label>'+
      '<label style="grid-column:1/-1">Klant in de app'+tdsKlantSelect(a)+'</label>'+
    '</div>'+
    '<div class="td-f-h">Prioriteiten (coach-ranking, 1 = belangrijkst)</div>'+rijen+
    '<div class="td-f-h">Accessory / special strength</div>'+
    '<div class="td-f-row"><label style="width:130px;flex:none">Onderlichaam</label><textarea class="lid-in" id="td-f-aflower" rows="2" style="flex:1">'+esc(af.lower||"")+'</textarea></div>'+
    '<div class="td-f-row"><label style="width:130px;flex:none">Bovenlichaam</label><textarea class="lid-in" id="td-f-afupper" rows="2" style="flex:1">'+esc(af.upper||"")+'</textarea></div>'+
    '<div class="td-f-h">Onderbouwing per topic (Why)</div>'+ta("td-f-ctx-",ctx)+
    '<div class="td-f-h">Wedstrijdnotities per topic</div>'+ta("td-f-cpn-",cpn)+
    '<div class="td-f-h">Doelwedstrijd (wedstrijd-overlay)</div>'+
    '<div class="td-f-grid">'+
      '<label style="grid-column:1/-1">Analyse'+sel("td-f-ct-id",((typeof WA!=="undefined"&&WA.rows)||[]).map(r=>[r.id,waTitel(r)]),ct.demands_id||"","– geen (de vaste kopie uit Michels export blijft zichtbaar als die er is) –")+'</label>'+
      '<label>Divisie van de atleet<input class="lid-in" id="td-f-ct-div" value="'+esc(ct.division||"")+'" placeholder="leeg = zoals de analyse"></label>'+
      '<label>Datum<input class="lid-in" id="td-f-ct-date" type="date" value="'+esc(ct.date||"")+'"></label>'+
      '<label>Rol<input class="lid-in" id="td-f-ct-role" value="'+esc(ct.role||"doel")+'" placeholder="doel"></label>'+
      '<label>Daarna<input class="lid-in" id="td-f-ct-next" value="'+esc(ct.next||"")+'" placeholder="bijv. Amsterdam Throwdown 5-6 dec"></label>'+
      '<label style="grid-column:1/-1">Kanttekening<textarea class="lid-in" id="td-f-ct-note" rows="2">'+esc(ct.note||"")+'</textarea></label>'+
    '</div>'+
    '<div class="td-hint" style="margin:0 0 4px">De overlay wordt live berekend uit de analyse (Data › Wedstrijdanalyses) en de testwaarden van deze atleet: T1 × laag = PRIORITEIT, T1 × hoog = BESCHERMEND VOLUME, T1 × midden en T2 × laag = EXPOSURE, rest ONDERHOUD, geen data = TESTEN.</div>'+
    '<div class="td-f-h">Wedstrijduitslagen</div><div id="td-f-comp">'+tdsCompEditorHtml(TDS.compWerk||[])+'</div>'+
    '<div class="td-f-h">Coach-only (nooit richting atleten)</div>'+
    rij("Notities","td-f-notes",lijst(inp.notes).join("\n"),"Eén notitie per regel",3)+
    rij("Let op (flags)","td-f-flags",lijst(inp.flags).join("\n"),"Eén punt per regel, bijv. twijfel over een testwaarde",2)+
    '<div class="td-f-h">Vandaag: Strivee + WhatsApp (weekstatus)</div>'+
    '<div class="td-f-row"><label style="width:130px;flex:none">Datum</label><input class="lid-in" id="td-f-rdate" style="flex:1" placeholder="bijv. Ma 6 okt" value="'+esc(rec.date||"")+'"></div>'+
    rij("Strivee","td-f-rstrivee",rec.strivee||"","Wat er deze week in Strivee gebeurde",3)+
    rij("WhatsApp","td-f-rwhatsapp",rec.whatsapp||"","Wat er via WhatsApp binnenkwam",3)+
    rij("Actiepunten","td-f-ractions",lijst(rec.actions).join("\n"),"Eén actiepunt per regel",2)+
    '<div class="td-f-acties"><button class="btn sm" onclick="tdsBewaar(\''+esc(a.id)+'\')">Opslaan</button><button class="btn ghost sm" onclick="tdsBewerk(\''+esc(a.name).replace(/'/g,"\\'")+'\')">Annuleren</button><button class="btn ghost sm" onclick="ifOpen(\''+esc(a.id)+'\')" title="Intake invullen of bewerken in de app (zelfde velden als Michels NL-onboarding)">'+((a.input&&(a.input.self_assessment_detail||a.input.sport_reference||a.input.mental_performance))?"Intake bewerken":"Intake invullen")+'</button><button class="btn ghost sm" onclick="ikKies(\''+esc(a.id)+'\')" title="Ingevulde intake-Excel inlezen voor deze atleet">Intake-Excel inlezen</button><span style="flex:1"></span><button class="btn ghost sm td-danger" onclick="tdsVerwijder(\''+esc(a.id)+'\')">Verwijder atleet</button></div>'+
    '<div class="td-hint">Intake-gegevens (self-assessment, mentaal, sport-referentie, doelen, praktisch) bewerk je via Intake invullen of lees je in uit de Excel.</div>'+
  '</div>';
}
async function tdsBewaar(id){
  const row=TDS.rows.find(r=>r.id===id);if(!row)return;
  const v=i=>{const e=document.getElementById(i);return e?e.value.trim():"";};
  const patch={},remove=[];
  const naam=v("td-f-name");
  if(!naam){toast("Vul een naam in");return;}
  const num=(s)=>{if(s==="")return null;const n=Number(s.replace(",","."));return isNaN(n)?undefined:n;};
  const bw=num(v("td-f-bw")),age=num(v("td-f-age"));
  if(bw===undefined||age===undefined){toast("Gewicht en leeftijd moeten getallen zijn");return;}
  const zet=(k,val)=>{if(val===null||val===""||val===undefined)remove.push(k);else patch[k]=val;};
  zet("day",v("td-f-day"));patch.gender=v("td-f-gender")||"M";zet("bw",bw);zet("age",age);zet("target_level",v("td-f-level"));zet("updated",v("td-f-updated")); // dag optioneel (20 okt)
  const tp=[];for(let i=0;i<5;i++){const cat=v("td-f-tpcat"+i),focus=v("td-f-tpfocus"+i);if(cat&&focus)tp.push({cat,focus});}
  zet("top_priorities",tp.length?tp:null);
  const af={};if(v("td-f-aflower"))af.lower=v("td-f-aflower");if(v("td-f-afupper"))af.upper=v("td-f-afupper");
  zet("accessory_focus",Object.keys(af).length?af:null);
  const topics=["Strength","Weightlifting","Gymnastics","Conditioning","Profile"];
  const ctx={},cpn={};
  topics.forEach(t=>{if(v("td-f-ctx-"+t))ctx[t]=v("td-f-ctx-"+t);if(v("td-f-cpn-"+t))cpn[t]=v("td-f-cpn-"+t);});
  zet("priority_context",Object.keys(ctx).length?ctx:null);
  zet("comp_priority_notes",Object.keys(cpn).length?cpn:null);
  // Wedstrijduitslagen, coach-only velden en weekstatus (zelfde vorm als Michels invoer).
  const comp=tdsCompSchoon(tdsCompLees());zet("comp",comp.length?comp:null);
  const regels=id=>v(id).split("\n").map(s=>s.trim()).filter(Boolean);
  const notes=regels("td-f-notes"),flags=regels("td-f-flags");
  zet("notes",notes.length?notes:null);zet("flags",flags.length?flags:null);
  const rec={};
  if(v("td-f-rdate"))rec.date=v("td-f-rdate");if(v("td-f-rstrivee"))rec.strivee=v("td-f-rstrivee");if(v("td-f-rwhatsapp"))rec.whatsapp=v("td-f-rwhatsapp");
  const acts=regels("td-f-ractions");if(acts.length)rec.actions=acts;
  zet("recent",Object.keys(rec).length?rec:null);
  // Doelwedstrijd voor de live overlay (input.comp_target; eigen sleutel, Michels build() negeert hem).
  const ctId=v("td-f-ct-id");
  if(ctId){
    const ct={demands_id:ctId};
    if(v("td-f-ct-div"))ct.division=v("td-f-ct-div");if(v("td-f-ct-date"))ct.date=v("td-f-ct-date");
    ct.role=v("td-f-ct-role")||"doel";if(v("td-f-ct-next"))ct.next=v("td-f-ct-next");if(v("td-f-ct-note"))ct.note=v("td-f-ct-note");
    patch.comp_target=ct;
  }else remove.push("comp_target");
  if(naam!==row.name){
    if(TDS.athletes[naam]){toast("Er bestaat al een atleet met deze naam");return;}
    const u=await db.from("athlete_testdata").update({name:naam}).eq("id",id);
    if(u.error){toast("Naam wijzigen mislukt: "+(u.error.message||""));return;}
    delete TDS.athletes[row.name];if(TDS.naam===row.name)TDS.naam=naam;row.name=naam;TDS.bewerk=naam;
  }
  // Koppeling aan een klant in de app (kolom profile_id, los van de jsonb-invoer).
  const klantSel=document.getElementById("td-f-klant");
  if(klantSel&&!klantSel.disabled&&(klantSel.value||null)!==(row.profile_id||null)){
    if(!(await tdsZetKlant(row,klantSel.value)))return;
  }
  const ok=await tdsPatch(id,patch,remove);
  if(!ok)return;
  TDS.bewerk=null;TDS.compWerk=null;toast("Opgeslagen");tdsGrid();
}
async function tdsVerwijder(id){
  const row=TDS.rows.find(r=>r.id===id);if(!row)return;
  if(!confirm("Atleet "+row.name+" en alle testdata verwijderen? Dit kan niet ongedaan worden gemaakt."))return;
  const q=await db.from("athlete_testdata").delete().eq("id",id);
  if(q.error){toast("Verwijderen mislukt: "+(q.error.message||""));return;}
  TDS.rows=TDS.rows.filter(r=>r.id!==id);delete TDS.athletes[row.name];TDS.bewerk=null;
  toast("Atleet verwijderd");tdsGrid();
}

// ---------- nieuwe atleet ----------
function tdsNieuwToggle(){TDS.nieuwOpen=!TDS.nieuwOpen;const h=document.getElementById("data-inhoud");if(h)tdsRender(h);}
function tdsNieuwForm(){
  if(!TDS.nieuwOpen)return "";
  return '<div class="td-form" style="margin-bottom:14px"><div class="td-f-h">Nieuwe atleet</div><div class="td-f-grid">'+
    '<label>Naam<input class="lid-in" id="td-n-name" placeholder="Voor- en achternaam"></label>'+
    '<label>Geslacht<select class="lid-in" id="td-n-gender"><option value="M">Man</option><option value="F">Vrouw</option></select></label>'+
    '<label>Dag (optioneel)<select class="lid-in" id="td-n-day"><option value="">– geen vaste dag –</option>'+TDS_DAGEN.map(d=>'<option>'+d+'</option>').join("")+'</select></label>'+
    '<label>Gewicht (kg)<input class="lid-in" id="td-n-bw" placeholder="optioneel"></label>'+
    '</div><div class="td-f-acties"><button class="btn sm" onclick="tdsNieuwOpslaan()">Toevoegen</button><button class="btn ghost sm" onclick="tdsNieuwToggle()">Annuleren</button></div></div>';
}
async function tdsNieuwOpslaan(){
  const v=i=>{const e=document.getElementById(i);return e?e.value.trim():"";};
  const name=v("td-n-name");if(!name){toast("Vul een naam in");return;}
  if(TDS.athletes[name]){toast("Er bestaat al een atleet met deze naam");return;}
  const input={gender:v("td-n-gender")||"M",updated:tdsVandaag()+" (aangemaakt in dashboard)",target_level:"Quarterfinal"};
  if(v("td-n-day"))input.day=v("td-n-day"); // dag optioneel (20 okt)
  const bw=v("td-n-bw");if(bw){const n=Number(bw.replace(",","."));if(isNaN(n)){toast("Gewicht moet een getal zijn");return;}input.bw=n;}
  const company=ME.profile&&ME.profile.company_id;
  const q=await db.from("athlete_testdata").insert({company_id:company,name,input}).select("id,name,profile_id,input,comp_overlay,updated_at").single();
  if(q.error){toast("Toevoegen mislukt: "+(q.error.message||""));return;}
  TDS.rows.push(q.data);tdsZetRij(q.data);TDS.nieuwOpen=false;TDS.zoek="";TDS.dag="Alle";
  toast("Atleet toegevoegd");
  const h=document.getElementById("data-inhoud");if(h)tdsRender(h);
}

// ---------- koppeling aan een klant in de app (athlete_testdata.profile_id) ----------
// Michels atleten staan los van de accounts in de app; de coach koppelt ze met de hand
// (automatisch op naam lukt niet: 1 van de 43 namen komt overeen met een account).
function tdsKlantNaam(id){
  const c=(typeof coachClients!=="undefined"?coachClients:[]).find(x=>x.id===id);
  return c?([c.first_name,c.last_name].filter(Boolean).join(" ")||c.email||""):"";
}
function tdsKlantLink(a){
  if(!a.profile_id)return "";
  const naam=tdsKlantNaam(a.profile_id);
  if(!naam)return '<p class="td-meta td-klantlink">Gekoppeld aan een klant van een andere coach</p>';
  if(TDS.klant)return ""; // in het klantdossier zelf is de link overbodig
  return '<p class="td-meta td-klantlink"><a href="#klant/'+esc(a.profile_id)+'/data" onclick="tdsNaarKlant(event,\''+esc(a.profile_id)+'\')">Klant in de app: '+esc(naam)+' ›</a></p>';
}
// Keuzelijst in het bewerkformulier: klanten van dit bedrijf; wie al aan een andere atleet hangt staat grijs.
function tdsKlantSelect(a){
  const cl=(typeof coachClients!=="undefined"?coachClients:[]).filter(c=>!c.archived).slice().sort((x,y)=>tdsKlantNaam(x.id).localeCompare(tdsKlantNaam(y.id)));
  const bezet=id=>{const r=TDS.rows.find(r=>r.profile_id===id&&r.id!==a.id);return r?r.name:null;};
  let opts='<option value="">– niet gekoppeld –</option>',gevonden=false;
  for(const c of cl){
    const b=bezet(c.id),sel=a.profile_id===c.id;if(sel)gevonden=true;
    opts+='<option value="'+esc(c.id)+'"'+(sel?" selected":"")+(b?" disabled":"")+'>'+esc(tdsKlantNaam(c.id))+(b?' (gekoppeld aan '+esc(b)+')':"")+'</option>';
  }
  if(a.profile_id&&!gevonden)return '<select class="lid-in" id="td-f-klant" disabled><option selected>(klant van een andere coach)</option></select>';
  return '<select class="lid-in" id="td-f-klant">'+opts+'</select>';
}
async function tdsZetKlant(row,profileId){
  const u=await db.from("athlete_testdata").update({profile_id:profileId||null}).eq("id",row.id);
  if(u.error){toast("Koppelen mislukt: "+(u.error.message||""));return false;}
  row.profile_id=profileId||null;
  if(row.profile_id)await tdsVers([row.id]); // de database vult de kaart meteen uit het profiel en Metingen & PR's
  else tdsZetRij(row);
  return true;
}
// Kaarten vers uit de database halen. Sinds 21 oktober vult de database een gekoppelde kaart zelf
// uit het profiel en Metingen & PR's (trigger athlete_testdata_link_sync, metrics_sync_testdata,
// profiles_sync_testdata): na aanmaken, koppelen of een nieuwe meting is de kaart meteen actueel.
async function tdsVers(ids){
  if(!ids||!ids.length)return;
  const q=await db.from("athlete_testdata").select("id,name,profile_id,input,comp_overlay,updated_at").in("id",ids);
  if(q.error||!q.data)return;
  q.data.forEach(nw=>{const row=TDS.rows.find(r=>r.id===nw.id);if(row){Object.assign(row,nw);tdsZetRij(row);}});
  await tdsAppLaad(q.data.map(r=>r.profile_id).filter(Boolean));
  q.data.forEach(nw=>{const row=TDS.rows.find(r=>r.id===nw.id);if(row)tdsZetRij(row);});
}
async function tdsNaarKlant(ev,id){if(ev)ev.preventDefault();if(typeof openClient!=="function")return;await openClient(id,{panel:"data"});}
function tdsNaarDashboard(name){TDS.naam=name;TDS.klant=null;if(typeof dataTab!=="undefined")dataTab="atleten";if(typeof coachGo==="function")coachGo("data");}

// ---------- kopje Data in het klantdossier (zijbalk > Data): alleen de kaart van deze klant ----------
// Verzoek Stefan 8 okt: de coach moet vanuit het dossier snel bij de testdata van die ene
// klant kunnen, zonder langs Data › Atleten met iedereen. Zelfde kaart, zelfde bewerkfuncties.
async function tdsKlantRender(){
  const m=document.getElementById("cmain");if(!m)return;
  const p=(typeof coachClients!=="undefined"?coachClients:[]).find(x=>x.id===calClient);if(!p)return;
  TDS.klant=calClient;TDS.bewerk=null;
  m.innerHTML='<div class="calhead"><span class="back" style="margin:0" onclick="tdsKlantTerug()">‹ Terug naar kalender</span><span class="month" style="margin-left:12px">Data</span><span class="sm muted" style="margin-left:auto">Testdata, normen en prioriteiten van '+naamVan(p)+'</span></div>'+
    '<div class="td-wrap td-klant"><div class="td-toolbar" id="td-klant-bar"></div><div class="td-grid td-single" id="td-grid"><div class="spin">Laden…</div></div></div>';
  if(!TDS.geladen)await tdsLaad();
  if(TDS.klant!==calClient||activePanel!=="data")return; // intussen ergens anders heen geklikt
  tdsKlantGrid();
}
function tdsKlantTerug(){TDS.klant=null;if(typeof calClient!=="undefined"&&calClient)setHash("klant/"+calClient);renderClient("kalender");}
function tdsKlantRij(){return TDS.rows.find(r=>r.profile_id===TDS.klant)||null;}
function tdsKlantGrid(){
  const grid=document.getElementById("td-grid"),bar=document.getElementById("td-klant-bar");if(!grid)return;
  const p=(typeof coachClients!=="undefined"?coachClients:[]).find(x=>x.id===TDS.klant)||{};
  if(TDS.fout){if(bar)bar.innerHTML="";grid.innerHTML='<div class="td-card"><b>Dashboard laden mislukt.</b><div class="td-meta" style="margin-top:6px">'+esc(TDS.fout)+'</div><button class="btn sm" style="margin-top:12px" onclick="TDS.geladen=false;tdsKlantRender()">Opnieuw proberen</button></div>';return;}
  const row=tdsKlantRij();
  if(!row){if(bar)bar.innerHTML="";grid.innerHTML=tdsKlantKoppelHtml(p);return;}
  const a=TDS.athletes[row.name];
  if(bar)bar.innerHTML='<button class="td-chip" id="td-alles" onclick="tdsAlles()">Alles uitklappen</button><span class="td-count"></span><button class="btn ghost sm" onclick="tdsNaarDashboard(\''+esc(row.name).replace(/'/g,"\\'")+'\')">Bekijk in Data › Atleten</button>';
  grid.innerHTML=tdsKaart(a);
  tdsGridListeners(grid);tdsOpenToepassen();tdsAllesKnop();
}
// Nog niet gekoppeld: bestaande atleet kiezen (zelfde naam staat alvast klaar) of een nieuwe aanmaken.
function tdsKlantKoppelHtml(p){
  const naam=[p.first_name,p.last_name].filter(Boolean).join(" ");
  const vrij=TDS.rows.filter(r=>!r.profile_id).map(r=>r.name).sort((a,b)=>a.localeCompare(b));
  const sug=vrij.find(n=>n.toLowerCase()===naam.toLowerCase())||"";
  const gender=tdsGeslacht(p);
  return '<div class="td-card td-koppel">'+
    '<p class="td-name">Nog geen atleet gekoppeld</p>'+
    '<p class="td-meta">Deze klant staat nog niet in Data › Atleten. Koppel een bestaande atleet of maak een nieuwe aan.</p>'+
    (vrij.length?'<div class="td-form"><div class="td-f-h">Koppel aan bestaande atleet</div><div class="td-f-row"><select class="lid-in" id="td-k-sel" style="flex:1"><option value="">– kies een atleet –</option>'+vrij.map(n=>'<option value="'+esc(n)+'"'+(n===sug?" selected":"")+'>'+esc(n)+'</option>').join("")+'</select><button class="btn sm" onclick="tdsKlantKoppel()">Koppelen</button></div>'+(sug?'<div class="td-hint">Er staat al een atleet met dezelfde naam; die is alvast gekozen.</div>':"")+'</div>':"")+
    '<div class="td-form"><div class="td-f-h">Nieuwe atleet aanmaken voor deze klant</div><div class="td-f-grid">'+
      '<label>Naam<input class="lid-in" id="td-k-name" value="'+esc(naam)+'"></label>'+
      '<label>Geslacht<select class="lid-in" id="td-k-gender"><option value="">– kies –</option><option value="M"'+(gender==="M"?" selected":"")+'>Man</option><option value="F"'+(gender==="F"?" selected":"")+'>Vrouw</option></select></label>'+
      '<label>Dag (optioneel)<select class="lid-in" id="td-k-day"><option value="">– geen vaste dag –</option>'+TDS_DAGEN.map(d=>'<option>'+d+'</option>').join("")+'</select></label>'+
      '<label>Gewicht (kg)<input class="lid-in" id="td-k-bw" placeholder="optioneel" value="'+esc(p.weight_kg??"")+'"></label>'+
    '</div><div class="td-f-acties"><button class="btn sm" onclick="tdsKlantNieuw()">Aanmaken</button></div>'+
    '<div class="td-hint">Geslacht en gewicht staan alvast ingevuld als de klant ze in de app heeft ingevuld (Profiel). Na het aanmaken kun je de testwaarden uit Metingen &amp; PR\'s overnemen met de knop "Uit de app" op de kaart.</div></div>'+
  '</div>';
}
async function tdsKlantKoppel(){
  const sel=document.getElementById("td-k-sel");const name=sel?sel.value:"";if(!name){toast("Kies een atleet");return;}
  const row=TDS.rows.find(r=>r.name===name);if(!row)return;
  if(!(await tdsZetKlant(row,TDS.klant)))return;
  toast("Gekoppeld");tdsKlantGrid();
}
async function tdsKlantNieuw(){
  const v=i=>{const e=document.getElementById(i);return e?e.value.trim():"";};
  const name=v("td-k-name");if(!name){toast("Vul een naam in");return;}
  if(TDS.athletes[name]){toast("Er bestaat al een atleet met deze naam");return;}
  const gender=v("td-k-gender");if(!gender){toast("Kies het geslacht; de normen hangen ervan af");return;}
  const input={gender,updated:tdsVandaag()+" (aangemaakt in dashboard)",target_level:"Quarterfinal"};
  if(v("td-k-day"))input.day=v("td-k-day"); // dag optioneel (20 okt)
  const bw=v("td-k-bw");if(bw){const n=Number(bw.replace(",","."));if(isNaN(n)){toast("Gewicht moet een getal zijn");return;}input.bw=n;}
  const p=(typeof coachClients!=="undefined"?coachClients:[]).find(x=>x.id===TDS.klant);
  const lt=tdsLeeftijd(p&&p.birth_date);if(lt!=null)input.age=lt;
  const company=(p&&p.company_id)||(ME.profile&&ME.profile.company_id);
  const q=await db.from("athlete_testdata").insert({company_id:company,name,profile_id:TDS.klant,input}).select("id,name,profile_id,input,comp_overlay,updated_at").single();
  if(q.error){
    if(tdsDubbeleNaam(q.error)){toast("Er bestaat al een atleet met deze naam bij een andere coach; vraag een beheerder die aan deze klant te koppelen, of kies een andere naam",8000);return;}
    toast("Toevoegen mislukt: "+(q.error.message||""));return;
  }
  TDS.rows.push(q.data);tdsZetRij(q.data);await tdsVers([q.data.id]);toast("Atleet toegevoegd, gevuld uit de app");tdsKlantGrid();
}

// ---------- wedstrijduitslagen bewerken (Michels `comp`: bron, overall, events, signaal) ----------
// Werkkopie TDS.compWerk tijdens het bewerken. "+ Wedstrijd", "+ Event" en verwijderen lezen
// eerst de velden uit het formulier (zodat getypte tekst blijft) en tekenen alleen de editor opnieuw.
function tdsCompEditorHtml(list){
  list=list||[];
  const ta=(id,val,ph)=>'<textarea class="lid-in" id="'+id+'" rows="2" placeholder="'+esc(ph||"")+'" style="flex:1">'+esc(val||"")+'</textarea>';
  const html=list.map((c,i)=>{
    const ev=(c.events||[]).map((e,j)=>'<div class="td-ce-ev"><input class="lid-in" id="td-ce-'+i+'-ev-'+j+'-naam" placeholder="Event (bijv. 26.1)" value="'+esc(e.naam||"")+'" style="width:120px"><input class="lid-in" id="td-ce-'+i+'-ev-'+j+'-rank" placeholder="Plaats (bijv. 439th)" value="'+esc(e.rank||"")+'" style="width:130px"><input class="lid-in" id="td-ce-'+i+'-ev-'+j+'-detail" placeholder="Detail (reps, tijd, wat opviel)" value="'+esc(e.detail||"")+'" style="flex:1"><button type="button" class="td-ce-x" title="Event verwijderen" onclick="tdsCompEventWeg('+i+','+j+')">\u00d7</button></div>').join("");
    return '<div class="td-ce" data-i="'+i+'">'+
      '<div class="td-f-row"><label style="width:70px;flex:none">Bron</label><input class="lid-in" id="td-ce-'+i+'-bron" placeholder="Wedstrijd + bron, bijv. CrossFit Open 2026 (official leaderboard)" value="'+esc(c.bron||"")+'" style="flex:1"><button type="button" class="btn ghost sm td-danger" onclick="tdsCompWeg('+i+')">Verwijder wedstrijd</button></div>'+
      '<div class="td-f-row"><label style="width:70px;flex:none">Eindstand</label>'+ta("td-ce-"+i+"-overall",c.overall,"bijv. 508th worldwide / 8th Netherlands in Men 40-44 (2472 points)")+'</div>'+
      '<div class="td-ce-evs"><div class="td-f-h" style="margin:4px 0">Events</div>'+ev+'<button type="button" class="btn ghost sm" onclick="tdsCompEventBij('+i+')">+ Event</button></div>'+
      '<div class="td-f-row"><label style="width:70px;flex:none">Signaal</label>'+ta("td-ce-"+i+"-signaal",c.signaal,"Wat de uitslag zegt over sterk en zwak")+'</div>'+
    '</div>';
  }).join("");
  return html+'<button type="button" class="btn ghost sm" onclick="tdsCompBij()">+ Wedstrijd</button>';
}
function tdsCompLees(){
  const host=document.getElementById("td-f-comp");if(!host)return TDS.compWerk||[];
  const v=id=>{const e=document.getElementById(id);return e?e.value.trim():"";};
  return [...host.querySelectorAll(".td-ce")].map(el=>{
    const i=el.dataset.i;
    const events=[...el.querySelectorAll(".td-ce-ev")].map((_,j)=>({naam:v("td-ce-"+i+"-ev-"+j+"-naam"),rank:v("td-ce-"+i+"-ev-"+j+"-rank"),detail:v("td-ce-"+i+"-ev-"+j+"-detail")}));
    return {bron:v("td-ce-"+i+"-bron"),overall:v("td-ce-"+i+"-overall"),events,signaal:v("td-ce-"+i+"-signaal")};
  });
}
function tdsCompTeken(){const host=document.getElementById("td-f-comp");if(host)host.innerHTML=tdsCompEditorHtml(TDS.compWerk||[]);}
function tdsCompBij(){TDS.compWerk=tdsCompLees();TDS.compWerk.push({bron:"",overall:"",events:[{naam:"",rank:"",detail:""}],signaal:""});tdsCompTeken();}
function tdsCompWeg(i){
  TDS.compWerk=tdsCompLees();const c=TDS.compWerk[i];if(!c)return;
  const gevuld=c.bron||c.overall||c.signaal||(c.events||[]).some(e=>e.naam||e.rank||e.detail);
  if(gevuld&&!confirm("Deze wedstrijd uit de lijst halen? Dit wordt pas definitief bij Opslaan."))return;
  TDS.compWerk.splice(i,1);tdsCompTeken();
}
function tdsCompEventBij(i){TDS.compWerk=tdsCompLees();if(!TDS.compWerk[i])return;(TDS.compWerk[i].events=TDS.compWerk[i].events||[]).push({naam:"",rank:"",detail:""});tdsCompTeken();}
function tdsCompEventWeg(i,j){TDS.compWerk=tdsCompLees();if(!TDS.compWerk[i])return;TDS.compWerk[i].events.splice(j,1);tdsCompTeken();}
// Opschonen voor het opslaan: lege events en lege wedstrijden vallen weg; de vier sleutels blijven.
function tdsCompSchoon(list){
  return (list||[]).map(c=>({bron:c.bron||"",overall:c.overall||"",events:(c.events||[]).filter(e=>e.naam||e.rank||e.detail).map(e=>({naam:e.naam||"",rank:e.rank||"",detail:e.detail||""})),signaal:c.signaal||""}))
    .filter(c=>c.bron||c.overall||c.events.length||c.signaal);
}

// ---------- export en import in Michels formaat (athletes_input.json: {naam: invoer}) ----------
// Zolang Michel zijn Python naast de app gebruikt: export = alles wat in de app staat (ook
// notes/flags/recent), import = een verse export van hem inlezen. Bij import vervangt het
// bestand de invoer van bestaande atleten; notes/flags/recent uit de app blijven staan als het
// bestand ze niet heeft (zijn export laat die bewust weg). Atleten buiten het bestand blijven staan.
function tdsExportData(){
  const out={};
  // Michels Python leest d["day"]; een atleet zonder vaste dag (optioneel sinds 20 okt) krijgt in de export een lege dag mee.
  TDS.rows.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(r=>{const d=Object.assign({},r.input||{});if(!d.day)d.day="";out[r.name]=d;});
  return out;
}
function tdsExport(){
  if(!TDS.rows.length){toast("Geen atleten om te exporteren");return;}
  const txt=JSON.stringify(tdsExportData(),null,2);
  const blob=new Blob([txt],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="athletes_input_"+tdsVandaag()+".json";
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
  toast(TDS.rows.length+" atleten geëxporteerd");
}
function tdsImportBestand(inp){
  const f=inp.files&&inp.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=async()=>{
    let obj;try{obj=JSON.parse(String(rd.result));}catch(e){toast("Dit is geen geldig JSON-bestand");inp.value="";return;}
    await tdsImportVerwerk(obj);inp.value="";
  };
  rd.readAsText(f);
}
function tdsImportControle(obj){
  if(!obj||typeof obj!=="object"||Array.isArray(obj))return "verwacht een object met atleetnamen als sleutels (athletes_input.json)";
  const namen=Object.keys(obj);if(!namen.length)return "het bestand bevat geen atleten";
  for(const n of namen){
    const d=obj[n];
    if(!d||typeof d!=="object"||Array.isArray(d))return "atleet "+n+" heeft geen invoer-object";
    if(d.tests||d.cat_scores)return "dit lijkt athletes_dashboard.json (berekende data); gebruik athletes_input.json";
    if(d.gender!=="M"&&d.gender!=="F")return "atleet "+n+": gender moet M of F zijn";
    // day is sinds 20 okt optioneel (een lege dag uit onze eigen export mag terug).
  }
  return "";
}
async function tdsImportVerwerk(obj){
  const fout=tdsImportControle(obj);if(fout){toast("Import afgebroken: "+fout);return false;}
  const namen=Object.keys(obj);
  const bestaand=namen.filter(n=>TDS.rows.some(r=>r.name===n)),nieuw=namen.filter(n=>!TDS.rows.some(r=>r.name===n));
  if(!confirm("Import: "+nieuw.length+" nieuwe atleten, "+bestaand.length+" bijgewerkt.\n\nHet bestand vervangt de testwaarden en teksten van bestaande atleten. Notities, flags en Vandaag uit de app blijven staan als het bestand ze niet heeft. Atleten die niet in het bestand staan blijven ongewijzigd.\n\nDoorgaan?"))return false;
  const company=ME.profile&&ME.profile.company_id;
  let klaar=0,fail="";
  for(const n of namen){
    const d=obj[n],row=TDS.rows.find(r=>r.name===n);
    if(row){
      const merged=Object.assign({},d);
      ["notes","flags","recent"].forEach(k=>{if(!(k in merged)&&row.input&&row.input[k]!=null)merged[k]=row.input[k];});
      const u=await db.from("athlete_testdata").update({input:merged}).eq("id",row.id);
      if(u.error){fail=n+": "+(u.error.message||"");break;}
      row.input=merged;tdsZetRij(row);
    }else{
      const q=await db.from("athlete_testdata").insert({company_id:company,name:n,input:d}).select("id,name,profile_id,input,comp_overlay,updated_at").single();
      if(q.error){fail=n+": "+(q.error.message||"");break;}
      TDS.rows.push(q.data);tdsZetRij(q.data);
    }
    klaar++;
  }
  toast(fail?"Import gestopt bij "+fail+" ("+klaar+" van "+namen.length+" verwerkt)":klaar+" van "+namen.length+" atleten verwerkt");
  const h=document.getElementById("data-inhoud");if(h&&!TDS.klant)tdsRender(h);else tdsGrid();
  return !fail;
}

// ---------- testwaarden uit de app (Metingen & PR's en het profiel) voor gekoppelde atleten ----------
// Verzoek Stefan 20 okt 2026: de klanten van een coach in de YourProgram-app (Stefan Vissenberg)
// krijgen dezelfde kaart als Michels atleten, gevuld uit wat er al over ze in de app staat. De
// krachtlog schrijft echte 1RM's naar Metingen & PR's; die metingen, het profiel (geslacht, gewicht,
// geboortedatum) en de roei-/biketests komen hier als voorstel per veld. De coach neemt ze over (per
// veld of alles tegelijk); de kaart (`input`) blijft de bron, zodat Michels rekenlogica en zijn
// exportformaat ongewijzigd blijven. Nooit stilletjes: alleen via de knop "Uit de app" of het vinkje
// dat de coach zelf aanzet in "Kaarten voor klanten".
async function tdsAppLaad(ids){
  const alle=TDS.rows.filter(r=>r.profile_id).map(r=>r.profile_id);
  ids=(ids||alle).filter(id=>alle.includes(id));
  if(!ids.length)return;
  const namen=["Weight"];TDS_APP_MAP.forEach(m=>m.metrics.forEach(n=>{if(!namen.includes(n))namen.push(n);}));
  const sinds=new Date(Date.now()-TDS_GESPREK_DAGEN*864e5).toISOString();
  const [m,p,ch,wc]=await Promise.all([
    db.from("metrics").select("athlete_id,metric,value,unit,measured_at,note,result_id").in("athlete_id",ids).in("metric",namen).order("measured_at",{ascending:false}),
    db.from("profiles").select("id,gender,weight_kg,birth_date").in("id",ids),
    // Gesprekken (verzoek Stefan 21 okt): chat en reacties op workout-dagen van de laatste 30 dagen
    db.from("messages").select("athlete_id,sender_id,body,created_at").in("athlete_id",ids).gte("created_at",sinds).order("created_at",{ascending:false}).limit(600),
    db.from("workout_comments").select("athlete_id,author_id,body,created_at,workouts(workout_date,title)").in("athlete_id",ids).gte("created_at",sinds).order("created_at",{ascending:false}).limit(900)
  ]);
  if(m.error||p.error){console.error("tdsAppLaad",m.error||p.error);return;}
  if(ch.error||wc.error)console.error("tdsAppLaad gesprekken",ch.error||wc.error);
  ids.forEach(id=>{TDS.app.metrics[id]=[];TDS.app.gesprekken[id]=[];});
  (m.data||[]).forEach(r=>{(TDS.app.metrics[r.athlete_id]=TDS.app.metrics[r.athlete_id]||[]).push(r);});
  (p.data||[]).forEach(r=>{TDS.app.profiel[r.id]=r;});
  (ch.data||[]).forEach(r=>{if(!String(r.body||"").trim())return;(TDS.app.gesprekken[r.athlete_id]=TDS.app.gesprekken[r.athlete_id]||[]).push({soort:"chat",van:r.sender_id===r.athlete_id?"sporter":"coach",body:r.body,t:r.created_at});});
  (wc.data||[]).forEach(r=>{if(!String(r.body||"").trim())return;(TDS.app.gesprekken[r.athlete_id]=TDS.app.gesprekken[r.athlete_id]||[]).push({soort:"workout",van:r.author_id===r.athlete_id?"sporter":"coach",body:r.body,t:r.created_at,dag:r.workouts&&r.workouts.workout_date,titel:r.workouts&&r.workouts.title});});
  ids.forEach(id=>{TDS.app.gesprekken[id].sort((x,y)=>String(y.t).localeCompare(String(x.t)));});
}
// Postgres-fout 23505 op de unieke naam per bedrijf (athlete_testdata_company_id_name_key).
function tdsDubbeleNaam(err){return !!err&&(err.code==="23505"||/duplicate key|company_id_name_key/i.test(err.message||""));}
// Geslacht uit het profiel in de app ("man"/"vrouw", soms m/f/v) → M/F van Michels invoer; leeg = onbekend.
function tdsGeslacht(p){const g=String((p&&p.gender)||"").toLowerCase();return (g==="man"||g==="m"||g==="male")?"M":((g==="vrouw"||g==="f"||g==="v"||g==="female")?"F":"");}
function tdsLeeftijd(bd){
  if(!bd)return null;const d=new Date(bd);if(isNaN(d))return null;
  const n=new Date();let a=n.getFullYear()-d.getFullYear();const m=n.getMonth()-d.getMonth();
  if(m<0||(m===0&&n.getDate()<d.getDate()))a--;
  return a>0&&a<120?a:null;
}
// Voorstellen voor één gekoppelde atleet: [{key,label,nu,nieuw,toon,datum,bron}], alleen waar de app
// iets anders heeft dan de kaart. Kilo's en calorieën: de hoogste meting telt; tijden: de snelste.
// Betrouwbare meting (zelfde regel als private.testdata_sync_app): door de coach ingevoerd of een echte single uit de
// krachtlog. Niet: het oude app-voorstel "Gelogd vanuit je workout" zonder set erachter (zwaarste set, ongeacht reps) en "geschat".
const tdsMetingOk=r=>!(String(r.note||"")==="Gelogd vanuit je workout"&&!r.result_id)&&!/geschat/i.test(r.note||"");
function tdsAppVoorstellen(a){
  if(!a||!a.profile_id)return [];
  const inp=a.input||{},mets=(TDS.app.metrics[a.profile_id]||[]).filter(tdsMetingOk),prof=TDS.app.profiel[a.profile_id]||null;
  const uit=[];
  const num=v=>{if(v===null||v===undefined||v==="")return null;const n=Number(v);return isFinite(n)?n:null;};
  const laatst=(x,y)=>String(y.measured_at||"").localeCompare(String(x.measured_at||""));
  if(prof){
    const g=tdsGeslacht(prof);
    if(g&&g!==inp.gender)uit.push({key:"gender",label:"Geslacht",nu:inp.gender==="F"?"vrouw":(inp.gender==="M"?"man":"–"),nieuw:g,toon:g==="M"?"man":"vrouw",datum:"",bron:"profiel in de app"});
    // Gewicht: het profiel (vult de sporter zelf) wint, anders de nieuwste meting Weight (zelfde regel als de database)
    const w=num(prof.weight_kg);
    const wm=mets.filter(r=>r.metric==="Weight"&&r.unit==="kg"&&num(r.value)!=null).sort(laatst)[0];
    const gew=(w!=null&&w>0)?{v:w,d:"",b:"profiel in de app"}:(wm?{v:num(wm.value),d:wm.measured_at,b:"Metingen & PR's (Weight)"}:null);
    if(gew&&gew.v!==num(inp.bw))uit.push({key:"bw",label:"Lichaamsgewicht",nu:inp.bw!=null?inp.bw+" kg":"–",nieuw:gew.v,toon:gew.v+" kg",datum:gew.d||"",bron:gew.b});
    const lt=tdsLeeftijd(prof.birth_date);
    if(lt!=null&&lt!==num(inp.age))uit.push({key:"age",label:"Leeftijd",nu:inp.age!=null?String(inp.age):"–",nieuw:lt,toon:lt+" jr",datum:"",bron:"geboortedatum in het profiel"});
  }
  for(const m of TDS_APP_MAP){
    const unitOk=u=>m.soort==="tijd"?u==="sec":(m.soort==="cal"?u==="cal":u==="kg");
    const rows=mets.filter(r=>m.metrics.includes(r.metric)&&unitOk(r.unit)&&num(r.value)!=null);
    if(!rows.length)continue;
    rows.sort((x,y)=>(m.soort==="tijd"?num(x.value)-num(y.value):num(y.value)-num(x.value))||laatst(x,y));
    const best=rows[0];
    const label=(a.tests&&a.tests[m.test]&&a.tests[m.test].label)||m.key;
    const bron=best.metric+(m.opm?" ("+m.opm+")":"");
    if(m.soort==="tijd"){
      const t=tdS2t(Math.round(num(best.value)));
      if(t===inp[m.key])continue;
      uit.push({key:m.key,label,nu:inp[m.key]||"–",nieuw:t,toon:t,datum:best.measured_at||"",bron});
    }else{
      const v=num(best.value),eenheid=m.soort==="cal"?" cal":" kg";
      if(v===num(inp[m.key]))continue;
      uit.push({key:m.key,label,nu:inp[m.key]!=null?inp[m.key]+eenheid:"–",nieuw:v,toon:v+eenheid,datum:best.measured_at||"",bron});
    }
  }
  return uit;
}
// Knop in de kaartkop: alleen bij een gekoppelde atleet met iets nieuws in de app.
function tdsAppKnop(a){
  if(!a.profile_id)return "";
  const n=tdsAppVoorstellen(a).length;if(!n)return "";
  const open=TDS.app.open===a.name;
  return '<button class="td-editbtn td-appbtn'+(open?" on":"")+'" onclick="tdsAppToggle(\''+esc(a.name).replace(/'/g,"\\'")+'\')" title="Nieuwe waarden uit Metingen &amp; PR\'s en het profiel van deze klant">'+(open?"Sluiten":"Uit de app ("+n+")")+'</button>';
}
function tdsAppToggle(name){TDS.app.open=TDS.app.open===name?null:name;tdsHerteken(name);}
function tdsAppPaneel(a){
  if(TDS.app.open!==a.name)return "";
  const v=tdsAppVoorstellen(a);
  if(!v.length)return '<div class="td-form td-app"><div class="td-f-h">Uit de app</div><div class="td-hint" style="margin:0">De kaart is gelijk aan wat er in de app staat.</div></div>';
  const rijen=v.map((r,i)=>'<tr><td><input type="checkbox" class="td-app-vink" id="td-app-'+esc(a.id)+'-'+i+'" data-i="'+i+'" checked></td><td><label for="td-app-'+esc(a.id)+'-'+i+'">'+esc(r.label)+'</label></td><td>'+esc(r.nu)+'</td><td><b>'+esc(r.toon)+'</b></td><td class="td-norm-basis">'+esc(r.bron)+(r.datum?" · "+esc(r.datum):"")+'</td></tr>').join("");
  return '<div class="td-form td-app" id="td-app-'+esc(a.id)+'">'+
    '<div class="td-f-h">Uit de app: '+v.length+(v.length===1?" waarde":" waarden")+' nieuwer of anders dan op de kaart</div>'+
    '<table class="td-table"><thead><tr><th></th><th>Veld</th><th>Nu op de kaart</th><th>In de app</th><th>Bron</th></tr></thead><tbody>'+rijen+'</tbody></table>'+
    '<div class="td-f-acties"><button class="btn sm" onclick="tdsAppOvernemen(\''+esc(a.id)+'\')">Overnemen</button><button class="btn ghost sm" onclick="tdsAppToggle(\''+esc(a.name).replace(/'/g,"\\'")+'\')">Annuleren</button></div>'+
    '<div class="td-hint">De kaart volgt de app vanzelf: een hogere 1RM, een snellere tijd of een nieuw gewicht in het profiel komt er direct op. Hier staat alleen wat afwijkt in de andere richting (bijvoorbeeld een lagere meting nadat jij zelf een hogere waarde op de kaart zette). Overnemen is dan jouw keuze.</div>'+
  '</div>';
}
async function tdsAppOvernemen(id){
  const row=TDS.rows.find(r=>r.id===id);if(!row)return;
  const a=TDS.athletes[row.name];const v=tdsAppVoorstellen(a);
  const gekozen=[...document.querySelectorAll('#td-app-'+CSS.escape(id)+' .td-app-vink')].filter(c=>c.checked).map(c=>v[Number(c.dataset.i)]).filter(Boolean);
  if(!gekozen.length){toast("Vink minstens één waarde aan");return;}
  const patch={},remove=[];
  gekozen.forEach(r=>{patch[r.key]=r.nieuw;if(r.key==="front_squat")remove.push("front_squat_estimate");});
  patch.updated=tdsUpdatedTekst(row.input&&row.input.updated,"uit de app:",gekozen.map(r=>r.label+" "+r.toon).join(", "));
  const ok=await tdsPatch(id,patch,remove);
  if(!ok)return;
  TDS.app.open=null;toast(gekozen.length+(gekozen.length===1?" waarde overgenomen":" waarden overgenomen"));tdsHerteken(row.name);
}

// ---------- kaarten aanmaken voor klanten in de app die er nog geen hebben ----------
// Eén kaart per klant, gekoppeld via profile_id; geslacht, gewicht en leeftijd uit het profiel in de
// app (de klant vult die zelf in, keuze Stefan 20 okt). Zonder geslacht geen kaart: Michels normen
// hangen eraan en we gokken nooit. Een coach ziet hier alleen zijn eigen klanten (coachClients).
function tdsKlantenToggle(){TDS.klantenOpen=!TDS.klantenOpen;if(TDS.klantenOpen)TDS.nieuwOpen=false;const h=document.getElementById("data-inhoud");if(h)tdsRender(h);}
function tdsKlantenKandidaten(){
  const cl=(typeof coachClients!=="undefined"?coachClients:[]).filter(c=>!c.archived);
  return cl.filter(c=>!TDS.rows.some(r=>r.profile_id===c.id)).map(c=>{
    const naam=[c.first_name,c.last_name].filter(Boolean).join(" ")||c.email||"";
    const g=tdsGeslacht(c);const bezet=!!TDS.athletes[naam];
    return {c,naam,g,bezet,kan:!!g&&!bezet};
  }).sort((x,y)=>x.naam.localeCompare(y.naam));
}
function tdsKlantenForm(){
  if(!TDS.klantenOpen)return "";
  const k=tdsKlantenKandidaten();
  const rijen=k.map((x,i)=>'<tr><td><input type="checkbox" class="td-kl-vink" data-i="'+i+'"'+(x.kan?" checked":" disabled")+'></td><td>'+esc(x.naam)+'</td><td>'+(x.g?(x.g==="M"?"man":"vrouw"):'<span class="td-pct td-pct-orange">ontbreekt</span>')+'</td><td>'+(x.c.weight_kg!=null?esc(x.c.weight_kg)+" kg":"–")+'</td><td class="td-norm-basis">'+(x.bezet?"er is al een atleet met deze naam; koppel die via het klantdossier (Data)":(x.g?"":"de klant vult geslacht en gewicht zelf in via Profiel in de app"))+'</td></tr>').join("");
  return '<div class="td-form" style="margin-bottom:14px"><div class="td-f-h">Kaarten voor klanten zonder kaart</div>'+
    (k.length?'<table class="td-table"><thead><tr><th></th><th>Klant</th><th>Geslacht</th><th>Gewicht</th><th></th></tr></thead><tbody>'+rijen+'</tbody></table>'+
      '<div class="td-f-acties"><button class="btn sm" onclick="tdsKlantenAanmaken()">Aanmaken</button><button class="btn ghost sm" onclick="tdsKlantenToggle()">Annuleren</button></div>'+
      '<div class="td-hint">Elke kaart wordt gekoppeld aan het account van de klant en meteen gevuld uit de app: geslacht, gewicht en leeftijd uit het profiel, de testwaarden (1RM\'s, roeitijden) uit Metingen &amp; PR\'s. Daarna blijft de kaart vanzelf bij: elke nieuwe meting of profielwijziging komt er direct op. Zonder geslacht kan de kaart niet doorgerekend worden (de normen hangen ervan af). Een vaste dag is optioneel en zet je later via Bewerken.</div>'
      :'<div class="td-hint" style="margin:0">Alle klanten hebben al een kaart.</div><div class="td-f-acties"><button class="btn ghost sm" onclick="tdsKlantenToggle()">Sluiten</button></div>')+
  '</div>';
}
async function tdsKlantenAanmaken(){
  const k=tdsKlantenKandidaten();
  const gekozen=[...document.querySelectorAll(".td-kl-vink")].filter(c=>c.checked).map(c=>k[Number(c.dataset.i)]).filter(x=>x&&x.kan);
  if(!gekozen.length){toast("Vink minstens één klant aan");return;}
  const nieuw=[],overgeslagen=[];let fail="";
  for(const x of gekozen){
    const input={gender:x.g,updated:tdsVandaag()+" (kaart aangemaakt uit het app-profiel via dashboard)",target_level:"Quarterfinal"};
    const bw=Number(x.c.weight_kg);if(x.c.weight_kg!=null&&isFinite(bw)&&bw>0)input.bw=bw;
    const lt=tdsLeeftijd(x.c.birth_date);if(lt!=null)input.age=lt;
    const company=x.c.company_id||(ME.profile&&ME.profile.company_id);
    const q=await db.from("athlete_testdata").insert({company_id:company,name:x.naam,profile_id:x.c.id,input}).select("id,name,profile_id,input,comp_overlay,updated_at").single();
    if(q.error){
      // Naam is uniek per bedrijf (index athlete_testdata_company_id_name_key). Een coach ziet een losse
      // atleet van een andere coach niet (rechten), dus die botsing merkt hij pas hier: overslaan en melden.
      if(tdsDubbeleNaam(q.error)){overgeslagen.push(x.naam);continue;}
      fail=x.naam+": "+(q.error.message||"");break;
    }
    TDS.rows.push(q.data);tdsZetRij(q.data);nieuw.push(q.data);
  }
  // De database vult elke nieuwe kaart meteen uit het profiel en Metingen & PR's: vers ophalen.
  if(nieuw.length)await tdsVers(nieuw.map(r=>r.id));
  const n=nieuw.length;
  let msg=n+(n===1?" kaart aangemaakt en gevuld uit de app":" kaarten aangemaakt en gevuld uit de app");
  if(overgeslagen.length)msg+=". Overgeslagen (er bestaat al een atleet met deze naam bij een andere coach; vraag een beheerder die te koppelen): "+overgeslagen.join(", ");
  if(fail)msg+="; gestopt bij "+fail;
  toast(msg,(fail||overgeslagen.length)?9000:undefined);
  TDS.klantenOpen=false;TDS.zoek="";TDS.dag="Alle";
  const h=document.getElementById("data-inhoud");if(h)tdsRender(h);
}

// ---------- gesprekken uit de app (chat + reacties op workout-dagen), coach-only ----------
// Verzoek Stefan 21 okt 2026: wat een coach met zijn klant bespreekt (blessures!) hoort op de kaart,
// zoals Michel dat met zijn WhatsApp-samenvatting doet. Bij een gekoppeld account staan de laatste
// 30 dagen chat en dagreacties onder de kaart. "Samenvatting maken (AI)" (Edge Function
// kaart-gesprekken) maakt er een voorstel van: korte samenvatting, actiepunten en blessures.
// De coach kijkt na, past aan en neemt over: samenvatting en actiepunten in het weekstatus-blok
// (`recent.chat`, naast Michels strivee/whatsapp), blessures bij Let op (`flags`). Nooit automatisch.
const TDS_GESPREK_DAGEN=30;
const tdsGsDatum=iso=>{if(!iso)return "";const d=new Date(String(iso).length===10?iso+"T12:00:00":iso);if(isNaN(d))return String(iso);return d.getDate()+" "+MAANDKORT[d.getMonth()];};
const tdsDagTekst=d=>["Zo","Ma","Di","Wo","Do","Vr","Za"][d.getDay()]+" "+d.getDate()+" "+MAANDKORT[d.getMonth()];
function tdsGesprekken(a){
  if(!a.profile_id)return "";
  const lijst=TDS.app.gesprekken[a.profile_id]||[];
  const v=TDS.app.voorstel[a.id];
  const items=lijst.slice(0,60).map(g=>'<li class="td-gs '+(g.van==="coach"?"td-gs-coach":"td-gs-sporter")+'"><span class="td-gs-meta">'+esc(tdsGsDatum(g.t))+' · '+(g.van==="coach"?"coach":"sporter")+(g.soort==="workout"?' · bij workout'+(g.dag?" "+esc(tdsGsDatum(g.dag)):"")+(g.titel?' ('+esc(g.titel)+')':""):"")+'</span>'+esc(g.body).replace(/\n/g,"<br>")+'</li>').join("");
  const body='<div class="td-gs-acties"><button class="btn ghost sm" onclick="tdsGesprekAi(\''+esc(a.id)+'\')"'+(lijst.length&&!(v&&v.bezig)?"":" disabled")+'>Samenvatting maken (AI)</button><span class="td-hint" style="margin:0">Elke maandagochtend komt er automatisch een weekstatus van de afgelopen week op de kaart (Chat (app), actiepunten, blessures bij Let op). Met deze knop maak je er tussendoor een van de laatste 30 dagen; die kijk je na en neem je zelf over.</span></div>'+
    (v?tdsGesprekVoorstelHtml(a,v):"")+
    (lijst.length?'<ul class="td-gs-lijst">'+items+'</ul>'+(lijst.length>60?'<div class="td-hint">Alleen de laatste 60 berichten staan hier.</div>':""):'<div class="td-leeg-note">Geen berichten in de laatste '+TDS_GESPREK_DAGEN+' dagen.</div>');
  const note=lijst.length?lijst.length+" berichten · "+TDS_GESPREK_DAGEN+" dagen":"";
  return tdsSec("gesprekken","Gesprekken in de app",note,body,"td-sec-notes");
}
function tdsGesprekVoorstelHtml(a,v){
  if(v.bezig)return '<div class="td-gs-voorstel"><span class="td-hint" style="margin:0">AI leest de gesprekken…</span></div>';
  if(v.fout)return '<div class="td-gs-voorstel td-gs-fout">Samenvatting mislukt: '+esc(v.fout)+'</div>';
  const id=esc(a.id);
  return '<div class="td-gs-voorstel"><div class="td-f-h">Voorstel voor de weekstatus (AI, '+esc(v.datum)+')</div>'+
    '<div class="td-f-row"><label style="width:120px;flex:none">Samenvatting</label><textarea class="lid-in" id="td-gs-sam-'+id+'" rows="3" style="flex:1">'+esc(v.samenvatting||"")+'</textarea></div>'+
    '<div class="td-f-row"><label style="width:120px;flex:none">Actiepunten</label><textarea class="lid-in" id="td-gs-act-'+id+'" rows="2" style="flex:1" placeholder="Eén per regel">'+esc((v.actiepunten||[]).join("\n"))+'</textarea></div>'+
    '<div class="td-f-row"><label style="width:120px;flex:none">Blessures / let op</label><textarea class="lid-in" id="td-gs-bl-'+id+'" rows="2" style="flex:1" placeholder="Eén per regel; komt bij Let op">'+esc((v.blessures||[]).concat(v.signalen||[]).join("\n"))+'</textarea></div>'+
    '<div class="td-f-acties"><button class="btn sm" onclick="tdsGesprekOvernemen(\''+id+'\')">Overnemen in weekstatus</button><button class="btn ghost sm" onclick="tdsGesprekWeg(\''+id+'\')">Annuleren</button>'+(v.kosten&&v.kosten.usd!=null?'<span class="td-hint" style="margin:0">kosten ≈ $'+Number(v.kosten.usd).toFixed(3)+'</span>':"")+'</div></div>';
}
async function tdsGesprekAi(id){
  const row=TDS.rows.find(r=>r.id===id);if(!row||!row.profile_id)return;
  TDS.app.voorstel[id]={bezig:true};tdsHerteken(row.name);
  let data=null,error=null;
  try{({data,error}=await db.functions.invoke("kaart-gesprekken",{body:{athlete_id:row.profile_id,dagen:TDS_GESPREK_DAGEN}}));}catch(e){error=e;}
  if(error||!data||data.error){
    let t=(data&&data.error)||"";
    if(!t&&error&&error.context&&error.context.json){try{t=((await error.context.json())||{}).error||"";}catch(e){}}
    TDS.app.voorstel[id]={fout:t||(error&&error.message)||"AI-aanroep mislukt"};
  }else TDS.app.voorstel[id]={samenvatting:data.samenvatting||"",actiepunten:data.actiepunten||[],blessures:data.blessures||[],signalen:data.signalen||[],kosten:data.kosten||null,datum:tdsDagTekst(new Date())};
  tdsHerteken(row.name);
  // De sectie open laten zien
  const det=document.querySelector('#td-grid .td-card[data-name="'+CSS.escape(row.name)+'"] details[data-sec="gesprekken"]');if(det)det.open=true;
}
function tdsGesprekWeg(id){delete TDS.app.voorstel[id];const row=TDS.rows.find(r=>r.id===id);if(row)tdsHerteken(row.name);}
async function tdsGesprekOvernemen(id){
  const row=TDS.rows.find(r=>r.id===id);if(!row)return;
  const v=i=>{const e=document.getElementById(i);return e?e.value.trim():"";};
  const regels=t=>t.split("\n").map(s=>s.trim()).filter(Boolean);
  const sam=v("td-gs-sam-"+id),acts=regels(v("td-gs-act-"+id)),bl=regels(v("td-gs-bl-"+id));
  if(!sam&&!acts.length&&!bl.length){toast("Er is niets om over te nemen");return;}
  const inp=row.input||{},vandaag=tdsDagTekst(new Date());
  const rec=Object.assign({},(inp.recent&&typeof inp.recent==="object")?inp.recent:{});
  rec.date=vandaag;
  if(sam)rec.chat=sam;else delete rec.chat;
  if(acts.length)rec.actions=acts;else delete rec.actions;
  const patch={recent:rec};
  if(bl.length){
    const oud=Array.isArray(inp.flags)?inp.flags:(inp.flags?[String(inp.flags)]:[]);
    const nieuw=bl.map(x=>"Chat "+vandaag+": "+x).filter(x=>!oud.includes(x));
    if(nieuw.length)patch.flags=oud.concat(nieuw);
  }
  patch.updated=tdsUpdatedTekst(inp.updated,"weekstatus uit de gesprekken",vandaag);
  const ok=await tdsPatch(id,patch,[]);
  if(!ok)return;
  delete TDS.app.voorstel[id];toast("Weekstatus bijgewerkt");tdsHerteken(row.name);
}
