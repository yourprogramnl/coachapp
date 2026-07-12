// app/panelen.js — de zijpanelen van het klant-scherm:
// Assessment, Metrics & 1RM, Doelen, Notities & documenten, Trainingsschema,
// Prioriteiten, Materiaal en de Profiel-pagina. Plus de zijbalk in-/uitklappen.
// ---------- ASSESSMENT (OPEX Body / Move / Work), zoals het ontwerp ----------
const ASS_MOVE=[
  ["scratch","Scratch Test","Hoe uit te voeren:\nBreng één arm boven het hoofd en reik achter de nek naar je bovenrug, terwijl de andere arm van onderen omhoog komt. Beide met gesloten vuist (haakgreep).\n\nLet op:\nSymmetrie links-rechts\nBovenarm kan in lijn met de romp blijven zonder in te zakken in de core\nStrategieën om het bewegingsbereik te halen (romp en nek)\nOnvermogen om het schouderblad in te trekken\nOnvermogen in schouder-extensie bij het overhead gaan\nVerkeerde uitlijning van de wervelkolom\nVoer minstens 3 herhalingen uit"],
  ["airsquat","Air Squat","Hoe uit te voeren:\nKies een voetstand die comfortabel voelt.\nArmen boven het hoofd in een \"Y\"-positie, naar buiten gedraaid (extern geroteerd).\nZak met je zwaartepunt naar de vloer terwijl je zo rechtop mogelijk blijft.\nVoer minstens 3 herhalingen uit.\n\nLet op:\nRomp- en lage-rug-extensie vastgehouden\nSymmetrie van links naar rechts\nHeupverschuiving (hip shift)\nUitlijning van de heupen\nVoeten plat\nHanden komen vóór de voeten"],
  ["toetouch","Toe Touch Test","Hoe uit te voeren:\nMet de voeten tegen elkaar en de knieën op slot zo ver mogelijk voorover buigen, zonder dat er buiging in de knie ontstaat.\n\nLet op:\nGewicht verschuift naar de hielen zonder dat de voeten bewegen\nNormale kromming van de wervelkolom\nBenen blijven de hele tijd gestrekt\nSymmetrie van links naar rechts\nZorg dat de nek meebuigt met de rug\nVermogen om de tenen te bereiken"],
  ["lunge","Lunge Test","Hoe uit te voeren:\nZittend op de grond, plak een stukje tape bij de enkel en een tweede bij de trochanter major (heupbeen).\nSta met de tenen achter de (trochanter-)lijn en stap naar voren om de hiel vóór de lijn te plaatsen, armen in een \"genie\"-positie.\nLet op: de benen staan op heupbreedte, niet op één lijn.\nZak tot de achterste knie de vloer raakt en kom dan terug naar de startpositie.\nVoer minstens 3 herhalingen per been uit.\n\nLet op:\nSymmetrie links-rechts\nKnie volgt een neutrale lijn\nRomp blijft hoog in de excentrische en concentrische fase\nStabiliteit, balans en controle\nBekken blijft per zijde in lijn en beweegt per herhaling naar voren\nVoorste voet is plat, op de tenen bij de achterste voet"],
  ["slr","Straight Leg Raise Test","Hoe uit te voeren:\nLig op je rug, armen langs het lichaam met de handpalmen omhoog. Hef één been zo hoog mogelijk zonder de knie te buigen, terwijl het andere been op de vloer blijft en de tenen omhoog getrokken zijn (dorsiflexie).\nVoer de beweging minstens drie keer uit, aan beide kanten.\n\nLet op:\nSymmetrie links-rechts\nVoeten blijven de hele tijd in dorsiflexie\nHiel komt voorbij de knie"],
  ["pushup","Push-up","Strikte push-up vanaf de grond. Beoordeel als pass of fail."]
];
const ASS_TIJD=[
  ["frontplank","Front Plank/Front Leaning Rest","Hoe uit te voeren:\nBegin in een vierpunts-kniestand (handen onder de schouders, knieën onder de heupen) en strek beide benen één voor één, steunend op je tenen.\nSpan je romp aan, hoofd neutraal.\nStart de timer.\n\nLet op:\nProtractie behouden in de bovenrug\nSymmetrie links-rechts\nAanspanning de hele tijd behouden\nVermogen om 60 seconden een goede positie vast te houden"],
  ["reverseplank","Reverse Plank","Hoe uit te voeren:\nZit met je benen gestrekt, hielen op de grond en handen recht onder of iets achter je schouders, vingers wijzen naar achteren. Druk je hielen en handpalmen in de grond en breng je heupen omhoog richting het plafond, tot je lichaam een rechte lijn vormt van je enkels tot je schouders.\nStart de timer.\n\nLet op:\nRetractie behouden in de bovenrug\nSymmetrie links-rechts\nVermogen om schouder-extensie vast te houden\nRechte lijn van enkels tot schouders\nVermogen om 60 seconden een goede positie vast te houden"],
  ["sideplank_r","Side Plank Right","Hoe uit te voeren:\nLig op je zij met de onderarm plat op de vloer, de onderste elleboog recht onder de schouder en beide benen gestrekt in één lange lijn.\nBegin met de niet-dominante arm onder.\nMet de voeten op elkaar gestapeld en het hoofd neutraal, til je je heupen van de vloer en vorm je een rechte lijn van hoofd tot voeten.\nStart de timer.\n\nLet op:\nHoud een rechte lijn van hoofd tot voeten\nVermogen om 90 seconden per kant een goede positie vast te houden\nSymmetrie links-rechts"],
  ["sideplank_l","Side Plank Left","Hoe uit te voeren:\nLig op je zij met de onderarm plat op de vloer, de onderste elleboog recht onder de schouder en beide benen gestrekt in één lange lijn.\nBegin met de niet-dominante arm onder.\nMet de voeten op elkaar gestapeld en het hoofd neutraal, til je je heupen van de vloer en vorm je een rechte lijn van hoofd tot voeten.\nStart de timer.\n\nLet op:\nHoud een rechte lijn van hoofd tot voeten\nVermogen om 90 seconden per kant een goede positie vast te houden\nSymmetrie links-rechts"]
];
// OPEX Body-uitleg (bij de vraagtekens op het eerste tabblad)
const ASS_TIP_VET="Man 10-20%, vrouw 18-28%.\nDit zijn ranges die aangeven dat een man of vrouw gezond is. Het zijn geen indicatoren van een geoptimaliseerde lichaamssamenstelling en komen niet altijd overeen met de ideale lichaamssamenstelling van je klant. Bespreek met je klanten het verschil tussen gezondheid en geoptimaliseerde esthetiek.";
const ASS_TIP_SHAPE="Om te bepalen welke \"shape\" je klant heeft, kijk je naar het onderdeel Muscle Fat Analysis op de InBody-uitdraai. Het is de vorm die de 3 balken samen maken (C, I of D).";
let assData={},assLijst=[],assHuidigId=null,assDatum="",assTabIdx=0;
const assDatumNL=iso=>{if(!iso)return"";const d=new Date(iso+"T00:00:00");return d.getDate()+" "+MAANDVOL[d.getMonth()]+" "+d.getFullYear();};
// Hover-uitleg bij de assessment-vraagtekens (vast gepositioneerd → niet geknipt door de zijbalk).
let assTipEl=null;
function assTipToon(el){
  const txt=el.getAttribute("data-tip");if(!txt)return;
  if(!assTipEl){assTipEl=document.createElement("div");assTipEl.id="asstip";document.body.appendChild(assTipEl);}
  assTipEl.textContent=txt;assTipEl.classList.add("show");
  const r=el.getBoundingClientRect(),tw=assTipEl.offsetWidth,th=assTipEl.offsetHeight;
  let left=r.right+10;if(left+tw>window.innerWidth-8)left=r.left-tw-10;if(left<8)left=8;
  let top=r.top+r.height/2-th/2;if(top<8)top=8;if(top+th>window.innerHeight-8)top=window.innerHeight-th-8;
  assTipEl.style.left=left+"px";assTipEl.style.top=top+"px";
}
function assTipWeg(){if(assTipEl)assTipEl.classList.remove("show");}
document.addEventListener("mouseover",e=>{const h=e.target.closest&&e.target.closest(".ass-help");if(h)assTipToon(h);});
document.addEventListener("mouseout",e=>{const h=e.target.closest&&e.target.closest(".ass-help");if(h)assTipWeg();});
async function assLaad(){
  const{data}=await db.from("assessments").select("*").eq("athlete_id",calClient).order("assessed_on",{ascending:false});
  assLijst=data||[];
}
// Open de nieuwste meting, of een lege nieuwe als er nog geen is.
function assZetHuidig(row){
  if(row){assHuidigId=row.id;assData=JSON.parse(JSON.stringify(row.data||{}));assDatum=row.assessed_on;}
  else{assHuidigId=null;assData={};assDatum=ymd(new Date());}
}
async function openAssess(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-assess");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-assess";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Assessment</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  await assLaad();
  assTabIdx=0;
  assZetHuidig(assLijst[0]||null);
  assTeken();
}
// Herteken het paneel op basis van de huidige state en herstel het actieve tabblad.
function assTeken(){
  const sp=document.getElementById("sp-assess");if(!sp)return;
  sp.innerHTML=assHtml(assData);
  assTab(assTabIdx);
}
// Wissel naar een eerdere meting.
function assKies(id){
  const row=assLijst.find(a=>a.id===id);if(!row)return;
  assZetHuidig(row);assTeken();
}
// Start een nieuwe meting, vooringevuld met de waarden van de meest recente.
function assNieuw(){
  assData=assLijst[0]?JSON.parse(JSON.stringify(assLijst[0].data||{})):{};
  assHuidigId=null;assDatum=ymd(new Date());assTeken();
}
async function assVerwijder(){
  if(!assHuidigId){toast("Deze meting is nog niet opgeslagen");return;}
  if(!confirm("Deze meting verwijderen?"))return;
  const{error}=await db.from("assessments").delete().eq("id",assHuidigId);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  await assLaad();assZetHuidig(assLijst[0]||null);assTeken();
  toast("Meting verwijderd");
}
function assVal(pad,std){const d=pad.split(".").reduce((o,k)=>o&&o[k]!=null?o[k]:null,assData);return d==null?(std||""):d;}
function assVeldRij(n,v){return '<div class="sp-field ass-extra" style="display:flex;gap:6px"><input class="xn" placeholder="Naam veld" value="'+esc(n||"")+'" style="flex:1"><input class="xv" placeholder="Waarde" value="'+esc(v||"")+'" style="flex:1"></div>';}
function assHtml(d){
  d=d||{};const b=d.body||{},mv=d.move||{},wk=d.work||{};
  const veld=(lbl,id,val,tip)=>'<div class="sp-field"><label>'+lbl+(tip?' <span class="ass-help" data-tip="'+esc(tip)+'">?</span>':'')+'</label><input id="'+id+'" value="'+esc(val==null?"":val)+'"></div>';
  const extraHtml=lijst=>(lijst||[]).map(x=>assVeldRij(x.n,x.v)).join("");
  const moveTests=ASS_MOVE.map(t=>{
    const cur=mv[t[0]]||"",nt=mv[t[0]+"_n"]||"";
    return '<div class="sp-field"><label>'+t[1]+' <span class="ass-help" data-tip="'+esc(t[2])+'">?</span></label>'+
      '<div class="ass-pf"><label><input type="radio" name="mv-'+t[0]+'" value="pass"'+(cur==="pass"?" checked":"")+'> Pass</label><label><input type="radio" name="mv-'+t[0]+'" value="fail"'+(cur==="fail"?" checked":"")+'> Fail</label></div>'+
      '<span class="ass-noteslink" onclick="assNotes(this)">'+(nt?"Notities bewerken":"Notitie toevoegen")+'</span>'+
      '<textarea class="ass-notes" data-k="'+t[0]+'" style="'+(nt?"":"display:none")+'">'+esc(nt)+'</textarea></div>';
  }).join("");
  const tijden=ASS_TIJD.map(t=>'<div class="sp-field"><label>'+t[1]+' <span class="ass-help" data-tip="'+esc(t[2])+'">?</span></label><input id="as-'+t[0]+'" placeholder="0:00" value="'+esc(mv[t[0]]||"")+'"></div>').join("");
  // Geschiedenisbalk: kies een eerdere meting of start een nieuwe
  const histOpts=assLijst.map(a=>'<option value="'+a.id+'"'+(a.id===assHuidigId?" selected":"")+'>'+esc(assDatumNL(a.assessed_on))+'</option>').join("");
  const histRij=assLijst.length?'<div class="sp-field"><label>Meting</label><div style="display:flex;gap:6px;align-items:center">'+
    '<select id="ass-history" onchange="assKies(this.value)" style="flex:1;min-width:0">'+(assHuidigId?"":'<option value="" selected>Nieuwe meting</option>')+histOpts+'</select>'+
    '<button class="sp-btn ghost" style="width:auto;padding:8px 12px;white-space:nowrap" onclick="assNieuw()">+ Nieuw</button></div></div>':'';
  const datumVeld='<div class="sp-field"><label>Datum meting</label><input type="date" id="as-datum" value="'+esc(assDatum||"")+'" style="color-scheme:dark"></div>';
  const saveLabel=assHuidigId?"Wijzigingen opslaan":"Meting opslaan";
  const delBtn=assHuidigId?'<button class="sp-btn ghost" onclick="assVerwijder()">Verwijderen</button>':"";
  return '<div class="sp-head"><h3>Assessment</h3><span class="sp-x" onclick="document.getElementById(\'sp-assess\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    histRij+datumVeld+
    '<div class="sp-tabs"><button class="on" id="ass-t0" onclick="assTab(0)">OPEX Body</button><button id="ass-t1" onclick="assTab(1)">OPEX Move</button><button id="ass-t2" onclick="assTab(2)">OPEX Work</button></div>'+
    '<div id="ass-0">'+
      veld("Lichaamsgewicht","as-gewicht",b.gewicht)+
      veld("Vetpercentage","as-vet",b.vet,ASS_TIP_VET)+
      veld("Skeletspiermassa","as-spier",b.spier)+
      veld("Basaal metabolisme","as-metab",b.metab)+
      '<div class="sp-field"><label>Muscle fat-analyse <span class="ass-help" data-tip="'+esc(ASS_TIP_SHAPE)+'">?</span></label><select id="as-shape">'+["","C-shape","D-shape","I-shape"].map(s=>'<option'+(b.shape===s?" selected":"")+'>'+s+'</option>').join("")+'</select></div>'+
      '<div class="sp-field"><label>Notities OPEX Body</label><textarea id="as-bodynotes">'+esc(b.notes||"")+'</textarea></div>'+
      '<div id="ass-extra-0">'+extraHtml(b.extra)+'</div>'+
    '</div>'+
    '<div id="ass-1" style="display:none">'+moveTests+tijden+
      '<div class="sp-field"><label>OPEX Move Notes</label><textarea id="as-movenotes">'+esc(mv.notes||"")+'</textarea></div>'+
      '<div id="ass-extra-1">'+extraHtml(mv.extra)+'</div>'+
    '</div>'+
    '<div id="ass-2" style="display:none">'+
      veld("Airbike 10 min cals","as-cals",wk.cals)+
      veld("Airbike weight conversion","as-conv",wk.conv)+
      '<div class="sp-field"><label>OPEX Work Notes</label><textarea id="as-worknotes">'+esc(wk.notes||"")+'</textarea></div>'+
      '<div id="ass-extra-2">'+extraHtml(wk.extra)+'</div>'+
    '</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="sp-btn" onclick="assOpslaan()">'+saveLabel+'</button>'+delBtn+'<button class="sp-btn ghost" onclick="toast(\'Exporteren komt in een volgende stap\')">Exporteer als PDF</button></div>'+
    '<div class="sp-info" id="ass-msg" style="margin-top:10px"></div>';
}
function assTab(i){assTabIdx=i;[0,1,2].forEach(x=>{document.getElementById("ass-"+x).style.display=x===i?"":"none";document.getElementById("ass-t"+x).classList.toggle("on",x===i);});}
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
  const datum=(document.getElementById("as-datum")||{}).value||ymd(new Date());
  const wasNieuw=!assHuidigId;
  let error,savedId=assHuidigId;
  if(assHuidigId){
    ({error}=await db.from("assessments").update({data:doc,assessed_on:datum,updated_by:ME.user.id}).eq("id",assHuidigId));
  }else{
    const{data:ins,error:e2}=await db.from("assessments").insert({athlete_id:calClient,company_id:ME.profile.company_id,data:doc,assessed_on:datum,updated_by:ME.user.id}).select().single();
    error=e2;if(ins)savedId=ins.id;
  }
  const msg=document.getElementById("ass-msg");
  if(error){if(msg)msg.textContent=error.message||"Opslaan mislukt";return;}
  await assLaad();
  assZetHuidig(assLijst.find(a=>a.id===savedId)||assLijst[0]||null);
  assTeken();
  toast(wasNieuw?"Meting opgeslagen":"Meting bijgewerkt");
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
// Detailscherm-state + koppeling naar Assessment (zodat je deze waarden maar op één plek invult).
// [sectie, veld] verwijst naar assessments.data[sectie][veld] (body = OPEX Body, move = OPEX Move).
let mxDetailNaam=null,mxDetailForm=false,mxAss=[];
const MX_ASS_VELD={
  "Weight":["body","gewicht"],"Bodyfat Percentage":["body","vet"],"Skeletal Muscle Mass":["body","spier"],"Basal Metabolic Rate":["body","metab"],
  "Air Squat":["move","airsquat"],"Front Leaning Rest":["move","frontplank"],"Reverse Plank":["move","reverseplank"],"Side Plank Left":["move","sideplank_l"],"Side Plank Right":["move","sideplank_r"],"Push-up":["move","pushup"],
  "10 minute AirBike":["work","cals"],"AirBike Weight Conversion":["work","conv"]
};
// Vaste videokoppeling voor oefeningen die niet automatisch op naam te vinden zijn.
const MX_VIDEO_OVERRIDE={
  "CGBP 1RM":"jU6EA4j5r2A","DB Prone Row 6RM":"Sm8O4hjJr9M","Seated DB OH Press 6RM":"RgkzQ008m3I",
  "Strict Pullup":"jgFel4wZl3I","RFESS":"8kvZmrlOo2M","Unloaded RFESS":"3fxmRoIE_fk"
};
// Testbeschrijving bij het vraagteken op Advanced-metrics (zelfde tooltip als bij OPEX Body).
// De werkregels (A. 15 WB, 20/14# ...) laten we in de CoachRx-notatie staan; coaches kennen die zo.
const MX_TIP_CV="In deze test voert de klant het onderstaande werk zo snel mogelijk per set uit. Constant Variance onderzoekt de herhaalbaarheid van dynamische, matig tot laag belaste contracties, via spieruithoudingsvermogen en aanpassing aan taakvariatie. De onderdelen weerspiegelen matige tot lagere belastingen en aeroob werk op hogere snelheid.";
const MX_TIP={
  "Constant Variance (Set 1: A,B,C,D,E,F)":MX_TIP_CV+"\n\nSet 1 (A,B,C,D,E,F):\nA. 15 WB, 20/14#, 10/9'\nB. 15 KBS, 53/35#\nC. 15 BJSD, 24/20'\nD. 15 HPS, 75/55#\nE. 15 Burpees w/ oh clap\nF. 60 DUs",
  "Constant Variance (Set 2: D,E,F,C,B,A)":MX_TIP_CV+"\n\nSet 2 (D,E,F,C,B,A):\nD. 15 HPS, 75/55#\nE. 15 Burpees w/ oh clap\nF. 60 DUs\nC. 15 BJSD, 24/20'\nB. 15 KBS, 53/35#\nA. 15 WB, 20/14#, 10/9'",
  "Constant Variance (Set 3: B,D,E,A,F,C)":MX_TIP_CV+"\n\nSet 3 (B,D,E,A,F,C):\nB. 15 KBS, 53/35#\nD. 15 HPS, 75/55#\nE. 15 Burpees w/ oh clap\nA. 15 WB, 20/14#, 10/9'\nF. 60 DUs\nC. 15 BJSD, 24/20'",
  "Constant Variance (Set 4: F,A,D,E,C,B)":MX_TIP_CV+"\n\nSet 4 (F,A,D,E,C,B):\nF. 60 DUs\nA. 15 WB, 20/14#, 10/9'\nD. 15 HPS, 75/55#\nE. 15 Burpees w/ oh clap\nC. 15 BJSD, 24/20'\nB. 15 KBS, 53/35#",
  "Constant Variance (Set 5: C,F,B,D,A,E)":MX_TIP_CV+"\n\nSet 5 (C,F,B,D,A,E):\nC. 15 BJSD, 24/20'\nF. 60 DUs\nB. 15 KBS, 53/35#\nD. 15 HPS, 75/55#\nA. 15 WB, 20/14#, 10/9'\nE. 15 Burpees w/ oh clap"
};
async function mxLaad(){
  const{data}=await db.from("metrics").select("*").eq("athlete_id",calClient).order("measured_at");
  mxData=data||[];
  const{data:ass}=await db.from("assessments").select("*").eq("athlete_id",calClient).order("assessed_on");
  mxAss=ass||[];
}
// Metingen van een aan Assessment gekoppelde metric: [{v,d}] uit de assessments (oplopend op datum).
function mxAssPunten(naam){
  const veld=MX_ASS_VELD[naam];if(!veld)return null;
  return (mxAss||[]).map(a=>({v:((a.data&&a.data[veld[0]])||{})[veld[1]],d:a.assessed_on})).filter(p=>p.v!=null&&p.v!=="");
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
// Invoertype per metric bij het toevoegen van een resultaat.
// Standaard: Resistance = kg (getal); overige blokken/eigen metrics = vrije eenheid.
// Waarden: "time", "passfail", of een vaste eenheid (kg/m/cal/...). Resistance zonder eigen type = kg.
// Vaste afstand = tijd-resultaat (5k/2k/500m Row, 3K running). Vaste tijd = afstand-resultaat
// (60min/60 sec Row = meter, 30/30 Row = meter per interval, airbike = cal).
// 90min AMRAP en Row/Burpee bewust niet: die houden het keuzemenu.
const MX_TYPE={
  "Sorenson Hold":"time","Strict Dip":"passfail","Unloaded RFESS":"passfail",
  "5k Row":"time","2k Row":"time","500m Row":"time","3K running":"time",
  "60min Row":"m","60 sec Row":"m",
  "30/30 Row (Row 1)":"m","30/30 Row (Row 2)":"m","30/30 Row (Row 3)":"m","30/30 Row (Row 4)":"m",
  "60 sec AirBike":"cal",
  // Constant Variance: elke set zo snel mogelijk = tijd-resultaat.
  "Constant Variance (Set 1: A,B,C,D,E,F)":"time","Constant Variance (Set 2: D,E,F,C,B,A)":"time",
  "Constant Variance (Set 3: B,D,E,A,F,C)":"time","Constant Variance (Set 4: F,A,D,E,C,B)":"time",
  "Constant Variance (Set 5: C,F,B,D,A,E)":"time"
};
function mxType(naam){
  if(MX_TYPE[naam])return MX_TYPE[naam];
  if((METRICS_DEF["Resistance"]||[]).includes(naam))return "kg";
  return "vrij";
}
const mxSecNaarTijd=sec=>{sec=Math.round(sec||0);return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0");};
const mxTijdNaarSec=str=>{const p=String(str||"").trim().split(":").map(x=>parseInt(x,10)||0);if(p.length===3)return p[0]*3600+p[1]*60+p[2];if(p.length===2)return p[0]*60+p[1];return p[0];};
// Weergave van een gelogde metrics-rij op basis van het type
function mxFmtRij(m,naam){
  const t=mxType(naam);
  if(t==="passfail")return m.value_text||"";
  if(t==="time")return mxSecNaarTijd(m.value);
  return (m.value!=null?String(m.value):"")+(m.unit?" "+m.unit:"");
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
        let curTxt="—",pm="–",pmKl="#8b919b";
        if(MX_ASS_VELD[naam]){
          // Waarde komt uit Assessment (niet dubbel invoeren)
          const pts=mxAssPunten(naam);
          if(pts&&pts.length)curTxt=esc(String(pts[pts.length-1].v));
        }else{
          const w=mxWaarde(naam),t=mxType(naam);
          if(w){curTxt=esc(mxFmtRij(w.cur,naam));
            // +/- alleen voor getalswaarden (kg/vrij), niet voor pass/fail of tijd
            if((t==="kg"||t==="vrij")&&w.vorig&&w.cur.value!=null&&w.vorig.value!=null&&w.cur.value!==w.vorig.value){
              const d=Math.round((w.cur.value-w.vorig.value)*10)/10;
              pm=(d>0?"▲ +":"▼ ")+d;pmKl=d>0?"#27b376":"#e5484d";
            }
          }
        }
        const nEsc=naam.replace(/'/g,"\\'");
        // Camera met demo-video alleen bij Resistance (bewegingen); de andere blokken hebben geen video.
        const cam=(g==="Resistance")?'<span class="mxcam" title="Demo-video" onclick="mxVid(event,\''+nEsc+'\')"><svg class="i sm-i"><use href="#i-cam"/></svg></span>':'';
        // Vraagteken met testbeschrijving (hover), net als bij OPEX Body. Klik niet doorlaten naar de rij.
        const tip=MX_TIP[naam]?' <span class="ass-help" data-tip="'+esc(MX_TIP[naam])+'" onclick="event.stopPropagation()">?</span>':'';
        html+='<div class="mx-row" onclick="mxOpenDetail(\''+nEsc+'\')"><div class="mx-naam">'+esc(naam)+tip+cam+'</div><div class="mx-cur">'+curTxt+'</div><div class="mx-pm" style="color:'+pmKl+'">'+pm+'</div></div>';
      });
    }
  }
  host.innerHTML=html;
}
// Zoek een demo-video uit de bibliotheek (oefeningen) bij een metric-naam.
// Namen als "Back Squat 1RM" of "Goblet Squat 20RM" matchen op de basisnaam.
function metricNorm(s){return String(s||"").toLowerCase().replace(/\d+\s*rm\b/g,"").replace(/\([^)]*\)/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
function metricVideo(naam){
  if(MX_VIDEO_OVERRIDE[naam])return{youtube_id:MX_VIDEO_OVERRIDE[naam]};
  if(typeof LIB==="undefined"||!LIB||!LIB.oef||!LIB.oef.length)return null;
  const base=metricNorm(naam);if(!base)return null;
  let hit=LIB.oef.find(o=>metricNorm(o.naam)===base);
  if(!hit)hit=LIB.oef.find(o=>{const n=metricNorm(o.naam);return n&&(n.startsWith(base)||base.startsWith(n));});
  if(!hit)hit=LIB.oef.find(o=>{const n=metricNorm(o.naam);return n&&n.length>3&&(base.includes(n)||n.includes(base));});
  return hit||null;
}
// Videopopover bij het camera-icoon (vast gepositioneerd → niet geknipt door de zijbalk).
function mxVid(ev,naam){
  ev.stopPropagation();
  const o=metricVideo(naam),yt=o&&o.youtube_id?o.youtube_id:"";
  let pop=document.getElementById("mxvid");
  if(!pop){pop=document.createElement("div");pop.id="mxvid";pop.className="vidpop";pop.style.position="fixed";document.body.appendChild(pop);}
  pop.innerHTML='<span class="vp-x" onclick="event.stopPropagation();document.getElementById(\'mxvid\').classList.remove(\'show\')">✕</span><div class="vt">'+esc(naam)+'</div><div class="vprev">'+
    (yt?'<div onclick="event.stopPropagation();speelAf(this,\''+esc(yt)+'\')" style="width:100%;height:100%;position:relative;cursor:pointer"><img src="https://i.ytimg.com/vi/'+esc(yt)+'/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover;display:block" alt=""><span class="pbtn"></span></div>'
      :(o&&o.video_url?'<div class="vlabel">Video: <a href="'+esc(o.video_url)+'" target="_blank" rel="noopener" style="color:#fff">open in nieuw tabblad</a></div>':'<div class="vlabel">Geen video gevonden bij deze oefening</div>'))+
    '</div><div class="vp-cap">'+(yt?"Klik op de video om af te spelen":(o&&o.video_url?"Externe video":"Geen demo-video gevonden"))+'</div>';
  pop.classList.add("show");
  const r=ev.currentTarget.getBoundingClientRect(),pw=pop.offsetWidth,ph=pop.offsetHeight;
  let left=r.right+8;if(left+pw>window.innerWidth-8)left=r.left-pw-8;if(left<8)left=8;
  let top=r.top;if(top+ph>window.innerHeight-8)top=window.innerHeight-ph-8;if(top<8)top=8;
  pop.style.left=left+"px";pop.style.top=top+"px";
}
// ---------- Metric-detailscherm (in het hoofdvlak; historie + resultaat toevoegen, zoals CoachRx) ----------
async function mxOpenDetail(naam){
  mxDetailNaam=naam;mxDetailForm=false;activePanel="metric-detail";
  if(typeof calClient!=="undefined"&&calClient)setHash("klant/"+calClient+"/metric/"+encodeURIComponent(naam));
  const m=document.getElementById("cmain");if(m)m.innerHTML='<div class="spin">Laden…</div>';
  await mxLaad();
  mxDetailRender();
}
async function mxAanpassenInAss(){
  const veld=MX_ASS_VELD[mxDetailNaam];
  await openAssess();
  if(veld){if(veld[0]==="move")assTab(1);else if(veld[0]==="work")assTab(2);}
}
function mxDetailRender(){
  const m=document.getElementById("cmain");if(!m||activePanel!=="metric-detail"||!mxDetailNaam)return;
  const naam=mxDetailNaam,assVeld=MX_ASS_VELD[naam];
  let curTxt="—",histRows="",actie="";
  if(assVeld){
    const blok={body:"OPEX Body",move:"OPEX Move",work:"OPEX Work"}[assVeld[0]]||"Assessment";
    const punten=mxAssPunten(naam);
    if(punten.length)curTxt=esc(String(punten[punten.length-1].v));
    histRows=punten.slice().reverse().map(p=>'<div class="mh-row"><div class="mh-v">'+esc(String(p.v))+'</div><div class="mh-d">'+esc(assDatumNL(p.d))+'</div><div class="mh-n"><span class="muted sm">uit Assessment</span></div><div class="mh-x"></div></div>').join("")||'<div class="sm muted" style="padding:12px 0">Nog geen metingen. Vul ze in bij Assessment.</div>';
    actie='<div class="sm muted" style="margin-bottom:8px">Deze waarde vul je in bij Assessment ('+blok+'), zodat je het maar op één plek bijhoudt.</div><button class="btn" onclick="mxAanpassenInAss()">Aanpassen in Assessment</button>';
  }else{
    const hist=mxHist(naam),w=mxWaarde(naam),t=mxType(naam);
    if(w)curTxt=esc(mxFmtRij(w.cur,naam));
    histRows=hist.slice().reverse().map(mm=>'<div class="mh-row"><div class="mh-v">'+esc(mxFmtRij(mm,naam))+'</div><div class="mh-d">'+esc(assDatumNL(mm.measured_at))+'</div><div class="mh-n">'+esc(mm.note||"")+'</div><div class="mh-x"><svg class="i sm-i" style="cursor:pointer;color:#b3b9c2" onclick="mxDetailVerwijder(\''+mm.id+'\')"><use href="#i-trash"/></svg></div></div>').join("")||'<div class="sm muted" style="padding:12px 0">Nog geen resultaten. Voeg het eerste toe.</div>';
    if(mxDetailForm){
      // Invoerveld afhankelijk van het type: kg (getal), tijd (mm:ss) of pass/fail
      let invoer;
      if(t==="passfail"){
        invoer='<div class="mxd-pf"><label><input type="radio" name="mxd-pf" value="pass"> Pass</label><label><input type="radio" name="mxd-pf" value="fail"> Fail</label></div>';
      }else if(t==="time"){
        invoer='<input id="mxd-waarde" placeholder="mm:ss (bijv. 1:30)" style="width:150px">';
      }else if(t==="vrij"){
        invoer='<input id="mxd-waarde" placeholder="Resultaat (getal)" inputmode="decimal" style="width:130px"><select id="mxd-unit" style="width:90px">'+["kg","reps","sec","min","cal","%","m"].map(u=>'<option'+(((hist[hist.length-1]||{}).unit||"kg")===u?" selected":"")+'>'+u+'</option>').join("")+'</select>';
      }else{
        // Vaste eenheid (kg, m, cal, …)
        invoer='<div style="display:flex;align-items:center;gap:6px"><input id="mxd-waarde" placeholder="Resultaat" inputmode="decimal" style="width:130px"><span style="color:#5d6570;font-weight:600">'+esc(t)+'</span></div>';
      }
      actie='<div class="bp-sec" style="max-width:640px"><b>Nieuw resultaat</b><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px">'+
        invoer+'<input id="mxd-datum" type="date" value="'+todayStr()+'" style="width:160px"></div>'+
        '<textarea id="mxd-note" placeholder="Notitie (optioneel)" style="margin-top:8px;min-height:60px"></textarea>'+
        '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" onclick="mxDetailOpslaan()">Opslaan</button><button class="btn ghost" onclick="mxDetailFormSluit()">Annuleren</button></div>'+
        '<div class="msg" id="mxd-msg"></div></div>';
    }else{
      actie='<button class="btn" onclick="mxDetailFormOpen()">Nieuw resultaat</button>';
    }
  }
  const dTip=MX_TIP[naam]?' <span class="ass-help" data-tip="'+esc(MX_TIP[naam])+'">?</span>':'';
  m.innerHTML='<div class="calhead"><span class="back" style="margin:0" onclick="mxDetailTerug()">‹ Terug naar kalender</span><span class="month" style="margin-left:12px">'+esc(naam)+dTip+'</span></div>'+
    '<div style="padding:22px 24px;max-width:820px;overflow:auto">'+
    '<div style="margin-bottom:20px"><div class="sm muted">Huidig</div><div style="font-size:26px;font-weight:800;color:var(--accent)">'+curTxt+'</div></div>'+
    actie+
    '<h3 style="margin-top:26px">Geschiedenis</h3><div class="mh-head"><span class="mh-v">Resultaat</span><span class="mh-d">Datum</span><span class="mh-n">Notitie</span><span class="mh-x"></span></div>'+histRows+
    '</div>';
}
function mxDetailTerug(){mxDetailNaam=null;if(typeof calClient!=="undefined"&&calClient)setHash("klant/"+calClient);renderClient("kalender");}
function mxDetailFormOpen(){mxDetailForm=true;mxDetailRender();const el=document.getElementById("mxd-waarde");if(el)el.focus();}
function mxDetailFormSluit(){mxDetailForm=false;mxDetailRender();}
async function mxDetailOpslaan(){
  const naam=mxDetailNaam,t=mxType(naam),msg=document.getElementById("mxd-msg");
  const g=id=>{const e=document.getElementById(id);return e?e.value:"";};
  let velden={value:null,value_text:null,unit:null};
  if(t==="passfail"){
    const pf=document.querySelector('input[name="mxd-pf"]:checked');
    if(!pf){if(msg)msg.textContent="Kies pass of fail.";return;}
    velden.value_text=pf.value;
  }else if(t==="time"){
    const sec=mxTijdNaarSec(g("mxd-waarde"));
    if(!sec){if(msg)msg.textContent="Vul een tijd in (mm:ss).";return;}
    velden.value=sec;velden.unit="sec";
  }else if(t==="vrij"){
    const w=parseFloat((g("mxd-waarde")||"").trim().replace(",","."));
    if(isNaN(w)){if(msg)msg.textContent="Vul een getal in als resultaat.";return;}
    velden.value=w;velden.unit=g("mxd-unit")||null;
  }else{
    // Vaste eenheid (kg, m, cal, …)
    const w=parseFloat((g("mxd-waarde")||"").trim().replace(",","."));
    if(isNaN(w)){if(msg)msg.textContent="Vul een getal in ("+t+").";return;}
    velden.value=w;velden.unit=t;
  }
  const{error}=await db.from("metrics").insert({athlete_id:calClient,company_id:ME.profile.company_id,metric:naam,value:velden.value,value_text:velden.value_text,unit:velden.unit,measured_at:g("mxd-datum")||todayStr(),note:(g("mxd-note")||"").trim()||null,created_by:ME.user.id});
  if(error){if(msg)msg.textContent=error.message||"Opslaan mislukt";return;}
  toast("Resultaat toegevoegd");
  await mxLaad();mxDetailForm=false;mxDetailRender();
  if(document.getElementById("mx-groepen"))mxRender();
}
async function mxDetailVerwijder(id){
  if(!confirm("Dit resultaat verwijderen?"))return;
  const{error}=await db.from("metrics").delete().eq("id",id);
  if(error){toast(error.message);return;}
  await mxLaad();mxDetailRender();
  if(document.getElementById("mx-groepen"))mxRender();
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
// Eén zijpaneel tegelijk open: de rest klapt dicht. Bij het openen van een paneel
// klapt ook het linkermenu in tot iconen, zodat het paneel niet zoveel ruimte pakt.
function sluitPanelen(){document.querySelectorAll(".sidepanel.show").forEach(p=>p.classList.remove("show"));sideInklappen();}
// ---------- Zijbalk in-/uitklappen ----------
function toggleSide(){
  sideCollapsed=!sideCollapsed;
  const lay=document.querySelector(".client-layout");
  if(lay)lay.classList.toggle("collapsed",sideCollapsed);
  const a=document.getElementById("cl-arrow");
  if(a)a.textContent=sideCollapsed?"→":"←";
}
// Klap het linkermenu in tot iconen (alleen als het nu nog uitgeklapt staat).
function sideInklappen(){if(!sideCollapsed)toggleSide();}
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
// Coach-only dossier (client_private): NIET leesbaar voor het lid. Nu voor Prioriteiten.
let cpData={};
async function cpLaad(){
  const{data:rows}=await db.from("client_private").select("*").eq("athlete_id",calClient).limit(1);
  cpData=(rows&&rows[0]&&rows[0].data)||{};
}
async function cpBewaar(){
  const{error}=await db.from("client_private").upsert({athlete_id:calClient,company_id:ME.profile.company_id,data:cpData,updated_by:ME.user.id},{onConflict:"athlete_id"});
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
  await notesLaad();await docsLaad();
  sp.innerHTML='<div class="sp-head"><h3>Notities & documenten</h3><span class="sp-x" onclick="document.getElementById(\'sp-notes\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div class="sp-tabs"><button class="on" id="nd-t0" onclick="ndTab(0)">Notities</button><button id="nd-t1" onclick="ndTab(1)">Documenten</button></div>'+
    '<div id="nd-0"><div class="sp-field"><textarea id="note-nieuw" placeholder="Notitie toevoegen (alleen zichtbaar voor coaches)…"></textarea></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:14px"><button class="sp-btn" style="width:auto;padding:9px 16px" id="note-saveknop" onclick="noteOpslaan()">Opslaan</button><button class="sp-btn ghost" style="width:auto;padding:9px 16px" onclick="noteReset()">Annuleren</button></div>'+
    '<div class="sp-field"><input id="note-zoek" placeholder="Zoek in notities" oninput="notesRender()"></div>'+
    '<div id="notes-lijst"></div></div>'+
    '<div id="nd-1" style="display:none">'+
    '<input type="file" id="doc-file" style="display:none" onchange="docUpload(this)">'+
    '<button class="sp-btn" id="doc-uploadknop" style="margin-bottom:8px" onclick="document.getElementById(\'doc-file\').click()">Document uploaden vanaf je computer</button>'+
    '<div class="sp-info" style="margin-bottom:12px">Standaard alleen zichtbaar voor coaches. Maximaal 25 MB per bestand. Delen met het lid komt samen met de sporter-app.</div>'+
    '<div id="docs-lijst"></div></div>';
  notesRender();docsRender();
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
// ---------- DOCUMENTEN (upload naar Storage-bucket 'documents'; metadata in de documents-tabel) ----------
let docsLijst=[];
const DOC_MAX=26214400; // 25 MB, gelijk aan de bucketlimiet
const docBytesNL=b=>{if(b==null)return"";if(b<1024)return b+" B";if(b<1048576)return Math.round(b/1024)+" KB";return (Math.round(b/104857.6)/10)+" MB";};
async function docsLaad(){
  const{data}=await db.from("documents").select("*").eq("athlete_id",calClient).order("created_at",{ascending:false});
  docsLijst=data||[];
}
function docsRender(){
  const host=document.getElementById("docs-lijst");if(!host)return;
  host.innerHTML=docsLijst.map(d=>'<div class="sp-note"><div class="nh">'+esc(datumNL(d.created_at))+
    ' <span><svg class="i sm-i" onclick="docVerwijder(\''+d.id+'\')"><use href="#i-trash"/></svg></span></div>'+
    '<div class="nb"><a href="#" onclick="docOpen(\''+d.id+'\');return false" style="color:var(--accent);text-decoration:none">'+
    '<svg class="i sm-i" style="vertical-align:-2px;margin-right:4px"><use href="#i-doc"/></svg>'+esc(d.file_name)+'</a>'+
    (d.size_bytes?' <span class="sm" style="color:#8b919b">· '+docBytesNL(d.size_bytes)+'</span>':'')+'</div></div>').join("")
    ||'<div class="sm" style="color:#8b919b">Nog geen documenten. Upload het eerste hierboven.</div>';
}
async function docUpload(input){
  const file=input.files&&input.files[0];input.value="";
  if(!file)return;
  if(file.size>DOC_MAX){toast("Bestand is te groot (max 25 MB)");return;}
  const knop=document.getElementById("doc-uploadknop");
  if(knop){knop.disabled=true;knop.textContent="Uploaden…";}
  // Pad: {company_id}/{athlete_id}/{uuid}-bestandsnaam. De storage-policy controleert de eerste twee mappen.
  const safe=file.name.replace(/[^\w.\- ]+/g,"_");
  const path=ME.profile.company_id+"/"+calClient+"/"+crypto.randomUUID()+"-"+safe;
  const{error:upErr}=await db.storage.from("documents").upload(path,file,{contentType:file.type||undefined,upsert:false});
  if(upErr){toast(upErr.message||"Upload mislukt");if(knop){knop.disabled=false;knop.textContent="Document uploaden vanaf je computer";}return;}
  const{error}=await db.from("documents").insert({athlete_id:calClient,company_id:ME.profile.company_id,author_id:ME.user.id,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size});
  if(error){
    await db.storage.from("documents").remove([path]); // geen wees-bestand achterlaten
    toast(error.message||"Opslaan mislukt");if(knop){knop.disabled=false;knop.textContent="Document uploaden vanaf je computer";}return;
  }
  if(knop){knop.disabled=false;knop.textContent="Document uploaden vanaf je computer";}
  await docsLaad();docsRender();toast("Document geüpload");
}
async function docOpen(id){
  const d=docsLijst.find(x=>x.id===id);if(!d)return;
  const{data,error}=await db.storage.from("documents").createSignedUrl(d.storage_path,120);
  if(error||!data){toast((error&&error.message)||"Kon bestand niet openen");return;}
  window.open(data.signedUrl,"_blank","noopener");
}
async function docVerwijder(id){
  const d=docsLijst.find(x=>x.id===id);if(!d)return;
  if(!confirm("Dit document verwijderen?"))return;
  const{error}=await db.from("documents").delete().eq("id",id);
  if(error){toast(error.message);return;}
  await db.storage.from("documents").remove([d.storage_path]);
  await docsLaad();docsRender();toast("Document verwijderd");
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
// ---------- PRIORITEITEN (coach-only; client_private.data.prio — NIET voor het lid) ----------
async function openPrio(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-prio");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-prio";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Prioriteiten</h3></div><div class="sp-info">Laden…</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  await cpLaad();
  sp.innerHTML='<div class="sp-head"><h3>Prioriteiten</h3><span class="sp-x" onclick="document.getElementById(\'sp-prio\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div class="sp-field"><input id="prio-nieuw" placeholder="Prioriteit toevoegen…" onkeydown="if(event.key===\'Enter\')prioOpslaan()"></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:16px"><button class="sp-btn" style="width:auto;padding:9px 16px" onclick="prioOpslaan()">Prioriteit opslaan</button><button class="sp-btn ghost" style="width:auto;padding:9px 16px" onclick="document.getElementById(\'prio-nieuw\').value=\'\'">Annuleren</button></div>'+
    '<div class="sp-info">Alleen zichtbaar voor coaches.</div>'+
    '<div id="prio-lijst"></div>';
  prioRender();
}
function prioRender(){
  const host=document.getElementById("prio-lijst");if(!host)return;
  const lijst=cpData.prio||[];
  host.innerHTML=lijst.map((p,i)=>'<div class="sp-chip">'+esc(p)+' <span class="x" onclick="prioWeg('+i+')">✕</span></div>').join("")||'<div class="sm" style="color:#8b919b">Nog geen prioriteiten. Voeg de eerste toe.</div>';
}
async function prioOpslaan(){
  const inp=document.getElementById("prio-nieuw");
  const tekst=(inp.value||"").trim();
  if(!tekst){toast("Typ eerst een prioriteit");return;}
  cpData.prio=[tekst,...(cpData.prio||[])];
  const err=await cpBewaar();
  if(err){toast(err.message||"Opslaan mislukt");return;}
  inp.value="";prioRender();toast("Prioriteit opgeslagen");
}
async function prioWeg(i){
  (cpData.prio||[]).splice(i,1);
  const err=await cpBewaar();
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
