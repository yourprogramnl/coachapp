// app/feedback-venster.js: feedback op één onderdeel van een workout (19 nov 2026).
//
// Opzet zoals het "Give feedback"-venster van Strivee: links de video of foto
// van het lid, rechts de opdracht, de score en het gesprek over dit onderdeel.
// Onderaan kiest de coach Tekst of Video:
//   Tekst = typen (met eventueel een bijlage) en versturen;
//   Video = een opname met stem en, als je wilt, je gezicht in een rondje over
//           de video van het lid (zoals Loom): aftellen, opnemen, nakijken, versturen.
//
// De feedback is een gewone dagreactie (workout_comments) met block_id erbij.
// Daardoor ziet een lid met een oudere app-versie hem ook, bij de reacties van
// die dag. De opname gaat als video-bijlage mee (private media-bucket, map
// reacties), net als een bijlage uit het reactiepaneel.
//
// Laadt na chat.js en dashboard.js (gebruikt CHATBIJL, chatUpload,
// chatMediaTiles, dashVidSrcs, wcVerversUI). Openen: fbOpen(lidId, blokId, pad).

const FB_MAX_SEC=180,FB_BEELD_BITS=1500000,FB_GELUID_BITS=96000;
const FB_MIMES=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs=avc1,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
const FB={aid:null,bid:null,blok:null,workout:null,res:null,media:[],idx:0,draad:[],modus:"tekst",urls:{},
  // video-modus: wat er op het canvas staat is precies wat er wordt opgenomen
  cv:null,ctx:null,bron:"geen",vid:null,foto:null,bronUrl:null,laatste:null,laatsteCtx:null,heeftFrame:false,
  camEl:null,stroom:null,camKlaar:false,audioCtx:null,meter:null,meterData:null,niveau:0,plek:null,loopt:false,zoekDoel:null,sleept:false,speelde:false,
  rec:null,delen:[],fase:"rust",telTimer:null,opnMs:0,opnSinds:0,blob:null,blobUrl:null,mime:""};
CHATBIJL.fb=[]; // bijlagen bij getypte feedback (zelfde werkwijze als het reactiepaneel)

const fbEl=id=>document.getElementById(id);
const fbMmss=s=>{s=Math.max(0,Math.floor(s));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");};
const fbEven=n=>Math.max(2,Math.round(n/2)*2);
function fbStatus(t,fout){const el=fbEl("fbv-status");if(el){el.textContent=t||"";el.classList.toggle("fout",!!fout);}}

// ---------- Venster opbouwen en sluiten ----------
function fbEnsure(){
  if(fbEl("fbvenster"))return;
  const ov=document.createElement("div");ov.id="fbvenster";
  ov.innerHTML='<div class="fbv" role="dialog" aria-modal="true" aria-label="Feedback op een onderdeel"><div id="fbv-inh"></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener("click",e=>{
    if(e.target===ov){fbSluit();return;}
    const k=e.target.closest("[data-fb]");if(!k)return;
    const a=k.getAttribute("data-fb");
    if(a==="sluit")fbSluit();
    else if(a==="modus")fbZetModus(k.getAttribute("data-m"));
    else if(a==="media")fbKiesMedia(Number(k.getAttribute("data-i")));
    else if(a==="stuur")fbStuurTekst();
    else if(a==="bijlage")chatKies("fb");
    else if(a==="speel")fbSpeelWissel();
    else if(a==="stap")fbStap(Number(k.getAttribute("data-r")));
    else if(a==="opname"){FB.fase==="rust"?fbOpnBegin():fbOpnStop();}
    else if(a==="pauze")fbOpnPauze();
    else if(a==="opverstuur")fbOpnVerstuur();
    // Een opname die klaarstaat gooi je niet per ongeluk weg: eerst even bevestigen (wens Stefan, 19 nov)
    else if(a==="opopnieuw"){if(confirm("Je opname wordt weggegooid en je begint opnieuw. Weet je het zeker?")){fbOpnWeg();fbOpnBegin();}}
    else if(a==="opweg"){if(confirm("Wil je deze opname weggooien? Dat kan niet ongedaan worden gemaakt.")){fbOpnWeg();fbStatus("Opname weggegooid.");}}
  });
  ov.addEventListener("change",e=>{
    if(e.target.id==="fbv-snel"){if(FB.vid)FB.vid.playbackRate=Number(e.target.value);}
    else if(e.target.id==="fbv-schuif")fbSleepKlaar();
    else if(e.target.id==="fbv-camaan")fbVideoUi(); // uitleg laten meegaan met het vinkje
  });
  ov.addEventListener("input",e=>{
    if(e.target.id==="fbv-schuif")fbZoek(e.target.value/1000*fbDuur());
    else if(e.target.id==="fbv-inp"){const ta=e.target;ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight+2,140)+"px";}
  });
  ov.addEventListener("keydown",e=>{
    if(e.target.id==="fbv-inp"&&e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();fbStuurTekst();}
  });
  // Slepen aan de schuifbalk = met de hand door de video (slowmotion in je eigen
  // tempo). De video staat stil zolang je sleept en speelt verder als je loslaat.
  ov.addEventListener("pointerdown",e=>{
    if(e.target.id!=="fbv-schuif")return;
    FB.sleept=true;
    if(FB.vid){FB.speelde=!FB.vid.paused&&!FB.vid.ended;FB.vid.pause();}
  });
  ["pointerup","pointercancel"].forEach(n=>ov.addEventListener(n,e=>{if(e.target.id==="fbv-schuif")fbSleepKlaar();}));
  document.addEventListener("keydown",e=>{
    if(e.key!=="Escape"||!ov.classList.contains("show"))return;
    const v=fbEl("vidoverlay");if(v&&v.style.display==="flex")return; // eerst de grote weergave dicht
    fbSluit();
  });
}
function fbSleepKlaar(){
  if(!FB.sleept)return;
  FB.sleept=false;
  if(FB.speelde&&FB.vid)FB.vid.play().catch(()=>{});
  FB.speelde=false;
}
function fbSluit(){
  const ov=fbEl("fbvenster");if(!ov||!ov.classList.contains("show"))return;
  if(FB.fase==="op"||FB.fase==="pauze"||FB.fase==="klaar"){
    if(!confirm("Je opname is nog niet verstuurd. Toch sluiten?"))return;
  }
  fbVideoUit();
  ov.classList.remove("show");
  fbEl("fbv-inh").innerHTML="";
  CHATBIJL.fb=[];
  FB.aid=FB.bid=null;FB.blok=FB.workout=FB.res=null;FB.media=[];FB.draad=[];FB.modus="tekst";FB.urls={};
}

