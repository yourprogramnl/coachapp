// app/bieb-venster.js — de bibliotheek in een los browservenster (verzoek
// Stefan, 8 okt 2026). Open vanuit het klant-scherm (zijbalk > Bibliotheek) en
// sleep templates, benchmarks en oefeningen op de kalender van de klant in het
// hoofdvenster. Handig met twee schermen: bibliotheek links, kalender rechts.
//
// Techniek: HTML5 drag & drop werkt tussen vensters van dezelfde browser. De
// kaart zet alles wat de kalender nodig heeft in dataTransfer (type BIEB_MIME),
// zodat het hoofdvenster de bibliotheek niet geladen hoeft te hebben. Het
// loslaten gebeurt in app/klant-scherm.js (biebDropOpDag / biebDropOpWorkout).
const BIEB_MIME="application/x-yp-item";
let BIEB={tab:"workout",zoek:"",kleur:"",sub:"",subTekst:"",bmCat:"",kolommen:"auto",win:null};
// Geen tab Oefeningen (video's) hier: die blijven in de gewone bibliotheek (keuze Stefan, 8 okt).
// Template week en Template dag direct na Workouts; de weekworkouts heten YP Showdown (verzoek Stefan, 18 nov).
const BIEB_TABS=[["workout","Workouts"],["tplweek","Template week"],["tpldag","Template dag"],["warmup","Warm-ups"],["cooldown","Cooldowns"],["week","YP Showdown"],["bord","Leaderboard"],["benchmarks","Benchmarks"]];
// Weekworkouts (de blogworkouts met gedeeld leaderboard) staan niet in LIB;
// die halen we hier zelf op, nieuwste eerst.
BIEB.week=null;
async function biebWeekLaad(){
  if(BIEB.week||!ME.profile.company_id){BIEB.week=BIEB.week||[];return;}
  const{data}=await db.from("workouts").select("*, blocks(*)").eq("company_id",ME.profile.company_id).eq("audience","blog").is("blog_program_id",null).order("workout_date",{ascending:false}).limit(150);
  BIEB.week=data||[];
}
// Leaderboard-workouts (audience 'bord'): workouts met een gedeeld leaderboard voor 1-op-1 klanten.
// Elke keer vers ophalen als het tabblad open gaat: ze worden in het hoofdvenster aangemaakt.
BIEB.bord=null;
async function biebBordLaad(){
  if(!ME.profile.company_id){BIEB.bord=[];return;}
  const{data}=await db.from("workouts").select("*, blocks(*)").eq("company_id",ME.profile.company_id).eq("audience","bord").order("created_at",{ascending:false}).limit(300);
  BIEB.bord=data||[];
}
// Tekst van een weekworkout zoals hij in een blok komt: blokken met letter, plus warming-up/cooldown.
function biebWeekTekst(w){
  const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  return blocks.map(b=>{const pr=composePresc(b);return (b.label?b.label+") ":"")+(b.exercise||"")+(pr?"\n"+pr:"");}).join("\n\n");
}

// Vanuit het hoofdvenster: open (of breng naar voren) het bibliotheek-venster.
function openBiebVenster(){
  if(BIEB.win&&!BIEB.win.closed){try{BIEB.win.focus();}catch(e){}return;}
  const w=window.open(location.pathname+"#bieb","yp_bieb","width=1140,height=840,menubar=no,toolbar=no,location=no,status=no");
  if(!w){toast("Het venster werd geblokkeerd. Sta pop-ups toe voor deze site en probeer het opnieuw.");return;}
  BIEB.win=w;try{w.focus();}catch(e){}
}

