// app/berichten-bericht.js — acties op één bericht in Berichten (pakket 2, 19 nov 2026):
// antwoorden op een bericht (messages.reply_to), een eigen bericht bewerken of
// verwijderen, en een spraakbericht opnemen. Alleen in 1-op-1 gesprekken.
// De database bewaakt het zelf: alleen de afzender wijzigt of verwijdert een
// bericht (policies + trigger messages_bewaak); dit bestand is de bediening.
// Laadt na berichten.js.

// ---------- Menu op een bubbel ----------
// Pijltje rechtsboven in de bubbel (zichtbaar bij aanwijzen). Het menu hangt aan
// de body, net als het menu van een rij in de lijst.
function berBubKnopHtml(m){
  if(!m.id||String(m.id).indexOf("tmp")===0)return "";
  return '<button class="bubknop" title="'+(berEN()?"Reply, edit or delete":"Antwoorden, bewerken of verwijderen")+'" onclick="berBubMenu(event,this,\''+esc(m.id)+'\')">⌄</button>';
}
function berBubMenu(ev,btn,id){
  ev.stopPropagation();
  const bestond=document.querySelector('.coachmenu.ber-menu[data-voor="b:'+id+'"]');
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  if(bestond)return;
  const m=BER.msgs.find(x=>String(x.id)===String(id));if(!m)return;
  const mijn=m.sender_id===ME.user.id;
  const menu=document.createElement("div");menu.className="coachmenu ber-menu";menu.dataset.voor="b:"+id;
  menu.innerHTML='<button onclick="event.stopPropagation();berAntwoord(\''+esc(id)+'\')">Antwoorden</button>'+
    (mijn?'<button onclick="event.stopPropagation();berBewerk(\''+esc(id)+'\')">Bewerken</button>'+
      '<button class="danger" onclick="event.stopPropagation();berVerwijder(\''+esc(id)+'\')">Verwijderen</button>':'');
  document.body.appendChild(menu);
  const r=btn.getBoundingClientRect();
  menu.style.top=Math.min(r.bottom+4,window.innerHeight-menu.offsetHeight-8)+"px";
  menu.style.left=Math.max(8,Math.min(r.right-menu.offsetWidth,window.innerWidth-menu.offsetWidth-8))+"px";
}
document.addEventListener("click",e=>{if(!e.target.closest(".coachmenu.ber-menu")&&!e.target.closest(".bubknop")&&!e.target.closest(".ber-kebab"))document.querySelectorAll('.coachmenu.ber-menu[data-voor^="b:"]').forEach(x=>x.remove());});

// ---------- Citaat in een bubbel ----------
// Naam van de afzender voor in een citaat of de balk boven het typvak (platte tekst).
function berAfzNaam(m){
  if(m.sender_id===ME.user.id)return berEN()?"You":"Jij";
  const p=BER.clients.find(x=>x.id===m.sender_id)||BER.coaches.find(x=>x.id===m.sender_id);
  return p?([p.first_name,p.last_name].filter(Boolean).join(" ")||p.email||"Coach"):"Coach";
}
function berCitaatHtml(m){
  if(!m.reply_to)return "";
  const o=BER.msgs.find(x=>x.id===m.reply_to);
  if(!o)return ""; // het oorspronkelijke bericht is weg
  return '<div class="bubcit" title="'+(berEN()?"Go to this message":"Naar dit bericht")+'" onclick="berNaarBericht(\''+esc(o.id)+'\')"><b>'+esc(berAfzNaam(o))+'</b><span>'+esc(String(chatPreview(o)).replace(/\s+/g," ").slice(0,160))+'</span></div>';
}

