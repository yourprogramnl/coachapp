// app/chat.js — de chat-popup rechtsonder op het klant-scherm:
// coach <-> lid berichten via de messages-tabel, met realtime updates.
// Ook: de gedeelde bijlage-hulpjes (foto's/video's bij een bericht) die
// berichten.js en lid.js hergebruiken. Bestanden gaan naar de private
// 'media'-bucket onder {company}/{athlete}/chat/…; in messages.media staat
// alleen de verwijzing ({path, kind}).
// ---------- CHAT-POPUP (zoals CoachRx Message; messages-tabel + realtime) ----------
let chatKanaal=null,chatAthlete=null;
function tijdNL(iso){const d=new Date(iso);return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)+" · "+d.getDate()+" "+MAANDKORT[d.getMonth()];}

// ---------- Emoji-reacties op chatberichten (feedbackronde 5, 20 okt 2026) ----------
// Gedeeld door de chat-popup, de Berichten-sectie en het lid-scherm. Onder elk
// bericht: de geplaatste emoji's (eigen licht op; klik = weghalen) en bij hover
// de knopjes om te reageren. Zelfde vaste set als de dagreacties (dashboard.js)
// en de app, zodat iPhone en Android hetzelfde tonen.
const RX_EMOJIS=["👍","✅","💪","❤️","🔥","👏"];
let RXMAP={},RXMSG={}; // message_id -> [{profile_id,emoji}] / message_id -> bericht
async function rxLaad(ids){
  ids=(ids||[]).filter(Boolean);if(!ids.length)return;
  ids.forEach(id=>{RXMAP[id]=[];});
  for(let i=0;i<ids.length;i+=150){
    try{
      const{data}=await db.from("message_reactions").select("message_id,profile_id,emoji").in("message_id",ids.slice(i,i+150));
      (data||[]).forEach(r=>{(RXMAP[r.message_id]=RXMAP[r.message_id]||[]).push(r);});
    }catch(e){}
  }
}
function rxHtml(m){
  const lijst=RXMAP[m.id]||[];const per={};
  lijst.forEach(r=>{per[r.emoji]=per[r.emoji]||{n:0,mij:false};per[r.emoji].n++;if(r.profile_id===ME.user.id)per[r.emoji].mij=true;});
  const chips=Object.keys(per).map(e=>'<span class="rc'+(per[e].mij?' mijn':'')+'" title="'+(per[e].mij?'Jouw reactie weghalen':'Ook zo reageren')+'" onclick="rxReageer(\''+esc(m.id)+'\',\''+e+'\')">'+e+(per[e].n>1?' '+per[e].n:'')+'</span>').join("");
  const kies=RX_EMOJIS.filter(e=>!per[e]||!per[e].mij).map(e=>'<span class="rc kies" title="Reageer met '+e+'" onclick="rxReageer(\''+esc(m.id)+'\',\''+e+'\')">'+e+'</span>').join("");
  return '<div class="wcreact">'+chips+'<span class="rkies">'+kies+'</span></div>';
}
// Bubbel + reactieregel in één kolom, uitgelijnd links (ander) of rechts (ik).
function rxRij(m,mij,bubbel){RXMSG[m.id]=m;return '<div class="wcrij '+(mij?"me":"them")+'" data-mid="'+esc(m.id)+'">'+bubbel+rxHtml(m)+'</div>';}
function rxTeken(ids){(ids||[]).forEach(id=>{const m=RXMSG[id];if(!m)return;document.querySelectorAll('[data-mid="'+id+'"] .wcreact').forEach(el=>{el.outerHTML=rxHtml(m);});});}
async function rxVernieuw(ids){await rxLaad(ids);rxTeken(ids);}
async function rxReageer(mid,emoji){
  const m=RXMSG[mid];if(!m)return;
  const lijst=RXMAP[mid]||[];
  const mijn=lijst.find(r=>r.profile_id===ME.user.id&&r.emoji===emoji);
  if(mijn){
    RXMAP[mid]=lijst.filter(r=>r!==mijn);rxTeken([mid]);
    const{error}=await db.from("message_reactions").delete().eq("message_id",mid).eq("profile_id",ME.user.id).eq("emoji",emoji);
    if(error){RXMAP[mid]=lijst;rxTeken([mid]);toast(error.message||"Weghalen mislukt");}
  }else{
    RXMAP[mid]=[...lijst,{message_id:mid,profile_id:ME.user.id,emoji}];rxTeken([mid]);
    const{error}=await db.from("message_reactions").insert({message_id:mid,athlete_id:m.athlete_id,company_id:m.company_id||ME.profile.company_id,profile_id:ME.user.id,emoji});
    if(error&&!/duplicate|unique/i.test(error.message||"")){RXMAP[mid]=lijst;rxTeken([mid]);toast(error.message||"Reageren mislukt");}
  }
}
// Alle berichten van één draad die nu in beeld staan (voor een live-ververs).
function rxIdsVan(athleteId){return Object.keys(RXMSG).filter(id=>RXMSG[id].athlete_id===athleteId);}

