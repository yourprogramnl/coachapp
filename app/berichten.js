// app/berichten.js — de Berichten-sectie (topnav): alle gesprekken op de
// messages-tabel, naar het ontwerp (gesprekkenlijst links, draad rechts).
// Een coach ziet alleen zijn eigen klanten (RLS dwingt dat ook af);
// eigenaar/platform_admin zien alle gesprekken en kunnen op coach filteren.
let BER={clients:[],coaches:[],msgs:[],cur:null,coachF:"",zoek:"",filter:"",kanaal:null,
  groups:[],leden:[],gmsgs:[],programs:[],gepland:[],klantCache:{},snel:[],pop:null,meer:null};

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
  // Alle bladzijden ophalen: de database kapt anders stil af bij 1000 berichten,
  // en dan zouden juist de nieuwste ontbreken.
  const{data:ms}=await alleRijen(()=>db.from("messages").select("*").order("created_at").order("id"));
  BER.msgs=ms||[];
  await berGeplandLaad();
  if(typeof berSnelLaad==="function")berSnelLaad(); // snelle antwoorden van deze coach (berichten-snel.js)
  // Groepschats: groepen + lidmaatschappen + berichten + blogprogramma's (voor de snelkeuzes)
  const[gq,lq,gm,pq,bm,np]=await Promise.all([
    db.from("chat_groups").select("*").order("created_at"),
    db.from("chat_group_members").select("*"),
    alleRijen(()=>db.from("chat_group_messages").select("*").order("created_at").order("id")),
    db.from("blog_programs").select("id,name").eq("hidden",false),
    db.from("blog_program_members").select("athlete_id,blog_program_id"),
    // Eigen voorkeuren vers (vastgezette gesprekken kunnen in een ander venster gewijzigd zijn)
    db.from("profiles").select("notify_prefs").eq("id",ME.user.id).limit(1),
  ]);
  if(np&&np.data&&np.data[0]&&ME.profile)ME.profile.notify_prefs=np.data[0].notify_prefs;
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
  BER.pop=null;
  const filterCoaches=BER.coaches.filter(c=>c.role!=="platform_admin");
  const filter=myRole()!=="coach"&&filterCoaches.length?
    '<select class="lid-in" style="padding:8px 10px" onchange="berCoachF(this.value)">'+
      '<option value="">Alle coaches</option>'+
      filterCoaches.map(c=>'<option value="'+c.id+'"'+(BER.coachF===c.id?" selected":"")+'>'+naamVan(c)+'</option>').join("")+
    '</select>':'';
  cp.innerHTML='<div class="hrow"><h1>Berichten</h1>'+filter+'<span style="margin-left:auto;display:flex;gap:8px">'+
      (inBerVenster()?'':'<button class="btn ghost sm" onclick="openBerVenster()" title="Berichten in een apart venster openen, handig op een tweede scherm">↗ Los venster</button>')+
      '<button class="btn ghost sm" onclick="berMeerNieuw()" title="Eén bericht dat bij elke gekozen klant in het eigen gesprek aankomt">Bericht aan meerdere</button>'+
      '<button class="btn ghost sm" onclick="berGroepNieuw()">+ Groepschat</button></span></div>'+
    '<div class="chatwrap">'+
      '<div class="chatlist"><div class="clh">Gesprekken</div>'+
        '<div class="berzoek"><input class="lid-in" style="width:100%" placeholder="Zoek op naam of in berichten…" value="'+esc(BER.zoekRuw||"")+'" oninput="berZoek(this.value)"></div>'+
        '<div class="berfilter" id="ber-filter">'+berFilterHtml()+'</div>'+
        '<div id="ber-lijst" style="max-height:560px;overflow:auto" onscroll="berMenuWeg()">'+berLijstHtml()+'</div></div>'+
      '<div class="thread" id="ber-thread" ondragover="berSleep(event,1)" ondragleave="berSleep(event,0)" ondrop="berLos(event)">'+berThreadHtml()+'</div>'+
      '<div class="chatklant" id="ber-klant">'+berKlantHtml()+'</div>'+
    '</div>';
  berInvoerKlaar(false); // een concept dat er nog stond terugzetten
  berScroll();
  berKlantLaad();
  chatBijlToon("ber"); // gekozen bijlage-chips terugzetten na een her-render
  if(typeof dashVidSrcs==="function")dashVidSrcs();
}
// Filterknoppen + lijst opnieuw tekenen (na zoeken, filteren, een nieuw bericht…).
function berLijstZet(){
  const f=document.getElementById("ber-filter");if(f)f.innerHTML=berFilterHtml();
  const h=document.getElementById("ber-lijst");if(h)h.innerHTML=berLijstHtml();
}
function berCoachF(v){BER.coachF=v;berLijstZet();}
function berZoek(v){BER.zoekRuw=v||"";BER.zoek=(v||"").toLowerCase().trim();berMenuWeg();berLijstZet();}
function berFilter(v){BER.filter=v;berMenuWeg();berLijstZet();}
function berLijstVernieuw(){
  berMenuWeg();
  berLijstZet();
  // De knop in de kop van het open gesprek volgt de stand (gelezen <-> ongelezen)
  const k=document.getElementById("ber-kopactie");if(k)k.innerHTML=berKopActieHtml(BER.cur);
}

