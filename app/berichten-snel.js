// app/berichten-snel.js — extra's bij de Berichten-pagina (19 nov 2026):
// 1. Snelle antwoorden: standaardzinnen van de coach (tabel quick_replies).
//    Typ "/" in het typvak of klik op het plusje en kies er een.
// 2. Bericht aan meerdere klanten: één tekst, bij ieder in het eigen gesprek.
// 3. Invoegen: een oefenvideo uit de bibliotheek of een verwijzing naar een
//    training van de klant. De app van het lid maakt links zelf aanklikbaar.
// Laadt na berichten.js en gebruikt BER, berInvoerKlaar, berConceptZet enz.

// ---------- Het venstertje boven het typvak ----------
// BER.pop = null of {mode:"menu"|"snel"|"video"|"training", …}
function berPopDicht(){
  BER.pop=null;
  const h=document.getElementById("ber-pop");if(h){h.style.display="none";h.innerHTML="";}
}
function berPopToon(){
  const h=document.getElementById("ber-pop");if(!h||!BER.pop)return;
  h.innerHTML=berPopHtml();h.style.display="block";
}
document.addEventListener("click",e=>{if(BER.pop&&!e.target.closest("#ber-pop")&&!e.target.closest(".berpopknop"))berPopDicht();});
function berPopMenu(ev){
  if(ev)ev.stopPropagation();
  if(BER.pop&&!BER.pop.slash){berPopDicht();return;}
  BER.pop={mode:"menu"};berPopToon();
}
function berPopNaarMenu(){BER.pop={mode:"menu"};berPopToon();}
function berPopHtml(){
  const p=BER.pop,groep=berIsGroep(BER.cur);
  const terug='<button class="bp-terug" onclick="event.stopPropagation();berPopNaarMenu()" title="Terug">‹</button>';
  if(p.mode==="menu")return '<div class="bp-kop">Invoegen</div>'+
    '<button class="bp-rij" onclick="event.stopPropagation();berPopSnel()"><span class="bp-ico">⚡</span><span><b>Snel antwoord</b><span class="bp-sub">Een zin die je vaak stuurt. Of typ / in het typvak.</span></span></button>'+
    '<button class="bp-rij" onclick="event.stopPropagation();berPopVideo()"><span class="bp-ico">🎬</span><span><b>Oefenvideo</b><span class="bp-sub">Een video uit de bibliotheek als link in je bericht.</span></span></button>'+
    (groep?'':'<button class="bp-rij" onclick="event.stopPropagation();berPopTraining()"><span class="bp-ico">📅</span><span><b>Training van deze klant</b><span class="bp-sub">Zet erbij over welke training je het hebt.</span></span></button>');
  if(p.mode==="snel")return '<div class="bp-kop">'+(p.slash?'':terug)+'Snelle antwoorden<button class="bp-link" onclick="event.stopPropagation();berSnelBeheer()">Beheren</button></div>'+
    (p.slash||!BER.snel.length?'':'<input class="lid-in bp-zoek" id="bp-zoek" placeholder="Zoek in je snelle antwoorden…" oninput="berSnelFilter(this.value)">')+
    '<div class="bp-lijst" id="bp-lijst">'+berSnelLijstHtml()+'</div>';
  if(p.mode==="video")return '<div class="bp-kop">'+terug+'Oefenvideo</div>'+
    '<input class="lid-in bp-zoek" id="bp-zoek" placeholder="Zoek een oefening…" oninput="berVideoFilter(this.value)">'+
    '<div class="bp-lijst" id="bp-lijst">'+berVideoLijstHtml()+'</div>';
  if(p.mode==="training")return '<div class="bp-kop">'+terug+'Training van deze klant</div>'+
    '<div class="bp-lijst" id="bp-lijst">'+berTrainingLijstHtml()+'</div>';
  return "";
}
function berPopZoekFocus(){const z=document.getElementById("bp-zoek");if(z){try{z.focus({preventScroll:true});}catch(e){}}}
function berPopLijstZet(html){const l=document.getElementById("bp-lijst");if(l)l.innerHTML=html;}

