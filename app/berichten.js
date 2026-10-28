// app/berichten.js — de Berichten-sectie (topnav): alle gesprekken op de
// messages-tabel, naar het ontwerp (gesprekkenlijst links, draad rechts).
// Een coach ziet alleen zijn eigen klanten (RLS dwingt dat ook af);
// eigenaar/platform_admin zien alle gesprekken en kunnen op coach filteren.
let BER={clients:[],coaches:[],msgs:[],cur:null,coachF:"",zoek:"",kanaal:null,
  groups:[],leden:[],gmsgs:[],programs:[],gepland:[],klantCache:{}};

async function fillBerichten(){
  // Ook staf die meetraint als atleet (eigen coach ingesteld) heeft een gesprek.
  let q=db.from("profiles").select("id,first_name,last_name,email,avatar_url,coach_id,membership_type,blog_program_id").eq("archived",false);
  if(myRole()==="coach")q=q.eq("coach_id",ME.user.id);
  else{if(ME.profile.company_id)q=q.eq("company_id",ME.profile.company_id);q=q.or("role.eq.lid,coach_id.not.is.null");}
  const{data:cs}=await q.order("first_name");
  BER.clients=cs||[];
  // Stafnamen via de veilige RPC (een coach mag collega-profielen niet direct
  // lezen); ook nodig om coaches aan een groepschat te kunnen toevoegen.
  const{data:co}=await db.rpc("company_coaches");
  BER.coaches=co||[];
  const{data:ms}=await db.from("messages").select("*").order("created_at");
  BER.msgs=ms||[];
  await berGeplandLaad();
  // Groepschats: groepen + lidmaatschappen + berichten + blogprogramma's (voor de snelkeuzes)
  const[gq,lq,gm,pq,bm]=await Promise.all([
    db.from("chat_groups").select("*").order("created_at"),
    db.from("chat_group_members").select("*"),
    db.from("chat_group_messages").select("*").order("created_at"),
    db.from("blog_programs").select("id,name"),
    db.from("blog_program_members").select("athlete_id,blog_program_id"),
  ]);
  BER.groups=(gq.data||[]).filter(g=>myRole()!=="coach"||g.created_by===ME.user.id||(lq.data||[]).some(m=>m.group_id===g.id&&m.profile_id===ME.user.id));
  BER.leden=lq.data||[];
  BER.gmsgs=gm.data||[];
  BER.programs=pq.data||[];
  // Per lid alle gevolgde blogprogramma's (sinds 22 juli meerdere mogelijk)
  BER.progVan={};(bm.data||[]).forEach(m=>{(BER.progVan[m.athlete_id]=BER.progVan[m.athlete_id]||[]).push(m.blog_program_id);});
  if(BER.cur&&!String(BER.cur).startsWith("g:")&&!BER.clients.some(c=>c.id===BER.cur))BER.cur=null;
  berRender();
  berRealtime();
}
// ---------- Groepen: hulpjes ----------
const berGroep=gid=>BER.groups.find(g=>g.id===gid);
const berGroepMsgs=gid=>BER.gmsgs.filter(m=>m.group_id===gid);
const berGroepLeden=gid=>BER.leden.filter(m=>m.group_id===gid);
function berGroepOngelezen(gid){
  const eigen=BER.leden.find(m=>m.group_id===gid&&m.profile_id===ME.user.id);
  const sinds=eigen&&eigen.last_read_at?eigen.last_read_at:"";
  return berGroepMsgs(gid).filter(m=>m.sender_id!==ME.user.id&&m.created_at>sinds).length;
}
// Naam van een willekeurige afzender (klant, coach of ikzelf).
function berNaamAlg(id){
  if(id===ME.user.id)return "Jij";
  const p=BER.clients.find(x=>x.id===id)||BER.coaches.find(x=>x.id===id);
  return p?naamVan(p):"Coach";
}
const berMsgsVan=aid=>BER.msgs.filter(m=>m.athlete_id===aid);
const berOngelezen=aid=>BER.msgs.filter(m=>m.athlete_id===aid&&m.sender_id===aid&&!m.read_at).length;
function berNaam(id){
  const p=BER.clients.find(x=>x.id===id)||BER.coaches.find(x=>x.id===id)||(id===ME.user.id?ME.profile:null);
  return p?naamVan(p):"Coach";
}
function berRender(){
  const cp=document.getElementById("cpage");if(!cp)return;
  const filterCoaches=BER.coaches.filter(c=>c.role!=="platform_admin");
  const filter=myRole()!=="coach"&&filterCoaches.length?
    '<select class="lid-in" style="padding:8px 10px" onchange="berCoachF(this.value)">'+
      '<option value="">Alle coaches</option>'+
      filterCoaches.map(c=>'<option value="'+c.id+'"'+(BER.coachF===c.id?" selected":"")+'>'+naamVan(c)+'</option>').join("")+
    '</select>':'';
  cp.innerHTML='<div class="hrow"><h1>Berichten</h1>'+filter+'<button class="btn ghost sm" style="margin-left:auto" onclick="berGroepNieuw()">+ Groepschat</button></div>'+
    '<div class="chatwrap">'+
      '<div class="chatlist"><div class="clh">Gesprekken</div>'+
        '<div style="padding:10px 12px;border-bottom:1px solid #f0f1f3"><input class="lid-in" style="width:100%" placeholder="Zoek een klant…" value="'+esc(BER.zoek)+'" oninput="berZoek(this.value)"></div>'+
        '<div id="ber-lijst" style="max-height:560px;overflow:auto">'+berLijstHtml()+'</div></div>'+
      '<div class="thread" id="ber-thread">'+berThreadHtml()+'</div>'+
      '<div class="chatklant" id="ber-klant">'+berKlantHtml()+'</div>'+
    '</div>';
  berScroll();
  berKlantLaad();
  chatBijlToon("ber"); // gekozen bijlage-chips terugzetten na een her-render
  if(typeof dashVidSrcs==="function")dashVidSrcs();
}
function berCoachF(v){BER.coachF=v;const h=document.getElementById("ber-lijst");if(h)h.innerHTML=berLijstHtml();}
function berZoek(v){BER.zoek=(v||"").toLowerCase().trim();const h=document.getElementById("ber-lijst");if(h)h.innerHTML=berLijstHtml();}
function berLijstVernieuw(){const h=document.getElementById("ber-lijst");if(h)h.innerHTML=berLijstHtml();}
function berLijstHtml(){
  // Groepen bovenaan (nieuwste bericht eerst), daaronder de losse gesprekken.
  let gs=BER.groups;
  if(BER.zoek)gs=gs.filter(g=>(g.name||"").toLowerCase().includes(BER.zoek));
  const gLaatst=g=>{const ms=berGroepMsgs(g.id);return ms.length?ms[ms.length-1].created_at:g.created_at;};
  const groepenHtml=gs.slice().sort((a,b)=>gLaatst(b).localeCompare(gLaatst(a))).map(g=>{
    const ms=berGroepMsgs(g.id),m=ms[ms.length-1]||null;
    const prev=m?(berNaamAlg(m.sender_id)+": "+m.body):"Nog geen berichten";
    const n=berGroepOngelezen(g.id);
    return '<div class="chatrow'+(BER.cur==="g:"+g.id?" on":"")+'" onclick="berOpenGroep(\''+g.id+'\')">'+
      '<div class="cavc" style="width:34px;height:34px;font-size:13px;flex:none;background:#2a2e35;color:#fff">👥</div>'+
      '<div style="min-width:0"><b class="sm">'+esc(g.name)+(g.announce_only?' 📢':'')+'</b><div class="prev">'+esc(prev)+'</div></div>'+
      (n?'<span class="cpill bad" style="margin-left:auto;padding:2px 7px">'+n+'</span>':'')+
    '</div>';
  }).join("");
  const groepenBlok=groepenHtml?'<div class="clh" style="border-top:none">Groepen</div>'+groepenHtml+'<div class="clh">Klanten</div>':'';
  let cs=BER.clients;
  if(BER.coachF)cs=cs.filter(c=>c.coach_id===BER.coachF);
  if(BER.zoek)cs=cs.filter(c=>naamVan(c).toLowerCase().includes(BER.zoek));
  if(!cs.length&&!groepenHtml)return '<div class="cempty">Geen gesprekken gevonden.</div>';
  if(!cs.length)return groepenBlok;
  // Nieuwste gesprek bovenaan; klanten zonder berichten daaronder (alfabetisch).
  const laatst=c=>{const ms=berMsgsVan(c.id);return ms.length?ms[ms.length-1].created_at:"";};
  cs=cs.slice().sort((a,b)=>(laatst(b)||"").localeCompare(laatst(a)||""));
  return groepenBlok+cs.map(c=>{
    const ms=berMsgsVan(c.id),m=ms[ms.length-1]||null;
    const prev=m?((m.sender_id===ME.user.id?"Jij: ":"")+chatPreview(m)):"Nog geen berichten";
    const n=berOngelezen(c.id);
    return '<div class="chatrow'+(BER.cur===c.id?" on":"")+'" onclick="berOpen(\''+c.id+'\')">'+
      '<div class="cavc" style="width:34px;height:34px;font-size:11px;flex:none;'+avFotoStyle(c)+'">'+avFotoText(c)+'</div>'+
      '<div style="min-width:0"><b class="sm">'+naamVan(c)+'</b><div class="prev">'+esc(prev)+'</div></div>'+
      (n?'<span class="cpill bad" style="margin-left:auto;padding:2px 7px">'+n+'</span>':'')+
    '</div>';
  }).join("");
}
function berThreadHtml(){
  if(String(BER.cur||"").indexOf("g:")===0)return berGroepThreadHtml(String(BER.cur).slice(2));
  const c=BER.clients.find(x=>x.id===BER.cur);
  if(!c)return '<div class="cempty" style="margin:auto">Kies links een gesprek.</div>';
  const coach=BER.coaches.find(x=>x.id===c.coach_id);
  const ms=berMsgsVan(c.id);
  return '<div class="th"><div class="cavc" style="width:34px;height:34px;font-size:11px;flex:none;'+avFotoStyle(c)+'">'+avFotoText(c)+'</div>'+
      '<div><b>'+naamVan(c)+'</b>'+(myRole()!=="coach"&&coach?'<div class="sm muted">Coach: '+naamVan(coach)+'</div>':'')+'</div></div>'+
    '<div class="msgs" id="ber-msgs">'+(ms.map(m=>berBubHtml(m,c)).join("")||'<div class="sm muted" style="text-align:center;padding:14px">Nog geen berichten. Stuur het eerste bericht.</div>')+'</div>'+
    '<div class="gepland" id="ber-gepland">'+berGeplandHtml(c.id)+'</div>'+
    '<div class="bijlrij" id="chat-bijl-ber" style="display:none;padding:6px 14px 0"></div>'+
    '<div class="inputbar"><button class="bijlknop" onclick="chatKies(\'ber\')" title="Foto of video meesturen">📎</button><textarea id="ber-inp" rows="1" placeholder="Typ een bericht…" title="Enter = versturen, Shift+Enter = nieuwe regel" onkeydown="return chatToets(event,berStuur)" oninput="chatGroei(this)"></textarea>'+
      '<span class="laterwrap"><button class="klokknop" title="Later versturen (morgen 09:00, maandag 09:00 of een eigen tijd)" onclick="laterMenu(this,\'ber\')">⏱</button></span>'+
      '<button class="btn sm2" id="ber-verstuur" onclick="berStuur()">Versturen</button></div>';
}
// Rechts = de coach-kant (alles wat niet van het lid komt), links = het lid.
// Leest een eigenaar/admin mee, dan staat de naam van de afzender erbij.
function berBubHtml(m,c){
  const vanLid=m.sender_id===c.id;
  let meta=tijdNL(m.created_at);
  if(!vanLid&&m.sender_id!==ME.user.id)meta=berNaam(m.sender_id)+" · "+meta;
  return rxRij(m,!vanLid,'<div data-notr class="bub '+(vanLid?"them":"me")+'">'+chatMediaTiles(m)+(m.body?esc(m.body):"")+'<div class="meta">'+meta+'</div></div>');
}
function berScroll(){const h=document.getElementById("ber-msgs");if(h)h.scrollTop=h.scrollHeight;}
async function berOpen(id){
  BER.cur=id;
  CHATBIJL.ber=[]; // ander gesprek = gekozen bijlagen weg
  const c=BER.clients.find(x=>x.id===id);
  const th=document.getElementById("ber-thread");if(th)th.innerHTML=berThreadHtml();
  const kl=document.getElementById("ber-klant");if(kl)kl.innerHTML=berKlantHtml();
  berKlantLaad();
  berScroll();
  if(typeof dashVidSrcs==="function")dashVidSrcs(); // kijk-URL's van foto's/video's vullen
  rxVernieuw(berMsgsVan(id).map(m=>m.id)); // emoji-reacties van deze draad erbij
  // gelezen-markering alleen door de eigen coach (RLS staat anderen niet toe)
  if(c&&c.coach_id===ME.user.id&&berOngelezen(id)){
    try{
      await db.from("messages").update({read_at:new Date().toISOString()}).eq("athlete_id",id).eq("sender_id",id).is("read_at",null);
      BER.msgs.forEach(m=>{if(m.athlete_id===id&&m.sender_id===id&&!m.read_at)m.read_at=new Date().toISOString();});
      if(typeof telMsgBadge==="function")telMsgBadge(); // teller op de Berichten-knop bijwerken
    }catch(e){}
  }
  // Bel-notificatie van dit gesprek gaat ook op gelezen
  if(typeof belMarkeerSoort==="function")belMarkeerSoort(id,"bericht");
  berLijstVernieuw();
}
async function berStuur(){
  const inp=document.getElementById("ber-inp");if(!inp)return;
  const tekst=(inp.value||"").trim();
  if((!tekst&&!CHATBIJL.ber.length)||!BER.cur)return;
  const knop=document.getElementById("ber-verstuur");
  if(knop&&knop.disabled)return; // niet dubbel versturen tijdens een upload
  let media=[];
  if(CHATBIJL.ber.length){
    if(knop){knop.disabled=true;knop.textContent="Uploaden…";}
    try{media=await chatUpload("ber",BER.cur);}
    catch(e){toast(e.message||"Upload mislukt");if(knop){knop.disabled=false;knop.textContent="Versturen";}return;}
  }
  const{data,error}=await db.from("messages").insert({company_id:ME.profile.company_id,athlete_id:BER.cur,sender_id:ME.user.id,body:tekst,media}).select().single();
  if(knop){knop.disabled=false;knop.textContent="Versturen";}
  if(error){
    if(media.length)try{db.storage.from("media").remove(media.map(x=>x.path));}catch(e){}
    toast(error.message||"Versturen mislukt");return;
  }
  inp.value="";chatGroei(inp);CHATBIJL.ber=[];chatBijlToon("ber");
  BER.msgs.push(data||{athlete_id:BER.cur,sender_id:ME.user.id,body:tekst,media,created_at:new Date().toISOString()});
  berAppend(BER.msgs[BER.msgs.length-1]);
  berLijstVernieuw();
}
function berAppend(m){
  const host=document.getElementById("ber-msgs");if(!host)return;
  const leeg=host.querySelector(".muted");if(leeg)leeg.remove();
  const c=BER.clients.find(x=>x.id===m.athlete_id);if(!c)return;
  host.insertAdjacentHTML("beforeend",berBubHtml(m,c));
  if(typeof dashVidSrcs==="function")dashVidSrcs();
  host.scrollTop=host.scrollHeight;
}
// Realtime: nieuw bericht komt direct binnen in de lijst en de open draad.
function berRealtime(){
  try{
    if(BER.kanaal){db.removeChannel(BER.kanaal);BER.kanaal=null;}
    BER.kanaal=db.channel("berichten-sectie-"+Date.now())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
        const m=payload.new;if(!m)return;
        if(BER.msgs.some(x=>x.id===m.id))return; // zelf net verstuurd, staat er al
        if(m.sender_id===ME.user.id)berGeplandLaad(); // een gepland bericht is de deur uit: lijstje bijwerken
        BER.msgs.push(m);
        if(!document.getElementById("ber-lijst"))return; // sectie niet meer in beeld
        if(BER.cur===m.athlete_id)berAppend(m);
        berLijstVernieuw();
      })
      // Emoji-reacties van de ander live in de open draad
      .on("postgres_changes",{event:"*",schema:"public",table:"message_reactions"},payload=>{
        const r=payload.new||payload.old;if(!r||!document.getElementById("ber-msgs"))return;
        if(BER.cur===r.athlete_id)rxVernieuw(rxIdsVan(r.athlete_id));
      })
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_group_messages"},payload=>{
        const m=payload.new;if(!m||m.sender_id===ME.user.id)return;
        BER.gmsgs.push(m);
        if(!document.getElementById("ber-lijst"))return;
        if(BER.cur==="g:"+m.group_id){
          const host=document.getElementById("ber-msgs");
          if(host){const leeg=host.querySelector(".muted");if(leeg)leeg.remove();host.insertAdjacentHTML("beforeend",berGroepBubHtml(m));host.scrollTop=host.scrollHeight;}
          berGroepGelezen(m.group_id);
        }
        berLijstVernieuw();
      }).subscribe();
  }catch(e){}
}
// ---------- Groepschats ----------
function berGroepBubHtml(m){
  const mij=m.sender_id===ME.user.id;
  const meta=(mij?"":berNaamAlg(m.sender_id)+" · ")+tijdNL(m.created_at);
  return '<div data-notr class="bub '+(mij?"me":"them")+'">'+esc(m.body)+'<div class="meta">'+meta+'</div></div>';
}
function berGroepThreadHtml(gid){
  const g=berGroep(gid);
  if(!g)return '<div class="cempty" style="margin:auto">Kies links een gesprek.</div>';
  const leden=berGroepLeden(gid);
  const ms=berGroepMsgs(gid);
  const beheer=g.created_by===ME.user.id||myRole()!=="coach";
  return '<div class="th"><div class="cavc" style="width:34px;height:34px;font-size:13px;flex:none;background:#2a2e35;color:#fff">👥</div>'+
      '<div style="min-width:0"><b>'+esc(g.name)+(g.announce_only?' 📢':'')+'</b><div class="sm muted">'+leden.length+' le'+(leden.length===1?"id":"den")+(g.announce_only?' · alleen coaches sturen':'')+'</div></div>'+
      (beheer?'<span style="margin-left:auto;display:flex;gap:8px"><button class="btn ghost sm" onclick="berGroepLedenBeheer(\''+gid+'\')">Leden</button><button class="btn ghost sm" onclick="berGroepWeg(\''+gid+'\')" title="Groep verwijderen"><svg class="i sm-i"><use href="#i-trash"/></svg></button></span>':'')+
    '</div>'+
    '<div class="msgs" id="ber-msgs">'+(ms.map(m=>berGroepBubHtml(m)).join("")||'<div class="sm muted" style="text-align:center;padding:14px">Nog geen berichten in deze groep.</div>')+'</div>'+
    '<div class="inputbar"><textarea id="ber-inp" rows="1" placeholder="Bericht aan de groep…" title="Enter = versturen, Shift+Enter = nieuwe regel" onkeydown="return chatToets(event,berGroepStuur)" oninput="chatGroei(this)"></textarea><button class="btn sm2" onclick="berGroepStuur()">Versturen</button></div>';
}
async function berOpenGroep(gid){
  BER.cur="g:"+gid;
  const th=document.getElementById("ber-thread");if(th)th.innerHTML=berGroepThreadHtml(gid);
  berScroll();
  await berGroepGelezen(gid);
  berLijstVernieuw();
}
// Eigen gelezen-markering (alleen als ik lid van de groep ben).
async function berGroepGelezen(gid){
  const eigen=BER.leden.find(m=>m.group_id===gid&&m.profile_id===ME.user.id);
  if(!eigen)return;
  try{
    const nu=new Date().toISOString();
    await db.from("chat_group_members").update({last_read_at:nu}).eq("id",eigen.id);
    eigen.last_read_at=nu;
    if(typeof telMsgBadge==="function")telMsgBadge(); // topnav-bolletje bijwerken
  }catch(e){}
}
async function berGroepStuur(){
  const inp=document.getElementById("ber-inp");if(!inp)return;
  const tekst=(inp.value||"").trim();
  const gid=String(BER.cur||"").slice(2);
  if(!tekst||!gid)return;
  const{data,error}=await db.from("chat_group_messages").insert({group_id:gid,company_id:ME.profile.company_id,sender_id:ME.user.id,body:tekst}).select().single();
  if(error){toast(error.message||"Versturen mislukt");return;}
  inp.value="";chatGroei(inp);
  BER.gmsgs.push(data);
  const host=document.getElementById("ber-msgs");
  if(host){const leeg=host.querySelector(".muted");if(leeg)leeg.remove();host.insertAdjacentHTML("beforeend",berGroepBubHtml(data));host.scrollTop=host.scrollHeight;}
  berLijstVernieuw();
}
// Nieuwe groep of leden beheren: zelfde venster (naam + aankondiging alleen bij nieuw).
let bgmGid=null; // null = nieuwe groep, anders leden beheren van deze groep
function berGroepNieuw(){bgmGid=null;berGroepModal();}
function berGroepLedenBeheer(gid){bgmGid=gid;berGroepModal();}
function berGroepModal(){
  let m=document.getElementById("bgmodal");if(m)m.remove();
  const bestaand=bgmGid?berGroepLeden(bgmGid).map(x=>x.profile_id):[];
  const g=bgmGid?berGroep(bgmGid):null;
  const chips=[["een","Alle 1-op-1 klanten"],["blog","Alle blog-leden"],["coaches","Alle coaches"]].concat(BER.programs.map(p=>["p:"+p.id,"Blog: "+p.name]));
  const wrap=document.createElement("div");
  wrap.innerHTML='<div class="lmodal" id="bgmodal" style="z-index:430"><div class="box" style="width:520px;max-width:96vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:4px"><h3 style="margin:0">'+(bgmGid?'Leden beheren · '+esc(g?g.name:""):'Nieuwe groepschat')+'</h3>'+
    '<span onclick="document.getElementById(\'bgmodal\').remove()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    (bgmGid?'':'<div class="field"><label>Naam van de groep</label><input id="bg-naam" placeholder="Bijv. Wedstrijdteam, Blog-leden, Zomer-challenge…"></div>'+
      '<label class="pf-toggle" style="margin:4px 0 12px"><input type="checkbox" id="bg-announce"><span class="pf-sw"></span> Alleen coaches kunnen sturen (aankondigingen)</label>')+
    '<div class="sm muted" style="margin-bottom:6px">Snel selecteren:</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'+chips.map(c=>'<button class="btn ghost sm" onclick="berGroepSnel(\''+c[0]+'\')">'+esc(c[1])+'</button>').join("")+'<button class="btn ghost sm" onclick="berGroepSnel(\'geen\')">Alles wissen</button></div>'+
    '<input class="lid-in" style="width:100%;margin-bottom:8px" placeholder="Zoek een klant…" oninput="berGroepZoekF(this.value)">'+
    '<div id="bg-lijst" style="max-height:300px;overflow:auto;border:1px solid #eef0f3;border-radius:10px;padding:6px">'+berGroepKiesHtml("",bestaand)+'</div>'+
    '<div class="msg" id="bg-msg"></div>'+
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" onclick="berGroepOpslaan()">'+(bgmGid?'Leden opslaan':'Groep aanmaken')+'</button><button class="btn ghost" onclick="document.getElementById(\'bgmodal\').remove()">Annuleren</button></div>'+
    '</div></div>';
  document.body.appendChild(wrap.firstChild);
  document.getElementById("bgmodal").classList.add("show");
  document.getElementById("bgmodal").addEventListener("click",e=>{if(e.target.id==="bgmodal")e.target.remove();});
}
function berGroepKiesHtml(zoek,aangevinkt){
  // Coaches (staf, zonder jezelf: de maker is altijd al lid) boven de klanten.
  let sts=BER.coaches.filter(c=>c.id!==ME.user.id);
  let cs=BER.clients;
  if(zoek){sts=sts.filter(c=>naamVan(c).toLowerCase().includes(zoek));cs=cs.filter(c=>naamVan(c).toLowerCase().includes(zoek));}
  if(!sts.length&&!cs.length)return '<div class="cempty">Niemand gevonden.</div>';
  const rij=(c,rol,extra)=>'<label style="display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:13px" onmouseover="this.style.background=\'#f4f6f8\'" onmouseout="this.style.background=\'\'">'+
    '<input type="checkbox" class="bg-lid" value="'+c.id+'" style="width:auto;margin:0" '+extra+(aangevinkt.includes(c.id)?" checked":"")+'>'+
    '<span class="cavc" style="width:26px;height:26px;font-size:9px;flex:none;'+avFotoStyle(c)+'">'+avFotoText(c)+'</span>'+naamVan(c)+
    '<span class="sm muted" style="margin-left:auto">'+rol+'</span></label>';
  const kop=t=>'<div class="sm muted" style="padding:4px 8px;font-weight:600">'+t+'</div>';
  const stafHtml=sts.map(c=>rij(c,c.role==="coach"?"coach":c.role==="eigenaar"?"eigenaar":"admin",'data-rol="staf" ')).join("");
  const klantHtml=cs.map(c=>rij(c,c.membership_type==="free_blog"?"blog":"1-op-1",'data-mt="'+esc(c.membership_type||"")+'" data-bp="'+esc(((BER.progVan||{})[c.id]||[]).join(","))+'" ')).join("");
  return (stafHtml?kop("Coaches")+stafHtml:"")+(klantHtml?(stafHtml?kop("Klanten"):"")+klantHtml:"");
}
function berGroepZoekF(v){
  const aangevinkt=[...document.querySelectorAll(".bg-lid:checked")].map(x=>x.value);
  const host=document.getElementById("bg-lijst");
  if(host)host.innerHTML=berGroepKiesHtml((v||"").toLowerCase().trim(),aangevinkt);
}
function berGroepSnel(wat){
  document.querySelectorAll(".bg-lid").forEach(cb=>{
    if(wat==="geen")cb.checked=false;
    else if(wat==="een"&&cb.dataset.mt==="one_on_one")cb.checked=true;
    else if(wat==="blog"&&cb.dataset.mt==="free_blog")cb.checked=true;
    else if(wat==="coaches"&&cb.dataset.rol==="staf")cb.checked=true;
    else if(wat.indexOf("p:")===0&&(cb.dataset.bp||"").split(",").includes(wat.slice(2)))cb.checked=true;
  });
}
async function berGroepOpslaan(){
  const msg=document.getElementById("bg-msg");
  const gekozen=[...document.querySelectorAll(".bg-lid:checked")].map(x=>x.value);
  if(bgmGid){
    // Leden beheren: verschil wegschrijven (toevoegen + verwijderen)
    const huidig=berGroepLeden(bgmGid).filter(m=>m.profile_id!==ME.user.id).map(m=>m.profile_id);
    const erbij=gekozen.filter(id=>!huidig.includes(id));
    const eraf=huidig.filter(id=>!gekozen.includes(id));
    if(erbij.length){
      const{error}=await db.from("chat_group_members").insert(erbij.map(id=>({group_id:bgmGid,profile_id:id,company_id:ME.profile.company_id,added_by:ME.user.id})));
      if(error){if(msg)msg.textContent=error.message||"Toevoegen mislukt";return;}
    }
    if(eraf.length){
      const{error}=await db.from("chat_group_members").delete().eq("group_id",bgmGid).in("profile_id",eraf);
      if(error){if(msg)msg.textContent=error.message||"Verwijderen mislukt";return;}
    }
    toast("Leden bijgewerkt");
  }else{
    const naam=(document.getElementById("bg-naam").value||"").trim();
    if(!naam){if(msg)msg.textContent="Geef de groep een naam.";return;}
    if(!gekozen.length){if(msg)msg.textContent="Kies minstens één lid.";return;}
    const announce=document.getElementById("bg-announce").checked;
    const{data:g,error}=await db.from("chat_groups").insert({company_id:ME.profile.company_id,name:naam,announce_only:announce,created_by:ME.user.id}).select().single();
    if(error){if(msg)msg.textContent=error.message||"Aanmaken mislukt";return;}
    // Maker zelf ook lid (voor gelezen-markering en zichtbaarheid in de app)
    const rows=gekozen.concat([ME.user.id]).map(id=>({group_id:g.id,profile_id:id,company_id:ME.profile.company_id,added_by:ME.user.id}));
    const{error:mErr}=await db.from("chat_group_members").insert(rows);
    if(mErr){if(msg)msg.textContent=mErr.message||"Leden toevoegen mislukt";return;}
    BER.cur="g:"+g.id;
    toast("Groep aangemaakt");
  }
  const modal=document.getElementById("bgmodal");if(modal)modal.remove();
  await fillBerichten();
}
async function berGroepWeg(gid){
  const g=berGroep(gid);if(!g)return;
  if(!confirm('Groep "'+g.name+'" verwijderen? Alle groepsberichten gaan mee weg.'))return;
  const{error}=await db.from("chat_groups").delete().eq("id",gid);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  if(BER.cur==="g:"+gid)BER.cur=null;
  toast("Groep verwijderd");
  await fillBerichten();
}

