// app/klant-scherm.js — het hart van de coach-app: een klant openen, de
// doorscrollende kalender, workouts programmeren met de bouwer, het dag-menu,
// kopieren/plakken, templates invoegen en workouts opslaan.
let calClient=null,calRef=new Date(),activePanel="kalender",editDay=null,editWid=null,editIdx=0,coachChipNaam="";
// Coach-wissel in de kalenderkop (alleen eigenaar/platform_admin): welke coach z'n klanten je programmeert.
let coachList=[],coachFilterId=null;
// Scores invoeren door de coach (vandaag of een dag die al is geweest): welke workout staat open.
let resWid=null;
const SIDE=[["kalender","i-cal","Kalender",false],["berichten","i-chat","Berichten",true],["assessment","i-clip","Assessment",true],["metrics","i-chart","Metrics & 1RM",true],["checkins","i-check","Check-ins & consults",false],["doelen","i-target","Doelen",true],["planning","i-cal","Planning & periodisering",false],["notities","i-doc","Notities & documenten",true],["schema","i-clock","Trainingsschema",true],["prioriteiten","i-doc","Prioriteiten",true],["materiaal","i-gear","Materiaal",true],["profiel","i-user","Profiel",false],["sneltoetsen","i-keys","Sneltoetsen",true]];
function openClient(id){
  calClient=id;calRef=new Date();editDay=null;editWid=null;coachChipNaam="";
  // Staff (eigenaar/admin): standaard programmeer je de coach van deze klant.
  const p0=coachClients.find(x=>x.id===id);
  coachFilterId=(myRole()!=="coach"&&p0)?(p0.coach_id||null):null;
  kalWeken=10;kalScrollDoel="top";kalLabelMaand=null;prevScrollY=null;
  if(!LIB.geladen)libLaad();
  setHash("klant/"+id);
  renderClient("kalender");
  const p=coachClients.find(x=>x.id===id);
  if(p)toast("Programma van "+[p.first_name,p.last_name].filter(Boolean).join(" ")+" geopend");
}
function renderClient(panel){
  activePanel=panel;
  // Verberg de algemene bovenbalk (belangrijk bij binnenkomen via een deep-link, waar
  // renderCoach niet is gedraaid) — anders staan er twee balken en valt de inklap-pijl buiten beeld.
  const _tb=document.querySelector(".topbar");if(_tb)_tb.style.display="none";
  const p=coachClients.find(x=>x.id===calClient);if(!p)return renderCoach("clients");
  const lidType=p.membership_type==="one_on_one"?"1-op-1 klant":(p.membership_type==="free_blog"?"Blog-lid":"Lid");
  const side=SIDE.map(s=>{
    const acties={assessment:"openAssess()",metrics:"openMx()",doelen:"openGoals()",notities:"openNotes()",schema:"openSchema()",prioriteiten:"openPrio()",materiaal:"openEquip()",berichten:"openChatPop()",planning:"openPlan()",checkins:"openCheckin()",sneltoetsen:"openKeys()"};
    const actie=acties[s[0]]||("renderClient('"+s[0]+"')");
    const later=acties[s[0]]?false:s[3];
    return '<button class="'+(s[0]===panel?'on':'')+'" data-tip="'+esc(s[2])+'"'+(s[0]==="sneltoetsen"?' style="margin-top:14px"':'')+' onclick="'+actie+'"><svg class="i"><use href="#'+s[1]+'"/></svg> '+s[2]+(later?'<span class="soon">later</span>':'')+'</button>';
  }).join("");
  const c=document.getElementById("content");
  coachSection="clients"; // nav-balk blijft staan, Klanten actief
  c.innerHTML=coachShellHtml('<div class="client-layout'+(sideCollapsed?' collapsed':'')+'">'+
    '<div class="cside"><div class="cside-in"><div class="prof"><div class="bigav" style="'+avFotoStyle(p)+'" title="'+naamVan(p)+'">'+avFotoText(p)+'</div><div class="cnm" id="cs-cnm">'+naamVan(p)+'</div><div class="cinfo"><span id="cs-profielregel" style="display:'+(profielRegel(p)?"":"none")+'">'+esc(profielRegel(p))+'<br></span><span id="cs-email">'+esc(p.email||"")+'</span><br>'+lidType+'<br><span id="cs-sessies">…</span> sessies afgerond</div>'+
    '<div id="cs-dagen" style="display:none;margin-top:8px"><span class="tag" style="background:#2a2e35;border-color:#33373d;color:#c9cdd4"><span style="width:9px;height:9px;border-radius:2px;background:#22c55e;display:inline-block;margin-right:6px;vertical-align:-1px"></span><b id="cs-dagen-txt"></b></span></div></div>'+
    '<div class="mini-sess" id="cs-minisess" title="Sessies afgerond">…</div>'+
    '<div class="streak">Streak: <b id="cs-streak">…</b></div>'+
    '<div class="streak" style="gap:6px;flex-wrap:wrap" id="cs-pills"><span class="cpill" style="background:#2a2e35;color:#8f959d;font-size:10px;padding:2px 8px">lifestyle: n.v.t.</span></div>'+
    '<div class="cnav">'+side+'</div>'+
    '<button class="collapsebtn" title="Zijbalk in-/uitklappen" onclick="toggleSide()"><span id="cl-arrow">'+(sideCollapsed?"→":"←")+'</span></button></div></div>'+
    '<div class="cmain" id="cmain"><div class="spin">Laden…</div></div></div>');
  const pg=document.getElementById("cpage");if(pg)pg.classList.add("fullbleed");
  ensureLibModals();
  vulKlantStats(p);
  if(panel==="kalender")renderMonth();
  else if(panel==="profiel"){pfTab="profiel";renderProfielPagina();}
  else{const lbl=(SIDE.find(s=>s[0]===panel)||[])[2]||"Onderdeel";document.getElementById("cmain").innerHTML='<div style="padding:24px"><h2>'+esc(lbl)+'</h2><div class="card" style="padding:24px;margin-top:10px;max-width:560px"><div class="muted" style="line-height:1.6">Dit onderdeel komt later. We bouwen eerst de kalender en het programmeren helemaal af. Daarna voegen we '+esc(lbl.toLowerCase())+' toe, net als in het ontwerp.</div></div></div>';}
}
// Sessies, streak en workout-te-doen in de zijbalk, berekend uit echte data
async function vulKlantStats(p){
  const[wq,rq]=await Promise.all([
    db.from("workouts").select("id,workout_date,title").eq("client_id",p.id),
    db.from("results").select("workout_id,status").eq("athlete_id",p.id)
  ]);
  const ws=(wq.data||[]).filter(w=>!/^rest ?day$/i.test((w.title||"").trim()));
  const doneIds=new Set((rq.data||[]).filter(r=>r.status==="completed").map(r=>r.workout_id));
  const el=id=>document.getElementById(id);
  const sessies=ws.filter(w=>doneIds.has(w.id)).length;
  if(el("cs-sessies"))el("cs-sessies").textContent=sessies;
  if(el("cs-minisess")){el("cs-minisess").textContent=sessies;el("cs-minisess").title=sessies+" sessies afgerond";}
  // streak: aaneengesloten weken (t/m deze of vorige week) met minstens één voltooide workout
  const weekSet=new Set(ws.filter(w=>doneIds.has(w.id)).map(w=>ymd(mondayOf(new Date(w.workout_date+"T00:00:00")))));
  let wk=mondayOf(new Date()),streak=0;
  if(!weekSet.has(ymd(wk)))wk=addDays(wk,-7);
  while(weekSet.has(ymd(wk))){streak++;wk=addDays(wk,-7);}
  if(el("cs-streak"))el("cs-streak").textContent=streak+(streak===1?" week":" weken");
  // workout te doen deze week
  const td=todayStr(),mon=ymd(mondayOf(new Date())),sun=ymd(addDays(mondayOf(new Date()),6));
  const open=ws.filter(w=>w.workout_date>=mon&&w.workout_date<=sun&&!doneIds.has(w.id)).sort((a,b)=>a.workout_date.localeCompare(b.workout_date));
  if(open.length&&el("cs-pills")){
    const d=new Date(open[0].workout_date+"T00:00:00");
    const lbl=open[0].workout_date===td?"vandaag":DAGEN[(d.getDay()+6)%7].toLowerCase();
    el("cs-pills").insertAdjacentHTML("afterbegin",'<span class="cpill bad" style="font-size:10px;padding:2px 8px">workout te doen: '+esc(lbl)+'</span>');
  }
  // vaste trainingsdagen (laatste 4 weken), zoals "woensdag · zaterdag" in het ontwerp
  const von=ymd(addDays(new Date(),-27));
  const dagIdx=[...new Set(ws.filter(w=>w.workout_date>=von&&w.workout_date<=td).map(w=>{const d=new Date(w.workout_date+"T00:00:00");return (d.getDay()+6)%7;}))].sort((a,b)=>a-b);
  if(dagIdx.length&&el("cs-dagen")){el("cs-dagen-txt").textContent=dagIdx.map(i=>DAGVOL[i]).join(" · ");el("cs-dagen").style.display="";}
  // naam van de coach in de kalender-kop (cache zodat renderMonth hem niet overschrijft)
  if(p.coach_id&&myRole()!=="coach"){
    const{data:cp}=await db.from("profiles").select("first_name").eq("id",p.coach_id).single();
    if(cp){coachChipNaam=cp.first_name||"";const cc=el("cs-coach");if(cc)cc.textContent="Coach "+coachChipNaam;}
  }
}
let calView="maand",hideScores=false;
// Doorlopend scrollen zoals CoachRx: aantal weken groeit mee tijdens het scrollen
let kalWeken=10,kalBusy=false,kalScrollBound=false,kalLabelMaand=null,kalScrollDoel=null,prevScrollY=null,kalAnim=0;
const DAGVOL=["maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag","zondag"];
function kalSetView(v){calView=v;editDay=null;editWid=null;if(v==="maand")kalScrollDoel="top";renderMonth();}
function kalLabelUpdate(){
  // het label = de maand-sectie waarin de bovenste zichtbare rij valt
  const kop=document.querySelector("#calwrap .mhead7");
  // als de dagenbalk niet plakt (mobiel) geldt de bovenrand van het scherm
  const grens=Math.max(kop?kop.getBoundingClientRect().bottom+8:150,12);
  const zet=d=>{
    kalLabelMaand=new Date(d.getFullYear(),d.getMonth(),1);
    const lbl=document.getElementById("mnd-label");
    if(lbl){const t=MAANDVOL[d.getMonth()];lbl.textContent=t.charAt(0).toUpperCase()+t.slice(1)+" "+d.getFullYear();}
  };
  const vanLabel=el=>{const p=(el.dataset.manchor||"").split("-");if(p.length===3)zet(new Date(parseInt(p[1],10),parseInt(p[2],10),1));};
  let sectie=null; // laatste maandbalk die al boven de kop is doorgeschoven
  for(const el of document.querySelectorAll("#calwrap .mrow[data-d], #calwrap .mlabel")){
    const onderGrens=el.getBoundingClientRect().bottom>grens;
    if(el.classList.contains("mlabel")){
      if(!onderGrens){sectie=el;continue;}
      vanLabel(el);return; // maandbalk zelf bovenaan in beeld
    }
    if(!onderGrens)continue;
    if(sectie)vanLabel(sectie); // rij hoort bij de laatst gepasseerde maandbalk
    else zet(new Date(calRef.getFullYear(),calRef.getMonth(),1)); // vóór de eerste balk = startmaand
    return;
  }
}
function kalScrollBind(){
  if(kalScrollBound)return;kalScrollBound=true;
  window.addEventListener("scroll",()=>{
    if(calView!=="maand"||activePanel!=="kalender"||!calClient||!document.getElementById("calwrap"))return;
    kalLabelUpdate();
    // bijna onderaan: zes weken bijladen (niet tijdens een maand-sprong)
    if(Date.now()<kalAnim)return;
    if(!kalBusy&&kalWeken<104&&window.innerHeight+window.scrollY>document.body.scrollHeight-900){
      kalBusy=true;kalWeken+=6;prevScrollY=window.scrollY;
      Promise.resolve(renderMonth()).finally(()=>{kalBusy=false;});
    }
  },{passive:true});
}
function kalGaNaarMaand(doel){
  const start=new Date(calRef.getFullYear(),calRef.getMonth(),1);
  if(doel<start){calRef=doel;kalWeken+=6;kalScrollDoel="top";renderMonth();return;}
  const key="m-"+doel.getFullYear()+"-"+doel.getMonth();
  const gridStart=mondayOf(start);
  const nodig=Math.ceil((mondayOf(doel)-gridStart)/(7*864e5))+8;
  if(kalWeken<nodig){kalWeken=nodig+4;kalScrollDoel=key;renderMonth();return;}
  kalScrollNaar(key);
}
function kalScrollNaar(doel,direct){
  let el=null;
  if(doel==="today")el=document.querySelector(".mday.today-cell");
  else if(doel==="top")el=document.getElementById("calwrap");
  else el=document.querySelector('.mlabel[data-manchor="'+doel+'"]')||document.getElementById("calwrap");
  if(el){
    kalAnim=Date.now()+1400;
    // offset = donkere balk + kalenderkop + dagenbalk (hoogtes kunnen wisselen per schermbreedte)
    const ch=document.querySelector("#cpage.fullbleed .calhead"),kop=document.querySelector("#calwrap .mhead7");
    const stack=52+(ch?ch.getBoundingClientRect().height:62)+(kop?kop.getBoundingClientRect().height:40)+4;
    window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+window.scrollY-stack),behavior:direct?"auto":"smooth"});
  }
}
function toggleScores(btn){hideScores=!hideScores;btn.classList.toggle("on",hideScores);const w=document.getElementById("calwrap");if(w)w.classList.toggle("noscores",hideScores);}
function prevMonth(){navStep(-1);}
function nextMonth(){navStep(1);}
function navStep(dir){
  editDay=null;editWid=null;
  if(calView==="maand"){
    const cur=kalLabelMaand||new Date(calRef.getFullYear(),calRef.getMonth(),1);
    kalGaNaarMaand(new Date(cur.getFullYear(),cur.getMonth()+dir,1));
    return;
  }
  calRef=addDays(calRef,dir*(calView==="week"?7:1));
  renderMonth();
}
function thisMonth(){
  editDay=null;editWid=null;
  if(calView==="maand"){
    const nu=new Date(),eerste=new Date(nu.getFullYear(),nu.getMonth(),1);
    if(eerste<new Date(calRef.getFullYear(),calRef.getMonth(),1))calRef=eerste;
    kalScrollDoel="today";renderMonth();return;
  }
  calRef=new Date();renderMonth();
}