// In het losse venster: het hele scherm is de bibliotheek, zonder navigatiebalk.
async function renderBiebVenster(){
  document.title="Bibliotheek · YourProgram";
  document.body.classList.add("coachmode","biebvenster");
  const tb=document.querySelector(".topbar");if(tb)tb.style.display="none";
  try{BIEB.kolommen=localStorage.getItem("bieb_kolommen")||"auto";}catch(e){}
  const c=document.getElementById("content");
  // Twee delen: de kaarten (bieb-lijstdeel) en, verborgen, #cpage voor de editor van
  // een Template week/dag. Die editor uit app/bibliotheek.js tekent in #cpage.
  c.innerHTML='<div class="cwrap bieb"><div id="bieb-lijstdeel">'+
    '<div class="bieb-kop">'+
      '<div><h1 style="margin:0">Bibliotheek</h1><div class="sm muted">Sleep een kaart naar een dag op de kalender van je klant in het andere venster. Lege dag = nieuwe workout, dag met workout = blok eronder.</div></div>'+
      '<div class="bieb-acties">'+
        '<button class="btn sm" id="bieb-addbtn" onclick="biebNieuw()">+ Template toevoegen</button>'+
        '<button class="btn ghost sm" onclick="biebNieuweOef()">+ Oefening toevoegen</button>'+
        '<div class="bieb-kolknop" title="Weergave: automatisch (meer kolommen op een breed venster) of alles onder elkaar">'+
          '<button class="'+(BIEB.kolommen==="auto"?"on":"")+'" onclick="biebKolommen(\'auto\')">Kolommen</button>'+
          '<button class="'+(BIEB.kolommen==="1"?"on":"")+'" onclick="biebKolommen(\'1\')">1 kolom</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
    '<div class="bieb-doel" id="bieb-doel">Dubbelklik op een kaart zet hem op de doeldag. Open een klant in het hoofdvenster en klik daar het speldje 📌 op een dag.</div>'+
    '<div class="bieb-balk">'+
      '<div class="bieb-tabs" id="bieb-tabs"></div>'+
      '<div class="search2" style="flex:1;min-width:200px"><input id="bieb-zoek" placeholder="Zoek op naam, tekst of tag…" oninput="biebZoek(this.value)"></div>'+
      '<span class="cpill teal" id="bieb-aantal">…</span>'+
    '</div>'+
    '<div id="bieb-filters" class="bieb-filters"></div>'+
    '<div id="bieb-grid" class="bieb-grid'+(BIEB.kolommen==="1"?" een":"")+'"><div class="cempty">Bibliotheek laden…</div></div>'+
  '</div><div id="cpage" style="display:none"></div></div>';
  ensureLibModals(); // dezelfde popups als op de gewone Bibliotheek-pagina
  biebTabsRender();
  biebModeZet();
  biebKanaalStart();
  await Promise.all([LIB.geladen?Promise.resolve():libLaad(),biebWeekLaad()]);
  await programLaad(); // wie welke template mag aanpassen (program_editors), net als op de gewone pagina
  await biebProgLaad(); // workouts van de templates, voor de tekst op de kaarten
  biebRender();
}
const inBiebVenster=()=>document.body.classList.contains("biebvenster");
// LIB.mode volgt de tab, zodat de bestaande editors de juiste soort kiezen
// (tplBewerk(null) pakt warming-up/cooldown/workout uit LIB.mode, progModalOpen week of dag).
const BIEB_MODE={workout:"workout",warmup:"warmup",cooldown:"cooldown",benchmarks:"benchmarks",tplweek:"programs",tpldag:"progdag"};
function biebModeZet(){
  if(BIEB_MODE[BIEB.tab])LIB.mode=BIEB_MODE[BIEB.tab];
  const a=document.getElementById("bieb-addbtn");if(!a)return;
  // Zelfde tekst als de knop op de gewone Bibliotheek-pagina (libKop). YP Showdown
  // beheer je onder YP Showdown in het hoofdvenster, dus daar geen knop.
  const tekst={workout:"+ Template toevoegen",warmup:"+ Template toevoegen",cooldown:"+ Template toevoegen",benchmarks:"+ Benchmark toevoegen",tplweek:"+ Template week toevoegen",tpldag:"+ Template dag toevoegen"}[BIEB.tab];
  a.style.display=tekst?"":"none";
  if(tekst)a.textContent=tekst;
}
function biebNieuw(){if(!BIEB_MODE[BIEB.tab])return;biebModeZet();libNieuw();}
function biebNieuweOef(){oefBewerk(null);}