// ---------- Tijd en datum zoals in WhatsApp (19 nov 2026) ----------
// In de lijst: vandaag = 14:02, daarna "Gisteren", de dag van de week, of de datum.
// In het gesprek: een datumregel per dag en in de bubbel alleen de tijd.
const BER_DAG=["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"];
const BER_MAAND=["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
const berEN=()=>typeof LANG!=="undefined"&&LANG==="en";
const berHM=iso=>{const d=new Date(iso);return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2);};
const berDagKey=iso=>{const d=new Date(iso);return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();};
function berDagenTerug(iso){
  const d=new Date(iso),n=new Date();
  return Math.round((new Date(n.getFullYear(),n.getMonth(),n.getDate())-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);
}
function berLijstTijdHtml(iso){
  if(!iso)return "";
  const n=berDagenTerug(iso),d=new Date(iso);
  if(n<=0)return '<span class="cr-tijd" data-notr>'+berHM(iso)+'</span>';
  if(n===1)return '<span class="cr-tijd">Gisteren</span>';
  let t;
  if(n<7)t=berEN()?d.toLocaleDateString("en-GB",{weekday:"short"}):BER_DAG[d.getDay()].slice(0,2);
  else{
    t=berEN()?d.toLocaleDateString("en-GB",{day:"numeric",month:"short"}):d.getDate()+" "+MAANDKORT[d.getMonth()];
    if(d.getFullYear()!==new Date().getFullYear())t+=" '"+String(d.getFullYear()).slice(2);
  }
  return '<span class="cr-tijd" data-notr>'+esc(t)+'</span>';
}
function berDagSepHtml(iso){
  const n=berDagenTerug(iso),d=new Date(iso);
  let t,notr=true;
  if(n<=0){t="Vandaag";notr=false;}
  else if(n===1){t="Gisteren";notr=false;}
  else{
    t=berEN()?d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}):BER_DAG[d.getDay()]+" "+d.getDate()+" "+BER_MAAND[d.getMonth()];
    if(d.getFullYear()!==new Date().getFullYear())t+=" "+d.getFullYear();
  }
  return '<div class="dagsep" data-dag="'+berDagKey(iso)+'"><span'+(notr?" data-notr":"")+'>'+esc(t)+'</span></div>';
}
// Berichten onder elkaar, met een datumregel zodra de dag wisselt.
function berDraadHtml(ms,bub){
  let dag="";
  return ms.map(m=>{const k=berDagKey(m.created_at),sep=k!==dag?berDagSepHtml(m.created_at):"";dag=k;return sep+bub(m);}).join("");
}
// Bij een nieuw bericht onderaan: eerst een datumregel als het de eerste van die dag is.
function berDagErbij(host,m){
  const seps=host.querySelectorAll(".dagsep"),laatste=seps[seps.length-1];
  if(!laatste||laatste.dataset.dag!==berDagKey(m.created_at))host.insertAdjacentHTML("beforeend",berDagSepHtml(m.created_at));
}
// Vinkjes bij een bericht van de coach-kant: één = verstuurd, twee = gelezen door het lid.
// read_at wordt door de app van het lid gezet zodra die het gesprek opent.
function berVinkHtml(m){
  const gelezen=!!m.read_at;
  let titel=berEN()?"Sent, not read yet":"Verstuurd, nog niet gelezen";
  if(gelezen){
    const d=new Date(m.read_at),n=berDagenTerug(m.read_at);
    const dag=n<=0?"":(berEN()?d.toLocaleDateString("en-GB",{day:"numeric",month:"short"}):d.getDate()+" "+MAANDKORT[d.getMonth()])+" ";
    titel=(berEN()?"Read ":"Gelezen ")+dag+berHM(m.read_at);
  }
  return '<span class="vink'+(gelezen?" gelezen":"")+'" data-notr title="'+esc(titel)+'"><svg viewBox="0 0 '+(gelezen?17:12)+' 11" width="'+(gelezen?15:10.5)+'" height="9.7">'+
    '<path d="M1 5.9l3.1 3.1L10.5 1.6"/>'+(gelezen?'<path d="M7.7 8.1l.9.9L15 1.6"/>':'')+'</svg></span>';
}

// ---------- Vastgezette gesprekken ----------
// De sleutels (klant-id of "g:"+groep-id) staan in de eigen voorkeuren
// (profiles.notify_prefs.ber_vast), dus ze gelden op elk apparaat van de coach.
function berVast(){const p=(ME.profile&&ME.profile.notify_prefs)||{};return Array.isArray(p.ber_vast)?p.ber_vast:[];}
async function berVastWissel(key){
  berMenuWeg();
  // Eerst de verse stand ophalen, zodat een wijziging uit een ander venster blijft staan
  try{const{data}=await db.from("profiles").select("notify_prefs").eq("id",ME.user.id).limit(1);if(data&&data[0])ME.profile.notify_prefs=data[0].notify_prefs;}catch(e){}
  const nu=berVast(),aan=!nu.includes(key);
  const fout=await notifPrefsBewaar({ber_vast:aan?nu.concat([key]):nu.filter(k=>k!==key)});
  if(fout){toast("Vastzetten is niet gelukt");return;}
  berLijstVernieuw();
  toast(aan?"Gesprek staat vast bovenaan":"Gesprek staat niet meer vast");
}

// ---------- Concepten ----------
// Wat je typt blijft per gesprek bewaard (in deze browser), ook als je naar een
// ander gesprek klikt of de pagina ververst. In de lijst staat dan "Concept: …".
const berConceptSleutel=()=>"yp_ber_concept_"+ME.user.id;
function berConcepten(){try{return JSON.parse(localStorage.getItem(berConceptSleutel()))||{};}catch(e){return {};}}
function berConcept(key){return key?(berConcepten()[key]||""):"";}
function berConceptZet(key,tekst){
  if(!key)return;
  const c=berConcepten();tekst=String(tekst||"");
  if(tekst.trim())c[key]=tekst;else delete c[key];
  try{localStorage.setItem(berConceptSleutel(),JSON.stringify(c));}catch(e){}
}
function berTyp(ta){chatGroei(ta);berConceptZet(BER.cur,ta.value);if(typeof berSlash==="function")berSlash(ta);}
// Tekstvak van het open gesprek klaarzetten: concept terug, hoogte goed, cursor erin.
function berInvoerKlaar(focus){
  const inp=document.getElementById("ber-inp");if(!inp)return;
  const c=berConcept(BER.cur);
  if(c&&!inp.value)inp.value=c;
  chatGroei(inp);
  if(focus){try{inp.focus({preventScroll:true});inp.setSelectionRange(inp.value.length,inp.value.length);}catch(e){}}
}

