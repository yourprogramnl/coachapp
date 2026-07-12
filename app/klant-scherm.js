// app/klant-scherm.js — het hart van de coach-app: een klant openen, de
// doorscrollende kalender, workouts programmeren met de bouwer, het dag-menu,
// kopieren/plakken, templates invoegen en workouts opslaan.
let calClient=null,calRef=new Date(),activePanel="kalender",editDay=null,editWid=null,editIdx=0,coachChipNaam="";
const SIDE=[["kalender","i-cal","Kalender",false],["berichten","i-chat","Berichten",true],["assessment","i-clip","Assessment",true],["metrics","i-chart","Metrics & 1RM",true],["checkins","i-check","Check-ins & consults",false],["doelen","i-target","Doelen",true],["planning","i-cal","Planning & periodisering",false],["notities","i-doc","Notities & documenten",true],["schema","i-clock","Trainingsschema",true],["prioriteiten","i-doc","Prioriteiten",true],["materiaal","i-gear","Materiaal",true],["profiel","i-user","Profiel",false],["sneltoetsen","i-keys","Sneltoetsen",true]];
function openClient(id){
  calClient=id;calRef=new Date();editDay=null;editWid=null;coachChipNaam="";
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
    const acties={assessment:"openAssess()",metrics:"openMx()",doelen:"openGoals()",notities:"openNotes()",schema:"openSchema()",prioriteiten:"openPrio()",materiaal:"openEquip()",berichten:"openChatPop()",planning:"openPlan()",checkins:"openCheckin()"};
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
function exRow(b){b=b||{};return '<div class="sec exrow'+(b.linked?' linked':'')+'" data-kind="exercise" data-linked="'+(b.linked?'1':'0')+'" data-kleur="'+esc(b.color||"")+'" data-score="'+esc(b.score_type||"")+'" data-oefid="'+(b.oefening_id||"")+'"><div class="exhead"><b class="lbl-badge">A</b><input class="exn" placeholder="Naam oefening" value="'+esc(b.exercise||"")+'" oninput="exZoek(this)" autocomplete="off"><span class="extools"><button class="ic-btn" title="History" onclick="toast(\'History komt in een volgende stap\');return false"><svg class="i sm-i"><use href="#i-hist"/></svg></button><button class="ic-btn cam'+(b.oefening_id?' has-video':'')+'" title="Demo-video" onclick="toggleVid(this);return false"><svg class="i sm-i"><use href="#i-cam"/></svg></button><button class="ic-btn" title="Blok verwijderen" onclick="delRow(this)"><svg class="i sm-i"><use href="#i-x"/></svg></button></span></div><textarea class="f-presc" rows="1" placeholder="Tempo, reps, sets, rust">'+esc(b.prescription||composePresc(b))+'</textarea>'+rowOpts(b)+rowChip(b)+'<div class="exdrop"></div><div class="vidpop"></div></div>';}
function condRow(b){b=b||{};return '<div class="sec exrow'+(b.linked?' linked':'')+'" data-kind="conditioning" data-linked="'+(b.linked?'1':'0')+'" data-kleur="'+esc(b.color||"")+'" data-score="'+esc(b.score_type||"")+'"><div class="exhead"><b class="lbl-badge">D</b><input class="exn" placeholder="Conditioning format (bijv. AMRAP 12, For time)" value="'+esc(b.exercise||"")+'" autocomplete="off"><span class="extools"><button class="ic-btn" title="History" onclick="toast(\'History komt in een volgende stap\');return false"><svg class="i sm-i"><use href="#i-hist"/></svg></button><button class="ic-btn" title="Blok verwijderen" onclick="delRow(this)"><svg class="i sm-i"><use href="#i-x"/></svg></button></span></div><textarea class="f-desc" rows="1" placeholder="Conditioning-omschrijving, notes, enz.">'+esc(b.notes||"")+'</textarea>'+rowOpts(b)+'</div>';}
function rowToObj(r){const kind=r.dataset.kind,linked=r.dataset.linked==="1",exercise=r.querySelector(".exn").value.trim();const color=r.dataset.kleur||null,score_type=r.dataset.score||"text";const oefening_id=r.dataset.oefid?parseInt(r.dataset.oefid,10):null;if(kind==="conditioning")return{kind,linked,exercise,color,score_type,notes:(r.querySelector(".f-desc").value||"").trim()};return{kind:"exercise",linked,exercise,color,score_type,oefening_id,prescription:r.querySelector(".f-presc").value.trim()};}
// Zoeken in de bibliotheek vanuit de bouwer (zoals het ontwerp)
function exZoek(inp){
  const row=inp.closest(".exrow"),drop=row.querySelector(".exdrop");
  if(!drop)return;
  const v=inp.value.trim().toLowerCase();
  drop.innerHTML="";
  if(v.length<2){drop.classList.remove("show");return;}
  if(!LIB.geladen){libLaad();drop.innerHTML='<div class="hd">Bibliotheek laden…</div>';drop.classList.add("show");return;}
  const hits=LIB.oef.filter(o=>(o.naam||"").toLowerCase().includes(v)||(o.tags||[]).join(" ").toLowerCase().includes(v));
  if(!hits.length){drop.classList.remove("show");return;}
  drop.innerHTML='<div class="hd">Oefeningen ('+hits.length+')</div>'+hits.slice(0,8).map(o=>{
    const bron=o.bron==="coachrx"?"CRx":"YP";
    return '<div class="exopt" onclick="event.stopPropagation();kiesEx(this,'+o.id+')"><div><div class="en">'+esc(o.naam)+'</div><div class="ep">'+esc((o.tags||[]).join(" · ")||(o.youtube_id?"YouTube-video":""))+'</div></div><span class="srcbadge">'+bron+'</span></div>';
  }).join("");
  drop.classList.add("show");
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
function toggleVid(cam){
  const row=cam.closest(".exrow"),vid=row.querySelector(".vidpop");
  if(!vid)return;
  if(vid.classList.contains("show")){vid.classList.remove("show");return;}
  if(!row.dataset.oefid){toast("Kies eerst een oefening uit de bibliotheek");return;}
  const o=LIB.oef.find(x=>String(x.id)===row.dataset.oefid);
  const naam=row.querySelector(".exn").value||"Oefening";
  const yt=o&&o.youtube_id?o.youtube_id:"";
  vid.innerHTML='<span class="vp-x" onclick="event.stopPropagation();this.closest(\'.vidpop\').classList.remove(\'show\')">✕</span><div class="vt">'+esc(naam)+'</div><div class="vprev">'+
    (yt?'<div onclick="event.stopPropagation();speelAf(this,\''+esc(yt)+'\')" style="width:100%;height:100%;position:relative;cursor:pointer"><img src="https://i.ytimg.com/vi/'+esc(yt)+'/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover;display:block" alt=""><span class="pbtn"></span></div>'
      :(o&&o.video_url?'<div class="vlabel">Video: <a href="'+esc(o.video_url)+'" target="_blank" rel="noopener" style="color:#fff">open in nieuw tabblad</a></div>':'<div class="vlabel">Geen video gevonden bij deze oefening</div>'))+
    '</div><div class="vp-cap">'+(yt?"Klik op de video om af te spelen":"Demo-video uit de bibliotheek")+'</div>';
  vid.classList.add("show");
}
function speelAf(el,yt){
  // referrerpolicy is verplicht: zonder afzender-info weigert YouTube met "Fout 153"
  el.outerHTML='<iframe src="https://www.youtube.com/embed/'+yt+'?autoplay=1&rel=0" style="width:100%;height:100%;border:0;display:block" allowfullscreen allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  const pop=document.querySelector(".vidpop.show .vp-cap");
  if(pop)pop.innerHTML='Speelt niet af? <a href="https://youtu.be/'+yt+'" target="_blank" rel="noopener" style="color:#2a9fce">Bekijk op YouTube</a>';
}
document.addEventListener("click",e=>{
  if(!e.target.closest(".exdrop")&&!e.target.closest(".exn"))document.querySelectorAll(".exdrop.show").forEach(d=>d.classList.remove("show"));
  if(!e.target.closest(".vidpop")&&!e.target.closest(".cam"))document.querySelectorAll(".vidpop.show").forEach(d=>d.classList.remove("show"));
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
function dupLast(){const rows=[...document.querySelectorAll("#exrows .exrow")];if(!rows.length){addExBtn();return;}const o=rowToObj(rows[rows.length-1]);document.getElementById("exrows").insertAdjacentHTML("beforeend",o.kind==="conditioning"?condRow(o):exRow(o));relabel();}

function inlineBuilderHtml(w){
  w=w||{};const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  let rows=blocks.length?blocks.map(b=>b.kind==="conditioning"?condRow(b):exRow(b)).join(""):exRow({});
  return '<div class="sec">'+
      '<div class="corner"><span title="Zichtbaar voor de sporter"><svg class="i sm-i"><use href="#i-eye"/></svg></span><span title="Video toevoegen"><svg class="i sm-i"><use href="#i-cam"/></svg></span></div>'+
      '<input id="w_title" class="row-title" placeholder="Titel" value="'+esc(w.title||"")+'">'+
      '<textarea id="w_notes" rows="1" placeholder="Coach&#39;s notes">'+esc(w.coach_notes||"")+'</textarea>'+
      '<div style="border-top:1px solid #e7e9ec;margin:6px 0 4px"></div>'+
      '<textarea id="w_warmup" rows="1" placeholder="Warming-up toevoegen…">'+esc(w.warmup||"")+'</textarea>'+
      '<div class="demolink">Demo-video&#39;s aan warming-up toevoegen</div>'+
    '</div>'+
    '<div id="exrows">'+rows+'</div>'+
    '<div class="addbtns"><button onclick="addExBtn()">+ Oefening</button><button onclick="addCondBtn()">+ Conditioning</button><button onclick="openInsBouwer()">+ Programma</button><button class="iconly" title="Dupliceer laatste blok" onclick="dupLast()">⧉</button></div>'+
    '<div class="sec"><textarea id="w_cooldown" rows="1" placeholder="Cooldown toevoegen…">'+esc(w.cooldown||"")+'</textarea><div class="demolink">Demo-video&#39;s aan cooldown toevoegen</div></div>'+
    '<div class="foot"><button class="save" id="saveW" onclick="saveWorkout()">Workout opslaan</button><button class="cancel" onclick="cancelEdit()">Annuleren</button>'+(editWid?'<button class="cancel" style="color:#e5484d;border-color:#f3b8ba" onclick="delWorkout(\''+editWid+'\')">Verwijderen</button>':'')+'</div>'+
    '<div class="msg" id="wmsg" style="font-size:11px;min-height:0"></div>';
}
function startEdit(ds,idx){editWid=null;editDay=ds;editIdx=idx;renderMonth({skipFetch:true});}
function editWorkout(wid,idx){const w=monthWorkouts[wid];if(!w)return;editWid=wid;editDay=w.workout_date;editIdx=idx;renderMonth({skipFetch:true});}
function cancelEdit(){editWid=null;editDay=null;renderMonth({skipFetch:true});}

let monthResults={},monthByDate={};
function mcardHtml(w){
  const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  if(!blocks.length&&/^rest ?day$/i.test((w.title||"").trim())){
    return '<div class="mcard planned'+(selWids.has(w.id)?' selected':'')+'" onclick="editWorkout(\''+w.id+'\',0)">'+cardTools(w)+
      '<div class="msc"><span style="color:#27b376">Rest Day</span></div>'+
      '<div class="cblk"><div class="pr" style="color:#8a919c">No instructions</div></div>'+
      '<button class="combtn" onclick="event.stopPropagation();toast(\'Comments komen in een volgende stap\')"><svg class="i sm-i"><use href="#i-chat"/></svg> Comments</button></div>';
  }
  let done=0,total=0,inner="";
  if(w.warmup)inner+='<div class="cblk k-grijs"><div class="n">Warmup</div><div class="pr">'+esc(w.warmup)+'</div></div>';
  blocks.forEach(b=>{
    total++;
    const r=monthResults[b.id];
    if(r&&r.status==="completed")done++;
    const kleur=b.color?' k-'+esc(b.color):'';
    const lk=b.linked?' linked2':'';
    const pr=composePresc(b);
    const sc=resultScoreTxt(r);
    inner+='<div class="cblk'+kleur+lk+'"><div class="n">'+esc(b.label||"")+') '+esc(b.exercise||"")+'</div>'+
      (pr?'<div class="pr">'+esc(pr)+'</div>':'')+
      (sc?'<div class="loginp">'+esc(sc)+'</div>':'')+
      (r?'<span class="okc'+(r.status==="missed"?' miss':'')+'"><svg class="i"><use href="#'+(r.status==="missed"?'i-x':'i-check')+'"/></svg></span>':'')+
      '</div>';
  });
  if(w.cooldown)inner+='<div class="cblk k-grijs"><div class="n">Cooldown</div><div class="pr">'+esc(w.cooldown)+'</div></div>';
  return '<div class="mcard'+(done===0?' planned':'')+(selWids.has(w.id)?' selected':'')+'" onclick="editWorkout(\''+w.id+'\',0)">'+cardTools(w)+
    '<div class="msc"><span class="wtitle">'+esc(w.title||"Workout")+'</span><span class="wright"><span class="wcount">'+done+'/'+total+'</span></span></div>'+inner+
    '<button class="combtn" onclick="event.stopPropagation();toast(\'Comments komen in een volgende stap\')"><svg class="i sm-i"><use href="#i-chat"/></svg> Comments</button></div>';
}
// Zweefmenu (bewerken/kopiëren/verwijderen) + selectievakje op elke workout-kaart.
function cardTools(w){
  return '<input type="checkbox" class="cardsel"'+(selWids.has(w.id)?' checked':'')+' title="Selecteren" onclick="event.stopPropagation();toggleSelect(this,\''+w.id+'\')">'+
    '<span class="cardtools" onclick="event.stopPropagation()">'+
    '<button title="Bewerken" onclick="event.stopPropagation();editWorkout(\''+w.id+'\',0)"><svg class="i sm-i"><use href="#i-pen"/></svg></button>'+
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
    const{data:workouts}=await db.from("workouts").select("*, blocks(*)").eq("client_id",id).gte("workout_date",ymd(gridStart)).lte("workout_date",ymd(gridEnd)).order("workout_date");
    monthWorkouts={};monthByDate={};byDate=monthByDate;(workouts||[]).forEach(w=>{monthWorkouts[w.id]=w;(byDate[w.workout_date]=byDate[w.workout_date]||[]).push(w);});
    // Gelogde resultaten van dit lid voor de zichtbare workouts (per blok)
    monthResults={};
    const wids=(workouts||[]).map(w=>w.id);
    if(wids.length){
      const{data:res}=await db.from("results").select("*").eq("athlete_id",id).in("workout_id",wids);
      (res||[]).forEach(r=>{monthResults[r.block_id]=r;});
    }
  }
  const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  let label;
  if(calView==="maand"){const basis=kalLabelMaand||ref;label=cap(MAANDVOL[basis.getMonth()])+" "+basis.getFullYear();}
  else if(calView==="week")label=gridStart.getDate()+" "+MAANDKORT[gridStart.getMonth()]+" – "+gridEnd.getDate()+" "+MAANDKORT[gridEnd.getMonth()]+" "+gridEnd.getFullYear();
  else label=cap(DAGVOL[(gridStart.getDay()+6)%7])+" "+gridStart.getDate()+" "+MAANDKORT[gridStart.getMonth()]+" "+gridStart.getFullYear();
  const seg=[["dag","Dag"],["week","Week"],["maand","Maand"]].map(v=>'<button class="'+(calView===v[0]?"on":"")+'" onclick="kalSetView(\''+v[0]+'\')">'+v[1]+'</button>').join("");
  const calhead='<div class="calhead">'+
    '<button class="btn ghost sm" onclick="renderCoach(\'clients\')">‹ Alle klanten</button>'+
    '<span class="month" id="mnd-label">'+label+'</span>'+
    '<div class="navarrows"><button onclick="prevMonth()">‹</button><button onclick="nextMonth()">›</button></div>'+
    '<button class="btn ghost sm" onclick="thisMonth()">Vandaag</button>'+
    '<div class="seg">'+seg+'</div>'+
    '<div class="progsel" style="margin-left:auto" onclick="toast(\'Programma-weergaven (team/templates) komen later\')"><div class="pav" style="background:linear-gradient(135deg,#171719,#3a3f47)">'+esc((myRole()==="coach"?(ME.profile.first_name||"C"):(coachChipNaam||"C")).slice(0,1).toUpperCase())+'</div><div><div class="pn" id="cs-coach">Coach '+esc(myRole()==="coach"?(ME.profile.first_name||""):coachChipNaam)+'</div><div class="pt">1:1</div></div><span class="car">▾</span></div>'+
    '<div class="progsel" id="klantsel" onclick="toggleKlantDrop(event)"><div class="pav" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div><div><div class="pn">'+naamVan(p)+'</div><div class="pt">Klant'+(coachChipNaam||myRole()==="coach"?' · '+esc(myRole()==="coach"?(ME.profile.first_name||""):coachChipNaam)+' ('+coachClients.filter(k=>k.coach_id===p.coach_id).length+')':'')+'</div></div><span class="car">▾</span>'+
      '<div class="progdrop" id="klantdrop" onclick="event.stopPropagation()"><div class="pd-search"><svg class="i sm-i"><use href="#i-search"/></svg><input placeholder="Zoek een klant…" oninput="filterKlantDrop(this.value)"></div><div class="pd-lijst" id="kd-lijst">'+
      coachClients.slice().sort((a,b)=>naamVan(a).localeCompare(naamVan(b))).map(k=>'<div class="pd-row'+(k.id===p.id?' actief':'')+'" data-n="'+esc(naamVan(k).toLowerCase())+'" onclick="openClient(\''+k.id+'\')"><div class="pd-badge" style="'+avFotoStyle(k)+'">'+avFotoText(k)+'</div><div class="pd-naam">'+naamVan(k)+'</div><span class="pd-vink"><svg class="i sm-i"><use href="#i-check"/></svg></span></div>').join("")+
      '</div></div></div>'+
    '<div class="seg"><button class="on">Workouts</button><button onclick="toast(\'Lifestyle komt later\')">Lifestyle</button></div>'+
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
      // Elke dag: documentje + rust-chip + dagnummer, zoals het ontwerp
      let inner='<div class="mday-top"><svg class="i" onclick="event.stopPropagation();toast(\'Dag-notities komen in een volgende stap\')" style="cursor:pointer"><use href="#i-doc"/></svg><span class="restchip">rust</span><span class="dnum2'+(isToday?' today':'')+'">'+dnum+'</span></div>';
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
function toggleKlantDrop(ev){ev.stopPropagation();const d=document.getElementById("klantdrop");if(d)d.classList.toggle("show");}
function filterKlantDrop(v){const z=(v||"").toLowerCase();document.querySelectorAll("#kd-lijst .pd-row").forEach(r=>{r.style.display=(r.dataset.n||"").includes(z)?"":"none";});}
function pickWorkout(ev){ev.stopPropagation();startEdit(curDay,0);}
async function pickRest(ev){
  ev.stopPropagation();
  const{error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:curDay,title:"Rest Day"});
  if(error){toast(error.message||"Opslaan mislukt");return;}
  toast("Dag ingesteld als rustdag");renderMonth();
}
// Kopieer-sjabloon van één workout (titel/notes/warmup/cooldown + blokken), voor klembord/plakken.
function wTemplate(w){return {title:w.title,coach_notes:w.coach_notes,warmup:w.warmup,cooldown:w.cooldown,
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
async function pickPaste(ev){
  ev.stopPropagation();
  if(!KLEMBORD||!KLEMBORD.length){toast("Nog niets gekopieerd, gebruik het kopieer-icoon of selecteer workouts");return;}
  for(const t of KLEMBORD){
    const{data:w,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:curDay,title:t.title,coach_notes:t.coach_notes,warmup:t.warmup,cooldown:t.cooldown}).select().single();
    if(error){toast(error.message||"Plakken mislukt");return;}
    if(t.blocks.length){const{error:be}=await db.from("blocks").insert(t.blocks.map(b=>Object.assign({workout_id:w.id},b)));if(be){toast(be.message);return;}}
  }
  toast(KLEMBORD.length>1?KLEMBORD.length+" workouts geplakt":"Workout geplakt");renderMonth();
}
async function laadInsBlog(){
  if(!ME.profile.company_id){insBlog=[];return;}
  const{data}=await db.from("workouts").select("*, blocks(*)").eq("company_id",ME.profile.company_id).eq("audience","blog").order("workout_date",{ascending:false}).limit(10);
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
  if(!insBlog.length)await laadInsBlog();
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
    const txt=[w.warmup,...(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort).map(b=>(b.exercise||"")+(b.prescription?"\n"+b.prescription:"")),w.cooldown].filter(Boolean).join("\n\n");
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
    const txt=blocks.map(b=>(b.label?b.label+") ":"")+(b.exercise||"")+(b.prescription?"\n"+b.prescription:"")).join("\n\n");
    const host=document.getElementById("exrows");
    if(host){host.insertAdjacentHTML("beforeend",exRow({exercise:w.title,prescription:txt,color:"blue"}));relabel();groei();}
    closeIns();toast("Weekworkout als blok toegevoegd");return;
  }
  const{data:nw,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:curDay,title:w.title,warmup:w.warmup,cooldown:w.cooldown}).select().single();
  if(error){toast(error.message||"Invoegen mislukt");return;}
  if(blocks.length){
    const{error:be}=await db.from("blocks").insert(blocks.map(b=>({workout_id:nw.id,kind:b.kind,label:b.label,linked:b.linked,exercise:b.exercise,prescription:b.prescription,notes:b.notes,sort:b.sort,color:b.color,score_type:b.score_type,oefening_id:b.oefening_id})));
    if(be){toast(be.message);return;}
  }
  closeIns();toast("Weekworkout ingevoegd; het gedeelde leaderboard koppelen we in een volgende stap");renderMonth();
}

async function saveWorkout(){
  const g=id=>document.getElementById(id);
  const title=g("w_title").value.trim();
  const rows=[...document.querySelectorAll("#exrows .exrow")].map((r,i)=>{const o=rowToObj(r);o.label=r.querySelector(".lbl-badge").textContent;o.sort=i+1;return o;}).filter(b=>b.exercise);
  const wm=g("wmsg");
  if(!title){wm.textContent="Geef de workout een titel.";wm.className="msg err";return;}
  g("saveW").disabled=true;
  const wf={title,coach_notes:g("w_notes").value.trim()||null,warmup:g("w_warmup").value.trim()||null,cooldown:g("w_cooldown").value.trim()||null};
  const mkBlocks=wid=>rows.map(b=>({workout_id:wid,kind:b.kind,label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription||null,notes:b.notes||null,sort:b.sort,color:b.color||null,score_type:b.score_type||"text",oefening_id:b.oefening_id||null}));
  try{
    if(editWid){
      const{error:ue}=await db.from("workouts").update(wf).eq("id",editWid);if(ue)throw ue;
      await db.from("blocks").delete().eq("workout_id",editWid);
      if(rows.length){const{error:be}=await db.from("blocks").insert(mkBlocks(editWid));if(be)throw be;}
    }else{
      const{data:w,error}=await db.from("workouts").insert(Object.assign({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:editDay},wf)).select().single();
      if(error)throw error;
      if(rows.length){const{error:be}=await db.from("blocks").insert(mkBlocks(w.id));if(be)throw be;}
    }
    editWid=null;editDay=null;renderMonth();
  }catch(e){wm.textContent=e.message||"Opslaan mislukt.";wm.className="msg err";g("saveW").disabled=false;}
}