// ---------- Balk boven het typvak: antwoord op … / bericht bewerken ----------
// BER.antw = id van het bericht waarop je antwoordt; BER.bew = {id, concept}
function berBalkHtml(){
  if(BER.bew){
    return '<div class="berbalk bew"><span class="bb-ico">✎</span><div class="bb-tekst"><b>Bericht bewerken</b><span>Enter slaat de wijziging op.</span></div>'+
      '<button class="bb-x" title="Annuleren" onclick="berBewerkStop()">×</button></div>';
  }
  const o=BER.antw?BER.msgs.find(x=>x.id===BER.antw):null;
  if(!o)return "";
  return '<div class="berbalk"><span class="bb-ico">↩</span><div class="bb-tekst" data-notr><b>'+esc((berEN()?"Reply to ":"Antwoord op ")+berAfzNaam(o))+'</b><span>'+esc(String(chatPreview(o)).replace(/\s+/g," ").slice(0,200))+'</span></div>'+
    '<button class="bb-x" title="Annuleren" onclick="berAntwoordStop()">×</button></div>';
}
function berBalkZet(){const h=document.getElementById("ber-balk");if(h)h.innerHTML=berBalkHtml();}
function berFocusInp(){const inp=document.getElementById("ber-inp");if(inp){try{inp.focus({preventScroll:true});inp.setSelectionRange(inp.value.length,inp.value.length);}catch(e){}}}
function berAntwoord(id){
  berMenuWeg();
  if(BER.bew)berBewerkStop();
  BER.antw=id;berBalkZet();berFocusInp();
}
function berAntwoordStop(){BER.antw=null;berBalkZet();berFocusInp();}
function berBewerk(id){
  berMenuWeg();
  const m=BER.msgs.find(x=>String(x.id)===String(id));if(!m||m.sender_id!==ME.user.id)return;
  const inp=document.getElementById("ber-inp");if(!inp)return;
  // Wat er al getypt stond bewaren we en zetten we terug na het bewerken
  BER.bew={id:m.id,concept:BER.bew?BER.bew.concept:inp.value};BER.antw=null;
  inp.value=m.body||"";chatGroei(inp);
  berBalkZet();berFocusInp();
}
function berBewerkStop(){
  const inp=document.getElementById("ber-inp");
  if(inp&&BER.bew){inp.value=BER.bew.concept||"";chatGroei(inp);}
  BER.bew=null;berBalkZet();berFocusInp();
}
// Wijziging opslaan (vanuit berStuur). Leeg mag alleen als er een bijlage aan het bericht hangt.
async function berBewerkOpslaan(tekst){
  const b=BER.bew;if(!b)return;
  const m=BER.msgs.find(x=>x.id===b.id);if(!m){berBewerkStop();return;}
  if(!tekst&&!(m.media&&m.media.length)){toast("Een leeg bericht kan niet. Verwijder het bericht als het weg moet.",4000);return;}
  if(tekst===(m.body||"")){berBewerkStop();return;}
  const{data,error}=await db.from("messages").update({body:tekst}).eq("id",m.id).select().single();
  if(error){toast(error.message||"Opslaan mislukt");return;}
  Object.assign(m,data||{body:tekst,edited_at:new Date().toISOString()});
  if(!m.edited_at)m.edited_at=new Date().toISOString();
  berBewerkStop();
  berRijVervang(m);berCitatenVan(m.id);
  berLijstVernieuw();
}
async function berVerwijder(id){
  berMenuWeg();
  const m=BER.msgs.find(x=>String(x.id)===String(id));if(!m||m.sender_id!==ME.user.id)return;
  if(!confirm("Dit bericht verwijderen? Het verdwijnt ook bij je klant."))return;
  const{data,error}=await db.from("messages").delete().eq("id",m.id).select("id");
  if(error||!(data&&data.length)){toast((error&&error.message)||"Verwijderen is niet gelukt");return;}
  // Bijlagen horen bij het bericht: die gaan mee weg
  if(m.media&&m.media.length){try{db.storage.from("media").remove(m.media.map(x=>x.path));}catch(e){}}
  berBerichtWeg(m.id);
  toast("Bericht verwijderd");
}
// Een bericht is weg (zelf verwijderd of live binnengekomen): lijst, draad en citaten bijwerken.
function berBerichtWeg(id){
  const i=BER.msgs.findIndex(x=>String(x.id)===String(id));if(i<0)return;
  const m=BER.msgs[i];BER.msgs.splice(i,1);
  if(BER.antw===m.id)BER.antw=null;
  if(BER.bew&&BER.bew.id===m.id)berBewerkStop();
  const antwoorden=BER.msgs.filter(x=>x.reply_to===m.id);
  antwoorden.forEach(x=>{x.reply_to=null;});
  if(!document.getElementById("ber-lijst"))return;
  if(BER.cur===m.athlete_id){
    const host=document.getElementById("ber-msgs");
    if(host){
      host.querySelectorAll(".wcrij").forEach(el=>{if(el.dataset.mid===String(m.id))el.remove();});
      // Datumregels zonder berichten eronder opruimen
      [...host.querySelectorAll(".dagsep")].forEach(sep=>{const n=sep.nextElementSibling;if(!n||n.classList.contains("dagsep"))sep.remove();});
      if(!host.querySelector(".wcrij"))host.innerHTML='<div class="sm muted" style="text-align:center;padding:14px">Nog geen berichten. Stuur het eerste bericht.</div>';
    }
    antwoorden.forEach(berRijVervang);
    berBalkZet();
  }
  berLijstVernieuw();
}
// Eén bubbel opnieuw tekenen (na bewerken, of als het citaat erin veranderd is).
function berRijVervang(m){
  const c=BER.clients.find(x=>x.id===m.athlete_id);if(!c||BER.cur!==m.athlete_id)return;
  document.querySelectorAll("#ber-msgs .wcrij").forEach(el=>{if(el.dataset.mid===String(m.id))el.outerHTML=berBubHtml(m,c);});
  if(typeof dashVidSrcs==="function")dashVidSrcs();
}
// Alle bubbels die dit bericht citeren opnieuw tekenen (de tekst in het citaat loopt mee).
function berCitatenVan(id){BER.msgs.filter(x=>x.reply_to===id).forEach(berRijVervang);}

