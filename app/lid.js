// app/lid.js — het scherm voor de sporter (rol 'lid'): toont de workout van
// vandaag. Scores loggen komt in de sporter-app (Expo), niet hier.
// ---------- LID ----------
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
    body='<div class="card" style="padding:16px;max-width:760px"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><b>'+esc(w.title||"Workout")+'</b><span class="tag">vandaag</span></div>'+(w.coach_notes?'<div class="note" style="margin:0 0 10px">📝 '+esc(w.coach_notes)+'</div>':'')+(parts||'<div class="muted">Geen blokken.</div>')+'</div><p class="note">Scores invullen en video uploaden komt in de volgende stap (Fase 3).</p>';
  }else{body='<div class="card" style="padding:20px;max-width:760px"><div class="muted">Geen workout voor vandaag. Geniet van je rustdag! 💪</div></div>';}
  c.innerHTML=header("Welkom, "+(ME.profile.first_name||ME.user.email),"Jouw workout van vandaag")+body;
}
