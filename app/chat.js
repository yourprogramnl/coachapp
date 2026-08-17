// app/chat.js — de chat-popup rechtsonder op het klant-scherm:
// coach <-> lid berichten via de messages-tabel, met realtime updates.
// Ook: de gedeelde bijlage-hulpjes (foto's/video's bij een bericht) die
// berichten.js en lid.js hergebruiken. Bestanden gaan naar de private
// 'media'-bucket onder {company}/{athlete}/chat/…; in messages.media staat
// alleen de verwijzing ({path, kind}).
// ---------- CHAT-POPUP (zoals CoachRx Message; messages-tabel + realtime) ----------
let chatKanaal=null,chatAthlete=null;
function tijdNL(iso){const d=new Date(iso);return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)+" · "+d.getDate()+" "+MAANDKORT[d.getMonth()];}

// ---------- Bijlagen (gedeeld door popup, Berichten-sectie en lid-scherm) ----------
const CHAT_MEDIA_MAX=104857600; // 100 MB, gelijk aan de bucket-limiet
const CHATBIJL={pop:[],ber:[]}; // gekozen bestanden per invoerbalk, geüpload bij versturen
const chatIsFoto=f=>String(f.type||"").startsWith("image");
// Regel voor de gesprekkenlijst/preview: berichttekst, anders wat er meegestuurd is.
function chatPreview(m){
  if(m.body)return m.body;
  const md=m.media||[];
  const fotos=md.filter(x=>x.kind==="image").length,vids=md.length-fotos;
  const delen=[];
  if(fotos)delen.push("📷 "+(fotos>1?fotos+" foto's":"Foto"));
  if(vids)delen.push("🎥 "+(vids>1?vids+" video's":"Video"));
  return delen.join(" · ");
}
// Miniaturen in een chat-bubbel; dashVidSrcs() vult daarna de kijk-URL's
// (private bucket, signed URL) en klikken opent groot via vidSpeel().
function chatMediaTiles(m){
  const md=m.media||[];if(!md.length)return "";
  return '<div class="chatmedia">'+md.map(x=>x.kind==="image"
    ?'<img class="dashvid" data-vp="'+esc(x.path)+'" onclick="vidSpeel(\''+esc(x.path)+'\')" alt="Foto">'
    :'<video class="dashvid" data-vp="'+esc(x.path)+'" preload="metadata" muted playsinline onclick="vidSpeel(\''+esc(x.path)+'\')"></video>').join("")+'</div>';
}
function chatKies(key){ // opent de bestandskiezer voor deze invoerbalk
  let inp=document.getElementById("chat-file-"+key);
  if(!inp){
    inp=document.createElement("input");inp.type="file";inp.id="chat-file-"+key;
    inp.accept="image/*,video/*";inp.multiple=true;inp.style.display="none";
    inp.addEventListener("change",()=>{chatBijlErbij(key,[...inp.files]);inp.value="";});
    document.body.appendChild(inp);
  }
  inp.click();
}
function chatBijlErbij(key,files){
  for(const f of files){
    if(!chatIsFoto(f)&&!String(f.type||"").startsWith("video")){toast(f.name+": alleen foto's en video's kunnen mee.");continue;}
    if(f.size>CHAT_MEDIA_MAX){toast(f.name+" is te groot (max 100 MB). Film in 1080p of lager.");continue;}
    CHATBIJL[key].push(f);
  }
  chatBijlToon(key);
}
function chatBijlWeg(key,i){CHATBIJL[key].splice(i,1);chatBijlToon(key);}
function chatBijlToon(key){
  const host=document.getElementById("chat-bijl-"+key);if(!host)return;
  host.innerHTML=CHATBIJL[key].map((f,i)=>'<span class="bijlchip">'+(chatIsFoto(f)?"📷":"🎥")+' '+esc(f.name.length>20?f.name.slice(0,18)+"…":f.name)+'<b onclick="chatBijlWeg(\''+key+'\','+i+')" title="Weghalen">×</b></span>').join("");
  host.style.display=CHATBIJL[key].length?"flex":"none";
}
// Uploadt de gekozen bestanden en geeft de media-array voor het bericht terug.
// Mislukt er één, dan worden de al geüploade bestanden weer opgeruimd.
async function chatUpload(key,athleteId){
  const uit=[];
  for(const f of CHATBIJL[key]){
    const ext=String(f.name.split(".").pop()||"").toLowerCase().replace(/[^a-z0-9]/g,"")||(chatIsFoto(f)?"jpg":"mp4");
    const path=ME.profile.company_id+"/"+athleteId+"/chat/"+crypto.randomUUID()+"."+ext;
    const{error}=await db.storage.from("media").upload(path,f,{contentType:f.type||undefined,upsert:false});
    if(error){
      if(uit.length)try{await db.storage.from("media").remove(uit.map(x=>x.path));}catch(e){}
      throw new Error(error.message||"Upload mislukt");
    }
    uit.push({path,kind:chatIsFoto(f)?"image":"video"});
  }
  return uit;
}

