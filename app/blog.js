// app/blog.js — de Blog-sectie (topnav): blogprogramma's in een Strivee-stijl
// lijst (naam/type/prijs/klanten) met per programma een eigen maandkalender
// waarop de coach de doorlopende programmering schrijft. Workouts hangen aan
// workouts.blog_program_id (audience='blog'); de losse weekworkout heeft geen
// blog_program_id en blijft dus in de Weekworkout-sectie. Prijs is alleen
// weergave; betalen blijft via Strivee lopen.
let BLOG={list:[],counts:{},zoek:"",cur:null,maand:null,workouts:[],editDay:null,editWid:null,editPid:null,tab:"progs",klantFilter:null,klantZoek:"",klantGestopt:false,klanten:null,paneel:"kalender",data:null,dataPid:null,dataLaden:false,dataFout:null};
const BLOG_TYPES=[["classic","Classic"],["fixed","Vast"],["one_on_one","1-op-1"]];
const blogTypeNL=t=>{const x=BLOG_TYPES.find(o=>o[0]===t);return x?x[1]:(t||"Classic");};

async function fillBlog(){
  const[rp,rm]=await Promise.all([
    db.from("blog_programs").select("*").eq("company_id",ME.profile.company_id).order("name"),
    // Meerdere programma's per lid (22 juli): koppelingen staan in blog_program_members
    db.from("blog_program_members").select("athlete_id,blog_program_id").eq("company_id",ME.profile.company_id)
  ]);
  BLOG.list=rp.data||[];
  // Een coach ziet alleen blogs die aan hem zijn toegewezen (coach_ids leeg =
  // iedereen); eigenaar/platform_admin zien alles. Zelfde regel als het
  // wisselmenu op het klant-scherm.
  if(myRole()==="coach")BLOG.list=BLOG.list.filter(p=>!p.coach_ids||!p.coach_ids.length||p.coach_ids.includes(ME.user.id));
  kalBlogs=BLOG.list; // wisselmenu op het klant-scherm meteen bijwerken
  BLOG.counts={};(rm.data||[]).forEach(m=>{BLOG.counts[m.blog_program_id]=(BLOG.counts[m.blog_program_id]||0)+1;});
  ensureBlogModals();
  if(BLOG.cur){const v=BLOG.list.find(p=>p.id===BLOG.cur.id);if(v)BLOG.cur=v;else BLOG.cur=null;}
  // Vanuit het wisselmenu op het klant-scherm: direct door naar dit programma.
  if(BLOG.openNaId){
    const pid=BLOG.openNaId;BLOG.openNaId=null;
    if(BLOG.list.some(p=>p.id===pid)){blogOpen(pid);return;}
  }
  blogRender();
}
// Spring vanuit het klant-wisselmenu rechtstreeks naar de programmering
// van een blogprogramma (verzoek Stefan, 21 juli).
function blogGaNaar(id){
  BLOG.openNaId=id;
  coachGo("blog");
}
function blogRender(){
  const cp=document.getElementById("cpage");if(!cp)return;
  if(BLOG.cur){blogDetailRender();return;}
  cp.classList.remove("fullbleed"); // de lijst staat in de gewone kolom; de programmapagina op volle breedte
  // Twee tabbladen (22 okt 2026, verzoek Stefan): de programma's en een klantenoverzicht
  // per programma (wie volgt wat, sinds wanneer, betaald of gratis, opgezegd of gestopt).
  const knoppen='<div style="display:flex;gap:8px"><button class="btn" onclick="blogpModal(null)">+ Programma aanmaken</button>'+
    '<button class="btn ghost" onclick="openInvModal(\'blog\')">+ Klant uitnodigen</button></div>';
  const tabs='<div class="tabs" style="max-width:360px;margin:14px 0 12px"><button class="'+(BLOG.tab==="klanten"?"":"on")+'" onclick="blogTab(\'progs\')">Programma\'s</button>'+
    '<button class="'+(BLOG.tab==="klanten"?"on":"")+'" onclick="blogTab(\'klanten\')">Klanten</button></div>';
  if(BLOG.tab==="klanten"){
    cp.innerHTML='<div class="progedit"><div class="hrow"><h1>Blog</h1>'+knoppen+'</div>'+tabs+blogKlantenHtml()+'</div>';
    return;
  }
  cp.innerHTML='<div class="progedit"><div class="hrow"><h1>Blog</h1>'+knoppen+'</div>'+tabs+
    '<div style="margin:0 0 14px"><input class="lid-in" id="blog-zoek" placeholder="Zoek een programma…" style="width:100%;max-width:340px" oninput="blogZoek(this.value)" value="'+esc(BLOG.zoek)+'"></div>'+
    '<div class="card">'+
      '<div class="thead"><div style="flex:2.6">Programma</div><div style="flex:.9">Type</div><div style="flex:.9">Prijs</div><div style="flex:.7">Klanten</div><div style="width:40px"></div></div>'+
      '<div id="blog-lijst">'+blogLijstHtml()+'</div>'+
    '</div></div>';
}
function blogZoek(v){BLOG.zoek=(v||"").toLowerCase().trim();const h=document.getElementById("blog-lijst");if(h)h.innerHTML=blogLijstHtml();}
function blogLijstHtml(){
  if(!BLOG.list.length)return '<div class="cempty">Nog geen blogprogramma\'s. Klik op "+ Programma aanmaken" om te beginnen.</div>';
  const hits=BLOG.list.filter(p=>!BLOG.zoek||(p.name||"").toLowerCase().includes(BLOG.zoek)||(p.description||"").toLowerCase().includes(BLOG.zoek));
  return hits.map(p=>{
    const n=BLOG.counts[p.id]||0;
    const pt=blogPrijsTekst(p);
    const prijs=pt?('<b>'+esc(pt)+'</b>'):'<b style="color:#27b376">Gratis</b>';
    return '<div class="trow click" style="cursor:pointer;align-items:center" onclick="blogOpen(\''+p.id+'\')">'+
      '<div style="flex:2.6;display:flex;align-items:center;gap:11px"><div class="cavc" style="width:40px;height:40px;border-radius:10px;font-size:12px;'+avStijl(p.name)+'">'+esc((p.name||"?").slice(0,1).toUpperCase())+'</div>'+
        '<div><b>'+esc(p.name)+'</b>'+(p.description?'<div class="sm muted" style="margin-top:2px">'+esc(p.description)+'</div>':'')+'</div></div>'+
      '<div style="flex:.9" class="sm muted">'+esc(blogTypeNL(p.type))+'</div>'+
      '<div style="flex:.9" class="sm">'+prijs+'</div>'+
      '<div style="flex:.7" class="sm">'+(n?'<a href="#" style="color:#1d6f9c;font-weight:700" title="Klanten van dit programma" onclick="event.stopPropagation();blogKlantenOpen(\''+p.id+'\');return false">'+n+'</a>':'<span class="muted">–</span>')+'</div>'+
      '<div style="width:40px;text-align:right" onclick="event.stopPropagation()"><button class="kebab" onclick="blogMenu(event,\''+p.id+'\')">⋮</button></div></div>';
  }).join("")||'<div class="cempty">Geen programma gevonden voor deze zoekopdracht.</div>';
}
function blogMenu(ev,id){
  ev.stopPropagation();
  const row=ev.target.closest(".trow");if(!row)return;
  const bestond=row.querySelector(".coachmenu");document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  if(bestond)return;
  const m=document.createElement("div");m.className="coachmenu";
  m.innerHTML='<button onclick="event.stopPropagation();blogpModal(\''+id+'\')">Details bewerken</button>'+
    '<button onclick="event.stopPropagation();blogOpen(\''+id+'\')">Programmering openen</button>'+
    '<button class="danger" onclick="event.stopPropagation();blogVerwijder(\''+id+'\')">Verwijderen</button>';
  row.style.position="relative";row.appendChild(m);
  setTimeout(()=>document.addEventListener("click",function h(){m.remove();document.removeEventListener("click",h);}),0);
}
async function blogVerwijder(id){
  const p=BLOG.list.find(x=>x.id===id);if(!p)return;
  const n=BLOG.counts[id]||0;
  if(!confirm('Programma "'+p.name+'" verwijderen?\n\nAlle geplande workouts van dit programma gaan mee weg'+(n?' en '+n+' gekoppeld(e) lid/leden worden losgekoppeld':'')+'.'))return;
  const{error}=await db.from("blog_programs").delete().eq("id",id);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  if(BLOG.cur&&BLOG.cur.id===id)BLOG.cur=null;
  toast("Programma verwijderd");await fillBlog();
}

// ---------- Details-venster (aanmaken/bewerken) ----------
function blogpModal(id){
  ensureBlogModals();BLOG.editPid=id||null;
  const p=id?BLOG.list.find(x=>x.id===id):null;
  document.getElementById("blogp-titel").textContent=id?"Programma-details":"Programma aanmaken";
  document.getElementById("blogp-naam").value=p?(p.name||""):"";
  document.getElementById("blogp-desc").value=p?(p.description||""):"";
  document.getElementById("blogp-type").value=p?(p.type||"classic"):"classic";
  document.getElementById("blogp-prijs").value=p?(p.price_text||""):"";
  document.getElementById("blogp-msg").textContent="";
  document.getElementById("blogp-koop").checked=!!(p&&p.for_sale);
  document.getElementById("blogp-koopprijs").value=p&&p.price_cents?String(p.price_cents/100).replace(".",","):"";
  document.getElementById("blogp-koopint").value=(p&&p.price_interval)||"month";
  document.getElementById("blogp-join").checked=!!(p&&p.join_open);
  document.getElementById("blogp-slug").value=p?(p.slug||""):"";
  document.getElementById("blogp-sort").value=p&&p.sort!=null?p.sort:"";
  document.getElementById("blogp-level").value=p&&p.level?String(p.level):"";
  document.getElementById("blogp-days").value=p&&p.days_per_week?p.days_per_week:"";
  document.getElementById("blogp-cover").value=p?(p.cover_url||""):"";
  document.getElementById("blogp-desclong").value=p?(p.description_long||""):"";
  document.getElementById("blogp-joinlink").value=blogJoinUrl(p);
  blogpKoopToggle();
  blogpVulCoaches(p);
  document.getElementById("blogpmodal").classList.add("show");
}
function blogpKoopToggle(){
  const aan=document.getElementById("blogp-koop").checked;
  document.getElementById("blogp-koopvak").style.display=aan?"flex":"none";
}
// "Zichtbaar voor coaches": standaard alle coaches (coach_ids leeg); anders
// alleen de aangevinkte. Eigenaar/platform_admin zien altijd alle programma's.
async function blogpVulCoaches(p){
  const host=document.getElementById("blogp-coaches");if(!host)return;
  host.innerHTML='<div class="sm muted">Coaches laden…</div>';
  let q=db.from("profiles").select("id,first_name,last_name,email").eq("role","coach");
  if(ME.profile.company_id)q=q.eq("company_id",ME.profile.company_id);
  const{data}=await q;
  const coaches=(data||[]).sort((a,b)=>naamVan(a).localeCompare(naamVan(b)));
  const ids=(p&&p.coach_ids)||[];
  const alle=!ids.length;
  host.innerHTML='<label class="pf-toggle" style="margin:0"><input type="checkbox" id="blogp-alle"'+(alle?' checked':'')+' onchange="blogpAlleToggle()"><span class="pf-sw"></span> Alle coaches</label>'+
    '<div id="blogp-clijst" style="margin-top:8px'+(alle?';display:none':'')+'">'+
    (coaches.map(c=>'<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer"><input type="checkbox" class="blogp-c" value="'+c.id+'"'+(ids.includes(c.id)?' checked':'')+'> '+esc(naamVan(c))+'</label>').join("")||'<div class="sm muted">Nog geen coaches in dit bedrijf.</div>')+
    '</div>';
}
function blogpAlleToggle(){
  const alle=document.getElementById("blogp-alle"),l=document.getElementById("blogp-clijst");
  if(alle&&l)l.style.display=alle.checked?"none":"";
}
function blogpDicht(){document.getElementById("blogpmodal").classList.remove("show");BLOG.editPid=null;}
async function blogpOpslaan(){
  const naam=document.getElementById("blogp-naam").value.trim();
  const msg=document.getElementById("blogp-msg");
  if(!naam){msg.textContent="Geef het programma een naam.";msg.className="msg err";return;}
  const rec={name:naam,description:document.getElementById("blogp-desc").value.trim()||null,type:document.getElementById("blogp-type").value,price_text:document.getElementById("blogp-prijs").value.trim()||null};
  // Zichtbaarheid: leeg/alle = null (iedereen ziet hem), anders de gekozen coaches.
  const alleEl=document.getElementById("blogp-alle");
  if(alleEl){
    const gekozen=[...document.querySelectorAll(".blogp-c:checked")].map(x=>x.value);
    rec.coach_ids=(alleEl.checked||!gekozen.length)?null:gekozen;
  }
  rec.join_open=document.getElementById("blogp-join").checked; // aanmeldlink aan/uit
  // Etalage-velden (programmering.yourprogram.nl)
  const slug=document.getElementById("blogp-slug").value.trim().toLowerCase();
  if(slug&&!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)){msg.textContent="Het adres (slug) mag alleen kleine letters, cijfers en streepjes bevatten, bijv. the-next-step.";msg.className="msg err";return;}
  rec.slug=slug||null;
  const sortTxt=document.getElementById("blogp-sort").value.trim();rec.sort=sortTxt===""?100:Math.max(0,parseInt(sortTxt,10)||0);
  const lvl=document.getElementById("blogp-level").value;rec.level=lvl?parseInt(lvl,10):null;
  const dg=parseInt(document.getElementById("blogp-days").value,10);rec.days_per_week=dg>=1&&dg<=7?dg:null;
  rec.cover_url=document.getElementById("blogp-cover").value.trim()||null;
  rec.description_long=document.getElementById("blogp-desclong").value.trim()||null;
  // Winkel: prijs in centen; te koop kan alleen met een geldige prijs (min. €1).
  rec.for_sale=document.getElementById("blogp-koop").checked;
  const prijsTxt=document.getElementById("blogp-koopprijs").value.trim();
  const prijs=Math.round(parseFloat(prijsTxt.replace(",","."))*100);
  if(rec.for_sale&&prijsTxt===""){
    // Gratis programma op de etalage: aanmelden gaat via de aanmeldlink, dus die moet aan.
    if(!rec.join_open){msg.textContent="Een gratis programma op de etalage heeft de aanmeldlink nodig: zet 'Iedereen met de link kan zich zelf aanmelden' aan, of vul een prijs in.";msg.className="msg err";return;}
    rec.price_cents=null;rec.price_interval=document.getElementById("blogp-koopint").value;
  }else if(rec.for_sale){
    if(isNaN(prijs)||prijs<100){msg.textContent="Vul een winkelprijs in van minstens €1 (bijv. 39,00), of laat de prijs leeg voor een gratis programma.";msg.className="msg err";return;}
    rec.price_cents=prijs;rec.price_interval=document.getElementById("blogp-koopint").value;
  }else if(!isNaN(prijs)&&prijs>0){
    rec.price_cents=prijs;rec.price_interval=document.getElementById("blogp-koopint").value;
  }
  if(BLOG.editPid){
    const{error}=await db.from("blog_programs").update(rec).eq("id",BLOG.editPid);
    if(error){msg.textContent=error.message||"Opslaan mislukt";msg.className="msg err";return;}
    blogpDicht();toast("Programma bijgewerkt");await fillBlog();
  }else{
    rec.company_id=ME.profile.company_id;rec.created_by=ME.user.id;
    const{data,error}=await db.from("blog_programs").insert(rec).select().single();
    if(error){msg.textContent=error.message||"Aanmaken mislukt";msg.className="msg err";return;}
    blogpDicht();toast("Programma aangemaakt");
    await fillBlog();
    if(data)blogOpen(data.id); // meteen door naar de kalender
  }
}

