// app/genereer-media.js — "Genereer media" in de bouwer (verzoek Stefan 22 juli):
// herkent oefeningen in de warming-up-, cooldown- en conditioning-teksten en
// stelt demo-video's uit de bibliotheek voor. De coach vinkt aan wat hij wil,
// kan per voorstel wisselen naar een andere video en onbekende regels zelf
// koppelen. Het systeem leert per bedrijf welke term bij welke video hoort
// (tabel media_aliassen): accepteren/koppelen verhoogt de score, weghalen
// verlaagt hem; bij score -2 of lager wordt die koppeling niet meer voorgesteld.

// Veelgebruikte afkortingen in programmeerteksten -> volledige woorden.
const GM_AFKO={db:"dumbbell",kb:"kettlebell",bb:"barbell",ohs:"overhead squat",hspu:"handstand push up",shspu:"strict handstand push up",t2b:"toes to bar",ttb:"toes to bar",c2b:"chest to bar",du:"double under",rdl:"romanian deadlift",mu:"muscle up",bmu:"bar muscle up",rmu:"ring muscle up",s2oh:"shoulder to overhead",g2oh:"ground to overhead",wb:"wall ball",bjo:"box jump over",bbjo:"burpee box jump over",bfb:"bar facing burpee",ghdsu:"ghd sit up",sa:"single arm",oh:"overhead",kbs:"kettlebell swing",dl:"deadlift",fs:"front squat",bs:"back squat",sp:"strict press",pp:"push press",pj:"push jerk",sj:"split jerk",cnj:"clean and jerk",hc:"hang clean",pc:"power clean",ps:"power snatch"};

