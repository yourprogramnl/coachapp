// app/data.js — de Data-sectie (topnav): kopje Atleten = het YP-atletenrapport
// (overgenomen uit Stefans standalone yp-coach-dashboard.html). De goal-engine
// (doelformules op basis van lichaamsgewicht en basisliften), categorieën en
// kleurgrenzen zijn 1-op-1 overgenomen; de data komt uit Supabase
// (data_athletes + data_scores) en bewerken schrijft direct naar de database.
// Kopje Wedstrijden: invulling volgt.
let dataTab="atleten"; // atleten | wedstrijden

// ---------- vaste definities (YP-standaard, uit het originele dashboard) ----------
const DT_CATS={"Lower Strength":["back_squat","front_squat","ohs","deadlift","bulgarian"],
"Weightlifting":["power_clean","power_snatch","clean_jerk","snatch","thruster","split_jerk","squat_clean"],
"Upper Strength":["cgbp","strict_press","shoulder_press6","prone_row6","w_pullup","w_dip"],
"Gymnastics":["kip_hspu5","strict_hspu5","strict_pu5","def_hspu","llrc","rmu30","rmu_max"],
"Barbell Tester":["bs85","amrap_pc8","snatch25"],
"CrossFit Tester":["5rft","4x4_thr","4x4_dl","amrap18"],
"Conditie Tester":["lactic","echo10","row60","row2k","row3030","run3k"]};
const DT_TESTS={back_squat:{label:"1RM Back squat",unit:"kg",dir:"h",uitleg:"2 x lichaamsgewicht"},
front_squat:{label:"1RM Front squat",unit:"kg",dir:"h",uitleg:"1,7 x lichaamsgewicht"},
ohs:{label:"Overhead squat",unit:"kg",dir:"h",uitleg:"90% van front squat"},
deadlift:{label:"Deadlift",unit:"kg",dir:"h",uitleg:"125% van back squat"},
bulgarian:{label:"8RM Bulgarian split squat",unit:"kg",dir:"h",uitleg:"45% van lichaamsgewicht per hand"},
power_clean:{label:"1RM Power clean",unit:"kg",dir:"h",uitleg:"1,4 x lichaamsgewicht"},
power_snatch:{label:"1RM Power snatch",unit:"kg",dir:"h",uitleg:"1,1 x lichaamsgewicht"},
clean_jerk:{label:"1RM Clean & Jerk",unit:"kg",dir:"h",uitleg:"90% van front squat"},
snatch:{label:"1RM Snatch",unit:"kg",dir:"h",uitleg:"1,3 x lichaamsgewicht"},
thruster:{label:"1RM Thruster",unit:"kg",dir:"h",uitleg:"75% van front squat"},
split_jerk:{label:"Split jerk",unit:"kg",dir:"h",uitleg:"110% van squat clean"},
squat_clean:{label:"1RM Squat clean",unit:"kg",dir:"h",uitleg:"1,6 x lichaamsgewicht"},
cgbp:{label:"1RM Close grip bench press",unit:"kg",dir:"h",uitleg:"100% van power clean"},
strict_press:{label:"Strict barbell press",unit:"kg",dir:"h",uitleg:"65% van weighted pull-up"},
shoulder_press6:{label:"6RM Shoulder press",unit:"kg",dir:"h",uitleg:"29% van close grip bench per arm"},
prone_row6:{label:"6RM Prone row",unit:"kg",dir:"h",uitleg:"50% van lichaamsgewicht per arm"},
w_pullup:{label:"Weighted pull-up",unit:"kg",dir:"h",uitleg:"1,5 x lichaamsgewicht"},
w_dip:{label:"Weighted dip",unit:"kg",dir:"h",uitleg:"1,5 x lichaamsgewicht"},
kip_hspu5:{label:"5 min Kipping HSPU",unit:"reps",dir:"h",uitleg:"60 reps"},
strict_hspu5:{label:"5 min Strict HSPU",unit:"reps",dir:"h",uitleg:"60 reps"},
strict_pu5:{label:"5 min Strict pull-up",unit:"reps",dir:"h",uitleg:"60 reps"},
def_hspu:{label:"Deficit strict HSPU test",unit:"reps",dir:"h",uitleg:"40 reps in 10 min"},
llrc:{label:"LLRC tester",unit:"reps",dir:"h",uitleg:"20 reps in 10 min"},
rmu30:{label:"30 RMU for time",unit:"tijd",dir:"l",uitleg:"onder 3:00"},
rmu_max:{label:"Max unbroken RMU",unit:"reps",dir:"h",uitleg:"9% van lichaamsgewicht in lbs"},
bs85:{label:"Back squat 85% (reps)",unit:"reps",dir:"h",uitleg:"6+ reps (doel 7)"},
amrap_pc8:{label:"8 min AMRAP power clean",unit:"reps",dir:"h",uitleg:"24+ reps (doel 25)"},
snatch25:{label:"Snatch 25 reps for time",unit:"tijd",dir:"l",uitleg:"onder 5:00"},
"5rft":{label:"5RFT: PS + HSPU",unit:"tijd",dir:"l",uitleg:"excellent 6-7 min"},
"4x4_thr":{label:"4x4: 7 thrusters / 7 pull-ups",unit:"tijd",dir:"l",uitleg:"sub 2:00 per ronde"},
"4x4_dl":{label:"4x4: 7 DL / 7 kipping HSPU",unit:"tijd",dir:"l",uitleg:"sub 2:00 per ronde"},
amrap18:{label:"18 min AMRAP (reps)",unit:"reps",dir:"h",uitleg:"elite 500+"},
lactic:{label:"Lactic repeats (1e set)",unit:"tijd",dir:"l",uitleg:"3:00 - 3:30"},
echo10:{label:"10 min Echo bike (cal)",unit:"cal",dir:"h",uitleg:"2 x lichaamsgewicht"},
row60:{label:"60 min Row (meters)",unit:"m",dir:"h",uitleg:"17.000 m"},
row2k:{label:"2K Row",unit:"tijd",dir:"l",uitleg:"onder 6:40"},
row3030:{label:"Row 30/30 (1e set meters)",unit:"m",dir:"h",uitleg:"geen vast doel"},
run3k:{label:"3K Run",unit:"tijd",dir:"l",uitleg:"onder 11:00"}};

// ---------- staat + data laden ----------
let DT={athletes:{},geladen:false,view:"team",geslacht:"man",sortKey:"TOT",sortDir:-1,filter:"",sel:"",selA:"",selB:"",selTest:"back_squat",nieuwOpen:false};
let dtRadarP=null,dtRadarC=null;

async function dtLaad(){
  const[aq,sq]=await Promise.all([
    db.from("data_athletes").select("*").order("name"),
    db.from("data_scores").select("athlete_id,test_key,value"),
  ]);
  if(aq.error||sq.error){toast("Data laden mislukt");return;}
  const map={};
  (aq.data||[]).forEach(a=>{map[a.name]={id:a.id,bw:a.bw==null?null:Number(a.bw),gender:a.gender||"man",profile_id:a.profile_id||null,scores:{}};});
  const opId={};(aq.data||[]).forEach(a=>{opId[a.id]=a.name;});
  (sq.data||[]).forEach(s=>{const n=opId[s.athlete_id];if(n)map[n].scores[s.test_key]=Number(s.value);});
  DT.athletes=map;DT.geladen=true;
  if(!map[DT.sel])DT.sel=dtRanked()[0]||"";
  if(!map[DT.selA])DT.selA=dtRanked()[0]||"";
  if(!map[DT.selB])DT.selB=dtRanked()[1]||dtRanked()[0]||"";
}

// ---------- goal & pct engine (1-op-1 uit het originele dashboard) ----------
const dtS=(a,k)=>{const v=DT.athletes[a]&&DT.athletes[a].scores[k];return v==null?null:v;};
const dtBW=a=>(DT.athletes[a]&&DT.athletes[a].bw)??null;
function dtGoal(a,k){
  const bw=dtBW(a),S=dtS;
  const G={
    back_squat:()=>bw&&2*bw, front_squat:()=>bw&&1.7*bw,
    ohs:()=>S(a,'front_squat')?0.9*S(a,'front_squat'):bw&&0.9*1.7*bw,
    deadlift:()=>S(a,'back_squat')?1.25*S(a,'back_squat'):bw&&2.5*bw,
    bulgarian:()=>bw&&0.45*bw,
    power_clean:()=>bw&&1.4*bw, power_snatch:()=>bw&&1.1*bw,
    clean_jerk:()=>S(a,'front_squat')?0.9*S(a,'front_squat'):bw&&0.9*1.7*bw,
    snatch:()=>bw&&1.3*bw,
    thruster:()=>S(a,'front_squat')?0.75*S(a,'front_squat'):bw&&0.75*1.7*bw,
    split_jerk:()=>S(a,'squat_clean')?1.1*S(a,'squat_clean'):bw&&1.1*1.6*bw,
    squat_clean:()=>bw&&1.6*bw,
    cgbp:()=>S(a,'power_clean')?S(a,'power_clean'):bw&&1.4*bw,
    strict_press:()=>S(a,'w_pullup')?0.65*S(a,'w_pullup'):null,
    shoulder_press6:()=>S(a,'cgbp')?0.29*S(a,'cgbp'):null,
    prone_row6:()=>bw&&0.5*bw, w_pullup:()=>bw&&1.5*bw, w_dip:()=>bw&&1.5*bw,
    kip_hspu5:()=>60, strict_hspu5:()=>60, strict_pu5:()=>60, def_hspu:()=>40, llrc:()=>20,
    rmu30:()=>180, rmu_max:()=>bw&&Math.round(0.198*bw),
    bs85:()=>7, amrap_pc8:()=>25, snatch25:()=>300,
    '5rft':()=>420, '4x4_thr':()=>120, '4x4_dl':()=>120, amrap18:()=>500,
    lactic:()=>195, echo10:()=>bw&&2*bw, row60:()=>17000, row2k:()=>400,
    row3030:()=>null, run3k:()=>660
  };
  return (G[k]?G[k]():null)||null;
}
function dtPct(a,k){
  const s=dtS(a,k),g=dtGoal(a,k);
  if(s==null||g==null||g===0)return null;
  return DT_TESTS[k].dir==='l'?(g-s)/g:(s-g)/g;
}
const dtCatPct=(a,c)=>{const v=DT_CATS[c].map(k=>dtPct(a,k)).filter(x=>x!=null);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;};
const dtTotPct=a=>{const v=Object.keys(DT_CATS).map(c=>dtCatPct(a,c)).filter(x=>x!=null);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;};
const dtTeamCat=c=>{const v=dtNames().map(a=>dtCatPct(a,c)).filter(x=>x!=null);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;};
// Alles (team, ranking, vergelijken, selecties) werkt binnen het gekozen
// geslacht: mannen en vrouwen zijn aparte lijsten, zoals de originele sheets.
const dtNames=()=>Object.keys(DT.athletes).filter(a=>(DT.athletes[a].gender||"man")===DT.geslacht);
const dtRanked=()=>[...dtNames()].sort((a,b)=>(dtTotPct(b)??-9)-(dtTotPct(a)??-9));
const dtRankOf=a=>{const t=dtTotPct(a);return t==null?null:dtNames().filter(x=>dtTotPct(x)!=null&&dtTotPct(x)>t).length+1;};

