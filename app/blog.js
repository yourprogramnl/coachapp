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
  BLOG.counts={};(rl.data||[]).forEach(p=>{if(p.blog_program_id)BLOG.counts[p.blog_program_id]=(BLOG.counts[p.blog_program_id]||0)+1;});
  ensureBlogModals();
  if(BLOG.cur){const v=BLOG.list.find(p=>p.id===BLOG.cur.id);if(v)BLOG.cur=v;else BLOG.cur=null;}
  blogRender();
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
  document.getElementById("blogpmodal").classList.add("show");
}
function blogpDicht(){document.getElementById("blogpmodal").classList.remove("show");BLOG.editPid=null;}
async function blogpOpslaan(){
  const naam=document.getElementById("blogp-naam").value.trim();
  const msg=document.getElementById("blogp-msg");
  if(!naam){msg.textContent="Geef het programma een naam.";msg.className="msg err";return;}
  const rec={name:naam,description:document.getElementById("blogp-desc").value.trim()||null,type:document.getElementById("blogp-type").value,price_text:document.getElementById("blogp-prijs").value.trim()||null};
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

// ---------- Programma openen: maandkalender ----------
async function blogOpen(id){
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  const p=BLOG.list.find(x=>x.id===id);if(!p){toast("Programma niet gevonden");return;}
  BLOG.cur=p;
  const d=new Date();d.setDate(1);d.setHours(0,0,0,0);BLOG.maand=d;
  BLOG.editDay=null;BLOG.editWid=null;
  await blogLaadMaand();
  blogRender();
}
function blogTerug(){BLOG.cur=null;BLOG.editDay=null;BLOG.editWid=null;fillBlog();}
// Het zichtbare raster: 6 weken vanaf de maandag van de week waarin de 1e valt.
function blogGridStart(){return mondayOf(BLOG.maand);}
async function blogLaadMaand(){
  const start=ymd(blogGridStart()),eind=ymd(addDays(blogGridStart(),41));
  const{data}=await db.from("workouts").select("*, blocks(*)").eq("blog_program_id",BLOG.cur.id).gte("workout_date",start).lte("workout_date",eind).order("workout_date");
  BLOG.workouts=data||[];
}
async function blogMaandGa(n){
  const d=new Date(BLOG.maand);
  if(n===0){const t=new Date();t.setDate(1);t.setHours(0,0,0,0);BLOG.maand=t;}
  else{d.setMonth(d.getMonth()+n);BLOG.maand=d;}
  BLOG.editDay=null;BLOG.editWid=null;
  await blogLaadMaand();blogRender();
}
function blogDetailRender(){
  const cp=document.getElementById("cpage");if(!cp)return;
  const p=BLOG.cur,n=BLOG.counts[p.id]||0;
  const maandNaam=MAANDVOL[BLOG.maand.getMonth()].charAt(0).toUpperCase()+MAANDVOL[BLOG.maand.getMonth()].slice(1)+" "+BLOG.maand.getFullYear();
  const weken=[0,1,2,3,4,5].map(w=>blogWeekRij(w)).join("");
  cp.innerHTML='<div class="progedit">'+
    '<div class="pe-top"><button class="btn ghost sm" onclick="blogTerug()">‹ Terug</button>'+
      '<div class="pe-badges"><span class="cpill">'+esc(blogTypeNL(p.type))+'</span><span class="cpill">'+(p.price_text?esc(p.price_text):"Gratis")+'</span><span class="cpill teal">'+n+" klant"+(n===1?"":"en")+'</span></div>'+
      '<div style="margin-left:auto;display:flex;gap:8px"><button class="btn ghost sm" onclick="blogLedenOpen()">Leden koppelen</button><button class="btn ghost sm" onclick="blogpModal(\''+p.id+'\')">Details bewerken</button></div></div>'+
    '<h1 style="margin:8px 0 2px">'+esc(p.name)+'</h1>'+(p.description?'<div class="sm muted" style="margin-bottom:8px">'+esc(p.description)+'</div>':'')+
    '<div class="pe-weeks" style="margin-top:12px"><button class="wtab" style="width:auto;padding:0 10px" onclick="blogMaandGa(-1)">‹</button><span style="min-width:150px;text-align:center">'+esc(maandNaam)+'</span><button class="wtab" style="width:auto;padding:0 10px" onclick="blogMaandGa(1)">›</button><button class="btn ghost sm" style="margin-left:8px" onclick="blogMaandGa(0)">Vandaag</button></div>'+
    '<div class="pe-cal"><div class="pe-hd7" style="grid-template-columns:repeat(7,minmax(132px,1fr))">'+DAGEN.map(d=>'<div>'+d+'</div>').join("")+'</div>'+weken+'</div>'+
  '</div>';
  if(BLOG.editDay){relabel();groei();}
}
function blogWeekRij(w){
  const start=addDays(blogGridStart(),w*7);
  const dagen=[0,1,2,3,4,5,6].map(i=>ymd(addDays(start,i)));
  const editCol=BLOG.editDay?dagen.indexOf(BLOG.editDay):-1;
  const cols=[0,1,2,3,4,5,6].map(i=>i===editCol?"minmax(340px,2.4fr)":"minmax(132px,1fr)").join(" ");
  return '<div class="pe-row" style="grid-template-columns:'+cols+'">'+dagen.map(d=>blogDayCel(d)).join("")+'</div>';
}
function blogDayCel(datum){
  const wos=BLOG.workouts.filter(w=>w.workout_date===datum);
  const d=new Date(datum+"T12:00:00");
  const inMaand=d.getMonth()===BLOG.maand.getMonth();
  const vandaag=datum===todayStr();
  const kop='<div style="display:flex;justify-content:flex-end;margin-bottom:6px"><span style="font-size:12px;font-weight:700;color:'+(vandaag?"#3eb3e0":(inMaand?"#1d2129":"#b3b9c2"))+'">'+d.getDate()+(d.getDate()===1?" "+MAANDKORT[d.getMonth()]:"")+'</span></div>';
  const stijl=(vandaag?"outline:2px solid #6ec4e8;outline-offset:-2px;":"")+(inMaand?"":"background:#fafbfc;");
  if(BLOG.editDay===datum){
    let inner=kop+wos.filter(w=>w.id!==BLOG.editWid).map(blogCard).join("");
    const w=BLOG.editWid?wos.find(x=>x.id===BLOG.editWid):null;
    const wObj=w?{id:w.id,title:w.title,warmup:w.warmup,cooldown:w.cooldown,blocks:(w.blocks||[])}:{};
    inner+='<div class="ib2 pe-ib" onclick="event.stopPropagation()">'+blogBuilderHtml(wObj)+'</div>';
    return '<div class="pe-cell" style="'+stijl+'">'+inner+'</div>';
  }
  return '<div class="pe-cell" style="'+stijl+'">'+kop+'<div class="addrow2"><button class="addnewbtn" onclick="event.stopPropagation();blogDayMenu(event,\''+datum+'\')">+ Toevoegen</button></div>'+wos.map(blogCard).join("")+'</div>';
}
function blogCard(w){
  const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  const isRest=!blocks.length&&/^rest ?day$/i.test((w.title||"").trim());
  if(isRest)return '<div class="mcard planned" onclick="event.stopPropagation();blogOpenBuilder(\''+w.workout_date+'\',\''+w.id+'\')"><div class="msc"><span style="color:#27b376">Rest Day</span></div></div>';
  let inner="";
  if(w.warmup)inner+='<div class="cblk k-grijs"><div class="n">Warmup</div><div class="pr">'+esc(w.warmup)+'</div></div>';
  blocks.forEach(b=>{const kleur=b.color?" k-"+esc(b.color):"";const lk=b.linked?" linked2":"";inner+='<div class="cblk'+kleur+lk+'"><div class="n">'+esc(b.label||"")+') '+esc(b.exercise||"")+'</div>'+(composePresc(b)?'<div class="pr">'+esc(composePresc(b))+'</div>':'')+'</div>';});
  if(w.cooldown)inner+='<div class="cblk k-grijs"><div class="n">Cooldown</div><div class="pr">'+esc(w.cooldown)+'</div></div>';
  return '<div class="mcard planned" onclick="event.stopPropagation();blogOpenBuilder(\''+w.workout_date+'\',\''+w.id+'\')"><div class="msc"><span class="wtitle">'+esc(w.title||"Workout")+'</span></div>'+inner+'</div>';
}
function blogDayMenu(ev,datum){
  ev.stopPropagation();
  document.querySelectorAll(".daymenu").forEach(x=>x.remove());
  const cell=ev.target.closest(".pe-cell");if(!cell)return;
  const d=document.createElement("div");d.className="daymenu";
  d.innerHTML='<button onclick="event.stopPropagation();blogOpenBuilder(\''+datum+'\',null)"><svg class="i"><use href="#i-link"/></svg> Workout</button>'+
    '<button onclick="event.stopPropagation();blogRustdag(\''+datum+'\')"><svg class="i"><use href="#i-walk"/></svg> Rustdag</button>';
  cell.prepend(d);
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
  return '<div class="sec"><input id="w_title" class="row-title" placeholder="Titel (bijv. Kracht)" value="'+esc(w.title||"")+'"><textarea id="w_warmup" rows="1" placeholder="Warming-up toevoegen…">'+esc(w.warmup||"")+'</textarea></div>'+
    '<div id="exrows">'+rows+'</div>'+
    '<div class="addbtns"><button onclick="addExBtn()">+ Oefening</button><button onclick="addCondBtn()">+ Conditioning</button><button class="iconly" title="Dupliceer laatste blok" onclick="dupLast()">⧉</button></div>'+
    '<div class="sec"><textarea id="w_cooldown" rows="1" placeholder="Cooldown toevoegen…">'+esc(w.cooldown||"")+'</textarea></div>'+
    '<div class="foot"><button class="save" onclick="blogSaveWorkout()">Opslaan</button><button class="cancel" onclick="blogCloseBuilder()">Annuleren</button>'+(w.id?'<button class="cancel" style="color:#e5484d;border-color:#f3b8ba" onclick="blogDeleteWorkout(\''+w.id+'\')">Verwijderen</button>':'')+'</div>';
}
async function blogHerlaad(){await blogLaadMaand();BLOG.editDay=null;BLOG.editWid=null;blogRender();}
async function blogSaveWorkout(){
  const g=id=>document.getElementById(id);
  const title=(g("w_title").value||"").trim();
  const rows=[...document.querySelectorAll("#exrows .exrow")].map((r,i)=>{const o=rowToObj(r);o.label=r.querySelector(".lbl-badge").textContent;o.sort=i+1;return o;}).filter(b=>b.exercise);
  const wf={company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,audience:"blog",blog_program_id:BLOG.cur.id,workout_date:BLOG.editDay,title:title||null,warmup:g("w_warmup").value.trim()||null,cooldown:g("w_cooldown").value.trim()||null};
  const mkBlocks=wid=>rows.map(b=>({workout_id:wid,kind:b.kind,label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription||null,notes:b.notes||null,sort:b.sort,color:b.color||null,score_type:b.score_type||"text",oefening_id:b.oefening_id||null}));
  try{
    if(BLOG.editWid){
      const{error:ue}=await db.from("workouts").update(wf).eq("id",BLOG.editWid);if(ue)throw ue;
      await db.from("blocks").delete().eq("workout_id",BLOG.editWid);
      if(rows.length){const{error:be}=await db.from("blocks").insert(mkBlocks(BLOG.editWid));if(be)throw be;}
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
  const{data}=await db.from("profiles").select("id,first_name,last_name,email,avatar_url,blog_program_id").eq("role","lid").eq("archived",false).order("first_name");
  BLOG.leden=data||[];
  blogLedenRender();
}
function blogLedenRender(){
  const host=document.getElementById("blogled-lijst");if(!host)return;
  if(!BLOG.leden.length){host.innerHTML='<div class="cempty">Geen leden gevonden. (Als coach zie je alleen je eigen klanten.)</div>';return;}
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
      '<div style="display:flex;gap:8px"><button class="btn" onclick="blogpOpslaan()">Opslaan</button><button class="btn ghost" onclick="blogpDicht()">Annuleren</button></div>'+
      '<div class="msg" id="blogp-msg"></div></div></div>'+
    '<div class="lmodal" id="blogledmodal" style="z-index:398"><div class="box" style="width:460px;max-width:94vw">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">Leden koppelen</h3><span onclick="blogLedenDicht()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
      '<div class="sm muted" style="margin-bottom:8px">Klik op een lid om te (ont)koppelen. Een lid volgt één blogprogramma tegelijk.</div>'+
      '<div id="blogled-lijst" style="max-height:52vh;overflow:auto"></div>'+
      '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="blogLedenDicht()">Sluiten</button></div></div></div>';
  document.body.appendChild(d);
}