// ---------- Plakken en slepen ----------
// Screenshot plakken met Ctrl+V of een foto/video in het gesprek slepen = bijlage erbij.
const BER_GEEN_GROEPSMEDIA="In een groepschat kunnen nog geen foto's of video's mee";
function berPlak(ev){
  const cd=ev.clipboardData;
  if(berIsGroep(BER.cur)){
    if(cd&&cd.files&&cd.files.length&&!(cd.getData("text/plain")||"").trim()){ev.preventDefault();toast(BER_GEEN_GROEPSMEDIA);}
    return;
  }
  chatPlak(ev,"ber");
}
function berSleep(ev,aan){
  if(!ev.dataTransfer||![...ev.dataTransfer.types].includes("Files"))return;
  ev.preventDefault();
  const th=document.getElementById("ber-thread");if(!th)return;
  if(!aan&&ev.relatedTarget&&th.contains(ev.relatedTarget))return; // nog binnen het vak
  th.classList.toggle("sleep",!!aan&&!!BER.cur&&!berIsGroep(BER.cur));
}
function berLos(ev){
  if(!ev.dataTransfer||!ev.dataTransfer.files||!ev.dataTransfer.files.length)return;
  ev.preventDefault();
  const th=document.getElementById("ber-thread");if(th)th.classList.remove("sleep");
  if(!BER.cur){toast("Kies eerst een gesprek");return;}
  if(berIsGroep(BER.cur)){toast(BER_GEEN_GROEPSMEDIA);return;}
  chatBijlErbij("ber",[...ev.dataTransfer.files]);
  const inp=document.getElementById("ber-inp");if(inp)inp.focus();
}

