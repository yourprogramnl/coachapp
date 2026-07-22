// app/notificaties.js — meldingsvoorkeuren (Instellingen > Notificaties) én de
// live meldingen zelf: het dashboard luistert realtime mee (resultaten,
// reacties, berichten, video's, foto's) en toont alleen wat de coach aan
// heeft staan, met het gekozen geluid. E-mailvinkjes en werkuren worden
// alvast opgeslagen; de mails zelf volgen met het e-mailblok.
const NOTIF_STD={
  app:{workout:true,reactie:true,bericht:true,video:true,foto:true,pr:true},
  mail:{workout:false,reactie:false,bericht:false,video:false,foto:false,pr:false},
  geluid_bericht:"pop",geluid_melding:"pop",
  mail_tijden:{modus:"altijd",van:9,tot:17,dagen:[true,true,true,true,true,false,false]},
};
const NOTIF_EVENTS=[
  ["workout","Als een klant een workout aftekent"],
  ["reactie","Als een klant reageert op een workout-dag"],
  ["bericht","Als een klant een chatbericht stuurt"],
  ["pr","Als een klant een nieuwe PR logt"],
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
    '<div class="sm muted" style="margin-bottom:14px">Kies waarvan je een melding wilt. App-meldingen verschijnen direct in het dashboard. E-mail werkt voor reacties op een workout-dag; de overige e-mails volgen binnenkort.</div>'+
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
  belStop();
}
// ---------- Het belletje in de balk (notificatiecentrum, tabel notifications) ----------
let BEL={rows:[],geladen:false,kanaal:null,laden:null};
function belHtml(){
  return '<div class="belwrap"><button class="belbtn" title="Notificaties" onclick="belToggle(event)"><svg class="i"><use href="#i-bell"/></svg><span class="belbadge" id="bel-badge" style="display:none"></span></button>'+
    '<div class="belpanel" id="bel-panel" onclick="event.stopPropagation()"></div></div>';
}
// De soorten die de coach aan heeft staan (Instellingen > Notificaties, app-vinkje)
function belZichtbaar(){const n=notifPrefs();return BEL.rows.filter(r=>n.app[r.soort]!==false);}
function belStart(){
  if(myRole()==="lid")return;
  belBadge();
  if(!BEL.laden){
    BEL.laden=db.from("notifications").select("*").eq("recipient_id",ME.user.id).order("created_at",{ascending:false}).limit(40)
      .then(({data})=>{BEL.rows=data||[];BEL.geladen=true;belBadge();});
  }
  if(!BEL.kanaal){
    try{
      BEL.kanaal=db.channel("bel").on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications"},p=>{
        const r=p.new;if(!r||r.recipient_id!==ME.user.id)return;
        BEL.rows.unshift(r);belBadge();belPanelVernieuw();
      }).subscribe();
    }catch(e){}
  }
}
function belStop(){
  if(BEL.kanaal){try{db.removeChannel(BEL.kanaal);}catch(e){}BEL.kanaal=null;}
  BEL={rows:[],geladen:false,kanaal:null,laden:null};
}
function belBadge(){
  const b=document.getElementById("bel-badge");if(!b)return;
  const n=belZichtbaar().filter(r=>!r.read_at).length;
  b.style.display=n?"":"none";b.textContent=n>9?"9+":n;
}
function belToggle(ev){
  ev.stopPropagation();
  const p=document.getElementById("bel-panel");if(!p)return;
  if(p.classList.contains("show")){p.classList.remove("show");return;}
  p.classList.add("show");belPanelVernieuw();
}
// Alleen (her)tekenen als het paneel open is; realtime-inserts bij een dicht
// paneel werken alleen de badge bij.
function belPanelVernieuw(){
  const p=document.getElementById("bel-panel");if(!p||!p.classList.contains("show"))return;
  const rows=belZichtbaar().slice(0,10);
  const ongelezen=rows.some(r=>!r.read_at);
  p.innerHTML='<div class="belkop">'+(ongelezen?'<span class="bellink" onclick="belAllesGelezen()">Markeer alles als gelezen</span> <span class="muted" style="font-size:11px">|</span> ':'')+'<span class="bellink" onclick="this.closest(\'.belpanel\').classList.remove(\'show\');coachGo(\'notifs\')">Alles bekijken</span></div>'+
    (rows.length?rows.map(belRijHtml).join(""):'<div class="belleeg">'+(BEL.geladen?"Geen notificaties.":"Laden…")+'</div>');
}
function belRijHtml(r){
  const iconen={workout:"✅",reactie:"💬",bericht:"💬",video:"🎥",foto:"📷",pr:"🏆"};
  return '<div class="belrij'+(r.read_at?"":" on")+'" onclick="belKlik(\''+r.id+'\')">'+
    '<span class="belico">'+(iconen[r.soort]||"🔔")+'</span>'+
    '<span class="beltxt">'+esc(belTekst(r))+'<span class="beltijd">'+belTijd(r.created_at)+'</span></span>'+
    (r.read_at?"":'<span class="beldot"></span>')+'</div>';
}
function belTekst(r){
  const naam=notifKlantNaam(r.athlete_id);
  const dag=r.workout_date?" van "+datumNL(r.workout_date):"";
  if(r.soort==="workout")return naam+" heeft de hele workout"+dag+" afgerond";
  if(r.soort==="reactie")return naam+" reageerde op de workout"+dag;
  if(r.soort==="bericht")return naam+" heeft je een bericht gestuurd";
  if(r.soort==="video")return naam+" uploadde een video bij de workout"+dag;
  if(r.soort==="foto")return naam+" uploadde voortgangsfoto's";
  if(r.soort==="pr")return naam+" logde een nieuwe PR"+(r.info?" · "+r.info:"");
  return naam;
}
function belTijd(ts){
  const min=Math.max(0,Math.round((Date.now()-new Date(ts).getTime())/60000));
  if(min<1)return "zojuist";
  if(min<60)return min+" min geleden";
  const uur=Math.round(min/60);
  if(uur<24)return uur+" uur geleden";
  const dag=Math.round(uur/24);
  return dag===1?"gisteren":dag+" dagen geleden";
}
async function belKlik(id){
  const r=BEL.rows.find(x=>x.id===id);if(!r)return;
  if(!r.read_at){
    r.read_at=new Date().toISOString();
    belBadge();
    db.from("notifications").update({read_at:r.read_at}).eq("id",id).then(()=>{});
  }
  const p=document.getElementById("bel-panel");if(p)p.classList.remove("show");
  // Met één klik naar de juiste plek
  if(r.soort==="bericht"){if(typeof dashBericht==="function")dashBericht(r.athlete_id);return;}
  if(!r.athlete_id)return;
  const bestaat=(coachClients||[]).some(c=>c.id===r.athlete_id);
  if(!bestaat){toast("Deze klant staat niet (meer) in jouw lijst");return;}
  openClient(r.athlete_id);
  if(r.soort==="pr"&&typeof openMx==="function")setTimeout(()=>{try{openMx();}catch(e){}},150);
  if(r.soort==="foto")setTimeout(()=>{try{renderClient("profiel");if(typeof pfTab!=="undefined"){pfTab="fotos";renderProfielPagina();}}catch(e){}},150);
}
async function belAllesGelezen(){
  const nu=new Date().toISOString();
  BEL.rows.forEach(r=>{if(!r.read_at)r.read_at=nu;});
  belBadge();belPanelVernieuw();
  try{await db.from("notifications").update({read_at:nu}).eq("recipient_id",ME.user.id).is("read_at",null);}catch(e){}
}
// Gelezen-sync: als de coach het gesprek zelf opent, gaat de bel-melding ook uit.
function belMarkeerSoort(athleteId,soort){
  const nu=new Date().toISOString();
  BEL.rows.forEach(r=>{if(r.athlete_id===athleteId&&r.soort===soort&&!r.read_at)r.read_at=nu;});
  belBadge();belPanelVernieuw();
  db.from("notifications").update({read_at:nu}).eq("recipient_id",ME.user.id).eq("athlete_id",athleteId).eq("soort",soort).is("read_at",null).then(()=>{});
}
document.addEventListener("click",()=>{const p=document.getElementById("bel-panel");if(p)p.classList.remove("show");});
// ---------- Notificaties-pagina (#notifs, via "Alles bekijken" in de bel) ----------
// Zelfde data en voorkeuren als de bel; de filters rechts zijn de app-vinkjes
// uit Instellingen > Notificaties (één plek in de database, direct opgeslagen).
let ncAlleenOngelezen=false;
async function fillNotifCentrum(){
  const cp=document.getElementById("cpage");if(!cp)return;
  // Verse, ruimere lading voor de pagina (de bel laadt er maar 40)
  const{data}=await db.from("notifications").select("*").eq("recipient_id",ME.user.id).order("created_at",{ascending:false}).limit(200);
  BEL.rows=data||BEL.rows;BEL.geladen=true;belBadge();
  cp.innerHTML='<h1>Notificaties</h1>'+
    '<div style="display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap">'+
      '<div class="card" style="flex:1;min-width:340px;padding:0" id="nc-lijst"></div>'+
      '<div class="card" style="width:300px;padding:16px 18px">'+
        '<b style="font-size:14px">Filters</b><div class="sm muted" id="nc-aantal" style="margin:2px 0 10px"></div>'+
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f1f3"><span style="font-size:13px">Alleen ongelezen</span><label class="pf-toggle" style="margin:0"><input type="checkbox" id="nc-ongelezen"'+(ncAlleenOngelezen?" checked":"")+' onchange="ncOngelezen(this.checked)"><span class="pf-sw"></span></label></div>'+
        NOTIF_EVENTS.map(e=>'<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f1f3"><span style="font-size:13px">'+e[1]+'</span><label class="pf-toggle" style="margin:0"><input type="checkbox" data-ncev="'+e[0]+'"'+(notifPrefs().app[e[0]]!==false?" checked":"")+' onchange="ncFilter(\''+e[0]+'\',this.checked)"><span class="pf-sw"></span></label></div>').join("")+
        '<div class="sm muted" style="margin-top:10px;font-size:11px">Uitgevinkte soorten komen niet meer in de bel en op deze pagina. Dezelfde keuzes staan bij Instellingen > Notificaties.</div>'+
      '</div>'+
    '</div>';
  ncLijst();
}
function ncLijst(){
  const host=document.getElementById("nc-lijst");if(!host)return;
  let rows=belZichtbaar();
  if(ncAlleenOngelezen)rows=rows.filter(r=>!r.read_at);
  const ongelezen=rows.some(r=>!r.read_at);
  host.innerHTML='<div class="belkop">'+(ongelezen?'<span class="bellink" onclick="belAllesGelezen();ncLijst()">Markeer alles als gelezen</span>':'<span class="sm muted">&nbsp;</span>')+'</div>'+
    (rows.length?rows.map(belRijHtml).join(""):'<div class="belleeg">'+(ncAlleenOngelezen?"Geen ongelezen notificaties.":"Nog geen notificaties. Zodra je klanten workouts afronden, reageren of berichten sturen, zie je dat hier.")+'</div>');
  const teller=document.getElementById("nc-aantal");
  if(teller)teller.textContent=rows.length+(rows.length===1?" notificatie":" notificaties");
}
function ncOngelezen(aan){ncAlleenOngelezen=aan;ncLijst();}
// Filter aan/uit = direct opslaan in profiles.notify_prefs (app-vinkje)
async function ncFilter(ev,aan){
  const n=notifPrefs();
  n.app[ev]=aan;
  const{data,error}=await db.from("profiles").update({notify_prefs:n}).eq("id",ME.user.id).select().single();
  if(error){toast(error.message||"Opslaan mislukt");return;}
  Object.assign(ME.profile,data||{notify_prefs:n});
  belBadge();ncLijst();
}