// ---------- Openen: alles van dit onderdeel vers ophalen ----------
async function fbOpen(aid,bid,pad){
  fbEnsure();
  const ov=fbEl("fbvenster");
  if(ov.classList.contains("show")){fbSluit();if(ov.classList.contains("show"))return;}
  FB.aid=aid;FB.bid=bid;FB.modus="tekst";FB.idx=0;FB.urls={};CHATBIJL.fb=[];
  ov.classList.add("show");
  fbEl("fbv-inh").innerHTML='<div class="fbv-laad">Laden…</div>';
  const[b,r,m,c]=await Promise.all([
    db.from("blocks").select("id,workout_id,label,exercise,prescription,notes,score_type,kind").eq("id",bid).single(),
    db.from("results").select("*").eq("block_id",bid).eq("athlete_id",aid).limit(1),
    db.from("result_media").select("*").eq("block_id",bid).eq("athlete_id",aid).order("created_at"),
    db.from("workout_comments").select("*").eq("athlete_id",aid).eq("block_id",bid).order("created_at")
  ]);
  if(FB.aid!==aid||FB.bid!==bid)return; // intussen een ander onderdeel geopend of gesloten
  if(b.error||!b.data){toast("Dit onderdeel is niet meer te vinden");ov.classList.remove("show");return;}
  const w=await db.from("workouts").select("id,title,workout_date").eq("id",b.data.workout_id).single();
  if(FB.aid!==aid||FB.bid!==bid)return;
  FB.blok=b.data;FB.workout=w.data||{id:b.data.workout_id};
  FB.res=(r.data||[])[0]||null;FB.media=m.data||[];FB.draad=c.data||[];
  FB.idx=Math.max(0,FB.media.findIndex(x=>x.storage_path===pad));
  fbRender();
  fbMarkeerGelezen();
}
// Reacties van het lid op dit onderdeel op gelezen zetten (alleen de eigen coach mag dat).
async function fbMarkeerGelezen(){
  const aid=FB.aid,p=actieveKlanten().find(x=>x.id===aid)||{};
  if(typeof belMarkeerSoort==="function")belMarkeerSoort(aid,"reactie");
  if(p.coach_id!==ME.user.id)return;
  const ids=FB.draad.filter(x=>x.author_id===x.athlete_id&&!x.read_at).map(x=>x.id);
  if(!ids.length)return;
  try{
    const nu=new Date().toISOString();
    await db.from("workout_comments").update({read_at:nu}).in("id",ids);
    const zet=x=>{if(ids.includes(x.id))x.read_at=nu;};
    FB.draad.forEach(zet);
    if(typeof DASH!=="undefined"&&DASH&&DASH.wc)DASH.wc.forEach(zet);
    if(typeof monthComments!=="undefined")monthComments.forEach(zet);
    wcVerversUI();
  }catch(e){}
}