// ---------- Klantpaneel naast het gesprek (naar CoachRx, 28 okt 2026) ----------
// Compliance, streak, volgende workout, doelen en programma's in beeld terwijl
// je typt. Cijfers worden per klant kort gecachet (2 minuten).
function berKlantHtml(){
  const cur=String(BER.cur||"");
  if(!cur||cur.indexOf("g:")===0)return "";
  const c=BER.clients.find(x=>x.id===cur);if(!c)return "";
  const coach=BER.coaches.find(x=>x.id===c.coach_id);
  const lid=c.membership_type==="one_on_one"?"1-op-1 klant":(c.membership_type==="free_blog"?"Blog-lid":"Lid");
  const progs=(BER.progVan&&BER.progVan[c.id]||[]).map(pid=>(BER.programs.find(p=>p.id===pid)||{}).name).filter(Boolean);
  return '<div class="ck-kop"><div class="cavc" style="width:40px;height:40px;font-size:12px;flex:none;'+avFotoStyle(c)+'">'+avFotoText(c)+'</div>'+
      '<div style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+naamVan(c)+'</b><div class="sm muted">'+esc(lid)+(coach?' · coach '+esc(coach.first_name||naamVan(coach)):'')+'</div></div></div>'+
    '<div id="ck-stats" class="ck-stats"><div class="sm muted">Cijfers laden…</div></div>'+
    '<div class="ck-sectie"><div class="ck-lbl">Doelen</div><div id="ck-doelen" class="sm muted">…</div></div>'+
    '<div class="ck-sectie"><div class="ck-lbl">Prioriteiten</div><div id="ck-prio" class="sm muted">…</div></div>'+
    '<div class="ck-sectie"><div class="ck-lbl">Gezondheid</div><div id="ck-gez" class="ck-stats sm">…</div></div>'+
    (progs.length?'<div class="ck-sectie"><div class="ck-lbl">Programma\'s</div><div class="ck-chips">'+progs.map(n=>'<span class="ck-chip">'+esc(n)+'</span>').join("")+'</div></div>':'')+
    '<button class="btn ghost sm" style="margin-top:auto" onclick="openClient(\''+esc(c.id)+'\')">Programma openen</button>';
}
async function berKlantLaad(){
  const cur=String(BER.cur||"");
  if(!cur||cur.indexOf("g:")===0||!document.getElementById("ck-stats"))return;
  let st=BER.klantCache[cur];
  if(!st||Date.now()-st.t>120000){
    const[wq,rq,ciq,cpq,hq]=await Promise.all([
      db.from("workouts").select("id,workout_date,title").eq("client_id",cur),
      db.from("results").select("workout_id,status").eq("athlete_id",cur),
      db.from("client_info").select("data").eq("athlete_id",cur).limit(1),
      db.from("client_private").select("data").eq("athlete_id",cur).limit(1),
      db.from("health_daily").select("day,steps,sleep_minutes,resting_hr").eq("athlete_id",cur).gte("day",ymd(addDays(new Date(),-6)))
    ]);
    const ws=(wq.data||[]).filter(w=>!/^rest ?day$/i.test((w.title||"").trim()));
    const done=new Set((rq.data||[]).filter(r=>r.status==="completed").map(r=>r.workout_id));
    const td=todayStr(),van=ymd(addDays(new Date(),-29));
    const gepl=ws.filter(w=>w.workout_date>=van&&w.workout_date<=td);
    const gedaan=gepl.filter(w=>done.has(w.id)).length;
    const weekSet=new Set(ws.filter(w=>done.has(w.id)).map(w=>ymd(mondayOf(new Date(w.workout_date+"T00:00:00")))));
    let wk=mondayOf(new Date()),streak=0;if(!weekSet.has(ymd(wk)))wk=addDays(wk,-7);while(weekSet.has(ymd(wk))){streak++;wk=addDays(wk,-7);}
    const open=ws.filter(w=>w.workout_date>=td&&!done.has(w.id)).sort((a,b)=>a.workout_date.localeCompare(b.workout_date))[0]||null;
    const laatst=ws.filter(w=>done.has(w.id)).map(w=>w.workout_date).sort().pop()||null;
    const ci=(ciq.data&&ciq.data[0]&&ciq.data[0].data)||{};
    const cp=(cpq.data&&cpq.data[0]&&cpq.data[0].data)||{};
    st={t:Date.now(),pct:gepl.length?Math.round(gedaan/gepl.length*100):null,gepl:gepl.length,gedaan,streak,open,laatst,sessies:ws.filter(w=>done.has(w.id)).length,
      doelen:(ci.goals&&Array.isArray(ci.goals.sel))?ci.goals.sel:[],doelenAnders:(ci.goals&&ci.goals.other)||"",prio:Array.isArray(cp.prio)?cp.prio:[],
      gez:(()=>{const h=hq.data||[];if(!h.length)return null;const gem=k=>{const v=h.map(r=>r[k]).filter(x=>x!=null);return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null;};return{steps:gem("steps"),slaap:gem("sleep_minutes"),hr:gem("resting_hr")};})()};
    BER.klantCache[cur]=st;
  }
  if(String(BER.cur||"")!==cur)return; // intussen ander gesprek
  const el=id=>document.getElementById(id);
  const dagLbl=d=>{if(!d)return "";if(d===todayStr())return "vandaag";const x=new Date(d+"T00:00:00");return DAGEN[(x.getDay()+6)%7].toLowerCase()+" "+x.getDate()+" "+MAANDKORT[x.getMonth()];};
  if(el("ck-stats"))el("ck-stats").innerHTML=
    '<div class="ck-rij"><span>Compliance 30 dagen</span><b'+(st.pct!=null&&st.pct<50?' style="color:#e5484d"':'')+'>'+(st.pct==null?"–":st.pct+"%")+'</b></div>'+
    '<div class="ck-rij"><span>Gedaan / gepland</span><b>'+st.gedaan+' / '+st.gepl+'</b></div>'+
    '<div class="ck-rij"><span>Streak</span><b>'+st.streak+(st.streak===1?" week":" weken")+'</b></div>'+
    '<div class="ck-rij"><span>Sessies totaal</span><b>'+st.sessies+'</b></div>'+
    '<div class="ck-rij"><span>Laatste workout</span><b>'+(st.laatst?esc(dagLbl(st.laatst)):"nog geen")+'</b></div>'+
    '<div class="ck-rij"><span>Volgende workout</span><b'+(st.open&&st.open.workout_date===todayStr()?' style="color:#e5484d"':'')+'>'+(st.open?esc(dagLbl(st.open.workout_date)):"niets gepland")+'</b></div>';
  if(el("ck-doelen"))el("ck-doelen").innerHTML=(st.doelen.length||st.doelenAnders)?'<div class="ck-chips">'+st.doelen.map(d=>'<span class="ck-chip">'+esc(d)+'</span>').join("")+'</div>'+(st.doelenAnders?'<div class="sm muted" style="margin-top:4px">'+esc(st.doelenAnders)+'</div>':''):'<span class="sm muted">Nog geen doelen</span>';
  if(el("ck-prio"))el("ck-prio").innerHTML=st.prio.length?'<div class="ck-chips">'+st.prio.map(d=>'<span class="ck-chip">'+esc(d)+'</span>').join("")+'</div>':'<span class="sm muted">Nog geen prioriteiten</span>';
  // Gezondheid (Apple Health / Health Connect), gemiddelden van de laatste 7 dagen
  if(el("ck-gez")){
    const g=st.gez;
    el("ck-gez").innerHTML=g?'<div class="ck-rij"><span>Stappen gem. 7d</span><b>'+(g.steps!=null?g.steps.toLocaleString("nl-NL"):"–")+'</b></div><div class="ck-rij"><span>Slaap gem. 7d</span><b>'+(g.slaap!=null?(Math.round(g.slaap/6)/10).toString().replace(".",",")+" u":"–")+'</b></div><div class="ck-rij"><span>Rust-HR gem. 7d</span><b>'+(g.hr!=null?g.hr:"–")+'</b></div>':'<span class="sm muted">Niet gekoppeld</span>';
  }
}