// ---------- Spraakbericht opnemen ----------
// Opnemen met de microfoon van de computer; het resultaat gaat als bijlage mee
// (kind "audio"). Altijd MP4 (AAC): dat speelt ook op een iPhone. De bucket
// laat alleen video/* en image/* toe, daarom gaat het bestand als video/mp4
// omhoog; een MP4 met alleen geluid is daar gewoon een geldig bestand.
const BER_OPN_MAX=300; // seconden
let BEROPN=null;       // {rec, stream, delen, start, tik, annuleer}
function berOpnType(){
  if(typeof MediaRecorder==="undefined")return "";
  return ["audio/mp4;codecs=mp4a.40.2","audio/mp4"].find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch(e){return false;}})||"";
}
const berDuur=s=>{s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+":"+("0"+(s%60)).slice(-2);};
async function berOpnStart(){
  if(BEROPN)return;
  if(!BER.cur||berIsGroep(BER.cur))return;
  const type=berOpnType();
  if(!type||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast("Een spraakbericht opnemen werkt in Chrome, Edge of Safari. Werk je browser bij als het daar niet lukt.",5000);return;}
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}
  catch(e){toast("Geef de browser toegang tot je microfoon om een spraakbericht op te nemen.",5000);return;}
  const voor=BER.cur;
  let rec;
  try{rec=new MediaRecorder(stream,{mimeType:type,audioBitsPerSecond:64000});}
  catch(e){stream.getTracks().forEach(t=>t.stop());toast("Opnemen is niet gelukt");return;}
  BEROPN={rec,stream,delen:[],start:Date.now(),voor,annuleer:false,tik:null};
  rec.ondataavailable=e=>{if(e.data&&e.data.size)BEROPN&&BEROPN.delen.push(e.data);};
  rec.onstop=()=>{
    const o=BEROPN;BEROPN=null;if(!o)return;
    clearInterval(o.tik);o.stream.getTracks().forEach(t=>t.stop());
    berOpnBalk();
    const duur=Math.max(1,Math.round((Date.now()-o.start)/1000));
    if(o.annuleer||!o.delen.length||BER.cur!==o.voor)return;
    const f=new File(o.delen,"spraakbericht.mp4",{type:"video/mp4"});
    f._audio=true;f._duur=duur;
    try{f._url=URL.createObjectURL(f);}catch(e){}
    CHATBIJL.ber.push(f);chatBijlToon("ber");berFocusInp();
  };
  rec.start();
  BEROPN.tik=setInterval(()=>{
    if(!BEROPN)return;
    const s=(Date.now()-BEROPN.start)/1000;
    const t=document.getElementById("ber-opn-tijd");if(t)t.textContent=berDuur(s);
    if(s>=BER_OPN_MAX)berOpnStop(false);
  },250);
  berOpnBalk();
}
function berOpnStop(annuleer){
  if(!BEROPN)return;
  BEROPN.annuleer=!!annuleer;
  try{BEROPN.rec.stop();}catch(e){const o=BEROPN;BEROPN=null;clearInterval(o.tik);o.stream.getTracks().forEach(t=>t.stop());berOpnBalk();}
}
// Tijdens het opnemen: een rode balk met de tijd, Klaar en Annuleren.
function berOpnBalk(){
  const h=document.getElementById("ber-opn");if(!h)return;
  h.innerHTML=BEROPN?'<div class="berbalk opn"><span class="bb-stip"></span><div class="bb-tekst"><b>Spraakbericht opnemen</b><span data-notr id="ber-opn-tijd">'+berDuur((Date.now()-BEROPN.start)/1000)+'</span></div>'+
    '<button class="btn sm2" onclick="berOpnStop(false)">Klaar</button><button class="btn ghost sm" onclick="berOpnStop(true)">Annuleren</button></div>':"";
  const k=document.getElementById("ber-mic");if(k)k.classList.toggle("aan",!!BEROPN);
}