// Blokkleuren zoals het ontwerp: 6 legendakleuren met slimme standaard per oefening
function kleurVoorOefening(naam){
  const n=String(naam||"").toLowerCase();
  let b=null;(LIB.oef||[]).forEach(o=>{if(!b&&(o.naam||"").toLowerCase()===n)b=o;});
  const t=n+" "+(b?(b.tags||[]).join(" "):"");
  if(/stretch|mobilit|breath|adem|foam|cool.?down|pigeon|cars\b|herstel/.test(t))return "green";
  if(/muscle.?up|handstand|hspu|ring|toes to bar|t2b|rope climb|lever|planche|gymnast/.test(t))return "purple";
  if(/bike|erg\b|\brun|ski\b|amrap|interval|metcon|burpee|double.?under|sprint|conditioning|for time|emom|wod/.test(t))return "yellow";
  if(/squat|deadlift|press|bench|pull.?up|chin.?up|row|curl|lunge|rdl|hip thrust|clean|snatch|jerk|carry|dip\b|raise|extension|swing|thruster|barbell|dumbbell|kettlebell|kracht/.test(t))return "blue";
  return "orange";
}
function blokKleurDots(cur){return TPLKLEUREN.map(k=>'<span title="'+LEGNAAM[k]+'" onclick="kiesBlokKleur(this,\''+k+'\')" style="background:'+TPLKLEUR[k]+(k===cur?';outline:2px solid #171719;outline-offset:1.5px':'')+'"></span>').join("");}
function kiesBlokKleur(el,k){
  const row=el.closest(".exrow");row.dataset.kleur=k;
  [...row.querySelectorAll(".blokkleur span")].forEach((s,i)=>{s.style.outline=TPLKLEUREN[i]===k?"2px solid #171719":"none";s.style.outlineOffset="1.5px";});
}
function rowOpts(b){return '<div class="f-opts" style="align-items:center"><div class="blokkleur">'+blokKleurDots(b.color||"")+'</div></div>';}
function rowChip(b){return b.oefening_id?'<div class="blokchips"><span class="vidchip">🎥 '+esc(b.exercise||"")+' <span class="x" onclick="chipWeg(this,event)">✕</span></span></div>':'<div class="blokchips"></div>';}
function exRow(b){b=b||{};return '<div class="sec exrow'+(b.linked?' linked':'')+'" data-kind="exercise" data-linked="'+(b.linked?'1':'0')+'" data-kleur="'+esc(b.color||"")+'" data-score="'+esc(b.score_type||"")+'" data-oefid="'+(b.oefening_id||"")+'" data-srcww="'+(b.source_blog_workout_id||"")+'" data-bid="'+(b.id||"")+'"><div class="exhead"><b class="lbl-badge">A</b><input class="exn" placeholder="Naam oefening" value="'+esc(b.exercise||"")+'" oninput="exZoek(this)" onkeydown="if(event.key===\'Escape\'){event.stopPropagation();exDropWeg(this);}" autocomplete="off"><span class="extools"><button class="ic-btn" title="Geschiedenis: wat deed dit lid eerder?" onclick="openHistory(this.closest(\'.exrow\').querySelector(\'.exn\').value);return false"><svg class="i sm-i"><use href="#i-hist"/></svg></button><button class="ic-btn cam'+(b.oefening_id?' has-video':'')+'" title="Demo-video" onclick="toggleVid(this);return false"><svg class="i sm-i"><use href="#i-cam"/></svg></button><button class="ic-btn" title="Blok verwijderen" onclick="delRow(this)"><svg class="i sm-i"><use href="#i-x"/></svg></button></span></div><textarea class="f-presc" rows="1" placeholder="Tempo, reps, sets, rust">'+esc(b.prescription||composePresc(b))+'</textarea>'+rowOpts(b)+rowChip(b)+'<div class="exdrop"></div><div class="vidpop"></div></div>';}
function condRow(b){b=b||{};return '<div class="sec exrow'+(b.linked?' linked':'')+'" data-kind="conditioning" data-linked="'+(b.linked?'1':'0')+'" data-kleur="'+esc(b.color||"")+'" data-score="'+esc(b.score_type||"")+'" data-srcww="'+(b.source_blog_workout_id||"")+'" data-bid="'+(b.id||"")+'"><div class="exhead"><b class="lbl-badge">D</b><input class="exn" placeholder="Conditioning format (bijv. AMRAP 12, For time)" value="'+esc(b.exercise||"")+'" autocomplete="off"><span class="extools"><button class="ic-btn" title="Geschiedenis: wat deed dit lid eerder?" onclick="openHistory(this.closest(\'.exrow\').querySelector(\'.exn\').value);return false"><svg class="i sm-i"><use href="#i-hist"/></svg></button><button class="ic-btn" title="Blok verwijderen" onclick="delRow(this)"><svg class="i sm-i"><use href="#i-x"/></svg></button></span></div><textarea class="f-desc" rows="1" placeholder="Conditioning-omschrijving, notes, enz.">'+esc(b.notes||"")+'</textarea>'+rowOpts(b)+'</div>';}
function rowToObj(r){const kind=r.dataset.kind,linked=r.dataset.linked==="1",exercise=r.querySelector(".exn").value.trim();const color=r.dataset.kleur||null,score_type=r.dataset.score||"text";const oefening_id=r.dataset.oefid?parseInt(r.dataset.oefid,10):null;const source_blog_workout_id=r.dataset.srcww||null;const id=r.dataset.bid||null;if(kind==="conditioning")return{id,kind,linked,exercise,color,score_type,source_blog_workout_id,notes:(r.querySelector(".f-desc").value||"").trim()};return{id,kind:"exercise",linked,exercise,color,score_type,oefening_id,source_blog_workout_id,prescription:r.querySelector(".f-presc").value.trim()};}
// Zoeken in de bibliotheek vanuit de bouwer (zoals het ontwerp)
function exZoek(inp){
  const row=inp.closest(".exrow"),drop=row.querySelector(".exdrop");
  if(!drop)return;
  const v=inp.value.trim().toLowerCase();
  drop.innerHTML="";
  if(v.length<2){row.dataset.nodrop="";drop.classList.remove("show");return;} // (bijna) leeg veld = weggeklikte dropdown weer toestaan
  if(row.dataset.nodrop==="1"){drop.classList.remove("show");return;}
  if(!LIB.geladen){
    drop.innerHTML='<div class="hd">Bibliotheek laden…'+dropXHtml("exDropWeg")+'</div>';drop.classList.add("show");
    // Zodra de bibliotheek er is alsnog de resultaten tonen (anders bleef "laden…" staan).
    libLaad().then(()=>{if(document.contains(inp)&&inp.value.trim().toLowerCase()===v)exZoek(inp);});
    return;
  }
  const hits=LIB.oef.filter(o=>(o.naam||"").toLowerCase().includes(v)||(o.tags||[]).join(" ").toLowerCase().includes(v));
  if(!hits.length){drop.classList.remove("show");return;}
  drop.innerHTML='<div class="hd">Oefeningen ('+hits.length+')'+dropXHtml("exDropWeg")+'</div>'+hits.slice(0,8).map(o=>{
    return '<div class="exopt" onclick="event.stopPropagation();kiesEx(this,'+o.id+')"><div><div class="en">'+esc(o.naam)+'</div><div class="ep">'+esc((o.tags||[]).join(" · ")||(o.youtube_id?"YouTube-video":""))+'</div></div></div>';
  }).join("");
  drop.classList.add("show");
}
// Kruisje in de kop van de zoek-dropdown: wegklikken en weg blijven zolang je
// doortypt (bijv. bij een eigen oefening die niet in de bibliotheek staat).
// Opnieuw focussen op het veld laat de zoeker weer toe.
function dropXHtml(fn){return '<span class="hdx" title="Sluiten (Esc)" onclick="event.stopPropagation();'+fn+'(this)">✕</span>';}
function exDropWeg(el){
  const row=el.closest(".exrow");if(!row)return;
  row.dataset.nodrop="1";
  const d=row.querySelector(".exdrop");if(d)d.classList.remove("show");
}
function kiesEx(el,oefId){
  const row=el.closest(".exrow");
  const o=LIB.oef.find(x=>x.id===oefId);if(!o)return;
  row.dataset.oefid=String(o.id);
  row.querySelector(".exn").value=o.naam;
  row.querySelector(".exdrop").classList.remove("show");
  if(!row.dataset.kleur){const k=kleurVoorOefening(o.naam);row.dataset.kleur=k;row.querySelector(".blokkleur").innerHTML=blokKleurDots(k);}
  const cam=row.querySelector(".cam");if(cam)cam.classList.add("has-video");
  const ch=row.querySelector(".blokchips");if(ch)ch.innerHTML='<span class="vidchip">🎥 '+esc(o.naam)+' <span class="x" onclick="chipWeg(this,event)">✕</span></span>';
  row.querySelector(".f-presc").focus();
  toast("Demo-video automatisch gekoppeld, de sporter ziet hem bij de workout");
}
function chipWeg(x,ev){
  ev.stopPropagation();
  const row=x.closest(".exrow");
  row.dataset.oefid="";
  const ch=row.querySelector(".blokchips");if(ch)ch.innerHTML="";
  const cam=row.querySelector(".cam");if(cam)cam.classList.remove("has-video");
  const vid=row.querySelector(".vidpop");if(vid)vid.classList.remove("show");
}
// Gedeelde inhoud van de video-popover (oefening én warming-up/cooldown gebruiken dezelfde).
function vidPopInner(naam,o){
  const yt=o&&o.youtube_id?o.youtube_id:"";
  return '<span class="vp-x" onclick="event.stopPropagation();this.closest(\'.vidpop\').classList.remove(\'show\')">✕</span><div class="vt">'+esc(naam)+'</div><div class="vprev">'+
    (yt?'<div onclick="event.stopPropagation();speelAf(this,\''+esc(yt)+'\')" style="width:100%;height:100%;position:relative;cursor:pointer"><img src="https://i.ytimg.com/vi/'+esc(yt)+'/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover;display:block" alt=""><span class="pbtn"></span></div>'
      :(o&&o.video_url?'<div class="vlabel">Video: <a href="'+esc(o.video_url)+'" target="_blank" rel="noopener" style="color:#fff">open in nieuw tabblad</a></div>':'<div class="vlabel">Geen video gevonden bij deze oefening</div>'))+
    '</div><div class="vp-cap">'+(yt?"Klik op de video om af te spelen":"Demo-video uit de bibliotheek")+'</div>';
}
function toggleVid(cam){
  const row=cam.closest(".exrow"),vid=row.querySelector(".vidpop");
  if(!vid)return;
  if(vid.classList.contains("show")){vid.classList.remove("show");return;}
  if(!row.dataset.oefid){toast("Kies eerst een oefening uit de bibliotheek");return;}
  const o=LIB.oef.find(x=>String(x.id)===row.dataset.oefid);
  const naam=row.querySelector(".exn").value||"Oefening";
  vid.innerHTML=vidPopInner(naam,o);
  vid.classList.add("show");
}
// ---------- Demo-video koppelen aan warming-up / cooldown (vrije-tekstblokken) ----------
function cwNaamVan(oefId){if(!oefId)return"";const o=(LIB.oef||[]).find(x=>String(x.id)===String(oefId));return o?o.naam:"";}
function cwChipHtml(kind,naam){return '<span class="vidchip"><span onclick="cwToggleVid(\''+kind+'\')" style="cursor:pointer" title="Bekijk video">🎥 '+esc(naam||"Demo-video")+'</span> <span class="x" onclick="cwChipWeg(\''+kind+'\')">✕</span></span>';}
function cwMediaHtml(kind,oefId){
  const lbl=kind==="warmup"?"warming-up":"cooldown";
  const heeft=!!oefId;
  return '<div class="cwmedia" id="wm_'+kind+'" data-oefid="'+(oefId||"")+'">'+
    '<input class="cwn" placeholder="Zoek een oefening voor de demo-video…" oninput="cwZoek(this,\''+kind+'\')" onkeydown="if(event.key===\'Escape\'){event.stopPropagation();cwDropWeg(this);}" autocomplete="off" style="display:none">'+
    '<div class="exdrop"></div>'+
    '<div class="cwchip">'+(heeft?cwChipHtml(kind,cwNaamVan(oefId)):"")+'</div>'+
    '<div class="demolink" onclick="cwStartAdd(\''+kind+'\')"'+(heeft?' style="display:none"':'')+'>Demo-video toevoegen aan '+lbl+'</div>'+
    '<div class="vidpop"></div>'+
    '</div>';
}
function cwStartAdd(kind){
  const box=document.getElementById("wm_"+kind);if(!box)return;
  const inp=box.querySelector(".cwn");inp.style.display="";inp.value="";
  const dl=box.querySelector(".demolink");if(dl)dl.style.display="none";
  if(!LIB.geladen)libLaad();
  inp.focus();
}
function cwDropWeg(el){
  const box=el.closest("[id^=wm_]");if(!box)return;
  box.dataset.nodrop="1";
  const d=box.querySelector(".exdrop");if(d)d.classList.remove("show");
}
function cwZoek(inp,kind){
  const box=document.getElementById("wm_"+kind),drop=box.querySelector(".exdrop");
  const v=inp.value.trim().toLowerCase();
  drop.innerHTML="";
  if(v.length<2){box.dataset.nodrop="";drop.classList.remove("show");return;}
  if(box.dataset.nodrop==="1"){drop.classList.remove("show");return;}
  if(!LIB.geladen){
    drop.innerHTML='<div class="hd">Bibliotheek laden…'+dropXHtml("cwDropWeg")+'</div>';drop.classList.add("show");
    libLaad().then(()=>{if(document.contains(inp)&&inp.value.trim().toLowerCase()===v)cwZoek(inp,kind);});
    return;
  }
  const hits=LIB.oef.filter(o=>(o.naam||"").toLowerCase().includes(v)||(o.tags||[]).join(" ").toLowerCase().includes(v));
  if(!hits.length){drop.classList.remove("show");return;}
  drop.innerHTML='<div class="hd">Oefeningen ('+hits.length+')'+dropXHtml("cwDropWeg")+'</div>'+hits.slice(0,8).map(o=>{
    return '<div class="exopt" onclick="event.stopPropagation();cwKies(\''+kind+'\','+o.id+')"><div><div class="en">'+esc(o.naam)+'</div><div class="ep">'+esc((o.tags||[]).join(" · ")||(o.youtube_id?"YouTube-video":""))+'</div></div></div>';
  }).join("");
  drop.classList.add("show");
}
function cwKies(kind,oefId){
  const box=document.getElementById("wm_"+kind),o=LIB.oef.find(x=>x.id===oefId);
  if(!box||!o)return;
  box.dataset.oefid=String(o.id);
  box.querySelector(".exdrop").classList.remove("show");
  box.querySelector(".cwn").style.display="none";
  box.querySelector(".cwchip").innerHTML=cwChipHtml(kind,o.naam);
  const dl=box.querySelector(".demolink");if(dl)dl.style.display="none";
  toast("Demo-video gekoppeld aan de "+(kind==="warmup"?"warming-up":"cooldown")+", de sporter ziet hem erbij");
}
function cwChipWeg(kind){
  const box=document.getElementById("wm_"+kind);if(!box)return;
  box.dataset.oefid="";
  box.querySelector(".cwchip").innerHTML="";
  box.querySelector(".vidpop").classList.remove("show");
  const dl=box.querySelector(".demolink");if(dl)dl.style.display="";
}
function cwToggleVid(kind){
  const box=document.getElementById("wm_"+kind),vid=box.querySelector(".vidpop");
  if(!vid)return;
  if(vid.classList.contains("show")){vid.classList.remove("show");return;}
  const oefId=box.dataset.oefid;if(!oefId){toast("Kies eerst een oefening uit de bibliotheek");return;}
  const o=LIB.oef.find(x=>String(x.id)===oefId);
  vid.innerHTML=vidPopInner(cwNaamVan(oefId)||"Oefening",o);
  vid.classList.add("show");
}
function cwLees(kind){const box=document.getElementById("wm_"+kind);const v=box&&box.dataset.oefid;return v?parseInt(v,10):null;}
function speelAf(el,yt){
  // referrerpolicy is verplicht: zonder afzender-info weigert YouTube met "Fout 153"
  el.outerHTML='<iframe src="https://www.youtube.com/embed/'+yt+'?autoplay=1&rel=0" style="width:100%;height:100%;border:0;display:block" allowfullscreen allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  const pop=document.querySelector(".vidpop.show .vp-cap");
  if(pop)pop.innerHTML='Speelt niet af? <a href="https://youtu.be/'+yt+'" target="_blank" rel="noopener" style="color:#2a9fce">Bekijk op YouTube</a>';
}
document.addEventListener("click",e=>{
  if(!e.target.closest(".exdrop")&&!e.target.closest(".exn")&&!e.target.closest(".cwn"))document.querySelectorAll(".exdrop.show").forEach(d=>d.classList.remove("show"));
  if(!e.target.closest(".vidpop")&&!e.target.closest(".cam")&&!e.target.closest(".vidchip"))document.querySelectorAll(".vidpop.show").forEach(d=>d.classList.remove("show"));
});
function relabel(){
  const host=document.getElementById("exrows");if(!host)return;
  host.querySelectorAll(".sslink").forEach(x=>x.remove());
  const rows=[...host.querySelectorAll(".exrow")];if(!rows.length)return;
  rows[0].dataset.linked="0";rows[0].classList.remove("linked");
  let groups=[];
  rows.forEach((r,i)=>{if(i>0&&r.dataset.linked==="1"){groups[groups.length-1].push(r);}else{groups.push([r]);}});
  groups.forEach((g,gi)=>{const L=String.fromCharCode(65+gi);g.forEach((r,pos)=>{const bd=r.querySelector(".lbl-badge");if(bd)bd.textContent=g.length>1?L+(pos+1):L;});});
  // superset-cirkels tussen de blokken (zoals het ontwerp)
  rows.forEach((r,i)=>{
    if(i===rows.length-1)return;
    const d=document.createElement("div");
    d.className="sslink"+(rows[i+1].dataset.linked==="1"?" aan":"");
    d.title="Koppel als superset";
    d.innerHTML='<svg class="i sm-i"><use href="#i-link"/></svg>';
    d.onclick=ev=>{ev.stopPropagation();const nxt=rows[i+1];const on=nxt.dataset.linked!=="1";nxt.dataset.linked=on?"1":"0";nxt.classList.toggle("linked",on);relabel();};
    r.parentNode.insertBefore(d,rows[i+1]);
  });
}
function delRow(btn){btn.closest(".exrow").remove();relabel();}
function addExBtn(){document.getElementById("exrows").insertAdjacentHTML("beforeend",exRow({}));relabel();}
function addCondBtn(){document.getElementById("exrows").insertAdjacentHTML("beforeend",condRow({}));relabel();}
function dupLast(){const rows=[...document.querySelectorAll("#exrows .exrow")];if(!rows.length){addExBtn();return;}const o=rowToObj(rows[rows.length-1]);o.id=null;document.getElementById("exrows").insertAdjacentHTML("beforeend",o.kind==="conditioning"?condRow(o):exRow(o));relabel();}