// ---------- Geplande berichten (naar CoachRx, 28 okt 2026) ----------
// De coach plant een bericht voor morgen 09:00, maandag 09:00 of een eigen
// tijd. Het staat in scheduled_messages; een cron-taak zet het op dat moment
// in messages, zodat push, mail en de bel gewoon meelopen. Tot die tijd staat
// het als "gepland" boven de invoerbalk en is het te annuleren.
async function berGeplandLaad(){
  try{const{data}=await db.from("scheduled_messages").select("*").is("sent_at",null).order("send_at");BER.gepland=data||[];}catch(e){BER.gepland=[];}
  const h=document.getElementById("ber-gepland");if(h&&BER.cur)h.innerHTML=berGeplandHtml(BER.cur);
}
function berGeplandHtml(aid){
  const lijst=BER.gepland.filter(g=>g.athlete_id===aid);
  if(!lijst.length)return "";
  return lijst.map(g=>'<div class="gepland-rij"><span class="gepland-tijd">⏱ '+esc(laterLabel(g.send_at))+'</span><span class="gepland-tekst">'+esc(g.body||(g.media&&g.media.length?"(bijlage)":""))+'</span><span class="x" title="Geplande verzending annuleren" onclick="berPlanWeg(\''+esc(g.id)+'\')">✕</span></div>').join("");
}
async function berPlanWeg(id){
  const{error}=await db.from("scheduled_messages").delete().eq("id",id);
  if(error){toast(error.message||"Annuleren mislukt");return;}
  BER.gepland=BER.gepland.filter(g=>g.id!==id);
  const h=document.getElementById("ber-gepland");if(h&&BER.cur)h.innerHTML=berGeplandHtml(BER.cur);
  toast("Geplande verzending geannuleerd");
}
// Tijdstippen: morgen 09:00, komende maandag 09:00 (vandaag maandag = volgende week), of eigen.
function laterTijd(wat,eigen){
  const d=new Date();d.setSeconds(0,0);
  if(wat==="morgen"){d.setDate(d.getDate()+1);d.setHours(9,0,0,0);return d;}
  if(wat==="maandag"){const k=(8-d.getDay())%7||7;d.setDate(d.getDate()+k);d.setHours(9,0,0,0);return d;}
  if(wat==="eigen"&&eigen){const e=new Date(eigen);return isNaN(e)?null:e;}
  return null;
}
function laterLabel(iso){
  const d=new Date(iso),td=new Date();
  const dag=d.toDateString()===td.toDateString()?"vandaag":(d.toDateString()===new Date(td.getTime()+86400000).toDateString()?"morgen":DAGEN[(d.getDay()+6)%7].toLowerCase()+" "+d.getDate()+" "+MAANDKORT[d.getMonth()]);
  return dag+" "+("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2);
}
// Het klokje: klein menu naast de verstuurknop (werkt in Berichten én in de chatpopup op het klant-scherm).
function laterMenu(btn,key){
  const wrap=btn.closest(".laterwrap");if(!wrap)return;
  const open=wrap.querySelector(".latermenu");
  if(open){open.remove();return;}
  document.querySelectorAll(".latermenu").forEach(m=>m.remove());
  const d=new Date();d.setDate(d.getDate()+1);d.setHours(9,0,0,0);
  const eigenStd=d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)+"T09:00";
  wrap.insertAdjacentHTML("beforeend",'<div class="latermenu" onclick="event.stopPropagation()">'+
    '<div class="lm-kop">Later versturen</div>'+
    '<button onclick="laterKies(\''+key+'\',\'morgen\')">Morgen 09:00</button>'+
    '<button onclick="laterKies(\''+key+'\',\'maandag\')">Maandag 09:00</button>'+
    '<div class="lm-eigen"><input type="datetime-local" class="lm-tijd" value="'+eigenStd+'"><button onclick="laterKies(\''+key+'\',\'eigen\')">Plannen</button></div>'+
    '</div>');
}
document.addEventListener("click",e=>{if(!e.target.closest(".laterwrap"))document.querySelectorAll(".latermenu").forEach(m=>m.remove());});
async function laterKies(key,wat){
  const wrap=document.querySelector(".laterwrap .latermenu");
  const eigen=wrap&&wrap.querySelector(".lm-tijd")?wrap.querySelector(".lm-tijd").value:"";
  const tijd=laterTijd(wat,eigen);
  if(!tijd){toast("Kies een datum en tijd");return;}
  if(tijd.getTime()<Date.now()+60000){toast("Dat tijdstip is al geweest; kies een moment in de toekomst");return;}
  const inp=document.getElementById(key==="ber"?"ber-inp":"chat-inp");if(!inp)return;
  const tekst=(inp.value||"").trim();
  const aid=key==="ber"?BER.cur:chatAthlete;
  const bijl=CHATBIJL[key]||[];
  if(!tekst&&!bijl.length){toast("Typ eerst een bericht");return;}
  if(!aid)return;
  let media=[];
  if(bijl.length){
    try{media=await chatUpload(key,aid);}catch(e){toast(e.message||"Upload mislukt");return;}
  }
  const{data,error}=await db.from("scheduled_messages").insert({company_id:ME.profile.company_id,athlete_id:aid,sender_id:ME.user.id,body:tekst,media:media.length?media:null,send_at:tijd.toISOString()}).select().single();
  if(error){toast(error.message||"Plannen mislukt");return;}
  document.querySelectorAll(".latermenu").forEach(m=>m.remove());
  inp.value="";chatGroei(inp);CHATBIJL[key]=[];chatBijlToon(key);
  if(data){BER.gepland.push(data);BER.gepland.sort((a,b)=>a.send_at.localeCompare(b.send_at));}
  const h=document.getElementById("ber-gepland");if(h&&BER.cur===aid)h.innerHTML=berGeplandHtml(aid);
  toast("Gepland voor "+laterLabel(tijd.toISOString()));
}
