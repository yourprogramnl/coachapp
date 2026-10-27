// app/demo-videos.js — demo-video's bij het programmeren, zoals in CoachRx
// (verzoek Stefan 27 okt 2026; verving het losse "Genereer media"-venster).
//
// Onder de warming-up, elk blok en de cooldown staat één rij chips:
//   - grijze chip  = gekoppelde video (klik = bekijken, ✕ = weghalen)
//   - blauw gestippelde chip "+ Glute Bridge" = voorstel, herkend in de tekst
//     (klik/+ = toevoegen, ✕ = niet voorstellen)
//   - "+ Zoek video" = zelf zoeken in de bibliotheek of een YouTube-link plakken
// De voorstellen verschijnen vanzelf tijdens het typen. Afkortingen (DB, KB,
// scap, T2B …) en meervouden worden herkend. Het systeem leert per bedrijf
// welke term bij welke video hoort (tabel media_aliassen): toevoegen +1,
// weghalen of niet voorstellen -1; bij score -2 of lager wordt die koppeling
// niet meer voorgesteld.
//
// Waar de video's leven (zelfde datamodel als eerst, de app leest het al):
//   - blok (.exrow): row.dataset.media (lijst) + row.dataset.oefid (gekoppelde
//     bibliotheek-oefening via de naam-zoeker; het camera-icoon speelt die af)
//   - warming-up/cooldown (#wm_warmup/#wm_cooldown): dataset.gmedia (lijst) +
//     dataset.oefid (oude enkele koppeling, wordt ook als chip getoond)

// Veelgebruikte afkortingen in programmeerteksten -> volledige woorden.
const GM_AFKO={db:"dumbbell",dbs:"dumbbell",kb:"kettlebell",kbs:"kettlebell swing",bb:"barbell",ohs:"overhead squat",hspu:"handstand push up",shspu:"strict handstand push up",t2b:"toes to bar",ttb:"toes to bar",c2b:"chest to bar",ctb:"chest to bar",du:"double under",dus:"double under",rdl:"romanian deadlift",mu:"muscle up",bmu:"bar muscle up",rmu:"ring muscle up",s2oh:"shoulder to overhead",g2oh:"ground to overhead",wb:"wall ball",wbs:"wall ball",bjo:"box jump over",bbjo:"burpee box jump over",bfb:"bar facing burpee",ghdsu:"ghd sit up",sa:"single arm",oh:"overhead",dl:"deadlift",fs:"front squat",bs:"back squat",sp:"strict press",pp:"push press",pj:"push jerk",sj:"split jerk",cnj:"clean and jerk",hc:"hang clean",pc:"power clean",ps:"power snatch",
  scap:"scapula",scaps:"scapula",scapular:"scapula",alt:"alternating",bw:"bodyweight",sl:"single leg",dbl:"double",ohp:"overhead press",sdhp:"sumo deadlift high pull",ghr:"glute ham raise",rfess:"rear foot elevated split squat",bss:"bulgarian split squat",tgu:"turkish get up",hrpu:"hand release push up",k2e:"knees to elbow",kte:"knees to elbow",bj:"box jump",mb:"medicine ball",medball:"medicine ball",fr:"front rack",ext:"extension",hs:"handstand",hsw:"handstand walk",wtd:"weighted",pullup:"pull up",pullups:"pull up",pushup:"push up",pushups:"push up",situp:"sit up",situps:"sit up",chinup:"chin up",chinups:"chin up",stepup:"step up",stepups:"step up"};