function inlineBuilderHtml(w){
  w=w||{};const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  let rows=blocks.length?blocks.map(b=>b.kind==="conditioning"?condRow(b):exRow(b)).join(""):exRow({});
  return '<div class="sec">'+
      '<div class="corner"><span title="Zichtbaar voor de sporter"><svg class="i sm-i"><use href="#i-eye"/></svg></span><span title="Video toevoegen"><svg class="i sm-i"><use href="#i-cam"/></svg></span></div>'+
      '<input id="w_title" class="row-title" placeholder="Titel" value="'+esc(w.title||"")+'">'+
      '<textarea id="w_notes" rows="1" placeholder="Coach&#39;s notes">'+esc(w.coach_notes||"")+'</textarea>'+
      '<div style="border-top:1px solid #e7e9ec;margin:6px 0 4px"></div>'+
      '<textarea id="w_warmup" rows="1" placeholder="Warming-up toevoegen…">'+esc(w.warmup||"")+'</textarea>'+
      cwMediaHtml("warmup",w.warmup_oefening_id)+
    '</div>'+
    '<div id="exrows">'+rows+'</div>'+
    '<div class="addbtns"><button onclick="addExBtn()">+ Oefening</button><button onclick="addCondBtn()">+ Conditioning</button><button onclick="openInsBouwer()">+ Programma</button><button class="iconly" title="Dupliceer laatste blok" onclick="dupLast()">⧉</button></div>'+
    '<div class="sec"><textarea id="w_cooldown" rows="1" placeholder="Cooldown toevoegen…">'+esc(w.cooldown||"")+'</textarea>'+cwMediaHtml("cooldown",w.cooldown_oefening_id)+'</div>'+
    '<div class="foot"><button class="save" id="saveW" onclick="saveWorkout()">Workout opslaan</button><button class="cancel" onclick="cancelEdit()">Annuleren</button>'+(editWid?'<button class="cancel" style="color:#e5484d;border-color:#f3b8ba" onclick="delWorkout(\''+editWid+'\')">Verwijderen</button>':'')+'</div>'+
    '<div class="msg" id="wmsg" style="font-size:11px;min-height:0"></div>';
}
function startEdit(ds,idx){editWid=null;editDay=ds;editIdx=idx;renderMonth({skipFetch:true});}
function editWorkout(wid,idx){const w=monthWorkouts[wid];if(!w)return;editWid=wid;editDay=w.workout_date;editIdx=idx;renderMonth({skipFetch:true});}
function cancelEdit(){editWid=null;editDay=null;renderMonth({skipFetch:true});}