// Na opslaan of verwijderen (aangeroepen via libMeldWijziging in app/bibliotheek.js):
// de kaarten opnieuw tekenen met dezelfde tab, filters, zoektekst en scrollstand.
async function biebNaWijziging(){
  if(!inBiebVenster())return;
  const y=window.scrollY;
  if(biebIsProg()||BIEB.progW){BIEB.progW=null;await biebProgLaad();}
  biebRender();
  window.scrollTo(0,y);
}
// Het andere venster heeft iets in de bibliotheek gewijzigd: hier vers ophalen.
async function biebLibVers(){
  LIB.geladen=false;
  await libLaad();
  await programLaad();
  await biebNaWijziging();
}

// ⋮-menu op een kaart: bewerken (en bij een template week/dag ook verwijderen),
// met dezelfde rechten als op de gewone Bibliotheek-pagina. Het menu hangt aan
// <body> (de kaart knipt alles af wat buiten de rand valt) en sleept niet mee.
function biebBewerkActies(soort,id){
  if(soort==="item"){
    const o=libItemVind(id);if(!o)return [];
    if(o.bron==="tpl")return [["Bewerken","tplBewerk("+(typeof o.id==="number"?o.id:"'"+esc(String(o.id))+"'")+")"]];
    if(o.bron==="bench"&&o.eigen)return [["Bewerken","bmBewerk('"+esc(String(o.id))+"')"]];
    return [];
  }
  if(soort==="benchmark"){const b=LIB.bm.find(x=>String(x.id)===String(id));return b&&b.categorie==="custom"?[["Bewerken","bmBewerk('"+esc(String(b.id))+"')"]]:[];}
  if(soort==="progtpl"){
    const mag=progMagIk(id);
    return [[mag?"Bewerken":"Bekijken","biebProgOpen('"+esc(String(id))+"')"]].concat(mag?[["Details bewerken","programDetails('"+esc(String(id))+"')"],["Verwijderen","programVerwijder('"+esc(String(id))+"')","danger"]]:[]);
  }
  return [];
}
function biebMenu(ev,soort,id){
  ev.stopPropagation();ev.preventDefault();
  const knop=ev.currentTarget;
  const bestond=document.querySelector(".coachmenu.bieb-menu[data-voor='"+soort+":"+id+"']");
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  if(bestond)return;
  const acties=biebBewerkActies(soort,id);if(!acties.length)return;
  if(acties.length===1){(new Function(acties[0][1]))();return;} // alleen Bewerken: meteen de editor
  const m=document.createElement("div");m.className="coachmenu bieb-menu";m.dataset.voor=soort+":"+id;
  m.innerHTML=acties.map(([tekst,actie,klas])=>'<button'+(klas?' class="'+klas+'"':'')+' onclick="event.stopPropagation();document.querySelectorAll(\'.coachmenu\').forEach(x=>x.remove());'+actie+'">'+tekst+'</button>').join("");
  const r=knop.getBoundingClientRect();
  m.style.position="fixed";m.style.top=(r.bottom+4)+"px";m.style.right=Math.max(8,window.innerWidth-r.right)+"px";m.style.left="auto";
  document.body.appendChild(m);
}
window.addEventListener("scroll",()=>{if(inBiebVenster())document.querySelectorAll(".coachmenu.bieb-menu").forEach(x=>x.remove());},{passive:true});

