// app/bibliotheek.js — de oefeningen- en templatebibliotheek: zoeken,
// pagineren, YouTube-miniaturen, kleurfilter, en oefening/template
// toevoegen, bewerken en verwijderen.
// ---------- BIBLIOTHEEK (live uit oefeningen + templates) ----------
const TPLKLEUR={yellow:"#eab308",blue:"#3b82f6",purple:"#8b5cf6",red:"#ef4444",green:"#22c55e",orange:"#f97316",gray:"#9ca3af"};
const TPLKLEUREN=["yellow","blue","purple","red","green","orange"];
const LEGNAAM={yellow:"Conditie",blue:"Kracht",purple:"Gymnastics",red:"Intensief",green:"Herstel",orange:"Overig"};
const LIB_PER=50;
let LIB={oef:[],tpl:[],programs:[],mode:"oef",zoek:"",pag:0,kleur:"",busy:false,geladen:false,editOef:null,editTpl:null,editProgram:null,tplKleur:"yellow"};
// Programma-editor (week/dag-indeling met workouts); bouwer opent inline in de dag, net als bij een klant.
let PROG=null,progWeek=1,progEditDay=null,progEditWid=null;
const ytIdVan=u=>{const m=(u||"").match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/);return m?m[1]:null;};

function libShellHtml(){
  const nav=[["oef","Oefeningen"],["warmup","Warming-ups"],["workout","Workouts"],["cooldown","Cooldowns"]]
    .map(m=>'<button class="'+(LIB.mode===m[0]?"on":"")+'" onclick="libZetMode(\''+m[0]+'\')">'+m[1]+'</button>').join("");
  return '<h1>Bibliotheek</h1><div class="libgrid">'+
    '<div class="card libnav">'+nav+'<button class="'+(LIB.mode==="programs"?"on":"")+'" onclick="libZetMode(\'programs\')">Programma\'s</button></div>'+
    '<div>'+
      '<div class="card" style="padding:18px 18px 0;border-radius:10px 10px 0 0">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">'+
          '<div><h2 style="font-size:16px"><span id="lib-titel">Oefeningen</span> <span class="cpill teal" id="lib-aantal">…</span></h2>'+
          '<div class="sm muted" style="font-size:12.5px;margin-top:3px" id="lib-sub"></div></div>'+
          '<button class="btn" id="lib-addbtn" onclick="libNieuw()">+ Oefening toevoegen</button>'+
        '</div>'+
        '<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap">'+
          '<div class="search2"><input id="lib-zoek" placeholder="Zoek op naam of tag…" oninput="libFilter(this.value)"></div>'+
        '</div>'+
        '<div id="lib-legenda" style="display:none;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center"></div>'+
      '</div>'+
      '<div class="card" style="border-radius:0 0 10px 10px;border-top:none">'+
        '<div class="thead" id="lib-thead"></div>'+
        '<div id="lib-lijst"><div class="cempty">Bibliotheek laden…</div></div>'+
        '<div id="lib-pag" style="display:flex;gap:6px;justify-content:center;align-items:center;padding:14px;flex-wrap:wrap"></div>'+
      '</div>'+
    '</div></div>';
}
// De popups staan los van de bibliotheek-pagina, zodat ze ook vanuit de kalender werken
function ensureLibModals(){
  if(document.getElementById("libmodals"))return;
  const d=document.createElement("div");d.id="libmodals";
  d.innerHTML='<div class="lmodal" id="exmodal"><div class="box"><h3 id="exmodal-titel">Oefening bewerken</h3>'+
      '<div class="field"><label>Naam</label><input id="exmodal-naam"></div>'+
      '<div class="field"><label>Video (YouTube-link of andere video-URL)</label><input id="exmodal-video" placeholder="https://youtu.be/…"></div>'+
      '<div id="exmodal-prev" style="margin-bottom:14px"></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" onclick="exOpslaan()">Opslaan</button><button class="btn ghost" onclick="libModalDicht()">Annuleren</button><span id="exmodal-del" style="margin-left:auto"></span></div>'+
      '<div class="msg" id="exmodal-msg"></div></div></div>'+
    '<div class="lmodal" id="tplmodal"><div class="box"><h3 id="tplmodal-titel">Template bewerken</h3>'+
      '<div class="field"><label>Naam</label><input id="tpl-naam"></div>'+
      '<div class="field"><label>Soort</label><select id="tpl-type"><option value="warmup">Warming-up</option><option value="other">Workout</option><option value="cooldown">Cooldown</option></select></div>'+
      '<div class="field"><label>Kleur</label><div class="kleurdots" id="tpl-kleuren"></div></div>'+
      '<div class="field"><label>Instructies</label><textarea id="tpl-instr" style="min-height:140px"></textarea></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" onclick="tplOpslaan()">Opslaan</button><button class="btn ghost" onclick="libModalDicht()">Annuleren</button><span id="tplmodal-del" style="margin-left:auto"></span></div>'+
      '<div class="msg" id="tplmodal-msg"></div></div></div>'+
    '<div class="lmodal" id="progmodal"><div class="box"><h3 id="progmodal-titel">Programma toevoegen</h3>'+
      '<div class="field"><label>Naam</label><input id="prog-naam" placeholder="bijv. 6-weken hypertrofie"></div>'+
      '<div class="field"><label>Omschrijving</label><textarea id="prog-desc" style="min-height:80px" placeholder="Korte uitleg over dit programma…"></textarea></div>'+
      '<div class="field"><label>Niveau / trainingsleeftijd</label><input id="prog-age" placeholder="bijv. Beginner, Gevorderd"></div>'+
      '<div class="field"><label>Type</label><select id="prog-type"><option value="standard">Standaard</option></select></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" id="prog-savebtn" onclick="programOpslaan()">Opslaan</button><button class="btn ghost" onclick="libModalDicht()">Annuleren</button><span id="progmodal-del" style="margin-left:auto"></span></div>'+
      '<div class="msg" id="progmodal-msg"></div></div></div>'+
    '<div class="lmodal" id="assignmodal" style="z-index:398"><div class="box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Programma toewijzen</h3><span onclick="closeAssign()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
      '<div class="field"><label>Klant</label><select id="assign-client"></select></div>'+
      '<div class="field"><label>Startdatum (week 1, dag 1)</label><input type="date" id="assign-date"></div>'+
      '<div class="sm muted" id="assign-info" style="margin-bottom:10px"></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" id="assign-btn" onclick="assignDoen()">Toewijzen</button><button class="btn ghost" onclick="closeAssign()">Annuleren</button></div>'+
      '<div class="msg" id="assign-msg"></div></div></div>'+
    '<div class="lmodal" id="insmodal" style="z-index:390"><div class="box" style="width:960px;max-width:96vw">'+
      '<h3 style="display:flex;justify-content:space-between;align-items:center;gap:10px">Template invoegen <span class="sm muted" id="ins-dag" style="font-weight:600;font-size:12.5px"></span></h3>'+
      '<div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap;align-items:center">'+
      '<div class="search2" style="max-width:none;flex:1;min-width:220px"><input id="ins-zoek" placeholder="Zoek op naam, tekst of kleurnaam (bijv. kracht)…" oninput="insRender()"></div>'+
      '<button class="btn" style="white-space:nowrap" onclick="tplBewerk(null)">+ Nieuwe template</button>'+
      '<div class="seg" id="ins-types"><button class="on" onclick="insType(\'all\',this)">Alles</button><button onclick="insType(\'warmup\',this)">Warm-ups</button><button onclick="insType(\'week\',this)">Weekworkouts</button><button onclick="insType(\'cooldown\',this)">Cooldowns</button><button onclick="insType(\'other\',this)">Workouts</button></div></div>'+
      '<div id="ins-kleuren" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center"></div>'+
      '<div style="max-height:52vh;overflow:auto;border:1px solid #e7e9ec;border-radius:10px"><div id="ins-lijst"></div></div>'+
      '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="closeIns()">Sluiten</button></div></div></div>'+
    '<div class="lmodal" id="invmodal"><div class="box"><h3 id="inv-titel">Klant toevoegen</h3>'+
      '<div class="field"><label>Voornaam</label><input id="inv-vn"></div>'+
      '<div class="field"><label>Achternaam</label><input id="inv-an"></div>'+
      '<div class="field"><label>E-mailadres</label><input id="inv-email" type="email" placeholder="naam@voorbeeld.nl"></div>'+
      '<div class="field" id="inv-coach-veld"><label>Coach</label><select id="inv-coach"></select></div>'+
      '<div class="field" id="inv-lid-veld"><label>Lidmaatschap</label><select id="inv-type"><option value="one_on_one">1-op-1 klant</option><option value="free_blog">Gratis blog-lid</option></select></div>'+
      '<div id="inv-result" style="display:none;margin-bottom:12px"><div class="sm" style="margin-bottom:6px;font-weight:700">Uitnodigingslink (14 dagen geldig)</div><div style="display:flex;gap:6px"><input id="inv-link" readonly style="flex:1;font-size:11.5px"><button class="btn sm" onclick="kopieerInvLink()">Kopieer</button></div><div class="sm muted" style="margin-top:6px">Stuur deze link zelf naar de klant. Die maakt er een eigen account mee aan en hangt dan meteen aan het juiste bedrijf en de juiste coach.</div></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" id="inv-maak" onclick="invAanmaken()">Uitnodiging aanmaken</button><button class="btn ghost" onclick="document.getElementById(\'invmodal\').classList.remove(\'show\')">Sluiten</button></div>'+
      '<div class="msg" id="inv-msg"></div></div></div>';
  document.body.appendChild(d);
}
async function libLaad(){
  if(LIB.geladen||LIB.busy){libKop();return;}
  LIB.busy=true;
  let alles=[],from=0;
  while(true){
    const{data,error}=await db.from("oefeningen").select("id,naam,youtube_id,video_url,tags,bron").order("naam").range(from,from+999);
    if(error){LIB.busy=false;const h=document.getElementById("lib-lijst");if(h)h.innerHTML='<div class="cempty">Kon de bibliotheek niet laden. Probeer het opnieuw.</div>';return;}
    alles=alles.concat(data||[]);
    if(!data||data.length<1000)break;
    from+=1000;
  }
  const{data:tpl}=await db.from("templates").select("id,naam,instructies,type,kleur,tags,coach").order("naam");
  const{data:progs}=await db.from("program_templates").select("*, creator:created_by(id,first_name,last_name,avatar_url)").order("name");
  LIB.oef=alles;LIB.tpl=tpl||[];LIB.programs=progs||[];LIB.geladen=true;LIB.busy=false;
  libLijst();
}
function libZetMode(m){LIB.mode=m;LIB.zoek="";LIB.pag=0;LIB.kleur="";const z=document.getElementById("lib-zoek");if(z)z.value="";coachRenderSection();}
function libFilter(v){LIB.zoek=(v||"").toLowerCase();LIB.pag=0;libLijst();}
function libGa(p){LIB.pag=p;libLijst();}
function libKleurFilter(k){LIB.kleur=LIB.kleur===k?"":k;LIB.pag=0;libLijst();}
function libKop(){
  const titels={oef:"Oefeningen",warmup:"Warming-ups",workout:"Workouts",cooldown:"Cooldowns",programs:"Programma's"};
  const t=document.getElementById("lib-titel");if(t)t.textContent=titels[LIB.mode];
  const subs={
    oef:"Jullie eigen videobibliotheek, live uit de database. Sporters zien de demo-video bij elke workout.",
    programs:"Gebruik de programma-index om veelgebruikte workout-sets aan je klanten toe te voegen."
  };
  const s=document.getElementById("lib-sub");if(s)s.textContent=subs[LIB.mode]||"Templates uit jullie Strivee, live uit de database. Klik op een template om naam, tekst of kleur aan te passen.";
  const a=document.getElementById("lib-addbtn");if(a)a.textContent=LIB.mode==="oef"?"+ Oefening toevoegen":(LIB.mode==="programs"?"+ Programma toevoegen":"+ Template toevoegen");
  const leg=document.getElementById("lib-legenda");
  if(leg){
    if(LIB.mode==="oef"||LIB.mode==="programs"){leg.style.display="none";}
    else{
      leg.style.display="flex";
      leg.innerHTML=TPLKLEUREN.map(k=>'<span class="legchip'+(LIB.kleur===k?" aan":"")+'" onclick="libKleurFilter(\''+k+'\')"><span style="width:12px;height:12px;border-radius:50%;background:'+TPLKLEUR[k]+';flex:none"></span>'+LEGNAAM[k]+'</span>').join("")+'<span class="sm muted" style="font-size:11.5px">klik op een kleur om te filteren</span>';
    }
  }
}
function libLijst(){
  libKop();
  const host=document.getElementById("lib-lijst"),thead=document.getElementById("lib-thead"),pag=document.getElementById("lib-pag"),cnt=document.getElementById("lib-aantal");
  if(!host)return;
  if(!LIB.geladen){host.innerHTML='<div class="cempty">Bibliotheek laden…</div>';return;}
  if(LIB.mode==="programs"){programLijst(host,thead,pag,cnt);return;}
  if(LIB.mode!=="oef"){
    if(thead)thead.innerHTML='<div style="width:20px"></div><div style="flex:1.7">Naam</div><div style="flex:2.6">Instructies</div><div style="flex:1.2">Tags</div>';
    const type=LIB.mode==="warmup"?"warmup":(LIB.mode==="cooldown"?"cooldown":"other");
    const hits=LIB.tpl.filter(o=>o.type===type&&(!LIB.kleur||o.kleur===LIB.kleur)&&(!LIB.zoek||(o.naam||"").toLowerCase().includes(LIB.zoek)||(o.instructies||"").toLowerCase().includes(LIB.zoek)||(o.tags||[]).join(" ").toLowerCase().includes(LIB.zoek)));
    if(cnt)cnt.textContent=hits.length+" templates";
    host.innerHTML=hits.map(o=>{
      const tg=(o.tags||[]).slice(0,2).map(t=>'<span class="tag">'+esc(t)+'</span>').join(" ");
      return '<div class="trow" style="align-items:flex-start;cursor:pointer" onclick="tplBewerk('+o.id+')">'+
        '<div style="width:20px;padding-top:4px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:'+(TPLKLEUR[o.kleur]||TPLKLEUR.yellow)+'"></span></div>'+
        '<div style="flex:1.7"><b>'+esc(o.naam)+'</b></div>'+
        '<div style="flex:2.6" class="sm muted">'+esc(o.instructies||"").replace(/\n/g,"<br>")+'</div>'+
        '<div style="flex:1.2">'+tg+'</div></div>';
    }).join("")||'<div class="cempty">Geen templates gevonden.</div>';
    if(pag)pag.innerHTML="";
    return;
  }
  if(thead)thead.innerHTML='<div style="width:74px">Media</div><div style="flex:2.6">Oefening</div><div style="flex:1.6">Tags</div><div style="flex:.8">Video</div><div style="width:70px"></div>';
  if(cnt)cnt.textContent=LIB.oef.length+" video's";
  const hits=LIB.oef.filter(o=>!LIB.zoek||(o.naam||"").toLowerCase().includes(LIB.zoek)||(o.tags||[]).join(" ").toLowerCase().includes(LIB.zoek));
  const pages=Math.max(1,Math.ceil(hits.length/LIB_PER));
  if(LIB.pag>=pages)LIB.pag=pages-1;
  const deel=hits.slice(LIB.pag*LIB_PER,(LIB.pag+1)*LIB_PER);
  host.innerHTML=deel.map(o=>{
    const tags=(o.tags||[]).slice(0,3).map(t=>'<span class="tag">'+esc(t)+'</span>').join(" ");
    const thumb=o.youtube_id?'<img src="https://i.ytimg.com/vi/'+esc(o.youtube_id)+'/default.jpg" loading="lazy" style="width:64px;height:40px;object-fit:cover;border-radius:6px;display:block">':'<div style="width:64px;height:40px;border-radius:6px;background:#f4f4f5"></div>';
    const link=o.youtube_id?'<a class="cpill teal" href="https://youtu.be/'+esc(o.youtube_id)+'" target="_blank" rel="noopener" style="text-decoration:none" onclick="event.stopPropagation()">YouTube</a>':(o.video_url?'<a class="cpill teal" href="'+esc(o.video_url)+'" target="_blank" rel="noopener" style="text-decoration:none" onclick="event.stopPropagation()">video</a>':'<span class="cpill" style="background:#f4f4f5;color:#8a919c">geen</span>');
    return '<div class="trow" style="cursor:pointer" onclick="oefBewerk('+o.id+')">'+
      '<div style="width:74px">'+thumb+'</div>'+
      '<div style="flex:2.6"><b>'+esc(o.naam)+'</b></div>'+
      '<div style="flex:1.6">'+tags+'</div>'+
      '<div style="flex:.8">'+link+'</div>'+
      '<div style="width:70px"><button class="btn ghost sm">Bewerk</button></div></div>';
  }).join("")||'<div class="cempty">Geen oefeningen gevonden.</div>';
  if(!pag)return;
  if(pages<=1){pag.innerHTML="";return;}
  let kn='<button class="btn ghost sm" '+(LIB.pag===0?"disabled":'onclick="libGa('+(LIB.pag-1)+')"')+'>‹</button>';
  for(let p=0;p<pages;p++){
    if(p===0||p===pages-1||Math.abs(p-LIB.pag)<=2)kn+='<button class="btn sm '+(p===LIB.pag?"":"ghost")+'" onclick="libGa('+p+')">'+(p+1)+'</button>';
    else if((p===1&&LIB.pag>3)||(p===pages-2&&LIB.pag<pages-4))kn+='<span class="muted">…</span>';
  }
  kn+='<button class="btn ghost sm" '+(LIB.pag===pages-1?"disabled":'onclick="libGa('+(LIB.pag+1)+')"')+'>›</button>';
  pag.innerHTML=kn;
}
function libModalDicht(){document.getElementById("exmodal").classList.remove("show");document.getElementById("tplmodal").classList.remove("show");const pm=document.getElementById("progmodal");if(pm)pm.classList.remove("show");LIB.editOef=null;LIB.editTpl=null;LIB.editProgram=null;}
function libNieuw(){if(LIB.mode==="oef")oefBewerk(null);else if(LIB.mode==="programs")programNieuw();else tplBewerk(null);}