// Normaliseren: kleine letters, leestekens weg, afkortingen uitschrijven,
// simpel meervoud eraf (squats -> squat). Wordt op bibliotheeknamen én op
// de getypte tekst toegepast, zodat "DB pull overs" en "Dumbbell Pullovers"
// elkaar vinden (ook via de compacte vorm zonder spaties).
function gmNorm(s){
  s=(s||"").toLowerCase().replace(/['’]/g,"").replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
  s=s.split(" ").map(w=>GM_AFKO[w]||w).join(" ");
  s=s.split(" ").map(w=>w.length>3&&w.endsWith("s")&&!w.endsWith("ss")?w.slice(0,-1):w).join(" ");
  return s.replace(/\s+/g," ").trim();
}
const gmCompact=s=>gmNorm(s).replace(/ /g,"");

let GM={index:null,aliassen:null,voorstel:null};

// Zoekindex over de bibliotheek: alleen oefeningen met een afspeelbare
// YouTube-video (de media-tegels spelen youtube_id af).
function gmBouwIndex(){
  GM.index=(LIB.oef||[]).filter(o=>o.youtube_id).map(o=>({o,norm:gmNorm(o.naam),compact:gmCompact(o.naam)})).filter(x=>x.norm.length>=4);
}
async function gmLaadAliassen(){
  if(GM.aliassen)return;
  const{data}=await db.from("media_aliassen").select("term,oefening_id,score").eq("company_id",ME.profile.company_id);
  GM.aliassen=data||[];
}

// Eén regel tekst -> herkende oefeningen. Geleerde aliassen (score>0) gaan
// vóór de gewone naam-matches; onderdrukte paren (score<=-2) doen niet mee.
function gmHerkenRegel(regel){
  const norm=" "+gmNorm(regel)+" ",compact=gmCompact(regel);
  if(gmNorm(regel).length<4)return[];
  const weg=new Set((GM.aliassen||[]).filter(a=>a.score<=-2).map(a=>a.term+"|"+a.oefening_id));
  const hits=[];
  (GM.aliassen||[]).filter(a=>a.score>0).forEach(a=>{
    const t=" "+a.term+" ";
    if(norm.includes(t)||(a.term.replace(/ /g,"").length>=8&&compact.includes(a.term.replace(/ /g,"")))){
      const ent=GM.index.find(x=>x.o.id===a.oefening_id);
      if(ent)hits.push({o:ent.o,term:a.term,geleerd:true,len:a.term.length});
    }
  });
  GM.index.forEach(x=>{
    if(weg.has(x.norm+"|"+x.o.id))return;
    if(norm.includes(" "+x.norm+" ")||(x.compact.length>=8&&compact.includes(x.compact))){
      hits.push({o:x.o,term:x.norm,geleerd:false,len:x.norm.length});
    }
  });
  // Langste eerst; kortere namen die in een langere gevonden naam zitten
  // vervallen ("squat" naast "overhead squat"), en per oefening één hit.
  hits.sort((a,b)=>(b.geleerd-a.geleerd)||(b.len-a.len));
  const uit=[];
  hits.forEach(h=>{
    if(uit.some(u=>u.o.id===h.o.id))return;
    if(!h.geleerd&&uit.some(u=>(" "+gmNorm(u.o.naam)+" ").includes(" "+h.term+" ")&&u.o.id!==h.o.id&&u.len>h.len))return;
    uit.push(h);
  });
  return uit;
}

// Een sectie (meerdere regels) -> {voorstellen, onbekend}.
function gmHerkenTekst(tekst){
  const voorstellen=[],onbekend=[],gezien=new Set();
  (tekst||"").split(/\n/).map(r=>r.trim()).filter(Boolean).forEach(regel=>{
    const hits=gmHerkenRegel(regel);
    if(!hits.length){
      // Structuurregels ("2-3 sets:", "rust 1 min") zijn geen kandidaten om te koppelen.
      const kaal=gmNorm(regel).replace(/\b\d+\b/g,"").trim();
      if(kaal.length>=6&&!/^(set|ronde|round|rep|rust|rest|min|minute|sec|second|elke|every|dan|then|and)( |$)/.test(kaal))onbekend.push(regel);
      return;
    }
    hits.forEach(h=>{
      if(gezien.has(h.o.id))return;
      gezien.add(h.o.id);
      voorstellen.push({oefId:h.o.id,naam:h.o.naam,yt:h.o.youtube_id,term:h.term,geleerd:h.geleerd,regel,aan:true});
    });
  });
  return{voorstellen,onbekend};
}

// ---------- Venster ----------
function ensureGmModal(){
  if(document.getElementById("gmmodal"))return;
  const d=document.createElement("div");
  d.innerHTML='<div class="lmodal" id="gmmodal" style="z-index:410"><div class="box" style="width:560px;max-width:94vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><h3 style="margin:0">Genereer media</h3><span onclick="gmDicht()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div class="sm muted" style="margin-bottom:10px">Herkende oefeningen in je tekst. Vink uit wat je niet wilt, wissel een video, of koppel onbekende regels zelf. Het systeem onthoudt je keuzes.</div>'+
    '<div id="gm-lijst" style="max-height:56vh;overflow:auto"></div>'+
    '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn" onclick="gmToepassen()">Video\'s toevoegen</button><button class="btn ghost" onclick="gmDicht()">Annuleren</button></div>'+
    '</div></div>';
  document.body.appendChild(d.firstChild);
}
function gmDicht(){const m=document.getElementById("gmmodal");if(m)m.classList.remove("show");GM.voorstel=null;}

// Verzamelt de secties uit de open bouwer (klant- of blog-kalender).
function gmSecties(){
  const g=id=>{const el=document.getElementById(id);return el?el.value:"";};
  const secties=[];
  if(g("w_warmup").trim())secties.push({key:"warmup",label:"Warming-up",tekst:g("w_warmup")});
  document.querySelectorAll("#exrows .exrow").forEach((r,i)=>{
    if(r.dataset.kind!=="conditioning")return;
    const naam=(r.querySelector(".exn").value||"").trim(),notes=(r.querySelector(".f-desc").value||"").trim();
    if(!notes&&!naam)return;
    r.dataset.gmidx=String(i);
    secties.push({key:"blok:"+i,label:(r.querySelector(".lbl-badge").textContent||"")+") "+(naam||"Conditioning"),tekst:naam+"\n"+notes,rowIdx:i});
  });
  if(g("w_cooldown").trim())secties.push({key:"cooldown",label:"Cooldown",tekst:g("w_cooldown")});
  return secties;
}

async function gmOpen(){
  ensureGmModal();
  if(!LIB.geladen){toast("Bibliotheek laden…");await libLaad();}
  await gmLaadAliassen();
  gmBouwIndex();
  const secties=gmSecties();
  if(!secties.length){toast("Typ eerst een warming-up, conditioning of cooldown");return;}
  GM.voorstel=secties.map(s=>Object.assign({},s,gmHerkenTekst(s.tekst)));
  gmRender();
  document.getElementById("gmmodal").classList.add("show");
}

function gmThumb(yt){return '<div onclick="event.stopPropagation();ytSpeel(\''+esc(yt)+'\')" title="Bekijk video" style="position:relative;width:64px;height:40px;border-radius:6px;background:#000 url(\'https://i.ytimg.com/vi/'+esc(yt)+'/mqdefault.jpg\') center/cover;cursor:pointer;flex:none"><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center"><svg width="7" height="7" viewBox="0 0 12 12" fill="#fff"><path d="M2 1l8 5-8 5z"/></svg></span></span></div>';}

function gmRender(){
  const host=document.getElementById("gm-lijst");if(!host||!GM.voorstel)return;
  let n=0;
  host.innerHTML=GM.voorstel.map((sec,si)=>{
    const rijen=sec.voorstellen.map((v,vi)=>{
      n++;
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid #f0f1f3">'+
        '<input type="checkbox"'+(v.aan?' checked':'')+' onchange="gmVink('+si+','+vi+',this.checked)" style="accent-color:#3eb3e0;width:15px;height:15px;flex:none;cursor:pointer">'+
        gmThumb(v.yt)+
        '<div style="flex:1;min-width:0"><b style="font-size:12.5px">'+esc(v.naam)+'</b>'+(v.geleerd?' <span class="cpill teal" style="font-size:10px;text-transform:none">geleerd</span>':'')+
        '<div class="sm muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">uit: “'+esc(v.regel)+'”</div></div>'+
        '<button class="btn ghost sm2" style="flex:none" onclick="gmWissel('+si+','+vi+',this)">Wissel</button>'+
        '</div><div id="gm-wissel-'+si+'-'+vi+'"></div>';
    }).join("");
    const onb=sec.onbekend.map((regel,oi)=>
      '<div style="display:flex;align-items:center;gap:10px;padding:6px 2px;border-bottom:1px solid #f0f1f3">'+
      '<span style="width:15px;flex:none"></span>'+
      '<div style="flex:1;min-width:0" class="sm muted">Niet herkend: “'+esc(regel)+'”</div>'+
      '<button class="btn ghost sm2" style="flex:none" onclick="gmKoppel('+si+','+oi+',this)">Koppel video</button>'+
      '</div><div id="gm-koppel-'+si+'-'+oi+'"></div>').join("");
    if(!rijen&&!onb)return"";
    return '<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#8a919c;margin-bottom:2px">'+esc(sec.label)+'</div>'+(rijen||'<div class="sm muted" style="padding:4px 2px">Geen oefeningen herkend.</div>')+onb+'</div>';
  }).join("")||'<div class="cempty">Niets herkend in de tekst.</div>';
}
function gmVink(si,vi,aan){GM.voorstel[si].voorstellen[vi].aan=aan;}

// Kleine zoeklijst onder een rij: andere video kiezen (wissel) of een
// onbekende regel koppelen. Kiezen = ook meteen leren.
function gmZoekHtml(cb){
  return '<div style="padding:6px 0 10px 25px"><input class="lid-in" placeholder="Zoek een oefening…" style="width:100%;max-width:320px" oninput="gmZoekIn(this,\''+cb+'\')" autocomplete="off"><div class="gm-zres"></div></div>';
}
function gmZoekIn(inp,cb){
  const host=inp.parentNode.querySelector(".gm-zres");
  const v=inp.value.trim().toLowerCase();
  if(v.length<2){host.innerHTML="";return;}
  const hits=(LIB.oef||[]).filter(o=>o.youtube_id&&((o.naam||"").toLowerCase().includes(v)||(o.tags||[]).join(" ").toLowerCase().includes(v))).slice(0,8);
  host.innerHTML=hits.map(o=>'<div class="exopt" style="display:flex;align-items:center;gap:8px;padding:5px 4px;cursor:pointer" onclick="'+cb+'('+o.id+')"><b style="font-size:12px">'+esc(o.naam)+'</b><span class="sm muted" style="font-size:11px">'+esc((o.tags||[]).slice(0,2).join(" · "))+'</span></div>').join("")||'<div class="sm muted" style="padding:4px">Niets gevonden.</div>';
}
let gmWisselDoel=null;
function gmWissel(si,vi,btn){
  const vak=document.getElementById("gm-wissel-"+si+"-"+vi);
  if(vak.innerHTML){vak.innerHTML="";return;}
  gmWisselDoel=[si,vi];
  vak.innerHTML=gmZoekHtml("gmWisselKies");
  vak.querySelector("input").focus();
}
function gmWisselKies(oefId){
  const o=(LIB.oef||[]).find(x=>x.id===oefId);if(!o||!gmWisselDoel)return;
  const[si,vi]=gmWisselDoel;
  const v=GM.voorstel[si].voorstellen[vi];
  // Wisselen is expliciet leren: de oude koppeling omlaag, de nieuwe stevig omhoog.
  gmLeer(v.term,v.oefId,-1);
  v.oefId=o.id;v.naam=o.naam;v.yt=o.youtube_id;v.aan=true;v.gewisseld=true;
  gmRender();
}
let gmKoppelDoel=null;
function gmKoppel(si,oi,btn){
  const vak=document.getElementById("gm-koppel-"+si+"-"+oi);
  if(vak.innerHTML){vak.innerHTML="";return;}
  gmKoppelDoel=[si,oi];
  vak.innerHTML=gmZoekHtml("gmKoppelKies");
  vak.querySelector("input").focus();
}
function gmKoppelKies(oefId){
  const o=(LIB.oef||[]).find(x=>x.id===oefId);if(!o||!gmKoppelDoel)return;
  const[si,oi]=gmKoppelDoel;
  const sec=GM.voorstel[si],regel=sec.onbekend[oi];
  const term=gmNorm(regel).replace(/\b\d+\b/g,"").replace(/\s+/g," ").trim();
  sec.onbekend.splice(oi,1);
  sec.voorstellen.push({oefId:o.id,naam:o.naam,yt:o.youtube_id,term,geleerd:false,gekoppeld:true,regel,aan:true});
  gmRender();
}

// Leren: score bijwerken in media_aliassen (per bedrijf). Stil op de
// achtergrond; mislukte schrijfacties zijn geen ramp (alleen leereffect weg).
async function gmLeer(term,oefId,delta){
  if(!term||term.length<3||!oefId)return;
  try{
    const{data}=await db.from("media_aliassen").select("id,score").eq("company_id",ME.profile.company_id).eq("term",term).eq("oefening_id",oefId).limit(1);
    const rij=(data||[])[0];
    if(rij)await db.from("media_aliassen").update({score:rij.score+delta,updated_at:new Date().toISOString()}).eq("id",rij.id);
    else await db.from("media_aliassen").insert({company_id:ME.profile.company_id,term,oefening_id:oefId,score:delta});
    GM.aliassen=null; // volgende keer vers laden
  }catch(e){}
}

// Toepassen: aangevinkte video's naar de juiste plek in de bouwer + leren.
function gmToepassen(){
  if(!GM.voorstel)return;
  let totaal=0;
  GM.voorstel.forEach(sec=>{
    const kies=sec.voorstellen.filter(v=>v.aan);
    // Leren: accepteren +1, zelf gekoppeld of gewisseld +2, uitgevinkt voorstel -1.
    sec.voorstellen.forEach(v=>{
      if(v.aan)gmLeer(v.term,v.oefId,(v.gekoppeld||v.gewisseld)?2:1);
      else if(!v.gekoppeld)gmLeer(v.term,v.oefId,-1);
    });
    if(!kies.length)return;
    const nieuwe=kies.map(v=>({titel:v.naam,youtube_id:v.yt,oefening_id:v.oefId,term:v.term}));
    if(sec.key==="warmup"||sec.key==="cooldown")gmStripVoegToe(sec.key,nieuwe);
    else{
      const row=document.querySelectorAll("#exrows .exrow")[sec.rowIdx];
      if(row){
        let media=[];try{media=row.dataset.media?JSON.parse(row.dataset.media):[];}catch(e){}
        nieuwe.forEach(m=>{if(!media.some(x=>x.youtube_id===m.youtube_id))media.push(m);});
        row.dataset.media=JSON.stringify(media);
        gmRowStrip(row);
      }
    }
    totaal+=kies.length;
  });
  gmDicht();
  toast(totaal?totaal+" video's toegevoegd; ze gaan mee voor de sporter":"Geen video's aangevinkt");
}

// ---------- Mediastroken in de bouwer (met verwijder-kruisje) ----------
function gmTegel(m,cb){
  return '<div class="tplvid" title="'+esc(m.titel||"Video")+'" style="position:relative">'+
    '<div onclick="event.stopPropagation();ytSpeel(\''+esc(m.youtube_id)+'\')" style="position:relative;width:76px;height:46px;border-radius:7px;background:#000 url(\'https://i.ytimg.com/vi/'+esc(m.youtube_id)+'/mqdefault.jpg\') center/cover;cursor:pointer">'+
    '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center"><svg width="9" height="9" viewBox="0 0 12 12" fill="#fff"><path d="M2 1l8 5-8 5z"/></svg></span></span></div>'+
    '<span title="Video weghalen" onclick="event.stopPropagation();'+cb+'" style="position:absolute;top:-6px;right:-6px;width:17px;height:17px;border-radius:50%;background:#171719;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;line-height:1">✕</span></div>';
}
// Strook op een oefening/conditioning-blok verversen (zelfde opmaak als
// exMediaHtml in klant-scherm.js, die de tegels hierboven gebruikt).
function gmRowStrip(row){
  let media=[];try{media=row.dataset.media?JSON.parse(row.dataset.media):[];}catch(e){}
  media=(media||[]).filter(m=>m&&m.youtube_id);
  const strip=row.querySelector(".exmedia");
  if(!media.length){if(strip)strip.remove();return;}
  const html=exMediaHtml(media);
  if(strip)strip.outerHTML=html;
  else{const drop=row.querySelector(".exdrop");if(drop)drop.insertAdjacentHTML("beforebegin",html);else row.insertAdjacentHTML("beforeend",html);}
}
function gmRowTegelWeg(el,i){
  const row=el.closest(".exrow");if(!row)return;
  let media=[];try{media=row.dataset.media?JSON.parse(row.dataset.media):[];}catch(e){}
  const weg=media[i];
  media.splice(i,1);
  row.dataset.media=media.length?JSON.stringify(media):"";
  if(weg&&weg.term&&weg.oefening_id)gmLeer(weg.term,weg.oefening_id,-1);
  gmRowStrip(row);
}
// Strook onder warming-up/cooldown (los van de bestaande enkele demo-video).
function gmStripHtml(kind,media){
  media=(media||[]).filter(m=>m&&m.youtube_id);
  if(!media.length)return '<div class="gmstrip" id="gmstrip_'+kind+'"></div>';
  return '<div class="gmstrip" id="gmstrip_'+kind+'" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:7px;align-items:center">'+
    media.map((m,i)=>gmTegel(m,"gmStripTegelWeg('"+kind+"',"+i+")")).join("")+
    '<span class="sm muted" style="margin-left:2px">'+media.length+' demo-video'+(media.length===1?"":"\'s")+' · gaan mee voor het lid</span></div>';
}
function gmStripLees(kind){
  const box=document.getElementById("wm_"+kind);
  if(!box)return null;
  let media=[];try{media=box.dataset.gmedia?JSON.parse(box.dataset.gmedia):[];}catch(e){}
  media=(media||[]).filter(m=>m&&m.youtube_id);
  return media.length?media:null;
}
function gmStripZet(kind,media){
  const box=document.getElementById("wm_"+kind);if(!box)return;
  box.dataset.gmedia=media&&media.length?JSON.stringify(media):"";
  const strip=document.getElementById("gmstrip_"+kind);
  if(strip)strip.outerHTML=gmStripHtml(kind,media);
}
function gmStripVoegToe(kind,nieuwe){
  const huidig=gmStripLees(kind)||[];
  nieuwe.forEach(m=>{if(!huidig.some(x=>x.youtube_id===m.youtube_id))huidig.push(m);});
  gmStripZet(kind,huidig);
}
function gmStripTegelWeg(kind,i){
  const media=gmStripLees(kind)||[];
  const weg=media[i];
  media.splice(i,1);
  if(weg&&weg.term&&weg.oefening_id)gmLeer(weg.term,weg.oefening_id,-1);
  gmStripZet(kind,media);
}
