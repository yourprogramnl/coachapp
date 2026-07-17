// app/coach-shell.js — de coach-schil: de bovenbalk met navigatietabs, het laden
// van de klanten, en de router die per sectie het juiste scherm toont.
// Alle coach-secties (dashboard, klanten, coaches, bibliotheek…) leunen hierop.
// De actieve sectie staat in de link (#coaches), zodat je na verversen op
// dezelfde pagina blijft.
let coachClients=[],coachExercises=[],monthWorkouts={},sideCollapsed=false,coachSection="dash";

// ---------- Ongelezen-teller op de Berichten-knop in de topnav ----------
// Telt ongelezen berichten van je éígen klanten (ook een eigenaar ziet hier
// alleen zijn eigen klanten: alleen de eigen coach kan op gelezen zetten,
// anders zou het bolletje bij de eigenaar nooit uitgaan), plus ongelezen
// groepsberichten van groepen waar je zelf lid van bent. Realtime bijgewerkt.
let msgBadgeAantal=0,msgBadgeKanaal=null,msgBadgeGestart=false;
async function telMsgBadge(){
  if(!ME||!ME.profile||myRole()==="lid")return;
  const[kl,lidm]=await Promise.all([
    db.from("profiles").select("id").eq("role","lid").eq("coach_id",ME.user.id),
    db.from("chat_group_members").select("group_id,last_read_at").eq("profile_id",ME.user.id),
  ]);
  let n=0;
  const ids=(kl.data||[]).map(k=>k.id);
  if(ids.length){
    const{data}=await db.from("messages").select("athlete_id,sender_id").in("athlete_id",ids).is("read_at",null);
    // bericht ván het lid = sender is het lid zelf (coachberichten hebben ook read_at null tot het lid ze leest)
    n+=(data||[]).filter(m=>m.sender_id===m.athlete_id).length;
  }
  const gids=(lidm.data||[]).map(m=>m.group_id);
  if(gids.length){
    const{data:gm}=await db.from("chat_group_messages").select("group_id,sender_id,created_at").in("group_id",gids).neq("sender_id",ME.user.id);
    n+=(gm||[]).filter(m=>{
      const eigen=(lidm.data||[]).find(x=>x.group_id===m.group_id);
      const sinds=eigen&&eigen.last_read_at?eigen.last_read_at:"";
      return m.created_at>sinds;
    }).length;
  }
  msgBadgeAantal=n;
  msgBadgeDom();
}
function msgBadgeHtml(){
  return msgBadgeAantal>0
    ?'<span class="navbadge" id="cnav-msgs-badge">'+(msgBadgeAantal>9?"9+":msgBadgeAantal)+'</span>'
    :'<span class="navbadge" id="cnav-msgs-badge" style="display:none"></span>';
}
function msgBadgeDom(){
  const el=document.getElementById("cnav-msgs-badge");if(!el)return;
  el.style.display=msgBadgeAantal>0?"":"none";
  el.textContent=msgBadgeAantal>9?"9+":msgBadgeAantal;
}
function msgBadgeStart(){
  telMsgBadge();
  if(msgBadgeGestart)return;
  msgBadgeGestart=true;
  try{
    msgBadgeKanaal=db.channel("msg-badge")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
        if(payload.new&&payload.new.sender_id===payload.new.athlete_id)telMsgBadge();
      })
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_group_messages"},payload=>{
        if(payload.new&&payload.new.sender_id!==ME.user.id)telMsgBadge();
      }).subscribe();
  }catch(e){}
}
function msgBadgeStop(){
  msgBadgeAantal=0;msgBadgeGestart=false;
  try{if(msgBadgeKanaal){db.removeChannel(msgBadgeKanaal);msgBadgeKanaal=null;}}catch(e){}
}