// Tekst op de plek van de cursor in het typvak zetten (en het concept bijwerken).
function berInvoeg(tekst){
  const inp=document.getElementById("ber-inp");if(!inp)return;
  const a=inp.selectionStart!=null?inp.selectionStart:inp.value.length,b=inp.selectionEnd!=null?inp.selectionEnd:a;
  const voor=inp.value.slice(0,a),na=inp.value.slice(b);
  const sp=voor&&!/\s$/.test(voor)?" ":"";
  inp.value=voor+sp+tekst+na;
  const pos=(voor+sp+tekst).length;
  chatGroei(inp);berConceptZet(BER.cur,inp.value);
  try{inp.focus({preventScroll:true});inp.setSelectionRange(pos,pos);}catch(e){}
}
// Toetsen in het typvak: staat de lijst met snelle antwoorden open, dan kies je
// met de pijltjes en Enter; Esc sluit. Anders: Enter = versturen (chatToets).
function berToets(ev,stuur){
  const p=BER.pop;
  if(p&&p.mode==="snel"){
    const lijst=berSnelLijst();
    if(ev.key==="ArrowDown"||ev.key==="ArrowUp"){
      ev.preventDefault();
      if(lijst.length){p.sel=((p.sel||0)+(ev.key==="ArrowDown"?1:-1)+lijst.length)%lijst.length;berPopLijstZet(berSnelLijstHtml());}
      return false;
    }
    if(ev.key==="Enter"&&!ev.shiftKey&&!ev.isComposing){
      ev.preventDefault();
      if(lijst.length)berSnelKies(lijst[Math.min(p.sel||0,lijst.length-1)].id);
      return false;
    }
  }
  if(p&&ev.key==="Escape"){ev.preventDefault();berPopDicht();return false;}
  return chatToets(ev,stuur);
}