// ---------- Programma's (herbruikbare programma-templates) ----------
function programLijst(host,thead,pag,cnt){
  if(thead)thead.innerHTML='<div style="flex:2.4">Programma</div><div style="flex:1">Niveau</div><div style="flex:1">Actief</div><div style="flex:.9">Type</div><div style="flex:.7">Van</div><div style="width:150px"></div>';
  const hits=(LIB.programs||[]).filter(p=>!LIB.zoek||(p.name||"").toLowerCase().includes(LIB.zoek)||(p.description||"").toLowerCase().includes(LIB.zoek));
  if(cnt)cnt.textContent=hits.length+" programma's";
  if(pag)pag.innerHTML="";
  host.innerHTML=hits.map(p=>{
    const c=p.creator;
    const av=c?'<div class="cavc" style="width:28px;height:28px;font-size:10px;'+avFotoStyle(c)+'" title="'+esc(naamVan(c))+'">'+avFotoText(c)+'</div>':'<div class="cavc" style="width:28px;height:28px;font-size:10px;background:#c9cdd4">·</div>';
    return '<div class="trow" style="cursor:pointer;align-items:flex-start;position:relative" onclick="programBewerk(\''+p.id+'\')">'+
      '<div style="flex:2.4"><b>'+esc(p.name)+'</b>'+(p.description?'<div class="sm muted" style="margin-top:2px">'+esc(p.description)+'</div>':'')+'</div>'+
      '<div style="flex:1" class="sm muted">'+esc(p.training_age||"–")+'</div>'+
      '<div style="flex:1" class="sm muted">0 klanten</div>'+
      '<div style="flex:.9" class="sm muted">'+esc(p.type==="standard"?"standaard":(p.type||"standaard"))+'</div>'+
      '<div style="flex:.7">'+av+'</div>'+
      '<div style="width:150px;display:flex;gap:6px;justify-content:flex-end;align-items:center" onclick="event.stopPropagation()"><button class="btn ghost sm" onclick="programBewerk(\''+p.id+'\')">Bewerk</button><button class="kebab" onclick="event.stopPropagation();openProgramMenu(event,\''+p.id+'\')">⋮</button></div></div>';
  }).join("")||'<div class="cempty">Nog geen programma\'s. Klik op "+ Programma toevoegen" om te beginnen.</div>';
}
async function programLaad(){
  const{data}=await db.from("program_templates").select("*, creator:created_by(id,first_name,last_name,avatar_url)").order("name");
  LIB.programs=data||[];if(LIB.mode==="programs")libLijst();
}
// Details-venster (aanmaken of details bewerken). Aanmaken → daarna meteen de editor.
function progModalOpen(id){
  ensureLibModals();LIB.editProgram=id||null;
  const p=id?((LIB.programs||[]).find(x=>x.id===id)||(PROG&&PROG.id===id?PROG:null)):null;
  document.getElementById("progmodal-titel").textContent=id?"Programma-details":"Programma aanmaken";
  document.getElementById("prog-naam").value=p?(p.name||""):"";
  document.getElementById("prog-desc").value=p?(p.description||""):"";
  document.getElementById("prog-age").value=p?(p.training_age||""):"";
  document.getElementById("prog-type").value=p?(p.type||"standard"):"standard";
  document.getElementById("prog-savebtn").textContent=id?"Opslaan":"Opslaan en workouts toevoegen";
  document.getElementById("progmodal-msg").textContent="";
  document.getElementById("progmodal").classList.add("show");
}
function programNieuw(){progModalOpen(null);}
function programDetails(id){progModalOpen(id);}
function programBewerk(id){openProgramEditor(id);} // rij/Bewerk → de editor met week/dag-indeling
async function programOpslaan(){
  const naam=document.getElementById("prog-naam").value.trim();
  const msg=document.getElementById("progmodal-msg");
  if(!naam){msg.textContent="Geef het programma een naam.";msg.className="msg err";return;}
  const rec={name:naam,description:document.getElementById("prog-desc").value.trim()||null,training_age:document.getElementById("prog-age").value.trim()||null,type:document.getElementById("prog-type").value||"standard"};
  const eid=LIB.editProgram;
  if(eid){
    const{error}=await db.from("program_templates").update(rec).eq("id",eid);
    if(error){msg.textContent=error.message||"Opslaan mislukt";msg.className="msg err";return;}
    libModalDicht();toast("Programma bijgewerkt");await programLaad();
    if(PROG&&PROG.id===eid){Object.assign(PROG,rec);progRender();}
  }else{
    rec.company_id=ME.profile.company_id;rec.created_by=ME.user.id;
    const{data,error}=await db.from("program_templates").insert(rec).select("*, creator:created_by(id,first_name,last_name,avatar_url)").single();
    if(error){msg.textContent=error.message||"Opslaan mislukt";msg.className="msg err";return;}
    libModalDicht();toast("Programma aangemaakt");await programLaad();
    openProgramEditor(data.id); // meteen door naar de workouts
  }
}