let monthResults={},monthByDate={},monthNotes={},monthMedia={},monthComments=[],dnDatum=null;
// Reacties-knop op een kalenderkaart: teller + rood bolletje bij ongelezen van het lid.
function cardComBtn(w){
  const cmts=monthComments.filter(m=>m.workout_id===w.id);
  const onge=cmts.filter(m=>m.author_id===m.athlete_id&&!m.read_at).length;
  const dot=onge?'<span class="wcdot">'+onge+'</span>':'';
  return '<button class="combtn" onclick="event.stopPropagation();openDayComments(\''+w.id+'\',\''+esc(calClient)+'\')"><svg class="i sm-i"><use href="#i-chat"/></svg> Reacties'+(cmts.length?' ('+cmts.length+')':'')+dot+'</button>';
}
function mcardHtml(w){
  const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  if(!blocks.length&&/^rest ?day$/i.test((w.title||"").trim())){
    return '<div class="mcard planned'+(selWids.has(w.id)?' selected':'')+'" onclick="editWorkout(\''+w.id+'\',0)">'+cardTools(w)+
      '<div class="msc"><span style="color:#27b376">Rest Day</span></div>'+
      '<div class="cblk"><div class="pr" style="color:#8a919c">No instructions</div></div>'+
      cardComBtn(w)+'</div>';
  }
  let done=0,total=0,inner="";
  if(w.warmup)inner+='<div class="cblk k-grijs"><div class="n">Warmup'+(w.warmup_oefening_id?' 🎥':'')+'</div><div class="pr">'+esc(w.warmup)+'</div></div>';
  blocks.forEach(b=>{
    total++;
    const r=monthResults[b.id];
    if(r&&r.status==="completed")done++;
    const kleur=b.color?' k-'+esc(b.color):'';
    const lk=b.linked?' linked2':'';
    const pr=composePresc(b);
    const sc=resultScoreTxt(r);
    // Video-uploads van het lid: kleine tegels achter het resultaat, klik = groot afspelen
    const vids=(monthMedia[b.id]||[]).map(v=>'<span class="vidtile" title="Video van het lid" onclick="event.stopPropagation();vidSpeel(\''+esc(v.storage_path)+'\')">▶</span>').join("");
    inner+='<div class="cblk'+kleur+lk+'"><div class="n">'+esc(b.label||"")+') '+esc(b.exercise||"")+'</div>'+
      (pr?'<div class="pr">'+esc(pr)+'</div>':'')+
      ((sc||vids)?'<div class="loginp" style="display:flex;align-items:center;gap:6px"><span style="flex:1">'+esc(sc||"")+'</span>'+vids+'</div>':'')+
      ((r&&r.note)?'<div class="pr" style="font-style:italic;color:#8a919c" title="Notitie van het lid">💬 '+esc(r.note)+'</div>':'')+
      (r?'<span class="okc'+(r.status==="missed"?' miss':'')+'"><svg class="i"><use href="#'+(r.status==="missed"?'i-x':'i-check')+'"/></svg></span>':'')+
      '</div>';
  });
  if(w.cooldown)inner+='<div class="cblk k-grijs"><div class="n">Cooldown'+(w.cooldown_oefening_id?' 🎥':'')+'</div><div class="pr">'+esc(w.cooldown)+'</div></div>';
  return '<div class="mcard'+(done===0?' planned':'')+(selWids.has(w.id)?' selected':'')+'" onclick="editWorkout(\''+w.id+'\',0)">'+cardTools(w)+
    '<div class="msc"><span class="wtitle">'+esc(w.title||"Workout")+'</span><span class="wright"><span class="wcount">'+done+'/'+total+'</span></span></div>'+inner+
    cardComBtn(w)+'</div>';
}
// Zweefmenu (bewerken/kopiëren/verwijderen) + selectievakje op elke workout-kaart.
function cardTools(w){
  // Op vandaag of een dag die al is geweest laat het potloodje de coach scores invoeren voor de klant
  // (bijv. bij PT of als het lid het loggen vergeet). Voor toekomstige dagen bewerkt het de workout.
  const scoreDag=(w.blocks||[]).length>0&&w.workout_date<=todayStr();
  return '<input type="checkbox" class="cardsel"'+(selWids.has(w.id)?' checked':'')+' title="Selecteren" onclick="event.stopPropagation();toggleSelect(this,\''+w.id+'\')">'+
    '<span class="cardtools" onclick="event.stopPropagation()">'+
    '<button title="'+(scoreDag?'Scores invoeren':'Bewerken')+'" onclick="event.stopPropagation();'+(scoreDag?'openResults(\''+w.id+'\')':'editWorkout(\''+w.id+'\',0)')+'"><svg class="i sm-i"><use href="#i-pen"/></svg></button>'+
    '<button class="mv" title="Sleep naar een andere dag" draggable="true" ondragstart="dragStart(event,\''+w.id+'\')" ondragend="dragEnd(event)" onclick="return false"><svg class="i sm-i"><use href="#i-move"/></svg></button>'+
    '<button title="Kopiëren naar een andere dag" onclick="event.stopPropagation();kopieerWorkout(\''+w.id+'\')"><svg class="i sm-i"><use href="#i-copy"/></svg></button>'+
    '<button title="Verwijderen" onclick="event.stopPropagation();delWorkout(\''+w.id+'\')"><svg class="i sm-i"><use href="#i-trash"/></svg></button>'+
    '</span>';
}
function toggleSelect(cb,wid){if(cb.checked)selWids.add(wid);else selWids.delete(wid);const card=cb.closest(".mcard");if(card)card.classList.toggle("selected",cb.checked);selBarUpdate();}
function selClear(){selWids.clear();document.querySelectorAll(".mcard.selected").forEach(c=>c.classList.remove("selected"));document.querySelectorAll(".cardsel:checked").forEach(c=>c.checked=false);selBarUpdate();}
function selKopieer(){
  const ws=[...selWids].map(id=>monthWorkouts[id]).filter(Boolean);
  if(!ws.length){toast("Niets geselecteerd");return;}
  KLEMBORD=ws.map(wTemplate);
  toast(ws.length+" workout"+(ws.length>1?"s":"")+" gekopieerd, ga naar een dag en kies Plakken");
}
async function selVerwijder(){
  const ids=[...selWids];
  if(!ids.length)return;
  if(!confirm(ids.length+" workout"+(ids.length>1?"s":"")+" verwijderen?"))return;
  const{error}=await db.from("workouts").delete().in("id",ids);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  if(ids.includes(editWid)){editWid=null;editDay=null;}
  selWids.clear();selBarUpdate();
  toast(ids.length+" verwijderd");renderMonth();
}
function selBarUpdate(){
  let bar=document.getElementById("selbar");
  if(!selWids.size){if(bar)bar.remove();return;}
  if(!bar){bar=document.createElement("div");bar.id="selbar";document.body.appendChild(bar);}
  bar.innerHTML='<span class="n">'+selWids.size+'</span><span>geselecteerd</span><button class="lnk" onclick="selClear()">Selectie wissen</button>'+
    '<button class="ic" title="Klaarzetten om te plakken" onclick="selKopieer()"><svg class="i sm-i"><use href="#i-copy"/></svg></button>'+
    '<button class="ic" title="Verwijderen" onclick="selVerwijder()"><svg class="i sm-i"><use href="#i-trash"/></svg></button>';
}
// Slepen van een workout naar een andere dag (via de move-greep in het zweefmenu).
function dragStart(ev,wid){
  dragWid=wid;
  try{ev.dataTransfer.effectAllowed="move";ev.dataTransfer.setData("text/plain",wid);}catch(e){}
  const card=ev.target.closest(".mcard");
  if(card&&ev.dataTransfer.setDragImage)ev.dataTransfer.setDragImage(card,24,18);
}
function dragEnd(){dragWid=null;document.querySelectorAll(".mday.dragover").forEach(c=>c.classList.remove("dragover"));}
function dragOver(ev,cell){if(!dragWid)return;ev.preventDefault();cell.classList.add("dragover");}
function dragLeave(cell){cell.classList.remove("dragover");}
async function dropDay(ev,ds){
  ev.preventDefault();
  document.querySelectorAll(".mday.dragover").forEach(c=>c.classList.remove("dragover"));
  const wid=dragWid;dragWid=null;
  if(!wid)return;
  const w=monthWorkouts[wid];
  if(!w||w.workout_date===ds)return; // niks te doen als je op dezelfde dag loslaat
  const{error}=await db.from("workouts").update({workout_date:ds}).eq("id",wid);
  if(error){toast(error.message||"Verplaatsen mislukt");return;}
  if(editWid===wid){editWid=null;editDay=null;}
  toast("Workout verplaatst");renderMonth();
}
// ---------- GESCHIEDENIS-ZOeker (History-knop): wat deed dit lid eerder? ----------
let histTabF="oef",histTimer=null,histData={oef:[],wo:[],mx:[]};
function ensureHistModal(){
  if(document.getElementById("histmodal"))return;
  const wrap=document.createElement("div");
  wrap.innerHTML='<div class="lmodal" id="histmodal" style="z-index:420"><div class="box" style="width:720px;max-width:96vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px"><h3 style="margin:0">Zoek in geschiedenis</h3>'+
    '<span onclick="closeHist()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><div class="search2" style="flex:1;max-width:none;min-width:220px"><input id="hist-zoek" placeholder="Zoek een oefening, workout of metric…" oninput="histZoekDebounce()"></div>'+
    '<label class="pf-toggle" style="margin:0;white-space:nowrap"><input type="checkbox" id="hist-exact" checked onchange="histZoek()"><span class="pf-sw"></span> Alleen exacte match</label></div>'+
    '<div class="seg" id="hist-tabs" style="margin-bottom:12px"><button class="on" onclick="histTab(\'oef\')">Oefeningen <b id="hist-c-oef">0</b></button><button onclick="histTab(\'wo\')">Workouts <b id="hist-c-wo">0</b></button><button onclick="histTab(\'mx\')">Metrics <b id="hist-c-mx">0</b></button></div>'+
    '<div id="hist-lijst" style="max-height:56vh;overflow:auto"></div>'+
    '</div></div>';
  document.body.appendChild(wrap.firstChild);
  document.getElementById("histmodal").addEventListener("click",e=>{if(e.target.id==="histmodal")closeHist();});
}
function openHistory(name){
  ensureHistModal();
  histTabF="oef";
  const inp=document.getElementById("hist-zoek");if(inp)inp.value=(name||"").trim();
  const ex=document.getElementById("hist-exact");if(ex)ex.checked=true;
  document.querySelectorAll("#hist-tabs button").forEach((b,i)=>b.classList.toggle("on",i===0));
  document.getElementById("histmodal").classList.add("show");
  histZoek();
  if(inp){inp.focus();inp.select();}
}
function closeHist(){const m=document.getElementById("histmodal");if(m)m.classList.remove("show");}
function histZoekDebounce(){clearTimeout(histTimer);histTimer=setTimeout(histZoek,250);}
function histCountsZet(a,b,c){const s=(id,n)=>{const el=document.getElementById(id);if(el)el.textContent=n;};s("hist-c-oef",a);s("hist-c-wo",b);s("hist-c-mx",c);}
async function histZoek(){
  const inp=document.getElementById("hist-zoek");if(!inp)return;
  const q=(inp.value||"").trim();
  const exact=!!(document.getElementById("hist-exact")||{}).checked;
  const host=document.getElementById("hist-lijst");
  if(q.length<2){histData={oef:[],wo:[],mx:[]};histCountsZet(0,0,0);if(host)host.innerHTML='<div class="cempty">Typ minstens 2 tekens om te zoeken.</div>';return;}
  if(host)host.innerHTML='<div class="cempty">Zoeken…</div>';
  const pat=exact?q:"%"+q+"%";
  // Oefeningen: workouts van dit lid met een blok waarvan de oefeningsnaam matcht (blocks!inner filtert de blokken).
  const{data:wrows}=await db.from("workouts").select("id,title,workout_date,blocks!inner(label,exercise,prescription,notes)").eq("client_id",calClient).ilike("blocks.exercise",pat).order("workout_date",{ascending:false}).limit(60);
  const oef=[];(wrows||[]).forEach(w=>(w.blocks||[]).forEach(b=>oef.push({title:w.title,date:w.workout_date,label:b.label,exercise:b.exercise,prescription:b.prescription,notes:b.notes})));
  // Workouts op titel
  const{data:worows}=await db.from("workouts").select("id,title,workout_date").eq("client_id",calClient).ilike("title",pat).order("workout_date",{ascending:false}).limit(60);
  const wo=(worows||[]).filter(w=>!/^rest ?day$/i.test((w.title||"").trim()));
  // Metrics op naam
  const{data:mrows}=await db.from("metrics").select("*").eq("athlete_id",calClient).ilike("metric",pat).order("measured_at",{ascending:false}).limit(60);
  const mx=mrows||[];
  histData={oef,wo,mx};
  histCountsZet(oef.length,wo.length,mx.length);
  histRender();
}
function histTab(t){
  histTabF=t;
  const btns=document.querySelectorAll("#hist-tabs button");btns.forEach(b=>b.classList.remove("on"));
  const idx={oef:0,wo:1,mx:2}[t];if(btns[idx])btns[idx].classList.add("on");
  histRender();
}
function histRender(){
  const host=document.getElementById("hist-lijst");if(!host)return;
  if(histTabF==="oef"){
    host.innerHTML=histData.oef.map(b=>'<div class="histcard"><div class="hh"><b>'+esc(b.title||"Workout")+'</b><span class="sm muted">'+esc(b.date?datumNL(b.date):"")+'</span></div>'+
      '<div class="hbody"><span class="hlabel">'+esc(b.label||"")+'</span>'+esc(b.exercise||"")+
      (b.prescription?'<div class="hpr">'+esc(b.prescription)+'</div>':'')+(b.notes?'<div class="hpr">'+esc(b.notes)+'</div>':'')+'</div></div>').join("")||'<div class="cempty">Geen oefeningen gevonden.</div>';
  }else if(histTabF==="wo"){
    host.innerHTML=histData.wo.map(w=>'<div class="histcard"><div class="hh"><b>'+esc(w.title||"Workout")+'</b><span class="sm muted">'+esc(w.workout_date?datumNL(w.workout_date):"")+'</span></div></div>').join("")||'<div class="cempty">Geen workouts gevonden.</div>';
  }else{
    host.innerHTML=histData.mx.map(m=>'<div class="histcard"><div class="hh"><b>'+esc(m.metric||"")+'</b><span class="sm muted">'+esc(m.measured_at?datumNL(m.measured_at):"")+'</span></div><div class="hbody">'+esc((m.value!=null?String(m.value):(m.value_text||""))+(m.unit?" "+m.unit:""))+'</div></div>').join("")||'<div class="cempty">Geen metrics gevonden.</div>';
  }
}
async function renderMonth(opts){
  if(activePanel!=="kalender")return;
  const id=calClient;const m=document.getElementById("cmain");if(!m)return;
  const alGetekend=!!document.getElementById("calwrap");
  // skipFetch: her-render zonder database-oproep (bouwer openen/sluiten verandert geen data)
  const skipFetch=!!(opts&&opts.skipFetch)&&alGetekend&&monthByDate;
  // Alleen bij de eerste opbouw een spinner tonen; her-renders houden de kalender staan (geen herlaad-flits)
  if(!alGetekend)m.innerHTML='<div class="spin">Laden…</div>';
  const p=coachClients.find(x=>x.id===id)||{};
  const ref=calRef;
  // Weergave bepaalt het bereik: maand = 6 weken, week = 7 dagen, dag = 1 dag
  let gridStart,cellCount,cols;
  if(calView==="maand"){gridStart=mondayOf(new Date(ref.getFullYear(),ref.getMonth(),1));cellCount=kalWeken*7;cols=7;if(kalScrollDoel==null&&prevScrollY==null)prevScrollY=window.scrollY;}
  else if(calView==="week"){gridStart=mondayOf(ref);cellCount=7;cols=7;}
  else{gridStart=new Date(ref);gridStart.setHours(0,0,0,0);cellCount=1;cols=1;}
  const gridEnd=addDays(gridStart,cellCount-1);
  let byDate;
  if(skipFetch){
    byDate=monthByDate; // hergebruik de al geladen workouts/results, geen database-oproep
  }else{
    const{data:workouts,error:werr}=await db.from("workouts").select("*, blocks(*)").eq("client_id",id).gte("workout_date",ymd(gridStart)).lte("workout_date",ymd(gridEnd)).order("workout_date");
    // Een mislukte opvraag mag nooit stil een lege kalender opleveren.
    if(werr)toast("Kalender kon niet laden: "+(werr.message||"onbekende fout")+" — ververs de pagina of probeer opnieuw.");
    monthWorkouts={};monthByDate={};byDate=monthByDate;(workouts||[]).forEach(w=>{monthWorkouts[w.id]=w;(byDate[w.workout_date]=byDate[w.workout_date]||[]).push(w);});
    // Gelogde resultaten van dit lid voor de zichtbare workouts (per blok)
    monthResults={};monthMedia={};monthComments=[];
    const wids=(workouts||[]).map(w=>w.id);
    if(wids.length){
      const{data:res}=await db.from("results").select("*").eq("athlete_id",id).in("workout_id",wids);
      (res||[]).forEach(r=>{monthResults[r.block_id]=r;});
      // Video-uploads van het lid (kleine tegels achter de resultaten)
      const{data:mds}=await db.from("result_media").select("*").eq("athlete_id",id).in("workout_id",wids).order("created_at");
      (mds||[]).forEach(m=>{(monthMedia[m.block_id]=monthMedia[m.block_id]||[]).push(m);});
      // Dag-reacties (voor de Reacties-knop op de kaarten)
      const{data:wcs}=await db.from("workout_comments").select("*").eq("athlete_id",id).in("workout_id",wids).order("created_at");
      monthComments=wcs||[];
    }
    // Dag-notities voor het zichtbare bereik
    monthNotes={};
    const{data:dns}=await db.from("day_notes").select("*").eq("athlete_id",id).gte("note_date",ymd(gridStart)).lte("note_date",ymd(gridEnd));
    (dns||[]).forEach(n=>{monthNotes[n.note_date]=n;});
  }
  const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  let label;
  if(calView==="maand"){const basis=kalLabelMaand||ref;label=cap(MAANDVOL[basis.getMonth()])+" "+basis.getFullYear();}
  else if(calView==="week")label=gridStart.getDate()+" "+MAANDKORT[gridStart.getMonth()]+" – "+gridEnd.getDate()+" "+MAANDKORT[gridEnd.getMonth()]+" "+gridEnd.getFullYear();
  else label=cap(DAGVOL[(gridStart.getDay()+6)%7])+" "+gridStart.getDate()+" "+MAANDKORT[gridStart.getMonth()]+" "+gridStart.getFullYear();
  const seg=[["dag","Dag"],["week","Week"],["maand","Maand"]].map(v=>'<button class="'+(calView===v[0]?"on":"")+'" onclick="kalSetView(\''+v[0]+'\')">'+v[1]+'</button>').join("");
  // Coach-chip: eigenaar/platform_admin mogen van coach wisselen; een coach ziet alleen zijn eigen klanten (chip verborgen).
  const isStaff=myRole()!=="coach";
  const coachNaamTxt=coachChipNaam||"";
  const coachAantal=actieveKlanten().filter(k=>k.coach_id===coachFilterId).length;
  const coachChip=isStaff?
    '<div class="progsel" id="coachsel" style="margin-left:auto" onclick="toggleCoachDrop(event)"><div class="pav" style="background:linear-gradient(135deg,#171719,#3a3f47)">'+esc((coachNaamTxt||"C").slice(0,1).toUpperCase())+'</div><div><div class="pn" id="cs-coach">'+(coachNaamTxt?'Coach '+esc(coachNaamTxt):'Geen coach')+'</div><div class="pt">'+coachAantal+' '+(coachAantal===1?'klant':'klanten')+'</div></div><span class="car">▾</span>'+
      '<div class="progdrop" id="coachdrop" style="width:260px" onclick="event.stopPropagation()"><div class="pd-lijst" id="cd-lijst"><div class="cempty" style="padding:10px">Coaches laden…</div></div></div></div>'
    :'';
  // Klant-dropdown: staff ziet de klanten van de gekozen coach; een coach ziet zijn eigen lijst.
  let dropKlanten=isStaff?actieveKlanten().filter(k=>k.coach_id===coachFilterId):actieveKlanten();
  if(!dropKlanten.some(k=>k.id===p.id))dropKlanten=dropKlanten.concat([p]);
  const calhead='<div class="calhead">'+
    '<button class="btn ghost sm" onclick="renderCoach(\'clients\')">‹ Alle klanten</button>'+
    '<span class="month" id="mnd-label">'+label+'</span>'+
    '<div class="navarrows"><button onclick="prevMonth()">‹</button><button onclick="nextMonth()">›</button></div>'+
    '<button class="btn ghost sm" onclick="thisMonth()">Vandaag</button>'+
    '<div class="seg">'+seg+'</div>'+
    coachChip+
    '<div class="progsel" id="klantsel"'+(isStaff?'':' style="margin-left:auto"')+' onclick="toggleKlantDrop(event)"><div class="pav" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div><div><div class="pn">'+naamVan(p)+'</div><div class="pt">Klant</div></div><span class="car">▾</span>'+
      '<div class="progdrop" id="klantdrop" onclick="event.stopPropagation()"><div class="pd-search"><svg class="i sm-i"><use href="#i-search"/></svg><input placeholder="Zoek een klant…" oninput="filterKlantDrop(this.value)"></div><div class="pd-lijst" id="kd-lijst">'+
      dropKlanten.slice().sort((a,b)=>naamVan(a).localeCompare(naamVan(b))).map(k=>'<div class="pd-row'+(k.id===p.id?' actief':'')+'" data-n="'+esc(naamVan(k).toLowerCase())+'" onclick="openClient(\''+k.id+'\')"><div class="pd-badge" style="'+avFotoStyle(k)+'">'+avFotoText(k)+'</div><div class="pd-naam">'+naamVan(k)+'</div><span class="pd-vink"><svg class="i sm-i"><use href="#i-check"/></svg></span></div>').join("")+
      '</div></div></div>'+
    '<button class="tgl'+(hideScores?" on":"")+'" onclick="toggleScores(this)"><span class="sw"></span> Zonder scores</button>'+
    '<button class="btn ghost sm" title="Print of bewaar als PDF" onclick="window.print()"><svg class="i sm-i"><use href="#i-dl"/></svg> Export PDF</button>'+
    '</div>';
  const headDays=calView==="dag"?[DAGEN[(gridStart.getDay()+6)%7]]:DAGEN;
  const head=headDays.map(d=>'<div>'+d+'</div>').join("");
  const gridStyle=cols===1?' style="grid-template-columns:1fr"':'';
  let weeks="";
  for(let wk=0;wk<cellCount/cols;wk++){
    let cells="",editCol=-1;
    for(let i=0;i<cols;i++){
      const d=addDays(gridStart,wk*cols+i),ds=ymd(d),isToday=ds===todayStr(),dim=calView==="maand"&&d.getMonth()!==ref.getMonth(),editing=ds===editDay;
      const dayWos=byDate[ds]||[];
      const dnum=(d.getDate()===1?MAANDKORT[d.getMonth()]+" ":"")+d.getDate();
      // Elke dag: documentje (dag-notitie; oranje als er een notitie staat) + rust-chip + dagnummer
      const dagNoot=monthNotes[ds];
      let inner='<div class="mday-top"><svg class="i" onclick="event.stopPropagation();openDayNote(\''+ds+'\')" style="cursor:pointer'+(dagNoot?';color:#e7a44a':'')+'"><use href="#i-doc"/></svg><span class="restchip">rust</span><span class="dnum2'+(isToday?' today':'')+'">'+dnum+'</span></div>'+
        (dagNoot?'<div class="daynoot" onclick="event.stopPropagation();openDayNote(\''+ds+'\')">'+esc(dagNoot.body)+'</div>':'');
      let selectable=false;
      if(editing){
        editCol=i; // deze kolom breder maken zodat de bouwer meer ruimte krijgt
        inner+=dayWos.filter(w=>w.id!==editWid).map(mcardHtml).join("");
        inner+='<div class="ib2" onclick="event.stopPropagation()">'+inlineBuilderHtml(editWid?monthWorkouts[editWid]:null)+'</div>';
      }else if(dayWos.length){
        inner+='<div class="addrow2"><button class="addnewbtn" onclick="openDayMenu(event,\''+ds+'\')">+ Add New</button><button class="sqbtn" title="Kopieer de workout van deze dag" onclick="event.stopPropagation();kopieerDag(\''+ds+'\')"><svg class="i sm-i"><use href="#i-copy"/></svg></button></div>';
        inner+=dayWos.map(mcardHtml).join("");
      }else{
        selectable=true; // lege dag: aanwijzen of klikken opent het dag-menu
      }
      cells+='<div class="mday'+(selectable?' selectable':'')+(calView!=="maand"?" tall":"")+(isToday?' today-cell':'')+(dim?' dim2':'')+'" ondragover="dragOver(event,this)" ondragleave="dragLeave(this)" ondrop="dropDay(event,\''+ds+'\')"'+(selectable?' onclick="openDayMenu(event,\''+ds+'\')" onmouseenter="openDayMenu(event,\''+ds+'\')" onmouseleave="dagLeave(this)"':'')+'>'+inner+'</div>';
    }
    // maand-scheidingsbalk vóór de week waarin een nieuwe maand begint (zoals CoachRx)
    if(calView==="maand"&&wk>0){
      const wkStart=addDays(gridStart,wk*cols);
      for(let i=0;i<7;i++){
        const dd=addDays(wkStart,i);
        if(dd.getDate()===1){
          const t=MAANDVOL[dd.getMonth()];
          weeks+='<div class="mlabel" data-manchor="m-'+dd.getFullYear()+'-'+dd.getMonth()+'">'+t.charAt(0).toUpperCase()+t.slice(1)+' '+dd.getFullYear()+'</div>';
          break;
        }
      }
    }
    // Bouwer open? geef die kolom in deze rij meer breedte (zoals CoachRx) voor beter overzicht.
    let rowStyle=gridStyle;
    if(cols===7&&editCol>=0){
      const parts=[];for(let c=0;c<7;c++)parts.push(c===editCol?"1.9fr":"1fr");
      rowStyle=' style="grid-template-columns:'+parts.join(" ")+'"';
    }
    weeks+='<div class="mrow" data-d="'+ymd(addDays(gridStart,wk*cols))+'"'+rowStyle+'>'+cells+'</div>';
  }
  if(activePanel!=="kalender")return;
  m.innerHTML=calhead+'<div class="calscroll'+(hideScores?" noscores":"")+'" id="calwrap"><div class="mhead7"'+gridStyle+'>'+head+'</div>'+weeks+'</div>';
  if(editDay){relabel();groei();}
  selBarUpdate();
  if(calView==="maand"){
    kalScrollBind();
    // dagenbalk plakt onder de (variabele) kalenderkop
    const ch=m.querySelector(".calhead"),pg=document.getElementById("cpage");
    if(ch&&pg)pg.style.setProperty("--calh",Math.round(ch.getBoundingClientRect().height)+"px");
    if(kalScrollDoel){const doel=kalScrollDoel;kalScrollDoel=null;prevScrollY=null;requestAnimationFrame(()=>{kalScrollNaar(doel,true);setTimeout(kalLabelUpdate,80);});}
    else if(prevScrollY!=null){const y=prevScrollY;prevScrollY=null;window.scrollTo(0,y);kalLabelUpdate();}
  }
}
async function delWorkout(wid){if(!confirm("Deze workout verwijderen?"))return;await db.from("workouts").delete().eq("id",wid);if(editWid===wid){editWid=null;editDay=null;}renderMonth();}