// ---------- 1. Snelle antwoorden ----------
async function berSnelLaad(){
  try{
    const{data,error}=await db.from("quick_replies").select("*").eq("owner_id",ME.user.id).order("sort_order").order("created_at");
    BER.snel=error?[]:(data||[]);
  }catch(e){BER.snel=[];}
}
// "/" als eerste teken in het typvak opent de lijst; wat erna komt is de zoekterm.
function berSlash(ta){
  const v=ta.value;
  if(/^\/[^\n]*$/.test(v)){
    const zoek=v.slice(1).toLowerCase().trim();
    if(BER.pop&&BER.pop.slash){BER.pop.zoek=zoek;BER.pop.sel=0;berPopLijstZet(berSnelLijstHtml());}
    else{BER.pop={mode:"snel",slash:true,zoek,sel:0};berPopToon();}
  }else if(BER.pop&&BER.pop.slash)berPopDicht();
}
function berPopSnel(){BER.pop={mode:"snel",slash:false,zoek:"",sel:0};berPopToon();berPopZoekFocus();}
function berSnelFilter(v){if(!BER.pop)return;BER.pop.zoek=(v||"").toLowerCase().trim();BER.pop.sel=0;berPopLijstZet(berSnelLijstHtml());}
function berSnelLijst(){
  const z=(BER.pop&&BER.pop.zoek)||"";
  return (BER.snel||[]).filter(s=>!z||(s.title||"").toLowerCase().includes(z)||(s.body||"").toLowerCase().includes(z));
}
function berSnelLijstHtml(){
  if(!(BER.snel||[]).length)return '<div class="bp-leeg">Je hebt nog geen snelle antwoorden.<br><button class="btn sm2" style="margin-top:8px" onclick="event.stopPropagation();berSnelBeheer()">Maak je eerste</button></div>';
  const lijst=berSnelLijst(),sel=(BER.pop&&BER.pop.sel)||0;
  if(!lijst.length)return '<div class="bp-leeg">Geen snel antwoord gevonden.</div>';
  return lijst.map((s,i)=>'<button class="bp-rij'+(i===sel?" sel":"")+'" data-notr onclick="event.stopPropagation();berSnelKies(\''+esc(s.id)+'\')"><span>'+
    (s.title?'<b>'+esc(s.title)+'</b>':'')+'<span class="bp-sub">'+esc(String(s.body||"").replace(/\s+/g," ").slice(0,110))+'</span></span></button>').join("");
}
// {voornaam} in de tekst wordt de voornaam van de klant (in een groep: "allemaal").
function berVoornaamIn(tekst,voornaam){
  const re=/\{(?:voornaam|naam|firstname|name)\}/gi;
  if(voornaam)return String(tekst||"").replace(re,voornaam);
  return String(tekst||"").replace(/[ \t]*\{(?:voornaam|naam|firstname|name)\}/gi,"");
}
function berSnelKies(id){
  const s=(BER.snel||[]).find(x=>String(x.id)===String(id));if(!s)return;
  const inp=document.getElementById("ber-inp");if(!inp)return;
  const cur=String(BER.cur||"");
  const c=berIsGroep(cur)?null:BER.clients.find(x=>x.id===cur);
  const tekst=berVoornaamIn(s.body,berIsGroep(cur)?(berEN()?"all":"allemaal"):(c&&c.first_name)||"");
  const slash=BER.pop&&BER.pop.slash;
  berPopDicht();
  if(slash){inp.value="";inp.setSelectionRange(0,0);}
  berInvoeg(tekst);
}
// Beheren: lijstje met bewerken en weghalen, plus een formulier voor een nieuwe.
let bsEdit=null;
function berSnelBeheer(){
  berPopDicht();bsEdit=null;
  let m=document.getElementById("bsmodal");if(m)m.remove();
  const wrap=document.createElement("div");
  wrap.innerHTML='<div class="lmodal show" id="bsmodal" style="z-index:430"><div class="box" style="width:560px;max-width:96vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:4px"><h3 style="margin:0">Snelle antwoorden</h3>'+
    '<span onclick="document.getElementById(\'bsmodal\').remove()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div class="sm muted" style="margin-bottom:12px">Zinnen die je vaak stuurt. Typ / in het typvak van een gesprek om er een te kiezen. Zet {voornaam} in de tekst en de voornaam van de klant komt er vanzelf in.</div>'+
    '<div id="bs-lijst" class="bs-lijst"></div>'+
    '<div class="bs-form"><div class="ck-lbl" id="bs-formkop">Nieuw snel antwoord</div>'+
      '<input class="lid-in" id="bs-titel" style="width:100%;margin-bottom:8px" maxlength="60" placeholder="Korte naam, bijvoorbeeld Vakantie">'+
      '<textarea class="lid-in" id="bs-tekst" rows="4" style="width:100%;resize:vertical;line-height:1.5" placeholder="Hoi {voornaam}, …"></textarea>'+
      '<div class="msg err" id="bs-msg"></div>'+
      '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn" id="bs-opslaan" onclick="berSnelOpslaan()">Toevoegen</button>'+
      '<button class="btn ghost" id="bs-annuleer" style="display:none" onclick="berSnelBewerk(null)">Annuleren</button></div></div>'+
    '</div></div>';
  document.body.appendChild(wrap.firstChild);
  document.getElementById("bsmodal").addEventListener("click",e=>{if(e.target.id==="bsmodal")e.target.remove();});
  berSnelBeheerLijst();
}
function berSnelBeheerLijst(){
  const h=document.getElementById("bs-lijst");if(!h)return;
  h.innerHTML=(BER.snel||[]).length?BER.snel.map(s=>'<div class="bs-rij'+(bsEdit===s.id?" on":"")+'"><div style="min-width:0;flex:1" data-notr>'+
      (s.title?'<b>'+esc(s.title)+'</b>':'')+'<div class="bs-tekst">'+esc(s.body)+'</div></div>'+
      '<button class="btn ghost sm" onclick="berSnelBewerk(\''+esc(s.id)+'\')">Bewerken</button>'+
      '<button class="btn ghost sm" title="Weghalen" onclick="berSnelWeg(\''+esc(s.id)+'\')"><svg class="i sm-i"><use href="#i-trash"/></svg></button></div>').join("")
    :'<div class="cempty" style="padding:10px">Nog geen snelle antwoorden. Maak hieronder je eerste.</div>';
}
function berSnelBewerk(id){
  const s=id?(BER.snel||[]).find(x=>String(x.id)===String(id)):null;
  bsEdit=s?s.id:null;
  const el=i=>document.getElementById(i);
  if(!el("bs-tekst"))return;
  el("bs-titel").value=s?(s.title||""):"";el("bs-tekst").value=s?(s.body||""):"";el("bs-msg").textContent="";
  el("bs-formkop").textContent=s?"Snel antwoord bewerken":"Nieuw snel antwoord";
  el("bs-opslaan").textContent=s?"Wijziging opslaan":"Toevoegen";
  el("bs-annuleer").style.display=s?"":"none";
  berSnelBeheerLijst();
  if(s)el("bs-tekst").focus();
}
async function berSnelOpslaan(){
  const el=i=>document.getElementById(i);
  const titel=(el("bs-titel").value||"").trim(),tekst=(el("bs-tekst").value||"").trim(),msg=el("bs-msg");
  if(!tekst){msg.textContent="Typ eerst de tekst van het antwoord.";return;}
  const knop=el("bs-opslaan");knop.disabled=true;
  let fout=null;
  if(bsEdit){
    const{data,error}=await db.from("quick_replies").update({title:titel,body:tekst,updated_at:new Date().toISOString()}).eq("id",bsEdit).select().single();
    fout=error;
    if(!error){const s=BER.snel.find(x=>x.id===bsEdit);if(s)Object.assign(s,data||{title:titel,body:tekst});}
  }else{
    const hoogste=(BER.snel||[]).reduce((m,s)=>Math.max(m,s.sort_order||0),0);
    const{data,error}=await db.from("quick_replies").insert({company_id:ME.profile.company_id,owner_id:ME.user.id,title:titel,body:tekst,sort_order:hoogste+1}).select().single();
    fout=error;
    if(!error)BER.snel.push(data||{id:"tmp-"+Date.now(),title:titel,body:tekst,sort_order:hoogste+1});
  }
  knop.disabled=false;
  if(fout){msg.textContent=fout.message||"Opslaan mislukt";return;}
  toast(bsEdit?"Snel antwoord bijgewerkt":"Snel antwoord toegevoegd");
  berSnelBewerk(null);
}
async function berSnelWeg(id){
  const s=(BER.snel||[]).find(x=>String(x.id)===String(id));if(!s)return;
  if(!confirm("Dit snelle antwoord weghalen?"))return;
  const{error}=await db.from("quick_replies").delete().eq("id",s.id);
  if(error){toast(error.message||"Weghalen mislukt");return;}
  BER.snel=BER.snel.filter(x=>x.id!==s.id);
  if(bsEdit===s.id)berSnelBewerk(null);else berSnelBeheerLijst();
  toast("Snel antwoord weggehaald");
}