// ---------- Programma openen: week-weergave (zoals de Strivee-blog) ----------
// Blogteksten zijn lang; één week met 7 brede kolommen leest veel beter dan
// een maandraster. Kaarten houden de kalender-look (mcard/cblk).
async function blogOpen(id){
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  const p=BLOG.list.find(x=>x.id===id);if(!p){toast("Programma niet gevonden");return;}
  BLOG.cur=p;BLOG.paneel="kalender";
  BLOG.weekStart=mondayOf(new Date());
  BLOG.editDay=null;BLOG.editWid=null;
  await blogLaadWeek();
  blogRender();
}
function blogTerug(){BLOG.cur=null;BLOG.editDay=null;BLOG.editWid=null;blogSelClear();fillBlog();}
async function blogLaadWeek(){
  const start=ymd(BLOG.weekStart),eind=ymd(addDays(BLOG.weekStart,6));
  const{data}=await db.from("workouts").select("*, blocks(*)").eq("blog_program_id",BLOG.cur.id).gte("workout_date",start).lte("workout_date",eind).order("workout_date");
  BLOG.workouts=data||[];
  blogSelClear(); // selectie hoort bij de zichtbare week
}
async function blogWeekGa(n){
  BLOG.weekStart=n===0?mondayOf(new Date()):addDays(BLOG.weekStart,n*7);
  BLOG.editDay=null;BLOG.editWid=null;
  await blogLaadWeek();blogRender();
}
// ISO-weeknummer (zoals "Week 29" in Strivee/CoachRx).
function isoWeek(d){
  const x=new Date(d);x.setHours(0,0,0,0);
  x.setDate(x.getDate()+3-((x.getDay()+6)%7));
  const w1=new Date(x.getFullYear(),0,4);
  return 1+Math.round(((x-w1)/864e5-3+((w1.getDay()+6)%7))/7);
}
const DAGENVOL=["Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
// Programma-wissel in de kop (zoals rechtsboven in Strivee).
function blogSwitchMenu(ev){
  ev.stopPropagation();
  document.querySelectorAll(".wwmenu").forEach(x=>x.remove());
  const d=document.createElement("div");d.className="coachmenu wwmenu";
  d.style.cssText="top:44px;right:0;left:auto;max-height:320px;overflow:auto;min-width:240px";
  d.innerHTML=BLOG.list.map(p=>'<button onclick="event.stopPropagation();blogSwitch(\''+p.id+'\')">'+(p.id===BLOG.cur.id?"✓ ":"")+esc(p.name)+' <span class="muted" style="font-size:11px">· '+esc(blogTypeNL(p.type))+'</span></button>').join("");
  const host=ev.target.closest(".blog-switch");if(!host)return;
  host.appendChild(d);
  setTimeout(()=>document.addEventListener("click",function h(){d.remove();document.removeEventListener("click",h);}),0);
}
async function blogSwitch(id){
  document.querySelectorAll(".wwmenu").forEach(x=>x.remove());
  if(BLOG.cur&&BLOG.cur.id===id)return;
  const p=BLOG.list.find(x=>x.id===id);if(!p)return;
  BLOG.cur=p;BLOG.editDay=null;BLOG.editWid=null;
  await blogLaadWeek();blogRender();
}
function blogDetailRender(){
  const cp=document.getElementById("cpage");if(!cp)return;
  const p=BLOG.cur,n=BLOG.counts[p.id]||0;
  cp.classList.add("fullbleed"); // volle breedte, zoals het klant-scherm (verzoek Stefan 22 okt)
  const paneel=BLOG.paneel||"kalender";
  const knop=(key,icon,label,actie,extra)=>'<button class="'+(key===paneel?"on":"")+'" data-tip="'+esc(label)+'"'+(extra||"")+' onclick="'+actie+'"><svg class="i"><use href="#'+icon+'"/></svg> '+esc(label)+'</button>';
  const nav=knop("kalender","i-cal","Kalender","blogPaneel('kalender')")+
    knop("klanten","i-user","Klanten","blogPaneel('klanten')")+
    knop("boards","i-fist","Leaderboards","blogPaneel('boards')")+
    knop("data","i-chart","Data","blogPaneel('data')")+
    knop("sneltoetsen","i-keys","Sneltoetsen","blogKeys()",' style="margin-top:14px"')+
    knop("bieb","i-book","Bibliotheek","openBiebVenster()")+
    knop("leden","i-link","Leden koppelen","blogLedenOpen()",' style="margin-top:14px"')+
    knop("uitnodigen","i-doc","Klant uitnodigen","openInvModal('blog')")+
    (p.join_open?knop("join","i-globe","Aanmeldlink kopiëren","blogKopieerJoin()"):"")+
    knop("details","i-gear","Details bewerken","blogpModal('"+p.id+"')");
  cp.innerHTML='<div class="client-layout bloglay'+(sideCollapsed?' collapsed':'')+'">'+
    '<div class="cside"><div class="cside-in"><div class="prof">'+
      '<button class="bl-terug" title="Terug naar de lijst met programma\'s" onclick="blogTerug()">‹ Terug naar Blog</button>'+
      '<div class="bigav" style="'+avStijl(p.name)+'" title="'+esc(p.name)+'">'+esc((p.name||"?").slice(0,1).toUpperCase())+'</div>'+
      '<div class="cnm">'+esc(p.name)+'</div>'+
      '<div class="cinfo">'+esc(blogTypeNL(p.type))+' · '+esc(blogPrijsTekst(p)||"Gratis")+'<br><span style="cursor:pointer" title="Klantenoverzicht van dit programma" onclick="blogPaneel(\'klanten\')"><b>'+n+'</b> klant'+(n===1?"":"en")+'</span></div></div>'+
    '<div class="mini-sess" title="Klanten" style="cursor:pointer" onclick="blogPaneel(\'klanten\')">'+n+'</div>'+
    '<div class="streak" id="bs-stats">'+blogSideStats()+'</div>'+
    '<div class="cnav">'+nav+'</div>'+
    '<button class="collapsebtn" title="Zijbalk in-/uitklappen" onclick="toggleSide()"><span id="cl-arrow">'+(sideCollapsed?"→":"←")+'</span></button></div></div>'+
    '<div class="cmain" id="cmain">'+blogPaneelHtml()+'</div></div>';
  if(paneel==="kalender"&&BLOG.editDay){relabel();groei();}
  // Cijfers op de achtergrond ophalen (zijbalk, Data en Leaderboards), één keer per programma.
  if(BLOG.dataPid!==p.id&&!BLOG.dataLaden)blogDataLaad();
}
// Welk onderdeel staat open in het grote vlak rechts van het zijmenu.
function blogPaneel(key){
  if(!BLOG.cur)return;
  BLOG.paneel=key;
  document.querySelectorAll(".coachmenu,.daymenu").forEach(x=>x.remove());
  if(key!=="kalender"){BLOG.editDay=null;BLOG.editWid=null;}
  if(key==="klanten"){BLOG.klantFilter=BLOG.cur.id;blogKlantenLaad();return;}
  blogRender();
}
function blogPaneelHtml(){
  const k=BLOG.paneel||"kalender";
  if(k==="klanten")return '<div class="bl-pad"><h2 style="margin:0 0 10px">Klanten van '+esc(BLOG.cur.name)+'</h2>'+blogKlantenHtml(true)+'</div>';
  if(k==="boards")return '<div class="bl-pad">'+blogBoardsHtml()+'</div>';
  if(k==="data")return '<div class="bl-pad">'+blogDataHtml()+'</div>';
  return blogKalenderHtml();
}
// Het weekraster (was de hele pagina; nu het onderdeel Kalender).
function blogKalenderHtml(){
  const p=BLOG.cur;
  const midden=addDays(BLOG.weekStart,3); // donderdag bepaalt de maand van de week
  const maandNaam=MAANDVOL[midden.getMonth()].charAt(0).toUpperCase()+MAANDVOL[midden.getMonth()].slice(1)+" "+midden.getFullYear();
  const dagen=[0,1,2,3,4,5,6].map(i=>ymd(addDays(BLOG.weekStart,i)));
  const editCol=BLOG.editDay?dagen.indexOf(BLOG.editDay):-1;
  const cols=[0,1,2,3,4,5,6].map(i=>i===editCol?"minmax(360px,2.6fr)":"minmax(150px,1fr)").join(" ");
  const koppen=dagen.map((datum,i)=>{
    const d=new Date(datum+"T12:00:00");
    const vandaag=datum===todayStr();
    return '<div'+(vandaag?' style="background:#e3f1f8;color:#1d6f9c"':'')+'>'+DAGENVOL[i]+' <span style="font-weight:600;color:'+(vandaag?"#1d6f9c":"#9aa1ab")+'">'+d.getDate()+'/'+pad(d.getMonth()+1)+'</span></div>';
  }).join("");
  return '<div class="progedit bl-pad" style="padding-top:0">'+
    '<div class="pe-weeks bl-weeks">'+
      '<h1 style="margin:0;font-size:20px">'+esc(maandNaam)+'</h1><span class="muted" style="font-weight:700;font-size:13px;margin-left:4px">Week '+isoWeek(midden)+'</span>'+
      '<button class="btn ghost sm" style="margin-left:14px" onclick="blogWeekGa(0)">Vandaag</button>'+
      '<button class="wtab" style="width:auto;padding:0 10px" onclick="blogWeekGa(-1)">‹</button>'+
      '<button class="wtab" style="width:auto;padding:0 10px" onclick="blogWeekGa(1)">›</button>'+
      '<div class="blog-switch" style="margin-left:auto;position:relative"><button class="progsel" style="cursor:pointer;font-family:inherit" onclick="blogSwitchMenu(event)">'+
        '<span class="pav" style="'+avStijl(p.name)+'">'+esc((p.name||"?").slice(0,1).toUpperCase())+'</span>'+
        '<span style="text-align:left"><span class="pn" style="display:block">'+esc(p.name)+'</span><span class="pt">'+esc(blogTypeNL(p.type))+'</span></span>'+
        '<span style="color:#8a919c">▾</span></button></div>'+
    '</div>'+
    '<div class="pe-cal"><div class="pe-hd7" style="grid-template-columns:'+cols+'">'+koppen+'</div>'+
    '<div class="pe-row" style="grid-template-columns:'+cols+'">'+dagen.map(d=>blogDayCel(d)).join("")+'</div></div>'+
  '</div>';
}
function blogDayCel(datum){
  const wos=BLOG.workouts.filter(w=>w.workout_date===datum);
  const vandaag=datum===todayStr();
  const stijl="min-height:420px;"+(vandaag?"outline:2px solid #6ec4e8;outline-offset:-2px;":"");
  const dragAttrs=' ondragover="blogDragOver(event,this)" ondragleave="blogDragLeave(this)" ondrop="blogDropDay(event,\''+datum+'\')"';
  if(BLOG.editDay===datum){
    let inner=wos.filter(w=>w.id!==BLOG.editWid).map(blogCard).join("");
    const w=BLOG.editWid?wos.find(x=>x.id===BLOG.editWid):null;
    const wObj=w?{id:w.id,title:w.title,warmup:w.warmup,cooldown:w.cooldown,warmup_oefening_id:w.warmup_oefening_id,cooldown_oefening_id:w.cooldown_oefening_id,warmup_media:w.warmup_media,cooldown_media:w.cooldown_media,blocks:(w.blocks||[])}:{};
    inner+='<div class="ib2 pe-ib" onclick="event.stopPropagation()">'+blogBuilderHtml(wObj)+'</div>';
    return '<div class="pe-cell" style="'+stijl+'"'+dragAttrs+'>'+inner+'</div>';
  }
  return '<div class="pe-cell" style="'+stijl+'"'+dragAttrs+'><div class="addrow2"><button class="addnewbtn" onclick="event.stopPropagation();blogDayMenu(event,\''+datum+'\')">+ Toevoegen</button>'+
    (wos.length?'<button class="sqbtn" title="Kopieer de workout van deze dag" onclick="event.stopPropagation();blogKopieerDag(\''+datum+'\')"><svg class="i sm-i"><use href="#i-copy"/></svg></button>':'')+
    '</div>'+wos.map(blogCard).join("")+'</div>';
}
// Zweefmenu op elke blog-kaart: zelfde bediening als de klant-kalender
// (potlood = bewerken, greep = slepen, kopiëren, verwijderen + selectievakje).
function blogCardTools(w){
  return '<input type="checkbox" class="cardsel"'+(blogSel.has(w.id)?' checked':'')+' title="Selecteren" onclick="event.stopPropagation();blogToggleSelect(this,\''+w.id+'\')">'+
    '<span class="cardtools" onclick="event.stopPropagation()">'+
    '<button title="Bewerken" onclick="event.stopPropagation();blogOpenBuilder(\''+w.workout_date+'\',\''+w.id+'\')"><svg class="i sm-i"><use href="#i-pen"/></svg></button>'+
    '<button class="mv" title="Sleep naar een andere dag" draggable="true" ondragstart="blogDragStart(event,\''+w.id+'\')" ondragend="blogDragEnd(event)" onclick="return false"><svg class="i sm-i"><use href="#i-move"/></svg></button>'+
    '<button title="Kopiëren naar een andere dag" onclick="event.stopPropagation();blogKopieer(\''+w.id+'\')"><svg class="i sm-i"><use href="#i-copy"/></svg></button>'+
    '<button title="Leaderboard van deze workout" onclick="event.stopPropagation();blogBoard(\''+w.id+'\')"><svg class="i sm-i"><use href="#i-fist"/></svg></button>'+
    '<button title="Verwijderen" onclick="event.stopPropagation();blogDeleteWorkout(\''+w.id+'\')"><svg class="i sm-i"><use href="#i-trash"/></svg></button>'+
    '</span>';
}
// ---------- Leaderboard per blogworkout (keuze Stefan 15 sep, zoals Strivee) ----------
// Elke workout in een blogprogramma heeft een leaderboard per blok met de
// openbare scores van de volgers. Rijen, fist bumps en reacties hergebruiken
// de code van de Showdown (weekworkout.js); het bord staat in WW.boards.
let BLOGBOARD=null; // {wid, rx, bronnen, bronIds, open} zolang het venster open is
async function blogBoard(wid){
  const w=BLOG.workouts.find(x=>x.id===wid);if(!w)return;
  ensureWwModals();ensureBlogModals();
  BLOGBOARD={wid,rx:(BLOGBOARD&&BLOGBOARD.rx)||"rx",bronnen:[],bronIds:[]};
  document.getElementById("blogboard-titel").textContent=(w.title||"Workout")+" · "+datumNL(w.workout_date);
  document.getElementById("blogboard-body").innerHTML='<div class="cempty">Leaderboard laden…</div>';
  document.getElementById("blogboardmodal").classList.add("show");
  await blogBoardLaad(wid);
}
// Scores ophalen: van de workout zelf én van de originelen waar een gekopieerde
// weekworkout of een Showdown-blok naar verwijst (daar staan de Showdown-scores,
// ook die uit Strivee). Verzoek Stefan 22 okt: "leaderboards vullen, Showdown erbij".
async function blogBoardLaad(wid){
  const w=BLOG.workouts.find(x=>x.id===wid);if(!w)return;
  const ids=[];const voeg=id=>{if(id&&!ids.includes(id))ids.push(id);};
  voeg(w.source_blog_workout_id);(w.blocks||[]).forEach(b=>voeg(b.source_blog_workout_id));
  const[eigen,bronWs,...rest]=await Promise.all([
    db.rpc("blog_leaderboard",{p_workout_id:wid}),
    ids.length?db.from("workouts").select("id,title,workout_date,blocks(*)").in("id",ids):Promise.resolve({data:[]}),
    ...ids.map(id=>db.rpc("blog_leaderboard",{p_workout_id:id}))
  ]);
  if(eigen.error){toast(eigen.error.message||"Leaderboard laden mislukt");return;}
  WW.boards[wid]=eigen.data||[];
  ids.forEach((id,i)=>{WW.boards[id]=(rest[i]&&rest[i].data)||[];});
  if(!BLOGBOARD||BLOGBOARD.wid!==wid)return; // intussen gesloten of een ander bord geopend
  BLOGBOARD.bronnen=(bronWs&&bronWs.data)||[];BLOGBOARD.bronIds=ids;
  const host=document.getElementById("blogboard-body");if(host)host.innerHTML=blogBoardHtml(wid);
}
// Haakje voor wwRefreshBoard: na een fist bump/reactie dit venster verversen, ook
// als de score op een origineel (Showdown) staat.
function blogBoardRefresh(wid){if(!BLOGBOARD||(BLOGBOARD.wid!==wid&&!(BLOGBOARD.bronIds||[]).includes(wid)))return false;blogBoardLaad(BLOGBOARD.wid);return true;}
function blogBoardRx(rx){if(!BLOGBOARD)return;BLOGBOARD.rx=rx;const host=document.getElementById("blogboard-body");if(host)host.innerHTML=blogBoardHtml(BLOGBOARD.wid);}
function blogBoardHtml(wid){
  const w=BLOG.workouts.find(x=>x.id===wid);if(!w)return "";
  const rx=(BLOGBOARD&&BLOGBOARD.rx)||"rx";
  const bronnen=(BLOGBOARD&&BLOGBOARD.bronnen)||[];
  // Onderdelen: de eigen blokken; een blok met een origineel toont de blokken (en
  // scores) van dat origineel; een gekopieerde weekworkout toont alleen het origineel.
  const secties=[];
  const vanBron=(bronId,kopVoor)=>{
    const bron=bronnen.find(x=>x.id===bronId),rows=WW.boards[bronId]||[];
    const bb=(bron?(bron.blocks||[]):[]).slice().sort((x,y)=>x.sort-y.sort);
    if(!bb.length){secties.push({blok:null,rows,kop:kopVoor||"Scores",tekst:"",notes:""});return;}
    bb.forEach(sb=>{
      const eigenKop=(sb.label||"")+") "+(sb.exercise||"");
      secties.push({blok:sb,rows:rows.filter(r=>r.block_id===sb.id),kop:kopVoor?(bb.length>1?kopVoor+" · "+eigenKop:kopVoor):eigenKop,tekst:composePresc(sb)||sb.prescription||"",notes:sb.notes||""});
    });
  };
  if(w.source_blog_workout_id)vanBron(w.source_blog_workout_id,"");
  else (w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort).forEach(b=>{
    const kop=(b.label||"")+") "+(b.exercise||"");
    if(b.source_blog_workout_id)vanBron(b.source_blog_workout_id,kop);
    else secties.push({blok:b,rows:(WW.boards[wid]||[]).filter(r=>r.block_id===b.id),kop,tekst:composePresc(b)||"",notes:b.notes||""});
  });
  const tel=r=>secties.reduce((n,s)=>n+s.rows.filter(x=>(x.rx==="scaled"?"scaled":"rx")===r).length,0);
  // Standaard alleen de onderdelen waar scores op staan (bij een vrijdag dus alleen de
  // Showdown, verzoek Stefan 22 okt); de rest is met één klik erbij te halen.
  const metScores=secties.filter(s=>s.rows.length),verborgen=secties.length-metScores.length;
  const alles=!!(BLOGBOARD&&BLOGBOARD.alles)||!metScores.length;
  const toon=alles?secties:metScores;
  const schakel=(verborgen>0&&metScores.length)?'<div style="margin-top:12px"><button class="btn ghost sm" onclick="blogBoardAlles()">'+(alles?'Alleen onderdelen met scores tonen':(verborgen===1?'Ook het ene onderdeel zonder scores tonen':'Ook de '+verborgen+' onderdelen zonder scores tonen'))+'</button></div>':'';
  let html='<div class="bl-rxbar"><div class="seg">'+
    '<button class="'+(rx==="rx"?"on":"")+'" onclick="blogBoardRx(\'rx\')">Rx <span>'+tel("rx")+'</span></button>'+
    '<button class="'+(rx==="scaled"?"on":"")+'" onclick="blogBoardRx(\'scaled\')">Scaled <span>'+tel("scaled")+'</span></button></div>'+
    '<span class="sm muted">Klik op een naam voor de notitie van de sporter.</span>'+wwNotitiesKnop("blogboard-body",secties.flatMap(s=>s.rows.filter(r=>(r.rx==="scaled"?"scaled":"rx")===rx)))+'</div>';
  if(!secties.length)return html+'<div class="cempty">Deze workout heeft nog geen onderdelen.</div>';
  if(!secties.some(s=>s.rows.length))return html+'<div class="cempty">Nog geen openbare scores op deze workout. Zodra volgers loggen en hun score op "openbaar" zetten, staan ze hier.</div>';
  return html+toon.map(s=>{
    const st=(s.blok&&s.blok.score_type)||"text";
    let h='<div class="lbcat" style="margin-top:14px;font-size:13px">'+esc(s.kop)+(s.blok&&s.blok.timecap_seconds?' <span class="muted" style="font-weight:500">· cap '+secNaarTijd(s.blok.timecap_seconds)+'</span>':'')+'</div>';
    if(s.tekst||s.notes)h+='<div class="bl-wtekst">'+esc(s.tekst)+(s.notes?'<div class="muted" style="margin-top:4px">'+esc(s.notes)+'</div>':'')+'</div>';
    const br=s.rows.filter(r=>(r.rx==="scaled"?"scaled":"rx")===rx);
    if(!br.length)return h+'<div class="sm muted" style="padding:4px 0 6px">Nog geen '+(rx==="rx"?"Rx":"Scaled")+'-scores op dit onderdeel.</div>';
    [["man","Mannen"],["vrouw","Vrouwen"],["overig","Overig"]].forEach(cat=>{
      const groep=br.filter(r=>{const g=(r.gender==="man"||r.gender==="vrouw")?r.gender:"overig";return g===cat[0];}).sort(wwCmp(st));
      if(groep.length)h+='<div class="sm muted" style="margin:8px 0 4px;font-weight:700">'+cat[1]+'</div><div class="card">'+groep.map((r,i)=>blogRij(r,i+1)).join("")+'</div>';
    });
    return h;
  }).join("")+schakel;
}
function blogBoardAlles(){if(!BLOGBOARD)return;BLOGBOARD.alles=!BLOGBOARD.alles;const host=document.getElementById("blogboard-body");if(host)host.innerHTML=blogBoardHtml(BLOGBOARD.wid);}
// Regels op het bord: precies zoals op de Showdown (wwRij in weekworkout.js): score
// vooraan, naam = knop, notitie dicht tot je klikt.
function blogRij(r,rank){return wwRij(r,rank);}
function blogBoardDicht(){document.getElementById("blogboardmodal").classList.remove("show");BLOGBOARD=null;}
// ---------- Aanmeldlink (gratis blog-lid via een link, zoals Strivee's Subscribe) ----------
const blogJoinUrl=p=>p&&p.join_token?location.origin+location.pathname+"?blog="+p.join_token:"";
function kopieerNaarKlembord(t,melding){
  if(!t)return;
  const ok=()=>toast(melding||"Gekopieerd");
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(ok).catch(()=>window.prompt("Kopieer de link:",t));
  else window.prompt("Kopieer de link:",t);
}
function blogpKopieerLink(){const inp=document.getElementById("blogp-joinlink");if(inp&&inp.value)kopieerNaarKlembord(inp.value,"Aanmeldlink gekopieerd");}
function blogKopieerJoin(){kopieerNaarKlembord(blogJoinUrl(BLOG.cur),"Aanmeldlink gekopieerd, deel hem met wie mee wil doen");}
function blogCard(w){
  const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  const sel=blogSel.has(w.id)?" selected":"";
  const isRest=!blocks.length&&/^rest ?day$/i.test((w.title||"").trim());
  if(isRest)return '<div class="mcard planned'+sel+'" onclick="event.stopPropagation();blogOpenBuilder(\''+w.workout_date+'\',\''+w.id+'\')">'+blogCardTools(w)+'<div class="msc"><span style="color:#27b376">Rustdag</span></div></div>';
  let inner="";
  if(w.warmup)inner+='<div class="cblk k-grijs"><div class="n">Warmup'+((w.warmup_oefening_id||(w.warmup_media||[]).length)?' 🎥':'')+'</div><div class="pr">'+esc(w.warmup)+'</div></div>';
  blocks.forEach(b=>{const kleur=b.color?" k-"+esc(b.color):"";const lk=b.linked?" linked2":"";inner+='<div class="cblk'+kleur+lk+'"><div class="n">'+esc(b.label||"")+') '+esc(b.exercise||"")+'</div>'+(composePresc(b)?'<div class="pr">'+esc(composePresc(b))+'</div>':'')+'</div>';});
  if(w.cooldown)inner+='<div class="cblk k-grijs"><div class="n">Cooldown'+((w.cooldown_oefening_id||(w.cooldown_media||[]).length)?' 🎥':'')+'</div><div class="pr">'+esc(w.cooldown)+'</div></div>';
  return '<div class="mcard planned'+sel+'" onclick="event.stopPropagation();blogOpenBuilder(\''+w.workout_date+'\',\''+w.id+'\')">'+blogCardTools(w)+'<div class="msc"><span class="wtitle">'+esc(w.title||"Workout")+'</span></div>'+inner+'</div>';
}
// ---------- Slepen, dag kopiëren en selecteren (zelfde gedrag als de klant-kalender) ----------
let blogDragWid=null,blogSel=new Set();
function blogDragStart(ev,wid){
  blogDragWid=wid;
  try{ev.dataTransfer.effectAllowed="move";ev.dataTransfer.setData("text/plain",wid);}catch(e){}
  const card=ev.target.closest(".mcard");
  if(card&&ev.dataTransfer.setDragImage)ev.dataTransfer.setDragImage(card,24,18);
}
function blogDragEnd(){blogDragWid=null;document.querySelectorAll(".pe-cell.dragover").forEach(c=>c.classList.remove("dragover"));}
function blogDragOver(ev,cell){if(!blogDragWid&&!(typeof biebDragItem==="function"&&biebDragItem(ev)))return;ev.preventDefault();cell.classList.add("dragover");}
function blogDragLeave(cell){cell.classList.remove("dragover");}
async function blogDropDay(ev,ds){
  ev.preventDefault();
  document.querySelectorAll(".pe-cell.dragover").forEach(c=>c.classList.remove("dragover"));
  // Kaart uit het bibliotheek-venster (template, benchmark, oefening of weekworkout)?
  const item=(typeof biebLees==="function")?biebLees(ev):null;
  if(item){blogDragWid=null;await blogBiebDrop(item,ds);return;}
  const wid=blogDragWid;blogDragWid=null;
  if(!wid)return;
  const w=BLOG.workouts.find(x=>x.id===wid);
  if(!w||w.workout_date===ds)return; // loslaten op dezelfde dag = niks doen
  const{error}=await db.from("workouts").update({workout_date:ds}).eq("id",wid);
  if(error){toast(error.message||"Verplaatsen mislukt");return;}
  toast("Workout verplaatst");
  await blogHerlaad();
}
function blogKopieerDag(datum){
  const wos=BLOG.workouts.filter(w=>w.workout_date===datum);
  if(!wos.length){toast("Geen workout op deze dag");return;}
  klembordZet(wos.map(wTemplate));
  toast(wos.length>1?wos.length+" workouts gekopieerd, ga naar een dag en kies Plakken":"Workout gekopieerd, ga naar een dag en kies Plakken");
}
function blogToggleSelect(cb,wid){
  if(cb.checked)blogSel.add(wid);else blogSel.delete(wid);
  const card=cb.closest(".mcard");if(card)card.classList.toggle("selected",cb.checked);
  blogSelBar();
}
function blogSelClear(){
  blogSel.clear();
  document.querySelectorAll(".mcard.selected").forEach(c=>c.classList.remove("selected"));
  document.querySelectorAll(".cardsel:checked").forEach(c=>c.checked=false);
  blogSelBar();
}
function blogSelKopieer(){
  const ws=[...blogSel].map(id=>BLOG.workouts.find(w=>w.id===id)).filter(Boolean);
  if(!ws.length){toast("Niets geselecteerd");return;}
  klembordZet(ws.map(wTemplate));
  toast(ws.length+" workout"+(ws.length>1?"s":"")+" gekopieerd, ga naar een dag en kies Plakken");
}
async function blogSelVerwijder(){
  const ids=[...blogSel];
  if(!ids.length)return;
  if(!confirm(ids.length+" workout"+(ids.length>1?"s":"")+" uit het programma verwijderen?"))return;
  const{error}=await db.from("workouts").delete().in("id",ids);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  toast(ids.length+" verwijderd");
  await blogHerlaad();
}
// Zelfde zwarte selectiebalk als de klant-kalender (hergebruikt de #selbar-stijl).
function blogSelBar(){
  let bar=document.getElementById("selbar");
  if(!blogSel.size){if(bar)bar.remove();return;}
  if(!bar){bar=document.createElement("div");bar.id="selbar";document.body.appendChild(bar);}
  bar.innerHTML='<span class="n">'+blogSel.size+'</span><span>geselecteerd</span><button class="lnk" onclick="blogSelClear()">Selectie wissen</button>'+
    '<button class="ic" title="Klaarzetten om te plakken" onclick="blogSelKopieer()"><svg class="i sm-i"><use href="#i-copy"/></svg></button>'+
    '<button class="ic" title="Verwijderen" onclick="blogSelVerwijder()"><svg class="i sm-i"><use href="#i-trash"/></svg></button>';
}
// Dag-menu met dezelfde vier opties als de klant-kalender.
let insBlogDatum=null;
function blogDayMenu(ev,datum){
  ev.stopPropagation();
  document.querySelectorAll(".daymenu").forEach(x=>x.remove());
  const cell=ev.target.closest(".pe-cell");if(!cell)return;
  const d=document.createElement("div");d.className="daymenu";
  d.innerHTML='<button title="Workout toevoegen" onclick="event.stopPropagation();blogOpenBuilder(\''+datum+'\',null)"><svg class="i"><use href="#i-link"/></svg> Workout</button>'+
    '<button title="Dag op rustdag zetten" onclick="event.stopPropagation();blogRustdag(\''+datum+'\')"><svg class="i"><use href="#i-walk"/></svg> Rustdag</button>'+
    '<button title="Template of weekworkout invoegen" onclick="event.stopPropagation();blogPickProgram(\''+datum+'\')"><svg class="i"><use href="#i-doc"/></svg> Programma</button>'+
    '<button title="Gekopieerde workout plakken" onclick="event.stopPropagation();blogPlak(\''+datum+'\')"><svg class="i"><use href="#i-copy"/></svg> Plakken</button>';
  const addrow=cell.querySelector(".addrow2");
  if(addrow)addrow.insertAdjacentElement("afterend",d);else cell.prepend(d);
}
// Programma: de template/weekworkout-popup uit het klant-scherm, maar het
// invoegen landt op de blog-kalender (insDoel='blogcel', zie klant-scherm.js).
async function blogPickProgram(datum){
  document.querySelectorAll(".daymenu").forEach(x=>x.remove());
  insDoel="blogcel";insBlogDatum=datum;
  await openInsModal("op "+datum+" in "+(BLOG.cur.name||"dit programma"));
}
// Plakken: zelfde klembord als de klant-kalender (kopieer daar of hier).
async function blogPlak(datum){
  document.querySelectorAll(".daymenu").forEach(x=>x.remove());
  const kb=klembordLees();
  if(!kb||!kb.length){toast("Klembord is leeg. Kopieer eerst een workout (hier of bij een klant).");return;}
  const base=kb.map(t=>t.date).filter(Boolean).sort()[0]||null;
  for(const t of kb){
    const off=(t.date&&base)?dagenTussen(t.date,base):0;
    const dd=off?ymdPlus(datum,off):datum;
    const{data:w,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,audience:"blog",blog_program_id:BLOG.cur.id,workout_date:dd,title:t.title,coach_notes:t.coach_notes,warmup:t.warmup,cooldown:t.cooldown,warmup_oefening_id:t.warmup_oefening_id,cooldown_oefening_id:t.cooldown_oefening_id,warmup_media:t.warmup_media||null,cooldown_media:t.cooldown_media||null}).select().single();
    if(error){toast(error.message||"Plakken mislukt");return;}
    if(t.blocks.length){const{error:be}=await db.from("blocks").insert(t.blocks.map(b=>Object.assign({workout_id:w.id},b)));if(be){toast(be.message);return;}}
  }
  toast(kb.length>1?kb.length+" workouts geplakt":"Workout geplakt");
  await blogHerlaad();
}
// Kopiëren vanaf een blog-kaart (zelfde klembord-formaat als de klant-kalender).
function blogKopieer(id){
  const w=BLOG.workouts.find(x=>x.id===id);if(!w)return;
  klembordZet([wTemplate(w)]);
  toast("Workout gekopieerd, ga naar een dag en kies Plakken");
}
async function blogRustdag(datum){
  document.querySelectorAll(".daymenu").forEach(x=>x.remove());
  const{error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,audience:"blog",blog_program_id:BLOG.cur.id,workout_date:datum,title:"Rest Day"});
  if(error){toast(error.message||"Mislukt");return;}
  await blogHerlaad();
}
function blogOpenBuilder(datum,wid){document.querySelectorAll(".daymenu").forEach(x=>x.remove());BLOG.editDay=datum;BLOG.editWid=wid||null;blogRender();}
function blogCloseBuilder(){BLOG.editDay=null;BLOG.editWid=null;blogRender();}
function blogBuilderHtml(w){
  w=w||{};const blocks=(w.blocks||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0));
  const rows=blocks.length?blocks.map(b=>b.kind==="conditioning"?condRow(b):exRow(b)).join(""):exRow({});
  return '<div class="sec">'+avbOogHtml()+'<input id="w_title" class="row-title" placeholder="Titel (bijv. Kracht)" value="'+esc(w.title||"")+'"><textarea id="w_warmup" rows="1" placeholder="Warming-up toevoegen…">'+esc(w.warmup||"")+'</textarea>'+cwMediaHtml("warmup",w.warmup_oefening_id,w.warmup_media)+
    '</div>'+
    '<div id="exrows">'+rows+'</div>'+
    '<div class="addbtns"><button onclick="addExBtn()">+ Oefening</button><button onclick="addCondBtn()">+ Conditioning</button><button class="iconly" title="Dupliceer laatste blok" onclick="dupLast()">⧉</button></div>'+
    '<div class="sec"><textarea id="w_cooldown" rows="1" placeholder="Cooldown toevoegen…">'+esc(w.cooldown||"")+'</textarea>'+cwMediaHtml("cooldown",w.cooldown_oefening_id,w.cooldown_media)+'</div>'+
    '<div class="foot"><button class="save" onclick="blogSaveWorkout()">Opslaan</button><button class="cancel" onclick="blogCloseBuilder()">Annuleren</button>'+(w.id?'<button class="cancel" style="color:#e5484d;border-color:#f3b8ba" onclick="blogDeleteWorkout(\''+w.id+'\')">Verwijderen</button>':'')+'</div>';
}
async function blogHerlaad(){await blogLaadWeek();BLOG.editDay=null;BLOG.editWid=null;blogRender();}
async function blogSaveWorkout(){
  const g=id=>document.getElementById(id);
  const title=(g("w_title").value||"").trim();
  const rows=[...document.querySelectorAll("#exrows .exrow")].map((r,i)=>{const o=rowToObj(r);o.label=r.querySelector(".lbl-badge").textContent;o.sort=i+1;return o;}).filter(b=>b.exercise);
  const wf={company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,audience:"blog",blog_program_id:BLOG.cur.id,workout_date:BLOG.editDay,title:title||null,warmup:g("w_warmup").value.trim()||null,cooldown:g("w_cooldown").value.trim()||null,warmup_oefening_id:cwLees("warmup"),cooldown_oefening_id:cwLees("cooldown"),warmup_media:gmStripLees("warmup"),cooldown_media:gmStripLees("cooldown")};
  const mkBlocks=wid=>rows.map(b=>({workout_id:wid,kind:b.kind,label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription||null,notes:b.notes||null,sort:b.sort,color:b.color||null,score_type:b.score_type||"text",timecap_seconds:b.timecap_seconds||null,cap_score_type:b.cap_score_type||"reps",oefening_id:b.oefening_id||null,media:b.media||null,lift_id:b.lift_id||null,lift_scheme:b.lift_scheme||null,group_title:b.group_title||null}));
  try{
    if(BLOG.editWid){
      const{error:ue}=await db.from("workouts").update(wf).eq("id",BLOG.editWid);if(ue)throw ue;
      await syncBlocks(BLOG.editWid,rows); // gelogde scores van programma-volgers blijven staan
    }else{
      const{data:nw,error}=await db.from("workouts").insert(wf).select().single();if(error)throw error;
      if(rows.length){const{error:be}=await db.from("blocks").insert(mkBlocks(nw.id));if(be)throw be;}
    }
    toast("Workout opgeslagen");await blogHerlaad();
  }catch(e){toast(e.message||"Opslaan mislukt");}
}
async function blogDeleteWorkout(id){
  if(!confirm("Deze workout uit het programma verwijderen?"))return;
  const{error}=await db.from("workouts").delete().eq("id",id);
  if(error){toast(error.message||"Mislukt");return;}
  toast("Workout verwijderd");await blogHerlaad();
}