// ---------- Dag-menu, klembord en Template invoegen (zoals het ontwerp) ----------
let curDay=null,KLEMBORD=null,insDoel="cel",insTypeF="all",insKleur="",insBlog=[],selWids=new Set(),dragWid=null;
function groei(){document.querySelectorAll(".ib2 textarea").forEach(t=>{t.style.height="auto";t.style.height=t.scrollHeight+"px";});}
document.addEventListener("input",e=>{if(e.target.matches&&e.target.matches(".ib2 textarea")){e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}});
function openDayMenu(ev,ds){
  ev.stopPropagation();
  curDay=ds;
  document.querySelectorAll(".daymenu").forEach(x=>x.remove());
  const cell=ev.target.closest(".mday");if(!cell)return;
  const d=document.createElement("div");d.className="daymenu";
  d.innerHTML='<button title="Workout toevoegen" onclick="pickWorkout(event)"><svg class="i"><use href="#i-link"/></svg> Workout</button>'+
    '<button title="Dag op rustdag zetten" onclick="pickRest(event)"><svg class="i"><use href="#i-walk"/></svg> Rustdag</button>'+
    '<button title="Template of weekworkout invoegen" onclick="pickProgram(event)"><svg class="i"><use href="#i-doc"/></svg> Programma</button>'+
    '<button title="Gekopieerde workout plakken" onclick="pickPaste(event)"><svg class="i"><use href="#i-copy"/></svg> Plakken</button>';
  const addrow=cell.querySelector(".addrow2");
  if(addrow)addrow.insertAdjacentElement("afterend",d);else cell.appendChild(d);
}
document.addEventListener("click",e=>{
  if(!e.target.closest(".daymenu")&&!e.target.closest(".addnewbtn")&&!e.target.closest(".mday.selectable"))document.querySelectorAll(".daymenu").forEach(x=>x.remove());
  if(!e.target.closest(".progsel"))document.querySelectorAll(".progdrop.show").forEach(d=>d.classList.remove("show"));
});
function dagLeave(cell){const m=cell.querySelector(".daymenu");if(m)m.remove();}
function toggleKlantDrop(ev){ev.stopPropagation();const d=document.getElementById("klantdrop");if(!d)return;const openNu=!d.classList.contains("show");document.querySelectorAll(".progdrop.show").forEach(x=>x.classList.remove("show"));if(openNu)d.classList.add("show");}
function filterKlantDrop(v){const z=(v||"").toLowerCase();document.querySelectorAll("#kd-lijst .pd-row").forEach(r=>{r.style.display=(r.dataset.n||"").includes(z)?"":"none";});}
// ---------- Coach wisselen (alleen eigenaar/platform_admin) ----------
async function laadCoaches(){
  if(coachList.length)return;
  let q=db.from("profiles").select("*").in("role",["coach","eigenaar"]);
  if(ME.profile.company_id)q=q.eq("company_id",ME.profile.company_id);
  const{data}=await q;coachList=data||[];
}
function vulCoachDrop(){
  const host=document.getElementById("cd-lijst");if(!host)return;
  const rows=coachList.slice().sort((a,b)=>naamVan(a).localeCompare(naamVan(b))).map(c=>{
    const n=actieveKlanten().filter(k=>k.coach_id===c.id).length;
    const rol=c.role==="eigenaar"?" · eigenaar":"";
    return '<div class="pd-row'+(c.id===coachFilterId?' actief':'')+'" onclick="kiesCoach(\''+c.id+'\')"><div class="pd-badge" style="'+avFotoStyle(c)+'">'+avFotoText(c)+'</div><div class="pd-naam">'+naamVan(c)+' <span class="muted" style="font-weight:500">('+n+rol+')</span></div><span class="pd-vink"><svg class="i sm-i"><use href="#i-check"/></svg></span></div>';
  }).join("");
  host.innerHTML=rows||'<div class="cempty" style="padding:10px">Geen coaches gevonden.</div>';
}
async function toggleCoachDrop(ev){
  ev.stopPropagation();
  const d=document.getElementById("coachdrop");if(!d)return;
  const openNu=!d.classList.contains("show");
  document.querySelectorAll(".progdrop.show").forEach(x=>x.classList.remove("show"));
  if(!openNu)return;
  d.classList.add("show");
  await laadCoaches();
  if(document.getElementById("coachdrop")&&document.getElementById("coachdrop").classList.contains("show"))vulCoachDrop();
}
function kiesCoach(id){
  const d=document.getElementById("coachdrop");if(d)d.classList.remove("show");
  const klanten=coachClients.filter(k=>k.coach_id===id).sort((a,b)=>naamVan(a).localeCompare(naamVan(b)));
  if(!klanten.length){
    const c=coachList.find(x=>x.id===id);
    toast("Deze coach heeft nog geen klanten"+(c?" ("+naamVan(c)+")":""));
    return;
  }
  openClient(klanten[0].id);
}
function pickWorkout(ev){ev.stopPropagation();startEdit(curDay,0);}
async function pickRest(ev){
  ev.stopPropagation();
  const{error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:curDay,title:"Rest Day"});
  if(error){toast(error.message||"Opslaan mislukt");return;}
  toast("Dag ingesteld als rustdag");renderMonth();
}
// Kopieer-sjabloon van één workout (titel/notes/warmup/cooldown + blokken), voor klembord/plakken.
function wTemplate(w){return {date:w.workout_date,title:w.title,coach_notes:w.coach_notes,warmup:w.warmup,cooldown:w.cooldown,warmup_oefening_id:w.warmup_oefening_id,cooldown_oefening_id:w.cooldown_oefening_id,
  blocks:(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort).map(b=>({kind:b.kind,label:b.label,linked:b.linked,exercise:b.exercise,prescription:b.prescription,notes:b.notes,sort:b.sort,color:b.color,score_type:b.score_type,oefening_id:b.oefening_id}))};}
