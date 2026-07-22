// app/bibliotheek.js — de oefeningen- en templatebibliotheek: zoeken,
// pagineren, YouTube-miniaturen, kleurfilter, en oefening/template
// toevoegen, bewerken en verwijderen.
// ---------- BIBLIOTHEEK (live uit oefeningen + templates) ----------
const TPLKLEUR={yellow:"#eab308",blue:"#3b82f6",purple:"#8b5cf6",red:"#ef4444",green:"#22c55e",orange:"#f97316",gray:"#9ca3af"};
const TPLKLEUREN=["yellow","blue","purple","red","green","orange"];
const LEGNAAM={yellow:"Conditie",blue:"Kracht",purple:"Gymnastics",red:"Intensief",green:"Herstel",orange:"Overig"};
const LIB_PER=50;
let LIB={oef:[],tpl:[],programs:[],programAsgs:[],bm:[],bmCat:"",editBm:null,mode:"oef",zoek:"",pag:0,kleur:"",busy:false,geladen:false,editOef:null,editTpl:null,editProgram:null,tplKleur:"yellow"};
// Benchmark-categorieën (zelfde indeling als Strivee's Add Benchmark)
const BM_CATS=[["girls","Girls"],["heroes","Heroes"],["open","Open"],["notable","Notable"],["custom","Custom"]];
const BM_CATNAAM=Object.fromEntries(BM_CATS);
// Programma-editor (week/dag-indeling met workouts); bouwer opent inline in de dag, net als bij een klant.
let PROG=null,progWeek=1,progEditDay=null,progEditWid=null;
const ytIdVan=u=>{const m=(u||"").match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/);return m?m[1]:null;};