// Template week/dag bewerken in dit venster: dezelfde editor als in de Bibliotheek,
// in #cpage; de kaarten gaan zolang aan de kant.
async function biebProgOpen(id){
  await openProgramEditor(id); // roept biebEditorToon aan zodra de editor staat
}
function biebEditorToon(){
  if(!inBiebVenster())return;
  const l=document.getElementById("bieb-lijstdeel"),c=document.getElementById("cpage");
  if(l&&l.style.display!=="none"){BIEB.scrollY=window.scrollY;window.scrollTo(0,0);} // bij wisselen van template blijft de stand
  if(l)l.style.display="none";if(c)c.style.display="";
}
// "‹ Terug" in de editor (progBack): true = afgehandeld in het venster.
function biebEditorTerug(){
  if(!inBiebVenster())return false;
  PROG=null;progEditDay=null;progEditWid=null;
  const l=document.getElementById("bieb-lijstdeel"),c=document.getElementById("cpage");
  if(c){c.style.display="none";c.innerHTML="";}if(l)l.style.display="";
  const y=BIEB.scrollY||0;
  programLaad().then(()=>biebNaWijziging()).then(()=>window.scrollTo(0,y));
  return true;
}
// Verbinding met het hoofdvenster (zie "doeldag" in app/klant-scherm.js).
function biebKanaalStart(){
  if(typeof BroadcastChannel==="undefined"){const d=document.getElementById("bieb-doel");if(d)d.textContent="Dubbelklik werkt niet in deze browser; slepen wel.";return;}
  if(BIEB.kanaal)return;
  BIEB.kanaal=new BroadcastChannel("yp_bieb");
  BIEB.kanaal.onmessage=(ev)=>{
    const m=ev.data||{};
    if(m.type==="doel"){BIEB.bron=m.van;BIEB.doel=m;biebDoelToon();}
    else if(m.type==="melding"&&m.tekst)toast(m.tekst);
    else if(m.type==="progs")biebProgVers(); // in het hoofdvenster is een template opgeslagen
    else if(m.type==="lib")biebLibVers(); // in het hoofdvenster is iets in de bibliotheek gewijzigd
  };
  BIEB.kanaal.postMessage({type:"vraag"});
}
function biebDoelToon(){
  const d=document.getElementById("bieb-doel");if(!d)return;
  const m=BIEB.doel;
  if(!m||!m.klant){d.className="bieb-doel";d.textContent="Dubbelklik op een kaart zet hem op de doeldag. Open een klant in het hoofdvenster en klik daar het speldje 📌 op een dag.";return;}
  if(!m.dag){d.className="bieb-doel";d.innerHTML="<b>"+esc(m.klant)+"</b> · nog geen doeldag: klik het speldje 📌 op een dag in de kalender, dan zet dubbelklik een kaart daar neer.";return;}
  d.className="bieb-doel aan";
  d.innerHTML="Dubbelklik zet een kaart bij <b>"+esc(m.klant)+"</b> op <b>"+esc(m.dagLabel||m.dag)+"</b>"+(m.bouwer?" (in de open bouwer)":"")+".";
}
function biebDubbel(ev,soort,id){
  ev.preventDefault();
  const p=biebPayload(soort,id);if(!p)return;
  if(!BIEB.kanaal||!BIEB.bron){toast("Open eerst een klant in het hoofdvenster");return;}
  if(!(BIEB.doel&&BIEB.doel.dag)){toast("Kies eerst een dag: klik het speldje 📌 op een dag in de kalender");return;}
  BIEB.kanaal.postMessage({type:"plaats",voor:BIEB.bron,item:p});
}
function biebTabsRender(){
  const h=document.getElementById("bieb-tabs");if(!h)return;
  h.innerHTML=BIEB_TABS.map(([k,n])=>'<button class="'+(BIEB.tab===k?"on":"")+'" onclick="biebTab(\''+k+'\')">'+n+'</button>').join("");
}
function biebTab(k){BIEB.tab=k;BIEB.kleur="";BIEB.sub="";BIEB.subTekst="";BIEB.bmCat="";biebTabsRender();biebModeZet();biebRender();
  if(k==="bord")biebBordLaad().then(()=>{if(BIEB.tab==="bord")biebRender();});}
function biebZoek(v){BIEB.zoek=(v||"").toLowerCase().trim();biebRender(true);}
function biebKleur(k){BIEB.kleur=BIEB.kleur===k?"":k;BIEB.sub="";BIEB.subTekst="";biebRender();}
function biebSub(k){BIEB.sub=BIEB.sub===k?"":k;biebRender();}
function biebSubTekst(v){BIEB.subTekst=(v||"").toLowerCase().trim();biebRender(true);}
function biebBmCat(k){BIEB.bmCat=BIEB.bmCat===k?"":k;biebRender();}
function biebKolommen(k){
  BIEB.kolommen=k;try{localStorage.setItem("bieb_kolommen",k);}catch(e){}
  document.querySelectorAll(".bieb-kolknop button").forEach((b,i)=>b.classList.toggle("on",(i===0&&k==="auto")||(i===1&&k==="1")));
  const g=document.getElementById("bieb-grid");if(g)g.classList.toggle("een",k==="1");
}
// Type in de templates-tabel bij een tab
function biebTplType(){return BIEB.tab==="warmup"?"warmup":(BIEB.tab==="cooldown"?"cooldown":"other");}
const biebBevat=(o,v,velden)=>!v||velden.some(f=>String(o[f]||(Array.isArray(o[f])?o[f].join(" "):"")).toLowerCase().includes(v));