// ---------- Leden koppelen ----------
// Sinds 22 juli: élk lid (1-op-1 én blog) kan één of meerdere blogprogramma's
// volgen; de koppelingen staan in blog_program_members.
async function blogLedenOpen(){
  ensureBlogModals();
  document.getElementById("blogled-lijst").innerHTML='<div class="cempty">Laden…</div>';
  document.getElementById("blogledmodal").classList.add("show");
  const[rl,rm,ro]=await Promise.all([
    // Alleen leden van het eigen bedrijf: een platform_admin mag via RLS ook de SugarWOD-leden
    // van CrossFit Capelle (membership_type gym) lezen, en die staan los van YourProgram (Stefan 23 okt).
    db.from("profiles").select("id,first_name,last_name,email,avatar_url,membership_type").eq("archived",false).eq("company_id",ME.profile.company_id).or("role.eq.lid,coach_id.not.is.null").order("first_name"),
    db.from("blog_program_members").select("id,athlete_id,blog_program_id").eq("company_id",ME.profile.company_id),
    // Winkelabonnementen op dit programma (betaald, opgezegd of gestopt); nieuwste eerst.
    db.from("shop_orders").select("profile_id,status,cancel_at,withdrawn_at,created_at").eq("blog_program_id",BLOG.cur.id).in("status",["paid","processing","canceled"]).order("created_at",{ascending:false})
  ]);
  BLOG.leden=rl.data||[];
  BLOG.mems=rm.data||[];
  BLOG.orders=ro.error?[]:(ro.data||[]);
  // Wie betaalt, staat bovenaan: dan zie je in één oogopslag wie het programma via de winkel volgt.
  const betaalt=new Set(BLOG.orders.filter(o=>o.status!=="canceled").map(o=>o.profile_id));
  BLOG.leden.sort((a,b)=>(betaalt.has(b.id)?1:0)-(betaalt.has(a.id)?1:0));
  blogLedenRender();
}
function blogLedenRender(){
  const host=document.getElementById("blogled-lijst");if(!host)return;
  if(!BLOG.leden.length){host.innerHTML='<div class="cempty">Geen leden gevonden.</div>';return;}
  host.innerHTML=BLOG.leden.map(p=>{
    const volgt=(BLOG.mems||[]).filter(m=>m.athlete_id===p.id);
    const aan=volgt.some(m=>m.blog_program_id===BLOG.cur.id);
    const ander=volgt.filter(m=>m.blog_program_id!==BLOG.cur.id).map(m=>(BLOG.list.find(x=>x.id===m.blog_program_id)||{}).name).filter(Boolean);
    const typePill=p.membership_type==="one_on_one"?'<span class="cpill gray" style="font-size:9.5px">1-op-1</span>':'<span class="cpill gray" style="font-size:9.5px">blog</span>';
    // Alle winkelbestellingen van dit lid voor dit programma: lopende gaan voor gestopte.
    const mijn=(BLOG.orders||[]).filter(x=>x.profile_id===p.id);
    const lopend=mijn.filter(x=>x.status!=="canceled");
    const o=lopend[0]||mijn[0];
    const datum=d=>new Date(d).toLocaleDateString("nl-NL",{day:"numeric",month:"short",year:"numeric"});
    const aboPill=!o?"":lopend.length>1?'<span class="cpill bad" style="font-size:9.5px" title="Dit lid betaalt twee keer voor hetzelfde programma; zeg er één op in Stripe">2 lopende abonnementen</span>'
      :o.withdrawn_at?'<span class="cpill gray" style="font-size:9.5px">herroepen</span>'
      :o.status==="canceled"?'<span class="cpill gray" style="font-size:9.5px">abonnement gestopt</span>'
      :o.cancel_at?'<span class="cpill bad" style="font-size:9.5px" title="Opgezegd; tot deze datum ziet het lid het programma nog">opgezegd, stopt '+esc(datum(o.cancel_at))+'</span>'
      :'<span class="cpill ok" style="font-size:9.5px">betaald abonnement</span>';
    return '<div class="tagrow" style="cursor:pointer" onclick="blogLidToggle(\''+p.id+'\')">'+
      '<div class="cavc" style="width:28px;height:28px;font-size:10px;flex:none;'+avFotoStyle(p)+'">'+avFotoText(p)+'</div>'+
      '<div style="flex:1"><b style="font-size:12.5px">'+naamVan(p)+'</b> '+typePill+(aboPill?" "+aboPill:"")+(ander.length?'<div class="sm muted" style="font-size:11px">volgt ook: '+esc(ander.join(", "))+'</div>':'')+'</div>'+
      '<span class="cpill '+(aan?"ok":"gray")+'">'+(aan?"gekoppeld":"koppel")+'</span></div>';
  }).join("");
}
async function blogLidToggle(pid){
  const p=BLOG.leden.find(x=>x.id===pid);if(!p)return;
  const bestaand=(BLOG.mems||[]).find(m=>m.athlete_id===pid&&m.blog_program_id===BLOG.cur.id);
  // Betaalt dit lid nog via de winkel? Dan niet met één klik ontkoppelen: de betaling loopt door.
  const betaalt=(BLOG.orders||[]).find(o=>o.profile_id===pid&&o.status!=="canceled");
  if(bestaand&&betaalt&&!confirm("Dit lid betaalt nog via de winkel voor dit programma"+(betaalt.cancel_at?" (opgezegd, loopt tot "+new Date(betaalt.cancel_at).toLocaleDateString("nl-NL",{day:"numeric",month:"long"})+")":"")+". Ontkoppelen stopt de betaling niet; zeg het abonnement zo nodig op in Stripe. Toch ontkoppelen?"))return;
  if(bestaand){
    const{error}=await db.from("blog_program_members").delete().eq("id",bestaand.id);
    if(error){toast(error.message||"Ontkoppelen mislukt");return;}
    BLOG.mems=BLOG.mems.filter(m=>m!==bestaand);
  }else{
    const{data,error}=await db.from("blog_program_members").insert({company_id:ME.profile.company_id,blog_program_id:BLOG.cur.id,athlete_id:pid}).select().single();
    if(error){toast(error.message||"Koppelen mislukt");return;}
    BLOG.mems.push(data);
  }
  // profiles.blog_program_id gelijkhouden met het eerste programma, zodat
  // oudere app-builds (die nog één programma kennen) blijven werken.
  const eerste=((BLOG.mems||[]).find(m=>m.athlete_id===pid)||{}).blog_program_id||null;
  try{await db.from("profiles").update({blog_program_id:eerste}).eq("id",pid);}catch(e){}
  blogLedenRender(); // tellers verversen bij het sluiten (fillBlog)
}
async function blogLedenDicht(){
  document.getElementById("blogledmodal").classList.remove("show");
  await fillBlog(); // tellers verversen (lijst én detailkop)
}