function libShellHtml(){
  const nav=[["oef","Oefeningen"],["warmup","Warming-ups"],["workout","Workouts"],["cooldown","Cooldowns"]]
    .map(m=>'<button class="'+(LIB.mode===m[0]?"on":"")+'" onclick="libZetMode(\''+m[0]+'\')">'+m[1]+'</button>').join("");
  return '<h1>Bibliotheek</h1><div class="libgrid">'+
    '<div class="card libnav">'+nav+'<button class="'+(LIB.mode==="benchmarks"?"on":"")+'" onclick="libZetMode(\'benchmarks\')">Benchmarks</button><button class="'+(LIB.mode==="programs"?"on":"")+'" onclick="libZetMode(\'programs\')">Programma\'s</button></div>'+
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
      '<div id="tpl-media"></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" onclick="tplOpslaan()">Opslaan</button><button class="btn ghost" onclick="libModalDicht()">Annuleren</button><span id="tplmodal-del" style="margin-left:auto"></span></div>'+
      '<div class="msg" id="tplmodal-msg"></div></div></div>'+
    '<div class="lmodal" id="bmmodal"><div class="box"><h3 id="bmmodal-titel">Benchmark toevoegen (Custom)</h3>'+
      '<div class="field"><label>Naam</label><input id="bm-naam" placeholder="bijv. CFC Challenge 2026"></div>'+
      '<div class="field"><label>Type (optioneel)</label><select id="bm-badge"><option value="">geen</option><option value="bodyweight">bodyweight</option><option value="light">light</option><option value="heavy">heavy</option><option value="endurance">endurance</option><option value="skill">skill</option></select></div>'+
      '<div class="field"><label>Workout</label><textarea id="bm-tekst" style="min-height:140px" placeholder="For time:&#10;21-15-9&#10;…"></textarea></div>'+
      '<div class="field"><label>Bewegingen (tags, gescheiden door komma\'s)</label><input id="bm-tags" placeholder="bijv. Thruster, Pull-up"></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" onclick="bmOpslaan()">Opslaan</button><button class="btn ghost" onclick="libModalDicht()">Annuleren</button><span id="bmmodal-del" style="margin-left:auto"></span></div>'+
      '<div class="msg" id="bmmodal-msg"></div></div></div>'+
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
    '<div class="lmodal" id="asglistmodal" style="z-index:398"><div class="box" style="width:640px;max-width:94vw"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Toewijzingen <span class="sm muted" id="asglist-prog" style="font-weight:600;font-size:12.5px"></span></h3><span onclick="closeAsgList()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
      '<div id="asglist-lijst" style="max-height:56vh;overflow:auto"></div>'+
      '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="closeAsgList()">Sluiten</button></div></div></div>'+
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
      '<div id="inv-result" style="display:none;margin-bottom:12px"><div class="sm" style="margin-bottom:6px;font-weight:700">Uitnodigingslink (14 dagen geldig)</div><div style="display:flex;gap:6px"><input id="inv-link" readonly style="flex:1;font-size:11.5px"><button class="btn sm" onclick="kopieerInvLink()">Kopieer</button></div><div class="sm muted" style="margin-top:6px">De klant krijgt deze link automatisch per e-mail (binnen een minuut). Je kunt hem hier ook kopiëren om zelf te sturen, bijvoorbeeld via WhatsApp.</div></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" id="inv-maak" onclick="invAanmaken()">Uitnodiging aanmaken</button><button class="btn ghost" onclick="document.getElementById(\'invmodal\').classList.remove(\'show\')">Sluiten</button></div>'+
      '<div class="msg" id="inv-msg"></div></div></div>';
  document.body.appendChild(d);
}
// Geeft een promise terug zodat zoekers (bouwer, demo-video) kunnen wachten
// tot de bibliotheek er is en dan alsnog hun resultaten tonen.
function libLaad(){
  if(LIB.geladen){libKop();return Promise.resolve();}
  if(LIB.busy&&LIB.laadPromise)return LIB.laadPromise;
  LIB.busy=true;
  LIB.laadPromise=(async()=>{
    let alles=[],from=0;
    while(true){
      const{data,error}=await db.from("oefeningen").select("id,naam,youtube_id,video_url,tags,bron").order("naam").range(from,from+999);
      if(error){LIB.busy=false;const h=document.getElementById("lib-lijst");if(h)h.innerHTML='<div class="cempty">Kon de bibliotheek niet laden. Probeer het opnieuw.</div>';return;}
      alles=alles.concat(data||[]);
      if(!data||data.length<1000)break;
      from+=1000;
    }
    const{data:tpl}=await db.from("templates").select("id,naam,instructies,type,kleur,tags,coach,media").order("naam");
    const{data:bms}=await db.from("benchmarks").select("*").order("naam");
    LIB.bm=bms||[];
    const{data:progs}=await db.from("program_templates").select("*, creator:created_by(id,first_name,last_name,avatar_url)").order("name");
    const{data:asgs}=await db.from("program_assignments").select("id,program_id,athlete_id,start_date,weeks");
    LIB.oef=alles;LIB.tpl=tpl||[];LIB.programs=progs||[];LIB.programAsgs=asgs||[];LIB.geladen=true;LIB.busy=false;
    libLijst();
  })();
  return LIB.laadPromise;
}
function libZetMode(m){LIB.mode=m;LIB.zoek="";LIB.pag=0;LIB.kleur="";const z=document.getElementById("lib-zoek");if(z)z.value="";coachRenderSection();}
function libFilter(v){LIB.zoek=(v||"").toLowerCase();LIB.pag=0;libLijst();}
function libGa(p){LIB.pag=p;libLijst();}
function libKleurFilter(k){LIB.kleur=LIB.kleur===k?"":k;LIB.pag=0;libLijst();}
function libKop(){
  const titels={oef:"Oefeningen",warmup:"Warming-ups",workout:"Workouts",cooldown:"Cooldowns",benchmarks:"Benchmarks",programs:"Programma's"};
  const t=document.getElementById("lib-titel");if(t)t.textContent=titels[LIB.mode];
  const subs={
    oef:"Jullie eigen videobibliotheek, live uit de database. Sporters zien de demo-video bij elke workout.",
    benchmarks:"De bekende benchmark-workouts (Girls, Heroes, Open, Notable) plus je eigen Custom-benchmarks.",
    programs:"Gebruik de programma-index om veelgebruikte workout-sets aan je klanten toe te voegen."
  };
  const s=document.getElementById("lib-sub");if(s)s.textContent=subs[LIB.mode]||"Templates uit jullie Strivee, live uit de database. Klik op een template om naam, tekst of kleur aan te passen.";
  const a=document.getElementById("lib-addbtn");if(a)a.textContent=LIB.mode==="oef"?"+ Oefening toevoegen":(LIB.mode==="programs"?"+ Programma toevoegen":(LIB.mode==="benchmarks"?"+ Benchmark toevoegen":"+ Template toevoegen"));
  const leg=document.getElementById("lib-legenda");
  if(leg){
    if(LIB.mode==="oef"||LIB.mode==="programs"){leg.style.display="none";}
    else if(LIB.mode==="benchmarks"){
      leg.style.display="flex";
      leg.innerHTML='<span class="legchip'+(LIB.bmCat===""?" aan":"")+'" onclick="bmCatFilter(\'\')">Alles</span>'+
        BM_CATS.map(([k,n])=>'<span class="legchip'+(LIB.bmCat===k?" aan":"")+'" onclick="bmCatFilter(\''+k+'\')">'+n+'</span>').join("");
    }
    else{
      leg.style.display="flex";
      leg.innerHTML=TPLKLEUREN.map(k=>'<span class="legchip'+(LIB.kleur===k?" aan":"")+'" onclick="libKleurFilter(\''+k+'\')"><span style="width:12px;height:12px;border-radius:50%;background:'+TPLKLEUR[k]+';flex:none"></span>'+LEGNAAM[k]+'</span>').join("")+'<span class="sm muted" style="font-size:11.5px">klik op een kleur om te filteren</span>';
    }
  }
}
function bmCatFilter(k){LIB.bmCat=LIB.bmCat===k?"":k;LIB.pag=0;libLijst();}
function libLijst(){
  libKop();
  const host=document.getElementById("lib-lijst"),thead=document.getElementById("lib-thead"),pag=document.getElementById("lib-pag"),cnt=document.getElementById("lib-aantal");
  if(!host)return;
  if(!LIB.geladen){host.innerHTML='<div class="cempty">Bibliotheek laden…</div>';return;}
  if(LIB.mode==="programs"){programLijst(host,thead,pag,cnt);return;}
  if(LIB.mode==="benchmarks"){benchLijst(host,thead,pag,cnt);return;}
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
function libModalDicht(){document.getElementById("exmodal").classList.remove("show");document.getElementById("tplmodal").classList.remove("show");const pm=document.getElementById("progmodal");if(pm)pm.classList.remove("show");const bm=document.getElementById("bmmodal");if(bm)bm.classList.remove("show");LIB.editOef=null;LIB.editTpl=null;LIB.editProgram=null;LIB.editBm=null;}
function libNieuw(){if(LIB.mode==="oef")oefBewerk(null);else if(LIB.mode==="programs")programNieuw();else if(LIB.mode==="benchmarks")bmBewerk(null);else tplBewerk(null);}

// ---------- Benchmarks (Girls/Heroes/Open/Notable + eigen Custom) ----------
function benchLijst(host,thead,pag,cnt){
  if(thead)thead.innerHTML='<div style="flex:1.6">Naam</div><div style="flex:2.8">Workout</div><div style="flex:1.2">Bewegingen</div>';
  const hits=LIB.bm.filter(b=>
    (!LIB.bmCat||b.categorie===LIB.bmCat)&&
    (!LIB.zoek||(b.naam||"").toLowerCase().includes(LIB.zoek)||(b.tekst||"").toLowerCase().includes(LIB.zoek)||(b.tags||[]).join(" ").toLowerCase().includes(LIB.zoek)));
  if(cnt)cnt.textContent=hits.length+" benchmarks";
  host.innerHTML=hits.map(b=>{
    const eigen=b.categorie==="custom";
    const badge=b.badge?' <span class="cpill" style="background:#eef1f4;color:#5d6570;text-transform:lowercase">'+esc(b.badge)+'</span>':'';
    const cat=' <span class="cpill teal" style="text-transform:none">'+esc(BM_CATNAAM[b.categorie]||b.categorie)+'</span>';
    const tg=(b.tags||[]).slice(0,3).map(t=>'<span class="tag">'+esc(t)+'</span>').join(" ");
    return '<div class="trow" style="align-items:flex-start'+(eigen?';cursor:pointer':'')+'"'+(eigen?' onclick="bmBewerk(\''+b.id+'\')"':'')+'>'+
      '<div style="flex:1.6"><b>'+esc(b.naam)+'</b>'+badge+cat+'</div>'+
      '<div style="flex:2.8" class="sm muted">'+esc(b.tekst||"").replace(/\n/g,"<br>")+'</div>'+
      '<div style="flex:1.2">'+tg+'</div></div>';
  }).join("")||'<div class="cempty">Geen benchmarks gevonden'+(LIB.bmCat==="custom"?'. Voeg je eerste eigen benchmark toe met "+ Benchmark toevoegen".':'.')+'</div>';
  if(pag)pag.innerHTML="";
}
function bmBewerk(id){
  ensureLibModals();
  LIB.editBm=id||null;
  const b=id?LIB.bm.find(x=>String(x.id)===String(id)):null;
  if(id&&!b)return;
  document.getElementById("bmmodal-titel").textContent=id?"Benchmark bewerken":"Benchmark toevoegen (Custom)";
  document.getElementById("bm-naam").value=b?(b.naam||""):"";
  document.getElementById("bm-badge").value=b?(b.badge||""):"";
  document.getElementById("bm-tekst").value=b?(b.tekst||""):"";
  document.getElementById("bm-tags").value=b?(b.tags||[]).join(", "):"";
  document.getElementById("bmmodal-del").innerHTML=id?'<button class="btn ghost" style="color:#e5484d" onclick="bmVerwijder()">Verwijderen</button>':'';
  document.getElementById("bmmodal-msg").textContent="";
  document.getElementById("bmmodal").classList.add("show");
}
async function bmOpslaan(){
  const msg=document.getElementById("bmmodal-msg");
  const naam=document.getElementById("bm-naam").value.trim();
  const tekst=document.getElementById("bm-tekst").value.trim();
  if(!naam||!tekst){msg.textContent="Vul minimaal een naam en de workout in.";msg.className="msg err";return;}
  const rec={
    naam,tekst,
    badge:document.getElementById("bm-badge").value||null,
    tags:document.getElementById("bm-tags").value.split(",").map(s=>s.trim()).filter(Boolean),
  };
  let fout;
  if(LIB.editBm){const{error}=await db.from("benchmarks").update(rec).eq("id",LIB.editBm);fout=error;}
  else{
    Object.assign(rec,{company_id:ME.profile.company_id,categorie:"custom",created_by:ME.user.id});
    const{error}=await db.from("benchmarks").insert(rec);fout=error;
  }
  if(fout){msg.textContent=fout.message||"Opslaan mislukt";msg.className="msg err";return;}
  const{data:bms}=await db.from("benchmarks").select("*").order("naam");
  LIB.bm=bms||LIB.bm;
  libModalDicht();toast("Benchmark opgeslagen");libLijst();
}
async function bmVerwijder(){
  if(!LIB.editBm)return;
  const b=LIB.bm.find(x=>String(x.id)===String(LIB.editBm));
  if(!confirm('Benchmark "'+(b?b.naam:"")+'" verwijderen?'))return;
  const{error}=await db.from("benchmarks").delete().eq("id",LIB.editBm);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  LIB.bm=LIB.bm.filter(x=>String(x.id)!==String(LIB.editBm));
  libModalDicht();toast("Benchmark verwijderd");libLijst();
}

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
      '<div style="flex:1" class="sm muted">'+progActiefVoor(p.id)+' klant'+(progActiefVoor(p.id)===1?"":"en")+'</div>'+
      '<div style="flex:.9" class="sm muted">'+esc(p.type==="standard"?"standaard":(p.type||"standaard"))+'</div>'+
      '<div style="flex:.7">'+av+'</div>'+
      '<div style="width:150px;display:flex;gap:6px;justify-content:flex-end;align-items:center" onclick="event.stopPropagation()"><button class="btn ghost sm" onclick="programBewerk(\''+p.id+'\')">Bewerk</button><button class="kebab" onclick="event.stopPropagation();openProgramMenu(event,\''+p.id+'\')">⋮</button></div></div>';
  }).join("")||'<div class="cempty">Nog geen programma\'s. Klik op "+ Programma toevoegen" om te beginnen.</div>';
}
async function programLaad(){
  const[rp,ra]=await Promise.all([
    db.from("program_templates").select("*, creator:created_by(id,first_name,last_name,avatar_url)").order("name"),
    db.from("program_assignments").select("id,program_id,athlete_id,start_date,weeks")
  ]);
  LIB.programs=rp.data||[];LIB.programAsgs=ra.data||[];
  if(LIB.mode==="programs")libLijst();
}
// Aantal klanten met een lopende toewijzing van dit programma (uniek per klant).
function progActiefVoor(pid){
  const t=todayStr();
  const akt=(LIB.programAsgs||[]).filter(a=>a.program_id===pid&&a.start_date<=t&&progAktEnd(a)>=t);
  return new Set(akt.map(a=>a.athlete_id)).size;
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
  PROG.assignments=data||[];
  // Houd ook de teller op de programma-lijst actueel.
  LIB.programAsgs=(LIB.programAsgs||[]).filter(a=>a.program_id!==PROG.id).concat(PROG.assignments.map(a=>({id:a.id,program_id:a.program_id,athlete_id:a.athlete_id,start_date:a.start_date,weeks:a.weeks})));
  progRender();
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

// ---------- Toewijzingen-lijst (klik op de tellers of "Beheer toewijzingen") ----------
// Ongedaan maken haalt alleen de workouts van vandaag en later weg; gedane dagen
// blijven op de kalender staan (workouts.assignment_id wordt dan leeg via SET NULL).
let ASG_ROWS=[];
async function openAsgList(){
  ensureLibModals();
  const t=document.getElementById("asglist-prog");if(t)t.textContent="· "+(PROG.name||"");
  document.getElementById("asglist-lijst").innerHTML='<div class="cempty">Laden…</div>';
  document.getElementById("asglistmodal").classList.add("show");
  await asgListLaad();
}
function closeAsgList(){const m=document.getElementById("asglistmodal");if(m)m.classList.remove("show");}
async function asgListLaad(){
  const{data:asgs,error}=await db.from("program_assignments").select("*").eq("program_id",PROG.id).order("start_date",{ascending:false});
  if(error){document.getElementById("asglist-lijst").innerHTML='<div class="cempty">Kon de toewijzingen niet laden. Probeer het opnieuw.</div>';return;}
  PROG.assignments=asgs||[];
  let profs=[],wos=[];
  if(PROG.assignments.length){
    const aIds=PROG.assignments.map(a=>a.id);
    const kIds=[...new Set(PROG.assignments.map(a=>a.athlete_id))];
    const[rp,rw]=await Promise.all([
      db.from("profiles").select("id,first_name,last_name,email,avatar_url").in("id",kIds),
      db.from("workouts").select("id,workout_date,assignment_id").in("assignment_id",aIds)
    ]);
    profs=rp.data||[];wos=rw.data||[];
  }
  const t=todayStr();
  ASG_ROWS=PROG.assignments.map(a=>{
    const alle=wos.filter(w=>w.assignment_id===a.id);
    return{a,client:profs.find(p=>p.id===a.athlete_id)||null,totaal:alle.length,toekomst:alle.filter(w=>w.workout_date>=t).length};
  });
  asgListRender();
}
function asgStatus(a){
  const t=todayStr();
  if(a.start_date>t)return '<span class="cpill teal">Aankomend</span>';
  if(progAktEnd(a)>=t)return '<span class="cpill ok">Loopt</span>';
  return '<span class="cpill" style="background:#f4f4f5;color:#8a919c">Afgerond</span>';
}
function asgListRender(){
  const host=document.getElementById("asglist-lijst");if(!host)return;
  if(!ASG_ROWS.length){host.innerHTML='<div class="cempty">Nog geen toewijzingen. Gebruik "Programma toewijzen" om dit programma op de kalender van een klant te zetten.</div>';return;}
  host.innerHTML=ASG_ROWS.map(r=>{
    const c=r.client;
    const av=c?'<div class="cavc" style="width:30px;height:30px;font-size:11px;flex:none;'+avFotoStyle(c)+'">'+avFotoText(c)+'</div>':'<div class="cavc" style="width:30px;height:30px;font-size:11px;flex:none;background:#c9cdd4">?</div>';
    const naam=c?naamVan(c):"Onbekende klant";
    const eind=progAktEnd(r.a);
    return '<div class="trow" style="align-items:center;gap:10px">'+av+
      '<div style="flex:1.6;min-width:0"><b>'+naam+'</b><div class="sm muted">'+datumNL(r.a.start_date)+' t/m '+datumNL(eind)+' · '+((r.a.weeks||1)===1?"1 week":(r.a.weeks||1)+" weken")+'</div></div>'+
      '<div style="flex:1" class="sm muted">'+r.totaal+' workout'+(r.totaal===1?"":"s")+(r.toekomst?' <span style="color:#5b6472">('+r.toekomst+' aankomend)</span>':'')+'</div>'+
      '<div style="width:92px">'+asgStatus(r.a)+'</div>'+
      '<div style="width:130px;text-align:right"><button class="btn ghost sm" style="color:#e5484d;border-color:#f3b8ba" onclick="asgOngedaan(\''+r.a.id+'\')">Ongedaan maken</button></div></div>';
  }).join("");
}
async function asgOngedaan(id){
  const r=ASG_ROWS.find(x=>x.a.id===id);if(!r)return;
  const naam=r.client?([r.client.first_name,r.client.last_name].filter(Boolean).join(" ")||r.client.email):"deze klant";
  const voorbij=r.totaal-r.toekomst;
  let vraag="Toewijzing aan "+naam+" ongedaan maken?\n\n";
  vraag+=r.toekomst?(r.toekomst===1?"1 workout (vanaf vandaag) wordt":r.toekomst+" workouts (vanaf vandaag) worden")+" van de kalender gehaald.":"Er staan geen workouts vanaf vandaag meer op de kalender.";
  if(voorbij)vraag+="\n"+(voorbij===1?"1 gedane/verstreken dag blijft":voorbij+" gedane/verstreken dagen blijven")+" gewoon staan.";
  if(!confirm(vraag))return;
  const{error:we}=await db.from("workouts").delete().eq("assignment_id",id).gte("workout_date",todayStr());
  if(we){toast(we.message||"Workouts verwijderen mislukt");return;}
  const{error:ae}=await db.from("program_assignments").delete().eq("id",id);
  if(ae){toast(ae.message||"Toewijzing verwijderen mislukt");return;}
  toast("Toewijzing aan "+naam+" ongedaan gemaakt");
  await asgListLaad();          // lijst in het venster verversen
  await progReloadAssignments(); // tellers in de editor + programma-lijst verversen
}

function progBack(){PROG=null;coachRenderSection();}
// Weektab: alle weken staan onder elkaar (zoals de klant-kalender); de tab scrolt ernaartoe.
function progWeekTab(w){
  progWeek=w;
  document.querySelectorAll(".pe-weeks .wtab").forEach((b,i)=>b.classList.toggle("on",i+1===w));
  const lbl=document.getElementById("pe-viewing");if(lbl)lbl.textContent="Week "+w+" · dag "+((w-1)*7+1)+"-"+(w*7);
  const el=document.getElementById("pe-week-"+w);if(el)el.scrollIntoView({behavior:"smooth",block:"start"});
}
async function progAddWeek(){
  const weeks=(PROG.weeks||1)+1;
  const{error}=await db.from("program_templates").update({weeks}).eq("id",PROG.id);
  if(error){toast(error.message||"Mislukt");return;}
  PROG.weeks=weeks;progWeek=weeks;progRender();
  const el=document.getElementById("pe-week-"+weeks);if(el)el.scrollIntoView({behavior:"smooth",block:"start"});
  const lp=(LIB.programs||[]).find(x=>x.id===PROG.id);if(lp)lp.weeks=weeks;
}
function progRender(){
  const cp=document.getElementById("cpage");if(!cp||!PROG)return;
  const weeks=Math.max(1,PROG.weeks||1);if(progWeek>weeks)progWeek=weeks;
  const weekTabs=Array.from({length:weeks},(_,i)=>i+1).map(w=>'<button class="wtab'+(w===progWeek?" on":"")+'" onclick="progWeekTab('+w+')">'+w+'</button>').join("");
  // Alle weken onder elkaar in één doorlopend raster, zoals de klant-kalender.
  const wkHtml=Array.from({length:weeks},(_,i)=>progWeekBlok(i+1)).join("");
  cp.innerHTML='<div class="progedit">'+
    '<div class="pe-top"><button class="btn ghost sm" onclick="progBack()">‹ Terug</button>'+
      '<div class="pe-badges"><span class="cpill">'+esc(PROG.type==="standard"?"Standaard":(PROG.type||"Standaard"))+'</span><span class="cpill">'+(weeks===1?"1 week":weeks+" weken")+'</span></div>'+
      '<div style="margin-left:auto"><button class="btn ghost sm" onclick="programDetails(\''+PROG.id+'\')">Details bewerken</button></div></div>'+
    '<h1 style="margin:8px 0 2px">'+esc(PROG.name)+'</h1>'+(PROG.description?'<div class="sm muted" style="margin-bottom:8px">'+esc(PROG.description)+'</div>':'')+
    '<div class="pe-bar"><button class="btn sm" onclick="openAssign()">Programma toewijzen</button><span class="pe-assign" style="cursor:pointer" title="Bekijk de toewijzingen" onclick="openAsgList()">'+progActief()+' actieve toewijzingen</span><span class="pe-assign" style="cursor:pointer" title="Bekijk de toewijzingen" onclick="openAsgList()">'+progAankomend()+' aankomend</span><button class="btn ghost sm" style="margin-left:auto" onclick="openAsgList()">Beheer toewijzingen</button></div>'+
    '<h2 style="margin:16px 0 8px">Workouts</h2>'+
    '<div class="pe-weeks"><span>Week</span>'+weekTabs+'<span class="sm muted" id="pe-viewing" style="margin-left:auto;font-weight:600">Week '+progWeek+' · dag '+((progWeek-1)*7+1)+'-'+(progWeek*7)+'</span></div>'+
    '<div class="pe-cal">'+wkHtml+'</div>'+
    '<div style="margin-top:12px"><button class="btn ghost sm" onclick="progAddWeek()">+ Week toevoegen</button></div>'+
  '</div>';
  if(progEditDay){relabel();groei();}
}
// Eén week in het raster: weekbalk (zoals de maandbalk) + kopregel met doorlopende
// dagnummers + een rij cellen die randen delen (zoals .mday in de klant-kalender).
function progWeekBlok(week){
  const editCol=(progEditDay&&progEditDay.week===week)?progEditDay.day:-1;
  const cols=[1,2,3,4,5,6,7].map(d=>d===editCol?"minmax(340px,2.4fr)":"minmax(132px,1fr)").join(" ");
  const hd=[1,2,3,4,5,6,7].map(d=>'<div>Dag '+((week-1)*7+d)+'</div>').join("");
  const cells=[1,2,3,4,5,6,7].map(d=>progDayCel(week,d)).join("");
  // Verwijder-knop alleen als er meer dan 1 week is (een programma houdt minimaal 1 week).
  const del=(PROG.weeks||1)>1?'<button class="pe-wkdel" title="Week '+week+' verwijderen" onclick="progDeleteWeek('+week+')"><svg class="i"><use href="#i-trash"/></svg></button>':'';
  return '<div class="mlabel pe-wkbar" id="pe-week-'+week+'"><span>Week '+week+'</span><span style="margin-left:auto;font-size:11px;color:#9aa1ab;letter-spacing:.5px;text-transform:uppercase">Dag '+((week-1)*7+1)+'-'+(week*7)+'</span>'+del+'</div>'+
    '<div class="pe-hd7" style="grid-template-columns:'+cols+'">'+hd+'</div>'+
    '<div class="pe-row" style="grid-template-columns:'+cols+'">'+cells+'</div>';
}
// Week verwijderen: workouts van die week gaan mee weg, latere weken schuiven een week naar voren.
async function progDeleteWeek(week){
  const weeks=Math.max(1,PROG.weeks||1);
  if(weeks<=1){toast("Een programma heeft minimaal 1 week");return;}
  const wos=(PROG.workouts||[]).filter(w=>w.week===week);
  let vraag="Week "+week+" verwijderen?";
  if(wos.length)vraag+="\n\nDe "+(wos.length===1?"workout":wos.length+" workouts")+" in deze week "+(wos.length===1?"gaat":"gaan")+" mee weg.";
  if(week<weeks)vraag+=(wos.length?"\n":"\n\n")+"De weken erna schuiven een week naar voren.";
  if(!confirm(vraag))return;
  if(wos.length){
    const{error}=await db.from("program_workouts").delete().eq("program_id",PROG.id).eq("week",week);
    if(error){toast(error.message||"Week verwijderen mislukt");return;}
  }
  // Latere weken naar voren (per rij; programma's zijn klein).
  for(const w of (PROG.workouts||[]).filter(x=>x.week>week)){
    const{error}=await db.from("program_workouts").update({week:w.week-1}).eq("id",w.id);
    if(error){toast(error.message||"Week verschuiven mislukt");return;}
  }
  const{error:pe}=await db.from("program_templates").update({weeks:weeks-1}).eq("id",PROG.id);
  if(pe){toast(pe.message||"Week verwijderen mislukt");return;}
  PROG.weeks=weeks-1;if(progWeek>PROG.weeks)progWeek=PROG.weeks;
  progEditDay=null;progEditWid=null;
  const lp=(LIB.programs||[]).find(x=>x.id===PROG.id);if(lp)lp.weeks=PROG.weeks;
  await progReloadWorkouts();
  toast("Week "+week+" verwijderd");
}
// Dag-cel: lege dag = "+ Toevoegen" met dag-menu (Workout/Rustdag); bewerken = bouwer inline.
function progDayCel(week,day){
  const wos=(PROG.workouts||[]).filter(w=>w.week===week&&w.day===day).sort((a,b)=>a.sort-b.sort);
  const editing=progEditDay&&progEditDay.week===week&&progEditDay.day===day;
  if(editing){
    let inner=wos.filter(w=>w.id!==progEditWid).map(progCard).join("");
    const w=progEditWid?wos.find(x=>x.id===progEditWid):null;
    const wObj=w?{id:w.id,title:w.title,warmup:w.warmup,cooldown:w.cooldown,blocks:(w.program_blocks||[])}:{};
    inner+='<div class="ib2 pe-ib" onclick="event.stopPropagation()">'+progBuilderHtml(wObj)+'</div>';
    return '<div class="pe-cell">'+inner+'</div>';
  }
  return '<div class="pe-cell"><div class="addrow2"><button class="addnewbtn" onclick="event.stopPropagation();progDayMenu(event,'+week+','+day+')">+ Toevoegen</button></div>'+wos.map(progCard).join("")+'</div>';
}
// Dag-menu zoals in de klant-kalender.
function progDayMenu(ev,week,day){
  ev.stopPropagation();
  document.querySelectorAll(".daymenu").forEach(x=>x.remove());
  const cell=ev.target.closest(".pe-cell");if(!cell)return;
  const d=document.createElement("div");d.className="daymenu";
  d.innerHTML='<button onclick="event.stopPropagation();progOpenBuilder('+week+','+day+',null)"><svg class="i"><use href="#i-link"/></svg> Workout</button>'+
    '<button onclick="event.stopPropagation();progRustdag('+week+','+day+')"><svg class="i"><use href="#i-walk"/></svg> Rustdag</button>';
  cell.prepend(d);
}
async function progRustdag(week,day){
  document.querySelectorAll(".daymenu").forEach(x=>x.remove());
  const{error}=await db.from("program_workouts").insert({program_id:PROG.id,company_id:ME.profile.company_id,week,day,title:"Rest Day"});
  if(error){toast(error.message||"Mislukt");return;}
  await progReloadWorkouts();
}
// Workout-kaart in exact dezelfde stijl als in de klant-kalender (mcard/cblk + blokkleuren).
function progCard(w){
  const blocks=(w.program_blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  const isRest=!blocks.length&&/^rest ?day$/i.test((w.title||"").trim());
  if(isRest)return '<div class="mcard planned" onclick="event.stopPropagation();progOpenBuilder('+w.week+','+w.day+',\''+w.id+'\')"><div class="msc"><span style="color:#27b376">Rest Day</span></div></div>';
  let inner="";
  if(w.warmup)inner+='<div class="cblk k-grijs"><div class="n">Warmup</div><div class="pr">'+esc(w.warmup)+'</div></div>';
  blocks.forEach(b=>{const kleur=b.color?" k-"+esc(b.color):"";const lk=b.linked?" linked2":"";inner+='<div class="cblk'+kleur+lk+'"><div class="n">'+esc(b.label||"")+') '+esc(b.exercise||"")+'</div>'+(composePresc(b)?'<div class="pr">'+esc(composePresc(b))+'</div>':'')+'</div>';});
  if(w.cooldown)inner+='<div class="cblk k-grijs"><div class="n">Cooldown</div><div class="pr">'+esc(w.cooldown)+'</div></div>';
  return '<div class="mcard planned" onclick="event.stopPropagation();progOpenBuilder('+w.week+','+w.day+',\''+w.id+'\')"><div class="msc"><span class="wtitle">'+esc(w.title||"Workout")+'</span></div>'+inner+'</div>';
}
function progOpenBuilder(week,day,wid){document.querySelectorAll(".daymenu").forEach(x=>x.remove());progEditDay={week,day};progEditWid=wid||null;progRender();}
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
// Video's uit Strivee bij een template: klein afspeelbaar (thumbnail met
// play-knop; klik = YouTube-speler in de plaats van de tegel).
function tplMediaRender(media){
  const host=document.getElementById("tpl-media");if(!host)return;
  const vids=Array.isArray(media)?media.filter(m=>m&&m.youtube_id):[];
  if(!vids.length){host.innerHTML="";return;}
  host.innerHTML='<label style="font-weight:800;font-size:12.5px;color:#5b6470;display:block;margin:2px 0 8px">Video\'s ('+vids.length+')</label>'+
    '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">'+
    vids.map((v,i)=>'<div class="tplvid" data-yt="'+esc(v.youtube_id)+'" style="display:flex;align-items:center;gap:10px">'+
      '<div class="tplvid-thumb" onclick="tplVidSpeel(this)" style="position:relative;width:92px;height:56px;border-radius:8px;background:#000 url(\'https://i.ytimg.com/vi/'+esc(v.youtube_id)+'/mqdefault.jpg\') center/cover;cursor:pointer;flex:none">'+
        '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center"><svg width="11" height="11" viewBox="0 0 12 12" fill="#fff"><path d="M2 1l8 5-8 5z"/></svg></span></span></div>'+
      '<div class="sm" style="flex:1;line-height:1.35">'+esc(v.titel||"Video")+'</div></div>').join("")+
    '</div>';
}
function tplVidSpeel(el){
  const rij=el.closest(".tplvid");const yt=rij&&rij.getAttribute("data-yt");if(!yt)return;
  el.outerHTML='<div style="width:220px;flex:none;aspect-ratio:16/9;border-radius:8px;overflow:hidden"><iframe width="220" height="124" src="https://www.youtube.com/embed/'+esc(yt)+'?autoplay=1" title="Video" frameborder="0" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%"></iframe></div>';
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
  tplMediaRender(o&&o.media);
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