// Filterregel(s) onder de tabs: kleuren + zoekwoorden (templates) of categorieën (benchmarks).
function biebFiltersRender(){
  const h=document.getElementById("bieb-filters");if(!h)return;
  if(BIEB.tab==="oef"||BIEB.tab==="week"||BIEB.tab==="bord"||biebIsProg()){h.innerHTML="";h.style.display="none";return;}
  h.style.display="flex";
  if(BIEB.tab==="benchmarks"){
    h.innerHTML='<div class="rij"><span class="legchip'+(BIEB.bmCat===""?" aan":"")+'" onclick="biebBmCat(\'\')">Alles</span>'+
      BM_CATS.map(([k,n])=>'<span class="legchip'+(BIEB.bmCat===k?" aan":"")+'" onclick="biebBmCat(\''+k+'\')">'+n+'</span>').join("")+'</div>';
    return;
  }
  const kleurChips=libKleuren(biebTplType()).map(k=>'<span class="legchip'+(BIEB.kleur===k?" aan":"")+'" onclick="biebKleur(\''+k+'\')"><span style="width:12px;height:12px;border-radius:50%;background:'+kleurHex(k)+';flex:none"></span>'+kleurNaam(k)+'</span>').join("");
  let sub="";
  if(BIEB.kleur){
    const groepen=tplGroepen(biebTplType(),BIEB.kleur);
    const naam=g=>esc(g.charAt(0).toUpperCase()+g.slice(1));
    sub='<div class="rij"><span class="sm muted" style="font-size:11.5px;margin-right:2px">Zoekwoord:</span>'+
      groepen.map(([g,n])=>'<span class="legchip'+(BIEB.sub===g?" aan":"")+'" style="font-weight:500" onclick="biebSub('+JSON.stringify(g).replace(/"/g,"&quot;")+')">'+naam(g)+' <span style="opacity:.6">'+n+'</span></span>').join("")+
      '<input id="bieb-subzoek" type="text" placeholder="Eigen zoekterm…" value="'+esc(BIEB.subTekst)+'" oninput="biebSubTekst(this.value)" class="bieb-subveld'+(BIEB.subTekst?" aan":"")+'"></div>';
  }
  h.innerHTML='<div class="rij">'+kleurChips+'</div>'+sub;
}

// De kaarten. behoudFilters=true bij typen: dan alleen de kaarten verversen
// (anders verliest het invoerveld de focus bij elke letter).
function biebRender(behoudFilters){
  if(!behoudFilters)biebFiltersRender();
  const g=document.getElementById("bieb-grid"),cnt=document.getElementById("bieb-aantal");
  if(!g)return;
  if(!LIB.geladen){g.innerHTML='<div class="cempty">Bibliotheek laden…</div>';return;}
  const v=BIEB.zoek;
  let kaarten=[],totaal=0,hint="";
  if(BIEB.tab==="oef"){
    const hits=oefZoek(v);
    totaal=hits.length;
    if(hits.length>80)hint='<div class="cempty">'+hits.length+' oefeningen; de eerste 80 staan hieronder. Zoek op naam om er sneller bij te komen.</div>';
    kaarten=hits.slice(0,80).map(o=>biebKaartOef(o));
  }else if(BIEB.tab==="week"){
    const hits=(BIEB.week||[]).filter(w=>!v||(w.title||"").toLowerCase().includes(v)||biebWeekTekst(w).toLowerCase().includes(v)||(w.workout_date||"").includes(v));
    totaal=hits.length;
    kaarten=hits.map(w=>biebKaartWeek(w));
    if(!hits.length&&!v)hint='<div class="cempty">Nog geen Showdowns. Maak ze aan onder YP Showdown in het hoofdvenster.</div>';
  }else if(BIEB.tab==="bord"){
    const hits=(BIEB.bord||[]).filter(w=>!v||(w.title||"").toLowerCase().includes(v)||biebWeekTekst(w).toLowerCase().includes(v));
    totaal=hits.length;
    kaarten=hits.map(w=>biebKaartWeek(w,true));
    if(BIEB.bord===null)hint='<div class="cempty">Laden…</div>';
    else if(!hits.length&&!v)hint='<div class="cempty">Nog geen leaderboard-workouts. Klik bij een klant op een blok op "Leaderboard aanzetten"; daarna staat hij hier en sleep je hem naar andere klanten.</div>';
  }else if(biebIsProg()){
    const u=biebProgKaarten(v);totaal=u.totaal;kaarten=u.kaarten;hint=u.hint;
  }else if(BIEB.tab==="benchmarks"){
    const hits=LIB.bm.filter(b=>(!BIEB.bmCat||b.categorie===BIEB.bmCat)&&biebBevat(b,v,["naam","tekst","tags","format"]));
    totaal=hits.length;
    kaarten=hits.map(b=>biebKaartBm(b));
  }else{
    // Workouts = templates + wedstrijdworkouts + benchmarks (libItems); warm-ups/cooldowns alleen templates.
    const type=biebTplType();
    const hits=libItems(type).filter(o=>(!BIEB.kleur||o.kleur===BIEB.kleur)&&(!BIEB.sub||itemGroep(o)===BIEB.sub)&&biebBevat(o,BIEB.subTekst,["naam","instructies","tags","info"])&&biebBevat(o,v,["naam","instructies","tags","info"]));
    totaal=hits.length;
    kaarten=hits.map(o=>biebKaartItem(o));
  }
  if(cnt)cnt.textContent=totaal+(biebIsProg()?(totaal===1?" template":" templates"):BIEB.tab==="oef"?" oefeningen":(BIEB.tab==="benchmarks"?" benchmarks":(BIEB.tab==="bord"?(totaal===1?" leaderboard-workout":" leaderboard-workouts"):BIEB.tab==="week"?(totaal===1?" Showdown":" Showdowns"):(BIEB.tab==="workout"?" workouts":" templates"))));
  g.innerHTML=hint+(kaarten.join("")||(hint?"":'<div class="cempty">Niets gevonden.</div>'));
}
// menu=true: een ⋮-knop voor bewerken (zie biebMenu). De knop is zelf "draggable"
// met een geannuleerde dragstart, zodat slepen vanaf de knop nooit de kaart meeneemt.
function biebKaart(soort,id,kleurHex,kop,sub,tekst,extra,onder,menu){
  const sid=esc(String(id));
  const knop=menu?'<button class="bk-menu" draggable="true" ondragstart="event.preventDefault();event.stopPropagation()" ondblclick="event.stopPropagation()" onclick="biebMenu(event,\''+soort+'\',\''+sid+'\')" title="Bewerken"><svg class="i"><use href="#i-pen"/></svg></button>':'';
  return '<div class="bieb-card" draggable="true" ondragstart="biebDragStart(event,\''+soort+'\',\''+sid+'\')" ondragend="biebDragEnd(event)" ondblclick="biebDubbel(event,\''+soort+'\',\''+sid+'\')" title="Sleep naar een dag op de kalender, of dubbelklik voor de doeldag">'+
    '<div class="bk-kop"><span class="bk-dot" style="background:'+kleurHex+'"></span><div style="flex:1;min-width:0"><b>'+kop+'</b>'+(sub?'<div class="sm muted" style="margin-top:2px">'+sub+'</div>':'')+'</div>'+knop+'<span class="bk-grip" title="Slepen">⋮⋮</span></div>'+
    (extra||"")+
    (tekst?'<div class="bk-tekst">'+esc(tekst)+'</div>'+(biebLang(tekst)?'<span class="bk-meer" onclick="event.stopPropagation();biebMeer(this)">Meer</span>':''):'<div class="bk-tekst muted" style="font-style:italic">Geen tekst</div>')+
    (onder||"")+
    '</div>';
}
// Wedstrijdworkout met meerdere divisies: de andere versies uitklapbaar onder de
// kaart; elke versie is zelf te slepen of dubbel te klikken (eigen sleutel comp:<id>).
function biebVariantenHtml(o){
  if(!o.varianten||o.varianten.length<2)return "";
  const rijen=o.varianten.map(v=>'<div class="bk-varrij" draggable="true" ondragstart="event.stopPropagation();biebDragStart(event,\'item\',\'comp:'+esc(String(v.id))+'\')" ondragend="biebDragEnd(event)" ondblclick="event.stopPropagation();biebDubbel(event,\'item\',\'comp:'+esc(String(v.id))+'\')" title="Sleep of dubbelklik: deze divisie">'+
    '<b>'+esc(v.divisie||"Alle divisies")+'</b>'+(v.id===o.id?' <span class="muted">(hoofdversie)</span>':'')+'<div class="bk-vartekst">'+esc(v.tekst)+'</div></div>').join("");
  return '<div class="bk-var"><span class="bk-meer" onclick="event.stopPropagation();biebVarToggle(this)">'+o.varianten.length+' divisies ▸</span><div class="bk-varlijst" style="display:none">'+rijen+'</div></div>';
}
function biebVarToggle(el){
  const lijst=el.parentElement.querySelector(".bk-varlijst");if(!lijst)return;
  const open=lijst.style.display==="none";lijst.style.display=open?"block":"none";
  el.textContent=el.textContent.replace(/[▸▾]$/,open?"▾":"▸");
}
// Lange tekst: eerst 9 regels, met Meer/Minder (kaarten blijven dan ongeveer even hoog).
function biebLang(t){return (String(t).match(/\n/g)||[]).length>=9||String(t).length>420;}
function biebMeer(el){const k=el.closest(".bieb-card");if(!k)return;k.classList.toggle("open");el.textContent=k.classList.contains("open")?"Minder":"Meer";}
// Kaart voor een item uit libItems (template, wedstrijdworkout of benchmark).
function biebKaartItem(o){
  const vids=(o.media||[]).filter(m=>m&&m.youtube_id).length;
  return biebKaart("item",o.key,kleurHex(o.kleur),esc(o.naam),esc(itemSoort(o)+" · "+(o.info||kleurNaam(o.kleur)))+(vids?" · 🎥 "+vids:""),o.instructies||"",null,biebVariantenHtml(o),o.bron==="tpl"||(o.bron==="bench"&&o.eigen));
}
function biebKaartBm(b){
  const rx=b.rx_men?(b.rx_men===b.rx_women?b.rx_men:"Rx "+b.rx_men+" / "+b.rx_women):null;
  const info=[BM_CATNAAM[b.categorie]||b.categorie,b.format,b.time_cap?"cap "+b.time_cap:null,rx].filter(Boolean).join(" · ");
  return biebKaart("benchmark",b.id,TPLKLEUR.purple,esc(b.naam)+(b.badge?' <span class="cpill" style="background:#eef1f4;color:#5d6570;text-transform:lowercase">'+esc(b.badge)+'</span>':''),esc(info),b.tekst||"",null,null,b.categorie==="custom");
}
function biebKaartWeek(w,bord){
  const d=w.workout_date?new Date(w.workout_date+"T12:00:00"):null;
  const datum=d?d.getDate()+" "+MAANDKORT[d.getMonth()]+" "+d.getFullYear():"";
  const vids=(w.blocks||[]).reduce((n,b)=>n+((b.media||[]).filter(m=>m&&m.youtube_id).length),0);
  const tekst=[w.warmup?"Warming-up\n"+w.warmup:null,biebWeekTekst(w),w.cooldown?"Cooldown\n"+w.cooldown:null].filter(Boolean).join("\n\n");
  if(bord)return biebKaart("weekworkout",w.id,TPLKLEUR.purple,esc(w.title||"Leaderboard-workout"),esc("leaderboard-workout · gedeeld leaderboard voor 1-op-1")+(vids?" · 🎥 "+vids:""),tekst);
  return biebKaart("weekworkout",w.id,TPLKLEUR.blue,esc(w.title||"Weekworkout"),esc("weekworkout · gedeeld leaderboard · "+datum)+(vids?" · 🎥 "+vids:""),tekst);
}
function biebKaartOef(o){
  const thumb=o.youtube_id?'<img src="https://i.ytimg.com/vi/'+esc(o.youtube_id)+'/mqdefault.jpg" loading="lazy" class="bk-thumb" alt="">':'';
  return biebKaart("oefening",o.id,TPLKLEUR.gray,esc(o.naam),esc((o.tags||[]).slice(0,4).join(" · ")),"",thumb);
}
// Wat er met de kaart meereist naar het andere venster.
function biebPayload(soort,id){
  // Template week of dag: alleen de verwijzing reist mee, het hoofdvenster haalt de workouts zelf op.
  if(soort==="progtpl"){const p=(LIB.programs||[]).find(x=>String(x.id)===String(id));if(!p)return null;
    return {soort,id:p.id,naam:p.name,tekst:"",type:p.type||"standard",weeks:p.weeks||1};}
  if(soort==="item"||soort==="template"){const o=libItemVind(id);if(!o)return null;
    // Wedstrijdworkouts en benchmarks komen als gewoon blok mee (blauw / paars), templates houden hun kleur.
    return {soort:"template",id:o.key,naam:o.naam,tekst:o.instructies||"",kleur:itemBlokKleur(o),type:o.type,media:o.media||[],onderdelen:o.onderdelen||null,bron:o.bron||"tpl"};}
  if(soort==="benchmark"){const b=LIB.bm.find(x=>String(x.id)===String(id));if(!b)return null;
    const regels=[b.format,b.time_cap?"Time cap: "+b.time_cap:null,b.rx_men?("Rx: "+(b.rx_men===b.rx_women?b.rx_men:b.rx_men+" / "+b.rx_women)):null].filter(Boolean);
    return {soort,id:b.id,naam:b.naam,tekst:[(b.tekst||"").trim(),regels.join("\n")].filter(Boolean).join("\n\n"),kleur:"purple"};}
  if(soort==="weekworkout"){const w=(BIEB.week||[]).find(x=>String(x.id)===String(id))||(BIEB.bord||[]).find(x=>String(x.id)===String(id));if(!w)return null;
    const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
    // Alles mee wat het hoofdvenster nodig heeft: als los blok (gedeeld leaderboard
    // via source_blog_workout_id) óf als volledige eigen kopie op een lege dag.
    return {soort,id:w.id,naam:w.title||"Weekworkout",tekst:biebWeekTekst(w),kleur:w.audience==="bord"?"purple":"blue",score_type:(blocks[0]&&blocks[0].score_type)||"text",
      media:blocks.flatMap(b=>(b.media||[]).filter(m=>m&&m.youtube_id)),
      warmup:w.warmup||null,cooldown:w.cooldown||null,warmup_oefening_id:w.warmup_oefening_id||null,cooldown_oefening_id:w.cooldown_oefening_id||null,warmup_media:w.warmup_media||null,cooldown_media:w.cooldown_media||null,
      blocks:blocks.map(b=>({kind:b.kind,label:b.label,linked:b.linked,exercise:b.exercise,prescription:b.prescription,notes:b.notes,sort:b.sort,color:b.color,score_type:b.score_type,oefening_id:b.oefening_id,media:b.media||null,lift_id:b.lift_id||null,lift_scheme:b.lift_scheme||null,group_title:b.group_title||null}))};}
  if(soort==="oefening"){const o=LIB.oef.find(x=>String(x.id)===String(id));if(!o)return null;
    return {soort,id:o.id,naam:o.naam,tekst:"",kleur:null,youtube_id:o.youtube_id||null};}
  return null;
}
function biebDragStart(ev,soort,id){
  const p=biebPayload(soort,id);
  if(!p){ev.preventDefault();return;}
  try{
    ev.dataTransfer.effectAllowed="copy";
    ev.dataTransfer.setData(BIEB_MIME,JSON.stringify(p));
    ev.dataTransfer.setData("text/plain",p.naam+(p.tekst?"\n"+p.tekst:""));
  }catch(e){}
  const card=ev.target.closest(".bieb-card");
  if(card){card.classList.add("dragging");try{if(ev.dataTransfer.setDragImage)ev.dataTransfer.setDragImage(card,30,20);}catch(e){}}
}
function biebDragEnd(ev){document.querySelectorAll(".bieb-card.dragging").forEach(c=>c.classList.remove("dragging"));}
