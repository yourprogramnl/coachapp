// app/coach-shell.js — de coach-schil: de bovenbalk met navigatietabs, het laden
// van de klanten, en de router die per sectie het juiste scherm toont.
// Alle coach-secties (dashboard, klanten, coaches, bibliotheek…) leunen hierop.
// De actieve sectie staat in de link (#coaches), zodat je na verversen op
// dezelfde pagina blijft.
let coachClients=[],coachExercises=[],monthWorkouts={},sideCollapsed=false,coachSection="dash";

const myRole=()=>(ME.profile&&ME.profile.role)||"lid";
// Tabs per rol: coach ziet geen "Coaches"; platform_admin krijgt extra "Bedrijven"
function cnavItems(){
  const role=myRole();
  const n=[["dash","Dashboard"],["clients","Klanten"],["library","Bibliotheek"]];
  if(role!=="coach")n.push(["coaches","Coaches"]);
  n.push(["programs","Programma's"],["week","Weekworkout"],["msgs","Berichten"]);
  if(role==="platform_admin")n.push(["companies","Bedrijven"]);
  return n;
}
// Leest de sectie uit de link (#…). Onbekend of niet toegestaan voor deze rol → dashboard.
function sectionFromHash(){
  const h=(location.hash||"").replace(/^#/,"");
  const geldig=cnavItems().map(n=>n[0]);
  return geldig.includes(h)?h:"dash";
}
async function renderCoach(section){
  coachSection=section||"dash";
  const tb=document.querySelector(".topbar");if(tb)tb.style.display="none";
  const c=document.getElementById("content");c.innerHTML='<div class="cwrap"><div class="spin">Laden…</div></div>';
  // Coach: eigen klanten. Eigenaar/admin: alle leden van het bedrijf.
  let q=db.from("profiles").select("*").eq("role","lid");
  if(myRole()==="coach")q=q.eq("coach_id",ME.user.id);
  else if(ME.profile.company_id)q=q.eq("company_id",ME.profile.company_id);
  const{data:clients}=await q;
  coachClients=clients||[];
  const{data:exs}=await db.from("exercises").select("name").order("name");
  coachExercises=exs||[];
  const dl=document.getElementById("exlist");if(dl)dl.innerHTML=coachExercises.map(e=>'<option value="'+esc(e.name)+'">').join("");
  coachRenderSection();
}
function coachGo(sec){coachSection=sec;if((location.hash||"").replace(/^#/,"")!==sec)location.hash=sec;coachRenderSection();}
// Vooruit/terug in de browser of een handmatig aangepaste link volgen
window.addEventListener("hashchange",()=>{
  if(myRole()==="lid")return;
  const sec=sectionFromHash();
  if(sec!==coachSection){coachSection=sec;coachRenderSection();}
});
function coachShellHtml(inner){
  document.body.classList.add("coachmode");
  const btns=cnavItems().map(n=>'<button class="'+(n[0]===coachSection?"on":"")+'" onclick="coachGo(\''+n[0]+'\')">'+esc(n[1])+'</button>').join("");
  const av=esc((ME.profile.first_name||ME.user.email||"?").slice(0,1).toUpperCase());
  return '<div class="cwrap"><div class="cbar"><span class="logo">COACH<b>APP</b></span><div class="cnav2">'+btns+'</div>'+
    '<div class="cbar-right"><span style="font-size:10px;color:#8f959d;font-weight:700;text-transform:uppercase;letter-spacing:.6px">'+esc(ROLE_NL[myRole()]||"")+'</span><div class="cav">'+av+'</div><button class="lo" onclick="signOut()">Uitloggen</button></div></div>'+
    '<div id="cpage">'+inner+'</div></div>';
}
function coachRenderSection(){
  const c=document.getElementById("content");
  if(coachSection==="clients"){c.innerHTML=coachShellHtml('<div class="spin">Laden…</div>');fillKlanten();return;}
  if(coachSection==="dash"){c.innerHTML=coachShellHtml('<h1>Dashboard</h1><div class="dashgrid"><div class="panel"><div class="spin">Laden…</div></div><div></div></div>');fillDashboard();return;}
  if(coachSection==="coaches"){c.innerHTML=coachShellHtml('<h1>Coaches</h1><div class="spin">Laden…</div>');fillCoaches();return;}
  if(coachSection==="companies"){c.innerHTML=coachShellHtml('<h1>Bedrijven</h1><div class="spin">Laden…</div>');fillCompanies();return;}
  if(coachSection==="library"){c.innerHTML=coachShellHtml(libShellHtml());ensureLibModals();libLaad();libLijst();return;}
  const titles={programs:"Programma's",week:"Weekworkout",msgs:"Berichten"};
  c.innerHTML=coachShellHtml('<h1>'+esc(titles[coachSection]||"")+'</h1><div class="csoon">Deze sectie bouwen we hierna.<br>We zijn met het <b>Dashboard</b> begonnen; hier vind je straks '+esc((titles[coachSection]||"").toLowerCase())+'.</div>');
}