function ensureBlogModals(){
  if(document.getElementById("blogmodals"))return;
  const d=document.createElement("div");d.id="blogmodals";
  d.innerHTML='<div class="lmodal" id="blogpmodal"><div class="box"><h3 id="blogp-titel">Programma aanmaken</h3>'+
      '<div class="field"><label>Naam</label><input id="blogp-naam" placeholder="bijv. YP Hyrox Program"></div>'+
      '<div class="field"><label>Omschrijving</label><textarea id="blogp-desc" style="min-height:70px" placeholder="Korte uitleg over dit programma…"></textarea></div>'+
      '<div class="field"><label>Etalage (programmering.yourprogram.nl)</label>'+
        '<div class="sm muted" style="margin:-2px 0 6px">Deze velden vullen de programmapagina op de etalage. Alleen programma’s met "Zichtbaar op de etalage" aan worden getoond.</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
          '<div><div class="sm muted">Adres (slug)</div><input id="blogp-slug" placeholder="bijv. the-next-step"></div>'+
          '<div><div class="sm muted">Volgorde (laag = eerst)</div><input id="blogp-sort" type="number" min="0" placeholder="100"></div>'+
          '<div><div class="sm muted">Niveau (1-5)</div><select id="blogp-level"><option value="">–</option><option value="1">1 · beginner</option><option value="2">2</option><option value="3">3 · gemiddeld</option><option value="4">4</option><option value="5">5 · top</option></select></div>'+
          '<div><div class="sm muted">Trainingen per week</div><input id="blogp-days" type="number" min="1" max="7" placeholder="5"></div>'+
        '</div>'+
        '<div class="sm muted" style="margin-top:6px">Omslagfoto (link)</div><input id="blogp-cover" placeholder="https://…/foto.jpg">'+
        '<div class="sm muted" style="margin-top:6px">Lange omschrijving (voor de programmapagina; lege regel = nieuwe alinea)</div><textarea id="blogp-desclong" style="min-height:110px" placeholder="Voor wie is dit programma, hoe ziet een week eruit, wat mag je verwachten…"></textarea></div>'+
      '<div class="field"><label>Type</label><select id="blogp-type">'+BLOG_TYPES.map(t=>'<option value="'+t[0]+'">'+t[1]+'</option>').join("")+'</select></div>'+
      '<div class="field"><label>Prijstekst (alleen weergave, als er geen winkelprijs is)</label><input id="blogp-prijs" placeholder="bijv. €39 /maand (leeg = gratis)"></div>'+
      '<div class="field"><label>Winkel</label>'+
        '<label class="pf-toggle" style="margin:2px 0 6px"><input type="checkbox" id="blogp-koop" onchange="blogpKoopToggle()"><span class="pf-sw"></span> Zichtbaar op de etalage (te koop of gratis)</label>'+
        '<div id="blogp-koopvak" style="display:none;gap:8px;align-items:center"><span class="sm muted">Prijs €</span><input id="blogp-koopprijs" placeholder="39,00" style="width:90px"><select id="blogp-koopint" style="width:130px"><option value="month">per maand</option><option value="week">per week</option><option value="year">per jaar</option></select></div>'+
        '<div class="sm muted" style="margin-top:4px">Betaling loopt via Stripe; na betaling krijgt de koper automatisch een uitnodiging voor dit programma. Prijs leeg = gratis programma: dan moet de aanmeldlink hieronder aan staan.</div></div>'+
      '<div class="field"><label>Aanmeldlink (gratis blog-lid)</label>'+
        '<label class="pf-toggle" style="margin:2px 0 6px"><input type="checkbox" id="blogp-join"><span class="pf-sw"></span> Iedereen met de link kan zich zelf aanmelden</label>'+
        '<div style="display:flex;gap:6px;align-items:center"><input id="blogp-joinlink" readonly style="flex:1;font-size:12px" placeholder="De link verschijnt na het aanmaken"><button class="btn ghost sm" type="button" onclick="blogpKopieerLink()">Kopiëren</button></div>'+
        '<div class="sm muted" style="margin-top:4px">Wie zich via de link aanmeldt wordt gratis blog-lid van dit programma (nooit 1-op-1, geen coach). Link uit = geen nieuwe aanmeldingen; bestaande leden blijven.</div></div>'+
      '<div class="field"><label>Zichtbaar voor coaches</label><div class="sm muted" style="margin:-2px 0 6px">Eigenaar en beheerder zien altijd alle programma\'s; geen selectie = alle coaches.</div><div id="blogp-coaches"></div></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" onclick="blogpOpslaan()">Opslaan</button><button class="btn ghost" onclick="blogpDicht()">Annuleren</button></div>'+
      '<div class="msg" id="blogp-msg"></div></div></div>'+
    '<div class="lmodal" id="blogboardmodal" style="z-index:397"><div class="box" style="width:640px;max-width:96vw">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3 style="margin:0" id="blogboard-titel">Leaderboard</h3><span onclick="blogBoardDicht()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
      '<div class="sm muted" style="margin-bottom:6px">Openbare scores per onderdeel, ook van de Showdown als die in deze workout zit. Fist bumps en reacties werken zoals bij de Showdown.</div>'+
      '<div id="blogboard-body" style="max-height:62vh;overflow:auto"></div></div></div>'+
    '<div class="lmodal" id="blogledmodal" style="z-index:398"><div class="box" style="width:460px;max-width:94vw">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">Leden koppelen</h3><span onclick="blogLedenDicht()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
      '<div class="sm muted" style="margin-bottom:8px">Klik op een lid om te (ont)koppelen. Een lid kan meerdere programma\'s volgen.</div>'+
      '<div id="blogled-lijst" style="max-height:52vh;overflow:auto"></div>'+
      '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="blogLedenDicht()">Sluiten</button></div></div></div>'+
    '<div class="lmodal" id="blogkkmodal" style="z-index:399"><div class="box" style="width:560px;max-width:94vw">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">Klantkaart</h3><span onclick="blogKlantKaartDicht()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
      '<div id="blogkk-body"></div></div></div>';
  document.body.appendChild(d);
}