// ---------- weergave-hulpjes (kleurgrenzen: groen >=0, oranje >=-15%, rood eronder) ----------
const dtFmtTijd=s=>`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;
function dtFmtScore(k,v){
  if(v==null)return '—';
  const u=DT_TESTS[k].unit;
  if(u==='tijd')return dtFmtTijd(v);
  if(u==='kg')return (Math.round(v*10)/10).toLocaleString('nl-NL')+' kg';
  return Math.round(v).toLocaleString('nl-NL');
}
const dtRawScore=(k,v)=>v==null?'':DT_TESTS[k].unit==='tijd'?dtFmtTijd(v):String(Math.round(v*10)/10);
const dtFmtPct=v=>v==null?'—':Math.max(0,Math.round((1+v)*100))+'%';
const dtFmtRaw=v=>v==null?'—':(v>0?'+':'')+Math.round(v*100)+'%';
const dtCls=v=>v==null?'e':v>=0?'g':v>=-0.15?'a':'r';
const dtClr=v=>v==null?'#c3c9d4':v>=0?'var(--ok)':v>=-0.15?'var(--warn)':'var(--bad)';
const dtNTests=a=>Object.keys(DT_TESTS).filter(k=>dtS(a,k)!=null).length;
const dtShortCat=c=>c.replace(' Strength','').replace(' Tester','').replace('Weightlifting','WL');
function dtParseInput(k,str){
  str=(str||"").trim().replace(',','.');
  if(str==='')return{ok:true,val:null};
  if(DT_TESTS[k].unit==='tijd'){
    const m=str.match(/^(\d{1,3}):([0-5]?\d)$/);
    if(!m)return{ok:false};
    return{ok:true,val:parseInt(m[1])*60+parseInt(m[2])};
  }
  const n=parseFloat(str);
  return isNaN(n)||n<0?{ok:false}:{ok:true,val:n};
}

// ---------- Chart.js lazy laden (radar is een extraatje; zonder blijft alles werken) ----------
function dtChart(cb){
  if(window.Chart){cb();return;}
  let s=document.getElementById("chartjs-cdn");
  if(!s){
    s=document.createElement("script");s.id="chartjs-cdn";
    s.src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
    document.head.appendChild(s);
  }
  const t=setInterval(()=>{if(window.Chart){clearInterval(t);cb();}},120);
  setTimeout(()=>clearInterval(t),8000);
}
const dtRadarOpts={responsive:true,
  scales:{r:{min:0,max:130,ticks:{stepSize:25,callback:v=>v+'%',backdropColor:'transparent',font:{size:10}},
    grid:{color:'#e3e7ef'},angleLines:{color:'#e3e7ef'},
    pointLabels:{color:'#1b2330',font:{size:11,weight:'600'}}}},
  plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.label+': '+Math.round(c.raw)+'%'}}}};
const dtRadarData=a=>Object.keys(DT_CATS).map(c=>{const v=dtCatPct(a,c);return v==null?null:(1+v)*100;});
const dtTeamRadar=()=>Object.keys(DT_CATS).map(c=>{const v=dtTeamCat(c);return v==null?null:(1+v)*100;});

// ---------- pagina ----------
async function fillData(){
  const cp=document.getElementById("cpage");if(!cp)return;
  if(dataTab==="atleten"&&!DT.geladen)await dtLaad();
  cp.innerHTML='<div class="hrow"><h1>Data</h1></div>'+
    '<div class="ctabs" style="margin-bottom:14px">'+
      '<button class="'+(dataTab==="atleten"?"on":"")+'" onclick="dataZetTab(\'atleten\')">Atleten</button>'+
      '<button class="'+(dataTab==="wedstrijden"?"on":"")+'" onclick="dataZetTab(\'wedstrijden\')">Wedstrijden</button>'+
      '<button class="'+(dataTab==="open"?"on":"")+'" onclick="dataZetTab(\'open\')">CrossFit Open</button>'+
    '</div>'+
    '<div id="data-inhoud"></div>';
  dataRender();
}
async function dataZetTab(t){
  dataTab=t;
  if(t==="atleten"&&!DT.geladen)await dtLaad();
  const lbl={atleten:"atleten",wedstrijden:"wedstrijden",open:"crossfit"};
  const tabs=document.querySelectorAll("#cpage .ctabs button");
  tabs.forEach(b=>b.classList.toggle("on",(b.textContent||"").toLowerCase().indexOf(lbl[t]||t)===0));
  dataRender();
}
function dataRender(){
  const h=document.getElementById("data-inhoud");if(!h)return;
  if(dataTab==="wedstrijden"){wdRender(h);return;}
  if(dataTab==="open"){osRender(h);return;}
  const sub=[["team","Team"],["atleet","Atleet"],["vergelijk","Vergelijk"],["ranking","Ranking"]]
    .map(v=>'<button class="'+(DT.view===v[0]?"on":"")+'" onclick="dtGo(\''+v[0]+'\')">'+v[1]+'</button>').join("");
  const gesl=[["man","Mannen"],["vrouw","Vrouwen"]]
    .map(g=>'<button class="'+(DT.geslacht===g[0]?"on":"")+'" onclick="dtGeslacht(\''+g[0]+'\')">'+g[1]+'</button>').join("");
  h.innerHTML='<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">'+
    '<div class="dt-subnav">'+sub+'</div>'+
    '<div class="dt-subnav" style="margin-left:auto">'+gesl+'</div></div>'+
    '<div id="dt-view"></div>';
  dtRenderView();
}
function dtGo(v){DT.view=v;dataRender();}
function dtGeslacht(g){
  DT.geslacht=g;
  // selecties horen binnen het gekozen geslacht te vallen
  if(!dtNames().includes(DT.sel))DT.sel=dtRanked()[0]||"";
  if(!dtNames().includes(DT.selA))DT.selA=dtRanked()[0]||"";
  if(!dtNames().includes(DT.selB))DT.selB=dtRanked()[1]||dtRanked()[0]||"";
  dataRender();
}
function dtRenderView(){
  const h=document.getElementById("dt-view");if(!h)return;
  if(!dtNames().length){
    h.innerHTML='<div class="panel" style="padding:26px;text-align:center"><div class="sm muted" style="line-height:1.7">Nog geen atleten.<br>Voeg de eerste toe via de Team-weergave.</div>'+
      '<button class="btn sm2" style="margin-top:12px" onclick="dtNieuwToggle()">+ Atleet</button>'+dtNieuwFormHtml()+'</div>';
    return;
  }
  if(DT.view==="team")dtTeamView(h);
  else if(DT.view==="atleet")dtAtleetView(h);
  else if(DT.view==="vergelijk")dtVergelijkView(h);
  else dtRankingView(h);
}

// ---------- Team ----------
function dtTeamView(h){
  const top=dtRanked()[0];
  const catKeys=Object.keys(DT_CATS);
  const kop=[["RANG","#"],["NAME","Atleet"],...catKeys.map(c=>[c,dtShortCat(c)]),["TOT","Totaal"]]
    .map(([k,l])=>'<button data-k="'+esc(k)+'" onclick="dtSort(\''+k.replace(/'/g,"\\'")+'\')" class="'+(k===DT.sortKey?"on":"")+'">'+esc(l)+(k===DT.sortKey?(DT.sortDir<0?" ▼":" ▲"):"")+'</button>').join("");
  h.innerHTML=
    '<div class="dt-kpis">'+
      '<div class="dt-kpi"><div class="v">'+dtNames().length+'</div><div class="l">'+(DT.geslacht==="man"?"Mannen":"Vrouwen")+'</div></div>'+
      '<div class="dt-kpi"><div class="v">'+esc(top||"—")+'</div><div class="l">#1 · '+dtFmtPct(dtTotPct(top))+'</div></div>'+
    '</div>'+
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">'+
      '<input class="lid-in" style="width:220px" placeholder="Zoek atleet…" value="'+esc(DT.filter)+'" oninput="dtFilter(this.value)">'+
      '<button class="btn ghost sm" onclick="dtNieuwToggle()">+ Atleet</button>'+
    '</div>'+dtNieuwFormHtml()+
    '<div class="dt-thead">'+kop+'</div><div id="dt-teamlist"></div>'+
    '<div class="dt-legend">'+
      '<span><span class="dot" style="background:var(--ok)"></span>Doel gehaald (≥100%)</span>'+
      '<span><span class="dot" style="background:var(--warn)"></span>Binnen 15% van doel</span>'+
      '<span><span class="dot" style="background:var(--bad)"></span>Meer dan 15% onder doel</span>'+
      '<span><span class="dot" style="background:#c3c9d4"></span>Geen score</span>'+
    '</div>';
  dtTeamlijst();
}
function dtTeamlijst(){
  const el=document.getElementById("dt-teamlist");if(!el)return;
  const catKeys=Object.keys(DT_CATS);
  const val=(a,k)=>k==="NAME"?a.toLowerCase():k==="TOT"?dtTotPct(a):k==="RANG"?(dtRankOf(a)??999):dtCatPct(a,k);
  let rows=[...dtNames()].filter(a=>a.toLowerCase().includes(DT.filter));
  rows.sort((a,b)=>{
    const x=val(a,DT.sortKey),y=val(b,DT.sortKey);
    if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;
    const cmp=x<y?-1:x>y?1:0;
    return DT.sortDir<0?-cmp:cmp;
  });
  el.innerHTML=rows.map(a=>{
    const t=dtTotPct(a),r=dtRankOf(a);
    const w=t==null?0:Math.min(115,Math.max(2,(1+t)*100))/1.15;
    return '<div class="dt-trow'+(r===1?" top1":"")+'" onclick="dtOpenAtleet(\''+esc(a).replace(/'/g,"\\'")+'\')">'+
      '<div class="rk">'+(r??"—")+'</div>'+
      '<div class="nm"><b>'+esc(a)+'</b><span>'+(dtBW(a)?Math.round(dtBW(a))+' kg · ':'')+dtNTests(a)+' tests</span></div>'+
      catKeys.map(c=>{const v=dtCatPct(a,c);
        return '<div class="ccell"><span class="dt-chip '+dtCls(v)+'">'+dtFmtPct(v)+'</span></div>';}).join("")+
      '<div><div class="dt-bar"><div class="fill" style="width:'+w+'%"></div><div class="tline" style="left:'+(100/1.15)+'%"></div><div class="txt">'+dtFmtPct(t)+'</div></div></div>'+
    '</div>';
  }).join("")||'<div class="cempty">Geen atleten gevonden.</div>';
}
function dtSort(k){
  if(DT.sortKey===k)DT.sortDir*=-1;else{DT.sortKey=k;DT.sortDir=(k==="NAME"||k==="RANG")?1:-1;}
  dtRenderView();
}
function dtFilter(v){DT.filter=(v||"").toLowerCase();dtTeamlijst();}
function dtOpenAtleet(a){DT.sel=a;DT.view="atleet";dataRender();}

// ---------- atleet toevoegen / verwijderen (schrijft direct naar de database) ----------
function dtNieuwFormHtml(){
  if(!DT.nieuwOpen)return "";
  return '<div class="panel" style="padding:14px;margin-bottom:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">'+
    '<div style="position:relative"><input class="lid-in" id="dt-nw-naam" style="width:220px" placeholder="Naam atleet" autocomplete="off" oninput="dtNieuwTyp(this.value)">'+
      '<div class="dt-sug" id="dt-nw-sug" style="display:none"></div></div>'+
    '<input class="lid-in" id="dt-nw-bw" style="width:140px" placeholder="Gewicht kg (mag leeg)" inputmode="decimal">'+
    '<select class="lid-in" id="dt-nw-gesl" style="width:auto">'+
      '<option value="man"'+(DT.geslacht==="man"?" selected":"")+'>Man</option>'+
      '<option value="vrouw"'+(DT.geslacht==="vrouw"?" selected":"")+'>Vrouw</option></select>'+
    '<button class="btn sm2" onclick="dtNieuwOpslaan()">Opslaan</button>'+
    '<button class="btn ghost sm" onclick="dtNieuwToggle()">Annuleren</button>'+
    '<span class="sm muted" id="dt-nw-koppel" style="flex-basis:100%"></span></div>';
}
// Tijdens het typen bestaande klanten voorstellen: kies je er één, dan wordt
// de atleet meteen aan die klant gekoppeld (verzoek Stefan 23 juli).
async function dtNieuwTyp(v){
  DT.nieuwKoppelId=null;
  const lbl=document.getElementById("dt-nw-koppel");if(lbl)lbl.textContent="";
  const box=document.getElementById("dt-nw-sug");if(!box)return;
  const zoek=(v||"").trim().toLowerCase();
  if(zoek.length<2){box.style.display="none";return;}
  const ks=await dtLaadKlanten();
  const hits=ks.filter(k=>k.naam.toLowerCase().includes(zoek)).slice(0,8);
  if(!hits.length){box.style.display="none";return;}
  box.innerHTML=hits.map(k=>'<button onclick="dtNieuwKies(\''+esc(k.id)+'\')">'+esc(k.naam)+'</button>').join("");
  box.style.display="";
}
async function dtNieuwKies(pid){
  const ks=await dtLaadKlanten();
  const k=ks.find(x=>x.id===pid);if(!k)return;
  const inp=document.getElementById("dt-nw-naam");if(inp)inp.value=k.naam;
  const bw=document.getElementById("dt-nw-bw");if(bw&&!bw.value&&k.weight_kg!=null)bw.value=String(k.weight_kg).replace(".",",");
  const g=document.getElementById("dt-nw-gesl");if(g&&k.gender)g.value=k.gender==="vrouw"?"vrouw":"man";
  DT.nieuwKoppelId=pid;
  const lbl=document.getElementById("dt-nw-koppel");
  if(lbl)lbl.textContent="🔗 Wordt gekoppeld aan deze klant; bestaande metingen stromen automatisch binnen.";
  const box=document.getElementById("dt-nw-sug");if(box)box.style.display="none";
}
function dtNieuwToggle(){DT.nieuwOpen=!DT.nieuwOpen;DT.nieuwKoppelId=null;dtRenderView();if(DT.nieuwOpen){const i=document.getElementById("dt-nw-naam");if(i)i.focus();}}
async function dtNieuwOpslaan(){
  const naam=(document.getElementById("dt-nw-naam").value||"").trim();
  const bwS=(document.getElementById("dt-nw-bw").value||"").trim().replace(",",".");
  if(!naam){toast("Vul een naam in");return;}
  if(DT.athletes[naam]){toast("Deze naam bestaat al");return;}
  const bw=bwS===""?null:parseFloat(bwS);
  if(bwS!==""&&isNaN(bw)){toast("Gewicht is geen getal");return;}
  const gender=(document.getElementById("dt-nw-gesl")||{}).value==="vrouw"?"vrouw":"man";
  const{data,error}=await db.from("data_athletes").insert({company_id:ME.profile.company_id,name:naam,bw,gender}).select().single();
  if(error){toast(error.message||"Opslaan mislukt");return;}
  DT.athletes[naam]={id:data.id,bw,gender,profile_id:null,scores:{}};
  const koppelId=DT.nieuwKoppelId;DT.nieuwKoppelId=null;
  if(koppelId){
    const{error:ke}=await db.rpc("data_koppel_atleet",{p_athlete:data.id,p_profile:koppelId});
    if(ke)toast("Atleet aangemaakt, maar koppelen mislukte: "+(ke.message||"onbekende fout"));
    else{toast("Atleet gekoppeld aan de klant; metingen stromen automatisch binnen");await dtLaad();}
  }
  DT.nieuwOpen=false;DT.geslacht=gender;DT.sel=naam;DT.view="atleet";dataRender();
}
async function dtVerwijderAtleet(){
  const a=DT.sel;if(!a||!DT.athletes[a])return;
  if(!confirm(a+" en alle scores verwijderen?"))return;
  const{error}=await db.from("data_athletes").delete().eq("id",DT.athletes[a].id);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  delete DT.athletes[a];
  DT.sel=dtRanked()[0]||"";dataRender();
}

// ---------- Koppeling met een klant (metingen stromen dan automatisch door) ----------
// dtKlanten = cache van de klantenlijst (RLS bepaalt wie je ziet: coach de
// eigen klanten, eigenaar/platform_admin iedereen in het bedrijf).
let dtKlanten=null;
async function dtLaadKlanten(){
  if(dtKlanten)return dtKlanten;
  const{data}=await db.from("profiles").select("id,first_name,last_name,weight_kg,gender").eq("role","lid").order("first_name");
  dtKlanten=(data||[]).map(p=>({id:p.id,naam:[p.first_name,p.last_name].filter(Boolean).join(" ")||"Naamloos",weight_kg:p.weight_kg,gender:p.gender}));
  return dtKlanten;
}
async function dtVulKoppelNaam(){
  const el=document.getElementById("dt-koppel-naam");
  const a=DT.sel,pid=DT.athletes[a]&&DT.athletes[a].profile_id;
  if(!el||!pid)return;
  const ks=await dtLaadKlanten();
  const k=ks.find(x=>x.id===pid);
  if(k&&document.getElementById("dt-koppel-naam"))document.getElementById("dt-koppel-naam").textContent=" "+k.naam;
}
async function dtKoppelOpen(){
  const host=document.getElementById("dt-koppel");if(!host)return;
  host.innerHTML='<span class="sm muted">laden…</span>';
  const ks=await dtLaadKlanten();
  if(!ks.length){host.innerHTML='<span class="sm muted">Geen klanten gevonden</span>';return;}
  host.innerHTML='<select class="lid-in" id="dt-koppel-sel" style="width:auto;min-width:180px">'+
    '<option value="">Kies klant…</option>'+ks.map(k=>'<option value="'+esc(k.id)+'">'+esc(k.naam)+'</option>').join("")+'</select> '+
    '<button class="btn sm" onclick="dtKoppelDoe()">Koppel</button> '+
    '<button class="btn ghost sm" onclick="dtRenderView()">Annuleren</button>';
}
async function dtKoppelDoe(){
  const sel=document.getElementById("dt-koppel-sel");
  const pid=sel&&sel.value;
  if(!pid){toast("Kies eerst een klant");return;}
  const a=DT.sel;if(!DT.athletes[a])return;
  const{error}=await db.rpc("data_koppel_atleet",{p_athlete:DT.athletes[a].id,p_profile:pid});
  if(error){toast(error.message||"Koppelen mislukt");return;}
  toast("Gekoppeld; metingen van deze klant stromen nu automatisch binnen");
  await dtLaad();dtRenderView();
}
async function dtOntkoppel(ev){
  ev.preventDefault();
  const a=DT.sel;if(!DT.athletes[a])return;
  if(!confirm("Koppeling met de klant verwijderen? De scores die er nu staan blijven bewaard."))return;
  const{error}=await db.rpc("data_koppel_atleet",{p_athlete:DT.athletes[a].id,p_profile:null});
  if(error){toast(error.message||"Ontkoppelen mislukt");return;}
  DT.athletes[a].profile_id=null;dtRenderView();
}

// ---------- Atleet (scores altijd direct bewerkbaar; opslaan bij wijzigen) ----------
function dtAtleetView(h){
  if(!dtNames().includes(DT.sel))DT.sel=dtRanked()[0]||"";
  const a=DT.sel;
  const t=dtTotPct(a);
  const opts=dtRanked().map(n=>'<option value="'+esc(n)+'"'+(n===a?" selected":"")+'>'+esc(n)+'</option>').join("");
  const gekoppeld=DT.athletes[a]&&DT.athletes[a].profile_id;
  h.innerHTML=
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px">'+
      '<select class="lid-in" style="width:auto;min-width:200px" onchange="dtSelAtleet(this.value)">'+opts+'</select>'+
      '<span id="dt-koppel">'+(gekoppeld
        ?'<span class="sm muted">🔗 Gekoppeld aan klant<span id="dt-koppel-naam"></span> · <a href="#" onclick="dtOntkoppel(event)">ontkoppelen</a></span>'
        :'<button class="btn ghost sm" onclick="dtKoppelOpen()">Koppel aan klant</button>')+'</span>'+
      '<button class="btn ghost sm" style="color:var(--bad)" onclick="dtVerwijderAtleet()">Verwijder atleet</button>'+
    '</div>'+
    '<div class="dt-athead">'+
      '<h2>'+esc(a)+'</h2>'+
      '<div class="dt-badge"><div class="v"><input class="dt-bwedit" value="'+(dtBW(a)?Math.round(dtBW(a)*10)/10:"")+'" inputmode="decimal" placeholder="—" onchange="dtBwWijzig(this)" aria-label="Lichaamsgewicht"></div><div class="l">kg</div></div>'+
      '<div class="dt-badge"><div class="v">'+dtFmtPct(t)+'</div><div class="l">Doelscore</div></div>'+
      '<div class="dt-badge"><div class="v">'+(dtRankOf(a)??"—")+'</div><div class="l">Rang</div></div>'+
      '<div class="dt-badge"><div class="v">'+dtNTests(a)+'</div><div class="l">Tests</div></div>'+
    '</div>'+
    '<div class="dt-grid2">'+
      '<div class="panel" style="padding:16px"><h3 class="dt-h3">Profiel t.o.v. doel &amp; team</h3><canvas id="dt-radarP" height="300"></canvas>'+
        '<div class="dt-legend"><span><span class="dot" style="background:#C9A227"></span>Atleet</span>'+
        '<span><span class="dot" style="background:#9aa1ad"></span>Doel (100%)</span>'+
        '<span><span class="dot" style="background:#d5dae2"></span>Teamgemiddelde</span></div></div>'+
      '<div class="panel" style="padding:16px"><h3 class="dt-h3">Doelscore per categorie</h3><div>'+
        Object.keys(DT_CATS).map(c=>{
          const v=dtCatPct(a,c);
          const w=v==null?0:Math.min(115,Math.max(2,(1+v)*100))/1.15;
          return '<div class="dt-catbar"><div class="toprow"><b>'+esc(c)+'</b><span class="pct" style="color:'+dtClr(v)+'">'+dtFmtPct(v)+'</span></div>'+
            '<div class="track"><div class="fill" style="width:'+w+'%;background:'+dtClr(v)+'"></div><div class="tline" style="left:'+(100/1.15)+'%"></div></div></div>';
        }).join("")+
      '</div></div>'+
    '</div>'+
    '<div class="dt-catcards">'+
      Object.keys(DT_CATS).map(c=>{
        const done=DT_CATS[c].filter(k=>dtS(a,k)!=null).length;
        return '<div class="dt-catcard"><h4><span>'+esc(c)+'</span><span class="sm muted">'+done+'/'+DT_CATS[c].length+'</span></h4>'+
          DT_CATS[c].map(k=>{
            const p=dtPct(a,k),s=dtS(a,k);
            return '<div class="dt-testrow"><div class="tn" title="'+esc(DT_TESTS[k].uitleg)+'">'+esc(DT_TESTS[k].label)+'</div>'+
              '<input class="dt-scedit" data-k="'+esc(k)+'" value="'+dtRawScore(k,s)+'" placeholder="'+(DT_TESTS[k].unit==="tijd"?"m:ss":esc(DT_TESTS[k].unit))+'" onchange="dtScoreWijzig(this)">'+
              '<div class="gl">/ '+dtFmtScore(k,dtGoal(a,k)).replace(" kg","")+'</div>'+
              '<span class="dt-chip '+dtCls(p)+'">'+(p==null?"—":dtFmtRaw(p))+'</span></div>';
          }).join("")+'</div>';
      }).join("")+
    '</div>';
  dtVulKoppelNaam();
  dtChart(()=>{
    const cv=document.getElementById("dt-radarP");if(!cv||!window.Chart)return;
    if(dtRadarP)dtRadarP.destroy();
    const labels=Object.keys(DT_CATS).map(dtShortCat);
    dtRadarP=new Chart(cv,{type:"radar",data:{labels,datasets:[
      {label:a,data:dtRadarData(a),borderColor:"#C9A227",backgroundColor:"rgba(201,162,39,.18)",borderWidth:2.5,pointBackgroundColor:"#C9A227",pointRadius:3},
      {label:"Doel",data:labels.map(()=>100),borderColor:"#9aa1ad",borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false},
      {label:"Team",data:dtTeamRadar(),borderColor:"#d5dae2",borderWidth:1.5,pointRadius:0,fill:false},
    ]},options:dtRadarOpts});
  });
}
function dtSelAtleet(v){DT.sel=v;dtRenderView();}
async function dtBwWijzig(inp){
  const a=DT.sel;if(!DT.athletes[a])return;
  const s=(inp.value||"").trim().replace(",",".");
  const bw=s===""?null:parseFloat(s);
  if(s!==""&&isNaN(bw)){inp.classList.add("bad");return;}
  inp.classList.remove("bad");
  const{error}=await db.from("data_athletes").update({bw}).eq("id",DT.athletes[a].id);
  if(error){toast(error.message||"Opslaan mislukt");return;}
  DT.athletes[a].bw=bw;
  dtRenderView(); // alles rekent direct door
}
async function dtScoreWijzig(inp){
  const a=DT.sel;if(!DT.athletes[a])return;
  const k=inp.dataset.k;
  const r=dtParseInput(k,inp.value);
  if(!r.ok){inp.classList.add("bad");return;}
  inp.classList.remove("bad");
  const at=DT.athletes[a];
  if(r.val==null){
    const{error}=await db.from("data_scores").delete().eq("athlete_id",at.id).eq("test_key",k);
    if(error){toast(error.message||"Opslaan mislukt");return;}
    delete at.scores[k];
  }else{
    const{error}=await db.from("data_scores").upsert(
      {athlete_id:at.id,company_id:ME.profile.company_id,test_key:k,value:r.val,updated_at:new Date().toISOString()},
      {onConflict:"athlete_id,test_key"});
    if(error){toast(error.message||"Opslaan mislukt");return;}
    at.scores[k]=r.val;
  }
  dtRenderView();
}

// ---------- Vergelijk ----------
function dtVergelijkView(h){
  if(!dtNames().includes(DT.selA))DT.selA=dtRanked()[0]||"";
  if(!dtNames().includes(DT.selB))DT.selB=dtRanked()[1]||dtRanked()[0]||"";
  const a=DT.selA,b=DT.selB;if(!a||!b){h.innerHTML="";return;}
  const opts=sel=>dtRanked().map(n=>'<option value="'+esc(n)+'"'+(n===sel?" selected":"")+'>'+esc(n)+'</option>').join("");
  const catRows=Object.keys(DT_CATS).map(c=>{
    const va=dtCatPct(a,c),vb=dtCatPct(b,c);
    const d=(va!=null&&vb!=null)?va-vb:null;
    return '<tr><td>'+esc(c)+'</td>'+
      '<td><span class="dt-chip '+dtCls(va)+'">'+dtFmtPct(va)+'</span></td>'+
      '<td><span class="dt-chip '+dtCls(vb)+'">'+dtFmtPct(vb)+'</span></td>'+
      '<td class="dt-delta '+(d==null?"zero":d>0.005?"pos":d<-0.005?"neg":"zero")+'">'+(d==null?"—":(d>0?"+":"")+Math.round(d*100))+'</td></tr>';
  }).join("");
  const ta=dtTotPct(a),tb=dtTotPct(b),td=(ta!=null&&tb!=null)?ta-tb:null;
  const testRows=Object.keys(DT_CATS).map(c=>
    '<tr><td colspan="5" class="dt-cathead">'+esc(c)+'</td></tr>'+
    DT_CATS[c].map(k=>{
      const pa=dtPct(a,k),pb=dtPct(b,k);
      return '<tr><td>'+esc(DT_TESTS[k].label)+'</td>'+
        '<td><span class="dt-chip '+dtCls(pa)+'">'+dtFmtScore(k,dtS(a,k))+'</span></td>'+
        '<td><span class="dt-chip '+dtCls(pb)+'">'+dtFmtScore(k,dtS(b,k))+'</span></td>'+
        '<td class="muted">'+dtFmtScore(k,dtGoal(a,k))+'</td>'+
        '<td class="muted">'+dtFmtScore(k,dtGoal(b,k))+'</td></tr>';
    }).join("")).join("");
  h.innerHTML=
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px">'+
      '<select class="lid-in" style="width:auto;min-width:190px" onchange="dtSelA(this.value)">'+opts(a)+'</select>'+
      '<span style="font-weight:800;color:var(--muted)">VS</span>'+
      '<select class="lid-in" style="width:auto;min-width:190px" onchange="dtSelB(this.value)">'+opts(b)+'</select>'+
    '</div>'+
    '<div class="dt-grid2">'+
      '<div class="panel" style="padding:16px"><h3 class="dt-h3">Radar</h3><canvas id="dt-radarC" height="300"></canvas>'+
        '<div class="dt-legend"><span><span class="dot" style="background:#C9A227"></span>'+esc(a)+'</span>'+
        '<span><span class="dot" style="background:#2f6df6"></span>'+esc(b)+'</span>'+
        '<span><span class="dot" style="background:#9aa1ad"></span>Doel</span></div></div>'+
      '<div class="panel" style="padding:16px"><h3 class="dt-h3">Per categorie</h3>'+
        '<table class="dt-table"><thead><tr><th>Categorie</th><th>'+esc(a.split(" ")[0])+'</th><th>'+esc(b.split(" ")[0])+'</th><th>Δ</th></tr></thead>'+
        '<tbody>'+catRows+
        '<tr style="border-top:1px solid var(--line)"><td><b>TOTAAL</b></td><td><b>'+dtFmtPct(ta)+'</b></td><td><b>'+dtFmtPct(tb)+'</b></td>'+
        '<td class="dt-delta '+(td==null?"zero":td>0.005?"pos":td<-0.005?"neg":"zero")+'">'+(td==null?"—":(td>0?"+":"")+Math.round(td*100))+'</td></tr></tbody></table></div>'+
    '</div>'+
    '<div class="panel" style="padding:16px;margin-top:16px"><h3 class="dt-h3">Per test</h3><div style="overflow-x:auto">'+
      '<table class="dt-table" style="min-width:620px"><thead><tr><th>Test</th><th>'+esc(a.split(" ")[0])+'</th><th>'+esc(b.split(" ")[0])+'</th><th>Doel '+esc(a.split(" ")[0])+'</th><th>Doel '+esc(b.split(" ")[0])+'</th></tr></thead>'+
      '<tbody>'+testRows+'</tbody></table></div></div>';
  dtChart(()=>{
    const cv=document.getElementById("dt-radarC");if(!cv||!window.Chart)return;
    if(dtRadarC)dtRadarC.destroy();
    const labels=Object.keys(DT_CATS).map(dtShortCat);
    dtRadarC=new Chart(cv,{type:"radar",data:{labels,datasets:[
      {label:a,data:dtRadarData(a),borderColor:"#C9A227",backgroundColor:"rgba(201,162,39,.15)",borderWidth:2.5,pointBackgroundColor:"#C9A227",pointRadius:3},
      {label:b,data:dtRadarData(b),borderColor:"#2f6df6",backgroundColor:"rgba(47,109,246,.10)",borderWidth:2.5,pointBackgroundColor:"#2f6df6",pointRadius:3},
      {label:"Doel",data:labels.map(()=>100),borderColor:"#9aa1ad",borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false},
    ]},options:dtRadarOpts});
  });
}
function dtSelA(v){DT.selA=v;dtRenderView();}
function dtSelB(v){DT.selB=v;dtRenderView();}

// ---------- Ranking ----------
function dtRankingView(h){
  const k=DT.selTest;
  const dir=DT_TESTS[k].dir;
  const opts=Object.keys(DT_TESTS).map(x=>'<option value="'+esc(x)+'"'+(x===k?" selected":"")+'>'+esc(DT_TESTS[x].label)+'</option>').join("");
  const rows=dtNames().map(a=>({a,s:dtS(a,k),p:dtPct(a,k)})).filter(r=>r.s!=null)
    .sort((x,y)=>dir==="l"?x.s-y.s:y.s-x.s);
  const max=Math.max(...rows.map(r=>r.p!=null?(1+r.p):0),1.05);
  h.innerHTML=
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:6px">'+
      '<select class="lid-in" style="width:auto;min-width:240px" onchange="dtSelTest(this.value)">'+opts+'</select>'+
    '</div>'+
    '<div class="sm muted" style="margin-bottom:12px">Doel: '+esc(DT_TESTS[k].uitleg)+' · '+(dir==="l"?"sneller is beter":"hoger is beter")+'</div>'+
    '<div class="panel" style="padding:14px 16px">'+
    (rows.length?rows.map((r,i)=>{
      const w=r.p==null?4:Math.max(3,(1+r.p)/max*100);
      return '<div class="dt-rankrow'+(i<3?" top3":"")+'" onclick="dtOpenAtleet(\''+esc(r.a).replace(/'/g,"\\'")+'\')">'+
        '<div class="pos">'+(i+1)+'</div><div class="rn">'+esc(r.a)+'</div>'+
        '<div class="rbar"><div class="fill" style="width:'+w+'%;background:'+(i===0?"linear-gradient(90deg,#a8851f,#C9A227)":dtClr(r.p))+'"></div></div>'+
        '<div class="rsc">'+dtFmtScore(k,r.s)+'</div><div class="rpct"><span class="dt-chip '+dtCls(r.p)+'">'+(r.p==null?"—":dtFmtRaw(r.p))+'</span></div></div>';
    }).join(""):'<div class="cempty">Nog geen scores voor deze test.</div>')+
    '</div>';
}
function dtSelTest(v){DT.selTest=v;dtRenderView();}

// ================= WEDSTRIJDEN: wedstrijdanalyse =================
// Overgenomen uit Stefans yp-wedstrijdanalyse.html (de werkende referentie):
// het MOV-woordenboek en wdClassify zijn 1-op-1 geport; data leeft in de
// Supabase-tabel competition_workouts in plaats van het JSON-blok.

/* mod: bar|db|gym|mono|odd · skill: 1 basis, 2 gevorderd, 3 elite */
const WD_MOV={
 'Snatch':{mod:'bar',skill:2,al:['snatch']},
 'Clean':{mod:'bar',skill:2,al:['clean']},
 'Jerk / S2OH':{mod:'bar',skill:2,al:['jerk','shoulder to overhead','s2oh','push press']},
 'Thruster':{mod:'bar',skill:1,al:['thruster']},
 'Overhead squat':{mod:'bar',skill:2,al:['overhead squat','ohs']},
 'Front squat':{mod:'bar',skill:1,al:['front squat']},
 'Back squat':{mod:'bar',skill:1,al:['back squat']},
 'Deadlift':{mod:'bar',skill:1,al:['deadlift']},
 'Bench press':{mod:'bar',skill:1,al:['bench press']},
 'Barbell lunge':{mod:'bar',skill:1,al:['barbell lunge','frontrack walking lunge','front rack walking lunge','barbell walking lunge']},
 'DB snatch':{mod:'db',skill:1,al:['db snatch','dumbbell snatch','kettlebell snatch','kettlebell hang snatch','kb snatch']},
 'DB thruster':{mod:'db',skill:1,al:['db thruster','dumbbell thruster']},
 'DB clean/C&J':{mod:'db',skill:1,al:['db clean','dumbbell clean','db hang clean']},
 'DB squat':{mod:'db',skill:1,al:['db squat','dumbbell squat','goblet squat']},
 'DB box step-over':{mod:'db',skill:1,al:['step-over','step over']},
 'Devil press':{mod:'db',skill:1,al:['devil press','devils press']},
 'DB lunge':{mod:'db',skill:1,al:['db lunge','dumbbell lunge','db walking lunge','front rack lunge','overhead lunge','lunge']},
 'KB swing':{mod:'db',skill:1,al:['kettlebell swing','kb swing']},
 'Wall ball':{mod:'db',skill:1,al:['wall ball','wallball']},
 'Pull-up':{mod:'gym',skill:1,al:['pull-up','pull up','pullup']},
 'Chest to bar':{mod:'gym',skill:2,al:['chest to bar','c2b']},
 'Bar muscle-up':{mod:'gym',skill:3,al:['bar muscle up','bar muscle-up','bmu']},
 'Ring muscle-up':{mod:'gym',skill:3,al:['ring muscle up','ring muscle-up','rmu','muscle up','muscle-up']},
 'Toes to bar':{mod:'gym',skill:1,al:['toes to bar','toes-to-bar','ttb','t2b']},
 'HSPU':{mod:'gym',skill:2,al:['handstand push-up','handstand push up','hspu']},
 'Deficit / strict HSPU':{mod:'gym',skill:3,al:['strict hspu','deficit hspu','strict handstand']},
 'Handstand walk':{mod:'gym',skill:3,al:['handstand walk','hs walk','handstand-walk']},
 'Wall walk':{mod:'gym',skill:1,al:['wall walk']},
 'Rope climb':{mod:'gym',skill:2,al:['rope climb']},
 'Legless rope climb':{mod:'gym',skill:3,al:['legless']},
 'Ring dip':{mod:'gym',skill:2,al:['ring dip']},
 'Burpee':{mod:'gym',skill:1,al:['burpee']},
 'Box jump (over)':{mod:'gym',skill:1,al:['box jump']},
 'Pistol':{mod:'gym',skill:2,al:['pistol']},
 'GHD sit-up':{mod:'gym',skill:1,al:['ghd']},
 'Push-up':{mod:'gym',skill:1,al:['push-up','push up']},
 'Row':{mod:'mono',skill:1,al:['row','rowing','meter row']},
 'BikeErg / Echo bike':{mod:'mono',skill:1,al:['bike','echo','assault']},
 'SkiErg':{mod:'mono',skill:1,al:['ski']},
 'Run':{mod:'mono',skill:1,al:['run','running','shuttle']},
 'Double unders':{mod:'mono',skill:2,al:['double under','double-under','du ','dubbels']},
 'Crossover single unders':{mod:'mono',skill:3,al:['crossover']},
 'Sandbag / D-ball':{mod:'odd',skill:1,al:['sandbag','d-ball','dball','stone']},
 'Farmers carry':{mod:'odd',skill:1,al:['farmer']},
 'Yoke':{mod:'odd',skill:2,al:['yoke']},
 'Sled':{mod:'odd',skill:1,al:['sled']},
 'Worm':{mod:'odd',skill:1,al:['worm']},
 'Sandbag/odd carry':{mod:'odd',skill:1,al:['carry']},
 'Peg board':{mod:'gym',skill:3,al:['peg board','pegboard']}
};
const WD_MODNAAM={bar:'Barbell',db:'DB / KB',gym:'Gymnastics',mono:'Machine / Mono',odd:'Odd objects'};
const WD_MODKLEUR={bar:'#2f6df6',db:'#f97316',gym:'#8b5cf6',mono:'#14b8a6',odd:'#a16207'};

// Ruwe workout-tekst -> movements + format + tijdsdomein + zwaarste load
// (1-op-1 uit de referentie, incl. de ontdubbel-regels).
function wdClassify(text){
  const t=' '+text.toLowerCase().replace(/[^a-z0-9:.\- ]/g,' ')+' ';
  const found=[];
  for(const [name,m] of Object.entries(WD_MOV)){
    if(m.al.some(a=>t.includes(a))) found.push(name);
  }
  let f=found;
  if(f.includes('Bar muscle-up') && f.includes('Ring muscle-up') && !/(ring muscle|rmu)/.test(t)) f=f.filter(x=>x!=='Ring muscle-up');
  if(f.includes('Chest to bar')) f=f.filter(x=>x!=='Pull-up');
  if(f.includes('Legless rope climb')) f=f.filter(x=>x!=='Rope climb');
  if(f.includes('Deficit / strict HSPU')) f=f.filter(x=>x!=='HSPU');
  let format='for time';
  if(/amrap/.test(t))format='AMRAP'; else if(/emom/.test(t))format='EMOM';
  else if(/(1 ?rm|1rm|max lift|heavy (single|double|triple)|ladder)/.test(t))format='max lift';
  else if(/interval/.test(t))format='interval'; else if(/chipper/.test(t))format='chipper';
  let minutes=null;
  const cap=t.match(/(?:time ?cap|cap|amrap|emom)[^0-9]{0,6}(\d{1,2})/);
  if(cap)minutes=parseInt(cap[1]);
  else{const m2=t.match(/(\d{1,2}) ?min/); if(m2)minutes=parseInt(m2[1]);}
  let tijd = minutes==null?'onbekend':minutes<5?'sprint (<5)':minutes<=10?'kort (5-10)':minutes<=20?'middel (10-20)':'lang (20+)';
  if(format==='max lift') tijd='kracht/max';
  const loads=[...text.matchAll(/(\d{2,3})(?:\/\d{2,3})? ?kg/gi)].map(m=>parseInt(m[1]));
  return {movements:f,format,tijd,minutes,maxload:loads.length?Math.max(...loads):null};
}

// Afgeleide structuur van een workout (verzoek Stefan, 18 juli): single /
// couplet (2) / triplet (3) / chipper-formaat (4+), plus de modaliteit-mix
// ("2× Gymnastics + 1× Barbell") en het hoogste skill-niveau. Alles wordt
// afgeleid uit de movement-tags, dus oude én nieuwe workouts doen mee.
function wdStructuur(w){
  const ms=w.movements||[];
  const n=ms.length;
  const label=n<=1?"Single":n===2?"Couplet":n===3?"Triplet":"Chipper (4+)";
  const telling={};
  ms.forEach(m=>{const mod=(WD_MOV[m]||{}).mod||"bar";telling[mod]=(telling[mod]||0)+1;});
  const mix=Object.entries(telling).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
    .map(([m,c])=>c+"× "+WD_MODNAAM[m]).join(" + ");
  const maxSkill=ms.reduce((s,m)=>Math.max(s,(WD_MOV[m]||{}).skill||0),0);
  return {n,label,mix,maxSkill};
}
const WD_STRUCTS=["Single","Couplet","Triplet","Chipper (4+)"];

let WD={wods:null,view:"overzicht",fEvent:"",fJaar:"",fFase:"",fDiv:"",fStruct:"",wEvent:"",wJaar:"",wFase:"",wDiv:"",wStruct:"",pending:null};
let wdChMix=null,wdChTime=null;

async function wdLaad(){
  const{data,error}=await db.from("competition_workouts").select("*").order("jaar",{ascending:false}).order("naam");
  if(error){toast("Wedstrijden laden mislukt");WD.wods=[];return;}
  WD.wods=data||[];
}
async function wdRender(h){
  if(WD.wods===null){h.innerHTML='<div class="spin">Laden…</div>';await wdLaad();}
  const sub=[["overzicht","Overzicht"],["workouts","Workouts"],["invoer","Invoer"],["pipeline","Pipeline"]]
    .map(v=>'<button class="'+(WD.view===v[0]?"on":"")+'" onclick="wdGo(\''+v[0]+'\')">'+v[1]+'</button>').join("");
  h.innerHTML='<div class="dt-subnav">'+sub+'</div><div id="wd-view"></div>';
  wdRenderView();
}
function wdGo(v){WD.view=v;const h=document.getElementById("data-inhoud");if(h)wdRender(h);}
const wdUniq=a=>[...new Set(a)];
// Filterselectie: 'Alle divisies' telt bij elke divisie-keuze mee (referentie-gedrag).
function wdSelectie(p){
  const e=WD[p+"Event"],j=WD[p+"Jaar"],f=WD[p+"Fase"],d=WD[p+"Div"],s=WD[p+"Struct"];
  return (WD.wods||[]).filter(w=>(!e||w.event===e)&&(!j||String(w.jaar)===j)&&(!f||w.fase===f)
    &&(!d||(w.divisie||"Alle divisies")===d||(w.divisie||"Alle divisies")==="Alle divisies")
    &&(!s||wdStructuur(w).label===s));
}
function wdFilterHtml(p){
  const evs=wdUniq((WD.wods||[]).map(w=>w.event)).sort();
  const yrs=wdUniq((WD.wods||[]).map(w=>w.jaar)).sort((a,b)=>b-a);
  const divs=wdUniq((WD.wods||[]).map(w=>w.divisie||"Alle divisies")).sort().filter(d=>d!=="Alle divisies");
  const sel=(id,cur,opts,leeg)=>'<select class="lid-in" style="width:auto" onchange="wdFilter(\''+p+'\',\''+id+'\',this.value)">'+
    '<option value="">'+leeg+'</option>'+opts.map(o=>'<option'+(String(o)===String(cur)?" selected":"")+'>'+esc(String(o))+'</option>').join("")+'</select>';
  return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'+
    sel("Event",WD[p+"Event"],evs,"Alle wedstrijden")+
    sel("Jaar",WD[p+"Jaar"],yrs,"Alle jaren")+
    '<select class="lid-in" style="width:auto" onchange="wdFilter(\''+p+'\',\'Fase\',this.value)">'+
      '<option value="">'+(p==="f"?"Kwalificatie + Finale":"Alle fases")+'</option>'+
      '<option value="kwalificatie"'+(WD[p+"Fase"]==="kwalificatie"?" selected":"")+'>'+(p==="f"?"Alleen kwalificatie":"Kwalificatie")+'</option>'+
      '<option value="finale"'+(WD[p+"Fase"]==="finale"?" selected":"")+'>'+(p==="f"?"Alleen finale":"Finale")+'</option></select>'+
    sel("Div",WD[p+"Div"],divs,"Alle divisies")+
    sel("Struct",WD[p+"Struct"],WD_STRUCTS,"Alle structuren")+
  '</div>';
}
function wdFilter(p,veld,v){WD[p+veld]=v;wdRenderView();}
function wdRenderView(){
  const h=document.getElementById("wd-view");if(!h)return;
  if(WD.view==="overzicht")wdOverzicht(h);
  else if(WD.view==="workouts")wdWorkouts(h);
  else if(WD.view==="pipeline")wdPipeline(h);
  else wdInvoer(h);
}

// ---------- Pipeline: zo verzamel je de data (uitleg + extractieprompt uit het origineel) ----------
const WD_PROMPT=`Je krijgt de aankondigingstekst van één of meer CrossFit-wedstrijdworkouts. Zet elke workout om naar JSON. Antwoord met ALLEEN een JSON-array, geen uitleg, geen markdown.