// ---------- 3a. Oefenvideo invoegen ----------
async function berPopVideo(){
  BER.pop={mode:"video",zoek:""};berPopToon();berPopZoekFocus();
  if(!LIB.geladen){
    try{await libLaad();}catch(e){}
    if(BER.pop&&BER.pop.mode==="video")berPopLijstZet(berVideoLijstHtml());
  }
}
function berVideoFilter(v){if(!BER.pop)return;BER.pop.zoek=v||"";berPopLijstZet(berVideoLijstHtml());}
const berVideoUrl=o=>o.youtube_id?"https://youtu.be/"+o.youtube_id:(o.video_url||"");
function berVideoLijstHtml(){
  if(!LIB.geladen)return '<div class="bp-leeg">Bibliotheek laden…</div>';
  const z=((BER.pop&&BER.pop.zoek)||"").trim();
  if(z.length<2)return '<div class="bp-leeg">Typ een paar letters van de oefening.</div>';
  const hits=oefZoek(z,LIB.oef.filter(o=>o.youtube_id||o.video_url)).slice(0,25);
  if(!hits.length)return '<div class="bp-leeg">Geen video gevonden.</div>';
  return hits.map(o=>'<button class="bp-rij" data-notr onclick="event.stopPropagation();berVideoKies('+Number(o.id)+')">'+
    (o.youtube_id?'<img class="bp-thumb" src="https://i.ytimg.com/vi/'+esc(o.youtube_id)+'/default.jpg" loading="lazy" alt="">':'<span class="bp-ico">🎬</span>')+
    '<span><b>'+esc(o.naam)+'</b></span></button>').join("");
}
function berVideoKies(id){
  const o=LIB.oef.find(x=>Number(x.id)===Number(id));if(!o)return;
  berPopDicht();
  berInvoeg(o.naam+": "+berVideoUrl(o));
}

