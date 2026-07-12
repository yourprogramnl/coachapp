// app/chat.js — de chat-popup rechtsonder op het klant-scherm:
// coach <-> lid berichten via de messages-tabel, met realtime updates.
// ---------- CHAT-POPUP (zoals CoachRx Message; messages-tabel + realtime) ----------
let chatKanaal=null,chatAthlete=null;
function tijdNL(iso){const d=new Date(iso);return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)+" · "+d.getDate()+" "+MAANDKORT[d.getMonth()];}
async function openChatPop(){
  let pop=document.getElementById("chatpop");
  if(pop&&chatAthlete===calClient){pop.classList.toggle("show");return;}
  if(pop)pop.remove();
  chatSluitKanaal();
  chatAthlete=calClient;
  const p=coachClients.find(x=>x.id===calClient)||{};
  pop=document.createElement("div");pop.id="chatpop";pop.className="chatpop show";
  pop.innerHTML='<div class="ch"><div class="cavc" style="width:24px;height:24px;font-size:9px;'+avStijl(naamVan(p))+'">'+esc(naamVan(p).slice(0,2).toUpperCase())+'</div><b>'+naamVan(p)+'</b>'+
    '<svg class="i" onclick="chatSluit()"><use href="#i-x"/></svg></div>'+
    '<div class="msgs2" id="chat-msgs"><div class="sm muted" style="text-align:center;padding:14px">Laden…</div></div>'+
    '<div class="cin"><input id="chat-inp" placeholder="Schrijf een bericht…" onkeydown="if(event.key===\'Enter\')chatStuur()"><div class="cinrow"><button class="send" onclick="chatStuur()">Stuur</button></div></div>';
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
  // binnengekomen berichten op gelezen zetten
  try{await db.from("messages").update({read_at:new Date().toISOString()}).eq("athlete_id",chatAthlete).neq("sender_id",ME.user.id).is("read_at",null);}catch(e){}
}
function chatBubHtml(m){
  const mij=m.sender_id===ME.user.id;
  return '<div class="bub '+(mij?"me":"them")+'">'+esc(m.body)+'<div class="meta">'+tijdNL(m.created_at)+'</div></div>';
}
function chatToon(m,scroll){
  const host=document.getElementById("chat-msgs");if(!host)return;
  const leeg=host.querySelector(".muted");if(leeg)leeg.remove();
  host.insertAdjacentHTML("beforeend",chatBubHtml(m));
  if(scroll)host.scrollTop=host.scrollHeight;
}
async function chatStuur(){
  const inp=document.getElementById("chat-inp");
  const tekst=(inp.value||"").trim();if(!tekst)return;
  const{data,error}=await db.from("messages").insert({company_id:ME.profile.company_id,athlete_id:chatAthlete,sender_id:ME.user.id,body:tekst}).select().single();
  if(error){toast(error.message||"Versturen mislukt");return;}
  inp.value="";
  chatToon(data||{sender_id:ME.user.id,body:tekst,created_at:new Date().toISOString()},true);
}