const myRole=()=>(ME.profile&&ME.profile.role)||"lid";
// Tabs per rol: coach ziet geen "Coaches"; platform_admin krijgt extra "Bedrijven"
function cnavItems(){
  const role=myRole();
  const n=[["dash","Dashboard"],["clients","Klanten"],["library","Bibliotheek"]];
  if(role!=="coach")n.push(["coaches","Coaches"]);
  n.push(["blog","Blog"],["week","Weekworkout"],["msgs","Berichten"]);
  // "Bedrijven" (platform_admin) bewust verborgen zolang er één gym is (Stefan,
  // 17 juli); komt terug bij meerdere bedrijven. Code (fillCompanies) blijft staan.
  return n;
}
// Leest de sectie uit de link (#…). Onbekend of niet toegestaan voor deze rol → dashboard.
function sectionFromHash(){
  let h=(location.hash||"").replace(/^#/,"");
  if(h.indexOf("settings")===0)h="settings"; // #settings/<pagina> telt als settings
  const geldig=cnavItems().map(n=>n[0]).concat(["settings"]); // settings zit niet in de topnav (avatar-menu)
  return geldig.includes(h)?h:"dash";
}
// De link kan een sectie zijn (#dash) of een geopende klant (#klant/<id>[/metric/<naam>]).
function parseHash(){
  const h=(location.hash||"").replace(/^#/,""),p=h.split("/");
  if(p[0]==="klant"&&p[1])return{type:"client",id:p[1],metric:(p[2]==="metric"&&p[3])?decodeURIComponent(p[3]):null};
  if(p[0]==="settings"){
    // Subpagina in de link (#settings/notificaties) -> juiste tab openen
    if(p[1]&&typeof INST_TABS!=="undefined"&&INST_TABS.some(t=>t[0]===p[1]))instTab=p[1];
    return{type:"section",section:"settings"};
  }
  const geldig=cnavItems().map(n=>n[0]).concat(["settings"]);
  return{type:"section",section:geldig.includes(h)?h:"dash"};
}
// Zet de link zonder de router opnieuw te laten vuren (eigen wijziging).
let hashZelf=false;
function setHash(h){h=String(h);if((location.hash||"").replace(/^#/,"")===h)return;hashZelf=true;location.hash=h;}
// Zorg dat de klantenlijst geladen is (nodig om een klant uit de link te openen).
async function ensureClients(){
  if(coachClients&&coachClients.length)return;
  let q=db.from("profiles").select("*").eq("role","lid");
  if(myRole()==="coach")q=q.eq("coach_id",ME.user.id);
  else if(ME.profile.company_id)q=q.eq("company_id",ME.profile.company_id);
  const{data}=await q;coachClients=data||[];
}
// Toon wat er in de link staat: een sectie of een geopende klant (evt. met metric-detail).
async function routeHash(){
  if(myRole()==="lid")return;
  const r=parseHash();
  if(r.type==="client"){
    await ensureClients();
    if((coachClients||[]).some(x=>x.id===r.id)){
      if(!(typeof calClient!=="undefined"&&calClient===r.id&&document.querySelector(".client-layout")))openClient(r.id);
      if(r.metric){openMx();mxOpenDetail(r.metric);}
      return;
    }
    renderCoach("clients");return;
  }
  renderCoach(r.section);
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
function coachGo(sec){if(sec==="clients")klantCoachFilter=null;coachSection=sec;setHash(sec);coachRenderSection();}
// Vooruit/terug in de browser of een handmatig aangepaste link volgen.
// Eigen wijzigingen (via setHash) slaan we over.
window.addEventListener("hashchange",()=>{
  if(hashZelf){hashZelf=false;return;}
  if(myRole()==="lid")return;
  routeHash();
});
function coachShellHtml(inner){
  document.body.classList.add("coachmode");
  const btns=cnavItems().map(n=>'<button class="'+(n[0]===coachSection?"on":"")+'" onclick="coachGo(\''+n[0]+'\')">'+esc(n[1])+(n[0]==="msgs"?msgBadgeHtml():"")+'</button>').join("");
  // Avatar rechtsboven = uitklapmenu (naar CoachRx-voorbeeld, 17 juli): naam +
  // rol bovenin, Instellingen (komt nog) en Uitloggen (losse knop is weg).
  return '<div class="cwrap"><div class="cbar"><span class="logo">COACH<b>APP</b></span><div class="cnav2">'+btns+'</div>'+
    '<div class="cbar-right"><span style="font-size:10px;color:#8f959d;font-weight:700;text-transform:uppercase;letter-spacing:.6px">'+esc(ROLE_NL[myRole()]||"")+'</span>'+
    '<div class="avwrap"><button class="cav" style="'+avFotoStyle(ME.profile)+'" title="Menu" onclick="avMenuToggle(event)">'+avFotoText(ME.profile)+'</button>'+
    '<div class="avmenu" id="avmenu">'+
      '<div class="avm-kop"><span class="avm-av" style="'+avFotoStyle(ME.profile)+'">'+avFotoText(ME.profile)+'</span><span><b>'+esc(naamVan(ME.profile))+'</b><span class="avm-rol">'+esc(ROLE_NL[myRole()]||"")+'</span></span></div>'+
      '<button onclick="coachGo(\'settings\')"><svg class="i sm-i"><use href="#i-gear"/></svg> Instellingen</button>'+
      '<button onclick="signOut()"><svg class="i sm-i"><use href="#i-x"/></svg> Uitloggen</button>'+
    '</div></div></div></div>'+
    '<div id="cpage">'+inner+'</div></div>';
}
function avMenuToggle(ev){
  ev.stopPropagation();
  const m=document.getElementById("avmenu");if(m)m.classList.toggle("show");
}
document.addEventListener("click",e=>{
  if(!e.target.closest(".avwrap")){const m=document.getElementById("avmenu");if(m)m.classList.remove("show");}
});
function coachRenderSection(){
  msgBadgeStart();
  if(typeof startNotifs==="function")startNotifs();
  const c=document.getElementById("content");
  if(coachSection==="clients"){c.innerHTML=coachShellHtml('<div class="spin">Laden…</div>');fillKlanten();return;}
  if(coachSection==="dash"){c.innerHTML=coachShellHtml('<h1>Dashboard</h1><div class="dashgrid"><div class="panel"><div class="spin">Laden…</div></div><div></div></div>');fillDashboard();return;}
  if(coachSection==="coaches"){c.innerHTML=coachShellHtml('<h1>Coaches</h1><div class="spin">Laden…</div>');fillCoaches();return;}
  if(coachSection==="companies"){c.innerHTML=coachShellHtml('<h1>Bedrijven</h1><div class="spin">Laden…</div>');fillCompanies();return;}
  if(coachSection==="library"){c.innerHTML=coachShellHtml(libShellHtml());ensureLibModals();libLaad();libLijst();return;}
  if(coachSection==="week"){c.innerHTML=coachShellHtml('<div class="lbwrap"><div class="spin">Laden…</div></div>');fillWeekworkout();return;}
  if(coachSection==="blog"){c.innerHTML=coachShellHtml('<div class="spin">Laden…</div>');fillBlog();return;}
  if(coachSection==="msgs"){c.innerHTML=coachShellHtml('<h1>Berichten</h1><div class="spin">Laden…</div>');fillBerichten();return;}
  if(coachSection==="settings"){c.innerHTML=coachShellHtml('<div class="spin">Laden…</div>');fillInstellingen();return;}
  c.innerHTML=coachShellHtml('<div class="csoon">Deze sectie bestaat niet (meer).</div>');
}
