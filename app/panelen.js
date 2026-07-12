// app/panelen.js — de zijpanelen van het klant-scherm:
// Assessment, Metrics & 1RM, Doelen, Notities & documenten, Trainingsschema,
// Prioriteiten, Materiaal en de Profiel-pagina. Plus de zijbalk in-/uitklappen.
// ---------- ASSESSMENT (OPEX Body / Move / Work), zoals het ontwerp ----------
const ASS_MOVE=[["scratch","Scratch Test","Schoudermobiliteit: handen achter de rug naar elkaar reiken"],["airsquat","Air Squat","Diepe squat met armen vooruit, hielen aan de grond"],["toetouch","Toe Touch Test","Gestrekte benen, vingertoppen naar de tenen"],["lunge","Lunge Test","Uitvalspas met romp rechtop en knie naar de vloer"],["slr","Straight Leg Raise Test","Liggend been gestrekt heffen tot 70 graden"]];
const ASS_TIJD=[["frontplank","Front Plank/Front Leaning Rest","Vasthouden in seconden"],["reverseplank","Reverse Plank","Omgekeerde plank, heupen hoog"],["sideplank_r","Side Plank Right","Zijwaartse plank rechts"],["sideplank_l","Side Plank Left","Zijwaartse plank links"]];
let assData={};
async function openAssess(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-assess");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-assess";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Assessment</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  const{data:rows}=await db.from("assessments").select("*").eq("athlete_id",calClient).limit(1);
  assData=(rows&&rows[0]&&rows[0].data)||{};
  sp.innerHTML=assHtml(assData);
}
function assVal(pad,std){const d=pad.split(".").reduce((o,k)=>o&&o[k]!=null?o[k]:null,assData);return d==null?(std||""):d;}
function assVeldRij(n,v){return '<div class="sp-field ass-extra" style="display:flex;gap:6px"><input class="xn" placeholder="Naam veld" value="'+esc(n||"")+'" style="flex:1"><input class="xv" placeholder="Waarde" value="'+esc(v||"")+'" style="flex:1"></div>';}
function assHtml(d){
  d=d||{};const b=d.body||{},mv=d.move||{},wk=d.work||{};
  const veld=(lbl,id,val)=>'<div class="sp-field"><label>'+lbl+'</label><input id="'+id+'" value="'+esc(val==null?"":val)+'"></div>';
  const extraHtml=lijst=>(lijst||[]).map(x=>assVeldRij(x.n,x.v)).join("");
  const moveTests=ASS_MOVE.map(t=>{
    const cur=mv[t[0]]||"",nt=mv[t[0]+"_n"]||"";
    return '<div class="sp-field"><label>'+t[1]+' <span class="ass-help" title="'+esc(t[2])+'">?</span></label>'+
      '<div class="ass-pf"><label><input type="radio" name="mv-'+t[0]+'" value="pass"'+(cur==="pass"?" checked":"")+'> Pass</label><label><input type="radio" name="mv-'+t[0]+'" value="fail"'+(cur==="fail"?" checked":"")+'> Fail</label></div>'+
      '<span class="ass-noteslink" onclick="assNotes(this)">'+(nt?"Notities bewerken":"Notitie toevoegen")+'</span>'+
      '<textarea class="ass-notes" data-k="'+t[0]+'" style="'+(nt?"":"display:none")+'">'+esc(nt)+'</textarea></div>';
  }).join("");
  const tijden=ASS_TIJD.map(t=>'<div class="sp-field"><label>'+t[1]+' <span class="ass-help" title="'+esc(t[2])+'">?</span></label><input id="as-'+t[0]+'" placeholder="0:00" value="'+esc(mv[t[0]]||"")+'"></div>').join("");
  return '<div class="sp-head"><h3>Assessment</h3><span class="sp-x" onclick="document.getElementById(\'sp-assess\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div class="sp-tabs"><button class="on" id="ass-t0" onclick="assTab(0)">OPEX Body</button><button id="ass-t1" onclick="assTab(1)">OPEX Move</button><button id="ass-t2" onclick="assTab(2)">OPEX Work</button></div>'+
    '<div id="ass-0">'+
      veld("Lichaamsgewicht","as-gewicht",b.gewicht)+
      veld("Vetpercentage","as-vet",b.vet)+
      veld("Skeletspiermassa","as-spier",b.spier)+
      veld("Basaal metabolisme","as-metab",b.metab)+
      '<div class="sp-field"><label>Muscle fat-analyse</label><select id="as-shape">'+["","C-shape","D-shape","I-shape"].map(s=>'<option'+(b.shape===s?" selected":"")+'>'+s+'</option>').join("")+'</select></div>'+
      '<div class="sp-field"><label>Notities OPEX Body</label><textarea id="as-bodynotes">'+esc(b.notes||"")+'</textarea></div>'+
      '<div id="ass-extra-0">'+extraHtml(b.extra)+'</div>'+
      '<button class="sp-btn ghost" style="margin-bottom:12px" onclick="assVeldBij(0)">Voeg veld toe</button>'+
    '</div>'+
    '<div id="ass-1" style="display:none">'+moveTests+tijden+
      '<div class="sp-field"><label>OPEX Move Notes</label><textarea id="as-movenotes">'+esc(mv.notes||"")+'</textarea></div>'+
      '<div id="ass-extra-1">'+extraHtml(mv.extra)+'</div>'+
      '<button class="sp-btn ghost" style="margin-bottom:12px" onclick="assVeldBij(1)">Voeg veld toe</button>'+
    '</div>'+
    '<div id="ass-2" style="display:none">'+
      veld("Airbike 10 min cals","as-cals",wk.cals)+
      veld("Airbike weight conversion","as-conv",wk.conv)+
      '<div class="sp-field"><label>OPEX Work Notes</label><textarea id="as-worknotes">'+esc(wk.notes||"")+'</textarea></div>'+
      '<div id="ass-extra-2">'+extraHtml(wk.extra)+'</div>'+
      '<button class="sp-btn ghost" style="margin-bottom:12px" onclick="assVeldBij(2)">Voeg veld toe</button>'+
    '</div>'+
    '<div style="display:flex;gap:8px"><button class="sp-btn" onclick="assOpslaan()">Assessment opslaan</button><button class="sp-btn ghost" onclick="toast(\'Exporteren komt in een volgende stap\')">Exporteer als PDF</button></div>'+
    '<div class="sp-info" id="ass-msg" style="margin-top:10px"></div>';
}
function assTab(i){[0,1,2].forEach(x=>{document.getElementById("ass-"+x).style.display=x===i?"":"none";document.getElementById("ass-t"+x).classList.toggle("on",x===i);});}
function assNotes(el){const t=el.nextElementSibling;if(!t)return;t.style.display=t.style.display==="none"?"":"none";if(t.style.display!=="none")t.focus();}
function assVeldBij(i){document.getElementById("ass-extra-"+i).insertAdjacentHTML("beforeend",assVeldRij("",""));}
function assExtraLees(i){return [...document.querySelectorAll("#ass-extra-"+i+" .ass-extra")].map(r=>({n:r.querySelector(".xn").value.trim(),v:r.querySelector(".xv").value.trim()})).filter(x=>x.n||x.v);}
async function assOpslaan(){
  const g=id=>{const el=document.getElementById(id);return el?el.value.trim():"";};
  const move={};
  ASS_MOVE.forEach(t=>{
    const r=document.querySelector('input[name="mv-'+t[0]+'"]:checked');
    if(r)move[t[0]]=r.value;
    const nt=document.querySelector('.ass-notes[data-k="'+t[0]+'"]');
    if(nt&&nt.value.trim())move[t[0]+"_n"]=nt.value.trim();
  });
  ASS_TIJD.forEach(t=>{const v=g("as-"+t[0]);if(v)move[t[0]]=v;});
  move.notes=g("as-movenotes");move.extra=assExtraLees(1);
  const doc={
    body:{gewicht:g("as-gewicht"),vet:g("as-vet"),spier:g("as-spier"),metab:g("as-metab"),shape:g("as-shape"),notes:g("as-bodynotes"),extra:assExtraLees(0)},
    move,
    work:{cals:g("as-cals"),conv:g("as-conv"),notes:g("as-worknotes"),extra:assExtraLees(2)}
  };
  const{error}=await db.from("assessments").upsert({athlete_id:calClient,company_id:ME.profile.company_id,data:doc,updated_by:ME.user.id},{onConflict:"athlete_id"});
  const msg=document.getElementById("ass-msg");
  if(error){if(msg)msg.textContent=error.message||"Opslaan mislukt";return;}
  assData=doc;
  if(msg)msg.textContent="";
  toast("Assessment opgeslagen");
}
// ---------- METRICS & 1RM (zoals het ontwerp; waarden uit de metrics-tabel) ----------
const METRICS_DEF={
 "Resistance":["Air Squat","Back Squat 1RM","CGBP 1RM","Clean 1RM","DB External Rotation 8RM","DB Powell Raise 8RM","DB Prone Row 6RM","Deadlift","Front Leaning Rest","Front Squat 1RM","Goblet Squat 20RM","Power Clean 1RM","Power Snatch 1RM","Push-up","Reverse Plank","RFESS","Seated DB OH Press 6RM","Side Plank Left","Side Plank Right","Snatch 1RM","Sorenson Hold","Strict Dip","Strict Knees to Elbow","Strict Press 1RM","Strict Pullup","Thruster 1RM","Unloaded RFESS","Weighted Pull-up 1RM","Weighted Strict Dip 1RM"],
 "Energy System Beginner":["10 minute AirBike","5k Row","60min Row","AirBike Weight Conversion"],
 "Energy System Intermediate":["2k Row","30/30 Row (Row 1)","30/30 Row (Row 2)","30/30 Row (Row 3)","30/30 Row (Row 4)","3K running","500m Row","60 sec AirBike","60 sec Row","90min AMRAP","Row/Burpee Over Erg"],
 "Energy System Advanced":["18 min AMRAP","Back Squat Neuromuscular Efficiency (NME)","Constant Variance (Set 1: A,B,C,D,E,F)","Constant Variance (Set 2: D,E,F,C,B,A)","Constant Variance (Set 3: B,D,E,A,F,C)","Constant Variance (Set 4: F,A,D,E,C,B)","Constant Variance (Set 5: C,F,B,D,A,E)","Power Clean/Burpee Repeat (Set 1)","Power Clean/Burpee Repeat (Set 2)","Push/Pull","Row/KBS/Burpee (Set 1)","Row/KBS/Burpee (Set 2)","Row/KBS/Burpee (Set 3)","Strict PU + Strict HSPU (PU)","Strict PU + Strict HSPU (sHSPU)"],
 "OPEX Body":["Basal Metabolic Rate","Bodyfat Percentage","Skeletal Muscle Mass","Weight"]
};
let mxData=[],mxOpen={},balKeuze="Deadlift";
async function mxLaad(){
  const{data}=await db.from("metrics").select("*").eq("athlete_id",calClient).order("measured_at");
  mxData=data||[];
}
// per metric-naam: alle metingen (oplopend), laatste en voorlaatste waarde
function mxHist(naam){return mxData.filter(m=>m.metric===naam);}
function mxGroepen(){
  const uit={};
  for(const g in METRICS_DEF)uit[g]=METRICS_DEF[g].slice();
  const bekend=new Set(Object.values(METRICS_DEF).flat());
  const eigen=[...new Set(mxData.map(m=>m.metric))].filter(n=>!bekend.has(n));
  if(eigen.length)uit["Eigen metrics"]=eigen;
  return uit;
}
function mxWaarde(naam){
  const h=mxHist(naam);
  if(!h.length)return null;
  const cur=h[h.length-1],vorig=h.length>1?h[h.length-2]:null;
  return{cur,vorig,unit:cur.unit||""};
}
async function openMx(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-mx");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-mx";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Metrics</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  await mxLaad();
  sp.innerHTML='<div class="sp-head"><h3>Metrics</h3><span class="sp-x" onclick="document.getElementById(\'sp-mx\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">'+
    '<button class="sp-btn" style="width:auto;padding:9px 14px" onclick="metricsView()">Bekijk structural balance</button>'+
    '<button class="sp-btn ghost" style="width:auto;padding:9px 14px;margin-left:auto" onclick="openMxModal(\'\')">+ Toevoegen</button></div>'+
    '<div id="mx-groepen"></div>';
  mxRender();
}
function mxToggle(g){mxOpen[g]=!mxOpen[g];mxRender();}
function mxRender(){
  const host=document.getElementById("mx-groepen");if(!host)return;
  const groepen=mxGroepen();let html="";
  for(const g in groepen){
    html+='<div class="mx-hd" onclick="mxToggle(\''+g.replace(/'/g,"\\'")+'\')"><span>'+esc(g)+'</span><span class="plus" title="Meting toevoegen" onclick="event.stopPropagation();openMxModal(\'\')">+</span></div>';
    if(mxOpen[g]){
      html+='<div class="mx-cols"><div style="flex:1.7">Naam</div><div style="flex:.6">Huidig</div><div style="flex:.4;text-align:right">+/-</div></div>';
      groepen[g].forEach(naam=>{
        const w=mxWaarde(naam);
        let pm="–",pmKl="#8b919b";
        if(w&&w.vorig&&w.cur.value!=null&&w.vorig.value!=null&&w.cur.value!==w.vorig.value){
          const d=Math.round((w.cur.value-w.vorig.value)*10)/10;
          pm=(d>0?"▲ +":"▼ ")+d;pmKl=d>0?"#27b376":"#e5484d";
        }
        html+='<div class="mx-row" onclick="openMxModal(\''+naam.replace(/'/g,"\\'")+'\')"><div class="mx-naam">'+esc(naam)+'</div><div class="mx-cur">'+(w?esc(String(w.cur.value))+" "+esc(w.unit):"—")+'</div><div class="mx-pm" style="color:'+pmKl+'">'+pm+'</div></div>';
      });
    }
  }
  host.innerHTML=html;
}
function ensureMxModal(){
  if(document.getElementById("mxmodal"))return;
  const alle=Object.values(METRICS_DEF).flat();
  const d=document.createElement("div");
  d.innerHTML='<div class="lmodal" id="mxmodal"><div class="box"><h3>Meting toevoegen</h3>'+
    '<div class="field"><label>Metric</label><input id="mx-naam" list="mxlijst" placeholder="Bijv. Deadlift"><datalist id="mxlijst">'+alle.map(n=>'<option value="'+esc(n)+'">').join("")+'</datalist></div>'+
    '<div class="field"><label>Waarde (alleen een getal, bijv. 141 of 13.45)</label><input id="mx-waarde" inputmode="decimal"></div>'+
    '<div class="field"><label>Eenheid</label><select id="mx-unit"><option>kg</option><option>reps</option><option>sec</option><option>min</option><option>cal</option><option>%</option><option>m</option></select></div>'+
    '<div class="field"><label>Datum</label><input id="mx-datum" type="date"></div>'+
    '<div style="display:flex;gap:8px"><button class="btn" onclick="mxOpslaan()">Opslaan</button><button class="btn ghost" onclick="document.getElementById(\'mxmodal\').classList.remove(\'show\')">Annuleren</button></div>'+
    '<div class="msg" id="mx-msg"></div></div></div>';
  document.body.appendChild(d.firstChild);
}
function openMxModal(naam){
  ensureMxModal();
  document.getElementById("mx-naam").value=naam||"";
  document.getElementById("mx-waarde").value="";
  document.getElementById("mx-datum").value=todayStr();
  document.getElementById("mx-msg").textContent="";
  document.getElementById("mxmodal").classList.add("show");
  document.getElementById(naam?"mx-waarde":"mx-naam").focus();
}
async function mxOpslaan(){
  const naam=document.getElementById("mx-naam").value.trim();
  const ruw=document.getElementById("mx-waarde").value.trim().replace(",",".");
  const waarde=parseFloat(ruw);
  const msg=document.getElementById("mx-msg");
  if(!naam){msg.textContent="Vul een metric-naam in.";return;}
  if(isNaN(waarde)){msg.textContent="Vul een getal in als waarde.";return;}
  const{error}=await db.from("metrics").insert({athlete_id:calClient,company_id:ME.profile.company_id,metric:naam,value:waarde,unit:document.getElementById("mx-unit").value,measured_at:document.getElementById("mx-datum").value||todayStr(),created_by:ME.user.id});
  if(error){msg.textContent=error.message||"Opslaan mislukt";return;}
  document.getElementById("mxmodal").classList.remove("show");
  toast("Meting opgeslagen");
  await mxLaad();
  mxRender();
  if(activePanel==="metrics")metricsRender();
}
// Structural balance-weergave in het hoofdvlak
async function metricsView(){
  activePanel="metrics";
  const m=document.getElementById("cmain");if(!m)return;
  m.innerHTML='<div class="spin">Laden…</div>';
  await mxLaad();
  metricsRender();
}
function balKies(naam){balKeuze=naam;metricsRender();}
function metricsRender(){
  const m=document.getElementById("cmain");if(!m||activePanel!=="metrics")return;
  const rijen=(mxGroepen()["Resistance"]||[]).map(naam=>{
    const w=mxWaarde(naam);
    const act=naam===balKeuze;
    const val=w?'<span class="mv">'+esc(String(w.cur.value))+' '+esc(w.unit)+'</span>':'<span class="mv na">—</span>';
    return '<div class="metrow"'+(act?' style="background:#f0f8fc"':'')+' onclick="balKies(\''+naam.replace(/'/g,"\\'")+'\')"><span>'+(act?'<b>'+esc(naam)+'</b>':esc(naam))+'</span>'+val+'</div>';
  }).join("");
  const w=mxWaarde(balKeuze);
  let waarde="—",delta="",spark="";
  if(w){
    waarde=w.cur.value+" "+(w.unit||"");
    if(w.vorig&&w.vorig.value!=null&&w.vorig.value!==w.cur.value){
      const d=Math.round((w.cur.value-w.vorig.value)*10)/10;
      delta=(d>0?"+":"")+d+" "+(w.unit||"")+" sinds vorige meting";
    }
    const hist=mxHist(balKeuze).slice(-6);
    const max=Math.max(...hist.map(h=>h.value||0),1);
    spark=hist.map((h,i)=>'<i'+(i===hist.length-1?' class="hi"':'')+' style="height:'+Math.max(6,Math.round((h.value||0)/max*100))+'%" title="'+esc(h.measured_at)+': '+esc(String(h.value))+'"></i>').join("");
  }
  m.innerHTML='<div class="calhead"><span class="month">Metrics & 1RM</span>'+
    '<div class="seg" style="margin-left:auto"><button onclick="toast(\'Dag/week/maand-trends komen later\')">Dag</button><button class="on">Week</button><button onclick="toast(\'Dag/week/maand-trends komen later\')">Maand</button></div>'+
    '<button class="btn ghost sm" onclick="toast(\'Aanpassen komt later\')"><svg class="i sm-i"><use href="#i-gear"/></svg> Aanpassen</button></div>'+
    '<div class="metgrid"><div class="metlist">'+
    '<div class="mlh"><b class="sm">Krachtwaarden</b><button class="btn sm" onclick="openMxModal(\'\')">+ Voeg toe</button></div>'+
    '<div style="padding:10px 15px;border-bottom:1px solid #f0f1f3"><button class="btn ghost sm" style="width:100%;justify-content:center" onclick="openMx()">Metrics-paneel openen</button></div>'+
    '<div class="grp"><span>Naam</span><span>Huidig</span></div>'+
    '<div id="bal-lijst">'+rijen+'</div></div>'+
    '<div class="metmain"><div class="metcards">'+
    '<div class="metcard" style="grid-column:span 2"><h3>'+esc(balKeuze)+' <span class="muted sm" style="font-weight:400">· laatste 6 metingen</span></h3>'+
    '<div class="val">'+esc(waarde)+' <span class="delta">'+esc(delta)+'</span></div>'+
    (spark?'<div class="spark">'+spark+'</div>':'<div class="nodata" style="border:1px dashed #e7e9ec;border-radius:8px;color:#b3b9c2;font-size:11.5px;text-align:center;padding:14px 6px;margin-top:10px">Nog geen metingen. Voeg de eerste toe via + Voeg toe.</div>')+'</div>'+
    '<div class="metcard"><h3>Readiness</h3><div class="nodata">Nog geen data</div></div>'+
    '<div class="metcard"><h3>Slaap</h3><div class="nodata">Nog geen data</div></div>'+
    '<div class="metcard"><h3>Herstel</h3><div class="nodata">Nog geen data</div></div>'+
    '<div class="metcard"><h3>Voeding</h3><div class="nodata">Nog geen data</div></div>'+
    '</div><div class="sm muted" style="margin-top:14px">Deze 1RM\'s voeden straks de slimme berekening in de workout-bouwer (bijv. "3 sets @ 70% van 1RM deadlift").</div></div></div>';
}
// Eén zijpaneel tegelijk open: de rest klapt dicht
function sluitPanelen(){document.querySelectorAll(".sidepanel.show").forEach(p=>p.classList.remove("show"));}
// ---------- Zijbalk in-/uitklappen ----------
function toggleSide(){
  sideCollapsed=!sideCollapsed;
  const lay=document.querySelector(".client-layout");
  if(lay)lay.classList.toggle("collapsed",sideCollapsed);
  const a=document.getElementById("cl-arrow");
  if(a)a.textContent=sideCollapsed?"→":"←";
}
// ---------- DOELEN (zoals het ontwerp; opslag in client_info.data.goals) ----------
const GOALOPTS=["Spiermassa opbouwen","Sterker worden","Conditie verbeteren","Vetmassa verliezen","Gezondheid verbeteren","Gezondere gewoontes ontwikkelen","Meer energie","Anders (zie toelichting)"];
let ciData={};
async function ciLaad(){
  const{data:rows}=await db.from("client_info").select("*").eq("athlete_id",calClient).limit(1);
  ciData=(rows&&rows[0]&&rows[0].data)||{};
}
async function ciBewaar(){
  const{error}=await db.from("client_info").upsert({athlete_id:calClient,company_id:ME.profile.company_id,data:ciData,updated_by:ME.user.id},{onConflict:"athlete_id"});
  return error;
}
async function openGoals(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-goals");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-goals";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Doelen</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  await ciLaad();
  sp.innerHTML='<div class="sp-head"><h3>Doelen</h3><span class="sp-x" onclick="document.getElementById(\'sp-goals\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div id="goals-view"><button class="sp-btn" style="margin-bottom:14px" onclick="goalsEdit()">Doelen bewerken</button><div id="goals-chips"></div>'+
    '<div class="sp-info" style="margin-top:12px"><b style="color:#c9cdd4">Toelichting</b><br><span id="goals-other-view">Geen</span></div></div>'+
    '<div id="goals-edit" style="display:none"><div id="goals-opts"></div>'+
    '<div class="sp-field" style="margin-top:8px"><label>Toelichting</label><textarea id="goals-other"></textarea></div>'+
    '<div style="display:flex;gap:8px;margin-top:4px"><button class="sp-btn" onclick="goalsSave()">Opslaan</button><button class="sp-btn ghost" onclick="goalsView()">Annuleren</button></div></div>';
  goalsView();
}
function goalsVan(){return ciData.goals||{sel:[],other:""};}
function goalsView(){
  const g=goalsVan();
  const v=document.getElementById("goals-view"),e=document.getElementById("goals-edit");
  if(!v)return;
  v.style.display="";e.style.display="none";
  document.getElementById("goals-chips").innerHTML=g.sel.filter(x=>x!=="Anders (zie toelichting)").map(x=>'<div class="sp-chip">'+esc(x)+'</div>').join("")||'<div class="sm" style="color:#8b919b">Nog geen doelen gekozen</div>';
  document.getElementById("goals-other-view").textContent=g.other||"Geen";
}
function goalsEdit(){
  const g=goalsVan();
  document.getElementById("goals-view").style.display="none";
  document.getElementById("goals-edit").style.display="";
  document.getElementById("goals-opts").innerHTML=GOALOPTS.map(o=>'<div class="goalopt'+(g.sel.includes(o)?" aan":"")+'" onclick="this.classList.toggle(\'aan\')">'+esc(o)+'</div>').join("");
  document.getElementById("goals-other").value=g.other||"";
}
async function goalsSave(){
  const sel=[...document.querySelectorAll("#goals-opts .goalopt.aan")].map(d=>d.textContent);
  ciData.goals={sel,other:document.getElementById("goals-other").value.trim()};
  const err=await ciBewaar();
  if(err){toast(err.message||"Opslaan mislukt");return;}
  goalsView();toast("Doelen opgeslagen");
}
// ---------- NOTITIES & DOCUMENTEN (zoals het ontwerp; notes-tabel) ----------
let notesLijst=[],noteEditId=null;
const vandaagNL=()=>{const d=new Date();return d.getDate()+" "+MAANDVOL[d.getMonth()]+" "+d.getFullYear();};
const datumNL=iso=>{const d=new Date(iso);return d.getDate()+" "+MAANDVOL[d.getMonth()]+" "+d.getFullYear();};
async function notesLaad(){
  const{data}=await db.from("notes").select("*").eq("athlete_id",calClient).order("created_at",{ascending:false});
  notesLijst=data||[];
}
async function openNotes(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-notes");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-notes";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Notities & documenten</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  await notesLaad();
  sp.innerHTML='<div class="sp-head"><h3>Notities & documenten</h3><span class="sp-x" onclick="document.getElementById(\'sp-notes\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div class="sp-tabs"><button class="on" id="nd-t0" onclick="ndTab(0)">Notities</button><button id="nd-t1" onclick="ndTab(1)">Documenten</button></div>'+
    '<div id="nd-0"><div class="sp-field"><textarea id="note-nieuw" placeholder="Notitie toevoegen (alleen zichtbaar voor coaches)…"></textarea></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:14px"><button class="sp-btn" style="width:auto;padding:9px 16px" id="note-saveknop" onclick="noteOpslaan()">Opslaan</button><button class="sp-btn ghost" style="width:auto;padding:9px 16px" onclick="noteReset()">Annuleren</button></div>'+
    '<div class="sp-field"><input id="note-zoek" placeholder="Zoek in notities" oninput="notesRender()"></div>'+
    '<div id="notes-lijst"></div></div>'+
    '<div id="nd-1" style="display:none"><button class="sp-btn" style="margin-bottom:8px" onclick="toast(\'Documenten uploaden komt in een volgende stap\')">Document uploaden vanaf je computer</button>'+
    '<div class="sp-info">Standaard alleen zichtbaar voor coaches. Delen met het lid komt samen met de sporter-app.</div></div>';
  notesRender();
}
function ndTab(i){document.getElementById("nd-0").style.display=i===0?"":"none";document.getElementById("nd-1").style.display=i===1?"":"none";document.getElementById("nd-t0").classList.toggle("on",i===0);document.getElementById("nd-t1").classList.toggle("on",i===1);}
function notesRender(){
  const host=document.getElementById("notes-lijst");if(!host)return;
  const zoek=((document.getElementById("note-zoek")||{}).value||"").toLowerCase();
  const lijst=notesLijst.filter(n=>!zoek||(n.body||"").toLowerCase().includes(zoek)||datumNL(n.created_at).toLowerCase().includes(zoek));
  host.innerHTML=lijst.map(n=>'<div class="sp-note"><div class="nh">'+esc(datumNL(n.created_at))+
    ' <span><svg class="i sm-i" onclick="noteBewerk(\''+n.id+'\')"><use href="#i-pen"/></svg><svg class="i sm-i" onclick="noteVerwijder(\''+n.id+'\')"><use href="#i-trash"/></svg></span></div>'+
    '<div class="nb">'+esc(n.body)+'</div></div>').join("")||'<div class="sm" style="color:#8b919b">'+(zoek?"Geen notities gevonden.":"Nog geen notities. Schrijf de eerste hierboven.")+'</div>';
}
function noteReset(){noteEditId=null;const t=document.getElementById("note-nieuw");if(t)t.value="";const b=document.getElementById("note-saveknop");if(b)b.textContent="Opslaan";}
async function noteOpslaan(){
  const tekst=(document.getElementById("note-nieuw").value||"").trim();
  if(!tekst){toast("Schrijf eerst een notitie");return;}
  let error;
  if(noteEditId)({error}=await db.from("notes").update({body:tekst}).eq("id",noteEditId));
  else ({error}=await db.from("notes").insert({athlete_id:calClient,company_id:ME.profile.company_id,author_id:ME.user.id,body:tekst}));
  if(error){toast(error.message||"Opslaan mislukt");return;}
  const wasEdit=!!noteEditId;
  noteReset();await notesLaad();notesRender();
  toast(wasEdit?"Notitie bijgewerkt":"Notitie opgeslagen, alleen zichtbaar voor coaches");
}
function noteBewerk(id){
  const n=notesLijst.find(x=>x.id===id);if(!n)return;
  noteEditId=id;
  document.getElementById("note-nieuw").value=n.body;
  document.getElementById("note-saveknop").textContent="Bijwerken";
  document.getElementById("note-nieuw").focus();
}
async function noteVerwijder(id){
  if(!confirm("Deze notitie verwijderen?"))return;
  const{error}=await db.from("notes").delete().eq("id",id);
  if(error){toast(error.message);return;}
  await notesLaad();notesRender();toast("Notitie verwijderd");
}
// ---------- CHECK-INS & CONSULTS (consult-logboek, coach-only; consults-tabel) ----------
// De check-in-kant (sporter vult periodiek iets in) komt met de sporter-app; hier nu
// alleen het consult-logboek: contactmomenten/gesprekken vastleggen.
let consultLijst=[],consultEditId=null;
const consultDatumNL=iso=>{if(!iso)return"";const d=new Date(iso+"T00:00:00");return d.getDate()+" "+MAANDVOL[d.getMonth()]+" "+d.getFullYear();};
async function consultLaad(){
  const{data}=await db.from("consults").select("*").eq("athlete_id",calClient).order("consult_date",{ascending:false});
  consultLijst=data||[];
}
async function openCheckin(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-checkin");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-checkin";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Check-ins &amp; consults</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  await consultLaad();
  sp.innerHTML='<div class="sp-head"><h3>Check-ins &amp; consults</h3><span class="sp-x" onclick="document.getElementById(\'sp-checkin\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div class="sp-info">Leg hier je contactmomenten met deze klant vast (consult, gesprek, telefoontje). De vragenlijst-check-ins die de sporter zelf invult, komen samen met de sporter-app.</div>'+
    '<div class="sp-field"><label>Datum</label><input type="date" id="consult-datum" style="color-scheme:dark"></div>'+
    '<div class="sp-field"><label>Notitie (wat is er besproken?)</label><textarea id="consult-notes" placeholder="Bijv. voortgangsgesprek: doelen bijgesteld, blessure besproken"></textarea></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:14px"><button class="sp-btn" style="width:auto;padding:9px 16px" id="consult-saveknop" onclick="consultOpslaan()">Opslaan</button><button class="sp-btn ghost" style="width:auto;padding:9px 16px" onclick="consultReset()">Annuleren</button></div>'+
    '<div class="sp-info">Alleen zichtbaar voor coaches. Nieuwste bovenaan.</div>'+
    '<div id="consult-lijst"></div>';
  document.getElementById("consult-datum").value=ymd(new Date());
  consultRender();
}
function consultRender(){
  const host=document.getElementById("consult-lijst");if(!host)return;
  host.innerHTML=consultLijst.map(c=>'<div class="sp-note"><div class="nh">'+esc(consultDatumNL(c.consult_date))+
    ' <span><svg class="i sm-i" style="cursor:pointer" onclick="consultBewerk(\''+c.id+'\')"><use href="#i-pen"/></svg><svg class="i sm-i" style="cursor:pointer" onclick="consultVerwijder(\''+c.id+'\')"><use href="#i-trash"/></svg></span></div>'+
    (c.notes?'<div class="nb">'+esc(c.notes)+'</div>':'')+'</div>').join("")||'<div class="sm" style="color:#8b919b">Nog geen consults vastgelegd. Voeg het eerste contactmoment toe.</div>';
}
function consultReset(){consultEditId=null;const d=document.getElementById("consult-datum"),n=document.getElementById("consult-notes"),b=document.getElementById("consult-saveknop");if(d)d.value=ymd(new Date());if(n)n.value="";if(b)b.textContent="Opslaan";}
async function consultOpslaan(){
  const datum=document.getElementById("consult-datum").value||null;
  const notes=(document.getElementById("consult-notes").value||"").trim();
  if(!datum){toast("Kies eerst een datum");return;}
  let error;
  if(consultEditId)({error}=await db.from("consults").update({consult_date:datum,notes:notes,updated_at:new Date().toISOString()}).eq("id",consultEditId));
  else ({error}=await db.from("consults").insert({athlete_id:calClient,company_id:ME.profile.company_id,author_id:ME.user.id,consult_date:datum,notes:notes}));
  if(error){toast(error.message||"Opslaan mislukt");return;}
  const wasEdit=!!consultEditId;
  consultReset();await consultLaad();consultRender();
  toast(wasEdit?"Consult bijgewerkt":"Consult vastgelegd, alleen zichtbaar voor coaches");
}
function consultBewerk(id){
  const c=consultLijst.find(x=>x.id===id);if(!c)return;
  consultEditId=id;
  document.getElementById("consult-datum").value=c.consult_date||"";
  document.getElementById("consult-notes").value=c.notes||"";
  document.getElementById("consult-saveknop").textContent="Bijwerken";
  document.getElementById("consult-notes").focus();
}
async function consultVerwijder(id){
  if(!confirm("Dit consult verwijderen?"))return;
  const{error}=await db.from("consults").delete().eq("id",id);
  if(error){toast(error.message);return;}
  await consultLaad();consultRender();toast("Consult verwijderd");
}
// ---------- PLANNING & PERIODISERING (coach-only; plans-tabel) ----------
let planLijst=[],planEditId=null;
const planDatumNL=iso=>{if(!iso)return"";const d=new Date(iso+"T00:00:00");return d.getDate()+" "+MAANDKORT[d.getMonth()]+" "+d.getFullYear();};
async function planLaad(){
  const{data}=await db.from("plans").select("*").eq("athlete_id",calClient).order("start_date",{ascending:false,nullsFirst:false});
  planLijst=data||[];
}
async function openPlan(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-plan");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-plan";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Planning &amp; periodisering</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  await planLaad();
  sp.innerHTML='<div class="sp-head"><h3>Planning &amp; periodisering</h3><span class="sp-x" onclick="document.getElementById(\'sp-plan\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div class="sp-field"><label>Startdatum</label><input type="date" id="plan-start" style="color-scheme:dark"></div>'+
    '<div class="sp-field"><label>Einddatum</label><input type="date" id="plan-eind" style="color-scheme:dark"></div>'+
    '<div class="sp-field"><label>Notitie / doel van dit blok</label><textarea id="plan-notes" placeholder="Bijv. 1 juli tot 1 november: doel is X"></textarea></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:14px"><button class="sp-btn" style="width:auto;padding:9px 16px" id="plan-saveknop" onclick="planOpslaan()">Opslaan</button><button class="sp-btn ghost" style="width:auto;padding:9px 16px" onclick="planReset()">Annuleren</button></div>'+
    '<div class="sp-info">Alleen zichtbaar voor coaches. Nieuwste blok bovenaan; oude blijven staan.</div>'+
    '<div id="plan-lijst"></div>';
  planRender();
}
function planRender(){
  const host=document.getElementById("plan-lijst");if(!host)return;
  host.innerHTML=planLijst.map(p=>{
    const periode=(planDatumNL(p.start_date)||"?")+" t/m "+(planDatumNL(p.end_date)||"?");
    return '<div class="sp-note"><div class="nh">'+esc(periode)+
      ' <span><svg class="i sm-i" style="cursor:pointer" onclick="planBewerk(\''+p.id+'\')"><use href="#i-pen"/></svg><svg class="i sm-i" style="cursor:pointer" onclick="planVerwijder(\''+p.id+'\')"><use href="#i-trash"/></svg></span></div>'+
      '<div class="nb">'+esc(p.notes||"")+'</div></div>';
  }).join("")||'<div class="sm" style="color:#8b919b">Nog geen plannen, voeg het eerste toe.</div>';
}
function planReset(){planEditId=null;const s=document.getElementById("plan-start"),e=document.getElementById("plan-eind"),n=document.getElementById("plan-notes"),b=document.getElementById("plan-saveknop");if(s)s.value="";if(e)e.value="";if(n)n.value="";if(b)b.textContent="Opslaan";}
async function planOpslaan(){
  const start=document.getElementById("plan-start").value||null;
  const eind=document.getElementById("plan-eind").value||null;
  const notes=(document.getElementById("plan-notes").value||"").trim();
  if(!notes&&!start){toast("Vul minimaal een startdatum of doel in");return;}
  if(start&&eind&&eind<start){toast("De einddatum ligt vóór de startdatum");return;}
  let error;
  if(planEditId)({error}=await db.from("plans").update({start_date:start,end_date:eind,notes:notes,updated_at:new Date().toISOString()}).eq("id",planEditId));
  else ({error}=await db.from("plans").insert({athlete_id:calClient,company_id:ME.profile.company_id,author_id:ME.user.id,start_date:start,end_date:eind,notes:notes}));
  if(error){toast(error.message||"Opslaan mislukt");return;}
  const wasEdit=!!planEditId;
  planReset();await planLaad();planRender();
  toast(wasEdit?"Plan bijgewerkt":"Plan opgeslagen, alleen zichtbaar voor coaches");
}
function planBewerk(id){
  const p=planLijst.find(x=>x.id===id);if(!p)return;
  planEditId=id;
  document.getElementById("plan-start").value=p.start_date||"";
  document.getElementById("plan-eind").value=p.end_date||"";
  document.getElementById("plan-notes").value=p.notes||"";
  document.getElementById("plan-saveknop").textContent="Bijwerken";
  document.getElementById("plan-notes").focus();
}
async function planVerwijder(id){
  if(!confirm("Dit plan verwijderen?"))return;
  const{error}=await db.from("plans").delete().eq("id",id);
  if(error){toast(error.message);return;}
  await planLaad();planRender();toast("Plan verwijderd");
}
// ---------- TRAININGSSCHEMA (zoals het ontwerp; client_info.data.schema) ----------
const SCHEMA_DAGEN=["Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
const SCHEMA_DELEN=["Ochtend","Middag","Avond"];
async function openSchema(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-schema");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-schema";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Trainingsschema</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  await ciLaad();
  const sch=ciData.schema||{};
  sp.innerHTML='<div class="sp-head"><h3>Trainingsschema</h3><span class="sp-x" onclick="document.getElementById(\'sp-schema\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div class="sm" style="color:#8b919b;margin-bottom:12px">Zo weet je wanneer dit lid kan trainen.</div>'+
    '<div id="schema-dagen">'+SCHEMA_DAGEN.map(dag=>{
      const aan=sch[dag]||[];
      return '<div class="sp-row">'+dag+'<div class="ampm">'+SCHEMA_DELEN.map(deel=>'<button class="'+(aan.includes(deel)?"on":"")+'" onclick="this.classList.toggle(\'on\')">'+deel+'</button>').join("")+'</div></div>';
    }).join("")+'</div>'+
    '<button class="sp-btn" style="margin-top:14px" onclick="schemaOpslaan()">Schema opslaan</button>';
}
async function schemaOpslaan(){
  const sch={};
  document.querySelectorAll("#schema-dagen .sp-row").forEach((rij,i)=>{
    const aan=[...rij.querySelectorAll(".ampm button")].filter(b=>b.classList.contains("on")).map(b=>b.textContent);
    if(aan.length)sch[SCHEMA_DAGEN[i]]=aan;
  });
  ciData.schema=sch;
  const err=await ciBewaar();
  if(err){toast(err.message||"Opslaan mislukt");return;}
  toast("Trainingsschema opgeslagen");
}
// ---------- PRIORITEITEN (zoals het ontwerp; client_info.data.prio) ----------
async function openPrio(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-prio");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-prio";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Prioriteiten</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  await ciLaad();
  sp.innerHTML='<div class="sp-head"><h3>Prioriteiten</h3><span class="sp-x" onclick="document.getElementById(\'sp-prio\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div class="sp-field"><input id="prio-nieuw" placeholder="Prioriteit toevoegen…" onkeydown="if(event.key===\'Enter\')prioOpslaan()"></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:16px"><button class="sp-btn" style="width:auto;padding:9px 16px" onclick="prioOpslaan()">Prioriteit opslaan</button><button class="sp-btn ghost" style="width:auto;padding:9px 16px" onclick="document.getElementById(\'prio-nieuw\').value=\'\'">Annuleren</button></div>'+
    '<div id="prio-lijst"></div>';
  prioRender();
}
function prioRender(){
  const host=document.getElementById("prio-lijst");if(!host)return;
  const lijst=ciData.prio||[];
  host.innerHTML=lijst.map((p,i)=>'<div class="sp-chip">'+esc(p)+' <span class="x" onclick="prioWeg('+i+')">✕</span></div>').join("")||'<div class="sm" style="color:#8b919b">Nog geen prioriteiten. Voeg de eerste toe.</div>';
}
async function prioOpslaan(){
  const inp=document.getElementById("prio-nieuw");
  const tekst=(inp.value||"").trim();
  if(!tekst){toast("Typ eerst een prioriteit");return;}
  ciData.prio=[tekst,...(ciData.prio||[])];
  const err=await ciBewaar();
  if(err){toast(err.message||"Opslaan mislukt");return;}
  inp.value="";prioRender();toast("Prioriteit opgeslagen");
}
async function prioWeg(i){
  (ciData.prio||[]).splice(i,1);
  const err=await ciBewaar();
  if(err){toast(err.message||"Opslaan mislukt");return;}
  prioRender();
}
// ---------- MATERIAAL (zoals het ontwerp; client_info.data.materiaal) ----------
let equipEditId=null;
async function openEquip(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-equip");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-equip";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Materiaallijsten</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  await ciLaad();
  sp.innerHTML='<div class="sp-head"><h3>Materiaallijsten</h3><span class="sp-x" onclick="document.getElementById(\'sp-equip\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<button class="sp-btn" style="margin-bottom:14px" onclick="equipForm()">+ Materiaal toevoegen</button>'+
    '<div id="equip-form" style="display:none">'+
    '<div class="sp-field"><label>Locatie</label><input id="eq-loc" placeholder="Bijv. gym, thuis, op reis…"></div>'+
    '<div class="sp-field"><label>Materiaal</label><textarea id="eq-items" placeholder="Materiaal, één per regel…" style="min-height:100px"></textarea></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:16px"><button class="sp-btn" style="width:auto;padding:9px 16px" onclick="equipOpslaan()">Materiaal opslaan</button><button class="sp-btn ghost" style="width:auto;padding:9px 16px" onclick="equipFormSluit()">Annuleren</button></div></div>'+
    '<div id="equip-lijst"></div>';
  equipRender();
}
function equipRender(){
  const host=document.getElementById("equip-lijst");if(!host)return;
  const lijst=ciData.materiaal||[];
  host.innerHTML=lijst.map(e=>'<div class="sp-dark">'+esc(e.loc)+' <svg class="i sm-i" onclick="equipBewerk(\''+e.id+'\')"><use href="#i-gear"/></svg></div><div class="sp-list">'+esc(e.items||"").replace(/\n/g,"<br>")+'</div>').join("")||'<div class="sm" style="color:#8b919b">Nog geen materiaallijsten. Voeg de eerste toe.</div>';
}
function equipForm(){
  equipEditId=null;
  document.getElementById("eq-loc").value="";
  document.getElementById("eq-items").value="";
  document.getElementById("equip-form").style.display="";
  document.getElementById("eq-loc").focus();
}
function equipFormSluit(){equipEditId=null;const f=document.getElementById("equip-form");if(f)f.style.display="none";}
function equipBewerk(id){
  const e=(ciData.materiaal||[]).find(x=>String(x.id)===String(id));if(!e)return;
  equipEditId=e.id;
  document.getElementById("eq-loc").value=e.loc;
  document.getElementById("eq-items").value=e.items||"";
  document.getElementById("equip-form").style.display="";
}
async function equipOpslaan(){
  const loc=document.getElementById("eq-loc").value.trim();
  const items=document.getElementById("eq-items").value.trim();
  if(!loc){toast("Vul eerst een locatie in (bijv. gym, thuis, op reis)");return;}
  ciData.materiaal=ciData.materiaal||[];
  if(equipEditId){ciData.materiaal.forEach(e=>{if(String(e.id)===String(equipEditId)){e.loc=loc;e.items=items;}});}
  else ciData.materiaal.unshift({id:crypto.randomUUID(),loc,items});
  const err=await ciBewaar();
  if(err){toast(err.message||"Opslaan mislukt");return;}
  equipFormSluit();equipRender();toast("Materiaallijst opgeslagen");
}
// ---------- PROFIEL (volledige pagina in cmain, zoals CoachRx) ----------
const GENDEROPTS=[["man","Man"],["vrouw","Vrouw"],["anders","Anders"]];
function leeftijdVan(bd){
  if(!bd)return null;
  const d=new Date(bd+"T00:00:00"),t=new Date();
  let age=t.getFullYear()-d.getFullYear();
  const m=t.getMonth()-d.getMonth();
  if(m<0||(m===0&&t.getDate()<d.getDate()))age--;
  return age>=0?age:null;
}
function profielRegel(p){
  const parts=[];
  const lft=leeftijdVan(p.birth_date);
  if(lft!=null)parts.push(lft+" jaar");
  if(p.weight_kg)parts.push(p.weight_kg+" kg");
  if(p.height_cm)parts.push(p.height_cm+" cm");
  return parts.join(" · ");
}
function renderProfielPagina(){
  const cm=document.getElementById("cmain");if(!cm)return;
  const p=coachClients.find(x=>x.id===calClient);if(!p)return;
  const naam=naamVan(p);
  cm.innerHTML='<div class="pfwrap">'+
    '<div class="pfav" style="'+avStijl(naam)+'">'+esc(naam.slice(0,2).toUpperCase())+'</div>'+
    '<div style="text-align:center;margin-bottom:6px"><button class="btn ghost sm" onclick="toast(\'Profielfoto uploaden komt in een volgende stap\')">Kies een afbeelding</button></div>'+
    '<div style="text-align:center;font-weight:800;font-size:16px;margin-bottom:20px" id="pf-naam-label">'+esc(naam)+'</div>'+
    '<div class="pfgrid">'+
      '<div class="field"><label>Voornaam *</label><input id="pf-voornaam" value="'+esc(p.first_name||"")+'"></div>'+
      '<div class="field"><label>Achternaam *</label><input id="pf-achternaam" value="'+esc(p.last_name||"")+'"></div>'+
      '<div class="field"><label>E-mail</label><input value="'+esc(p.email||"")+'" readonly style="opacity:.6;cursor:default"></div>'+
      '<div class="field"><label>Geslacht</label><select id="pf-geslacht"><option value="">–</option>'+GENDEROPTS.map(g=>'<option value="'+g[0]+'"'+(p.gender===g[0]?" selected":"")+'>'+g[1]+'</option>').join("")+'</select></div>'+
      '<div class="field"><label>Lengte (cm)</label><input type="number" id="pf-lengte" value="'+esc(p.height_cm||"")+'" min="1" max="259"></div>'+
      '<div class="field"><label>Gewicht (kg)</label><input type="number" id="pf-gewicht" value="'+esc(p.weight_kg||"")+'" min="1" max="399" step="0.1"></div>'+
      '<div class="field"><label>Eenheden</label><input value="Metrisch" readonly style="opacity:.6;cursor:default"></div>'+
      '<div class="field"><label>Geboortedatum</label><input type="date" id="pf-geboortedatum" value="'+esc(p.birth_date||"")+'" min="1926-01-01" max="'+ymd(new Date())+'"></div>'+
      '<div class="field"><label>Noodcontact</label><input id="pf-noodcontact" value="'+esc(p.emergency_contact||"")+'" placeholder="Naam en/of telefoonnummer"></div>'+
    '</div>'+
    '<div class="field" style="margin-top:2px"><label>Notitie</label><textarea id="pf-notitie" placeholder="Vrije notitie…">'+esc(p.profile_note||"")+'</textarea></div>'+
    '<div class="mfoot" style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--line);padding-top:16px;margin-top:6px">'+
      '<button class="btn ghost" onclick="renderClient(\'kalender\')">Annuleren</button>'+
      '<button class="btn" onclick="profielOpslaan()">Profiel opslaan</button>'+
    '</div>'+
  '</div>';
}
async function profielOpslaan(){
  const voornaam=document.getElementById("pf-voornaam").value.trim();
  const achternaam=document.getElementById("pf-achternaam").value.trim();
  if(!voornaam||!achternaam){toast("Voornaam en achternaam zijn verplicht");return;}
  const lengteRaw=document.getElementById("pf-lengte").value.trim();
  const gewichtRaw=document.getElementById("pf-gewicht").value.trim();
  const upd={
    first_name:voornaam,
    last_name:achternaam,
    gender:document.getElementById("pf-geslacht").value||null,
    birth_date:document.getElementById("pf-geboortedatum").value||null,
    height_cm:lengteRaw?Number(lengteRaw):null,
    weight_kg:gewichtRaw?Number(gewichtRaw):null,
    emergency_contact:document.getElementById("pf-noodcontact").value.trim()||null,
    profile_note:document.getElementById("pf-notitie").value.trim()||null
  };
  const{data,error}=await db.from("profiles").update(upd).eq("id",calClient).select().single();
  if(error){toast(error.message||"Opslaan mislukt");return;}
  const p=coachClients.find(x=>x.id===calClient);
  if(p)Object.assign(p,data);
  profielHeaderVerversen(p);
  const naam=naamVan(p);
  const lbl=document.getElementById("pf-naam-label");if(lbl)lbl.textContent=naam;
  const av=document.querySelector(".pfwrap .pfav");
  if(av){av.textContent=esc(naam.slice(0,2).toUpperCase());av.setAttribute("style",avStijl(naam));}
  toast("Profiel opgeslagen");
}
function profielHeaderVerversen(p){
  if(!p)return;
  const naam=naamVan(p);
  const cnm=document.getElementById("cs-cnm");if(cnm)cnm.textContent=naam;
  const av=document.querySelector(".cside .bigav");
  if(av){av.textContent=esc(naam.slice(0,2).toUpperCase());av.setAttribute("style",avStijl(naam));av.title=naam;}
  const pr=document.getElementById("cs-profielregel");
  if(pr){const regel=profielRegel(p);pr.style.display=regel?"":"none";pr.innerHTML=regel?esc(regel)+"<br>":"";}
  const em=document.getElementById("cs-email");if(em)em.textContent=p.email||"";
}