// ---------- Programma-editor (week/dag-indeling) ----------
async function openProgramEditor(id){
  const{data:prog}=await db.from("program_templates").select("*").eq("id",id).single();
  if(!prog){toast("Programma niet gevonden");return;}
  const{data:pws}=await db.from("program_workouts").select("*, program_blocks(*)").eq("program_id",id).order("week").order("day").order("sort");
  const{data:asgs}=await db.from("program_assignments").select("*").eq("program_id",id);
  PROG=Object.assign({},prog,{workouts:pws||[],assignments:asgs||[]});progWeek=1;progEditDay=null;progEditWid=null;
  ensureLibModals();progRender();
}
async function progReloadAssignments(){
  const{data}=await db.from("program_assignments").select("*").eq("program_id",PROG.id);
  PROG.assignments=data||[];progRender();
}
// Tellers: actief = loopt nu, aankomend = start ligt in de toekomst.
function progAktEnd(a){return ymdPlus(a.start_date,(a.weeks||1)*7-1);}
function progActief(){const t=todayStr();return (PROG.assignments||[]).filter(a=>a.start_date<=t&&progAktEnd(a)>=t).length;}
function progAankomend(){const t=todayStr();return (PROG.assignments||[]).filter(a=>a.start_date>t).length;}

// ---------- Programma toewijzen aan een klant (materialiseert naar echte workouts) ----------
let ASSIGN_CLIENTS=[];
async function openAssign(){
  ensureLibModals();
  const{data:cs}=await db.from("profiles").select("id,first_name,last_name,coach_id,company_id").eq("role","lid").eq("archived",false).eq("company_id",ME.profile.company_id).order("first_name");
  ASSIGN_CLIENTS=cs||[];
  const sel=document.getElementById("assign-client");
  sel.innerHTML=ASSIGN_CLIENTS.length?ASSIGN_CLIENTS.map(c=>'<option value="'+c.id+'">'+esc(naamVan(c))+'</option>').join(""):'<option value="">Geen klanten</option>';
  document.getElementById("assign-date").value=todayStr();
  const nWo=(PROG.workouts||[]).length,wk=Math.max(1,PROG.weeks||1);
  document.getElementById("assign-info").textContent=nWo+" workout"+(nWo===1?"":"s")+" uit "+(wk===1?"1 week":wk+" weken")+" komen op de kalender van de klant.";
  document.getElementById("assign-msg").textContent="";
  document.getElementById("assign-btn").disabled=false;
  document.getElementById("assignmodal").classList.add("show");
}
function closeAssign(){const m=document.getElementById("assignmodal");if(m)m.classList.remove("show");}
async function assignDoen(){
  const cid=document.getElementById("assign-client").value;
  const start=document.getElementById("assign-date").value;
  const msg=document.getElementById("assign-msg");
  if(!cid){msg.textContent="Kies een klant.";msg.className="msg err";return;}
  if(!start){msg.textContent="Kies een startdatum.";msg.className="msg err";return;}
  const client=ASSIGN_CLIENTS.find(c=>c.id===cid);if(!client)return;
  const weeks=Math.max(1,PROG.weeks||1);
  document.getElementById("assign-btn").disabled=true;
  try{
    const{data:asg,error:ae}=await db.from("program_assignments").insert({company_id:ME.profile.company_id,program_id:PROG.id,athlete_id:cid,start_date:start,weeks,created_by:ME.user.id}).select().single();
    if(ae)throw ae;
    const wos=(PROG.workouts||[]).slice().sort((a,b)=>(a.week-b.week)||(a.day-b.day)||(a.sort-b.sort));
    const blocksAll=[];
    for(const pw of wos){
      const datum=ymdPlus(start,(pw.week-1)*7+(pw.day-1));
      const{data:nw,error:we}=await db.from("workouts").insert({company_id:client.company_id||ME.profile.company_id,coach_id:client.coach_id||ME.user.id,client_id:cid,workout_date:datum,title:pw.title,coach_notes:pw.coach_notes,warmup:pw.warmup,cooldown:pw.cooldown,audience:"client",assignment_id:asg.id}).select("id").single();
      if(we)throw we;
      (pw.program_blocks||[]).slice().sort((a,b)=>a.sort-b.sort).forEach(b=>blocksAll.push({workout_id:nw.id,kind:b.kind,label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription,notes:b.notes,sort:b.sort,color:b.color,score_type:b.score_type||"text",oefening_id:b.oefening_id}));
    }
    if(blocksAll.length){const{error:be}=await db.from("blocks").insert(blocksAll);if(be)throw be;}
    closeAssign();toast("Programma toegewezen aan "+naamVan(client)+", staat nu op zijn kalender");
    await progReloadAssignments();
  }catch(e){msg.textContent=e.message||"Toewijzen mislukt";msg.className="msg err";document.getElementById("assign-btn").disabled=false;}
}
function progBack(){PROG=null;coachRenderSection();}
function progWeekTab(w){progWeek=w;progRender();}
async function progAddWeek(){
  const weeks=(PROG.weeks||1)+1;
  const{error}=await db.from("program_templates").update({weeks}).eq("id",PROG.id);
  if(error){toast(error.message||"Mislukt");return;}
  PROG.weeks=weeks;progWeek=weeks;progRender();
  const lp=(LIB.programs||[]).find(x=>x.id===PROG.id);if(lp)lp.weeks=weeks;
}
function progRender(){
  const cp=document.getElementById("cpage");if(!cp||!PROG)return;
  const weeks=Math.max(1,PROG.weeks||1);if(progWeek>weeks)progWeek=weeks;
  const weekTabs=Array.from({length:weeks},(_,i)=>i+1).map(w=>'<button class="wtab'+(w===progWeek?" on":"")+'" onclick="progWeekTab('+w+')">'+w+'</button>').join("");
  // Editkolom breder maken zodat de bouwer ruimte heeft (net als bij een klant).
  const editCol=(progEditDay&&progEditDay.week===progWeek)?progEditDay.day:-1;
  const cols=[1,2,3,4,5,6,7].map(d=>d===editCol?"minmax(340px,2.4fr)":"minmax(132px,1fr)").join(" ");
  const days=[1,2,3,4,5,6,7].map(d=>progDayCol(progWeek,d)).join("");
  cp.innerHTML='<div class="progedit">'+
    '<div class="pe-top"><button class="btn ghost sm" onclick="progBack()">‹ Terug</button>'+
      '<div class="pe-badges"><span class="cpill">'+esc(PROG.type==="standard"?"Standaard":(PROG.type||"Standaard"))+'</span><span class="cpill">'+weeks+' week'+(weeks===1?"":"en")+'</span></div>'+
      '<div style="margin-left:auto"><button class="btn ghost sm" onclick="programDetails(\''+PROG.id+'\')">Details bewerken</button></div></div>'+
    '<h1 style="margin:8px 0 2px">'+esc(PROG.name)+'</h1>'+(PROG.description?'<div class="sm muted" style="margin-bottom:8px">'+esc(PROG.description)+'</div>':'')+
    '<div class="pe-bar"><button class="btn sm" onclick="openAssign()">Programma toewijzen</button><span class="pe-assign">'+progActief()+' actieve toewijzingen</span><span class="pe-assign">'+progAankomend()+' aankomend</span></div>'+
    '<h2 style="margin:16px 0 8px">Workouts</h2>'+
    '<div class="pe-weeks"><span>Week</span>'+weekTabs+'<span class="sm muted" style="margin-left:auto;font-weight:600">Week '+progWeek+' · dag 1-7</span></div>'+
    '<div class="pe-grid" style="grid-template-columns:'+cols+'">'+days+'</div>'+
    '<div style="margin-top:12px"><button class="btn ghost sm" onclick="progAddWeek()">+ Week toevoegen</button></div>'+
  '</div>';
  if(progEditDay){relabel();groei();}
}
function progDayCol(week,day){
  const wos=(PROG.workouts||[]).filter(w=>w.week===week&&w.day===day).sort((a,b)=>a.sort-b.sort);
  const editing=progEditDay&&progEditDay.week===week&&progEditDay.day===day;
  let inner='<div class="pe-dh">Dag '+day+'</div>';
  if(editing){
    inner+=wos.filter(w=>w.id!==progEditWid).map(progCard).join("");
    const w=progEditWid?wos.find(x=>x.id===progEditWid):null;
    const wObj=w?{id:w.id,title:w.title,warmup:w.warmup,cooldown:w.cooldown,blocks:(w.program_blocks||[])}:{};
    inner+='<div class="ib2 pe-ib" onclick="event.stopPropagation()">'+progBuilderHtml(wObj)+'</div>';
  }else{
    inner+='<button class="pe-add" onclick="progOpenBuilder('+week+','+day+',null)">+ Toevoegen</button>'+wos.map(progCard).join("");
  }
  return '<div class="pe-day">'+inner+'</div>';
}
// Workout-kaart in exact dezelfde stijl als in de klant-kalender (mcard/cblk + blokkleuren).
function progCard(w){
  const blocks=(w.program_blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  let inner="";
  if(w.warmup)inner+='<div class="cblk k-grijs"><div class="n">Warmup</div><div class="pr">'+esc(w.warmup)+'</div></div>';
  blocks.forEach(b=>{const kleur=b.color?" k-"+esc(b.color):"";const lk=b.linked?" linked2":"";inner+='<div class="cblk'+kleur+lk+'"><div class="n">'+esc(b.label||"")+') '+esc(b.exercise||"")+'</div>'+(composePresc(b)?'<div class="pr">'+esc(composePresc(b))+'</div>':'')+'</div>';});
  if(w.cooldown)inner+='<div class="cblk k-grijs"><div class="n">Cooldown</div><div class="pr">'+esc(w.cooldown)+'</div></div>';
  return '<div class="mcard planned" style="margin-top:8px" onclick="progOpenBuilder('+w.week+','+w.day+',\''+w.id+'\')"><div class="msc"><span class="wtitle">'+esc(w.title||"Workout")+'</span></div>'+inner+'</div>';
}
function progOpenBuilder(week,day,wid){progEditDay={week,day};progEditWid=wid||null;progRender();}
function progCloseBuilder(){progEditDay=null;progEditWid=null;progRender();}
function progBuilderHtml(w){
  w=w||{};const blocks=(w.blocks||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0));
  const rows=blocks.length?blocks.map(b=>b.kind==="conditioning"?condRow(b):exRow(b)).join(""):exRow({});
  return '<div class="sec"><input id="w_title" class="row-title" placeholder="Titel (bijv. Kracht)" value="'+esc(w.title||"")+'"><textarea id="w_warmup" rows="1" placeholder="Warming-up toevoegen…">'+esc(w.warmup||"")+'</textarea></div>'+
    '<div id="exrows">'+rows+'</div>'+
    '<div class="addbtns"><button onclick="addExBtn()">+ Oefening</button><button onclick="addCondBtn()">+ Conditioning</button><button class="iconly" title="Dupliceer laatste blok" onclick="dupLast()">⧉</button></div>'+
    '<div class="sec"><textarea id="w_cooldown" rows="1" placeholder="Cooldown toevoegen…">'+esc(w.cooldown||"")+'</textarea></div>'+
    '<div class="foot"><button class="save" onclick="progSaveWorkout()">Opslaan</button><button class="cancel" onclick="progCloseBuilder()">Annuleren</button>'+(w.id?'<button class="cancel" style="color:#e5484d;border-color:#f3b8ba" onclick="progDeleteWorkout(\''+w.id+'\')">Verwijderen</button>':'')+'</div>';
}
async function progReloadWorkouts(){
  const{data:pws}=await db.from("program_workouts").select("*, program_blocks(*)").eq("program_id",PROG.id).order("week").order("day").order("sort");
  PROG.workouts=pws||[];progEditDay=null;progEditWid=null;progRender();
}
async function progSaveWorkout(){
  const g=id=>document.getElementById(id);
  const title=(g("w_title").value||"").trim();
  const rows=[...document.querySelectorAll("#exrows .exrow")].map((r,i)=>{const o=rowToObj(r);o.label=r.querySelector(".lbl-badge").textContent;o.sort=i+1;return o;}).filter(b=>b.exercise);
  const wf={program_id:PROG.id,company_id:ME.profile.company_id,week:progEditDay.week,day:progEditDay.day,title:title||null,warmup:g("w_warmup").value.trim()||null,cooldown:g("w_cooldown").value.trim()||null};
  const mkBlocks=pwid=>rows.map(b=>({program_workout_id:pwid,company_id:ME.profile.company_id,kind:b.kind,label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription||null,notes:b.notes||null,sort:b.sort,color:b.color||null,score_type:b.score_type||"text",oefening_id:b.oefening_id||null}));
  try{
    if(progEditWid){
      const{error:ue}=await db.from("program_workouts").update(wf).eq("id",progEditWid);if(ue)throw ue;
      await db.from("program_blocks").delete().eq("program_workout_id",progEditWid);
      if(rows.length){const{error:be}=await db.from("program_blocks").insert(mkBlocks(progEditWid));if(be)throw be;}
    }else{
      const{data:nw,error}=await db.from("program_workouts").insert(wf).select().single();if(error)throw error;
      if(rows.length){const{error:be}=await db.from("program_blocks").insert(mkBlocks(nw.id));if(be)throw be;}
    }
    toast("Workout opgeslagen");await progReloadWorkouts();
  }catch(e){toast(e.message||"Opslaan mislukt");}
}
async function progDeleteWorkout(id){
  if(!confirm("Deze workout uit het programma verwijderen?"))return;
  const{error}=await db.from("program_workouts").delete().eq("id",id);
  if(error){toast(error.message||"Mislukt");return;}
  toast("Workout verwijderd");await progReloadWorkouts();
}
async function programVerwijder(id){
  if(!confirm("Dit programma verwijderen?"))return;
  const{error}=await db.from("program_templates").delete().eq("id",id);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  libModalDicht();toast("Programma verwijderd");await programLaad();
}
function openProgramMenu(ev,id){
  ev.stopPropagation();
  const row=ev.target.closest(".trow");if(!row)return;
  const bestond=row.querySelector(".coachmenu");document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  if(bestond)return;
  const m=document.createElement("div");m.className="coachmenu";
  m.innerHTML='<button onclick="event.stopPropagation();programBewerk(\''+id+'\')">Bewerken</button><button class="danger" onclick="event.stopPropagation();programVerwijder(\''+id+'\')">Verwijderen</button>';
  row.appendChild(m);
}
document.addEventListener("click",e=>{if(!e.target.closest(".coachmenu")&&!e.target.closest(".kebab"))document.querySelectorAll(".coachmenu").forEach(x=>x.remove());});
function oefBewerk(id){
  LIB.editOef=id;
  const o=id?LIB.oef.find(x=>x.id===id):null;
  document.getElementById("exmodal-titel").textContent=o?"Oefening bewerken":"Nieuwe oefening";
  document.getElementById("exmodal-naam").value=o?o.naam:"";
  document.getElementById("exmodal-video").value=o?(o.youtube_id?"https://youtu.be/"+o.youtube_id:(o.video_url||"")):"";
  document.getElementById("exmodal-msg").textContent="";
  const prev=document.getElementById("exmodal-prev");
  prev.innerHTML=o&&o.youtube_id?'<div style="cursor:pointer" onclick="this.innerHTML=\'<iframe width=&quot;100%&quot; height=&quot;220&quot; src=&quot;https://www.youtube.com/embed/'+esc(o.youtube_id)+'?autoplay=1&quot; frameborder=&quot;0&quot; allow=&quot;autoplay&quot; allowfullscreen referrerpolicy=&quot;strict-origin-when-cross-origin&quot; style=&quot;border-radius:10px&quot;></iframe><div class=&quot;sm muted&quot; style=&quot;margin-top:4px&quot;>Speelt niet af? <a href=&quot;https://youtu.be/'+esc(o.youtube_id)+'&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot;>Bekijk op YouTube</a></div>\'"><img src="https://i.ytimg.com/vi/'+esc(o.youtube_id)+'/hqdefault.jpg" style="width:100%;border-radius:10px;display:block" alt=""><div class="sm muted" style="margin-top:4px">Klik om de video af te spelen</div></div>':"";
  const del=document.getElementById("exmodal-del");
  del.innerHTML=(o&&myRole()==="platform_admin")?'<button class="btn ghost sm" onclick="oefVerwijder()">Verwijderen</button>':"";
  document.getElementById("exmodal").classList.add("show");
}
async function exOpslaan(){
  const naam=document.getElementById("exmodal-naam").value.trim();
  const video=document.getElementById("exmodal-video").value.trim();
  const msg=document.getElementById("exmodal-msg");
  if(!naam){msg.textContent="Vul een naam in.";msg.className="msg err";return;}
  const yt=ytIdVan(video);
  const velden={naam,youtube_id:yt||"",video_url:yt?"":(video||"")};
  const wasEdit=!!LIB.editOef;
  let fout=null;
  if(wasEdit){const{error}=await db.from("oefeningen").update(velden).eq("id",LIB.editOef);fout=error;}
  else{velden.tags=["eigen"];velden.bron="eigen";const{error}=await db.from("oefeningen").insert(velden);fout=error;}
  if(fout){msg.textContent=fout.message||"Opslaan mislukt.";msg.className="msg err";return;}
  LIB.geladen=false;libModalDicht();toast(wasEdit?"Oefening bijgewerkt":"Oefening toegevoegd");
  await libLaad();
}
async function oefVerwijder(){
  if(!LIB.editOef||!confirm("Deze oefening verwijderen?"))return;
  const{error}=await db.from("oefeningen").delete().eq("id",LIB.editOef);
  if(error){const msg=document.getElementById("exmodal-msg");msg.textContent=error.message;msg.className="msg err";return;}
  LIB.geladen=false;libModalDicht();toast("Oefening verwijderd");
  await libLaad();
}
function tplKleurDots(){
  document.getElementById("tpl-kleuren").innerHTML=TPLKLEUREN.map(k=>'<span class="'+(k===LIB.tplKleur?"aan":"")+'" title="'+LEGNAAM[k]+'" onclick="LIB.tplKleur=\''+k+'\';tplKleurDots()" style="background:'+TPLKLEUR[k]+'"></span>').join("");
}
function tplBewerk(id){
  LIB.editTpl=id;
  const o=id?LIB.tpl.find(x=>x.id===id):null;
  document.getElementById("tplmodal-titel").textContent=o?"Template bewerken":"Nieuwe template";
  document.getElementById("tpl-naam").value=o?o.naam:"";
  document.getElementById("tpl-instr").value=o?(o.instructies||""):"";
  document.getElementById("tpl-type").value=o?(o.type||"other"):(LIB.mode==="warmup"?"warmup":(LIB.mode==="cooldown"?"cooldown":"other"));
  document.getElementById("tplmodal-msg").textContent="";
  LIB.tplKleur=o&&TPLKLEUREN.includes(o.kleur)?o.kleur:"yellow";
  tplKleurDots();
  const del=document.getElementById("tplmodal-del");
  del.innerHTML=(o&&myRole()==="platform_admin")?'<button class="btn ghost sm" onclick="tplVerwijder()">Verwijderen</button>':"";
  document.getElementById("tplmodal").classList.add("show");
}
async function tplOpslaan(){
  const naam=document.getElementById("tpl-naam").value.trim();
  const msg=document.getElementById("tplmodal-msg");
  if(!naam){msg.textContent="Vul een naam in.";msg.className="msg err";return;}
  const velden={naam,instructies:document.getElementById("tpl-instr").value,type:document.getElementById("tpl-type").value,kleur:LIB.tplKleur};
  const wasEdit=!!LIB.editTpl;
  let fout=null;
  if(wasEdit){const{error}=await db.from("templates").update(velden).eq("id",LIB.editTpl);fout=error;}
  else{velden.tags=[];velden.coach=ME.profile.first_name||"";const{error}=await db.from("templates").insert(velden);fout=error;}
  if(fout){msg.textContent=fout.message||"Opslaan mislukt.";msg.className="msg err";return;}
  LIB.geladen=false;libModalDicht();toast(wasEdit?"Template bijgewerkt":"Template toegevoegd");
  await libLaad();
  const im=document.getElementById("insmodal");if(im&&im.classList.contains("show"))insRender();
}
async function tplVerwijder(){
  if(!LIB.editTpl||!confirm("Deze template verwijderen?"))return;
  const{error}=await db.from("templates").delete().eq("id",LIB.editTpl);
  if(error){const msg=document.getElementById("tplmodal-msg");msg.textContent=error.message;msg.className="msg err";return;}
  LIB.geladen=false;libModalDicht();toast("Template verwijderd");
  await libLaad();
}