function kopieerDag(ds){
  const wos=monthByDate[ds]||[];
  if(!wos.length){toast("Geen workout op deze dag om te kopiëren");return;}
  KLEMBORD=wos.map(wTemplate);
  toast((KLEMBORD.length>1?KLEMBORD.length+" workouts":"Workout")+" gekopieerd, ga naar een dag en kies Plakken");
}
function kopieerWorkout(wid){
  const w=monthWorkouts[wid];if(!w)return;
  KLEMBORD=[wTemplate(w)];
  toast("Workout gekopieerd, ga naar een dag en kies Plakken");
}
// Datum n dagen na een YYYY-MM-DD (midden op de dag, veilig voor zomertijd).
function ymdPlus(base,days){const d=new Date(base+"T12:00:00");d.setDate(d.getDate()+days);return ymd(d);}
function dagenTussen(a,b){return Math.round((new Date(a+"T12:00:00")-new Date(b+"T12:00:00"))/86400000);}
async function pickPaste(ev){
  ev.stopPropagation();
  if(!KLEMBORD||!KLEMBORD.length){toast("Nog niets gekopieerd, gebruik het kopieer-icoon of selecteer workouts");return;}
  // Behoud de onderlinge dag-afstand: vroegste kopie op de gekozen dag, de rest met dezelfde offset.
  const base=KLEMBORD.reduce((m,t)=>(t.date&&(m===null||t.date<m)?t.date:m),null);
  for(const t of KLEMBORD){
    const off=(t.date&&base)?dagenTussen(t.date,base):0;
    const datum=off?ymdPlus(curDay,off):curDay;
    const{data:w,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:datum,title:t.title,coach_notes:t.coach_notes,warmup:t.warmup,cooldown:t.cooldown,warmup_oefening_id:t.warmup_oefening_id,cooldown_oefening_id:t.cooldown_oefening_id}).select().single();
    if(error){toast(error.message||"Plakken mislukt");return;}
    if(t.blocks.length){const{error:be}=await db.from("blocks").insert(t.blocks.map(b=>Object.assign({workout_id:w.id},b)));if(be){toast(be.message);return;}}
  }
  toast(KLEMBORD.length>1?KLEMBORD.length+" workouts geplakt":"Workout geplakt");renderMonth();
}
async function laadInsBlog(){
  if(!ME.profile.company_id){insBlog=[];return;}
  const{data}=await db.from("workouts").select("*, blocks(*)").eq("company_id",ME.profile.company_id).eq("audience","blog").is("blog_program_id",null).order("workout_date",{ascending:false}).limit(10);
  insBlog=data||[];
}
async function pickProgram(ev){ev.stopPropagation();insDoel="cel";await openInsModal("op "+curDay);}
function openInsBouwer(){insDoel="bouwer";openInsModal("als blok in deze workout");}
async function openInsModal(lbl){
  ensureLibModals();
  insTypeF="all";insKleur="";
  document.getElementById("ins-dag").textContent=lbl;
  const z=document.getElementById("ins-zoek");if(z)z.value="";
  document.querySelectorAll("#ins-types button").forEach((b,i)=>b.classList.toggle("on",i===0));
  document.getElementById("insmodal").classList.add("show");
  document.getElementById("ins-lijst").innerHTML='<div class="cempty">Templates laden…</div>';
  if(!LIB.geladen)await libLaad();
  await laadInsBlog(); // altijd vers: een net aangemaakte weekworkout moet er meteen tussen staan
  insKleurenRender();insRender();
}
function closeIns(){const m=document.getElementById("insmodal");if(m)m.classList.remove("show");}
function insType(t,btn){insTypeF=t;document.querySelectorAll("#ins-types button").forEach(b=>b.classList.remove("on"));btn.classList.add("on");insRender();}
function insKleurenRender(){document.getElementById("ins-kleuren").innerHTML=TPLKLEUREN.map(k=>'<span class="legchip'+(insKleur===k?" aan":"")+'" onclick="insKleurF(\''+k+'\')"><span style="width:12px;height:12px;border-radius:50%;background:'+TPLKLEUR[k]+';flex:none"></span>'+LEGNAAM[k]+'</span>').join("");}
function insKleurF(k){insKleur=insKleur===k?"":k;insKleurenRender();insRender();}
function insRender(){
  const host=document.getElementById("ins-lijst");if(!host)return;
  const v=(document.getElementById("ins-zoek").value||"").toLowerCase().trim();
  const weekRij=w=>{
    // composePresc pakt ook conditioning-tekst (notes), zoals bij weekworkouts uit de Weekworkout-sectie.
    const txt=[w.warmup,...(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort).map(b=>{const pr=composePresc(b);return (b.exercise||"")+(pr?"\n"+pr:"");}),w.cooldown].filter(Boolean).join("\n\n");
    return '<div class="trow" style="align-items:flex-start;background:#f0f8fc"><div style="width:20px;padding-top:4px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:'+TPLKLEUR.blue+'"></span></div>'+
      '<div style="flex:1.6"><b>'+esc(w.title||"Weekworkout")+'</b><div class="sm muted" style="margin-top:2px">weekworkout · gedeeld leaderboard · '+esc(w.workout_date||"")+'</div></div>'+
      '<div style="flex:2.4" class="sm muted">'+esc(txt).replace(/\n/g,"<br>")+'</div>'+
      '<button class="btn sm" style="width:86px;justify-content:center" onclick="insWeekwod(\''+w.id+'\')">Invoegen</button></div>';
  };
  if(insTypeF==="week"){
    host.innerHTML=insBlog.filter(w=>!v||(w.title||"").toLowerCase().includes(v)).map(weekRij).join("")||'<div class="cempty">Nog geen weekworkouts in de database.</div>';
    return;
  }
  const hits=LIB.tpl.filter(o=>{
    if(insTypeF!=="all"&&o.type!==insTypeF)return false;
    if(insKleur&&o.kleur!==insKleur)return false;
    if(!v)return true;
    return (o.naam||"").toLowerCase().includes(v)||(o.instructies||"").toLowerCase().includes(v)||(o.tags||[]).join(" ").toLowerCase().includes(v)||(LEGNAAM[o.kleur]||"").toLowerCase().includes(v);
  });
  let vast="";
  if(insTypeF==="all"&&insBlog.length&&!insKleur&&(!v||(insBlog[0].title||"").toLowerCase().includes(v)))vast=weekRij(insBlog[0]);
  host.innerHTML=vast+hits.map(o=>{
    const soort=o.type==="warmup"?"warm-up":(o.type==="cooldown"?"cooldown":"workout");
    return '<div class="trow" style="align-items:flex-start"><div style="width:20px;padding-top:4px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:'+(TPLKLEUR[o.kleur]||TPLKLEUR.yellow)+'"></span></div>'+
      '<div style="flex:1.6"><b>'+esc(o.naam)+'</b><div class="sm muted" style="margin-top:2px">'+soort+' · '+esc(LEGNAAM[o.kleur]||"")+'</div></div>'+
      '<div style="flex:2.4" class="sm muted">'+esc(o.instructies||"").replace(/\n/g,"<br>")+'</div>'+
      '<button class="btn sm" style="width:86px;justify-content:center" onclick="insInvoegen('+o.id+')">Invoegen</button></div>';
  }).join("")||'<div class="cempty">Geen templates gevonden.</div>';
}
async function insInvoegen(id){
  const o=LIB.tpl.find(x=>x.id===id);if(!o)return;
  const kleur=TPLKLEUREN.includes(o.kleur)?o.kleur:null;
  if(insDoel==="bouwer"){
    const host=document.getElementById("exrows");
    if(host){host.insertAdjacentHTML("beforeend",exRow({exercise:o.naam,prescription:o.instructies,color:kleur}));relabel();groei();}
    closeIns();toast("Template als blok toegevoegd, pas gerust aan");return;
  }
  if(insDoel==="blogcel"){ // invoegen op de blog-kalender (Blog-sectie)
    const{data:w,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,audience:"blog",blog_program_id:BLOG.cur.id,workout_date:insBlogDatum,title:o.naam}).select().single();
    if(error){toast(error.message||"Invoegen mislukt");return;}
    const{error:be}=await db.from("blocks").insert({workout_id:w.id,kind:"exercise",label:"A",exercise:o.naam,prescription:o.instructies||null,sort:1,color:kleur,score_type:"text"});
    if(be){toast(be.message);return;}
    closeIns();toast("Template ingevoegd");await blogHerlaad();return;
  }
  const{data:w,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:curDay,title:o.naam}).select().single();
  if(error){toast(error.message||"Invoegen mislukt");return;}
  const{error:be}=await db.from("blocks").insert({workout_id:w.id,kind:"exercise",label:"A",exercise:o.naam,prescription:o.instructies||null,sort:1,color:kleur,score_type:"text"});
  if(be){toast(be.message);return;}
  closeIns();toast("Template ingevoegd");renderMonth();
}
async function insWeekwod(id){
  const w=insBlog.find(x=>x.id===id);if(!w)return;
  const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  if(insDoel==="bouwer"){
    const txt=blocks.map(b=>{const pr=composePresc(b);return (b.label?b.label+") ":"")+(b.exercise||"")+(pr?"\n"+pr:"");}).join("\n\n");
    const host=document.getElementById("exrows");
    if(host){host.insertAdjacentHTML("beforeend",exRow({exercise:w.title,prescription:txt,color:"blue",source_blog_workout_id:w.id,score_type:(blocks[0]&&blocks[0].score_type)||"text"}));relabel();groei();}
    closeIns();toast("Weekworkout als blok toegevoegd; het lid logt hem met Rx/Scaled en komt op het gedeelde leaderboard");return;
  }
  if(insDoel==="blogcel"){ // weekworkout-kopie op de blog-kalender (Blog-sectie)
    const{data:nw,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,audience:"blog",blog_program_id:BLOG.cur.id,workout_date:insBlogDatum,title:w.title,warmup:w.warmup,cooldown:w.cooldown,warmup_oefening_id:w.warmup_oefening_id,cooldown_oefening_id:w.cooldown_oefening_id,source_blog_workout_id:w.id}).select().single();
    if(error){toast(error.message||"Invoegen mislukt");return;}
    if(blocks.length){
      const{error:be}=await db.from("blocks").insert(blocks.map(b=>({workout_id:nw.id,kind:b.kind,label:b.label,linked:b.linked,exercise:b.exercise,prescription:b.prescription,notes:b.notes,sort:b.sort,color:b.color,score_type:b.score_type,oefening_id:b.oefening_id})));
      if(be){toast(be.message);return;}
    }
    closeIns();toast("Weekworkout ingevoegd in het programma");await blogHerlaad();return;
  }
  const{data:nw,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:curDay,title:w.title,warmup:w.warmup,cooldown:w.cooldown,warmup_oefening_id:w.warmup_oefening_id,cooldown_oefening_id:w.cooldown_oefening_id,source_blog_workout_id:w.id}).select().single();
  if(error){toast(error.message||"Invoegen mislukt");return;}
  if(blocks.length){
    const{error:be}=await db.from("blocks").insert(blocks.map(b=>({workout_id:nw.id,kind:b.kind,label:b.label,linked:b.linked,exercise:b.exercise,prescription:b.prescription,notes:b.notes,sort:b.sort,color:b.color,score_type:b.score_type,oefening_id:b.oefening_id})));
    if(be){toast(be.message);return;}
  }
  closeIns();toast("Weekworkout ingevoegd als eigen kopie; voor het leaderboard logt het lid de weekworkout zelf in de app");renderMonth();
}