function fbRender(){
  const p=actieveKlanten().find(x=>x.id===FB.aid)||{},b=FB.blok,r=FB.res;
  const voornaam=p.first_name||"je klant";
  const score=r?(r.status==="missed"?"Gemist":resultScoreVol(r,b.score_type)||"Voltooid zonder score"):"";
  const opdracht=[b.prescription,b.notes].filter(Boolean).join("\n");
  const strip=FB.media.length>1?'<div class="fbv-strip">'+FB.media.map((x,i)=>'<span class="vidtile'+(i===FB.idx?' aan':'')+'" data-fb="media" data-i="'+i+'" title="'+(isFotoUpload(x.storage_path)?"Foto":"Video")+' '+(i+1)+'">'+(isFotoUpload(x.storage_path)?"📷":"▶")+'</span>').join("")+'</div>':'';
  fbEl("fbv-inh").innerHTML=
    '<div class="fbv-kop"><div><h3>Feedback aan '+esc(naamVan(p))+'</h3><div class="sm muted">'+esc(((b.label||"")+" "+(b.exercise||"Onderdeel")).trim())+(FB.workout.workout_date?' · '+esc(datumNL(FB.workout.workout_date)):'')+'</div></div><span class="fbv-x" data-fb="sluit" title="Sluiten">×</span></div>'+
    '<div class="fbv-body">'+
      '<div class="fbv-links">'+strip+
        '<div class="fbv-podium" id="fbv-podium"></div>'+
        '<div class="fbv-ctl" id="fbv-ctl" style="display:none"><button class="btn ghost sm" data-fb="speel" id="fbv-speel">Afspelen</button><input type="range" id="fbv-schuif" min="0" max="1000" value="0" aria-label="Positie in de video"><span class="fbv-tijd" id="fbv-tijd">0:00 / 0:00</span></div>'+
        '<div class="fbv-opt" id="fbv-opt" style="display:none"><label>Snelheid <select id="fbv-snel"><option value="1">Normaal</option><option value="0.5">Half zo snel</option><option value="0.25">Kwart snelheid</option></select></label><button class="btn ghost sm" data-fb="stap" data-r="-1">Beeldje terug</button><button class="btn ghost sm" data-fb="stap" data-r="1">Beeldje verder</button></div>'+
      '</div>'+
      '<div class="fbv-rechts">'+
        '<div class="fbv-opdr">'+(opdracht?'<div class="fbv-pre">'+esc(opdracht)+'</div>':'')+
          (r?'<div class="fbv-score"><b>'+esc(score)+'</b>'+(r.rx?' · '+(r.rx==="scaled"?"Scaled":"Rx"):'')+(r.note?'<div class="fbv-noot">'+esc(r.note)+'</div>':'')+'</div>':'<div class="fbv-score muted">Nog niets gelogd bij dit onderdeel.</div>')+
        '</div>'+
        '<div class="fbv-draad" id="fbv-draad"></div>'+
        '<div class="fbv-onder">'+
          '<div class="fbv-modus" role="group" aria-label="Soort feedback"><button data-fb="modus" data-m="tekst" class="aan">Tekst</button><button data-fb="modus" data-m="video">Video</button></div>'+
          '<div class="fbv-statusrij" id="fbv-status" role="status"></div>'+
          '<div id="fbv-tekst">'+
            '<div class="bijlrij" id="chat-bijl-fb" style="display:none"></div>'+
            '<div class="wcinvoer"><button class="bijlknop" data-fb="bijlage" title="Foto of video meesturen">📎</button><textarea id="fbv-inp" rows="1" placeholder="Schrijf je feedback… (Enter = nieuwe regel)"></textarea><button class="btn" id="fbv-stuur" data-fb="stuur">Stuur</button></div>'+
          '</div>'+
          '<div id="fbv-video" style="display:none">'+
            '<div class="sm muted" id="fbv-hint"></div>'+
            '<div class="fbv-opnrij" id="fbv-opnrij"><button class="btn" data-fb="opname" id="fbv-opn">Opnemen</button><button class="btn ghost" data-fb="pauze" id="fbv-pauze" style="display:none">Pauzeer</button><label class="fbv-vink"><input type="checkbox" id="fbv-camaan" checked> Mijn gezicht in beeld</label><span class="fbv-klok" id="fbv-klok"></span></div>'+
            '<div class="fbv-klaar" id="fbv-klaar" style="display:none"></div>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  fbEl("fbv-inh").setAttribute("data-naam",voornaam);
  fbDraad();
  fbToonMedia();
}
function fbDraad(){
  const host=fbEl("fbv-draad");if(!host)return;
  const p=actieveKlanten().find(x=>x.id===FB.aid)||{};
  host.innerHTML=FB.draad.map(m=>{
    const mij=m.author_id===ME.user.id;
    const naam=m.author_id===m.athlete_id?naamVan(p):(mij?"Jij":"Coach");
    return '<div class="wcrij '+(mij?"me":"them")+'"><div class="bub '+(mij?"me":"them")+'">'+chatMediaTiles(m)+(m.body?esc(m.body):"")+'<div class="meta">'+esc(naam)+' · '+tijdNL(m.created_at)+'</div></div></div>';
  }).join("")||'<div class="sm muted" style="text-align:center;padding:10px">Nog geen feedback bij dit onderdeel.</div>';
  host.scrollTop=host.scrollHeight;
  if(typeof dashVidSrcs==="function")dashVidSrcs(); // kijk-URL's van foto's/video's in de bubbels vullen
}
// Kijk-URL van een bestand uit de private media-bucket (HEIC-foto's eerst omzetten).
async function fbUrl(pad){
  if(FB.urls[pad])return FB.urls[pad];
  const{data,error}=await db.storage.from("media").createSignedUrl(pad,3600);
  let u=(!error&&data&&data.signedUrl)||null;
  if(u&&isHeic(pad)){try{u=await heicNaarUrl(u,pad);}catch(e){}}
  if(u)FB.urls[pad]=u;
  return u;
}
// Linkervlak in de Tekst-stand: de gewone speler (met geluid) of de foto.
async function fbToonMedia(){
  const pod=fbEl("fbv-podium");if(!pod)return;
  const m=FB.media[FB.idx];
  if(!m){pod.innerHTML='<div class="fbv-leeg">Bij dit onderdeel staat geen video of foto.</div>';return;}
  const bid=FB.bid,idx=FB.idx;
  pod.innerHTML='<div class="fbv-leeg">Laden…</div>';
  const u=await fbUrl(m.storage_path);
  if(FB.bid!==bid||FB.idx!==idx||FB.modus!=="tekst")return;
  if(!u){pod.innerHTML='<div class="fbv-leeg">Openen mislukt.</div>';return;}
  pod.innerHTML=isFotoUpload(m.storage_path)
    ?'<img src="'+esc(u)+'" alt="Foto van het lid">'
    :'<video src="'+esc(u)+'" controls playsinline></video>';
}
function fbKiesMedia(i){
  if(FB.fase!=="rust"||i===FB.idx||!FB.media[i])return;
  FB.idx=i;
  document.querySelectorAll("#fbvenster .fbv-strip .vidtile").forEach((t,n)=>t.classList.toggle("aan",n===i));
  if(FB.modus==="video")fbBronLaad();else fbToonMedia();
}