// Normaliseren: kleine letters, leestekens weg, afkortingen uitschrijven,
// meervoud eraf (squats -> squat, lunges -> lunge, crunches -> crunch, ups -> up).
// Wordt op bibliotheeknamen én op de getypte tekst toegepast, zodat
// "Scap pull-ups" en "Scapula Pull-Up" elkaar vinden (ook via de compacte
// vorm zonder spaties, zodat "pullovers" en "pull overs" samenvallen).
function gmNorm(s){
  s=(s||"").toLowerCase().replace(/['’]/g,"").replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
  s=s.split(" ").map(w=>GM_AFKO[w]||w).join(" ");
  s=s.split(" ").map(w=>{
    if(/(ches|shes|xes)$/.test(w)&&w.length>4)return w.slice(0,-2);
    if(w.length>=3&&w.endsWith("s")&&!w.endsWith("ss"))return w.slice(0,-1);
    return w;
  }).join(" ");
  return s.replace(/\s+/g," ").trim();
}
const gmCompact=s=>gmNorm(s).replace(/ /g,"");

let GM={index:null,indexVan:-1,aliassen:null,klaarPromise:null};

// Zoekindex over de bibliotheek: alleen oefeningen met een afspeelbare
// YouTube-video (de chips spelen youtube_id af). Eigen video's eerst, zodat
// bij dubbele namen de eigen opname wint.
function gmBouwIndex(){
  const oef=LIB.oef||[];
  if(GM.index&&GM.indexVan===oef.length)return;
  GM.index=oef.filter(o=>o.youtube_id).map(o=>({o,norm:gmNorm(o.naam),compact:gmCompact(o.naam)})).filter(x=>x.norm.length>=4);
  GM.indexVan=oef.length;
}
async function gmLaadAliassen(){
  if(GM.aliassen)return;
  try{
    const{data}=await db.from("media_aliassen").select("term,oefening_id,score").eq("company_id",ME.profile.company_id);
    GM.aliassen=data||[];
  }catch(e){GM.aliassen=[];}
}
// Bibliotheek + geleerde koppelingen klaarzetten (één keer; de bibliotheek
// laadt op de achtergrond, de chips vullen zich zodra hij er is).
function vsKlaar(){
  if(!GM.klaarPromise){
    GM.klaarPromise=(async()=>{
      try{if(!LIB.geladen)await libLaad();}catch(e){}
      await gmLaadAliassen();
      gmBouwIndex();
    })();
  }
  return GM.klaarPromise;
}

// Eén regel tekst -> herkende oefeningen. Geleerde aliassen (score>0) gaan
// vóór de gewone naam-matches; onderdrukte paren (score<=-2) doen niet mee.
// voorkeur = oefening-id's die al gekoppeld zijn: bij dubbele bibliotheeknamen
// wint die rij, zodat er geen tweede chip voor dezelfde oefening komt.
function gmHerkenRegel(regel,voorkeur){
  const norm=" "+gmNorm(regel)+" ",compact=gmCompact(regel);
  if(gmNorm(regel).length<4)return[];
  const weg=new Set((GM.aliassen||[]).filter(a=>a.score<=-2).map(a=>a.term+"|"+a.oefening_id));
  const hits=[];
  (GM.aliassen||[]).filter(a=>a.score>0).forEach(a=>{
    const t=" "+a.term+" ";
    if(norm.includes(t)||(a.term.replace(/ /g,"").length>=8&&compact.includes(a.term.replace(/ /g,"")))){
      const ent=GM.index.find(x=>x.o.id===a.oefening_id);
      if(ent)hits.push({o:ent.o,norm:ent.norm,term:a.term,geleerd:true,len:a.term.length});
    }
  });
  GM.index.forEach(x=>{
    if(weg.has(x.norm+"|"+x.o.id))return;
    if(norm.includes(" "+x.norm+" ")||(x.compact.length>=8&&compact.includes(x.compact))){
      hits.push({o:x.o,norm:x.norm,term:x.norm,geleerd:false,len:x.norm.length});
    }
  });
  const vk=id=>(voorkeur&&voorkeur.has(String(id)))?1:0;
  // Geleerd eerst, dan langste naam; bij gelijke naam: al gekoppeld > eigen video > laagste id.
  hits.sort((a,b)=>(b.geleerd-a.geleerd)||(b.len-a.len)||(vk(b.o.id)-vk(a.o.id))||((b.o.bron==="eigen")-(a.o.bron==="eigen"))||(a.o.id-b.o.id));
  const uit=[],termen=new Set();
  hits.forEach(h=>{
    if(uit.some(u=>u.o.id===h.o.id))return;
    if(!h.geleerd&&termen.has(h.term))return; // zelfde naam nog een keer in de bibliotheek
    // Kortere namen die in een langere gevonden naam zitten vervallen ("squat" naast "overhead squat").
    if(!h.geleerd&&uit.some(u=>u.o.id!==h.o.id&&u.len>h.len&&(" "+u.norm+" ").includes(" "+h.term+" ")))return;
    uit.push(h);termen.add(h.term);
  });
  return uit;
}
// Een sectie (meerdere regels) -> voorstellen, per oefening één.
function gmHerkenTekst(tekst,voorkeur){
  const voorstellen=[],gezien=new Set();
  (tekst||"").split(/\n/).map(r=>r.trim()).filter(Boolean).forEach(regel=>{
    gmHerkenRegel(regel,voorkeur).forEach(h=>{
      if(gezien.has(h.o.id))return;
      gezien.add(h.o.id);
      voorstellen.push({oefId:h.o.id,naam:h.o.naam,yt:h.o.youtube_id,term:h.term,geleerd:h.geleerd});
    });
  });
  return voorstellen;
}

// Leren: score bijwerken in media_aliassen (per bedrijf), ook meteen in het
// geheugen zodat de chips direct meebewegen. Stil op de achtergrond; een
// mislukte schrijfactie is geen ramp (alleen het leereffect valt dan weg).
async function gmLeer(term,oefId,delta){
  if(!term||term.length<3||!oefId)return;
  const lok=(GM.aliassen||[]).find(a=>a.term===term&&a.oefening_id===oefId);
  if(lok)lok.score+=delta;else if(GM.aliassen)GM.aliassen.push({term,oefening_id:oefId,score:delta});
  try{
    const{data}=await db.from("media_aliassen").select("id,score").eq("company_id",ME.profile.company_id).eq("term",term).eq("oefening_id",oefId).limit(1);
    const rij=(data||[])[0];
    if(rij)await db.from("media_aliassen").update({score:rij.score+delta,updated_at:new Date().toISOString()}).eq("id",rij.id);
    else await db.from("media_aliassen").insert({company_id:ME.profile.company_id,term,oefening_id:oefId,score:delta});
  }catch(e){}
}

// ---------- De chips ----------
function vsHost(el){return el.closest(".exrow")||el.closest(".cwmedia");}
function vsIsRow(host){return host.classList.contains("exrow");}
function vsMediaLees(host){
  let m=[];try{const raw=vsIsRow(host)?host.dataset.media:host.dataset.gmedia;m=raw?JSON.parse(raw):[];}catch(e){m=[];}
  return (m||[]).filter(x=>x&&x.youtube_id);
}
function vsMediaZet(host,media){
  const raw=media&&media.length?JSON.stringify(media):"";
  if(vsIsRow(host))host.dataset.media=raw;else host.dataset.gmedia=raw;
}
// De tekst waarin we oefeningen herkennen: bloknaam + voorschrift/omschrijving,
// of het warming-up/cooldown-vak.
function vsTekst(host){
  if(vsIsRow(host)){
    return [".exn",".f-presc",".f-desc"].map(s=>{const el=host.querySelector(s);return el?el.value:"";}).join("\n");
  }
  const ta=document.getElementById("w_"+host.id.replace("wm_",""));return ta?ta.value:"";
}
// De via de naam-zoeker gekoppelde bibliotheek-oefening (data-oefid) als chip.
function vsOefChip(host){
  const id=host.dataset.oefid;if(!id)return null;
  const o=(LIB.oef||[]).find(x=>String(x.id)===String(id));
  if(o)return{oefening_id:o.id,youtube_id:o.youtube_id||"",titel:o.naam};
  const n=host.querySelector(".exn");return{oefening_id:parseInt(id,10),youtube_id:"",titel:(n&&n.value)||"Demo-video"};
}
function vsVuil(){if(typeof bouwerDirty!=="undefined")bouwerDirty=true;}

function vsChipHtml(m,i){
  const speel=m.youtube_id?'onclick="event.stopPropagation();ytSpeel(\''+esc(m.youtube_id)+'\')"':'';
  return '<span class="vschip"><span class="vs-naam" title="Bekijk video" '+speel+'>🎥 '+esc(m.titel||"Video")+'</span><span class="x" title="Video weghalen" onclick="event.stopPropagation();vsWeg(this,'+i+')">✕</span></span>';
}
function vsVoorstelHtml(v){
  return '<span class="vschip voorstel" data-oef="'+v.oefId+'" data-yt="'+esc(v.yt)+'" data-term="'+esc(v.term)+'" data-naam="'+esc(v.naam)+'">'+
    '<span class="vs-naam" title="Toevoegen" onclick="event.stopPropagation();vsNeem(this)">+ '+esc(v.naam)+'</span>'+
    '<span class="vs-kijk" title="Eerst bekijken" onclick="event.stopPropagation();ytSpeel(\''+esc(v.yt)+'\')">▶</span>'+
    '<span class="x" title="Niet voorstellen" onclick="event.stopPropagation();vsWijs(this)">✕</span></span>';
}
// De chip-rij van één sectie (opnieuw) tekenen: gekoppelde video's, dan de
// voorstellen uit de tekst (max 8), dan "+ Zoek video" en "Alles wissen".
function vsRender(host){
  const vak=host.querySelector(".vschips");if(!vak)return;
  if(GM.index&&LIB.geladen)gmBouwIndex(); // bibliotheek intussen gegroeid? dan de index verversen (goedkoop als er niets veranderde)
  const media=vsMediaLees(host),vast=vsOefChip(host);
  const weg=new Set((host.dataset.vsweg||"").split(",").filter(Boolean));
  const alYt=new Set(media.map(m=>String(m.youtube_id)));
  const alOef=new Set(media.filter(m=>m.oefening_id).map(m=>String(m.oefening_id)));
  if(vast){alOef.add(String(vast.oefening_id));if(vast.youtube_id)alYt.add(String(vast.youtube_id));}
  let voorstellen=[];
  if(GM.index){
    voorstellen=gmHerkenTekst(vsTekst(host),alOef).filter(v=>!alYt.has(String(v.yt))&&!alOef.has(String(v.oefId))&&!weg.has(String(v.oefId))).slice(0,8);
  }
  const chips=[];
  if(vast)chips.push(vsChipHtml(vast,-1));
  media.forEach((m,i)=>chips.push(vsChipHtml(m,i)));
  voorstellen.forEach(v=>chips.push(vsVoorstelHtml(v)));
  const n=media.length+(vast?1:0);
  vak.innerHTML='<span class="vs-lbl">Demo-video\'s</span>'+chips.join("")+
    '<span class="vschip zoek" title="Zoek in de bibliotheek of plak een YouTube-link" onclick="event.stopPropagation();vsKiesToon(this)">+ Zoek video</span>'+
    (n>1?'<span class="vs-wis" title="Alle video\'s van dit onderdeel weghalen" onclick="event.stopPropagation();vsAllesWeg(this)">Alles wissen</span>':'');
  vak.dataset.klaar="1";
  const cam=host.querySelector(".cam");if(cam)cam.classList.toggle("has-video",n>0);
}
// Video weghalen: i=-1 is de gekoppelde oefening (camera-icoon), anders de
// i-de uit de lijst. Weghalen van een herkende video = die koppeling -1.
function vsWeg(el,i){
  const host=vsHost(el);if(!host)return;
  if(i<0){host.dataset.oefid="";const vid=host.querySelector(".vidpop");if(vid)vid.classList.remove("show");}
  else{
    const media=vsMediaLees(host),w=media[i];
    media.splice(i,1);vsMediaZet(host,media);
    if(w&&w.term&&w.oefening_id)gmLeer(w.term,w.oefening_id,-1);
  }
  vsVuil();vsRender(host);
}
// Voorstel aannemen: in de lijst zetten (gaat mee voor het lid) en leren.
function vsNeem(el){
  const chip=el.closest(".vschip"),host=vsHost(el);if(!chip||!host)return;
  const media=vsMediaLees(host),yt=chip.dataset.yt,oef=parseInt(chip.dataset.oef,10);
  if(!media.some(m=>m.youtube_id===yt))media.push({youtube_id:yt,titel:chip.dataset.naam,oefening_id:oef,term:chip.dataset.term});
  vsMediaZet(host,media);
  gmLeer(chip.dataset.term,oef,1);
  vsVuil();vsRender(host);
}
// Voorstel afwijzen: in deze bouwer niet meer tonen, en de koppeling -1
// (bij -2 wordt hij voor dit bedrijf niet meer voorgesteld).
function vsWijs(el){
  const chip=el.closest(".vschip"),host=vsHost(el);if(!chip||!host)return;
  host.dataset.vsweg=((host.dataset.vsweg||"")+","+chip.dataset.oef).replace(/^,/,"");
  gmLeer(chip.dataset.term,parseInt(chip.dataset.oef,10),-1);
  vsRender(host);
}
function vsAllesWeg(el){
  const host=vsHost(el);if(!host)return;
  vsMediaLees(host).forEach(w=>{if(w.term&&w.oefening_id)gmLeer(w.term,w.oefening_id,-1);});
  host.dataset.oefid="";vsMediaZet(host,[]);
  vsVuil();vsRender(host);
  toast("Alle demo-video's van dit onderdeel weggehaald");
}

// ---------- "+ Zoek video": bibliotheek doorzoeken of een YouTube-link plakken ----------
// Hetzelfde venstertje (.vidpop) voor blokken én warming-up/cooldown.
function vsKiesToon(el){
  const host=vsHost(el);if(!host)return;
  const vid=host.querySelector(".vidpop");if(!vid)return;
  if(!LIB.geladen)libLaad();
  vid.innerHTML='<span class="vp-x" onclick="event.stopPropagation();this.closest(\'.vidpop\').classList.remove(\'show\')">✕</span>'+
    '<div class="vt">Demo-video toevoegen</div>'+
    '<input class="vzk" placeholder="Zoek een oefening of plak een YouTube-link…" oninput="vsKiesZoek(this)" onclick="event.stopPropagation()" onkeydown="vsKiesKey(event,this)" autocomplete="off">'+
    '<div class="vzk-lijst"></div>'+
    '<div class="vp-cap" style="margin-top:8px">Meerdere video\'s kan; ze gaan mee voor het lid.</div>';
  vid.classList.add("show");
  const inp=vid.querySelector(".vzk");
  if(vsIsRow(host)&&host.dataset.kind==="exercise"&&!host.dataset.oefid)inp.value=host.querySelector(".exn").value||""; // bloknaam voorvullen geeft vaak meteen treffers
  vsKiesZoek(inp);
  inp.focus();inp.select();
}
function vsKiesKey(ev,inp){
  if(ev.key==="Escape"){ev.stopPropagation();inp.closest(".vidpop").classList.remove("show");return;}
  if(ev.key!=="Enter")return;
  ev.preventDefault();
  const id=ytIdVan(inp.value.trim());
  if(id){vsKiesLink(inp,id);return;}
  const eerste=inp.closest(".vidpop").querySelector(".vzk-rij");if(eerste)eerste.click();
}
function vsKiesZoek(inp){
  const vid=inp.closest(".vidpop"),lijst=vid.querySelector(".vzk-lijst");if(!lijst)return;
  const raw=inp.value.trim(),v=raw.toLowerCase();
  const yt=ytIdVan(raw);
  if(yt){
    lijst.innerHTML='<div class="vzk-rij" onclick="event.stopPropagation();vsKiesLink(this,\''+esc(yt)+'\')"><img src="https://i.ytimg.com/vi/'+esc(yt)+'/default.jpg" alt="">Deze YouTube-link toevoegen</div>';
    return;
  }
  if(!LIB.geladen){
    lijst.innerHTML='<div class="sm muted" style="padding:6px 2px">Bibliotheek laden…</div>';
    libLaad().then(()=>{if(document.contains(inp))vsKiesZoek(inp);});
    return;
  }
  if(v.length<2){lijst.innerHTML='<div class="sm muted" style="padding:6px 2px">Typ minstens twee letters, of plak een YouTube-link.</div>';return;}
  const zoek=q=>LIB.oef.filter(o=>o.youtube_id&&((o.naam||"").toLowerCase().includes(q)||(o.tags||[]).join(" ").toLowerCase().includes(q)));
  // Volledige bloknamen ("Rope Climb Technique programma") staan zelden zo in
  // de bibliotheek; dan zoeken we korter (woorden van achteren weghalen, daarna
  // per los woord) en zeggen dat erbij, zodat de kiezer nooit leeg lijkt.
  let hits=zoek(v),gebruikt=v;
  if(!hits.length){
    const w=v.split(" ").filter(x=>x.length>=3);
    for(let n=w.length-1;n>=1&&!hits.length;n--){gebruikt=w.slice(0,n).join(" ");hits=zoek(gebruikt);}
    for(let i=0;i<w.length&&!hits.length;i++){gebruikt=w[i];hits=zoek(gebruikt);}
  }
  const kop=hits.length&&gebruikt!==v?'<div class="sm muted" style="padding:4px 2px">Geen exacte treffer voor "'+esc(v)+'"; dit lijkt erop ("'+esc(gebruikt)+'"):</div>':'';
  lijst.innerHTML=kop+(hits.length?hits.slice(0,40).map(o=>'<div class="vzk-rij" onclick="event.stopPropagation();vsKiesKies(this,'+o.id+')"><img src="https://i.ytimg.com/vi/'+esc(o.youtube_id)+'/default.jpg" alt="">'+esc(o.naam)+'</div>').join("")
    :'<div class="sm muted" style="padding:6px 2px">Niets gevonden met een demo-video. Probeer een korter woord (bijv. "rope"), of plak een YouTube-link.</div>');
}
function vsVoegToe(host,m){
  const media=vsMediaLees(host);
  if(media.some(x=>x.youtube_id===m.youtube_id)||(host.dataset.oefid&&vsOefChip(host).youtube_id===m.youtube_id)){toast("Deze video staat er al bij");return false;}
  media.push(m);vsMediaZet(host,media);
  vsVuil();vsRender(host);
  const vid=host.querySelector(".vidpop");if(vid)vid.classList.remove("show");
  toast("Demo-video toegevoegd, gaat mee voor het lid");
  return true;
}
function vsKiesKies(el,oefId){
  const host=vsHost(el),o=(LIB.oef||[]).find(x=>x.id===oefId);
  if(!host||!o||!o.youtube_id)return;
  vsVoegToe(host,{youtube_id:o.youtube_id,titel:o.naam,oefening_id:o.id});
}
function vsKiesLink(el,yt){
  const host=vsHost(el);if(!host)return;
  vsVoegToe(host,{youtube_id:yt,titel:"Eigen video"});
}

// ---------- Warming-up/cooldown: lees/schrijf-hulpjes die de rest van de app gebruikt ----------
// (opslaan, kopiëren/plakken, template invoegen). De lijst leeft in dataset.gmedia.
function gmStripLees(kind){
  const box=document.getElementById("wm_"+kind);if(!box)return null;
  const media=vsMediaLees(box);return media.length?media:null;
}
function gmStripZet(kind,media){
  const box=document.getElementById("wm_"+kind);if(!box)return;
  vsMediaZet(box,(media||[]).filter(m=>m&&m.youtube_id));
  vsRender(box);
}
function gmStripVoegToe(kind,nieuwe){
  const huidig=gmStripLees(kind)||[];
  (nieuwe||[]).forEach(m=>{if(m&&m.youtube_id&&!huidig.some(x=>x.youtube_id===m.youtube_id))huidig.push(m);});
  gmStripZet(kind,huidig);
}

// ---------- Vanzelf meebewegen ----------
// Typen in een vak: de voorstellen van dat onderdeel na een korte pauze verversen.
document.addEventListener("input",e=>{
  const t=e.target;if(!t||!t.matches)return;
  if(!t.matches("#w_warmup,#w_cooldown,.exrow .exn,.exrow .f-presc,.exrow .f-desc"))return;
  const host=t.matches("#w_warmup,#w_cooldown")?document.getElementById("wm_"+t.id.slice(2)):t.closest(".exrow");
  if(!host||!host.querySelector(".vschips"))return;
  clearTimeout(host._vsT);host._vsT=setTimeout(()=>{if(document.contains(host))vsRender(host);},350);
});
// Nieuwe chip-rijen (bouwer geopend, blok toegevoegd, geplakt, gedupliceerd):
// meteen de gekoppelde video's tonen en, zodra de bibliotheek er is, de voorstellen.
new MutationObserver(()=>{
  const nieuw=document.querySelectorAll(".vschips:not([data-klaar])");
  if(!nieuw.length)return;
  const hosts=[...nieuw].map(v=>vsHost(v)).filter(Boolean);
  hosts.forEach(h=>vsRender(h));
  if(!GM.index)vsKlaar().then(()=>hosts.forEach(h=>{if(document.contains(h))vsRender(h);}));
}).observe(document.body,{childList:true,subtree:true});