// Blokken bijwerken zonder de gelogde scores van het lid te verliezen:
// bestaande blokken (zelfde id) worden ge-update (results blijven via de FK
// gewoon staan), weggehaalde blokken verwijderd, nieuwe toegevoegd.
// Voorheen was dit delete-alles + insert, waardoor elke bewerking door de
// coach alle resultaten van het lid op die workout wiste.
async function syncBlocks(wid,rows){
  const velden=b=>({kind:b.kind,label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription||null,notes:b.notes||null,sort:b.sort,color:b.color||null,score_type:b.score_type||"text",oefening_id:b.oefening_id||null,source_blog_workout_id:b.source_blog_workout_id||null});
  const{data:oud,error:oe}=await db.from("blocks").select("id").eq("workout_id",wid);if(oe)throw oe;
  const oudIds=new Set((oud||[]).map(x=>x.id));
  const weg=[...oudIds].filter(id=>!rows.some(b=>b.id===id));
  if(weg.length){const{error}=await db.from("blocks").delete().in("id",weg);if(error)throw error;}
  for(const b of rows){
    if(b.id&&oudIds.has(b.id)){const{error}=await db.from("blocks").update(velden(b)).eq("id",b.id);if(error)throw error;}
  }
  const nieuw=rows.filter(b=>!(b.id&&oudIds.has(b.id))).map(b=>Object.assign({workout_id:wid},velden(b)));
  if(nieuw.length){const{error}=await db.from("blocks").insert(nieuw);if(error)throw error;}
}
async function saveWorkout(){
  const g=id=>document.getElementById(id);
  const title=g("w_title").value.trim();
  const rows=[...document.querySelectorAll("#exrows .exrow")].map((r,i)=>{const o=rowToObj(r);o.label=r.querySelector(".lbl-badge").textContent;o.sort=i+1;return o;}).filter(b=>b.exercise);
  const wm=g("wmsg");
  if(!title){wm.textContent="Geef de workout een titel.";wm.className="msg err";return;}
  g("saveW").disabled=true;
  const wf={title,coach_notes:g("w_notes").value.trim()||null,warmup:g("w_warmup").value.trim()||null,cooldown:g("w_cooldown").value.trim()||null,warmup_oefening_id:cwLees("warmup"),cooldown_oefening_id:cwLees("cooldown")};
  const mkBlocks=wid=>rows.map(b=>({workout_id:wid,kind:b.kind,label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription||null,notes:b.notes||null,sort:b.sort,color:b.color||null,score_type:b.score_type||"text",oefening_id:b.oefening_id||null,source_blog_workout_id:b.source_blog_workout_id||null}));
  try{
    if(editWid){
      const{error:ue}=await db.from("workouts").update(wf).eq("id",editWid);if(ue)throw ue;
      await syncBlocks(editWid,rows); // bestaande blokken bijwerken: gelogde scores blijven staan
    }else{
      const{data:w,error}=await db.from("workouts").insert(Object.assign({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:editDay},wf)).select().single();
      if(error)throw error;
      if(rows.length){const{error:be}=await db.from("blocks").insert(mkBlocks(w.id));if(be)throw be;}
    }
    editWid=null;editDay=null;renderMonth();
  }catch(e){wm.textContent=e.message||"Opslaan mislukt.";wm.className="msg err";g("saveW").disabled=false;}
}

