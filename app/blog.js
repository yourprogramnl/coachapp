// app/blog.js — de Blog-sectie (topnav): blogprogramma's in een Strivee-stijl
// lijst (naam/type/prijs/klanten) met per programma een eigen maandkalender
// waarop de coach de doorlopende programmering schrijft. Workouts hangen aan
// workouts.blog_program_id (audience='blog'); de losse weekworkout heeft geen
// blog_program_id en blijft dus in de Weekworkout-sectie. Prijs is alleen
// weergave; betalen blijft via Strivee lopen.
let BLOG={list:[],counts:{},zoek:"",cur:null,maand:null,workouts:[],editDay:null,editWid:null,editPid:null};
const BLOG_TYPES=[["classic","Classic"],["fixed","Vast"],["one_on_one","1-op-1"]];
const blogTypeNL=t=>{const x=BLOG_TYPES.find(o=>o[0]===t);return x?x[1]:(t||"Classic");};

async function fillBlog(){
  const[rp,rl]=await Promise.all([
    db.from("blog_programs").select("*").eq("company_id",ME.profile.company_id).order("name"),
    db.from("profiles").select("id,blog_program_id").eq("role","lid").eq("archived",false)
  ]);
  BLOG.list=rp.data||[];
  // Een coach ziet alleen blogs die aan hem zijn toegewezen (coach_ids leeg =
  // iedereen); eigenaar/platform_admin zien alles. Zelfde regel als het
  // wisselmenu op het klant-scherm.
  if(myRole()==="coach")BLOG.list=BLOG.list.filter(p=>!p.coach_ids||!p.coach_ids.length||p.coach_ids.includes(ME.user.id));
  kalBlogs=BLOG.list; // wisselmenu op het klant-scherm meteen bijwerken
  BLOG.counts={};(rl.data||[]).forEach(p=>{if(p.blog_program_id)BLOG.counts[p.blog_program_id]=(BLOG.counts[p.blog_program_id]||0)+1;});
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
  cp.innerHTML='<div class="progedit"><div class="hrow"><h1>Blog</h1><button class="btn" onclick="blogpModal(null)">+ Programma aanmaken</button></div>'+
    '<div style="margin-bottom:14px"><input class="lid-in" id="blog-zoek" placeholder="Zoek een programma…" style="width:100%;max-width:340px" oninput="blogZoek(this.value)" value="'+esc(BLOG.zoek)+'"></div>'+
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
    const prijs=p.price_text?('<b>'+esc(p.price_text)+'</b>'):'<b style="color:#27b376">Gratis</b>';
    return '<div class="trow click" style="cursor:pointer;align-items:center" onclick="blogOpen(\''+p.id+'\')">'+
      '<div style="flex:2.6;display:flex;align-items:center;gap:11px"><div class="cavc" style="width:40px;height:40px;border-radius:10px;font-size:12px;'+avStijl(p.name)+'">'+esc((p.name||"?").slice(0,1).toUpperCase())+'</div>'+
        '<div><b>'+esc(p.name)+'</b>'+(p.description?'<div class="sm muted" style="margin-top:2px">'+esc(p.description)+'</div>':'')+'</div></div>'+
      '<div style="flex:.9" class="sm muted">'+esc(blogTypeNL(p.type))+'</div>'+
      '<div style="flex:.9" class="sm">'+prijs+'</div>'+
      '<div style="flex:.7" class="sm muted">'+(n||"–")+'</div>'+
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
  // Winkel: prijs in centen; te koop kan alleen met een geldige prijs (min. €1).
  rec.for_sale=document.getElementById("blogp-koop").checked;
  const prijsTxt=document.getElementById("blogp-koopprijs").value.trim();
  const prijs=Math.round(parseFloat(prijsTxt.replace(",","."))*100);
  if(rec.for_sale){
    if(isNaN(prijs)||prijs<100){msg.textContent="Vul een winkelprijs in van minstens €1 (bijv. 39,00).";msg.className="msg err";return;}
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
  BLOG.cur=p;
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
  cp.innerHTML='<div class="progedit">'+
    '<div class="pe-top"><button class="btn ghost sm" onclick="blogTerug()">‹ Terug</button>'+
      '<div class="pe-badges"><span class="cpill">'+esc(blogTypeNL(p.type))+'</span><span class="cpill">'+(p.price_text?esc(p.price_text):"Gratis")+'</span><span class="cpill teal">'+n+" klant"+(n===1?"":"en")+'</span></div>'+
      '<div style="margin-left:auto;display:flex;gap:8px"><button class="btn ghost sm" onclick="blogLedenOpen()">Leden koppelen</button><button class="btn ghost sm" onclick="blogpModal(\''+p.id+'\')">Details bewerken</button></div></div>'+
    '<div class="pe-weeks" style="margin-top:10px;align-items:center">'+
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
  if(BLOG.editDay){relabel();groei();}
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
    '<button title="Verwijderen" onclick="event.stopPropagation();blogDeleteWorkout(\''+w.id+'\')"><svg class="i sm-i"><use href="#i-trash"/></svg></button>'+
    '</span>';
}
function blogCard(w){
  const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  const sel=blogSel.has(w.id)?" selected":"";
  const isRest=!blocks.length&&/^rest ?day$/i.test((w.title||"").trim());
  if(isRest)return '<div class="mcard planned'+sel+'" onclick="event.stopPropagation();blogOpenBuilder(\''+w.workout_date+'\',\''+w.id+'\')">'+blogCardTools(w)+'<div class="msc"><span style="color:#27b376">Rest Day</span></div></div>';
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
function blogDragOver(ev,cell){if(!blogDragWid)return;ev.preventDefault();cell.classList.add("dragover");}
function blogDragLeave(cell){cell.classList.remove("dragover");}
async function blogDropDay(ev,ds){
  ev.preventDefault();
  document.querySelectorAll(".pe-cell.dragover").forEach(c=>c.classList.remove("dragover"));
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
  KLEMBORD=wos.map(wTemplate);
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
  KLEMBORD=ws.map(wTemplate);
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
  if(!KLEMBORD||!KLEMBORD.length){toast("Klembord is leeg. Kopieer eerst een workout (hier of bij een klant).");return;}
  const base=KLEMBORD.map(t=>t.date).filter(Boolean).sort()[0]||null;
  for(const t of KLEMBORD){
    const off=(t.date&&base)?dagenTussen(t.date,base):0;
    const dd=off?ymdPlus(datum,off):datum;
    const{data:w,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,audience:"blog",blog_program_id:BLOG.cur.id,workout_date:dd,title:t.title,coach_notes:t.coach_notes,warmup:t.warmup,cooldown:t.cooldown,warmup_oefening_id:t.warmup_oefening_id,cooldown_oefening_id:t.cooldown_oefening_id,warmup_media:t.warmup_media||null,cooldown_media:t.cooldown_media||null}).select().single();
    if(error){toast(error.message||"Plakken mislukt");return;}
    if(t.blocks.length){const{error:be}=await db.from("blocks").insert(t.blocks.map(b=>Object.assign({workout_id:w.id},b)));if(be){toast(be.message);return;}}
  }
  toast(KLEMBORD.length>1?KLEMBORD.length+" workouts geplakt":"Workout geplakt");
  await blogHerlaad();
}
// Kopiëren vanaf een blog-kaart (zelfde klembord-formaat als de klant-kalender).
function blogKopieer(id){
  const w=BLOG.workouts.find(x=>x.id===id);if(!w)return;
  KLEMBORD=[wTemplate(w)];
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
  return '<div class="sec"><input id="w_title" class="row-title" placeholder="Titel (bijv. Kracht)" value="'+esc(w.title||"")+'"><textarea id="w_warmup" rows="1" placeholder="Warming-up toevoegen…">'+esc(w.warmup||"")+'</textarea>'+cwMediaHtml("warmup",w.warmup_oefening_id,w.warmup_media)+
    '<div class="demolink" title="Herken oefeningen in de tekst en stel demo-video\'s voor" onclick="gmOpen()">🎥 Genereer media</div></div>'+
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
  const mkBlocks=wid=>rows.map(b=>({workout_id:wid,kind:b.kind,label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription||null,notes:b.notes||null,sort:b.sort,color:b.color||null,score_type:b.score_type||"text",oefening_id:b.oefening_id||null}));
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
async function blogLedenOpen(){
  ensureBlogModals();
  document.getElementById("blogled-lijst").innerHTML='<div class="cempty">Laden…</div>';
  document.getElementById("blogledmodal").classList.add("show");
  // Alleen blog-leden: 1-op-1 klanten hebben hun eigen programma en volgen nooit een blogprogramma.
  const{data}=await db.from("profiles").select("id,first_name,last_name,email,avatar_url,blog_program_id").eq("role","lid").eq("membership_type","free_blog").eq("archived",false).order("first_name");
  BLOG.leden=data||[];
  blogLedenRender();
}
function blogLedenRender(){
  const host=document.getElementById("blogled-lijst");if(!host)return;
  if(!BLOG.leden.length){host.innerHTML='<div class="cempty">Geen blog-leden gevonden. Alleen leden met lidmaatschap "blog" kunnen een blogprogramma volgen; 1-op-1 klanten hebben hun eigen programma.</div>';return;}
  host.innerHTML=BLOG.leden.map(p=>{
    const aan=p.blog_program_id===BLOG.cur.id;
    const ander=p.blog_program_id&&!aan?(BLOG.list.find(x=>x.id===p.blog_program_id)||{}).name:null;
    return '<div class="tagrow" style="cursor:pointer" onclick="blogLidToggle(\''+p.id+'\')">'+
      '<div class="cavc" style="width:28px;height:28px;font-size:10px;flex:none;'+avFotoStyle(p)+'">'+avFotoText(p)+'</div>'+
      '<div style="flex:1"><b style="font-size:12.5px">'+naamVan(p)+'</b>'+(ander?'<div class="sm muted" style="font-size:11px">volgt nu: '+esc(ander)+'</div>':'')+'</div>'+
      '<span class="cpill '+(aan?"ok":"gray")+'">'+(aan?"gekoppeld":"koppel")+'</span></div>';
  }).join("");
}
async function blogLidToggle(pid){
  const p=BLOG.leden.find(x=>x.id===pid);if(!p)return;
  const nieuw=p.blog_program_id===BLOG.cur.id?null:BLOG.cur.id;
  const{error}=await db.from("profiles").update({blog_program_id:nieuw}).eq("id",pid);
  if(error){toast(error.message||"Koppelen mislukt");return;}
  p.blog_program_id=nieuw;
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
      '<div class="field"><label>Type</label><select id="blogp-type">'+BLOG_TYPES.map(t=>'<option value="'+t[0]+'">'+t[1]+'</option>').join("")+'</select></div>'+
      '<div class="field"><label>Prijs (alleen weergave; betalen loopt via Strivee)</label><input id="blogp-prijs" placeholder="bijv. €39 /maand (leeg = gratis)"></div>'+
      '<div class="field"><label>Winkel</label>'+
        '<label class="pf-toggle" style="margin:2px 0 6px"><input type="checkbox" id="blogp-koop" onchange="blogpKoopToggle()"><span class="pf-sw"></span> Te koop op de winkelpagina (/winkel.html)</label>'+
        '<div id="blogp-koopvak" style="display:none;gap:8px;align-items:center"><span class="sm muted">Prijs €</span><input id="blogp-koopprijs" placeholder="39,00" style="width:90px"><select id="blogp-koopint" style="width:130px"><option value="month">per maand</option><option value="week">per week</option><option value="year">per jaar</option></select></div>'+
        '<div class="sm muted" style="margin-top:4px">Betaling loopt via Stripe; na betaling krijgt de koper automatisch een uitnodiging voor dit programma.</div></div>'+
      '<div class="field"><label>Zichtbaar voor coaches</label><div class="sm muted" style="margin:-2px 0 6px">Eigenaar en beheerder zien altijd alle programma\'s; geen selectie = alle coaches.</div><div id="blogp-coaches"></div></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" onclick="blogpOpslaan()">Opslaan</button><button class="btn ghost" onclick="blogpDicht()">Annuleren</button></div>'+
      '<div class="msg" id="blogp-msg"></div></div></div>'+
    '<div class="lmodal" id="blogledmodal" style="z-index:398"><div class="box" style="width:460px;max-width:94vw">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">Leden koppelen</h3><span onclick="blogLedenDicht()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
      '<div class="sm muted" style="margin-bottom:8px">Klik op een lid om te (ont)koppelen. Een lid volgt één blogprogramma tegelijk.</div>'+
      '<div id="blogled-lijst" style="max-height:52vh;overflow:auto"></div>'+
      '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="blogLedenDicht()">Sluiten</button></div></div></div>';
  document.body.appendChild(d);
}