// ---------- Bijlagen (gedeeld door popup, Berichten-sectie en lid-scherm) ----------
const CHAT_MEDIA_MAX=104857600; // 100 MB, gelijk aan de bucket-limiet
const CHATBIJL={pop:[],ber:[],wc:[]}; // gekozen bestanden per invoerbalk (popup, Berichten, reactiepaneel), geüpload bij versturen
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
  const lijst=md.map(x=>x.path).join("|"); // groot bekijken = bladeren door alle bijlagen van dit bericht
  return '<div class="chatmedia">'+md.map(x=>x.kind==="image"
    ?'<img class="dashvid" data-vp="'+esc(x.path)+'" onclick="vidSpeel(\''+esc(x.path)+'\',\''+esc(lijst)+'\')" alt="Foto">'
    :'<video class="dashvid" data-vp="'+esc(x.path)+'" preload="metadata" muted playsinline onclick="vidSpeel(\''+esc(x.path)+'\',\''+esc(lijst)+'\')"></video>').join("")+'</div>';
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
// map: "chat" (standaard) of "reacties" (bijlagen bij een dagreactie).
async function chatUpload(key,athleteId,map){
  const uit=[];
  for(const f of CHATBIJL[key]){
    const ext=String(f.name.split(".").pop()||"").toLowerCase().replace(/[^a-z0-9]/g,"")||(chatIsFoto(f)?"jpg":"mp4");
    const path=ME.profile.company_id+"/"+athleteId+"/"+(map==="reacties"?"reacties":"chat")+"/"+crypto.randomUUID()+"."+ext;
    const{error}=await db.storage.from("media").upload(path,f,{contentType:f.type||undefined,upsert:false});
    if(error){
      if(uit.length)try{await db.storage.from("media").remove(uit.map(x=>x.path));}catch(e){}
      throw new Error(error.message||"Upload mislukt");
    }
    uit.push({path,kind:chatIsFoto(f)?"image":"video"});
  }
  return uit;
}

// Alinea's in de chat (feedbackronde 5, 20 okt): het invoerveld is een
// meegroeiend tekstvak. Enter = versturen, Shift+Enter = nieuwe regel.
function chatToets(ev,stuur){
  if(ev.key==="Enter"&&!ev.shiftKey&&!ev.isComposing){ev.preventDefault();stuur();return false;}
  return true;
}
// Tekstvak groeit mee met de tekst (tot zo'n 5 regels) en krimpt weer na het versturen.
function chatGroei(ta){
  if(!ta||ta.tagName!=="TEXTAREA")return;
  ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,120)+"px";
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
    '<div class="cin"><div class="bijlrij" id="chat-bijl-pop" style="display:none"></div><textarea id="chat-inp" rows="1" placeholder="Schrijf een bericht…" title="Enter = versturen, Shift+Enter = nieuwe regel" onkeydown="return chatToets(event,chatStuur)" oninput="chatGroei(this)"></textarea><div class="cinrow"><button class="bijlknop" onclick="chatKies(\'pop\')" title="Foto of video meesturen">📎</button><span class="laterwrap"><button class="klokknop" title="Later versturen (morgen 09:00, maandag 09:00 of een eigen tijd)" onclick="laterMenu(this,\'pop\')">⏱</button></span><button class="send" onclick="chatStuur()">Stuur</button></div></div>';
  document.body.appendChild(pop);
  await chatLaad();
  chatKanaalStart();
}
// Realtime meelezen (als de verbinding het toelaat). Apart, zodat de
// verbindingsbewaker (notificaties.js) hem na een hapering opnieuw kan starten.
function chatKanaalStart(){
  chatSluitKanaal();
  if(!chatAthlete)return;
  try{
    chatKanaal=db.channel("chat-"+chatAthlete+"-"+Date.now())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"athlete_id=eq."+chatAthlete},payload=>{
        // Berichten van de ander, én eigen geplande berichten die nu de deur uit gaan (staan nog niet in beeld)
        if(payload.new&&(payload.new.sender_id!==ME.user.id||!document.querySelector('#chat-msgs [data-mid="'+payload.new.id+'"]')))chatToon(payload.new,true);
      })
      // Emoji van de ander direct in beeld
      .on("postgres_changes",{event:"*",schema:"public",table:"message_reactions",filter:"athlete_id=eq."+chatAthlete},()=>{rxVernieuw(rxIdsVan(chatAthlete));})
      .subscribe();
  }catch(e){}
}
function chatSluitKanaal(){try{if(chatKanaal){db.removeChannel(chatKanaal);chatKanaal=null;}}catch(e){}}
function chatSluit(){const pop=document.getElementById("chatpop");if(pop)pop.classList.remove("show");chatSluitKanaal();}
async function chatLaad(){
  const{data}=await db.from("messages").select("*").eq("athlete_id",chatAthlete).order("created_at");
  await rxLaad((data||[]).map(m=>m.id)); // emoji-reacties van deze draad
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
  return rxRij(m,mij,'<div data-notr class="bub '+(mij?"me":"them")+'">'+chatMediaTiles(m)+(m.body?esc(m.body):"")+'<div class="meta">'+tijdNL(m.created_at)+'</div></div>');
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
  inp.value="";chatGroei(inp);CHATBIJL.pop=[];chatBijlToon("pop");
  chatToon(data||{sender_id:ME.user.id,body:tekst,media,created_at:new Date().toISOString()},true);
}
