// app/berichten.js — de Berichten-sectie (topnav): alle gesprekken op de
// messages-tabel, naar het ontwerp (gesprekkenlijst links, draad rechts).
// Een coach ziet alleen zijn eigen klanten (RLS dwingt dat ook af);
// eigenaar/platform_admin zien alle gesprekken en kunnen op coach filteren.
let BER={clients:[],coaches:[],msgs:[],cur:null,coachF:"",zoek:"",kanaal:null,
  groups:[],leden:[],gmsgs:[],programs:[]};

async function fillBerichten(){
  let q=db.from("profiles").select("id,first_name,last_name,email,avatar_url,coach_id,membership_type,blog_program_id").eq("role","lid").eq("archived",false);
  if(myRole()==="coach")q=q.eq("coach_id",ME.user.id);
  else if(ME.profile.company_id)q=q.eq("company_id",ME.profile.company_id);
  const{data:cs}=await q.order("first_name");
  BER.clients=cs||[];
  // Stafnamen via de veilige RPC (een coach mag collega-profielen niet direct
  // lezen); ook nodig om coaches aan een groepschat te kunnen toevoegen.
  const{data:co}=await db.rpc("company_coaches");
  BER.coaches=co||[];
  const{data:ms}=await db.from("messages").select("*").order("created_at");
  BER.msgs=ms||[];
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
    '</div>';
  berScroll();
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
  if(String(BER.cur||"").indexOf("g:")===0)return berGroepThreadHtml(String(BER.cur).slice(2));
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
  // Bel-notificatie van dit gesprek gaat ook op gelezen
  if(typeof belMarkeerSoort==="function")belMarkeerSoort(id,"bericht");
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
  return '<div class="bub '+(mij?"me":"them")+'">'+esc(m.body)+'<div class="meta">'+meta+'</div></div>';
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
    '<div class="inputbar"><input id="ber-inp" placeholder="Bericht aan de groep…" onkeydown="if(event.key===\'Enter\')berGroepStuur()"><button class="btn sm2" onclick="berGroepStuur()">Versturen</button></div>';
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
  inp.value="";
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