// ---------- 3b. Training van deze klant invoegen ----------
// De trainingen van een week terug tot twee weken vooruit die het lid zelf ook
// ziet (geen concepten). Kiezen zet een zin in het bericht met dag en titel.
async function berPopTraining(){
  const cur=String(BER.cur||"");if(!cur||berIsGroep(cur))return;
  BER.pop={mode:"training",lijst:null,voor:cur};berPopToon();
  let rijen=[];
  try{
    const{data}=await db.from("workouts").select("id,workout_date,title").eq("client_id",cur).neq("status","draft")
      .gte("workout_date",ymd(addDays(new Date(),-7))).lte("workout_date",ymd(addDays(new Date(),14))).order("workout_date");
    rijen=(data||[]).filter(w=>!/^rest ?day$/i.test((w.title||"").trim()));
  }catch(e){}
  if(!BER.pop||BER.pop.mode!=="training"||BER.pop.voor!==cur)return;
  BER.pop.lijst=rijen;berPopLijstZet(berTrainingLijstHtml());
}
// "vandaag", "morgen", "gisteren" of "vrijdag 21 november"
function berTrainingDag(datum){
  const d=new Date(datum+"T12:00:00"),n=berDagenTerug(d.toISOString());
  if(n===0)return berEN()?"today":"vandaag";
  if(n===-1)return berEN()?"tomorrow":"morgen";
  if(n===1)return berEN()?"yesterday":"gisteren";
  return berEN()?d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}):BER_DAG[d.getDay()]+" "+d.getDate()+" "+BER_MAAND[d.getMonth()];
}
function berTrainingLijstHtml(){
  const l=BER.pop&&BER.pop.lijst;
  if(!l)return '<div class="bp-leeg">Trainingen laden…</div>';
  if(!l.length)return '<div class="bp-leeg">Geen trainingen gevonden van vorige week tot over twee weken.</div>';
  const td=todayStr();
  return l.map(w=>'<button class="bp-rij'+(w.workout_date===td?" sel":"")+'" data-notr onclick="event.stopPropagation();berTrainingKies(\''+esc(w.id)+'\')">'+
    '<span class="bp-dag">'+esc(berTrainingDag(w.workout_date))+'</span><span><b>'+esc(w.title||(berEN()?"Workout":"Training"))+'</b></span></button>').join("");
}
function berTrainingKies(id){
  const w=((BER.pop&&BER.pop.lijst)||[]).find(x=>String(x.id)===String(id));if(!w)return;
  const dag=berTrainingDag(w.workout_date),los=/^(vandaag|morgen|gisteren|today|tomorrow|yesterday)$/.test(dag);
  const titel=w.title?" ("+w.title+")":"";
  berPopDicht();
  berInvoeg(berEN()?"About your workout "+(los?dag:"on "+dag)+titel+": ":"Over je training van "+dag+titel+": ");
}