// ---------- Gesprekkenlijst ----------
// Eén rij per gesprek (groep of klant) met het laatste bericht en het aantal ongelezen.
function berLijstItems(zonderZoek){
  const z=zonderZoek?"":BER.zoek;
  let gs=BER.groups;
  if(z)gs=gs.filter(g=>(g.name||"").toLowerCase().includes(z));
  let cs=BER.clients;
  if(BER.coachF)cs=cs.filter(c=>c.coach_id===BER.coachF);
  if(z)cs=cs.filter(c=>naamVan(c).toLowerCase().includes(z));
  // In één keer per klant het laatste bericht en het aantal ongelezen (van het lid zelf)
  const per={};
  BER.msgs.forEach(m=>{const p=per[m.athlete_id]||(per[m.athlete_id]={m:null,n:0});p.m=m;if(m.sender_id===m.athlete_id&&!m.read_at)p.n++;});
  return gs.map(g=>{
    const ms=berGroepMsgs(g.id),m=ms[ms.length-1]||null;
    return {key:"g:"+g.id,groep:g,m,laatst:m?m.created_at:g.created_at,n:berGroepOngelezen(g.id)};
  }).concat(cs.map(c=>{
    const p=per[c.id]||{m:null,n:0};
    // Geen rode teller bij klanten van coaches waarvan je de meldingen uit hebt
    // gezet (Instellingen > Notificaties); het gesprek zelf blijft gewoon staan.
    const n=(typeof coachIsGedempt==="function"&&coachIsGedempt(c.coach_id))?0:p.n;
    return {key:c.id,klant:c,m:p.m,laatst:p.m?p.m.created_at:"",n};
  }));
}
function berFilterHtml(){
  const n=berLijstItems(true).filter(it=>it.n).length;
  return '<button class="bf'+(BER.filter?"":" on")+'" onclick="berFilter(\'\')">Alle</button>'+
    '<button class="bf'+(BER.filter==="ongelezen"?" on":"")+'" onclick="berFilter(\'ongelezen\')" title="Alleen gesprekken met een ongelezen bericht">Ongelezen'+(n?' <span class="bf-n" data-notr>'+n+'</span>':'')+'</button>';
}
function berAvatarHtml(it){
  return it.groep
    ?'<div class="cavc" style="width:36px;height:36px;font-size:14px;flex:none;background:#2a2e35;color:#fff">👥</div>'
    :'<div class="cavc" style="width:36px;height:36px;font-size:11.5px;flex:none;'+avFotoStyle(it.klant)+'">'+avFotoText(it.klant)+'</div>';
}
const berItemNaam=it=>it.groep?esc(it.groep.name)+(it.groep.announce_only?' 📢':''):naamVan(it.klant);
function berRijHtml(it,vast){
  const k=it.key,m=it.m;
  const concept=k!==BER.cur?berConcept(k):"";
  let prev;
  if(concept)prev='<span class="concept">Concept:</span> <span data-notr>'+esc(concept)+'</span>';
  else if(!m)prev="Nog geen berichten";
  else if(it.groep)prev=esc(berNaamAlg(m.sender_id)+": "+(m.body||""));
  else prev=(m.sender_id===k?"":berVinkHtml(m))+esc((m.sender_id===ME.user.id?"Jij: ":"")+chatPreview(m));
  return '<div class="chatrow'+(BER.cur===k?" on":"")+(it.n?" nieuw":"")+'" onclick="'+(it.groep?"berOpenGroep('"+it.groep.id+"')":"berOpen('"+k+"')")+'">'+berAvatarHtml(it)+
    '<div class="cr-mid"><div class="cr-top"><b class="sm">'+berItemNaam(it)+'</b>'+(m?berLijstTijdHtml(m.created_at):"")+'</div>'+
      '<div class="cr-onder"><div class="prev">'+prev+'</div>'+(vast?'<span class="cr-pin" title="Vastgezet">📌</span>':'')+(it.n?'<span class="cpill bad">'+it.n+'</span>':'')+'</div></div>'+
    '<button class="kebab ber-kebab" title="Meer" onclick="berRijMenu(event,this,\''+k+'\')">⋮</button></div>';
}
// Zoeken in de tekst van berichten: de nieuwste treffers, met het gevonden stukje gemarkeerd.
function berKnipsel(body,z){
  const t=String(body).replace(/\s+/g," "),i=t.toLowerCase().indexOf(z);
  if(i<0)return esc(t.slice(0,90));
  const van=i>14?i-10:0; // kort stukje ervoor, zodat het gevonden woord in beeld blijft
  return (van?"…":"")+esc(t.slice(van,i))+'<mark>'+esc(t.slice(i,i+z.length))+'</mark>'+esc(t.slice(i+z.length,i+z.length+80));
}
function berZoekHitsHtml(){
  const z=BER.zoek;if(z.length<2)return "";
  const raak=m=>m.body&&m.body.toLowerCase().indexOf(z)>=0;
  const hits=BER.msgs.filter(raak).map(m=>({m,key:m.athlete_id})).concat(BER.gmsgs.filter(raak).map(m=>({m,key:"g:"+m.group_id})));
  hits.sort((a,b)=>String(b.m.created_at).localeCompare(String(a.m.created_at)));
  const uit=[];
  for(const h of hits){
    if(uit.length>=40)break;
    const g=berIsGroep(h.key)?berGroep(h.key.slice(2)):null;
    const c=g?null:BER.clients.find(x=>x.id===h.key);
    if(!g&&(!c||(BER.coachF&&c.coach_id!==BER.coachF)))continue;
    const it=g?{groep:g}:{klant:c},m=h.m;
    // In een groep de voornaam van de afzender erbij (kort, zodat het gevonden woord past)
    const afz=g?(BER.clients.find(x=>x.id===m.sender_id)||BER.coaches.find(x=>x.id===m.sender_id)):null;
    const wie=m.sender_id===ME.user.id?(berEN()?"You: ":"Jij: "):(afz&&afz.first_name?afz.first_name+": ":"");
    uit.push('<div class="chatrow hit" onclick="'+(g?"berOpenGroep('"+g.id+"','"+esc(m.id)+"')":"berOpen('"+c.id+"','"+esc(m.id)+"')")+'">'+berAvatarHtml(it)+
      '<div class="cr-mid"><div class="cr-top"><b class="sm">'+berItemNaam(it)+'</b>'+berLijstTijdHtml(m.created_at)+'</div>'+
      '<div class="cr-onder"><div class="prev" data-notr>'+esc(wie)+berKnipsel(m.body,z)+'</div></div></div></div>');
  }
  return uit.join("");
}
function berLijstHtml(){
  let items=berLijstItems();
  // Ongelezen-filter: het open gesprek blijft staan, ook als het net gelezen is
  if(BER.filter==="ongelezen")items=items.filter(it=>it.n||it.key===BER.cur);
  const hits=berZoekHitsHtml();
  if(!items.length&&!hits)return '<div class="cempty">'+(BER.filter==="ongelezen"&&!BER.zoek?"Geen ongelezen gesprekken. Je bent helemaal bij.":"Geen gesprekken gevonden.")+'</div>';
  // Vastgezet bovenaan, dan groepen, dan klanten; binnen elk blok het nieuwste bericht eerst
  // (klanten zonder berichten onderaan, op naam).
  const vast=berVast(),nieuwst=(a,b)=>(b.laatst||"").localeCompare(a.laatst||"");
  const vastI=items.filter(it=>vast.includes(it.key)).sort(nieuwst);
  const groepI=items.filter(it=>it.groep&&!vast.includes(it.key)).sort(nieuwst);
  const klantI=items.filter(it=>it.klant&&!vast.includes(it.key)).sort(nieuwst);
  let html="",eerste=true;
  const kop=t=>{const h='<div class="clh"'+(eerste?' style="border-top:none"':'')+'>'+t+'</div>';eerste=false;return h;};
  if(vastI.length)html+=kop("Vastgezet")+vastI.map(it=>berRijHtml(it,true)).join("");
  if(groepI.length)html+=kop("Groepen")+groepI.map(it=>berRijHtml(it,false)).join("");
  if(klantI.length)html+=(eerste?"":kop("Klanten"))+klantI.map(it=>berRijHtml(it,false)).join("");
  if(hits)html+=kop("Gevonden in berichten")+hits;
  return html;
}
const BER_LEEG_HTML='<div class="cempty" style="margin:auto">Kies links een gesprek.<div class="sm muted" style="margin-top:6px">Tip: plak een screenshot met Ctrl+V of sleep een foto of video in het gesprek.</div></div>';
function berThreadHtml(){
  if(String(BER.cur||"").indexOf("g:")===0)return berGroepThreadHtml(String(BER.cur).slice(2));
  const c=BER.clients.find(x=>x.id===BER.cur);
  if(!c)return BER_LEEG_HTML;
  const coach=BER.coaches.find(x=>x.id===c.coach_id);
  const ms=berMsgsVan(c.id);
  return '<div class="th"><div class="cavc" style="width:34px;height:34px;font-size:11px;flex:none;'+avFotoStyle(c)+'">'+avFotoText(c)+'</div>'+
      '<div style="min-width:0"><b>'+naamVan(c)+'</b>'+(myRole()!=="coach"&&coach?'<div class="sm muted">Coach: '+naamVan(coach)+'</div>':'')+'</div>'+
      '<span class="ber-kopactie" id="ber-kopactie">'+berKopActieHtml(c.id)+'</span></div>'+
    '<div class="msgs" id="ber-msgs">'+(berDraadHtml(ms,m=>berBubHtml(m,c))||'<div class="sm muted" style="text-align:center;padding:14px">Nog geen berichten. Stuur het eerste bericht.</div>')+'</div>'+
    '<div class="gepland" id="ber-gepland">'+berGeplandHtml(c.id)+'</div>'+
    '<div class="bijlrij" id="chat-bijl-ber" style="display:none;padding:6px 14px 0"></div>'+
    '<div class="berpop" id="ber-pop" style="display:none"></div>'+
    '<div class="inputbar"><button class="bijlknop" onclick="chatKies(\'ber\')" title="Foto of video meesturen">📎</button><button class="bijlknop berpopknop" onclick="berPopMenu(event)" title="Invoegen: snel antwoord, oefenvideo of training">＋</button><textarea id="ber-inp" rows="1" placeholder="'+esc(t("Typ een bericht…"))+'" title="'+esc(t("Enter = versturen, Shift+Enter = nieuwe regel"))+'" onkeydown="return berToets(event,berStuur)" oninput="berTyp(this)" onpaste="berPlak(event)"></textarea>'+
      '<span class="laterwrap"><button class="klokknop" title="Later versturen (morgen 09:00, maandag 09:00 of een eigen tijd)" onclick="laterMenu(this,\'ber\')">⏱</button></span>'+
      '<button class="btn sm2" id="ber-verstuur" onclick="berStuur()">Versturen</button></div>'+
    '<div class="sleeplaag">Laat los om mee te sturen</div>';
}
// Rechts = de coach-kant (alles wat niet van het lid komt), links = het lid.
// Leest een eigenaar/admin mee, dan staat de naam van de afzender erbij.
function berBubHtml(m,c){
  const vanLid=m.sender_id===c.id;
  let meta=berHM(m.created_at);
  if(!vanLid&&m.sender_id!==ME.user.id)meta=berNaam(m.sender_id)+" · "+meta;
  return rxRij(m,!vanLid,'<div data-notr class="bub '+(vanLid?"them":"me")+'">'+chatMediaTiles(m)+(m.body?chatTekst(m.body):"")+'<div class="meta"><span class="mt">'+meta+'</span>'+(vanLid?"":berVinkHtml(m))+'</div></div>');
}
// Naar één bericht in het open gesprek springen (vanuit de zoekresultaten) en het even laten oplichten.
function berNaarBericht(mid){
  const host=document.getElementById("ber-msgs");if(!host)return;
  const el=[...host.querySelectorAll("[data-mid]")].find(x=>x.dataset.mid===String(mid));
  if(!el){berScroll();return;}
  host.scrollTop+=el.getBoundingClientRect().top-host.getBoundingClientRect().top-host.clientHeight/2+el.offsetHeight/2;
  el.classList.add("flits");setTimeout(()=>el.classList.remove("flits"),2000);
}
function berScroll(){const h=document.getElementById("ber-msgs");if(h)h.scrollTop=h.scrollHeight;}
async function berOpen(id,mid){
  BER.cur=id;BER.pop=null;
  CHATBIJL.ber=[]; // ander gesprek = gekozen bijlagen weg
  const c=BER.clients.find(x=>x.id===id);
  const th=document.getElementById("ber-thread");if(th){th.classList.remove("sleep");th.innerHTML=berThreadHtml();}
  const kl=document.getElementById("ber-klant");if(kl)kl.innerHTML=berKlantHtml();
  berKlantLaad();
  berInvoerKlaar(true); // concept terug en meteen kunnen typen
  if(mid)berNaarBericht(mid);else berScroll();
  if(typeof dashVidSrcs==="function")dashVidSrcs(); // kijk-URL's van foto's/video's vullen
  rxVernieuw(berMsgsVan(id).map(m=>m.id)); // emoji-reacties van deze draad erbij
  // gelezen-markering alleen door de eigen coach (RLS staat anderen niet toe)
  if(c&&c.coach_id===ME.user.id&&berOngelezen(id))await berKlantGelezen(id);
  // Bel-notificatie van dit gesprek gaat ook op gelezen
  if(typeof belMarkeerSoort==="function")belMarkeerSoort(id,"bericht");
  berLijstVernieuw();
}
// Alle berichten van dit lid op gelezen zetten (alleen de eigen coach kan dat).
async function berKlantGelezen(id){
  try{
    await db.from("messages").update({read_at:new Date().toISOString()}).eq("athlete_id",id).eq("sender_id",id).is("read_at",null);
    BER.msgs.forEach(m=>{if(m.athlete_id===id&&m.sender_id===id&&!m.read_at)m.read_at=new Date().toISOString();});
    berBadgeBij(); // teller op de Berichten-knop bijwerken
  }catch(e){}
}
// ---------- Gesprek weer op ongelezen zetten (of op gelezen) ----------
// Geen eigen tabel of kolom, zelfde velden als de sporter-app:
// 1-op-1 = read_at van het laatste bericht van het lid weer leeg;
// groep  = eigen last_read_at terug tot 1 ms voor het laatste bericht van een ander.
// Een sleutel is het id van de klant, of "g:"+id voor een groep (zoals BER.cur).
const berIsGroep=key=>String(key||"").indexOf("g:")===0;
function berLaatsteVanLid(aid){const ms=BER.msgs.filter(m=>m.athlete_id===aid&&m.sender_id===aid&&m.id);return ms[ms.length-1]||null;}
function berLaatsteVanAnder(gid){const ms=berGroepMsgs(gid).filter(m=>m.sender_id!==ME.user.id);return ms[ms.length-1]||null;}
// Wat valt er te kiezen bij dit gesprek? "gelezen", "ongelezen", "niet-eigen"
// (alleen de eigen coach van het lid mag het wijzigen) of "" (niets te doen).
function berLeesActie(key){
  if(!key)return "";
  if(berIsGroep(key)){
    const gid=String(key).slice(2);
    if(!BER.leden.some(m=>m.group_id===gid&&m.profile_id===ME.user.id))return ""; // zelf geen lid: geen eigen leesstand
    if(berGroepOngelezen(gid))return "gelezen";
    return berLaatsteVanAnder(gid)?"ongelezen":"";
  }
  const c=BER.clients.find(x=>x.id===key);
  if(!c||c.id===ME.user.id||!berLaatsteVanLid(key))return "";
  if(c.coach_id!==ME.user.id)return "niet-eigen";
  return berOngelezen(key)?"gelezen":"ongelezen";
}
function berKopActieHtml(key){
  const a=berLeesActie(key);if(!a)return "";
  if(a==="niet-eigen")return '<button class="btn ghost sm" style="opacity:.55" onclick="berNietEigen(\''+key+'\')">'+(berOngelezen(key)?"Markeer als gelezen":"Markeer als ongelezen")+'</button>';
  return '<button class="btn ghost sm" onclick="'+(a==="gelezen"?"berZetGelezen":"berZetOngelezen")+'(\''+key+'\')">'+(a==="gelezen"?"Markeer als gelezen":"Markeer als ongelezen")+'</button>';
}
// Beheerder bij een klant van een andere coach: de database staat het niet toe; leg uit waarom.
function berNietEigen(key){
  const c=BER.clients.find(x=>x.id===key);
  const coach=c&&BER.coaches.find(x=>x.id===c.coach_id);
  toast(c&&!c.coach_id?"Dit lid heeft geen eigen coach, dus dit gesprek kan niet op gelezen of ongelezen gezet worden"
    :coach?"Alleen de eigen coach van dit lid ("+naamVan(coach)+") kan dit gesprek op gelezen of ongelezen zetten"
    :"Alleen de eigen coach van dit lid kan dit gesprek op gelezen of ongelezen zetten",4500);
}
// Bolletje op de Berichten-knop bijwerken. Vanuit het losse venster (geen eigen
// bovenbalk) krijgt het hoofdvenster een seintje, zodat het daar ook meteen klopt.
function berBadgeBij(){
  if(typeof telMsgBadge==="function")telMsgBadge();
  if(inBerVenster()&&berVensterKanaal){try{berVensterKanaal.postMessage({type:"msgbadge"});}catch(e){}}
}
function berMenuWeg(){document.querySelectorAll(".coachmenu.ber-menu").forEach(x=>x.remove());}
// ⋮ op een rij in de lijst. Het menu hangt aan de body (vaste positie), anders
// knipt de scrollende lijst het af bij de onderste rijen.
function berRijMenu(ev,btn,key){
  ev.stopPropagation();
  const bestond=document.querySelector('.coachmenu.ber-menu[data-voor="'+key+'"]');
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  if(bestond)return;
  const a=berLeesActie(key);
  const m=document.createElement("div");m.className="coachmenu ber-menu";m.dataset.voor=key;
  m.innerHTML=((a==="gelezen"||a==="ongelezen")?'<button onclick="event.stopPropagation();'+(a==="gelezen"?"berZetGelezen":"berZetOngelezen")+'(\''+key+'\')">'+(a==="gelezen"?"Markeer als gelezen":"Markeer als ongelezen")+'</button>':'')+
    '<button onclick="event.stopPropagation();berVastWissel(\''+key+'\')">'+(berVast().includes(key)?"Niet meer vastzetten":"Vastzetten bovenaan")+'</button>';
  document.body.appendChild(m);
  const r=btn.getBoundingClientRect();
  m.style.top=Math.min(r.bottom+4,window.innerHeight-m.offsetHeight-8)+"px";
  m.style.left=Math.max(8,Math.min(r.right-m.offsetWidth,window.innerWidth-m.offsetWidth-8))+"px";
}
window.addEventListener("scroll",berMenuWeg,{passive:true});
async function berZetOngelezen(key){
  berMenuWeg();
  if(berIsGroep(key)){
    const gid=String(key).slice(2);
    const eigen=BER.leden.find(m=>m.group_id===gid&&m.profile_id===ME.user.id);
    const m=berLaatsteVanAnder(gid);
    if(!eigen||!m)return;
    const tot=new Date(new Date(m.created_at).getTime()-1).toISOString();
    const{data,error}=await db.from("chat_group_members").update({last_read_at:tot}).eq("id",eigen.id).select("id");
    if(error||!(data&&data.length)){toast("Op ongelezen zetten is niet gelukt");return;}
    eigen.last_read_at=tot;
  }else{
    const m=berLaatsteVanLid(key);if(!m)return;
    const{data,error}=await db.from("messages").update({read_at:null}).eq("id",m.id).select("id");
    // Geen fout maar ook geen rij terug = de database liet het niet toe (niet de eigen coach)
    if(error||!(data&&data.length)){if(error)toast("Op ongelezen zetten is niet gelukt");else berNietEigen(key);return;}
    m.read_at=null;
  }
  // Het open gesprek sluiten, anders springt het bij de eerstvolgende klik weer op gelezen
  if(BER.cur===key)berSluitGesprek();
  berLijstVernieuw();
  berBadgeBij(); // bolletje in de bovenbalk telt meteen weer mee
  toast("Gesprek staat weer op ongelezen");
}
async function berZetGelezen(key){
  berMenuWeg();
  if(berIsGroep(key))await berGroepGelezen(String(key).slice(2));
  else{
    await berKlantGelezen(key);
    if(typeof belMarkeerSoort==="function")belMarkeerSoort(key,"bericht");
  }
  berLijstVernieuw();
}
function berSluitGesprek(){
  BER.cur=null;BER.pop=null;CHATBIJL.ber=[];
  const th=document.getElementById("ber-thread");if(th){th.classList.remove("sleep");th.innerHTML=berThreadHtml();}
  const kl=document.getElementById("ber-klant");if(kl)kl.innerHTML=berKlantHtml();
}
async function berStuur(){
  const inp=document.getElementById("ber-inp");if(!inp)return;
  const tekst=(inp.value||"").trim();
  if((!tekst&&!CHATBIJL.ber.length)||!BER.cur)return;
  const aid=BER.cur; // vasthouden: tijdens een upload kan er een ander gesprek geopend worden
  const knop=document.getElementById("ber-verstuur");
  if(knop&&knop.disabled)return; // niet dubbel versturen tijdens een upload
  let media=[];
  if(CHATBIJL.ber.length){
    if(knop){knop.disabled=true;knop.textContent="Uploaden…";}
    try{media=await chatUpload("ber",aid);}
    catch(e){toast(e.message||"Upload mislukt");if(knop){knop.disabled=false;knop.textContent="Versturen";}return;}
  }
  const{data,error}=await db.from("messages").insert({company_id:ME.profile.company_id,athlete_id:aid,sender_id:ME.user.id,body:tekst,media}).select().single();
  if(knop){knop.disabled=false;knop.textContent="Versturen";}
  if(error){
    if(media.length)try{db.storage.from("media").remove(media.map(x=>x.path));}catch(e){}
    toast(error.message||"Versturen mislukt");return;
  }
  berConceptZet(aid,"");
  if(BER.cur===aid){inp.value="";chatGroei(inp);CHATBIJL.ber=[];chatBijlToon("ber");}
  BER.msgs.push(data||{athlete_id:aid,sender_id:ME.user.id,body:tekst,media,created_at:new Date().toISOString()});
  if(BER.cur===aid)berAppend(BER.msgs[BER.msgs.length-1]);
  // Wie antwoordt heeft het gelezen: openstaande berichten van het lid gaan op gelezen
  const c=BER.clients.find(x=>x.id===aid);
  if(c&&c.coach_id===ME.user.id&&berOngelezen(aid)){await berKlantGelezen(aid);if(typeof belMarkeerSoort==="function")belMarkeerSoort(aid,"bericht");}
  berLijstVernieuw();
}
function berAppend(m){
  const host=document.getElementById("ber-msgs");if(!host)return;
  const leeg=host.querySelector(".muted");if(leeg)leeg.remove();
  const c=BER.clients.find(x=>x.id===m.athlete_id);if(!c)return;
  berDagErbij(host,m);
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
        if(BER.cur===m.athlete_id){
          berAppend(m);
          // Staat dit gesprek open en kijk je ernaar (venster actief), dan is het meteen gelezen
          const c=BER.clients.find(x=>x.id===m.athlete_id);
          if(m.sender_id===m.athlete_id&&c&&c.coach_id===ME.user.id&&document.visibilityState==="visible"&&document.hasFocus()){
            berKlantGelezen(m.athlete_id).then(()=>{if(typeof belMarkeerSoort==="function")belMarkeerSoort(m.athlete_id,"bericht");berLijstVernieuw();});
          }
        }
        berLijstVernieuw();
      })
      // Gelezen-stand live: het lid opent het gesprek in de app = de vinkjes springen op twee
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages"},payload=>{
        const n=payload.new;if(!n)return;
        const m=BER.msgs.find(x=>x.id===n.id);
        if(!m||!!m.read_at===!!n.read_at)return;
        m.read_at=n.read_at;
        if(!document.getElementById("ber-lijst"))return;
        document.querySelectorAll("#ber-msgs .wcrij").forEach(el=>{if(el.dataset.mid===String(m.id)){const v=el.querySelector(".vink");if(v)v.outerHTML=berVinkHtml(m);}});
        berLijstVernieuw();
        if(m.sender_id===m.athlete_id)berBadgeBij(); // alleen dan verandert de teller in de bovenbalk
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
          if(host){const leeg=host.querySelector(".muted");if(leeg)leeg.remove();berDagErbij(host,m);host.insertAdjacentHTML("beforeend",berGroepBubHtml(m));host.scrollTop=host.scrollHeight;}
          berGroepGelezen(m.group_id);
        }
        berLijstVernieuw();
      }).subscribe();
  }catch(e){}
}
// ---------- Groepschats ----------
function berGroepBubHtml(m){
  const mij=m.sender_id===ME.user.id;
  const meta=(mij?"":berNaamAlg(m.sender_id)+" · ")+berHM(m.created_at);
  return '<div data-notr class="bub '+(mij?"me":"them")+'" data-mid="'+esc(m.id)+'">'+chatTekst(m.body)+'<div class="meta"><span class="mt">'+meta+'</span></div></div>';
}
function berGroepThreadHtml(gid){
  const g=berGroep(gid);
  if(!g)return BER_LEEG_HTML;
  const leden=berGroepLeden(gid);
  const ms=berGroepMsgs(gid);
  const beheer=g.created_by===ME.user.id||myRole()!=="coach";
  return '<div class="th"><div class="cavc" style="width:34px;height:34px;font-size:13px;flex:none;background:#2a2e35;color:#fff">👥</div>'+
      '<div style="min-width:0"><b>'+esc(g.name)+(g.announce_only?' 📢':'')+'</b><div class="sm muted">'+leden.length+' le'+(leden.length===1?"id":"den")+(g.announce_only?' · alleen coaches sturen':'')+'</div></div>'+
      '<span style="margin-left:auto;display:flex;gap:8px;flex:none"><span class="ber-kopactie" id="ber-kopactie">'+berKopActieHtml("g:"+gid)+'</span>'+
      (beheer?'<button class="btn ghost sm" onclick="berGroepLedenBeheer(\''+gid+'\')">Leden</button><button class="btn ghost sm" onclick="berGroepWeg(\''+gid+'\')" title="Groep verwijderen"><svg class="i sm-i"><use href="#i-trash"/></svg></button>':'')+'</span>'+
    '</div>'+
    '<div class="msgs" id="ber-msgs">'+(berDraadHtml(ms,berGroepBubHtml)||'<div class="sm muted" style="text-align:center;padding:14px">Nog geen berichten in deze groep.</div>')+'</div>'+
    '<div class="berpop" id="ber-pop" style="display:none"></div>'+
    '<div class="inputbar"><button class="bijlknop berpopknop" onclick="berPopMenu(event)" title="Invoegen: snel antwoord of oefenvideo">＋</button><textarea id="ber-inp" rows="1" placeholder="'+esc(t("Bericht aan de groep…"))+'" title="'+esc(t("Enter = versturen, Shift+Enter = nieuwe regel"))+'" onkeydown="return berToets(event,berGroepStuur)" oninput="berTyp(this)" onpaste="berPlak(event)"></textarea><button class="btn sm2" onclick="berGroepStuur()">Versturen</button></div>';
}
async function berOpenGroep(gid,mid){
  BER.cur="g:"+gid;BER.pop=null;
  CHATBIJL.ber=[];
  const th=document.getElementById("ber-thread");if(th){th.classList.remove("sleep");th.innerHTML=berGroepThreadHtml(gid);}
  // Het klantpaneel hoort bij een 1-op-1 gesprek; bij een groep gaat het dicht
  const kl=document.getElementById("ber-klant");if(kl)kl.innerHTML=berKlantHtml();
  berInvoerKlaar(true);
  if(mid)berNaarBericht(mid);else berScroll();
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
    berBadgeBij(); // topnav-bolletje bijwerken
  }catch(e){}
}
async function berGroepStuur(){
  const inp=document.getElementById("ber-inp");if(!inp)return;
  const tekst=(inp.value||"").trim();
  const gid=String(BER.cur||"").slice(2);
  if(!tekst||!gid)return;
  const{data,error}=await db.from("chat_group_messages").insert({group_id:gid,company_id:ME.profile.company_id,sender_id:ME.user.id,body:tekst}).select().single();
  if(error){toast(error.message||"Versturen mislukt");return;}
  berConceptZet("g:"+gid,"");
  if(BER.cur==="g:"+gid){inp.value="";chatGroei(inp);}
  BER.gmsgs.push(data);
  const host=BER.cur==="g:"+gid?document.getElementById("ber-msgs"):null;
  if(host){const leeg=host.querySelector(".muted");if(leeg)leeg.remove();berDagErbij(host,data);host.insertAdjacentHTML("beforeend",berGroepBubHtml(data));host.scrollTop=host.scrollHeight;}
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
    '<button class="btn ghost sm" style="margin-top:auto" onclick="berNaarKlant(\''+esc(c.id)+'\')">Programma openen</button>';
}
async function berKlantLaad(){
  const cur=String(BER.cur||"");
  if(!cur||cur.indexOf("g:")===0||!document.getElementById("ck-stats"))return;
  let st=BER.klantCache[cur];
  if(!st||Date.now()-st.t>120000){
    const[wq,rq,ciq,cpq,hq]=await Promise.all([
      db.from("workouts").select("id,workout_date,title").eq("client_id",cur).neq("status","draft"),
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
  if(key==="ber")berConceptZet(aid,"");
  if(data){BER.gepland.push(data);BER.gepland.sort((a,b)=>a.send_at.localeCompare(b.send_at));}
  const h=document.getElementById("ber-gepland");if(h&&BER.cur===aid)h.innerHTML=berGeplandHtml(aid);
  toast("Gepland voor "+laterLabel(tijd.toISOString()));
}

// ---------- Berichten in een los venster (verzoek Stefan, 19 nov 2026) ----------
// Zelfde idee als de bibliotheek en de Weekcheck: handig op een tweede scherm.
// Het venster is de gewone Berichten-pagina zonder navigatiebalk, schermhoog.
let BERWIN=null,berVensterKanaal=null;
const inBerVenster=()=>document.body.classList.contains("bervenster");
function openBerVenster(){
  if(BERWIN&&!BERWIN.closed){try{BERWIN.focus();}catch(e){}return;}
  const cur=String(BER.cur||""); // het gesprek dat nu open staat gaat mee
  const w=window.open(location.pathname+"#berichtenvenster"+(cur?"/"+encodeURIComponent(cur):""),"yp_berichten","width=1240,height=860,menubar=no,toolbar=no,location=no,status=no");
  if(!w){toast("Het venster werd geblokkeerd. Sta pop-ups toe voor deze site en probeer het opnieuw.");return;}
  BERWIN=w;try{w.focus();}catch(e){}
}
// In het venster zelf: alleen Berichten.
async function renderBerVenster(cur){
  document.title="Berichten · YourProgram";
  document.body.classList.add("coachmode","bervenster");
  const tb=document.querySelector(".topbar");if(tb)tb.style.display="none";
  document.getElementById("content").innerHTML='<div class="cwrap"><div id="cpage"><h1>Berichten</h1><div class="spin">Laden…</div></div></div>';
  if(typeof BroadcastChannel!=="undefined"&&!berVensterKanaal)berVensterKanaal=new BroadcastChannel("yp_bieb");
  if(cur)BER.cur=cur;
  await fillBerichten();
  // Het meegegeven gesprek echt openen (gelezen-markering, cijfers van de klant).
  const open=String(BER.cur||"");
  if(open.indexOf("g:")===0){if(berGroep(open.slice(2)))berOpenGroep(open.slice(2));}
  else if(open)berOpen(open);
}
// "Programma openen": in het losse venster gebeurt dat in het hoofdvenster.
function berNaarKlant(id){
  if(inBerVenster()){
    if(berVensterKanaal){berVensterKanaal.postMessage({type:"open",id});toast("Geopend in het hoofdvenster");}
    else toast("Open deze klant in het hoofdvenster");
    return;
  }
  openClient(id);
}