// ---------- Klanten (overzicht per programma; verzoek Stefan 22 okt 2026) ----------
// Wie volgt welk programma, sinds wanneer, betaald via de winkel of gratis, opgezegd
// of gestopt. Leest profiles, blog_program_members en shop_orders (staf mag die lezen).
// Opzeggen en terugbetalen vanuit dit overzicht: stap 2 (serverfunctie shop-beheer).
function blogPrijsTekst(p){
  if(p.for_sale&&p.price_cents){
    const per={month:"maand",week:"week",year:"jaar"}[p.price_interval||"month"]||"maand";
    return "€"+(p.price_cents/100).toFixed(2).replace(".",",")+" /"+per;
  }
  return p.price_text||"";
}
function blogTab(t){BLOG.tab=t;if(t==="klanten")blogKlantenLaad();else blogRender();}
function blogKlantenOpen(pid){BLOG.cur=null;BLOG.tab="klanten";BLOG.klantFilter=pid||null;blogKlantenLaad();}
async function blogKlantenLaad(){
  BLOG.klanten=null;blogRender();
  const cid=ME.profile.company_id;
  const[rl,rm,ro]=await Promise.all([
    db.from("profiles").select("id,first_name,last_name,email,avatar_url,membership_type,archived").eq("company_id",cid).or("role.eq.lid,coach_id.not.is.null"),
    db.from("blog_program_members").select("id,athlete_id,blog_program_id,created_at").eq("company_id",cid),
    db.from("shop_orders").select("id,profile_id,email,blog_program_id,status,created_at,updated_at,cancel_at,cancel_requested_at,withdrawn_at,stripe_subscription_id,stripe_customer_id,stripe_session_id").eq("company_id",cid).order("created_at",{ascending:false})
  ]);
  const prof={};(rl.data||[]).forEach(p=>prof[p.id]=p);
  const orders=ro.error?[]:(ro.data||[]);
  const rang=s=>s==="paid"?3:s==="processing"?2:s==="canceled"?1:0;
  const rows=[],gezien=new Set();
  (rm.data||[]).forEach(m=>{
    const p=prof[m.athlete_id];if(!p)return;
    // Lopende bestelling gaat voor een gestopte; nieuwste eerst (de lijst is al zo gesorteerd).
    const mijn=orders.filter(o=>o.profile_id===m.athlete_id&&o.blog_program_id===m.blog_program_id).sort((a,b)=>rang(b.status)-rang(a.status));
    const o=mijn[0]||null;if(o)gezien.add(o.id);
    rows.push({key:m.athlete_id+"|"+m.blog_program_id+"|"+(o?o.id:""),mid:m.id,p,pid:m.blog_program_id,sinds:(o&&o.created_at<m.created_at)?o.created_at:m.created_at,o,lid:true});
  });
  // Bestellingen zonder koppeling meer (herroepen, gestopt, mislukt): alleen bij "ook gestopte tonen".
  orders.forEach(o=>{
    if(gezien.has(o.id)||!o.blog_program_id||o.status==="pending")return;
    const p=(o.profile_id&&prof[o.profile_id])||{id:o.profile_id,first_name:null,last_name:null,email:o.email,membership_type:null,archived:true};
    rows.push({key:(p.id||"")+"|"+o.blog_program_id+"|"+o.id,mid:null,p,pid:o.blog_program_id,sinds:o.created_at,o,lid:false});
  });
  BLOG.klanten=rows;blogRender();
}
// Status van één regel: tekst voor de pil, en of het abonnement gestopt is.
function blogKlantStatus(r){
  const o=r.o;const d=x=>new Date(x).toLocaleDateString("nl-NL",{day:"numeric",month:"short",year:"numeric"});
  if(!o)return r.p.membership_type==="one_on_one"?{html:'<span class="cpill gray">via 1-op-1</span>',rang:2,gestopt:false}:{html:'<span class="cpill gray">Gratis</span>',rang:3,gestopt:false};
  if(o.withdrawn_at)return{html:'<span class="cpill gray">Herroepen op '+esc(d(o.withdrawn_at))+'</span>',rang:5,gestopt:true};
  if(o.status==="canceled")return{html:'<span class="cpill gray">Gestopt op '+esc(d(o.cancel_at||o.updated_at))+'</span>',rang:5,gestopt:true};
  if(o.status==="failed")return{html:'<span class="cpill bad">Betaling mislukt</span>',rang:4,gestopt:true};
  if(o.status==="processing")return{html:'<span class="cpill gray">Betaling wordt verwerkt</span>',rang:1,gestopt:false};
  if(o.cancel_at)return{html:'<span class="cpill bad">Opgezegd, stopt '+esc(d(o.cancel_at))+'</span>',rang:1,gestopt:false};
  return{html:'<span class="cpill ok">Betaald</span>',rang:0,gestopt:false};
}
function blogKlantenHtml(vast){
  const progs=BLOG.list;
  const filter='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 12px">'+
    (vast?"":'<select class="lid-in" style="width:auto;min-width:200px" onchange="blogKlantFilter(this.value)"><option value="">Alle programma\'s</option>'+
      progs.map(p=>'<option value="'+p.id+'"'+(BLOG.klantFilter===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join("")+'</select>')+
    '<input class="lid-in" style="width:100%;max-width:260px" placeholder="Zoek een klant…" oninput="blogKlantZoek(this.value)" value="'+esc(BLOG.klantZoek)+'">'+
    '<label class="sm muted" style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap"><input type="checkbox" '+(BLOG.klantGestopt?'checked':'')+' onchange="blogKlantGestopt(this.checked)"> Ook gestopte abonnementen tonen</label>'+
    '</div>';
  if(BLOG.klanten===null)return filter+'<div class="card"><div class="cempty">Laden…</div></div>';
  const q=(BLOG.klantZoek||"").toLowerCase().trim();
  const rows=BLOG.klanten.map(r=>({...r,st:blogKlantStatus(r),prog:progs.find(p=>p.id===r.pid)||{name:"?"}}))
    .filter(r=>!BLOG.klantFilter||r.pid===BLOG.klantFilter)
    .filter(r=>BLOG.klantGestopt||!r.st.gestopt)
    .filter(r=>!q||((r.p.first_name||"")+" "+(r.p.last_name||"")+" "+(r.p.email||"")+" "+r.prog.name).toLowerCase().includes(q))
    .sort((a,b)=>a.st.rang-b.st.rang||(naamVan(a.p)).localeCompare(naamVan(b.p)));
  const betaald=rows.filter(r=>r.o&&r.o.status==="paid").length;
  const kop='<div class="thead"><div style="flex:2.2">Klant</div><div style="flex:1.2">Programma</div><div style="flex:.9">Sinds</div><div style="flex:1.6">Status</div><div style="flex:1.1;text-align:right">Acties</div></div>';
  const lijst=rows.length?rows.map(r=>{
    const d=new Date(r.sinds).toLocaleDateString("nl-NL",{day:"numeric",month:"short",year:"numeric"});
    const typePill=r.p.membership_type==="one_on_one"?' <span class="cpill gray" style="font-size:9.5px">1-op-1</span>':'';
    return '<div class="trow" style="align-items:center" data-key="'+esc(r.key)+'">'+
      '<div style="flex:2.2;display:flex;align-items:center;gap:10px;min-width:0"><div class="cavc" style="width:32px;height:32px;font-size:11px;flex:none;'+avFotoStyle(r.p)+'">'+avFotoText(r.p)+'</div>'+
        '<div style="min-width:0"><b style="font-size:12.5px">'+naamVan(r.p)+'</b>'+typePill+(r.p.archived?' <span class="cpill gray" style="font-size:9.5px">archief</span>':'')+'<div class="sm muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis">'+esc(r.p.email||"")+'</div></div></div>'+
      '<div style="flex:1.2" class="sm">'+esc(r.prog.name)+'</div>'+
      '<div style="flex:.9" class="sm muted">'+esc(d)+'</div>'+
      '<div style="flex:1.6" class="sm">'+r.st.html+'</div>'+
      '<div style="flex:1.1;text-align:right" class="sm">'+blogKlantActies(r)+'</div></div>';
  }).join(""):'<div class="cempty">'+(BLOG.klanten.length?'Geen klant gevonden.':'Nog geen klanten voor dit programma.')+'</div>';
  return filter+'<div class="sm muted" style="margin:0 0 8px">'+rows.length+' klant'+(rows.length===1?'':'en')+' · '+betaald+' betaald</div><div class="card">'+kop+lijst+'</div>';
}
// Knoppen per regel (eigenaar/beheerder): opzeggen, intrekken, direct stoppen,
// terugbetalen en in Stripe openen. Alles via de serverfunctie shop-beheer, die de rol
// zelf nog eens controleert en met Stripe praat.
const blogKlantMagBeheren=()=>["eigenaar","platform_admin"].includes(myRole());
function blogKlantActies(r){
  if(!r.p||!r.p.id)return ""; // bestelling zonder account: niets te doen
  return '<button class="kebab" title="Acties" onclick="blogKlantMenu(event,\''+esc(r.key)+'\')">⋮</button>';
}
// Het menu per regel. Winkelacties (opzeggen, stoppen, terugbetalen) en archiveren/verwijderen
// alleen voor eigenaar en beheerder; "van programma afhalen" mag elke coach (zoals Leden koppelen).
function blogKlantMenu(ev,key){
  ev.stopPropagation();
  const row=ev.target.closest(".trow");if(!row)return;
  const bestond=row.querySelector(".coachmenu");document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  if(bestond)return;
  const r=(BLOG.klanten||[]).find(x=>x.key===key);if(!r)return;
  const o=r.o,mag=blogKlantMagBeheren(),lopend=!!o&&o.status==="paid"&&!o.withdrawn_at;
  const k=JSON.stringify(key).replace(/"/g,"&quot;");
  let h="";
  if(o&&mag){
    const test=/^cs_test_/.test(o.stripe_session_id||"");
    const stripeUrl="https://dashboard.stripe.com/"+(test?"test/":"")+(o.stripe_subscription_id?"subscriptions/"+o.stripe_subscription_id:"customers/"+o.stripe_customer_id);
    if(lopend)h+=(o.cancel_at
      ?'<button onclick="event.stopPropagation();blogKlantActie(\''+o.id+'\',\'intrekken\')">Opzegging intrekken</button>'
      :'<button onclick="event.stopPropagation();blogKlantActie(\''+o.id+'\',\'opzeggen\')">Opzeggen (1 maand)</button>')+
      '<button onclick="event.stopPropagation();blogKlantActie(\''+o.id+'\',\'stoppen\')">Direct stoppen</button>';
    if(o.stripe_customer_id)h+='<button onclick="event.stopPropagation();blogKlantActie(\''+o.id+'\',\'terugbetalen\')">Terugbetalen…</button>';
    h+='<button onclick="event.stopPropagation();window.open(\''+stripeUrl+'\',\'_blank\')">In Stripe openen</button>';
  }
  if(r.lid&&r.mid)h+='<button onclick="event.stopPropagation();blogKlantOntkoppel('+k+')">Van programma afhalen</button>';
  if(mag){
    h+='<button onclick="event.stopPropagation();blogKlantArchiveer('+k+','+(r.p.archived?"false":"true")+')">'+(r.p.archived?"Uit archief halen":"Archiveren")+'</button>';
    if(!lopend)h+='<button class="danger" onclick="event.stopPropagation();blogKlantVerwijder('+k+')">Account verwijderen…</button>';
  }
  if(!h)return;
  const m=document.createElement("div");m.className="coachmenu";m.innerHTML=h;
  row.style.position="relative";row.appendChild(m);
}
// Koppeling met dit programma weghalen (zelfde regels als Leden koppelen).
async function blogKlantOntkoppel(key){
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  const r=(BLOG.klanten||[]).find(x=>x.key===key);if(!r||!r.mid)return;
  const wie=naamVan(r.p).replace(/&amp;/g,"&"),prog=(BLOG.list.find(p=>p.id===r.pid)||{}).name||"dit programma";
  const betaalt=r.o&&r.o.status==="paid"&&!r.o.withdrawn_at;
  if(betaalt&&!confirm(wie+" betaalt nog via de winkel voor "+prog+(r.o.cancel_at?" (opgezegd, loopt tot "+new Date(r.o.cancel_at).toLocaleDateString("nl-NL",{day:"numeric",month:"long"})+")":"")+". Afhalen stopt de betaling niet; zeg het abonnement zo nodig eerst op. Toch afhalen?"))return;
  if(!betaalt&&!confirm(wie+" van "+prog+" afhalen? Het programma verdwijnt uit de app; het account blijft bestaan."))return;
  const{error}=await db.from("blog_program_members").delete().eq("id",r.mid);
  if(error){toast(error.message||"Afhalen mislukt");return;}
  // profiles.blog_program_id gelijkhouden met het eerste overgebleven programma (oudere app-builds).
  try{
    const{data:rest}=await db.from("blog_program_members").select("blog_program_id").eq("athlete_id",r.p.id).order("created_at").limit(1);
    await db.from("profiles").update({blog_program_id:(rest&&rest[0])?rest[0].blog_program_id:null}).eq("id",r.p.id);
  }catch(e){}
  toast(wie+" is van "+prog+" afgehaald");
  await fillBlog();await blogKlantenLaad();
}
// Archiveren of terughalen (zelfde check als op de Klanten-pagina).
async function blogKlantArchiveer(key,arch){
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  const r=(BLOG.klanten||[]).find(x=>x.key===key);if(!r||!r.p.id)return;
  const wie=naamVan(r.p).replace(/&amp;/g,"&");
  if(arch){
    const{data:lo}=await db.from("shop_orders").select("id,cancel_at").eq("profile_id",r.p.id).in("status",["paid","processing"]).is("withdrawn_at",null);
    if((lo||[]).length&&!confirm(wie+" betaalt nog via de winkel. In het archief kan hij in de app niet meer zelf opzeggen, terwijl de betaling doorloopt. Zeg het abonnement eerst op. Toch archiveren?"))return;
    if(!(lo||[]).length&&!confirm(wie+" archiveren? Hij kan dan niet meer inloggen in de app; alles blijft bewaard en je kunt hem later terughalen."))return;
  }
  const{error}=await db.from("profiles").update({archived:arch}).eq("id",r.p.id);
  if(error){toast(error.message||"Mislukt");return;}
  toast(arch?wie+" gearchiveerd":wie+" teruggehaald");
  await blogKlantenLaad();
}
// Account definitief verwijderen via de serverfunctie (alleen als er geen lopend abonnement is).
async function blogKlantVerwijder(key){
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  const r=(BLOG.klanten||[]).find(x=>x.key===key);if(!r||!r.p.id)return;
  const wie=naamVan(r.p).replace(/&amp;/g,"&");
  if(!confirm("Het account van "+wie+" ("+(r.p.email||"")+") DEFINITIEF verwijderen?\n\nAlles gaat weg: inlog, profiel, scores, berichten, foto's en video's. Dit is niet terug te draaien. Wil je het alleen uit beeld, kies dan Archiveren."))return;
  const typ=prompt("Typ VERWIJDER om te bevestigen:","");
  if(typ!=="VERWIJDER"){toast("Niet verwijderd");return;}
  let data=null,error=null;
  try{({data,error}=await db.functions.invoke("shop-beheer",{body:{actie:"account_verwijderen",profile_id:r.p.id}}));}catch(e){error=e;}
  if(!error&&data&&data.error)error={message:data.error};
  if(error){
    let tekst=error.message||"Verwijderen lukt nu niet";
    try{if(error.context&&typeof error.context.json==="function"){const j=await error.context.json();if(j&&j.error)tekst=j.error;}}catch(e){}
    toast(tekst);return;
  }
  toast("Account van "+wie+" verwijderd"+(data&&data.fouten&&data.fouten.length?" (niet alles kon worden opgeruimd, zie de melding)":""));
  await fillBlog();await blogKlantenLaad();
}
async function blogKlantActie(oid,actie){
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  const r=(BLOG.klanten||[]).find(x=>x.o&&x.o.id===oid);if(!r)return;
  const wie=naamVan(r.p).replace(/&amp;/g,"&"),prog=(BLOG.list.find(p=>p.id===r.pid)||{}).name||"het programma";
  const roep=async body=>{
    let data=null,error=null;
    try{({data,error}=await db.functions.invoke("shop-beheer",{body:{order_id:oid,...body}}));}catch(e){error=e;}
    if(!error&&data&&data.error)error={message:data.error};
    if(error){
      // supabase-js geeft bij een 4xx een FunctionsHttpError; de echte tekst zit in de response.
      let tekst=error.message||"Dat lukt nu niet";
      try{if(error.context&&typeof error.context.json==="function"){const j=await error.context.json();if(j&&j.error)tekst=j.error;}}catch(e){}
      toast(tekst);return null;
    }
    return data;
  };
  const datum=iso=>iso?new Date(iso).toLocaleDateString("nl-NL",{day:"numeric",month:"long",year:"numeric"}):"";
  if(actie==="opzeggen"){
    if(!confirm("Het abonnement van "+wie+" op "+prog+" opzeggen?\n\nDe opzegtermijn is één maand: het stopt een maand na vandaag, de laatste maand naar rato. "+wie+" krijgt een bevestigingsmail."))return;
    const reden=prompt("Reden (optioneel, alleen zichtbaar voor jullie en in Stripe):","")||"";
    const d=await roep({actie:"opzeggen",reden});if(!d)return;
    toast(d.al?"Was al opgezegd; stopt op "+datum(d.stopt_op):"Opgezegd; stopt op "+datum(d.stopt_op)+(d.mail?"":" (geen bevestigingsmail, stuur die zelf)"));
  }else if(actie==="intrekken"){
    if(!confirm("De opzegging van "+wie+" voor "+prog+" intrekken? Het abonnement loopt dan gewoon door; "+wie+" krijgt een mail."))return;
    const d=await roep({actie:"intrekken"});if(!d)return;
    toast("Opzegging ingetrokken");
  }else if(actie==="stoppen"){
    if(!confirm("Het abonnement van "+wie+" op "+prog+" PER DIRECT stoppen?\n\n"+wie+" verliest meteen toegang tot het programma. Er wordt niets terugbetaald; dat doe je zo nodig apart via Terugbetalen."))return;
    if(!confirm("Zeker weten? Dit is niet terug te draaien; de klant zou opnieuw moeten bestellen."))return;
    const d=await roep({actie:"stoppen"});if(!d)return;
    toast("Abonnement gestopt; binnen een minuut verdwijnt het programma bij de klant");
  }else if(actie==="terugbetalen"){
    toast("Laatste betaling opzoeken…");
    const info=await roep({actie:"info"});if(!info)return;
    const b=info.laatste_betaling;
    if(!b||!b.nog_cents){toast("Er is geen geslaagde betaling om terug te betalen.");return;}
    const max=b.nog_cents;
    const inv=prompt("Bedrag terugbetalen aan "+wie+" (laatste betaling "+datum(b.datum)+", nog terug te betalen maximaal €"+(max/100).toFixed(2).replace(".",",")+"):\n\nBedrag in euro:",(max/100).toFixed(2).replace(".",","));
    if(inv===null)return;
    const cents=Math.round(parseFloat(String(inv).replace(/[€\s]/g,"").replace(",","."))*100);
    if(!(cents>0)){toast("Geen geldig bedrag");return;}
    if(cents>max){toast("Maximaal €"+(max/100).toFixed(2).replace(".",",")+" kan nog terug");return;}
    if(!confirm("€"+(cents/100).toFixed(2).replace(".",",")+" terugbetalen aan "+wie+" via Stripe? Dit is niet terug te draaien."))return;
    const d=await roep({actie:"terugbetalen",bedrag_cents:cents});if(!d)return;
    toast("Terugbetaald: €"+(d.bedrag_cents/100).toFixed(2).replace(".",",")+". Stripe stuurt het binnen 5 tot 10 werkdagen terug naar de klant.");
  }
  await blogKlantenLaad();
}
function blogKlantFilter(v){BLOG.klantFilter=v||null;blogRender();}
function blogKlantZoek(v){BLOG.klantZoek=v||"";const cp=document.getElementById("cpage");if(!cp)return;blogRender();const i=cp.querySelector('input[placeholder="Zoek een klant…"]');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}}
function blogKlantGestopt(aan){BLOG.klantGestopt=!!aan;blogRender();}


// ---------- Programmapagina: cijfers (Data), leaderboards, klantkaart, sneltoetsen ----------
// (22 okt 2026, verzoek Stefan.) De cijfers komen uit de serverfunctie blog_program_data:
// één aanroep per programma, alleen voor staf van het bedrijf. Zie PROGRESS.md.
async function blogDataLaad(force){
  const p=BLOG.cur;if(!p)return;
  if(!force&&BLOG.dataPid===p.id&&BLOG.data)return;
  const pid=p.id;
  BLOG.dataLaden=true;BLOG.dataFout=null;
  if(force)blogDataToon();
  let data=null,error=null;
  try{({data,error}=await db.rpc("blog_program_data",{p_program:pid}));}catch(e){error=e;}
  BLOG.dataLaden=false;
  if(!BLOG.cur||BLOG.cur.id!==pid)return; // intussen is een ander programma geopend
  BLOG.dataPid=pid;
  if(error){BLOG.dataFout=(error&&error.message)||"Cijfers laden mislukt";BLOG.data=null;}
  else{BLOG.data=data||null;}
  blogDataToon();
}
// Alleen de stukken verversen die de cijfers tonen; de kalender (en een open bouwer) blijft staan.
function blogDataToon(){
  const s=document.getElementById("bs-stats");if(s)s.innerHTML=blogSideStats();
  if(BLOG.paneel==="data"||BLOG.paneel==="boards"){const m=document.getElementById("cmain");if(m)m.innerHTML=blogPaneelHtml();}
}
function blogSideStats(){
  if(BLOG.dataFout)return '<span title="'+esc(BLOG.dataFout)+'">Cijfers niet geladen</span>';
  const d=BLOG.data;if(!d||BLOG.dataPid!==(BLOG.cur||{}).id)return "Cijfers laden…";
  const a=d.actief||{},v=d.volgers||{};
  return '<span title="Betaald via de winkel">'+Number(v.betaald||0)+' betaald</span> · <span title="Sporters die de laatste 30 dagen iets logden">'+Number(a.d30||0)+' actief (30 d)</span>';
}
const blogEuro=c=>"€ "+(Number(c||0)/100).toFixed(2).replace(".",",");
function blogDatumKort(iso){if(!iso)return "";const d=new Date(String(iso).length>10?iso:iso+"T12:00:00");return d.getDate()+" "+MAANDKORT[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?" "+d.getFullYear():"");}
function blogMaandKort(ym){const[y,m]=String(ym).split("-");return MAANDKORT[parseInt(m,10)-1]+" "+y;}
function blogDataStatus(k){
  if(k.betaald)return k.opgezegd_tot?'<span class="cpill bad" style="font-size:10px">Opgezegd, stopt '+esc(blogDatumKort(k.opgezegd_tot))+'</span>':'<span class="cpill ok" style="font-size:10px">Betaald</span>';
  return k.membership_type==="one_on_one"?'<span class="cpill gray" style="font-size:10px">via 1-op-1</span>':'<span class="cpill gray" style="font-size:10px">Gratis</span>';
}
function blogDataHtml(){
  const p=BLOG.cur,d=BLOG.data;
  let html='<div class="hrow" style="margin:0 0 4px"><h2 style="margin:0">Data · '+esc(p.name)+'</h2><div style="margin-left:auto;display:flex;gap:8px;align-items:center">'+
    (d&&d.gemaakt_op?'<span class="sm muted">Bijgewerkt '+esc(new Date(d.gemaakt_op).toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"}))+'</span>':'')+
    '<button class="btn ghost sm" onclick="blogDataLaad(true)">Verversen</button></div></div>';
  if(BLOG.dataLaden||(!d&&!BLOG.dataFout))return html+'<div class="card" style="margin-top:12px"><div class="cempty">Cijfers laden…</div></div>';
  if(BLOG.dataFout)return html+'<div class="card" style="margin-top:12px"><div class="cempty">Kon de cijfers niet laden: '+esc(BLOG.dataFout)+'</div></div>';
  const v=d.volgers||{},a=d.actief||{},pd=d.programma_dagen||{},rs=d.rx_scaled||{};
  const n=x=>Number(x||0);
  const volgers=n(v.totaal);
  const mogelijk=n(pd.d30)*volgers;
  const volt=mogelijk?Math.min(100,Math.round(100*n(a.sessies_30d)/mogelijk)):null;
  const rxTot=n(rs.rx)+n(rs.scaled);
  const beheer=blogKlantMagBeheren();
  const omzet=beheer&&p.price_cents>0;
  const interval=p.price_interval==="week"?"/week":p.price_interval==="year"?"/jaar":"/maand";
  const tile=(val,label,sub,kleur)=>'<div class="stat"><div class="n'+(kleur?" "+kleur:"")+'">'+val+'</div><div class="l">'+label+'</div>'+(sub?'<div class="s">'+sub+'</div>':'')+'</div>';
  html+='<div class="bl-tiles">'+
    tile(volgers,"Volgers",n(v.betaald)+" betaald · "+n(v.gratis)+" gratis · "+n(v.een_op_een)+" via 1-op-1"+(n(v.opgezegd)?" · "+n(v.opgezegd)+" opgezegd":""))+
    tile(n(a.d7)+' <span class="muted" style="font-size:14px">/ '+n(a.d30)+'</span>',"Actief (7 / 30 dagen)","Sporters die iets logden")+
    tile(n(a.sessies_30d),"Sessies (30 dagen)",n(pd.d30)+" programmadagen"+(n(a.gemist_30d)?" · "+n(a.gemist_30d)+" gemist":""))+
    tile(volt===null?"–":volt+"%","Voltooiing (30 dagen)",mogelijk?n(a.sessies_30d)+" van "+mogelijk+" mogelijke sessies":"Nog geen programmadagen",volt!==null&&volt>=60?"ok":"")+
    tile(rxTot?Math.round(100*n(rs.rx)/rxTot)+"% Rx":"–","Rx / Scaled",rxTot?n(rs.rx)+" Rx · "+n(rs.scaled)+" Scaled":"Nog geen scores")+
    (omzet?tile(blogEuro(n(v.betaald)*p.price_cents)+' <span class="muted" style="font-size:12px">'+interval+'</span>',"Geschatte omzet","Betaalde abonnementen × huidige prijs. Het exacte bedrag staat in Stripe."):"")+
  '</div>';
  const weken=d.per_week||[],max=Math.max(1,...weken.map(w=>n(w.voltooid)));
  const nuWk=ymd(mondayOf(new Date()));
  const bars=weken.length?'<div class="bl-bars">'+weken.map(w=>'<div class="bl-bar'+(w.week===nuWk?" nu":"")+'" title="Week van '+esc(blogDatumKort(w.week))+': '+n(w.voltooid)+' sessies, '+n(w.atleten)+' sporters'+(n(w.gemist)?', '+n(w.gemist)+' gemist':'')+'"><b>'+n(w.voltooid)+'</b><i style="height:'+Math.max(2,Math.round(100*n(w.voltooid)/max))+'%"></i><span>wk '+isoWeek(new Date(w.week+"T12:00:00"))+'</span></div>').join("")+'</div>'+
    '<div class="sm muted">Gelogde sessies per week, met het weeknummer eronder. Deze week staat in donkerblauw.</div>':'<div class="nodata">Nog geen data</div>';
  const maanden=d.per_maand||[];
  const mTabel=maanden.length?'<table class="bl-tabel"><tr><th>Maand</th><th class="r">Nieuw</th><th class="r" title="Nieuwe betaalde abonnementen">Betaald +</th><th class="r" title="Gestopte betaalde abonnementen">Betaald −</th><th class="r" title="Betaalde abonnementen aan het eind van de maand">Betaald</th>'+(omzet?'<th class="r">Omzet*</th>':'')+'<th class="r">Sessies</th><th class="r">Sporters</th></tr>'+
    maanden.map((m,i)=>'<tr'+(i===maanden.length-1?' class="nu"':'')+'><td>'+esc(blogMaandKort(m.maand))+'</td><td class="r">'+n(m.nieuw)+'</td><td class="r">'+n(m.betaald_nieuw)+'</td><td class="r">'+n(m.betaald_gestopt)+'</td><td class="r">'+n(m.betaald_actief)+'</td>'+(omzet?'<td class="r">'+blogEuro(n(m.betaald_actief)*p.price_cents)+'</td>':'')+'<td class="r">'+n(m.sessies)+'</td><td class="r">'+n(m.atleten)+'</td></tr>').join("")+'</table>'+
    (omzet?'<div class="sm muted" style="margin-top:6px">* Schatting: betaalde abonnementen × de huidige prijs. Het echte bedrag staat in Stripe.</div>':''):'<div class="nodata">Nog geen data</div>';
  const lijst=(rows,leeg,veld)=>rows.length?'<div class="bl-lijst">'+rows.map(r=>'<button onclick="blogBoardOpen(\''+r.workout_id+'\')" title="Leaderboard van deze workout openen"><span class="d">'+esc(blogDatumKort(r.workout_date))+'</span><span style="min-width:0">'+esc(r.title||"Workout")+(r.bron?'<span class="muted" style="font-weight:500"> · '+esc(r.bron)+'</span>':'')+'</span><span class="n">'+n(r[veld])+'×</span></button>').join("")+'</div>':'<div class="nodata">'+leeg+'</div>';
  html+='<div class="metcards bl-cards">'+
    '<div class="metcard"><h3>Activiteit per week</h3>'+bars+'</div>'+
    '<div class="metcard"><h3>Volgers per maand</h3>'+mTabel+'</div>'+
    '<div class="metcard"><h3>Meest gedaan (8 weken)</h3>'+lijst(d.meest_gedaan||[],"Nog geen gelogde workouts in de laatste 8 weken.","voltooid")+'</div>'+
    '<div class="metcard"><h3>Meest gemist (8 weken)</h3>'+lijst(d.meest_gemist||[],"Niemand heeft een workout als gemist gelogd.","gemist")+'</div>'+
  '</div>';
  const kl=d.klanten||[];
  html+='<h3 style="margin:18px 0 8px">Per klant</h3>'+
    (kl.length?'<div class="card" style="padding:4px 10px;overflow-x:auto"><table class="bl-tabel"><tr><th>Klant</th><th>Status</th><th>Sinds</th><th>Laatste training</th><th class="r" title="Sessies in de laatste 30 dagen / totaal">Sessies 30 d / totaal</th><th class="r">Gemist 30 d</th><th class="r">Streak</th><th class="r">Rx / Sc</th><th class="r" title="Openbare scores op het leaderboard">Openbaar</th></tr>'+
      kl.map(k=>'<tr class="bl-klant" onclick="blogKlantKaart(\''+k.athlete_id+'\')"><td><b>'+naamVan(k)+'</b>'+(k.archived?' <span class="cpill gray" style="font-size:9.5px">archief</span>':'')+'</td><td>'+blogDataStatus(k)+'</td><td class="sm muted">'+esc(blogDatumKort(k.sinds))+'</td><td class="sm muted">'+(k.laatste_training?esc(blogDatumKort(k.laatste_training)):"–")+'</td><td class="r">'+n(k.sessies_30d)+' / '+n(k.sessies_totaal)+'</td><td class="r">'+n(k.gemist_30d)+'</td><td class="r">'+n(k.streak_weken)+' wk</td><td class="r">'+n(k.rx)+' / '+n(k.scaled)+'</td><td class="r">'+n(k.openbaar)+'</td></tr>').join("")+'</table></div>':'<div class="card"><div class="cempty">Nog geen klanten gekoppeld aan dit programma.</div></div>')+
    '<div class="sm muted" style="margin-top:10px;line-height:1.6">Een <b>sessie</b> is een dag waarop iemand minstens één onderdeel heeft gelogd. De <b>streak</b> telt aaneengesloten weken met minstens één sessie (deze week mag nog leeg zijn). <b>Voltooiing</b> is het aantal sessies gedeeld door het aantal programmadagen keer het aantal volgers. Gasten (scores zonder account via de weekworkout) tellen mee in de sessies, niet bij de volgers. Klik op een klant voor een kaart met een samenvatting die je kunt delen.</div>';
  return html;
}
// ---------- Leaderboards: de laatste workouts van het programma met hun openbare scores ----------
function blogBoardsHtml(){
  const d=BLOG.data;
  let html='<h2 style="margin:0 0 4px">Leaderboards</h2><div class="sm muted" style="margin-bottom:12px">Per workout de openbare scores van de volgers; hetzelfde bord als het vuistje op een kaart in de kalender.</div>';
  if(BLOG.dataLaden||(!d&&!BLOG.dataFout))return html+'<div class="card"><div class="cempty">Laden…</div></div>';
  if(BLOG.dataFout)return html+'<div class="card"><div class="cempty">'+esc(BLOG.dataFout)+'</div></div>';
  const alle=d.recente_workouts||[];
  if(!alle.length)return html+'<div class="card"><div class="cempty">Nog geen workouts in het verleden.</div></div>';
  // Zoeken op workoutnaam, Showdown-naam of onderdeel (verzoek Stefan 22 okt); alle woorden moeten voorkomen.
  const q=(BLOG.bordZoek||"").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const TOON=15;
  const rows=q.length?alle.filter(r=>{const t=((r.title||"")+" "+(r.bron||"")+" "+(r.onderdelen||"")).toLowerCase();return q.every(w=>t.includes(w));}):(BLOG.bordAlles?alle:alle.slice(0,TOON));
  const teller=q.length?rows.length+' van '+alle.length+' workouts':(alle.length>rows.length?'Laatste '+rows.length+' van '+alle.length+' workouts':alle.length+' workouts');
  html+='<div style="display:flex;gap:10px;align-items:center;margin:0 0 10px;flex-wrap:wrap"><input class="lid-in" id="blog-zoekbord" style="width:100%;max-width:340px" placeholder="Zoek op workout of onderdeel…" value="'+esc(BLOG.bordZoek||"")+'" oninput="blogBoardZoek(this.value)"><span class="sm muted">'+teller+'</span></div>';
  if(!rows.length)return html+'<div class="card"><div class="cempty">Geen workout gevonden.</div></div>';
  html+='<div class="card"><div class="thead"><div style="flex:.9">Datum</div><div style="flex:2.4">Workout</div><div style="flex:.8;text-align:right">Gelogd</div><div style="flex:.8;text-align:right">Openbaar</div><div style="width:130px"></div></div>'+
    rows.map(r=>'<div class="trow" style="align-items:center"><div style="flex:.9" class="sm muted">'+esc(blogDatumKort(r.workout_date))+'</div><div style="flex:2.4;min-width:0"><b style="font-size:12.5px">'+esc(r.title||"Workout")+'</b>'+(r.bron?'<div class="sm" style="font-size:11px;color:#1d6f9c">Showdown: '+esc(r.bron)+'</div>':'')+(r.onderdelen?'<div class="bl-onderdelen" title="'+esc(r.onderdelen)+'">'+esc(r.onderdelen)+'</div>':'')+'</div><div style="flex:.8;text-align:right" class="sm">'+Number(r.voltooid||0)+'</div><div style="flex:.8;text-align:right" class="sm">'+Number(r.openbaar||0)+'</div><div style="width:130px;text-align:right"><button class="btn ghost sm" onclick="blogBoardOpen(\''+r.workout_id+'\')">Leaderboard</button></div></div>').join("")+'</div>';
  if(!q.length&&alle.length>rows.length)html+='<div style="margin-top:10px"><button class="btn ghost sm" onclick="BLOG.bordAlles=true;blogRender()">Alle '+alle.length+' workouts tonen</button></div>';
  return html;
}
function blogBoardZoek(v){
  BLOG.bordZoek=v||"";
  const m=document.getElementById("cmain");if(!m)return;
  m.innerHTML=blogPaneelHtml();
  const i=document.getElementById("blog-zoekbord");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}
}
// Bord openen van een workout die niet in de zichtbare week staat: eerst ophalen.
async function blogBoardOpen(wid){
  if(!BLOG.workouts.find(w=>w.id===wid)){
    const{data,error}=await db.from("workouts").select("*, blocks(*)").eq("id",wid).single();
    if(error||!data){toast("Workout niet gevonden");return;}
    BLOG.workouts.push(data);
  }
  blogBoard(wid);
}
// ---------- Klantkaart: cijfers van één volger + samenvatting om te delen ----------
function blogKlantKaart(aid){
  const d=BLOG.data;if(!d)return;
  const k=(d.klanten||[]).find(x=>x.athlete_id===aid);if(!k)return;
  ensureBlogModals();
  const n=x=>Number(x||0);
  const vak=(val,label)=>'<div><b>'+val+'</b><span>'+label+'</span></div>';
  document.getElementById("blogkk-body").innerHTML=
    '<div style="display:flex;align-items:center;gap:12px"><div class="cavc" style="width:44px;height:44px;font-size:14px;flex:none;'+avFotoStyle(k)+'">'+avFotoText(k)+'</div><div><b style="font-size:15px">'+naamVan(k)+'</b><div class="sm muted">'+esc(k.email||"")+'</div></div><div style="margin-left:auto">'+blogDataStatus(k)+'</div></div>'+
    '<div class="bl-kk">'+vak(n(k.sessies_30d),"sessies, 30 dagen")+vak(n(k.sessies_totaal),"sessies totaal")+vak(n(k.streak_weken)+" wk","streak")+vak(n(k.gemist_30d),"gemist, 30 dagen")+
      vak(k.laatste_training?esc(blogDatumKort(k.laatste_training)):"–","laatste training")+vak(esc(blogDatumKort(k.sinds)),"volgt sinds")+vak(n(k.rx)+" / "+n(k.scaled),"Rx / Scaled")+vak(n(k.openbaar),"openbare scores")+'</div>'+
    '<div class="bl-deel"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap"><b>Delen met de klant</b><span class="sm muted">alleen de eigen cijfers; geen omzet, geen anderen</span><button class="btn ghost sm" style="margin-left:auto" onclick="kopieerNaarKlembord(document.getElementById(\'blogkk-tekst\').value,\'Samenvatting gekopieerd\')">Kopiëren</button></div>'+
      '<textarea id="blogkk-tekst" readonly>'+esc(blogKlantSamenvatting(k))+'</textarea></div>'+
    '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end"><button class="btn ghost" onclick="blogKlantKaartDicht();location.hash=\'klant/'+k.athlete_id+'\'">Klant-scherm openen</button><button class="btn ghost" onclick="blogKlantKaartDicht()">Sluiten</button></div>';
  document.getElementById("blogkkmodal").classList.add("show");
}
function blogKlantKaartDicht(){const m=document.getElementById("blogkkmodal");if(m)m.classList.remove("show");}
// De tekst voor de klant: alleen zijn eigen cijfers, nooit omzet of andermans data.
function blogKlantSamenvatting(k){
  const p=BLOG.cur,n=x=>Number(x||0);
  const naam=[k.first_name,k.last_name].filter(Boolean).join(" ")||k.email||"";
  return naam+" · "+(p.name||"")+"\n"+
    "Laatste 30 dagen: "+n(k.sessies_30d)+" training"+(n(k.sessies_30d)===1?"":"en")+" gelogd"+(n(k.gemist_30d)?", "+n(k.gemist_30d)+" gemist":"")+"\n"+
    "Totaal: "+n(k.sessies_totaal)+" training"+(n(k.sessies_totaal)===1?"":"en")+" sinds "+blogDatumKort(k.sinds)+"\n"+
    "Streak: "+n(k.streak_weken)+(n(k.streak_weken)===1?" week":" weken")+" op rij\n"+
    "Laatste training: "+(k.laatste_training?blogDatumKort(k.laatste_training):"nog geen")+"\n"+
    "Rx / Scaled: "+n(k.rx)+" / "+n(k.scaled)+"\n"+
    "Openbare scores op het leaderboard: "+n(k.openbaar);
}
// ---------- Slepen vanuit het bibliotheek-venster naar een programmadag ----------
// Zelfde gedrag als op de klant-kalender (biebDropOpDag): bouwer open op die dag =
// onderaan in de bouwer; dag met workout = blok eronder; lege dag = nieuwe workout.
async function blogBiebDrop(item,ds){
  if(!BLOG.cur||!item)return;
  if(BLOG.editDay===ds&&typeof biebInBouwer==="function"&&biebInBouwer(item))return;
  if(typeof liftsLaad==="function")await liftsLaad();
  const dag=BLOG.workouts.filter(w=>w.workout_date===ds&&!/^rest ?day$/i.test((w.title||"").trim())).sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")));
  const kort=ds.slice(8,10)+"-"+ds.slice(5,7);
  if(dag.length){
    const w=dag[dag.length-1],blokken=w.blocks||[];
    const sort=blokken.reduce((m,b)=>Math.max(m,b.sort||0),0)+1;
    const label=String.fromCharCode(65+Math.min(blokken.length,25));
    const{error}=await db.from("blocks").insert(blokkenMetLabels(biebBlokkenVan(item),label,sort).map(b=>Object.assign({workout_id:w.id},b)));
    if(error){toast(error.message||"Toevoegen mislukt");return;}
    toast('"'+item.naam+'" als blok '+label+' onder "'+(w.title||"workout")+'" gezet');
  }else{
    const wf={company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,audience:"blog",blog_program_id:BLOG.cur.id,workout_date:ds,title:item.naam};
    const kopie=item.soort==="weekworkout"&&item.blocks;
    if(kopie)Object.assign(wf,{warmup:item.warmup||null,cooldown:item.cooldown||null,warmup_oefening_id:item.warmup_oefening_id||null,cooldown_oefening_id:item.cooldown_oefening_id||null,warmup_media:item.warmup_media||null,cooldown_media:item.cooldown_media||null,source_blog_workout_id:item.id});
    const{data:nw,error}=await db.from("workouts").insert(wf).select().single();
    if(error){toast(error.message||"Toevoegen mislukt");return;}
    const blokken=kopie?item.blocks.map(b=>Object.assign({},b,{workout_id:nw.id})):blokkenMetLabels(biebBlokkenVan(item),"A",1).map(b=>Object.assign({workout_id:nw.id},b));
    if(blokken.length){const{error:be}=await db.from("blocks").insert(blokken);if(be){toast(be.message||"Toevoegen mislukt");return;}}
    toast(kopie?'Weekworkout "'+item.naam+'" als eigen kopie op '+kort+' gezet':'"'+item.naam+'" als nieuwe workout op '+kort+' gezet');
  }
  await blogHerlaad();
}
// ---------- Sneltoetsen op de programmapagina (zelfde paneel als op het klant-scherm) ----------
const BLOG_SNELTOETSEN=[
 ["Kalender",[["Sneltoetsen tonen","?"],["Naar deze week","T"],["Vorige week","←"],["Volgende week","→"],["Zijbalk in-/uitklappen","\\"],["Alles sluiten","Esc"]]],
 ["Bouwer",[["Workout opslaan","Ctrl Enter"],["Bouwer sluiten","Esc"],["Oefening-blok toevoegen","Ctrl Shift O"],["Conditioning-blok toevoegen","Ctrl Shift K"]]],
 ["Onderdelen",[["Kalender","C"],["Klanten","K"],["Leaderboards","L"],["Data","D"],["Bibliotheek-venster","B"]]]
];
function blogKeys(){
  const lay=document.querySelector(".client-layout.bloglay");if(!lay)return;
  let sp=document.getElementById("sp-blogkeys");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(!sp){
    sp=document.createElement("div");sp.id="sp-blogkeys";sp.className="sidepanel";
    sp.innerHTML='<div class="sp-head"><h3>Sneltoetsen</h3></div><div>'+BLOG_SNELTOETSEN.map(g=>'<div class="keygroep">'+esc(g[0])+'</div>'+g[1].map(r=>'<div class="keyrow"><span>'+esc(r[0])+'</span><span>'+r[1].split(" ").map(k=>'<span class="kbd">'+esc(k)+'</span>').join("")+'</span></div>').join("")).join("")+'</div>'+
      '<div class="sp-info" style="margin-top:14px">Lettertoetsen werken als je niet in een tekstveld typt en de bouwer dicht is. De bouwer-toetsen (met Ctrl) werken ook tijdens het typen.</div>';
  }
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  sp.classList.add("show");
}
document.addEventListener("keydown",e=>{
  if(!BLOG.cur||!document.querySelector(".client-layout.bloglay"))return;
  const ov=document.getElementById("vidoverlay");if(ov&&ov.style.display==="flex")return;
  const tag=(e.target.tagName||"").toLowerCase();
  const typt=tag==="input"||tag==="textarea"||tag==="select"||e.target.isContentEditable;
  const k=(e.key||"").toLowerCase();
  const bouwerOpen=!!document.getElementById("exrows");
  if(e.ctrlKey||e.metaKey){
    if(bouwerOpen){
      if(k==="enter"){e.preventDefault();blogSaveWorkout();return;}
      if(e.shiftKey&&k==="o"){e.preventDefault();addExBtn();return;}
      if(e.shiftKey&&k==="k"){e.preventDefault();addCondBtn();return;}
    }
    return;
  }
  if(e.key==="Escape"){
    if(e.target.closest&&e.target.closest("#wcmodal")){if(typeof closeWc==="function")closeWc();return;}
    const open=document.querySelector(".lmodal.show");
    if(open){open.classList.remove("show");if(open.id==="blogboardmodal")BLOGBOARD=null;return;}
    document.querySelectorAll(".daymenu,.coachmenu,.wwmenu").forEach(x=>x.remove());
    const sp=document.querySelector(".sidepanel.show");
    if(sp){sp.classList.remove("show");return;}
    if(bouwerOpen){const vuil=typeof bouwerDirty!=="undefined"&&bouwerDirty;if(!vuil||confirm("Bouwer sluiten zonder op te slaan?"))blogCloseBuilder();}
    return;
  }
  if(typt||e.altKey)return;
  if(document.querySelector(".lmodal.show"))return;
  if(e.key==="?"){e.preventDefault();blogKeys();return;}
  if(e.key==="ArrowLeft"){if(BLOG.paneel==="kalender"&&!bouwerOpen){e.preventDefault();blogWeekGa(-1);}return;}
  if(e.key==="ArrowRight"){if(BLOG.paneel==="kalender"&&!bouwerOpen){e.preventDefault();blogWeekGa(1);}return;}
  if(e.shiftKey||bouwerOpen)return;
  if(k==="\\"){e.preventDefault();toggleSide();}
  else if(k==="t"){e.preventDefault();BLOG.paneel="kalender";blogWeekGa(0);}
  else if(k==="c"){e.preventDefault();blogPaneel("kalender");}
  else if(k==="k"){e.preventDefault();blogPaneel("klanten");}
  else if(k==="l"){e.preventDefault();blogPaneel("boards");}
  else if(k==="d"){e.preventDefault();blogPaneel("data");}
  else if(k==="b"){e.preventDefault();openBiebVenster();}
});
