// app/notificaties.js — meldingsvoorkeuren (Instellingen > Notificaties) én de
// live meldingen zelf: het dashboard luistert realtime mee (resultaten,
// reacties, berichten, video's, foto's) en toont alleen wat de coach aan
// heeft staan, met het gekozen geluid. E-mailvinkjes en werkuren worden
// alvast opgeslagen; de mails zelf volgen met het e-mailblok.
const NOTIF_STD={
  app:{workout:true,reactie:true,bericht:true,video:true,foto:true},
  mail:{workout:false,reactie:false,bericht:false,video:false,foto:false},
  geluid_bericht:"pop",geluid_melding:"pop",
  mail_tijden:{modus:"altijd",van:9,tot:17,dagen:[true,true,true,true,true,false,false]},
};
const NOTIF_EVENTS=[
  ["workout","Als een klant een workout aftekent"],
  ["reactie","Als een klant reageert op een workout-dag"],
  ["bericht","Als een klant een chatbericht stuurt"],
  ["video","Als een klant een video uploadt"],
  ["foto","Als een klant voortgangsfoto's uploadt"],
];
const NOTIF_GELUIDEN=[["geen","Geen geluid"],["pop","Pop"],["zwaar","Barbell drop"],["ping","Ping"]];
function notifPrefs(){
  const p=(ME&&ME.profile&&ME.profile.notify_prefs)||{};
  return {
    app:Object.assign({},NOTIF_STD.app,p.app||{}),
    mail:Object.assign({},NOTIF_STD.mail,p.mail||{}),
    geluid_bericht:p.geluid_bericht||NOTIF_STD.geluid_bericht,
    geluid_melding:p.geluid_melding||NOTIF_STD.geluid_melding,
    mail_tijden:Object.assign({},NOTIF_STD.mail_tijden,p.mail_tijden||{}),
  };
}
// ---------- Instellingen-pagina ----------
function instNotifHtml(){
  const n=notifPrefs();
  const rij=(sleutel,label)=>'<div style="display:flex;align-items:center;gap:18px;padding:9px 0;border-bottom:1px solid #f0f1f3">'+
    '<span style="flex:1;font-size:13px">'+label+'</span>'+
    '<label class="pf-toggle" style="margin:0"><input type="checkbox" data-nt="app" data-ev="'+sleutel+'"'+(n.app[sleutel]?" checked":"")+'><span class="pf-sw"></span> app</label>'+
    '<label class="pf-toggle" style="margin:0"><input type="checkbox" data-nt="mail" data-ev="'+sleutel+'"'+(n.mail[sleutel]?" checked":"")+'><span class="pf-sw"></span> e-mail</label>'+
    '</div>';
  const uurOpts=(sel)=>Array.from({length:24},(_,u)=>'<option value="'+u+'"'+(u===sel?" selected":"")+'>'+String(u).padStart(2,"0")+':00</option>').join("");
  const t=n.mail_tijden;
  return '<h2 style="margin:0 0 4px">Notificaties</h2>'+
    '<div class="sm muted" style="margin-bottom:14px">Kies waarvan je een melding wilt. App-meldingen verschijnen direct in het dashboard; e-mails starten zodra het e-mailblok live is (je keuzes staan alvast klaar).</div>'+
    '<div style="max-width:560px">'+NOTIF_EVENTS.map(e=>rij(e[0],e[1])).join("")+'</div>'+
    '<h3 style="margin:20px 0 4px;font-size:14px">Geluiden</h3>'+
    '<div style="display:flex;gap:22px;flex-wrap:wrap">'+
      '<div class="field" style="max-width:220px"><label>Nieuw bericht</label><div style="display:flex;gap:8px"><select id="nt-gel-ber">'+NOTIF_GELUIDEN.map(g=>'<option value="'+g[0]+'"'+(n.geluid_bericht===g[0]?" selected":"")+'>'+g[1]+'</option>').join("")+'</select><button class="btn ghost sm" onclick="notifGeluid(document.getElementById(\'nt-gel-ber\').value)">▶</button></div></div>'+
      '<div class="field" style="max-width:220px"><label>Overige meldingen</label><div style="display:flex;gap:8px"><select id="nt-gel-mel">'+NOTIF_GELUIDEN.map(g=>'<option value="'+g[0]+'"'+(n.geluid_melding===g[0]?" selected":"")+'>'+g[1]+'</option>').join("")+'</select><button class="btn ghost sm" onclick="notifGeluid(document.getElementById(\'nt-gel-mel\').value)">▶</button></div></div>'+
    '</div>'+
    '<h3 style="margin:16px 0 4px;font-size:14px">E-mails sturen</h3>'+
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="nt-modus" value="altijd" style="width:auto;margin:0;accent-color:var(--accent)"'+(t.modus!=="werkuren"?" checked":"")+' onchange="notifModus()"> Op elk moment van de dag</label>'+
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="nt-modus" value="werkuren" style="width:auto;margin:0;accent-color:var(--accent)"'+(t.modus==="werkuren"?" checked":"")+' onchange="notifModus()"> Alleen tijdens mijn werkuren</label>'+
    '<div id="nt-uren" style="'+(t.modus==="werkuren"?"":"display:none;")+'margin:8px 0 0 26px">'+
      '<div style="display:flex;align-items:center;gap:8px;font-size:13px">Ik werk tussen <select id="nt-van" style="width:auto">'+uurOpts(t.van)+'</select> en <select id="nt-tot" style="width:auto">'+uurOpts(t.tot)+'</select></div>'+
      '<div style="display:flex;gap:14px;margin-top:10px">'+["Ma","Di","Wo","Do","Vr","Za","Zo"].map((d,i)=>'<label class="pf-toggle" style="margin:0;flex-direction:column;gap:3px;font-size:11px"><span>'+d+'</span><input type="checkbox" data-dag="'+i+'"'+(t.dagen[i]?" checked":"")+'><span class="pf-sw"></span></label>').join("")+'</div>'+
    '</div>'+
    '<div class="msg" id="inst-msg"></div>'+
    '<button class="btn" style="margin-top:14px" onclick="instNotifOpslaan()">Opslaan</button>';
}
function notifModus(){
  const w=document.querySelector('input[name="nt-modus"]:checked');
  const u=document.getElementById("nt-uren");
  if(u)u.style.display=(w&&w.value==="werkuren")?"":"none";
}
async function instNotifOpslaan(){
  const msg=document.getElementById("inst-msg");
  const n={app:{},mail:{},geluid_bericht:document.getElementById("nt-gel-ber").value,geluid_melding:document.getElementById("nt-gel-mel").value,mail_tijden:{}};
  document.querySelectorAll("[data-nt]").forEach(cb=>{n[cb.dataset.nt][cb.dataset.ev]=cb.checked;});
  const modus=document.querySelector('input[name="nt-modus"]:checked');
  n.mail_tijden={
    modus:(modus&&modus.value)||"altijd",
    van:parseInt(document.getElementById("nt-van").value,10),
    tot:parseInt(document.getElementById("nt-tot").value,10),
    dagen:Array.from({length:7},(_,i)=>{const cb=document.querySelector('[data-dag="'+i+'"]');return cb?cb.checked:true;}),
  };
  const{data,error}=await db.from("profiles").update({notify_prefs:n}).eq("id",ME.user.id).select().single();
  if(error){if(msg)msg.textContent=error.message||"Opslaan mislukt";return;}
  Object.assign(ME.profile,data||{notify_prefs:n});
  toast("Notificatie-voorkeuren opgeslagen");
}
// ---------- Geluiden (WebAudio, geen bestanden nodig) ----------
function notifGeluid(naam){
  if(!naam||naam==="geen")return;
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);
    const t=ctx.currentTime;
    if(naam==="zwaar"){o.type="sine";o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(55,t+.22);g.gain.setValueAtTime(.5,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.start(t);o.stop(t+.32);}
    else if(naam==="ping"){o.type="sine";o.frequency.setValueAtTime(1320,t);g.gain.setValueAtTime(.25,t);g.gain.exponentialRampToValueAtTime(.001,t+.45);o.start(t);o.stop(t+.5);}
    else{o.type="sine";o.frequency.setValueAtTime(880,t);o.frequency.exponentialRampToValueAtTime(440,t+.1);g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.16);o.start(t);o.stop(t+.18);}
    setTimeout(()=>{try{ctx.close();}catch(e){}},700);
  }catch(e){}
}
// ---------- Live meldingen in het dashboard ----------
let notifGestart=false,notifKanalen=[];
const notifGezien=new Set();
function notifKlantNaam(aid){const p=(coachClients||[]).find(x=>x.id===aid);return p?naamVan(p):"Een klant";}
function notifToon(ev,tekst,sleutel){
  const n=notifPrefs();
  if(!n.app[ev])return;
  if(sleutel){if(notifGezien.has(sleutel))return;notifGezien.add(sleutel);}
  toast(tekst);
  notifGeluid(ev==="bericht"?n.geluid_bericht:n.geluid_melding);
}
function startNotifs(){
  if(notifGestart||myRole()==="lid")return;
  notifGestart=true;
  const kan=(naam,tabel,event,cb)=>{
    try{
      notifKanalen.push(db.channel(naam).on("postgres_changes",{event,schema:"public",table:tabel},cb).subscribe());
    }catch(e){}
  };
  // Chatbericht van een klant (bericht van het lid = afzender is het lid zelf)
  kan("nf-msg","messages","INSERT",p=>{
    const m=p.new;if(!m||m.sender_id!==m.athlete_id)return;
    notifToon("bericht","💬 Nieuw bericht van "+notifKlantNaam(m.athlete_id),"m"+m.id);
  });
  // Reactie op een workout-dag
  kan("nf-wc","workout_comments","INSERT",p=>{
    const m=p.new;if(!m||m.author_id!==m.athlete_id)return;
    notifToon("reactie","💬 "+notifKlantNaam(m.athlete_id)+" reageerde op een workout-dag","c"+m.id);
  });
  // Workout afgetekend (per workout één melding, niet per blok)
  const resCb=p=>{
    const r=p.new;if(!r||r.status!=="completed")return;
    notifToon("workout","✅ "+notifKlantNaam(r.athlete_id)+" heeft een workout afgetekend","w"+r.workout_id+":"+r.athlete_id);
  };
  kan("nf-res-i","results","INSERT",resCb);
  kan("nf-res-u","results","UPDATE",resCb);
  // Video-upload bij een resultaat
  kan("nf-vid","result_media","INSERT",p=>{
    const r=p.new;if(!r)return;
    notifToon("video","🎥 "+notifKlantNaam(r.athlete_id)+" heeft een video geüpload","v"+r.id);
  });
  // Voortgangsfoto's
  kan("nf-foto","progress_photos","INSERT",p=>{
    const r=p.new;if(!r||r.created_by!==r.athlete_id)return; // alleen uploads door het lid zelf
    notifToon("foto","📷 "+notifKlantNaam(r.athlete_id)+" heeft voortgangsfoto's geüpload","f"+r.athlete_id+":"+(r.taken_on||""));
  });
}
function stopNotifs(){
  notifGestart=false;
  notifKanalen.forEach(k=>{try{db.removeChannel(k);}catch(e){}});
  notifKanalen=[];
}