// ---------- Tekst versturen ----------
// Nieuwe reactie ook in de lijsten van het scherm erachter zetten, zodat de tellers kloppen.
function fbNaVersturen(rij){
  FB.draad.push(rij);
  if(typeof DASH!=="undefined"&&DASH&&DASH.wc)DASH.wc.push(rij);
  if(typeof monthComments!=="undefined")monthComments.push(rij);
  fbDraad();
  wcVerversUI();
}
async function fbStuurTekst(){
  const inp=fbEl("fbv-inp"),knop=fbEl("fbv-stuur");
  const tekst=(inp.value||"").trim();
  if((!tekst&&!CHATBIJL.fb.length)||!FB.bid)return;
  if(knop.disabled)return;
  let media=null;
  knop.disabled=true;
  if(CHATBIJL.fb.length){
    knop.textContent="Uploaden…";
    try{media=await chatUpload("fb",FB.aid,"reacties");}
    catch(e){toast(e.message||"Upload mislukt");knop.disabled=false;knop.textContent="Stuur";return;}
  }
  const{data,error}=await db.from("workout_comments").insert({
    workout_id:FB.blok.workout_id,block_id:FB.bid,athlete_id:FB.aid,company_id:ME.profile.company_id,author_id:ME.user.id,body:tekst,media
  }).select().single();
  knop.disabled=false;knop.textContent="Stuur";
  if(error){
    if(media&&media.length)try{db.storage.from("media").remove(media.map(x=>x.path));}catch(e){}
    toast(error.message||"Versturen mislukt");return;
  }
  inp.value="";inp.style.height="auto";CHATBIJL.fb=[];chatBijlToon("fb");
  fbNaVersturen(data||{workout_id:FB.blok.workout_id,block_id:FB.bid,athlete_id:FB.aid,author_id:ME.user.id,body:tekst,media,created_at:new Date().toISOString()});
  fbStatus("Verstuurd. "+(fbEl("fbv-inh").getAttribute("data-naam")||"Je klant")+" krijgt een melding.");
}

// ---------- Tekst of Video ----------
async function fbZetModus(m){
  if(m===FB.modus||FB.fase!=="rust")return;
  if(m==="video"){
    if(!window.MediaRecorder||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){fbStatus("Deze browser kan niet opnemen. Gebruik Chrome.",true);return;}
    fbStatus("Camera en microfoon starten…");
    if(!(await fbCamAan()))return;
    if(!fbEl("fbv-video")||!FB.bid){fbVideoUit();return;} // venster intussen gesloten: camera weer uit
    FB.modus="video";
    fbStatus("");
  }else{
    fbVideoUit();
    FB.modus="tekst";
    fbStatus("");
  }
  document.querySelectorAll("#fbvenster .fbv-modus button").forEach(k=>k.classList.toggle("aan",k.getAttribute("data-m")===FB.modus));
  fbEl("fbv-tekst").style.display=FB.modus==="tekst"?"":"none";
  fbEl("fbv-video").style.display=FB.modus==="video"?"":"none";
  if(FB.modus==="video")fbBronLaad();else{fbEl("fbv-ctl").style.display=fbEl("fbv-opt").style.display="none";fbToonMedia();}
}
// Camera en microfoon aanzetten. Lukt de camera niet, dan alleen de microfoon (stem over de video).
async function fbCamAan(){
  if(FB.stroom)return true;
  let s=null;
  try{s=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:"user"},audio:{echoCancellation:true,noiseSuppression:true}});}
  catch(e1){
    if(e1.name==="NotAllowedError"){fbStatus("Geen toestemming voor camera en microfoon. Klik op het slotje links in de adresbalk, sta ze toe en kies opnieuw Video.",true);return false;}
    try{s=await navigator.mediaDevices.getUserMedia({audio:true});}
    catch(e2){fbStatus(e2.name==="NotFoundError"?"Geen microfoon gevonden op deze computer.":"Camera en microfoon starten niet ("+e2.name+").",true);return false;}
  }
  FB.stroom=s;FB.camKlaar=false;
  // Geluidsmeter voor het beeld bij een opname met alleen je stem (zie fbTekenStem)
  try{
    FB.audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    FB.meter=FB.audioCtx.createAnalyser();FB.meter.fftSize=512;FB.meterData=new Uint8Array(FB.meter.fftSize);
    FB.audioCtx.createMediaStreamSource(s).connect(FB.meter);
  }catch(e){FB.meter=null;}
  if(s.getVideoTracks().length){
    FB.camEl=document.createElement("video");FB.camEl.muted=true;FB.camEl.playsInline=true;FB.camEl.srcObject=s;
    try{await FB.camEl.play();FB.camKlaar=true;}catch(e){}
  }
  return true;
}
// Alles van de Video-stand opruimen: opname, camera, tekenlus en de geladen video.
function fbVideoUit(){
  clearInterval(FB.telTimer);
  if(FB.rec&&FB.rec.state!=="inactive"){FB.rec.onstop=null;try{FB.rec.stop();}catch(e){}}
  FB.rec=null;FB.delen=[];FB.fase="rust";FB.loopt=false;
  if(FB.stroom){FB.stroom.getTracks().forEach(t=>t.stop());FB.stroom=null;}
  FB.camEl=null;FB.camKlaar=false;
  if(FB.audioCtx){try{FB.audioCtx.close();}catch(e){}FB.audioCtx=null;}
  FB.meter=null;FB.meterData=null;FB.niveau=0;
  if(FB.vid){try{FB.vid.pause();}catch(e){}FB.vid.removeAttribute("src");FB.vid=null;}
  if(FB.bronUrl){URL.revokeObjectURL(FB.bronUrl);FB.bronUrl=null;}
  if(FB.blobUrl){URL.revokeObjectURL(FB.blobUrl);FB.blobUrl=null;}
  FB.blob=null;FB.foto=null;FB.bron="geen";FB.cv=FB.ctx=null;FB.heeftFrame=false;FB.plek=null;FB.zoekDoel=null;
}

