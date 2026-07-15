// app/lid.js — het scherm voor de sporter (rol 'lid'): de workout van vandaag,
// plus de weekworkout met score loggen (Rx/Scaled, privé/openbaar) en het
// gedeelde leaderboard (hergebruikt WW/wwBoardHtml uit weekworkout.js).
// Volledig loggen per dag-workout komt in de sporter-app (Expo).
let LID={blog:null,eigen:null,rx:"rx",openbaar:true};

async function renderLid(){
  document.body.classList.remove("coachmode");
  const c=document.getElementById("content");c.innerHTML='<div class="spin">Laden…</div>';
  const{data:today}=await db.from("workouts").select("*, blocks(*)").eq("client_id",ME.user.id).eq("workout_date",todayStr());
  const w=(today||[])[0];let body;
  if(w){
    let parts="";
    if(w.warmup)parts+='<div class="block"><div class="bh"><span class="badge" style="background:#3a4a6b">WU</span><b>Warming-up</b></div><div class="presc">'+esc(w.warmup)+'</div></div>';
    parts+=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort).map(b=>{const pr=composePresc(b);return '<div class="block"><div class="bh"><span class="badge">'+esc(b.label||"")+'</span><b>'+esc(b.exercise||"")+'</b></div>'+(pr?'<div class="presc">'+esc(pr)+'</div>':'')+'</div>';}).join("");
    if(w.cooldown)parts+='<div class="block"><div class="bh"><span class="badge" style="background:#3a4a6b">CD</span><b>Cooldown</b></div><div class="presc">'+esc(w.cooldown)+'</div></div>';
    body='<div class="card" style="padding:16px"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><b>'+esc(w.title||"Workout")+'</b><span class="tag">vandaag</span></div>'+(w.coach_notes?'<div class="note" style="margin:0 0 10px">📝 '+esc(w.coach_notes)+'</div>':'')+(parts||'<div class="muted">Geen blokken.</div>')+'</div><p class="note">Scores op je dagworkout loggen komt in de sporter-app; je weekworkout-score log je hieronder.</p>';
  }else{body='<div class="card" style="padding:20px"><div class="muted">Geen workout voor vandaag. Geniet van je rustdag! 💪</div></div>';}
  // Weekworkout van het bedrijf (audience='blog'), voor 1-op-1 én blog-leden.
  let wwHtml="";
  try{
    const{data:blogs}=await db.from("workouts").select("id,title,workout_date,coach_id,created_at, blocks(*)").eq("company_id",ME.profile.company_id).eq("audience","blog").order("workout_date",{ascending:false}).limit(1);
    LID.blog=(blogs||[])[0]||null;
  }catch(e){LID.blog=null;}
  if(LID.blog){
    WW.list=[LID.blog];WW.curId=LID.blog.id;
    ensureWwModals();
    await Promise.all([wwLoadBoard(),lidEigenLaad()]);
    wwHtml=lidWeekHtml();
  }
  c.innerHTML='<div class="cwrap" style="max-width:860px;margin:0 auto">'+header("Welkom, "+(ME.profile.first_name||ME.user.email),"Jouw workout van vandaag")+body+wwHtml+'</div>';
  lidFormVul();
}
async function lidEigenLaad(){
  LID.eigen=null;
  const blk=wwMainBlock(LID.blog);if(!blk)return;
  const{data}=await db.from("results").select("*").eq("block_id",blk.id).eq("athlete_id",ME.user.id);
  LID.eigen=(data||[])[0]||null;
  if(LID.eigen){LID.rx=LID.eigen.rx==="scaled"?"scaled":"rx";LID.openbaar=!!LID.eigen.is_public;}
  else{LID.rx="rx";LID.openbaar=true;}
}
function lidWeekHtml(){
  const w=LID.blog,blk=wwMainBlock(w);
  const tekst=blk?esc(composePresc(blk)||"").replace(/\n/g,"<br>"):"";
  const deelnemers=new Set(WW.rows.map(r=>r.athlete_id)).size;
  return '<div class="lbhead" style="margin-top:24px"><h2 style="font-size:18px">Workout van de week · '+esc(w.title||"")+'</h2>'+
    (tekst?'<div class="muted" style="margin-top:6px;font-size:13px;line-height:1.55">'+tekst+'</div>':'')+
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'+
      '<span class="cpill teal">gratis voor iedereen</span>'+
      '<span class="cpill ok">'+deelnemers+" deelnemer"+(deelnemers===1?"":"s")+'</span>'+
      '<span class="cpill gray">gepubliceerd '+datumNL(w.workout_date)+'</span></div></div>'+
    (blk?lidLogHtml(blk):'')+
    '<div class="hrow" style="margin:20px 0 10px"><h2>Leaderboard <span class="muted" style="font-weight:400;font-size:13px">· openbare scores</span></h2></div>'+
    '<div id="ww-board">'+wwBoardHtml()+'</div>';
}
function lidLogHtml(blk){
  const st=blk.score_type||"text",eigen=LID.eigen;
  let veld="";
  if(st==="time")veld='<input class="lid-in" id="lid-tijd" placeholder="mm:ss (bijv. 3:12)" style="width:150px">';
  else if(st==="rounds_reps")veld='<input class="lid-in" id="lid-rondes" type="number" min="0" placeholder="rondes" style="width:95px"><input class="lid-in" id="lid-reps" type="number" min="0" placeholder="+ reps" style="width:95px">';
  else if(st==="reps")veld='<input class="lid-in" id="lid-reps" type="number" min="0" placeholder="reps" style="width:110px">';
  else if(st==="load")veld='<input class="lid-in" id="lid-kg" type="number" min="0" step="0.5" placeholder="kg" style="width:110px">';
  else veld='<input class="lid-in" id="lid-tekst" placeholder="jouw score" style="width:220px">';
  return '<div class="card" style="padding:16px;margin-top:14px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><b>Jouw score</b>'+
      (eigen?'<span class="cpill '+(eigen.is_public?"ok":"gray")+'">'+(eigen.is_public?"staat op het leaderboard":"privé · alleen jij en je coach")+'</span>':'<span class="cpill gray">nog niet gelogd</span>')+'</div>'+
    '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">'+
      '<div class="seg" id="lid-rxseg"><button class="'+(LID.rx==="rx"?"on":"")+'" onclick="lidRx(\'rx\')">Rx</button><button class="'+(LID.rx==="scaled"?"on":"")+'" onclick="lidRx(\'scaled\')">Scaled</button></div>'+
      veld+
      '<input class="lid-in" id="lid-note" placeholder="notitie (optioneel)" style="flex:1;min-width:170px">'+
    '</div>'+
    '<div style="display:flex;gap:12px;align-items:center;margin-top:13px;flex-wrap:wrap">'+
      '<button class="tgl'+(LID.openbaar?" on":"")+'" onclick="this.classList.toggle(\'on\');LID.openbaar=this.classList.contains(\'on\')"><span class="sw"></span> Openbaar op het leaderboard</button>'+
      '<span style="margin-left:auto;display:flex;gap:8px">'+
        (eigen?'<button class="btn ghost sm" style="color:#e5484d;border-color:#f3b8ba" onclick="lidVerwijder()">Score verwijderen</button>':'')+
        '<button class="btn sm" onclick="lidOpslaan()">'+(eigen?"Score bijwerken":"Score opslaan")+'</button></span>'+
    '</div>'+
    '<div class="msg" id="lid-msg"></div></div>';
}
function lidFormVul(){
  const e=LID.eigen;if(!e)return;
  const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!=null)el.value=v;};
  if(e.time_seconds!=null)set("lid-tijd",Math.floor(e.time_seconds/60)+":"+pad(e.time_seconds%60));
  set("lid-rondes",e.rounds);set("lid-reps",e.reps);set("lid-kg",e.load_kg);set("lid-tekst",e.score_text);set("lid-note",e.note);
}
function lidRx(v){LID.rx=v;document.querySelectorAll("#lid-rxseg button").forEach((b,i)=>b.classList.toggle("on",(i===0)===(v==="rx")));}
function lidParseTijd(s){
  s=(s||"").trim();if(!s)return null;
  const m=s.match(/^(\d+):([0-5]?\d)$/);if(m)return parseInt(m[1],10)*60+parseInt(m[2],10);
  if(/^\d+$/.test(s))return parseInt(s,10); // losse seconden mag ook
  return null;
}
async function lidOpslaan(){
  const blk=wwMainBlock(LID.blog);if(!blk)return;
  const st=blk.score_type||"text";
  const msg=document.getElementById("lid-msg");msg.textContent="";
  const val=id=>{const el=document.getElementById(id);return el?el.value:"";};
  const rec={block_id:blk.id,workout_id:LID.blog.id,athlete_id:ME.user.id,company_id:ME.profile.company_id,status:"completed",rx:LID.rx,is_public:LID.openbaar,note:(val("lid-note")||"").trim()||null,score_text:null,time_seconds:null,load_kg:null,reps:null,rounds:null};
  if(st==="time"){
    const t=lidParseTijd(val("lid-tijd"));
    if(t==null){msg.textContent="Vul je tijd in als mm:ss (bijv. 3:12).";msg.className="msg err";return;}
    rec.time_seconds=t;
  }else if(st==="rounds_reps"){
    const ro=parseInt(val("lid-rondes"),10),re=parseInt(val("lid-reps")||"0",10);
    if(isNaN(ro)){msg.textContent="Vul het aantal rondes in.";msg.className="msg err";return;}
    rec.rounds=ro;rec.reps=isNaN(re)?0:re;
  }else if(st==="reps"){
    const re=parseInt(val("lid-reps"),10);
    if(isNaN(re)){msg.textContent="Vul het aantal reps in.";msg.className="msg err";return;}
    rec.reps=re;
  }else if(st==="load"){
    const kg=parseFloat(String(val("lid-kg")).replace(",","."));
    if(isNaN(kg)){msg.textContent="Vul het gewicht in kg in.";msg.className="msg err";return;}
    rec.load_kg=kg;
  }else{
    const s=(val("lid-tekst")||"").trim();
    if(!s){msg.textContent="Vul je score in.";msg.className="msg err";return;}
    rec.score_text=s;
  }
  const{error}=await db.from("results").upsert(rec,{onConflict:"block_id,athlete_id"});
  if(error){msg.textContent=error.message||"Opslaan mislukt. Probeer het opnieuw.";msg.className="msg err";return;}
  toast(LID.openbaar?"Je score staat op het leaderboard 💪":"Score opgeslagen (privé)");
  await renderLid();
}
async function lidVerwijder(){
  if(!confirm("Je score verwijderen? Hij verdwijnt ook van het leaderboard."))return;
  const blk=wwMainBlock(LID.blog);if(!blk)return;
  const{error}=await db.from("results").delete().eq("block_id",blk.id).eq("athlete_id",ME.user.id);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  toast("Score verwijderd");
  await renderLid();
}