// ---------- SCORES INVOEREN DOOR DE COACH (results-modal) ----------
// Coach vult de scores in voor een klant, op vandaag of een dag die al is geweest.
function ensureResultsModal(){
  if(document.getElementById("resmodal"))return;
  const wrap=document.createElement("div");
  wrap.innerHTML='<div class="lmodal" id="resmodal" style="z-index:430"><div class="box" style="width:640px;max-width:96vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:4px"><div><h3 style="margin:0" id="res-titel">Workout</h3><div class="sm muted" id="res-sub" style="margin-top:2px"></div></div>'+
    '<span onclick="closeResults()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div class="sm muted" style="margin:8px 0 8px">Vul de scores in voor deze klant. Leeg laten = nog niet gelogd. Klik op het rode kruis om een blok als gemist te markeren.</div>'+
    '<div id="res-body" style="max-height:56vh;overflow:auto"></div>'+
    '<div class="msg" id="res-msg" style="min-height:0"></div>'+
    '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="res-save" onclick="saveResults()">Scores opslaan</button><button class="btn ghost" onclick="closeResults()">Annuleren</button></div>'+
    '</div></div>';
  document.body.appendChild(wrap.firstChild);
  document.getElementById("resmodal").addEventListener("click",e=>{if(e.target.id==="resmodal")closeResults();});
}
function openResults(wid){
  const w=monthWorkouts[wid];if(!w)return;
  const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  if(!blocks.length){editWorkout(wid,0);return;} // geen blokken (bijv. rustdag): dan gewoon bewerken
  ensureResultsModal();
  resWid=wid;
  const p=coachClients.find(x=>x.id===calClient)||{};
  document.getElementById("res-titel").textContent=w.title||"Workout";
  document.getElementById("res-sub").textContent=naamVan(p)+" · "+datumNL(w.workout_date);
  document.getElementById("res-msg").textContent="";
  document.getElementById("res-body").innerHTML=blocks.map(b=>{
    const r=monthResults[b.id]||null;
    const missed=!!(r&&r.status==="missed");
    const val=(r&&!missed)?(r.score_text||resultScoreTxt(r)):"";
    const pr=composePresc(b);
    return '<div class="resrow'+(missed?' missed':'')+'" data-block="'+esc(b.id)+'">'+
      '<div class="resblok"><span class="reslabel">'+esc(b.label||"")+'</span>'+esc(b.exercise||"")+
        (pr?'<div class="respr">'+esc(pr)+'</div>':'')+'</div>'+
      '<div class="resinvoer"><input class="resval" placeholder="Resultaat…" value="'+esc(val)+'"'+(missed?' disabled':'')+'>'+
        '<button class="resmiss'+(missed?' on':'')+'" title="Gemist" onclick="resToggleMissed(this)"><svg class="i sm-i"><use href="#i-x"/></svg></button></div>'+
      '</div>';
  }).join("");
  document.getElementById("resmodal").classList.add("show");
}
function closeResults(){const m=document.getElementById("resmodal");if(m)m.classList.remove("show");resWid=null;}
function resToggleMissed(btn){
  const row=btn.closest(".resrow");if(!row)return;
  const nu=!row.classList.contains("missed");
  row.classList.toggle("missed",nu);btn.classList.toggle("on",nu);
  const inp=row.querySelector(".resval");
  if(nu){inp.value="";inp.disabled=true;}else{inp.disabled=false;inp.focus();}
}
async function saveResults(){
  const wid=resWid;if(!wid){closeResults();return;}
  const msg=document.getElementById("res-msg");
  const upserts=[],deletes=[];
  [...document.querySelectorAll("#res-body .resrow")].forEach(row=>{
    const blockId=row.dataset.block;
    const missed=row.classList.contains("missed");
    const val=(row.querySelector(".resval").value||"").trim();
    const base={block_id:blockId,workout_id:wid,athlete_id:calClient,company_id:ME.profile.company_id,time_seconds:null,load_kg:null,reps:null,rounds:null};
    if(missed)upserts.push(Object.assign({},base,{status:"missed",score_text:null}));
    else if(val)upserts.push(Object.assign({},base,{status:"completed",score_text:val}));
    else if(monthResults[blockId])deletes.push(blockId); // leeggemaakt: bestaande logging verwijderen
  });
  const sb=document.getElementById("res-save");sb.disabled=true;
  try{
    if(upserts.length){const{error}=await db.from("results").upsert(upserts,{onConflict:"block_id,athlete_id"});if(error)throw error;}
    if(deletes.length){const{error}=await db.from("results").delete().eq("athlete_id",calClient).in("block_id",deletes);if(error)throw error;}
    closeResults();toast("Scores opgeslagen");renderMonth();
  }catch(e){msg.textContent=e.message||"Opslaan mislukt.";msg.className="msg err";sb.disabled=false;}
}

// ---------- SNELTOETSEN (zoals het ontwerp: sneller programmeren) ----------
// Groepen met [label, toetsen]. Toetsen door spaties gescheiden = combinatie.
const SNELTOETSEN=[
 ["Kalender",[
  ["Sneltoetsen tonen","?"],
  ["Naar vandaag","T"],
  ["Vorige maand","←"],
  ["Volgende maand","→"],
  ["Workout toevoegen (dag-menu open)","Enter"],
  ["Rustdag (dag-menu open)","R"],
  ["Alles sluiten","Esc"]
 ]],
 ["Bouwer",[
  ["Workout opslaan","Ctrl Enter"],
  ["Bouwer sluiten","Esc"],
  ["Oefening-blok toevoegen","Ctrl Shift O"],
  ["Conditioning-blok toevoegen","Ctrl Shift K"]
 ]],
 ["Panelen",[
  ["Assessment","A"],
  ["Metrics & 1RM","M"],
  ["Doelen","G"],
  ["Notities & documenten","N"],
  ["Chat / berichten","C"],
  ["Trainingsschema","S"],
  ["Prioriteiten","P"],
  ["Materiaal","E"],
  ["Planning & periodisering","Shift P"],
  ["Check-ins & consults","Shift C"]
 ]],
 ["Weergaven",[
  ["Klantprofiel","Shift U"],
  ["Klant wisselen","J"],
  ["Zijbalk in/uitklappen","\\"]
 ]]
];
function keysRender(){
  const host=document.getElementById("keys-lijst");if(!host)return;
  host.innerHTML=SNELTOETSEN.map(g=>'<div class="keygroep">'+esc(g[0])+'</div>'+
    g[1].map(r=>'<div class="keyrow"><span>'+esc(r[0])+'</span><span>'+
      r[1].split(" ").map(k=>'<span class="kbd">'+esc(k)+'</span>').join("")+'</span></div>').join("")
  ).join("");
}
// Het Sneltoetsen-zijpaneel (zelfde patroon als de andere panelen).
function openKeys(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-keys");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");keysRender();return;}
  sp=document.createElement("div");sp.id="sp-keys";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>Sneltoetsen</h3></div><div id="keys-lijst"></div>'+
    '<div class="sp-info" style="margin-top:14px">Paneel-toetsen werken als je niet in een tekstveld typt. De bouwer-toetsen (met Ctrl) werken ook tijdens het typen.</div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  keysRender();
}
// Globale sneltoetsen, alleen actief op het klant-scherm.
document.addEventListener("keydown",e=>{
  if(!calClient||!document.querySelector(".client-layout"))return;
  const tag=(e.target.tagName||"").toLowerCase();
  const typt=tag==="input"||tag==="textarea"||tag==="select"||e.target.isContentEditable;
  const k=(e.key||"").toLowerCase();
  const bouwerOpen=!!document.getElementById("exrows");
  // Bouwer-toetsen: met Ctrl/Cmd, werken OOK tijdens het typen.
  if(e.ctrlKey||e.metaKey){
    if(bouwerOpen){
      if(k==="enter"){e.preventDefault();saveWorkout();return;}
      if(e.shiftKey&&k==="o"){e.preventDefault();addExBtn();return;}
      if(e.shiftKey&&k==="k"){e.preventDefault();addCondBtn();return;}
    }
    return; // overige Ctrl-combinaties met rust laten (kopiëren/plakken enz.)
  }
  // Esc sluit alles: bouwer, panelen, dag-menu, dropdowns en popups.
  if(e.key==="Escape"){
    if(bouwerOpen)cancelEdit();
    document.querySelectorAll(".sidepanel.show").forEach(p=>p.classList.remove("show"));
    document.querySelectorAll(".daymenu").forEach(x=>x.remove());
    document.querySelectorAll(".progdrop.show,.lmodal.show,.exdrop.show,.vidpop.show").forEach(x=>x.classList.remove("show"));
    return;
  }
  if(typt)return; // vanaf hier: alleen als je niet in een veld typt
  if(e.altKey)return;
  // Achter een open modal (templates/geschiedenis/metrics) geen paneel-toetsen afvuren.
  if(document.querySelector(".lmodal.show"))return;
  if(e.key==="?"){e.preventDefault();openKeys();return;}
  if(e.key==="Enter"){
    if(document.querySelector(".daymenu")&&curDay){e.preventDefault();pickWorkout({stopPropagation:function(){}});}
    return;
  }
  if(e.key==="ArrowLeft"){if(activePanel==="kalender"&&calView==="maand"){e.preventDefault();prevMonth();}return;}
  if(e.key==="ArrowRight"){if(activePanel==="kalender"&&calView==="maand"){e.preventDefault();nextMonth();}return;}
  if(e.shiftKey){
    if(k==="u"){e.preventDefault();renderClient("profiel");}
    else if(k==="p"){e.preventDefault();openPlan();}
    else if(k==="c"){e.preventDefault();openCheckin();}
    return;
  }
  if(k==="a"){e.preventDefault();openAssess();}
  else if(k==="m"){e.preventDefault();openMx();}
  else if(k==="g"){e.preventDefault();openGoals();}
  else if(k==="n"){e.preventDefault();openNotes();}
  else if(k==="c"){e.preventDefault();openChatPop();}
  else if(k==="s"){e.preventDefault();openSchema();}
  else if(k==="p"){e.preventDefault();openPrio();}
  else if(k==="e"){e.preventDefault();openEquip();}
  else if(k==="j"){e.preventDefault();toggleKlantDrop({stopPropagation:function(){}});}
  else if(k==="\\"){e.preventDefault();toggleSide();}
  else if(k==="t"){e.preventDefault();if(activePanel==="kalender")thisMonth();else renderClient("kalender");}
  else if(k==="r"){
    if(document.querySelector(".daymenu")&&curDay){e.preventDefault();pickRest({stopPropagation:function(){}});}
  }
});

// ---------- Dag-notitie (het documentje bovenaan elke dag) ----------
// Eén korte notitie per klant per dag (day_notes-tabel); het lid mag hem
// straks in de sporter-app lezen. Oranje icoon + tekstje op de dag = notitie.
function openDayNote(ds){
  dnDatum=ds;
  let m=document.getElementById("dnmodal");
  if(!m){
    m=document.createElement("div");m.id="dnmodal";m.className="lmodal";
    m.innerHTML='<div class="box" style="width:440px;max-width:94vw"><h3>Dag-notitie <span class="muted" id="dn-datum" style="font-weight:600;font-size:12.5px"></span></h3>'+
      '<div class="field"><textarea id="dn-body" style="min-height:110px" placeholder="Bijv. Deload-dag: alles rustig aan, focus op techniek"></textarea></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" onclick="dnOpslaan()">Opslaan</button><button class="btn ghost" onclick="document.getElementById(\'dnmodal\').classList.remove(\'show\')">Annuleren</button>'+
      '<span style="margin-left:auto"><button class="btn ghost" id="dn-del" style="color:#e5484d;border-color:#f3b8ba" onclick="dnVerwijder()">Verwijderen</button></span></div>'+
      '<div class="msg" id="dn-msg"></div></div>';
    document.body.appendChild(m);
  }
  const n=monthNotes[ds];
  document.getElementById("dn-datum").textContent="· "+datumNL(ds);
  document.getElementById("dn-body").value=n?(n.body||""):"";
  document.getElementById("dn-del").style.display=n?"":"none";
  document.getElementById("dn-msg").textContent="";
  m.classList.add("show");
  document.getElementById("dn-body").focus();
}
async function dnOpslaan(){
  const body=(document.getElementById("dn-body").value||"").trim();
  const msg=document.getElementById("dn-msg");
  if(!body){
    if(monthNotes[dnDatum]){await dnVerwijder();return;} // leegmaken = verwijderen
    msg.textContent="Schrijf eerst een notitie.";msg.className="msg err";return;
  }
  const{data,error}=await db.from("day_notes").upsert({company_id:ME.profile.company_id,athlete_id:calClient,note_date:dnDatum,body,created_by:ME.user.id,updated_at:new Date().toISOString()},{onConflict:"athlete_id,note_date"}).select().single();
  if(error){msg.textContent=error.message||"Opslaan mislukt";msg.className="msg err";return;}
  monthNotes[dnDatum]=data||{note_date:dnDatum,body};
  document.getElementById("dnmodal").classList.remove("show");
  toast("Dag-notitie opgeslagen");
  renderMonth({skipFetch:true});
}
async function dnVerwijder(){
  const{error}=await db.from("day_notes").delete().eq("athlete_id",calClient).eq("note_date",dnDatum);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  delete monthNotes[dnDatum];
  document.getElementById("dnmodal").classList.remove("show");
  toast("Dag-notitie verwijderd");
  renderMonth({skipFetch:true});
}