Per workout:
{"event":"<naam wedstrijd>","jaar":<jaartal>,"fase":"kwalificatie"|"finale","naam":"<workoutnaam of nummer>","divisie":"<divisie, of Alle divisies>","tekst":"<volledige workout-omschrijving, letterlijk>","maxload":<zwaarste barbell-gewicht mannen in kg, of null>}

Regels:
- Splits meerdere workouts in losse objecten.
- "tekst" bevat het complete schema: reps, movements, gewichten, time cap.
- Gebruik het jaartal van de editie, niet van vandaag.
- Weet je event/jaar/fase/divisie niet zeker uit de tekst, neem ze over uit de contextregel die erboven staat.

Context: {{event}} {{jaar}} {{fase}} {{divisie}}
Tekst:
{{tekst}}`;
function wdPipeline(h){
  h.innerHTML=
    '<div class="panel" style="padding:16px"><h3 class="dt-h3">Zo verzamel je de data</h3>'+
      '<p style="margin-bottom:10px;font-size:13.5px;line-height:1.6"><b>1 · Bronnen.</b> Kwalificatie-workouts staan per jaar op Competition Corner (2023-2025) en vanaf 2026 op WeTime / Circle21. Finale-workouts staan meestal in Instagram-posts van het event of in heat-briefings (PDF). Houd een bronnenlijst bij per event × jaar × fase.</p>'+
      '<p style="margin-bottom:10px;font-size:13.5px;line-height:1.6"><b>2 · Ophalen.</b> Deze platforms zijn JavaScript-apps: een gewone HTTP-request geeft een lege pagina. Twee routes die wél werken: (a) open de workouts-pagina in Chrome met DevTools → Network → XHR en kopieer de JSON-URL die de pagina zelf aanroept; die URL kan n8n direct gebruiken. (b) laat n8n een headless browser renderen (Playwright/Browserless) en pak de paginatekst. Instagram-captions plak je gewoon in het Invoer-tabblad.</p>'+
      '<p style="margin-bottom:10px;font-size:13.5px;line-height:1.6"><b>3 · Extraheren.</b> Ruwe tekst → JSON via een Claude-node in n8n met de prompt hieronder. De uitkomst plak je in het Bulk-import-veld op het Invoer-tabblad, of n8n schrijft hem rechtstreeks naar de database.</p>'+
      '<p style="font-size:13.5px;line-height:1.6"><b>4 · Analyseren.</b> Het Overzicht-tabblad. Nieuwe invoer wordt automatisch geclassificeerd (movements, format, tijdsdomein, structuur).</p></div>'+
    '<div class="panel" style="padding:16px;margin-top:16px"><h3 class="dt-h3" style="display:flex;align-items:center;gap:10px">Claude-extractieprompt voor n8n <button class="btn ghost sm" onclick="wdPromptKopieer(this)">Kopieer</button></h3>'+
      '<pre class="wd-pre" style="margin:0">'+esc(WD_PROMPT)+'</pre></div>';
}
async function wdPromptKopieer(btn){
  try{await navigator.clipboard.writeText(WD_PROMPT);btn.textContent="Gekopieerd ✓";}
  catch(e){toast("Kopiëren lukte niet; selecteer de tekst handmatig");}
}

// ---------- Overzicht ----------
function wdOverzicht(h){
  const sel=wdSelectie("f");
  const kw=sel.filter(w=>w.fase==="kwalificatie").length,fi=sel.filter(w=>w.fase==="finale").length;
  const loads=sel.map(w=>w.maxload).filter(x=>x);
  const freq={};
  sel.forEach(w=>(w.movements||[]).forEach(m=>freq[m]=(freq[m]||0)+1));
  const top=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,15);
  const mx=top.length?top[0][1]:1;
  const sk={};
  sel.forEach(w=>(w.movements||[]).forEach(m=>{if(WD_MOV[m]&&WD_MOV[m].skill===3)sk[m]=(sk[m]||0)+1;}));
  const sks=Object.entries(sk).sort((a,b)=>b[1]-a[1]);
  // structuur-verdeling, samenstellingen-top en duo-paren (afgeleid, 18 juli)
  const structTel={};
  sel.forEach(w=>{const s=wdStructuur(w);structTel[s.label]=(structTel[s.label]||0)+1;});
  const structMax=Math.max(...WD_STRUCTS.map(s=>structTel[s]||0),1);
  const mixTel={};
  sel.forEach(w=>{const s=wdStructuur(w);if(!s.n)return;const k=s.label+" · "+s.mix;mixTel[k]=(mixTel[k]||0)+1;});
  const mixTop=Object.entries(mixTel).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const mixMax=mixTop.length?mixTop[0][1]:1;
  const duoTel={};
  sel.forEach(w=>{const ms=[...new Set(w.movements||[])].sort();
    for(let i=0;i<ms.length;i++)for(let j=i+1;j<ms.length;j++){const k=ms[i]+" + "+ms[j];duoTel[k]=(duoTel[k]||0)+1;}});
  const duoTop=Object.entries(duoTel).filter(([,c])=>c>=2).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const duoMax=duoTop.length?duoTop[0][1]:1;
  const elite=sel.filter(w=>wdStructuur(w).maxSkill===3).length;
  h.innerHTML='<div class="hrow" style="margin-bottom:10px"><h2 style="font-size:19px">Wat wordt er getest?</h2></div>'+
    wdFilterHtml("f")+
    '<div class="dt-kpis">'+
      '<div class="dt-kpi"><div class="v">'+sel.length+'</div><div class="l">Workouts in selectie</div></div>'+
      '<div class="dt-kpi"><div class="v">'+kw+' / '+fi+'</div><div class="l">Kwalificatie / finale</div></div>'+
      '<div class="dt-kpi"><div class="v">'+wdUniq(sel.map(w=>w.event+w.jaar)).length+'</div><div class="l">Edities</div></div>'+
      '<div class="dt-kpi"><div class="v">'+(loads.length?Math.max(...loads)+' kg':'—')+'</div><div class="l">Zwaarste barbell-load</div></div>'+
      '<div class="dt-kpi"><div class="v">'+(sel.length?Math.round(elite/sel.length*100)+'%':'—')+'</div><div class="l">Met elite-skill (niveau 3)</div></div>'+
    '</div>'+
    '<div class="dt-grid2">'+
      '<div class="panel" style="padding:16px"><h3 class="dt-h3">Modaliteit-mix per editie</h3><canvas id="wd-chmix" height="260"></canvas>'+
        '<div class="dt-legend">'+Object.keys(WD_MODNAAM).map(m=>'<span><span class="dot" style="background:'+WD_MODKLEUR[m]+'"></span>'+WD_MODNAAM[m]+'</span>').join("")+'</div></div>'+
      '<div class="panel" style="padding:16px"><h3 class="dt-h3">Tijdsdomein</h3><canvas id="wd-chtime" height="260"></canvas></div>'+
    '</div>'+
    '<div class="dt-grid2" style="margin-top:16px">'+
      '<div class="panel" style="padding:16px"><h3 class="dt-h3">Workout-structuur</h3>'+
        WD_STRUCTS.map(s=>{const c=structTel[s]||0;
          return '<div class="wd-mrow"><div class="mn">'+s+'</div>'+
            '<div class="mbar"><div class="fill" style="width:'+(c/structMax*100)+'%;background:#C9A227"></div></div>'+
            '<div class="mc">'+c+'</div></div>';}).join("")+
        '<div class="sm muted" style="margin-top:8px">Single = 1 movement, couplet = 2, triplet = 3, chipper-formaat = 4 of meer.</div></div>'+
      '<div class="panel" style="padding:16px"><h3 class="dt-h3">Meest geteste samenstellingen</h3>'+
        (mixTop.length?mixTop.map(([k,c])=>
          '<div class="wd-mrow"><div class="mn" style="width:260px" title="'+esc(k)+'">'+esc(k)+'</div>'+
          '<div class="mbar"><div class="fill" style="width:'+(c/mixMax*100)+'%;background:#8b5cf6"></div></div>'+
          '<div class="mc">'+c+'</div></div>').join(""):'<div class="cempty">Geen workouts in de selectie.</div>')+
        '<div class="sm muted" style="margin-top:8px">Structuur + modaliteit-mix, bijv. "Triplet · 2× Gymnastics + 1× Barbell".</div></div>'+
    '</div>'+
    '<div class="panel" style="padding:16px;margin-top:16px"><h3 class="dt-h3">Veelvoorkomende duo\'s (movements die samen getest worden)</h3>'+
      (duoTop.length?duoTop.map(([k,c])=>
        '<div class="wd-mrow"><div class="mn" style="width:260px" title="'+esc(k)+'">'+esc(k)+'</div>'+
        '<div class="mbar"><div class="fill" style="width:'+(c/duoMax*100)+'%;background:#14b8a6"></div></div>'+
        '<div class="mc">'+c+'×</div></div>').join(""):'<div class="cempty">Nog geen combinaties die 2 keer of vaker voorkomen.</div>')+'</div>'+
    '<div class="panel" style="padding:16px;margin-top:16px"><h3 class="dt-h3">Meest voorkomende movements</h3>'+
      (top.length?top.map(([m,c])=>
        '<div class="wd-mrow"><div class="mn">'+esc(m)+'</div>'+
        '<div class="mbar"><div class="fill" style="width:'+(c/mx*100)+'%;background:'+WD_MODKLEUR[(WD_MOV[m]||{}).mod||"bar"]+'"></div></div>'+
        '<div class="mc">'+c+'</div></div>').join(""):'<div class="cempty">Nog geen workouts in de selectie. Voeg data toe via Invoer.</div>')+'</div>'+
    '<div class="panel" style="padding:16px;margin-top:16px"><h3 class="dt-h3">Skill-poorten (dit moet je kunnen)</h3>'+
      (sks.length?sks.map(([m,c])=>'<span class="wd-tag skill">'+esc(m)+' · '+c+'×</span>').join(""):'<span class="sm muted">Geen elite-skills in de selectie.</span>')+
      '<div class="sm muted" style="margin-top:8px">Movements met hoge technische drempel die in de selectie voorkomen. Wie deze niet heeft, verliest een hele workout.</div></div>';
  dtChart(()=>{
    if(!window.Chart)return;
    const eds=wdUniq(sel.map(w=>w.event+' '+w.jaar)).sort();
    const mods=Object.keys(WD_MODNAAM);
    const counts=eds.map(ed=>{
      const ws=sel.filter(w=>w.event+' '+w.jaar===ed);
      const c={bar:0,db:0,gym:0,mono:0,odd:0};
      ws.forEach(w=>(w.movements||[]).forEach(m=>{if(WD_MOV[m])c[WD_MOV[m].mod]++;}));
      const tot=Object.values(c).reduce((a,b)=>a+b,0)||1;
      return mods.map(m=>c[m]/tot*100);
    });
    const cv1=document.getElementById("wd-chmix");
    if(cv1){
      if(wdChMix)wdChMix.destroy();
      wdChMix=new Chart(cv1,{type:"bar",
        data:{labels:eds,datasets:mods.map((m,i)=>({label:WD_MODNAAM[m],data:counts.map(r=>r[i]),backgroundColor:WD_MODKLEUR[m],stack:"s"}))},
        options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.label+': '+Math.round(c.raw)+'%'}}},
          scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,max:100,ticks:{callback:v=>v+'%'},grid:{color:'#e3e7ef'}}}}});
    }
    const doms=['sprint (<5)','kort (5-10)','middel (10-20)','lang (20+)','kracht/max','onbekend'];
    const dc=doms.map(d=>sel.filter(w=>w.tijd===d).length);
    const cv2=document.getElementById("wd-chtime");
    if(cv2){
      if(wdChTime)wdChTime.destroy();
      wdChTime=new Chart(cv2,{type:"bar",
        data:{labels:doms,datasets:[{data:dc,backgroundColor:['#dc2626','#d97706','#C9A227','#16a34a','#2f6df6','#c3c9d4']}]},
        options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},
          scales:{x:{grid:{color:'#e3e7ef'},ticks:{stepSize:1}},y:{grid:{display:false}}}}});
    }
  });
}

// ---------- Workouts-lijst ----------
function wdWorkouts(h){
  const sel=wdSelectie("w").slice().sort((a,b)=>b.jaar-a.jaar||a.event.localeCompare(b.event)||a.naam.localeCompare(b.naam));
  h.innerHTML=wdFilterHtml("w")+
    (sel.length?sel.map(w=>{
      const st=wdStructuur(w);
      return '<div class="panel wd-kaart">'+
        '<div class="wd-kop"><b>'+esc(w.event)+' '+w.jaar+' · '+esc(w.naam)+'</b>'+
          '<span class="sm muted">'+esc(w.fase)+(w.divisie&&w.divisie!=="Alle divisies"?' · '+esc(w.divisie):'')+' · '+esc(w.tijd)+(w.maxload?' · max '+w.maxload+' kg':'')+'</span></div>'+
        '<pre class="wd-pre">'+esc(w.tekst)+'</pre>'+
        '<div>'+(w.movements||[]).map(m=>'<span class="wd-tag" style="color:'+WD_MODKLEUR[(WD_MOV[m]||{}).mod||"bar"]+'">'+esc(m)+'</span>').join("")+
          '<span class="wd-tag meta">'+esc(w.format)+'</span>'+
          (st.n?'<span class="wd-tag meta">'+st.label+(st.mix?' · '+esc(st.mix):'')+'</span>':'')+
          (st.maxSkill===3?'<span class="wd-tag skill">elite-skill</span>':'')+'</div>'+
        '<div style="margin-top:10px"><button class="btn ghost sm" style="color:var(--bad)" onclick="wdVerwijder(\''+w.id+'\')">Verwijderen</button></div>'+
      '</div>';}).join(""):'<div class="cempty">Geen workouts in deze selectie.</div>');
}
async function wdVerwijder(id){
  if(!confirm("Workout verwijderen?"))return;
  const{error}=await db.from("competition_workouts").delete().eq("id",id);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  WD.wods=WD.wods.filter(w=>w.id!==id);
  wdRenderView();
}

// ---------- Invoer + bulk-import ----------
function wdInvoer(h){
  const evs=wdUniq((WD.wods||[]).map(w=>w.event)).sort();
  const divs=wdUniq((WD.wods||[]).map(w=>w.divisie||"Alle divisies")).sort();
  h.innerHTML=
    '<div class="panel" style="padding:16px">'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">'+
        '<input class="lid-in" id="wd-in-event" list="wd-events" style="width:220px" placeholder="Wedstrijd (bijv. Amsterdam Throwdown)"><datalist id="wd-events">'+evs.map(e=>'<option value="'+esc(e)+'">').join("")+'</datalist>'+
        '<input class="lid-in" id="wd-in-jaar" type="number" min="2015" max="2035" value="'+(new Date().getFullYear())+'" style="width:90px">'+
        '<select class="lid-in" id="wd-in-fase" style="width:auto"><option value="kwalificatie">Kwalificatie</option><option value="finale">Finale</option></select>'+
        '<input class="lid-in" id="wd-in-naam" style="width:150px" placeholder="Naam / nummer">'+
        '<input class="lid-in" id="wd-in-div" list="wd-divs" value="Alle divisies" style="width:150px"><datalist id="wd-divs">'+divs.map(d=>'<option value="'+esc(d)+'">').join("")+'</datalist>'+
      '</div>'+
      '<div class="sm muted" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;font-size:11px">Workout-omschrijving (plak de aankondiging)</div>'+
      '<textarea class="lid-in" id="wd-in-tekst" style="min-height:130px;width:100%" placeholder="21-15-9&#10;Thrusters (43 kg)&#10;Chest to bar pull-ups&#10;Time cap: 8 min"></textarea>'+
      '<div style="display:flex;gap:10px;margin-top:10px;align-items:center;flex-wrap:wrap">'+
        '<button class="btn sm2" onclick="wdAnalyse()">Analyseer &amp; herken tags</button>'+
        '<span class="sm muted">De tekst wordt automatisch geclassificeerd. Daarna kun je tags aan/uit klikken.</span></div>'+
      '<div id="wd-tags" style="margin-top:14px"></div>'+
      '<div style="margin-top:12px"><button class="btn sm2" id="wd-addbtn" style="display:none" onclick="wdToevoegen()">+ Toevoegen aan database</button></div>'+
    '</div>'+
    '<div class="panel" style="padding:16px;margin-top:16px"><h3 class="dt-h3">Bulk-import (JSON uit n8n / Claude)</h3>'+
      '<textarea class="lid-in" id="wd-import" style="min-height:90px;width:100%" placeholder=\'[{"event":"Amsterdam Throwdown","jaar":2025,"fase":"kwalificatie","naam":"25.1","tekst":"..."}]\'></textarea>'+
      '<div style="display:flex;gap:10px;margin-top:10px;align-items:center"><button class="btn ghost sm" onclick="wdImport()">Importeer JSON</button><span class="sm" id="wd-importmsg"></span></div></div>';
}
function wdAnalyse(){
  const tekst=(document.getElementById("wd-in-tekst").value||"").trim();
  if(!tekst){toast("Plak eerst de workout-tekst");return;}
  const c=wdClassify(tekst);
  WD.pending={movements:new Set(c.movements),meta:c};
  const all=Object.keys(WD_MOV);
  const tagHtml=(m,aan)=>'<span class="wd-tag click'+(aan?'':' off')+'" style="color:'+WD_MODKLEUR[WD_MOV[m].mod]+'" data-m="'+esc(m)+'" onclick="wdTagToggle(this)">'+esc(m)+'</span>';
  const st=wdStructuur({movements:c.movements});
  document.getElementById("wd-tags").innerHTML=
    '<div class="sm muted" style="margin-bottom:6px">Herkende tags (klik om aan/uit te zetten):</div>'+
    all.filter(m=>WD.pending.movements.has(m)).map(m=>tagHtml(m,true)).join("")+
    '<span class="wd-tag meta">'+esc(c.format)+'</span><span class="wd-tag meta">'+esc(c.tijd)+'</span>'+(c.maxload?'<span class="wd-tag meta">max '+c.maxload+' kg</span>':'')+
    (st.n?'<span class="wd-tag meta">'+st.label+(st.mix?' · '+esc(st.mix):'')+'</span>':'')+
    '<details style="margin-top:8px"><summary class="sm muted" style="cursor:pointer">Tag handmatig toevoegen</summary><div style="margin-top:6px">'+
    all.filter(m=>!WD.pending.movements.has(m)).map(m=>tagHtml(m,false)).join("")+'</div></details>';
  document.getElementById("wd-addbtn").style.display="inline-block";
}
function wdTagToggle(el){
  const m=el.dataset.m;if(!WD.pending)return;
  if(WD.pending.movements.has(m)){WD.pending.movements.delete(m);el.classList.add("off");}
  else{WD.pending.movements.add(m);el.classList.remove("off");}
}
async function wdToevoegen(){
  const ev=(document.getElementById("wd-in-event").value||"").trim();
  const jr=parseInt(document.getElementById("wd-in-jaar").value);
  if(!ev||isNaN(jr)){toast("Vul wedstrijd en jaar in");return;}
  if(!WD.pending){toast("Analyseer eerst de tekst");return;}
  const rec={company_id:ME.profile.company_id,event:ev,jaar:jr,
    fase:document.getElementById("wd-in-fase").value,
    naam:(document.getElementById("wd-in-naam").value||"").trim()||"Workout",
    divisie:(document.getElementById("wd-in-div").value||"").trim()||"Alle divisies",
    tekst:(document.getElementById("wd-in-tekst").value||"").trim(),
    movements:[...WD.pending.movements],format:WD.pending.meta.format,tijd:WD.pending.meta.tijd,
    minutes:WD.pending.meta.minutes,maxload:WD.pending.meta.maxload};
  const{data,error}=await db.from("competition_workouts").upsert(rec,{onConflict:"event,jaar,fase,naam,divisie"}).select().single();
  if(error){toast(error.message||"Opslaan mislukt");return;}
  WD.wods=WD.wods.filter(w=>w.id!==data.id);WD.wods.unshift(data);
  document.getElementById("wd-in-tekst").value="";document.getElementById("wd-in-naam").value="";
  document.getElementById("wd-tags").innerHTML='<span class="sm" style="color:var(--ok)">Toegevoegd ✓</span>';
  document.getElementById("wd-addbtn").style.display="none";
  WD.pending=null;
}
async function wdImport(){
  const msg=document.getElementById("wd-importmsg");
  let arr;
  try{arr=JSON.parse(document.getElementById("wd-import").value);if(!Array.isArray(arr))throw 0;}
  catch(e){msg.textContent="Ongeldige JSON.";msg.style.color="var(--bad)";return;}
  const recs=[];
  for(const w of arr){
    if(!w.event||!w.jaar||!w.tekst)continue;
    const c=wdClassify(w.tekst);
    recs.push({company_id:ME.profile.company_id,event:w.event,jaar:parseInt(w.jaar),
      fase:w.fase==="finale"?"finale":"kwalificatie",naam:w.naam||"Workout",
      divisie:w.divisie||"Alle divisies",tekst:w.tekst,
      movements:(w.movements&&w.movements.length)?w.movements:c.movements,
      format:w.format||c.format,tijd:c.tijd,minutes:c.minutes,maxload:w.maxload||c.maxload,
      bron_url:w.bron_url||null});
  }
  if(!recs.length){msg.textContent="Geen bruikbare workouts gevonden.";msg.style.color="var(--bad)";return;}
  const{error}=await db.from("competition_workouts").upsert(recs,{onConflict:"event,jaar,fase,naam,divisie"});
  if(error){msg.textContent=error.message||"Import mislukt.";msg.style.color="var(--bad)";return;}
  await wdLaad();
  msg.textContent=recs.length+" workouts geïmporteerd.";msg.style.color="var(--ok)";
}

// ---------- CrossFit Open: wereldtop-10 per workout (tabel open_scores) ----------
// Scores komen uit de publieke CrossFit-API (eenmalige import); de workout-tekst
// en Rx-gewichten komen uit de benchmarks-catalogus in de Bibliotheek.
let OSD={geladen:false,scores:[],bm:{},jaar:null,geslacht:"men"};
async function osLaad(){
  if(OSD.geladen)return;
  const bq=await db.from("benchmarks").select("naam,tekst,format,time_cap,rx_men,rx_women").eq("categorie","open");
  // De tabel heeft 1.500+ rijen en de API geeft er maximaal 1000 per keer;
  // daarom in porties van 1000 doorhalen tot alles binnen is.
  let alle=[],vanaf=0;
  for(;;){
    const sq=await db.from("open_scores").select("part,year,division,rank,athlete,affiliate,score_display")
      .order("year").order("part").order("rank").range(vanaf,vanaf+999);
    if(sq.error){toast(sq.error.message||"Open-scores laden mislukt");return;}
    alle=alle.concat(sq.data||[]);
    if(!sq.data||sq.data.length<1000)break;
    vanaf+=1000;
  }
  OSD.scores=alle;
  (bq.data||[]).forEach(b=>{OSD.bm[b.naam]=b;});
  if(OSD.scores.length)OSD.jaar=Math.max.apply(null,OSD.scores.map(s=>s.year));
  OSD.geladen=true;
}
// Benchmark-gegevens bij een onderdeel (18.2 en 18.2a delen een catalogusrij)
function osBm(part){
  return OSD.bm["Open "+part]||((part==="18.2"||part==="18.2a")?OSD.bm["Open 18.2 / 18.2a"]:null);
}
async function osRender(h){
  h.innerHTML='<div class="cempty">Laden…</div>';
  await osLaad();
  if(!OSD.geladen||!OSD.scores.length){h.innerHTML='<div class="cempty">Geen Open-scores gevonden.</div>';return;}
  const jaren=[...new Set(OSD.scores.map(s=>s.year))].sort((a,b)=>b-a);
  const gesl=[["men","Mannen"],["women","Vrouwen"]]
    .map(g=>'<button class="'+(OSD.geslacht===g[0]?"on":"")+'" onclick="osZet(null,\''+g[0]+'\')">'+g[1]+'</button>').join("");
  h.innerHTML='<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:12px">'+
    '<div class="dt-subnav" style="flex-wrap:wrap">'+jaren.map(j=>'<button class="'+(OSD.jaar===j?"on":"")+'" onclick="osZet('+j+',null)">'+j+'</button>').join("")+'</div>'+
    '<div class="dt-subnav" style="margin-left:auto">'+gesl+'</div></div>'+
    '<div id="os-lijst"></div>';
  osLijst();
}
function osZet(jaar,gesl){
  if(jaar)OSD.jaar=jaar;
  if(gesl)OSD.geslacht=gesl;
  const h=document.getElementById("data-inhoud");
  if(h)osRender(h);
}
function osLijst(){
  const el=document.getElementById("os-lijst");if(!el)return;
  const parts=[...new Set(OSD.scores.filter(s=>s.year===OSD.jaar).map(s=>s.part))]
    .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  el.innerHTML=parts.map(part=>{
    const bm=osBm(part)||{};
    const rx=OSD.geslacht==="men"?bm.rx_men:bm.rx_women;
    const rows=OSD.scores.filter(s=>s.year===OSD.jaar&&s.part===part&&s.division===OSD.geslacht);
    const meta=[
      bm.format?esc(bm.format):null,
      bm.time_cap?'Time cap '+esc(bm.time_cap):null,
      rx?'Rx '+esc(rx):null,
    ].filter(Boolean).map(m=>'<span class="sm muted">'+m+'</span>').join('<span class="sm muted"> · </span>');
    const tid="os-t-"+part.replace(/[^A-Za-z0-9]/g,"_");
    return '<div class="panel" style="padding:16px 18px;margin-bottom:14px">'+
      '<div style="background:#f6f7f9;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:12px">'+
        '<div style="display:flex;gap:12px;align-items:baseline;flex-wrap:wrap"><b style="font-size:15px">Open '+esc(part)+'</b>'+meta+
          (bm.tekst?'<a class="sm" style="margin-left:auto;color:var(--accent);cursor:pointer" onclick="osTekst(this,\''+tid+'\')">Workout verbergen</a>':'')+
        '</div>'+
        (bm.tekst
          ?'<pre id="'+tid+'" style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;line-height:1.55;color:var(--txt);margin:8px 0 0">'+esc(bm.tekst)+'</pre>'
          :'<div class="sm muted" style="margin-top:6px">Geen omschrijving in de benchmarks-catalogus.</div>')+
      '</div>'+
      '<div class="os-thead"><span>#</span><span>Atleet</span><span>Box</span><span style="text-align:right">Score</span></div>'+
      (rows.map(r=>'<div class="os-row"><span class="muted">'+r.rank+'</span><span><b>'+esc(r.athlete)+'</b></span><span class="muted">'+esc(r.affiliate||"")+'</span><span style="text-align:right"><b>'+esc(r.score_display||"")+'</b></span></div>').join("")
        ||'<div class="cempty" style="padding:14px 4px">Geen scores voor deze selectie.</div>')+
      '</div>';
  }).join("")||'<div class="cempty">Geen workouts voor dit jaar.</div>';
}
// De workout-tekst staat standaard uitgeklapt (verzoek Stefan); dit linkje klapt hem in/uit.
function osTekst(link,tid){
  const el=document.getElementById(tid);if(!el)return;
  const dicht=el.style.display==="none";
  el.style.display=dicht?"":"none";
  link.textContent=dicht?"Workout verbergen":"Workout tonen";
}