async function openChatPop(){
  let pop=document.getElementById("chatpop");
  if(pop&&chatAthlete===calClient){pop.classList.toggle("show");return;}
  if(pop)pop.remove();
  chatSluitKanaal();
  chatAthlete=calClient;
  CHATBIJL.pop=[]; // ander gesprek = gekozen bijlagen weg
  const p=coachClients.find(x=>x.id===calClient)||{};
  pop=document.createElement("div");pop.id="chatpop";pop.className="chatpop show";
  pop.innerHTML='<div class="ch"><div class="cavc" style="width:24px;height:24px;font-size:9px;'+avFotoStyle(p)+'">'+avFotoText(p)+'</div><b>'+naamVan(p)+'</b>'+
    '<svg class="i" onclick="chatSluit()"><use href="#i-x"/></svg></div>'+
    '<div class="msgs2" id="chat-msgs"><div class="sm muted" style="text-align:center;padding:14px">Laden…</div></div>'+
    '<div class="cin"><div class="bijlrij" id="chat-bijl-pop" style="display:none"></div><input id="chat-inp" placeholder="Schrijf een bericht…" onkeydown="if(event.key===\'Enter\')chatStuur()"><div class="cinrow"><button class="bijlknop" onclick="chatKies(\'pop\')" title="Foto of video meesturen">📎</button><button class="send" onclick="chatStuur()">Stuur</button></div></div>';
  document.body.appendChild(pop);
  await chatLaad();
  // realtime meelezen (als de verbinding het toelaat)
  try{
    chatKanaal=db.channel("chat-"+calClient)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"athlete_id=eq."+calClient},payload=>{
        if(payload.new&&payload.new.sender_id!==ME.user.id)chatToon(payload.new,true);
      }).subscribe();
  }catch(e){}
}
function chatSluitKanaal(){try{if(chatKanaal){db.removeChannel(chatKanaal);chatKanaal=null;}}catch(e){}}
function chatSluit(){const pop=document.getElementById("chatpop");if(pop)pop.classList.remove("show");chatSluitKanaal();}
async function chatLaad(){
  const{data}=await db.from("messages").select("*").eq("athlete_id",chatAthlete).order("created_at");
  const host=document.getElementById("chat-msgs");if(!host)return;
  host.innerHTML=(data||[]).map(m=>chatBubHtml(m)).join("")||'<div class="sm muted" style="text-align:center;padding:14px">Nog geen berichten. Stuur het eerste bericht.</div>';
  host.scrollTop=host.scrollHeight;
  if(typeof dashVidSrcs==="function")dashVidSrcs(); // kijk-URL's van foto's/video's vullen
  // binnengekomen berichten op gelezen zetten
  try{
    await db.from("messages").update({read_at:new Date().toISOString()}).eq("athlete_id",chatAthlete).neq("sender_id",ME.user.id).is("read_at",null);
    if(typeof telMsgBadge==="function")telMsgBadge(); // teller op de Berichten-knop bijwerken
  }catch(e){}
}
function chatBubHtml(m){
  const mij=m.sender_id===ME.user.id;
  return '<div class="bub '+(mij?"me":"them")+'">'+chatMediaTiles(m)+(m.body?esc(m.body):"")+'<div class="meta">'+tijdNL(m.created_at)+'</div></div>';
}
function chatToon(m,scroll){
  const host=document.getElementById("chat-msgs");if(!host)return;
  const leeg=host.querySelector(".muted");if(leeg)leeg.remove();
  host.insertAdjacentHTML("beforeend",chatBubHtml(m));
  if(typeof dashVidSrcs==="function")dashVidSrcs();
  if(scroll)host.scrollTop=host.scrollHeight;
}
async function chatStuur(){
  const inp=document.getElementById("chat-inp");
  const tekst=(inp.value||"").trim();
  if(!tekst&&!CHATBIJL.pop.length)return;
  const knop=document.querySelector("#chatpop .send");
  if(knop&&knop.disabled)return; // niet dubbel versturen tijdens een upload
  let media=[];
  if(CHATBIJL.pop.length){
    if(knop){knop.disabled=true;knop.textContent="Uploaden…";}
    try{media=await chatUpload("pop",chatAthlete);}
    catch(e){toast(e.message||"Upload mislukt");if(knop){knop.disabled=false;knop.textContent="Stuur";}return;}
  }
  const{data,error}=await db.from("messages").insert({company_id:ME.profile.company_id,athlete_id:chatAthlete,sender_id:ME.user.id,body:tekst,media}).select().single();
  if(knop){knop.disabled=false;knop.textContent="Stuur";}
  if(error){
    if(media.length)try{db.storage.from("media").remove(media.map(x=>x.path));}catch(e){}
    toast(error.message||"Versturen mislukt");return;
  }
  inp.value="";CHATBIJL.pop=[];chatBijlToon("pop");
  chatToon(data||{sender_id:ME.user.id,body:tekst,media,created_at:new Date().toISOString()},true);
}
