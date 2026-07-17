// app/berichten.js — de Berichten-sectie (topnav): alle gesprekken op de
// messages-tabel, naar het ontwerp (gesprekkenlijst links, draad rechts).
// Een coach ziet alleen zijn eigen klanten (RLS dwingt dat ook af);
// eigenaar/platform_admin zien alle gesprekken en kunnen op coach filteren.
let BER={clients:[],coaches:[],msgs:[],cur:null,coachF:"",zoek:"",kanaal:null};

async function fillBerichten(){
  let q=db.from("profiles").select("id,first_name,last_name,email,avatar_url,coach_id").eq("role","lid").eq("archived",false);
  if(myRole()==="coach")q=q.eq("coach_id",ME.user.id);
  else if(ME.profile.company_id)q=q.eq("company_id",ME.profile.company_id);
  const{data:cs}=await q.order("first_name");
  BER.clients=cs||[];
  if(myRole()!=="coach"){
    const{data:co}=await db.from("profiles").select("id,first_name,last_name").in("role",["coach","eigenaar"]).eq("company_id",ME.profile.company_id).order("first_name");
    BER.coaches=co||[];
  }
  const{data:ms}=await db.from("messages").select("*").order("created_at");
  BER.msgs=ms||[];
  if(BER.cur&&!BER.clients.some(c=>c.id===BER.cur))BER.cur=null;
  berRender();
  berRealtime();
}
const berMsgsVan=aid=>BER.msgs.filter(m=>m.athlete_id===aid);
const berOngelezen=aid=>BER.msgs.filter(m=>m.athlete_id===aid&&m.sender_id===aid&&!m.read_at).length;
function berNaam(id){
  const p=BER.clients.find(x=>x.id===id)||BER.coaches.find(x=>x.id===id)||(id===ME.user.id?ME.profile:null);
  return p?naamVan(p):"Coach";
}
function berRender(){
  const cp=document.getElementById("cpage");if(!cp)return;
  const filter=myRole()!=="coach"&&BER.coaches.length?
    '<select class="lid-in" style="padding:8px 10px" onchange="berCoachF(this.value)">'+
      '<option value="">Alle coaches</option>'+
      BER.coaches.map(c=>'<option value="'+c.id+'"'+(BER.coachF===c.id?" selected":"")+'>'+naamVan(c)+'</option>').join("")+
    '</select>':'';
  cp.innerHTML='<div class="hrow"><h1>Berichten</h1>'+filter+'</div>'+
    '<div class="chatwrap">'+
      '<div class="chatlist"><div class="clh">Gesprekken</div>'+
        '<div style="padding:10px 12px;border-bottom:1px solid #f0f1f3"><input class="lid-in" style="width:100%" placeholder="Zoek een klant…" value="'+esc(BER.zoek)+'" oninput="berZoek(this.value)"></div>'+
        '<div id="ber-lijst" style="max-height:560px;overflow:auto">'+berLijstHtml()+'</div></div>'+
      '<div class="thread" id="ber-thread">'+berThreadHtml()+'</div>'+
    '</div>';
  berScroll();
}
function berCoachF(v){BER.coachF=v;const h=document.getElementById("ber-lijst");if(h)h.innerHTML=berLijstHtml();}
function berZoek(v){BER.zoek=(v||"").toLowerCase().trim();const h=document.getElementById("ber-lijst");if(h)h.innerHTML=berLijstHtml();}
function berLijstVernieuw(){const h=document.getElementById("ber-lijst");if(h)h.innerHTML=berLijstHtml();}
function berLijstHtml(){
  let cs=BER.clients;
  if(BER.coachF)cs=cs.filter(c=>c.coach_id===BER.coachF);
  if(BER.zoek)cs=cs.filter(c=>naamVan(c).toLowerCase().includes(BER.zoek));
  if(!cs.length)return '<div class="cempty">Geen klanten gevonden.</div>';
  // Nieuwste gesprek bovenaan; klanten zonder berichten daaronder (alfabetisch).
  const laatst=c=>{const ms=berMsgsVan(c.id);return ms.length?ms[ms.length-1].created_at:"";};
  cs=cs.slice().sort((a,b)=>(laatst(b)||"").localeCompare(laatst(a)||""));
  return cs.map(c=>{
    const ms=berMsgsVan(c.id),m=ms[ms.length-1]||null;
    const prev=m?((m.sender_id===ME.user.id?"Jij: ":"")+m.body):"Nog geen berichten";
    const n=berOngelezen(c.id);
    return '<div class="chatrow'+(BER.cur===c.id?" on":"")+'" onclick="berOpen(\''+c.id+'\')">'+
      '<div class="cavc" style="width:34px;height:34px;font-size:11px;flex:none;'+avFotoStyle(c)+'">'+avFotoText(c)+'</div>'+
      '<div style="min-width:0"><b class="sm">'+naamVan(c)+'</b><div class="prev">'+esc(prev)+'</div></div>'+
      (n?'<span class="cpill bad" style="margin-left:auto;padding:2px 7px">'+n+'</span>':'')+
    '</div>';
  }).join("");
}
function berThreadHtml(){
  const c=BER.clients.find(x=>x.id===BER.cur);
  if(!c)return '<div class="cempty" style="margin:auto">Kies links een gesprek.</div>';
  const coach=BER.coaches.find(x=>x.id===c.coach_id);
  const ms=berMsgsVan(c.id);
  return '<div class="th"><div class="cavc" style="width:34px;height:34px;font-size:11px;flex:none;'+avFotoStyle(c)+'">'+avFotoText(c)+'</div>'+
      '<div><b>'+naamVan(c)+'</b>'+(myRole()!=="coach"&&coach?'<div class="sm muted">Coach: '+naamVan(coach)+'</div>':'')+'</div></div>'+
    '<div class="msgs" id="ber-msgs">'+(ms.map(m=>berBubHtml(m,c)).join("")||'<div class="sm muted" style="text-align:center;padding:14px">Nog geen berichten. Stuur het eerste bericht.</div>')+'</div>'+
    '<div class="inputbar"><input id="ber-inp" placeholder="Typ een bericht…" onkeydown="if(event.key===\'Enter\')berStuur()"><button class="btn sm2" onclick="berStuur()">Versturen</button></div>';
}
// Rechts = de coach-kant (alles wat niet van het lid komt), links = het lid.
// Leest een eigenaar/admin mee, dan staat de naam van de afzender erbij.
function berBubHtml(m,c){
  const vanLid=m.sender_id===c.id;
  let meta=tijdNL(m.created_at);
  if(!vanLid&&m.sender_id!==ME.user.id)meta=berNaam(m.sender_id)+" · "+meta;
  return '<div class="bub '+(vanLid?"them":"me")+'">'+esc(m.body)+'<div class="meta">'+meta+'</div></div>';
}
function berScroll(){const h=document.getElementById("ber-msgs");if(h)h.scrollTop=h.scrollHeight;}
async function berOpen(id){
  BER.cur=id;
  const c=BER.clients.find(x=>x.id===id);
  const th=document.getElementById("ber-thread");if(th)th.innerHTML=berThreadHtml();
  berScroll();
  // gelezen-markering alleen door de eigen coach (RLS staat anderen niet toe)
  if(c&&c.coach_id===ME.user.id&&berOngelezen(id)){
    try{
      await db.from("messages").update({read_at:new Date().toISOString()}).eq("athlete_id",id).eq("sender_id",id).is("read_at",null);
      BER.msgs.forEach(m=>{if(m.athlete_id===id&&m.sender_id===id&&!m.read_at)m.read_at=new Date().toISOString();});
      if(typeof telMsgBadge==="function")telMsgBadge(); // teller op de Berichten-knop bijwerken
    }catch(e){}
  }
  berLijstVernieuw();
}
async function berStuur(){
  const inp=document.getElementById("ber-inp");if(!inp)return;
  const tekst=(inp.value||"").trim();if(!tekst||!BER.cur)return;
  const{data,error}=await db.from("messages").insert({company_id:ME.profile.company_id,athlete_id:BER.cur,sender_id:ME.user.id,body:tekst}).select().single();
  if(error){toast(error.message||"Versturen mislukt");return;}
  inp.value="";
  BER.msgs.push(data||{athlete_id:BER.cur,sender_id:ME.user.id,body:tekst,created_at:new Date().toISOString()});
  berAppend(BER.msgs[BER.msgs.length-1]);
  berLijstVernieuw();
}
function berAppend(m){
  const host=document.getElementById("ber-msgs");if(!host)return;
  const leeg=host.querySelector(".muted");if(leeg)leeg.remove();
  const c=BER.clients.find(x=>x.id===m.athlete_id);if(!c)return;
  host.insertAdjacentHTML("beforeend",berBubHtml(m,c));
  host.scrollTop=host.scrollHeight;
}
// Realtime: nieuw bericht komt direct binnen in de lijst en de open draad.
function berRealtime(){
  try{
    if(BER.kanaal){db.removeChannel(BER.kanaal);BER.kanaal=null;}
    BER.kanaal=db.channel("berichten-sectie")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
        const m=payload.new;if(!m||m.sender_id===ME.user.id)return;
        BER.msgs.push(m);
        if(!document.getElementById("ber-lijst"))return; // sectie niet meer in beeld
        if(BER.cur===m.athlete_id)berAppend(m);
        berLijstVernieuw();
      }).subscribe();
  }catch(e){}
}