// ---------- Video-stand: het beeld (canvas) ----------
// De video of foto van het lid wordt eerst helemaal opgehaald. Dan mag hij in
// een opname (geen blokkade van de browser) en reageert slepen direct.
async function fbBronLaad(){
  const pod=fbEl("fbv-podium"),m=FB.media[FB.idx],bid=FB.bid,idx=FB.idx;
  if(FB.vid){try{FB.vid.pause();}catch(e){}FB.vid=null;}
  if(FB.bronUrl){URL.revokeObjectURL(FB.bronUrl);FB.bronUrl=null;}
  FB.foto=null;FB.bron="geen";FB.heeftFrame=false;FB.zoekDoel=null;
  pod.innerHTML='<canvas id="fbv-cv" width="720" height="960"></canvas><div class="fbv-tel" id="fbv-tel" style="display:none"></div>';
  FB.cv=fbEl("fbv-cv");FB.ctx=FB.cv.getContext("2d");
  if(!FB.laatste){FB.laatste=document.createElement("canvas");FB.laatsteCtx=FB.laatste.getContext("2d");}
  FB.cv.addEventListener("click",e=>{
    // Klik in het beeld = daar komt je gezicht (kan ook tijdens het opnemen)
    if(FB.bron==="geen"||!fbEl("fbv-camaan").checked||!FB.camKlaar)return;
    const k=FB.cv.getBoundingClientRect();FB.plek={x:(e.clientX-k.left)/k.width,y:(e.clientY-k.top)/k.height};
  });
  if(!FB.loopt){FB.loopt=true;requestAnimationFrame(fbLus);}
  fbVideoUi();
  if(!m){fbFormaat();fbVideoUi();return;}
  fbStatus("Video laden…");
  try{
    const u=await fbUrl(m.storage_path);if(!u)throw new Error("geen link");
    const blob=await(await fetch(u)).blob();
    if(FB.bid!==bid||FB.idx!==idx||FB.modus!=="video")return;
    FB.bronUrl=URL.createObjectURL(blob);
    if(isFotoUpload(m.storage_path)){
      const img=new Image();img.src=FB.bronUrl;await img.decode();
      FB.foto=img;FB.bron="foto";
    }else{
      const v=document.createElement("video");v.muted=true;v.playsInline=true;v.preload="auto";
      await new Promise((ok,nee)=>{v.onloadeddata=ok;v.onerror=()=>nee(new Error("video"));v.src=FB.bronUrl;v.load();});
      v.addEventListener("seeked",fbSeeked);
      v.playbackRate=Number((fbEl("fbv-snel")||{}).value||1);
      FB.vid=v;FB.bron="video";
    }
    if(FB.bid!==bid||FB.idx!==idx||FB.modus!=="video")return;
    fbStatus("");
  }catch(e){
    if(FB.bid!==bid||FB.modus!=="video")return;
    fbStatus("De video van het lid laadt niet. Je kunt wel opnemen met alleen je camera.",true);
  }
  fbFormaat();fbVideoUi();
}
// Formaat van de opname: 720 op de korte kant (nooit meer dan 1280 op de lange).
// Video's uit de app zijn maar 360 breed; op die maat zou je gezicht in het rondje wazig zijn.
function fbFormaat(){
  if(!FB.cv||FB.fase!=="rust")return;
  const vw=FB.bron==="video"?FB.vid.videoWidth:FB.bron==="foto"?FB.foto.naturalWidth:0;
  const vh=FB.bron==="video"?FB.vid.videoHeight:FB.bron==="foto"?FB.foto.naturalHeight:0;
  if(vw&&vh){const s=Math.min(1280/Math.max(vw,vh),Math.max(1,720/Math.min(vw,vh)));FB.cv.width=fbEven(vw*s);FB.cv.height=fbEven(vh*s);}
  else{FB.cv.width=720;FB.cv.height=960;}
}
// Knoppen en uitleg van de Video-stand bijwerken naar de fase van de opname.
function fbVideoUi(){
  const hint=fbEl("fbv-hint");if(!hint)return;
  const cam=fbEl("fbv-camaan"),opn=fbEl("fbv-opn"),pauze=fbEl("fbv-pauze"),rij=fbEl("fbv-opnrij"),klaar=fbEl("fbv-klaar");
  const video=FB.bron==="video";
  fbEl("fbv-ctl").style.display=video&&FB.fase!=="klaar"?"":"none";
  fbEl("fbv-opt").style.display=video&&FB.fase!=="klaar"?"":"none";
  if(!FB.camKlaar){cam.checked=false;cam.disabled=true;}
  else cam.disabled=FB.fase==="op"||FB.fase==="pauze";
  rij.style.display=FB.fase==="klaar"?"none":"";
  klaar.style.display=FB.fase==="klaar"?"":"none";
  opn.textContent=FB.fase==="rust"?"Opnemen":FB.fase==="tel"?"Annuleer":"Stop";
  opn.classList.toggle("fbv-rood",FB.fase==="op"||FB.fase==="pauze");
  pauze.style.display=FB.fase==="op"||FB.fase==="pauze"?"":"none";
  pauze.textContent=FB.fase==="pauze"?"Ga verder":"Pauzeer";
  if(FB.fase==="rust")fbEl("fbv-klok").textContent="";
  hint.textContent=FB.fase==="klaar"?"":FB.fase==="op"||FB.fase==="pauze"?"De opname loopt. Blijf op dit tabblad, anders staat het beeld stil. Maximaal 3 minuten."
    :!FB.camKlaar?"Geen camera gevonden. Je neemt alleen je stem op"+(FB.bron==="geen"?".":" over het beeld.")
    :FB.bron==="geen"?(cam.checked?"Bij dit onderdeel staat geen video van het lid, dus je bent zelf groot in beeld. Vink je gezicht uit om alleen je stem op te nemen.":"Je neemt alleen je stem op. Vink je gezicht aan om zelf in beeld te komen.")
    :!cam.checked?"Je neemt alleen je stem op over de video. Tijdens het opnemen kun je de video afspelen, stilzetten en verslepen."
    :"Klik in het beeld op de plek waar je gezicht moet komen. Tijdens het opnemen kun je de video afspelen, stilzetten en verslepen.";
}
function fbCamVak(cx,cy,bw,bh){ // camerabeeld gespiegeld, bijgesneden tot het vak
  const c=FB.camEl,s=Math.max(bw/c.videoWidth,bh/c.videoHeight);
  FB.ctx.translate(cx,cy);FB.ctx.scale(-1,1);FB.ctx.drawImage(c,-c.videoWidth*s/2,-c.videoHeight*s/2,c.videoWidth*s,c.videoHeight*s);
}
function fbTeken(){
  const x=FB.ctx,w=FB.cv.width,h=FB.cv.height,camOk=FB.camKlaar&&FB.camEl&&FB.camEl.readyState>=2;
  x.fillStyle="#11141a";x.fillRect(0,0,w,h);
  if(FB.bron==="video"){
    // Terwijl de video naar een ander moment springt heeft hij heel even geen beeld.
    // Dan blijft het laatste goede beeld staan (anders komt er zwart in de opname).
    if(FB.vid.readyState>=2&&!FB.vid.seeking){
      x.drawImage(FB.vid,0,0,w,h);
      if(FB.laatste.width!==w||FB.laatste.height!==h){FB.laatste.width=w;FB.laatste.height=h;}
      FB.laatsteCtx.drawImage(FB.vid,0,0,w,h);FB.heeftFrame=true;
    }else if(FB.heeftFrame)x.drawImage(FB.laatste,0,0,w,h);
  }else if(FB.bron==="foto")x.drawImage(FB.foto,0,0,w,h);
  else if(camOk&&fbEl("fbv-camaan").checked){x.save();fbCamVak(w/2,h/2,w,h);x.restore();}
  else fbTekenStem(x,w,h); // geen video van het lid en geen gezicht: alleen je stem
  if(FB.bron!=="geen"&&camOk&&fbEl("fbv-camaan").checked){
    const m=Math.min(w,h),r=m*.15,rand=m*.04,kl=(v,a,b)=>Math.min(b,Math.max(a,v));
    const cx=FB.plek?kl(FB.plek.x*w,r+4,w-r-4):rand+r,cy=FB.plek?kl(FB.plek.y*h,r+4,h-r-4):h-rand-r;
    x.save();x.beginPath();x.arc(cx,cy,r,0,7);x.clip();fbCamVak(cx,cy,2*r,2*r);x.restore();
    x.strokeStyle="#D9B44A";x.lineWidth=Math.max(3,r*.05);x.beginPath();x.arc(cx,cy,r,0,7);x.stroke();
  }
}
// Beeld bij een opname met alleen je stem: een rustig vlak met een cirkel die
// meebeweegt met het geluid, zodat het lid ziet dat er iets te horen is.
function fbTekenStem(x,w,h){
  let niveau=0;
  if(FB.meter){
    const d=FB.meterData;FB.meter.getByteTimeDomainData(d);
    let s=0;for(let i=0;i<d.length;i++){const v=(d[i]-128)/128;s+=v*v;}
    niveau=Math.min(1,Math.sqrt(s/d.length)*4);
  }
  FB.niveau=FB.niveau*.8+niveau*.2; // rustig laten meebewegen
  const r=Math.min(w,h)*(.14+.1*FB.niveau);
  x.fillStyle="#1f242d";x.beginPath();x.arc(w/2,h*.44,r*1.35,0,7);x.fill();
  x.fillStyle="#D9B44A";x.beginPath();x.arc(w/2,h*.44,r,0,7);x.fill();
  x.fillStyle="#e9edf3";x.textAlign="center";
  x.font="600 "+Math.round(w*.055)+"px Inter, sans-serif";x.fillText("Spraakbericht van je coach",w/2,h*.72);
  x.textAlign="start";
}
const fbDuur=()=>(FB.vid&&FB.vid.duration)||0;
function fbLus(nu){
  if(!FB.loopt||!FB.cv||!FB.cv.isConnected){FB.loopt=false;return;}
  fbTeken();
  if(FB.bron==="video"){
    const speelt=!FB.vid.paused&&!FB.vid.ended,t=FB.vid.currentTime||0,d=fbDuur();
    fbEl("fbv-speel").textContent=speelt?"Pauze":"Afspelen";
    if(!FB.sleept)fbEl("fbv-schuif").value=d?Math.round(t/d*1000):0;
    fbEl("fbv-tijd").textContent=fbMmss(t)+" / "+fbMmss(d);
  }
  if(FB.fase==="op"||FB.fase==="pauze"){
    const sec=(FB.opnMs+(FB.fase==="op"?nu-FB.opnSinds:0))/1000;
    fbEl("fbv-klok").textContent=(FB.fase==="pauze"?"Gepauzeerd ":"Opname ")+fbMmss(sec);
    if(sec>=FB_MAX_SEC)fbOpnStop();
  }
  requestAnimationFrame(fbLus);
}
// Naar een moment springen. Is de video nog bezig met de vorige sprong, dan
// onthouden we het nieuwste doel en gaan daarheen zodra hij klaar is.
function fbZoek(t){
  if(!FB.vid)return;
  t=Math.max(0,Math.min(fbDuur(),t));
  if(FB.vid.seeking){FB.zoekDoel=t;return;}
  FB.vid.currentTime=t;
}
// Het beeld van het moment waar we net aankwamen bewaren, vóór de volgende sprong.
// Zonder dit blijft het beeld stilstaan zolang je sleept.
function fbSeeked(){
  const v=FB.vid;if(!v||!FB.cv)return;
  if(v.readyState>=2){
    if(FB.laatste.width!==FB.cv.width||FB.laatste.height!==FB.cv.height){FB.laatste.width=FB.cv.width;FB.laatste.height=FB.cv.height;}
    FB.laatsteCtx.drawImage(v,0,0,FB.cv.width,FB.cv.height);FB.heeftFrame=true;
  }
  if(FB.zoekDoel!==null){const t=FB.zoekDoel;FB.zoekDoel=null;v.currentTime=t;}
}
function fbSpeelWissel(){
  const v=FB.vid;if(!v)return;
  if(v.paused){if(v.ended)v.currentTime=0;v.play().catch(()=>{});}else v.pause();
}
function fbStap(richting){if(!FB.vid)return;FB.vid.pause();fbZoek(FB.vid.currentTime+richting/30);}

