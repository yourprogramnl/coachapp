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
let DT={athletes:{},geladen:false,view:"team",sortKey:"TOT",sortDir:-1,filter:"",sel:"",selA:"",selB:"",selTest:"back_squat",nieuwOpen:false};
let dtRadarP=null,dtRadarC=null;

async function dtLaad(){
  const[aq,sq]=await Promise.all([
    db.from("data_athletes").select("*").order("name"),
    db.from("data_scores").select("athlete_id,test_key,value"),
  ]);
  if(aq.error||sq.error){toast("Data laden mislukt");return;}
  const map={};
  (aq.data||[]).forEach(a=>{map[a.name]={id:a.id,bw:a.bw==null?null:Number(a.bw),scores:{}};});
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
const dtNames=()=>Object.keys(DT.athletes);
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
    '</div>'+
    '<div id="data-inhoud"></div>';
  dataRender();
}
async function dataZetTab(t){
  dataTab=t;
  if(t==="atleten"&&!DT.geladen)await dtLaad();
  const tabs=document.querySelectorAll("#cpage .ctabs button");
  tabs.forEach(b=>b.classList.toggle("on",(b.textContent||"").toLowerCase().indexOf(t==="atleten"?"atleten":"wedstrijden")===0));
  dataRender();
}
function dataRender(){
  const h=document.getElementById("data-inhoud");if(!h)return;
  if(dataTab==="wedstrijden"){
    h.innerHTML='<div class="panel" style="padding:26px;text-align:center"><div class="sm muted" style="line-height:1.7">Hier komt de wedstrijden-data.<br>Stefan geeft aan wat hier moet komen.</div></div>';
    return;
  }
  const sub=[["team","Team"],["atleet","Atleet"],["vergelijk","Vergelijk"],["ranking","Ranking"]]
    .map(v=>'<button class="'+(DT.view===v[0]?"on":"")+'" onclick="dtGo(\''+v[0]+'\')">'+v[1]+'</button>').join("");
  h.innerHTML='<div class="dt-subnav">'+sub+'</div><div id="dt-view"></div>';
  dtRenderView();
}
function dtGo(v){DT.view=v;dataRender();}
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
  const tv=dtNames().map(dtTotPct).filter(v=>v!=null);
  const avg=tv.length?tv.reduce((a,b)=>a+b,0)/tv.length:null;
  const top=dtRanked()[0];
  const zwak=Object.keys(DT_CATS).map(c=>[c,dtTeamCat(c)]).filter(x=>x[1]!=null).sort((a,b)=>a[1]-b[1]);
  const catKeys=Object.keys(DT_CATS);
  const kop=[["RANG","#"],["NAME","Atleet"],...catKeys.map(c=>[c,dtShortCat(c)]),["TOT","Totaal"]]
    .map(([k,l])=>'<button data-k="'+esc(k)+'" onclick="dtSort(\''+k.replace(/'/g,"\\'")+'\')" class="'+(k===DT.sortKey?"on":"")+'">'+esc(l)+(k===DT.sortKey?(DT.sortDir<0?" ▼":" ▲"):"")+'</button>').join("");
  h.innerHTML=
    '<div class="dt-kpis">'+
      '<div class="dt-kpi"><div class="v">'+dtNames().length+'</div><div class="l">Atleten</div></div>'+
      '<div class="dt-kpi"><div class="v">'+dtFmtPct(avg)+'</div><div class="l">Team doelscore</div></div>'+
      '<div class="dt-kpi"><div class="v">'+esc(top||"—")+'</div><div class="l">#1 · '+dtFmtPct(dtTotPct(top))+'</div></div>'+
      '<div class="dt-kpi"><div class="v">'+esc(zwak.length?zwak[0][0]:"—")+'</div><div class="l">Grootste werkpunt · '+(zwak.length?dtFmtPct(zwak[0][1]):"")+'</div></div>'+
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
    '<input class="lid-in" id="dt-nw-naam" style="width:220px" placeholder="Naam atleet">'+
    '<input class="lid-in" id="dt-nw-bw" style="width:140px" placeholder="Gewicht kg (mag leeg)" inputmode="decimal">'+
    '<button class="btn sm2" onclick="dtNieuwOpslaan()">Opslaan</button>'+
    '<button class="btn ghost sm" onclick="dtNieuwToggle()">Annuleren</button></div>';
}
function dtNieuwToggle(){DT.nieuwOpen=!DT.nieuwOpen;dtRenderView();if(DT.nieuwOpen){const i=document.getElementById("dt-nw-naam");if(i)i.focus();}}
async function dtNieuwOpslaan(){
  const naam=(document.getElementById("dt-nw-naam").value||"").trim();
  const bwS=(document.getElementById("dt-nw-bw").value||"").trim().replace(",",".");
  if(!naam){toast("Vul een naam in");return;}
  if(DT.athletes[naam]){toast("Deze naam bestaat al");return;}
  const bw=bwS===""?null:parseFloat(bwS);
  if(bwS!==""&&isNaN(bw)){toast("Gewicht is geen getal");return;}
  const{data,error}=await db.from("data_athletes").insert({company_id:ME.profile.company_id,name:naam,bw}).select().single();
  if(error){toast(error.message||"Opslaan mislukt");return;}
  DT.athletes[naam]={id:data.id,bw,scores:{}};
  DT.nieuwOpen=false;DT.sel=naam;DT.view="atleet";dataRender();
}
async function dtVerwijderAtleet(){
  const a=DT.sel;if(!a||!DT.athletes[a])return;
  if(!confirm(a+" en alle scores verwijderen?"))return;
  const{error}=await db.from("data_athletes").delete().eq("id",DT.athletes[a].id);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  delete DT.athletes[a];
  DT.sel=dtRanked()[0]||"";dataRender();
}

// ---------- Atleet (scores altijd direct bewerkbaar; opslaan bij wijzigen) ----------
function dtAtleetView(h){
  if(!DT.athletes[DT.sel])DT.sel=dtRanked()[0]||"";
  const a=DT.sel;
  const t=dtTotPct(a);
  const opts=dtRanked().map(n=>'<option value="'+esc(n)+'"'+(n===a?" selected":"")+'>'+esc(n)+'</option>').join("");
  h.innerHTML=
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px">'+
      '<select class="lid-in" style="width:auto;min-width:200px" onchange="dtSelAtleet(this.value)">'+opts+'</select>'+
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
  if(!DT.athletes[DT.selA])DT.selA=dtRanked()[0]||"";
  if(!DT.athletes[DT.selB])DT.selB=dtRanked()[1]||dtRanked()[0]||"";
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