// ---------- 2. Bericht aan meerdere klanten ----------
// Elke gekozen klant krijgt het bericht in zijn eigen gesprek, als los bericht.
// Twee stappen: eerst kiezen en typen, dan een bevestiging met het aantal.
function berMeerNieuw(){
  let m=document.getElementById("bmmodal");if(m)m.remove();
  const admin=myRole()!=="coach";
  const chips=[["een","Alle 1-op-1 klanten"],["blog","Alle blog-leden"]].concat(admin?[["mijn","Mijn eigen klanten"]]:[]).concat(BER.programs.map(p=>["p:"+p.id,"Blog: "+p.name]));
  const wrap=document.createElement("div");
  wrap.innerHTML='<div class="lmodal show" id="bmmodal" style="z-index:430"><div class="box" style="width:560px;max-width:96vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:4px"><h3 style="margin:0">Bericht aan meerdere klanten</h3>'+
    '<span id="bm-sluit" onclick="berMeerSluit()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div class="sm muted" style="margin-bottom:12px">Iedereen krijgt het bericht in zijn eigen gesprek met jou. Niemand ziet wie het nog meer kreeg.</div>'+
    '<textarea class="lid-in" id="bm-tekst" rows="4" style="width:100%;resize:vertical;line-height:1.5" placeholder="Hoi {voornaam}, …" oninput="berMeerTel()"></textarea>'+
    '<div class="sm muted" style="margin:4px 0 12px">Zet {voornaam} in de tekst en elke klant ziet zijn eigen voornaam.</div>'+
    '<div id="bm-kies">'+
      '<div class="sm muted" style="margin-bottom:6px">Snel selecteren:</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'+chips.map(c=>'<button class="btn ghost sm" onclick="berMeerSnel(\''+c[0]+'\')">'+esc(c[1])+'</button>').join("")+'<button class="btn ghost sm" onclick="berMeerSnel(\'geen\')">Alles wissen</button></div>'+
      '<input class="lid-in" style="width:100%;margin-bottom:8px" placeholder="Zoek een klant…" oninput="berMeerZoek(this.value)">'+
      '<div id="bm-lijst" style="max-height:240px;overflow:auto;border:1px solid #eef0f3;border-radius:10px;padding:6px">'+berMeerKiesHtml("",[])+'</div>'+
    '</div>'+
    '<div class="msg" id="bm-msg"></div>'+
    '<div id="bm-knoppen" style="display:flex;gap:8px;margin-top:14px;align-items:center;flex-wrap:wrap"></div>'+
    '</div></div>';
  document.body.appendChild(wrap.firstChild);
  BER.meer={stap:1,bezig:false};
  berMeerTel();
  const t=document.getElementById("bm-tekst");if(t)t.focus();
}
function berMeerSluit(){if(BER.meer&&BER.meer.bezig)return;const m=document.getElementById("bmmodal");if(m)m.remove();BER.meer=null;}
const berMeerGekozen=()=>[...document.querySelectorAll(".bm-lid:checked")].map(x=>x.value);
function berMeerKiesHtml(zoek,aangevinkt){
  let cs=BER.clients.filter(c=>c.id!==ME.user.id);
  if(zoek)cs=cs.filter(c=>naamVan(c).toLowerCase().includes(zoek));
  // Aangevinkte klanten die buiten de zoekterm vallen blijven (onzichtbaar) aangevinkt
  const buiten=aangevinkt.filter(id=>!cs.some(c=>c.id===id));
  if(!cs.length&&!buiten.length)return '<div class="cempty">Niemand gevonden.</div>';
  const admin=myRole()!=="coach";
  return cs.map(c=>{
    const coach=admin?BER.coaches.find(x=>x.id===c.coach_id):null;
    return '<label class="bm-rij"><input type="checkbox" class="bm-lid" value="'+c.id+'" style="width:auto;margin:0" data-mt="'+esc(c.membership_type||"")+'" data-bp="'+esc(((BER.progVan||{})[c.id]||[]).join(","))+'" data-coach="'+esc(c.coach_id||"")+'"'+(aangevinkt.includes(c.id)?" checked":"")+' onchange="berMeerTel()">'+
      '<span class="cavc" style="width:26px;height:26px;font-size:9px;flex:none;'+avFotoStyle(c)+'">'+avFotoText(c)+'</span>'+naamVan(c)+
      '<span class="sm muted" style="margin-left:auto">'+(c.membership_type==="free_blog"?"blog":"1-op-1")+(coach?' · <span data-notr>'+esc(coach.first_name||"")+'</span>':'')+'</span></label>';
  }).join("")+buiten.map(id=>'<input type="checkbox" class="bm-lid" value="'+esc(id)+'" checked style="display:none">').join("");
}
function berMeerZoek(v){const h=document.getElementById("bm-lijst");if(h)h.innerHTML=berMeerKiesHtml((v||"").toLowerCase().trim(),berMeerGekozen());}
function berMeerSnel(wat){
  document.querySelectorAll(".bm-lid").forEach(cb=>{
    if(wat==="geen")cb.checked=false;
    else if(wat==="een"&&cb.dataset.mt==="one_on_one")cb.checked=true;
    else if(wat==="blog"&&cb.dataset.mt==="free_blog")cb.checked=true;
    else if(wat==="mijn"&&cb.dataset.coach===ME.user.id)cb.checked=true;
    else if(wat.indexOf("p:")===0&&(cb.dataset.bp||"").split(",").includes(wat.slice(2)))cb.checked=true;
  });
  berMeerTel();
}
const berKlantWoord=n=>n===1?"klant":"klanten";
// Knoppenrij onderaan: stap 1 = "Verder", stap 2 = bevestigen met het aantal.
function berMeerTel(){
  const k=document.getElementById("bm-knoppen");if(!k||!BER.meer||BER.meer.bezig)return;
  const n=berMeerGekozen().length,tekst=((document.getElementById("bm-tekst")||{}).value||"").trim();
  const msg=document.getElementById("bm-msg");
  if(BER.meer.stap===2&&(!n||!tekst))BER.meer.stap=1;
  if(BER.meer.stap===1){
    if(msg){msg.className="msg";msg.textContent="";}
    k.innerHTML='<button class="btn" id="bm-verder"'+(n&&tekst?"":" disabled")+' onclick="berMeerStap(2)">Verder: '+n+' '+berKlantWoord(n)+' gekozen</button>'+
      '<button class="btn ghost" onclick="berMeerSluit()">Annuleren</button>';
  }else{
    const eerste=BER.clients.find(c=>c.id===berMeerGekozen()[0]);
    if(msg){msg.className="msg";msg.innerHTML='<b>Dit stuurt '+n+' '+(n===1?"los bericht":"losse berichten")+'.</b> Dat kun je niet terughalen.'+
      (eerste?'<div class="bm-voorbeeld" data-notr><span class="sm muted">'+esc((berEN()?"This is what "+(eerste.first_name||"")+" sees:":"Zo ziet "+(eerste.first_name||"de eerste")+" het:"))+'</span>'+esc(berVoornaamIn(tekst,eerste.first_name||""))+'</div>':'');}
    k.innerHTML='<button class="btn" id="bm-stuur" onclick="berMeerStuur()">Ja, verstuur naar '+n+' '+berKlantWoord(n)+'</button>'+
      '<button class="btn ghost" onclick="berMeerStap(1)">Terug</button>';
  }
}
function berMeerStap(s){if(!BER.meer||BER.meer.bezig)return;BER.meer.stap=s;berMeerTel();}
async function berMeerStuur(){
  if(!BER.meer||BER.meer.bezig)return;
  const ids=berMeerGekozen(),tekst=((document.getElementById("bm-tekst")||{}).value||"").trim();
  if(!ids.length||!tekst)return;
  BER.meer.bezig=true;
  const k=document.getElementById("bm-knoppen"),msg=document.getElementById("bm-msg");
  document.querySelectorAll("#bmmodal textarea,#bmmodal input,#bmmodal #bm-kies button").forEach(x=>{x.disabled=true;});
  const voortgang=i=>{if(k)k.innerHTML='<span class="sm muted" data-notr>'+(berEN()?"Sending… ":"Versturen… ")+i+" / "+ids.length+'</span>';};
  voortgang(0);
  let goed=0;const mislukt=[];
  for(let i=0;i<ids.length;i++){
    const c=BER.clients.find(x=>x.id===ids[i]);
    if(c){
      let data=null,error=null;
      try{({data,error}=await db.from("messages").insert({company_id:ME.profile.company_id,athlete_id:c.id,sender_id:ME.user.id,body:berVoornaamIn(tekst,c.first_name||""),media:[]}).select().single());}
      catch(e){error=e;}
      if(error)mislukt.push([c.first_name,c.last_name].filter(Boolean).join(" ")||c.email||"?");
      else{
        goed++;
        // Realtime kan hetzelfde bericht al gebracht hebben: niet dubbel in de lijst
        if(data&&!BER.msgs.some(x=>x.id===data.id)){BER.msgs.push(data);if(BER.cur===c.id)berAppend(data);}
      }
    }
    voortgang(i+1);
  }
  BER.meer.bezig=false;
  berLijstVernieuw();
  if(!mislukt.length){
    const m=document.getElementById("bmmodal");if(m)m.remove();BER.meer=null;
    toast("Verstuurd naar "+goed+" "+berKlantWoord(goed),3500);
    return;
  }
  // Iets ging mis: venster blijft staan met wie het niet kreeg
  if(msg){msg.className="msg err";msg.innerHTML='<span data-notr>'+esc((berEN()?"Sent to "+goed+", failed for: ":"Verstuurd naar "+goed+", niet gelukt bij: ")+mislukt.join(", "))+'</span>';}
  if(k)k.innerHTML='<button class="btn ghost" onclick="berMeerSluit()">Sluiten</button>';
}