// ---------- Opnemen: aftellen, opnemen, pauzeren, nakijken, versturen ----------
function fbOpnBegin(){
  if(FB.fase!=="rust"||!FB.stroom||!FB.cv)return;
  fbStatus("");
  FB.fase="tel";fbVideoUi();
  let n=3;const tel=fbEl("fbv-tel");tel.textContent=n;tel.style.display="";
  FB.telTimer=setInterval(()=>{
    n--;
    if(n>0){tel.textContent=n;return;}
    clearInterval(FB.telTimer);tel.style.display="none";fbOpnStart();
  },900);
}
function fbOpnStart(){
  FB.mime=FB_MIMES.find(m=>MediaRecorder.isTypeSupported(m))||"";
  const stroom=new MediaStream([...FB.cv.captureStream(30).getVideoTracks(),...FB.stroom.getAudioTracks()]);
  try{FB.rec=new MediaRecorder(stroom,{mimeType:FB.mime||undefined,videoBitsPerSecond:FB_BEELD_BITS,audioBitsPerSecond:FB_GELUID_BITS});}
  catch(e){FB.fase="rust";fbVideoUi();fbStatus("Opnemen start niet: "+e.message,true);return;}
  FB.delen=[];
  FB.rec.ondataavailable=e=>{if(e.data&&e.data.size)FB.delen.push(e.data);};
  FB.rec.onstop=fbOpnKlaar;
  FB.rec.onerror=()=>fbStatus("Er ging iets mis tijdens het opnemen.",true);
  FB.rec.start(1000);
  FB.fase="op";FB.opnMs=0;FB.opnSinds=performance.now();fbVideoUi();
}
function fbOpnPauze(){
  if(FB.fase==="op"){FB.rec.pause();FB.opnMs+=performance.now()-FB.opnSinds;FB.fase="pauze";}
  else if(FB.fase==="pauze"){FB.rec.resume();FB.opnSinds=performance.now();FB.fase="op";}
  fbVideoUi();
}
function fbOpnStop(){
  if(FB.fase==="tel"){clearInterval(FB.telTimer);fbEl("fbv-tel").style.display="none";FB.fase="rust";fbVideoUi();return;}
  if(FB.fase!=="op"&&FB.fase!=="pauze")return;
  if(FB.fase==="op")FB.opnMs+=performance.now()-FB.opnSinds;
  FB.fase="stopt";
  FB.rec.stop(); // fbOpnKlaar volgt zodra het bestand compleet is
}
// Opname staat klaar: eerst nakijken, dan pas versturen (er gaat niet per ongeluk iets naar een klant).
function fbOpnKlaar(){
  const type=(FB.rec&&FB.rec.mimeType)||FB.mime||"video/webm";
  FB.blob=new Blob(FB.delen,{type:type.split(";")[0]});FB.delen=[];
  if(FB.opnMs<1000||!FB.blob.size){FB.blob=null;FB.fase="rust";fbVideoUi();fbStatus("De opname was korter dan een seconde en is weggegooid.");return;}
  if(FB.vid)FB.vid.pause();
  FB.blobUrl=URL.createObjectURL(FB.blob);
  FB.fase="klaar";
  FB.cv.style.display="none";
  const terug=document.createElement("video");terug.id="fbv-terug";terug.controls=true;terug.playsInline=true;terug.src=FB.blobUrl;
  fbEl("fbv-podium").appendChild(terug);
  const webm=!FB.blob.type.includes("mp4");
  fbEl("fbv-klaar").innerHTML='<div><b>Opname klaar</b> ('+fbMmss(FB.opnMs/1000)+', '+(FB.blob.size/1048576).toFixed(1).replace(".",",")+' MB). Nog niet verstuurd, kijk hem links eerst na.</div>'+
    (webm?'<div class="fbv-let">Let op: deze browser maakt een bestand dat een iPhone niet afspeelt. Neem op in Chrome.</div>':'')+
    '<div class="fbv-klaarknoppen"><button class="btn" data-fb="opverstuur" id="fbv-opverstuur">Verstuur opname</button><button class="btn ghost" data-fb="opopnieuw">Opnieuw</button><button class="btn ghost" data-fb="opweg">Gooi weg</button></div>';
  fbVideoUi();
}
// Opname weggooien en terug naar het live beeld.
function fbOpnWeg(){
  if(FB.fase!=="klaar")return;
  const terug=fbEl("fbv-terug");if(terug)terug.remove();
  if(FB.blobUrl){URL.revokeObjectURL(FB.blobUrl);FB.blobUrl=null;}
  FB.blob=null;FB.fase="rust";
  if(FB.cv)FB.cv.style.display="";
  fbVideoUi();
}
async function fbOpnVerstuur(){
  if(FB.fase!=="klaar"||!FB.blob)return;
  const knop=fbEl("fbv-opverstuur");if(knop.disabled)return;
  const knoppen=[...document.querySelectorAll("#fbv-klaar button")];
  knoppen.forEach(k=>k.disabled=true);knop.textContent="Uploaden…";
  const ext=FB.blob.type.includes("mp4")?"mp4":"webm";
  const path=ME.profile.company_id+"/"+FB.aid+"/reacties/"+crypto.randomUUID()+"."+ext;
  const herstel=t=>{knoppen.forEach(k=>k.disabled=false);knop.textContent="Verstuur opname";toast(t);};
  const up=await db.storage.from("media").upload(path,FB.blob,{contentType:FB.blob.type,upsert:false});
  if(up.error){herstel(up.error.message||"Upload mislukt");return;}
  const media=[{path,kind:"video"}];
  const{data,error}=await db.from("workout_comments").insert({
    workout_id:FB.blok.workout_id,block_id:FB.bid,athlete_id:FB.aid,company_id:ME.profile.company_id,author_id:ME.user.id,body:"",media
  }).select().single();
  if(error){
    try{db.storage.from("media").remove([path]);}catch(e){}
    herstel(error.message||"Versturen mislukt");return;
  }
  fbOpnWeg();
  fbNaVersturen(data||{workout_id:FB.blok.workout_id,block_id:FB.bid,athlete_id:FB.aid,author_id:ME.user.id,body:"",media,created_at:new Date().toISOString()});
  fbStatus("Opname verstuurd. "+(fbEl("fbv-inh").getAttribute("data-naam")||"Je klant")+" krijgt een melding.");
}
