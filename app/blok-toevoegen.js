// app/blok-toevoegen.js — "Blok toevoegen": één blok in één venster (verzoek Stefan
// 6 nov 2026, naar het voorbeeld van Strivee). Het venster heeft: datum, soort blok
// (Eigen workout / Barbell-set / Benchmark), score, titel, omschrijving met slimme
// berekening (% van de 1RM van de sporter), coachingtips, media (demo-video's:
// voorstellen uit de tekst met + en ✕, zelf zoeken; zelfde chips als bij de
// warming-up, app/demo-videos.js) en de blokkleur.
//
// Waar het venster opent (BLK.ctx), sinds 12 nov 2026 op vier plekken:
//   klant  — dag-menu van de klantkalender (datum te kiezen)
//   blog   — dag-menu van een blogprogramma (datum te kiezen)
//   prog   — dag-menu van de programma-editor in de bibliotheek (week + dag)
//   bouwer — knop "+ Blok toevoegen" in een open bouwer (alle drie de bouwers):
//            het blok komt onderaan in die sessie en gaat mee bij het opslaan
//
// Opslaan vanuit een dag-menu zet het blok onder de workout van die dag; is de dag
// leeg (of alleen een rustdag), dan komt er een nieuwe workout met deze titel en dit
// als blok A. Staat de bouwer open op die dag, dan komt het blok onderaan in de bouwer.
// Het blok is een gewoon blocks-rijtje (kind exercise, zoals bij Invoegen):
// titel = exercise, omschrijving = prescription, coachingtips = notes (de app
// toont notes onder de omschrijving), media = media, kleur = color.

let BLK={soort:"custom",kleur:"",lift:"",liftAuto:true,bench:null,datum:null,ctx:"klant",week:null,day:null};
const BLK_KLEUREN=["","red","orange","yellow","green","blue","purple"];
const BLK_PLUS='<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

function ensureBlokModal(){
  if(document.getElementById("blokmodal"))return;
  const d=document.createElement("div");
  d.innerHTML='<div class="lmodal" id="blokmodal" style="z-index:395"><div class="box blk-box">'+
    '<div class="blk-kop"><div class="blk-datum"><input type="date" id="blk-datum" title="Op welke dag komt dit blok?" onchange="blkDatumLabel()"><span class="blk-datumlbl" id="blk-datumlbl"></span></div>'+
      '<span class="blk-x" onclick="closeBlok()" title="Sluiten">×</span></div>'+
    '<div class="blk-veld"><label>Soort blok</label><div class="seg blk-seg" id="blk-soort"><button class="on" onclick="blkSoort(\'custom\',this)">Eigen workout</button><button onclick="blkSoort(\'barbell\',this)">Barbell-set</button><button onclick="blkSoort(\'bench\',this)">Benchmark</button></div></div>'+
    '<div class="blk-veld" id="blk-benchveld" style="display:none"><label>Benchmark kiezen</label><input id="blk-benchzoek" placeholder="Zoek een benchmark (Fran, Murph, Open 24.1…)" oninput="blkBenchLijst()" autocomplete="off"><div class="blk-benchlijst" id="blk-benchlijst"></div></div>'+
    '<div class="blk-veld"><label>Score</label><div class="blk-scorerij"><select id="blk-score" title="Scoretype: bepaalt het invoerveld van de sporter" onchange="blkScoreWissel()">'+selOpts(SCORETYPES,"text")+'</select>'+
      '<span id="blk-capvak" style="display:none"><input id="blk-cap" placeholder="timecap mm:ss" title="Timecap (leeg = geen)"><select id="blk-capst" title="Wat logt wie de cap niet haalt?">'+selOpts([["reps","gecapt: reps"],["rounds_reps","gecapt: rondes + reps"]],"reps")+'</select></span></div></div>'+
    '<div class="blk-veld"><label>Titel</label><input id="blk-titel" placeholder="Bijv. AMRAP 12\'" data-vshost="wm_blok" onblur="blkLiftAuto()" autocomplete="off"></div>'+
    '<div class="blk-veld"><label>Omschrijving</label><div class="blk-omschr"><textarea id="blk-omschr" placeholder="Omschrijving van de workout" data-vshost="wm_blok" oninput="blkCijfers()"></textarea>'+
      '<button class="btn ghost sm blk-slim" title="Percentage van de 1RM van de sporter in de tekst zetten" onclick="blkSlimToon()">⊞ Slimme berekening</button></div>'+
      '<div id="blk-slim" class="blk-slim-rij" style="display:none"></div>'+
      '<div id="blk-liftrij" class="blk-liftrij" style="display:none"></div>'+
      '<div id="blk-cijfers" class="klcijfers" style="display:none"></div></div>'+
    '<div class="blk-veld"><label>Coachingtips <span class="blk-help" title="Aanwijzingen voor de sporter; staan in de app onder de omschrijving">?</span></label><textarea id="blk-tips" placeholder="Bijv. rustig opbouwen, focus op de adem…"></textarea></div>'+
    '<div class="blk-veld"><label>Media <span class="muted" style="font-weight:500">(optioneel)</span></label>'+
      '<div class="blk-mediaknoppen"><button class="btn ghost sm" title="Zoek een demo-video in de bibliotheek of plak een YouTube-link" onclick="blkMediaZoek()">+ Media toevoegen</button><button class="btn ghost sm blk-auto" title="Alle herkende oefeningen uit de tekst in één keer toevoegen" onclick="blkMediaAuto()">✦ Voorstellen overnemen</button></div>'+
      '<div class="cwmedia" id="wm_blok" data-tekstvan="blk-titel,blk-omschr" data-oefid="" data-gmedia=""><div class="vschips"></div><div class="vidpop"></div></div>'+
      '<div class="sm muted" style="margin-top:4px">Blauwe chips zijn voorstellen uit de tekst: + is toevoegen, ✕ is niet meer voorstellen. De sporter krijgt de video\'s in de app.</div></div>'+
    '<div class="blk-veld"><label>Blokkleur</label><div class="blk-kleuren" id="blk-kleuren"></div></div>'+
    '<div class="blk-voet"><div class="blk-bieb"><button class="btn" id="blk-biebknop" title="Zet dit blok op de dag én bewaar het als nieuwe template in de bibliotheek (kies eerst een thema)" onclick="blokOpslaan(true)">Opslaan + in bibliotheek</button><select id="blk-biebthema" title="Thema in de bibliotheek (alleen nodig voor Opslaan + in bibliotheek)">'+blkBiebOpties()+'</select></div>'+
      '<div class="blk-voet-rechts"><button class="btn ghost" onclick="closeBlok()">Annuleren</button><button class="btn" id="blk-save" onclick="blokOpslaan()">Opslaan</button></div></div>'+
    '<div class="msg" id="blk-msg" style="min-height:0"></div>'+
    '</div></div>';
  document.body.appendChild(d.firstChild);
}

// ---------- Waar het venster opent ----------
// Dag-menu van de klantkalender.
function pickBlok(ev){ev.stopPropagation();openBlokModal(curDay);}
// Dag-menu van een blogprogramma (Blog-sectie).
function blogPickBlok(datum){document.querySelectorAll(".daymenu").forEach(x=>x.remove());openBlokModal(datum,{ctx:"blog"});}
// Dag-menu van de programma-editor (Bibliotheek › Programma's): week + dag in plaats van een datum.
function progPickBlok(week,day){
  if(typeof progMagOfMeld==="function"&&!progMagOfMeld())return;
  document.querySelectorAll(".daymenu").forEach(x=>x.remove());
  openBlokModal(null,{ctx:"prog",week,day});
}
// Knop in een open bouwer (klantkalender, blogprogramma of programma-editor):
// het blok komt onderaan in die sessie.
function openBlokBouwer(){
  if(!document.getElementById("exrows")){toast("Open eerst een workout in de bouwer");return;}
  openBlokModal(null,{ctx:"bouwer"});
}
// De knoppen zelf, zodat de drie bouwers en de dag-menu's dezelfde tekst en stijl delen.
// De bouwer-knop staat op een eigen rij boven + Oefening / + Conditioning, zodat die rij blijft zoals hij was.
function blokKnopHtml(){return '<div class="addbtns blokrij"><button class="blokknop" title="Eén blok in één venster: titel, omschrijving, score, coachingtips, video\'s en kleur. Komt onderaan in deze sessie." onclick="openBlokBouwer()">+ Blok toevoegen</button></div>';}
function blokMenuKnopHtml(actie){return '<button class="breed" title="Eén blok toevoegen op deze dag (zoals in Strivee)" onclick="event.stopPropagation();'+actie+'">'+BLK_PLUS+' Blok toevoegen</button>';}

function openBlokModal(ds,opts){
  const ctx=(opts&&opts.ctx)||"klant";
  if(ctx==="klant"&&!calClient){toast("Open eerst een klant");return;}
  if(ctx==="blog"&&!(typeof BLOG!=="undefined"&&BLOG.cur)){toast("Open eerst een blogprogramma");return;}
  if(ctx==="prog"&&!(typeof PROG!=="undefined"&&PROG)){toast("Open eerst een programma");return;}
  ensureBlokModal();
  BLK={soort:"custom",kleur:"",lift:"",liftAuto:true,bench:null,datum:ds||todayStr(),ctx,week:(opts&&opts.week)||null,day:(opts&&opts.day)||null};
  const g=id=>document.getElementById(id);
  // Kop: een datumkiezer (klant, blog) of een vaste regel (programma: week en dag; bouwer: de open sessie).
  const metDatum=ctx==="klant"||ctx==="blog";
  g("blk-datum").style.display=metDatum?"":"none";
  if(metDatum){g("blk-datum").value=BLK.datum;blkDatumLabel();}
  else g("blk-datumlbl").textContent=ctx==="prog"?"Week "+BLK.week+" · dag "+((BLK.week-1)*7+BLK.day):"Komt onderaan in de open sessie";
  ["blk-titel","blk-omschr","blk-tips","blk-cap","blk-benchzoek"].forEach(id=>{g(id).value="";});
  g("blk-score").value="text";g("blk-capst").value="reps";blkScoreWissel();
  document.querySelectorAll("#blk-soort button").forEach((b,i)=>b.classList.toggle("on",i===0));
  g("blk-benchveld").style.display="none";g("blk-benchlijst").innerHTML="";
  g("blk-slim").style.display="none";g("blk-liftrij").style.display="none";
  g("blk-cijfers").style.display="none";g("blk-cijfers").innerHTML="";
  g("blk-msg").textContent="";g("blk-msg").className="msg";g("blk-save").disabled=false;g("blk-biebknop").disabled=false;blkBiebThemaSync();
  // Mediastrook leeg beginnen (de chips tekenen zichzelf via app/demo-videos.js).
  const host=g("wm_blok");host.dataset.gmedia="";host.dataset.oefid="";host.dataset.vsweg="";
  const vp=host.querySelector(".vidpop");if(vp)vp.classList.remove("show");
  blkKleurenRender();
  g("blokmodal").classList.add("show");
  if(typeof vsRender==="function"){
    vsRender(host);
    if(typeof vsKlaar==="function")vsKlaar().then(()=>{if(g("blokmodal").classList.contains("show"))vsRender(host);});
  }
  if(typeof liftsLaad==="function")liftsLaad();
  setTimeout(()=>{const t=g("blk-titel");if(t)t.focus();},60);
}
function closeBlok(){
  const m=document.getElementById("blokmodal");if(!m)return;
  const vp=m.querySelector(".vidpop.show");if(vp)vp.classList.remove("show");
  m.classList.remove("show");
}
// Esc: eerst het berekening-paneel dicht, dan een open video-zoeker, dan het venster.
// Capture-fase + stopPropagation: de algemene Esc-afhandeling in klant-scherm.js
// sluit anders in één keer alles, ook een open bouwer met onopgeslagen werk.
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  const m=document.getElementById("blokmodal");if(!m||!m.classList.contains("show"))return;
  e.stopPropagation();
  const slim=document.getElementById("blk-slim");
  if(slim&&slim.style.display!=="none"){slim.style.display="none";return;}
  const vp=m.querySelector(".vidpop.show");
  if(vp){vp.classList.remove("show");return;}
  closeBlok();
},true);

// "donderdag 5 november" naast de datumkiezer (Engels als het dashboard op Engels staat).
function blkDatumLabel(){
  const v=document.getElementById("blk-datum").value,lbl=document.getElementById("blk-datumlbl");
  BLK.datum=v||BLK.datum;
  if(!v){lbl.textContent="";return;}
  const d=new Date(v+"T12:00:00");
  const txt=d.toLocaleDateString(typeof LOCALE!=="undefined"?LOCALE:"nl-NL",{weekday:"long",day:"numeric",month:"long"});
  lbl.textContent=txt.charAt(0).toUpperCase()+txt.slice(1); // "Vrijdag 6 november"
  blkCijfers(); // "vorige keer" hangt van de dag af
}
function blkScoreWissel(){
  const st=document.getElementById("blk-score").value;
  document.getElementById("blk-capvak").style.display=st==="time"?"":"none";
}

// ---------- Soort blok ----------
function blkSoort(s,btn){
  BLK.soort=s;
  document.querySelectorAll("#blk-soort button").forEach(b=>b.classList.toggle("on",b===btn));
  const g=id=>document.getElementById(id);
  g("blk-benchveld").style.display=s==="bench"?"":"none";
  g("blk-liftrij").style.display=s==="barbell"?"":"none";
  if(s==="bench"){
    if(!LIB.geladen){g("blk-benchlijst").innerHTML='<div class="sm muted" style="padding:6px 2px">Benchmarks laden…</div>';libLaad().then(()=>blkBenchLijst());}
    else blkBenchLijst();
    g("blk-benchzoek").focus();
  }
  if(s==="barbell"){blkLiftRij();blkLiftAuto();}
  blkCijfers();
}

// ---------- Barbell-set: lift voor records en de krachtlog ----------
function blkLiftRij(){
  const host=document.getElementById("blk-liftrij");if(!host)return;
  const teken=()=>{
    const groepen={};LIFTS.lijst.forEach(l=>{const k=l.company_id?"gym":(l.category||"other");(groepen[k]=groepen[k]||[]).push(l);});
    const volgorde=["gym","squats","deadlifts","presses","cleans","snatches","jerks","olympic","other"];
    host.innerHTML='<span class="blk-liftlbl">🏋️ Lift</span><select id="blk-lift" title="Lift voor records en de krachtlog" onchange="blkLiftKies(this.value)"><option value="">geen lift (telt niet mee voor records)</option>'+
      volgorde.filter(k=>groepen[k]).map(k=>'<optgroup label="'+esc(LIFT_CAT_NL[k]||k)+'">'+groepen[k].map(l=>'<option value="'+esc(l.id)+'"'+(l.id===BLK.lift?' selected':'')+'>'+esc(l.name)+'</option>').join("")+'</optgroup>').join("")+'</select>'+
      '<span class="sm muted">wordt herkend uit de titel; kies zelf als dat misgaat</span>';
  };
  if(LIFTS.geladen)teken();else{host.innerHTML='<span class="sm muted">Liften laden…</span>';liftsLaad().then(()=>{if(document.contains(host))teken();});}
}
function blkLiftKies(id){BLK.lift=id||"";BLK.liftAuto=false;blkCijfers();}
// Lift herkennen uit de titel (zelfde regels als de bouwer en de database).
function blkLiftAuto(){
  if(!BLK.liftAuto)return;
  const naam=((document.getElementById("blk-titel")||{}).value||"").trim();
  liftsLaad().then(()=>{
    if(!BLK.liftAuto)return;
    const l=naam?liftMatch(naam):null;BLK.lift=l?l.id:"";
    const sel=document.getElementById("blk-lift");if(sel)sel.value=BLK.lift;
    blkCijfers();
  });
}
// Voor welke klant tonen we cijfers? Alleen in de klantkalender (dag-menu of de
// bouwer daar); een blogprogramma of programma-template heeft geen ene sporter.
function blkKlantId(){
  if(typeof calClient==="undefined"||!calClient)return null;
  if(BLK.ctx==="klant")return calClient;
  if(BLK.ctx==="bouwer"&&document.querySelector("#calwrap #exrows"))return calClient;
  return null;
}
// Cijfers van de sporter onder de omschrijving: 1RM, beste set, vorige keer en
// de kilo's bij een percentage (zelfde regel als in de bouwer, app/klant-scherm.js).
function blkCijfers(){
  const box=document.getElementById("blk-cijfers");if(!box)return;
  const liftId=BLK.lift,klant=blkKlantId();
  if(!liftId||!klant||typeof klLaad!=="function"){box.style.display="none";box.innerHTML="";return;}
  box.style.display="";
  if(!(KL.client===klant&&KL.geladen))box.innerHTML='<span class="muted">Cijfers laden…</span>';
  klLaad(klant).then(()=>{
    const m=document.getElementById("blokmodal");
    if(BLK.lift!==liftId||!m||!m.classList.contains("show"))return;
    const s=schemaLees((document.getElementById("blk-omschr")||{}).value||"");
    const dag=BLK.ctx==="bouwer"?(typeof editDay!=="undefined"?editDay:null):BLK.datum;
    box.innerHTML=cijfersHtml(liftId,s,dag);
  });
}

// ---------- Slimme berekening: "@ 70%" in de omschrijving ----------
// De app rekent een percentage om naar kilo's met de 1RM van de sporter
// (schemaLees leest het percentage, de krachtlog vult de setrijen voor).
function blkSlimToon(){
  const box=document.getElementById("blk-slim");
  if(box.style.display!=="none"){box.style.display="none";return;}
  box.style.display="";
  box.innerHTML='<span class="blk-slim-x" title="Sluiten zonder in te voegen" onclick="blkSlimDicht()">✕</span>'+
    '<span class="sm" style="font-weight:700">Percentage van de 1RM van de sporter</span>'+
    '<input id="blk-pct" type="number" min="1" max="150" value="70"><span class="sm">%</span>'+
    '<span class="sm muted">van</span><select id="blk-slimlift"><option value="">lift uit de titel</option></select>'+
    '<button class="btn sm" onclick="blkSlimInvoeg()">Invoegen</button>'+
    '<span class="sm muted" style="flex-basis:100%">Komt als "@ 70%" achter de regel waar je cursor staat. De app rekent het om naar kilo\'s met de 1RM van de sporter.</span>';
  liftsLaad().then(()=>{
    const sel=document.getElementById("blk-slimlift");if(!sel)return;
    sel.innerHTML='<option value="">lift uit de titel</option>'+LIFTS.lijst.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(l=>'<option value="'+esc(l.id)+'"'+(l.id===BLK.lift?' selected':'')+'>'+esc(l.name)+'</option>').join("");
  });
  const p=document.getElementById("blk-pct");if(p){p.focus();p.select();}
}
function blkSlimDicht(){const b=document.getElementById("blk-slim");if(b)b.style.display="none";}
// Wegklikken (buiten het paneel en niet op de knop) sluit het paneel ook (feedback Stefan 6 nov).
document.addEventListener("click",e=>{
  const b=document.getElementById("blk-slim");if(!b||b.style.display==="none")return;
  if(e.target.closest("#blk-slim")||e.target.closest(".blk-slim"))return;
  b.style.display="none";
});
function blkSlimInvoeg(){
  const pct=parseInt((document.getElementById("blk-pct")||{}).value,10);
  if(!(pct>0)){toast("Vul een percentage in");return;}
  const liftSel=document.getElementById("blk-slimlift");
  if(liftSel&&liftSel.value){BLK.lift=liftSel.value;BLK.liftAuto=false;const s=document.getElementById("blk-lift");if(s)s.value=BLK.lift;}
  const ta=document.getElementById("blk-omschr");
  // Op de regel van de cursor: een eerder percentage vervangen, anders " @ 70%" erachter.
  const pos=ta.selectionStart!=null?ta.selectionStart:ta.value.length;
  const voor=ta.value.slice(0,pos),na=ta.value.slice(pos);
  const eind=na.indexOf("\n"),rest=eind<0?na:na.slice(0,eind);
  const start=voor.lastIndexOf("\n")+1;
  const regel=(voor.slice(start)+rest).replace(/\s*@\s*\d+(?:\s*-\s*\d+)?\s*%/,"").replace(/\s+$/,"");
  const nieuw=regel?regel+" @ "+pct+"%":"@ "+pct+"%";
  ta.value=voor.slice(0,start)+nieuw+(eind<0?"":na.slice(eind));
  ta.dispatchEvent(new Event("input",{bubbles:true}));
  const cur=voor.slice(0,start).length+nieuw.length;ta.focus();ta.setSelectionRange(cur,cur);
  document.getElementById("blk-slim").style.display="none";
  if(!BLK.lift)toast("Percentage ingevoegd. Zet een lift in de titel (of kies Barbell-set) zodat de app de kilo's kan uitrekenen.");
  blkCijfers();
}

// ---------- Benchmark: uit de bibliotheek (Girls, Heroes, Open, eigen) ----------
function blkBenchLijst(){
  const host=document.getElementById("blk-benchlijst");if(!host)return;
  if(!LIB.geladen){host.innerHTML='<div class="sm muted" style="padding:6px 2px">Benchmarks laden…</div>';return;}
  const v=((document.getElementById("blk-benchzoek")||{}).value||"").toLowerCase().trim();
  const alle=libItems(null).filter(o=>o.bron==="bench");
  const hits=alle.filter(o=>!v||(o.naam||"").toLowerCase().includes(v)||(o.tags||[]).join(" ").toLowerCase().includes(v)||(o.info||"").toLowerCase().includes(v));
  host.innerHTML=(hits.slice(0,30).map(o=>'<div class="blk-benchrij'+(BLK.bench===o.key?' aan':'')+'" onclick="blkBenchKies(\''+esc(o.key)+'\')"><b>'+esc(o.naam)+'</b><span class="sm muted">'+esc(o.info||"")+'</span></div>').join("")+
    (hits.length>30?'<div class="sm muted" style="padding:6px 10px">Nog '+(hits.length-30)+' meer; typ om te verfijnen.</div>':''))||
    '<div class="sm muted" style="padding:6px 10px">Geen benchmark gevonden.</div>';
}
function blkBenchKies(key){
  const o=libItemVind(key);if(!o)return;
  BLK.bench=key;
  const g=id=>document.getElementById(id);
  g("blk-titel").value=o.naam;
  g("blk-omschr").value=o.instructies||"";
  g("blk-omschr").dispatchEvent(new Event("input",{bubbles:true}));
  // Scoretype en timecap uit de vorm van de benchmark.
  const t=(o.instructies||"").toLowerCase();
  if(/for time|\bft\b/.test(t))g("blk-score").value="time";
  else if(/amrap/.test(t))g("blk-score").value="rounds_reps";
  const cap=t.match(/time ?cap:?\s*(\d{1,2})\s*(?:min|')/);
  g("blk-cap").value=(g("blk-score").value==="time"&&cap)?cap[1]+":00":"";
  blkScoreWissel();
  if(!BLK.kleur)blkKleur("purple"); // zelfde kleur als een benchmark via Invoegen
  BLK.liftAuto=true;BLK.lift="";
  blkBenchLijst();
  toast('"'+o.naam+'" overgenomen; pas gerust aan');
}

// ---------- Media ----------
function blkMediaZoek(){
  const host=document.getElementById("wm_blok");const vak=host&&host.querySelector(".vschips");
  if(vak&&typeof vsKiesToon==="function")vsKiesToon(vak);
}
// Alle blauwe voorstellen in één keer aannemen (Strivee: "Auto-generate media").
function blkMediaAuto(){
  const host=document.getElementById("wm_blok");if(!host)return;
  const chips=[...host.querySelectorAll(".vschip.voorstel")];
  if(!chips.length){
    const tekst=((document.getElementById("blk-titel")||{}).value||"")+((document.getElementById("blk-omschr")||{}).value||"");
    toast(!tekst.trim()?"Typ eerst een titel of omschrijving; dan herkennen we de oefeningen":(GM.index?"Geen oefeningen herkend in de tekst; zoek zelf via + Media toevoegen":"De bibliotheek laadt nog, probeer het zo opnieuw"));
    return;
  }
  const media=vsMediaLees(host);let n=0;
  chips.forEach(chip=>{
    const yt=chip.dataset.yt,oef=parseInt(chip.dataset.oef,10);
    if(!yt||media.some(m=>m.youtube_id===yt))return;
    media.push({youtube_id:yt,titel:chip.dataset.naam,oefening_id:oef,term:chip.dataset.term});
    gmLeer(chip.dataset.term,oef,1);n++;
  });
  vsMediaZet(host,media);vsRender(host);
  toast(n?n+" demo-video"+(n>1?"'s":"")+" toegevoegd":"Alle voorstellen stonden er al bij");
}

// ---------- Blokkleur ----------
function blkKleurenRender(){
  const host=document.getElementById("blk-kleuren");if(!host)return;
  host.innerHTML=BLK_KLEUREN.map(k=>'<span class="blk-dot'+(k===BLK.kleur?' aan':'')+(k?'':' geen')+'" title="'+esc(k?(LEGNAAM[k]||k):"Geen kleur")+'" style="--c:'+(k?TPLKLEUR[k]:"#4a4f57")+'" onclick="blkKleur(\''+k+'\')"></span>').join("");
}
function blkKleur(k){BLK.kleur=k||"";blkKleurenRender();}

// ---------- "Opslaan + in bibliotheek": het blok ook als template bewaren (verzoek Stefan 6 nov 2026) ----------
// Thema = de kleur/legenda van de bibliotheek (Accessory, Conditioning, …), plus de
// tabs Warm-ups en Cooldowns als type. De keuzelijst begint bewust leeg en is
// alleen verplicht voor deze knop (de gewone Opslaan-knop maakt geen template),
// zodat een template nooit per ongeluk in het verkeerde thema belandt.
function blkBiebOpties(){
  const kleuren=(typeof TPLKLEUREN!=="undefined"?TPLKLEUREN:["yellow","blue","purple","red","green","orange"]);
  return '<option value="">Kies een thema…</option>'+
    kleuren.map(k=>'<option value="kleur:'+k+'">'+esc((typeof LEGNAAM!=="undefined"&&LEGNAAM[k])||k)+'</option>').join("")+
    '<option value="type:warmup">Warming-up (tab Warm-ups)</option><option value="type:cooldown">Cooldown (tab Cooldowns)</option>';
}
function blkBiebThemaSync(){const sel=document.getElementById("blk-biebthema");if(sel)sel.value="";}
async function blkBiebBewaar(titel,omschr,media){
  const keuze=((document.getElementById("blk-biebthema")||{}).value||"").split(":");
  if(!keuze[1])return {ok:false,fout:"geen thema gekozen"};
  const velden={naam:titel,instructies:omschr||"",type:keuze[0]==="type"?keuze[1]:"other",kleur:keuze[0]==="kleur"?keuze[1]:"yellow",media:(media||[]).filter(m=>m&&m.youtube_id),onderdelen:null,tags:[],coach:(ME.profile&&ME.profile.first_name)||""};
  const{error}=await db.from("templates").insert(velden);
  if(error)return {ok:false,fout:error.message||"onbekende fout"};
  // Bibliotheek opnieuw laden, zodat Invoegen en het bibliotheek-venster de template meteen tonen.
  if(typeof LIB!=="undefined"){LIB.geladen=false;if(typeof libLaad==="function")libLaad();}
  return {ok:true};
}
// Afronden na een geslaagde opslag: evt. ook als template, dan venster dicht en melding.
async function blkKlaar(metBieb,titel,omschr,media,melding){
  let extra="";
  if(metBieb){const r=await blkBiebBewaar(titel,omschr,media);extra=r.ok?"; ook als template in de bibliotheek":". Template bewaren mislukt: "+r.fout;}
  closeBlok();toast(melding+extra);
}

// ---------- Opslaan ----------
const blkIsRust=w=>/^rest ?day$/i.test((w.title||"").trim());
// Volgende letter en volgorde achter de bestaande blokken van een workout.
function blkVolgende(blokken){
  blokken=blokken||[];
  return {label:String.fromCharCode(65+Math.min(blokken.length,25)),sort:blokken.reduce((m,b)=>Math.max(m,b.sort||0),0)+1};
}
// Staat de bouwer open op de plek waar dit blok heen moet? Dan gaat het blok
// daarin (en mee met het opslaan van die sessie), niet rechtstreeks de database in.
function blkBouwerOpen(ctx,ds){
  if(!document.getElementById("exrows"))return false;
  if(ctx==="bouwer")return true;
  if(ctx==="klant"){
    const bd=editDay||(editWid&&monthWorkouts[editWid]?monthWorkouts[editWid].workout_date:null);
    return bd===ds&&!!document.querySelector("#calwrap #exrows");
  }
  if(ctx==="blog")return typeof BLOG!=="undefined"&&BLOG.editDay===ds;
  if(ctx==="prog")return typeof progEditDay!=="undefined"&&!!progEditDay&&progEditDay.week===BLK.week&&progEditDay.day===BLK.day;
  return false;
}
function blkInBouwer(blok,titel){
  const rows=document.getElementById("exrows");
  // Een verse bouwer begint met één lege rij: die maakt plaats voor het blok.
  [...rows.querySelectorAll(".exrow")].forEach(r=>{
    const naam=((r.querySelector(".exn")||{}).value||"").trim();
    const tekst=((r.querySelector(".f-presc,.f-desc")||{}).value||"").trim();
    if(!naam&&!tekst&&!r.dataset.bid&&!r.dataset.media&&!r.dataset.oefid)r.remove();
  });
  rows.insertAdjacentHTML("beforeend",exRow(blok));relabel();groei();bouwerDirty=true;
  // Een sessie zonder titel krijgt de naam van het blok (zoals een nieuwe workout via het dag-menu).
  const t=document.getElementById("w_title");if(t&&!t.value.trim())t.value=titel;
  const alle=rows.querySelectorAll(".exrow"),nieuw=alle[alle.length-1];
  if(nieuw&&nieuw.scrollIntoView)nieuw.scrollIntoView({block:"nearest",behavior:"smooth"});
  if(typeof exNotesInject==="function")exNotesInject();
}
// Blogprogramma: zelfde regels als de klantkalender, maar de workout hoort bij het programma.
async function blkOpslaanBlog(ds,blok,titel,klaar){
  // Een open bouwer op een ándere dag verdwijnt als de kalender herlaadt: eerst die afronden.
  if(BLOG.editDay&&document.getElementById("exrows"))throw new Error("Er staat nog een sessie open in de bouwer. Sla die eerst op of annuleer, daarna kan dit blok erbij.");
  const{data:dagWos,error:de}=await db.from("workouts").select("id,title,created_at,blocks(id,sort)").eq("audience","blog").eq("blog_program_id",BLOG.cur.id).eq("workout_date",ds).order("created_at");
  if(de)throw de;
  const dag=(dagWos||[]).filter(w=>!blkIsRust(w));
  if(dag.length){
    const w=dag[dag.length-1],n=blkVolgende(w.blocks);
    const{error}=await db.from("blocks").insert(Object.assign({workout_id:w.id,label:n.label,sort:n.sort},blok));
    if(error)throw error;
    await klaar('Blok '+n.label+' "'+titel+'" onder "'+(w.title||"workout")+'" gezet');
  }else{
    const{data:w,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,audience:"blog",blog_program_id:BLOG.cur.id,workout_date:ds,title:titel}).select().single();
    if(error)throw error;
    const{error:be}=await db.from("blocks").insert(Object.assign({workout_id:w.id,label:"A",sort:1},blok));
    if(be)throw be;
    await klaar('"'+titel+'" als nieuwe workout op '+ds.slice(8,10)+"-"+ds.slice(5,7)+' gezet');
  }
  await blogHerlaad();
}
// Programma-editor: program_workouts / program_blocks op week + dag.
async function blkOpslaanProg(blok,titel,klaar){
  const week=BLK.week,day=BLK.day;
  // Een open bouwer op een andere dag eerst stil opslaan (zelfde afspraak als Rustdag daar).
  if(!(await progAutoSave()))throw new Error("De open sessie kon niet worden opgeslagen. Los dat eerst op, daarna kan dit blok erbij.");
  // program_blocks kent geen source_blog_workout_id; verder dezelfde velden als de programma-bouwer.
  const pb=(pwid,label,sort)=>({program_workout_id:pwid,company_id:ME.profile.company_id,kind:blok.kind,label,linked:false,exercise:blok.exercise,prescription:blok.prescription,notes:blok.notes,sort,color:blok.color,score_type:blok.score_type,timecap_seconds:blok.timecap_seconds,cap_score_type:blok.cap_score_type,oefening_id:null,media:blok.media,lift_id:blok.lift_id,lift_scheme:blok.lift_scheme,group_title:null});
  const dag=(PROG.workouts||[]).filter(w=>w.week===week&&w.day===day&&!blkIsRust(w)).sort((a,b)=>(a.sort||0)-(b.sort||0));
  if(dag.length){
    const w=dag[dag.length-1],n=blkVolgende(w.program_blocks);
    const{error}=await db.from("program_blocks").insert(pb(w.id,n.label,n.sort));
    if(error)throw error;
    await klaar('Blok '+n.label+' "'+titel+'" onder "'+(w.title||"workout")+'" gezet');
  }else{
    const{data:w,error}=await db.from("program_workouts").insert({program_id:PROG.id,company_id:ME.profile.company_id,week,day,title:titel}).select().single();
    if(error)throw error;
    const{error:be}=await db.from("program_blocks").insert(pb(w.id,"A",1));
    if(be)throw be;
    await klaar('"'+titel+'" als nieuwe workout in week '+week+' op dag '+((week-1)*7+day)+' gezet');
  }
  await progReloadWorkouts();
  progSyncNa([{week,day}]); // gekoppelde klanten krijgen de wijziging, zoals na Opslaan in de editor
}
// metBieb = via "Opslaan + in bibliotheek": zelfde opslag, daarna ook een template.
async function blokOpslaan(metBieb){
  const g=id=>document.getElementById(id),msg=g("blk-msg");
  const fout=t=>{msg.textContent=t;msg.className="msg err";g("blk-save").disabled=false;g("blk-biebknop").disabled=false;};
  const titel=g("blk-titel").value.trim();
  if(!titel){fout("Geef het blok een titel.");g("blk-titel").focus();return;}
  const ctx=BLK.ctx,metDatum=ctx==="klant"||ctx==="blog";
  const ds=metDatum?g("blk-datum").value:null;
  if(metDatum&&!/^\d{4}-\d{2}-\d{2}$/.test(ds||"")){fout("Kies een datum.");return;}
  if(ctx==="klant"&&!calClient){fout("Open eerst een klant.");return;}
  if(ctx==="prog"&&typeof progMagOfMeld==="function"&&!progMagOfMeld()){fout("Alleen kijken: je hebt geen rechten op dit programma. Vraag een beheerder.");return;}
  // Alleen voor "Opslaan + in bibliotheek": zonder thema geen template (en dus ook geen opslag).
  if(metBieb&&!g("blk-biebthema").value){fout("Kies eerst een thema voor de bibliotheek (de keuzelijst naast de knop).");g("blk-biebthema").focus();return;}
  const omschr=g("blk-omschr").value.trim()||null;
  const tips=g("blk-tips").value.trim()||null;
  const score_type=g("blk-score").value||"text";
  const timecap_seconds=score_type==="time"?tijdNaarSec(g("blk-cap").value):null;
  const cap_score_type=g("blk-capst").value||"reps";
  const host=g("wm_blok");const media=vsMediaLees(host);
  g("blk-save").disabled=true;g("blk-biebknop").disabled=true;msg.textContent="";msg.className="msg";
  await liftsLaad();
  // Lift: gekozen (Barbell-set) of herkend uit de titel; bewust "geen lift" = geen_lift,
  // zodat de database hem niet opnieuw invult. Een benchmark krijgt geen lift.
  let lift=null,lift_scheme=schemaLees(omschr||"");
  if(BLK.soort!=="bench"){
    lift=BLK.lift?liftVan(BLK.lift):(BLK.liftAuto?liftMatch(titel):null);
    if(BLK.soort==="barbell"&&!BLK.lift&&!BLK.liftAuto)lift_scheme=Object.assign(lift_scheme||{},{geen_lift:true});
  }
  const blok={kind:"exercise",linked:false,exercise:titel,prescription:omschr,notes:tips,color:BLK.kleur||null,score_type,timecap_seconds,cap_score_type,oefening_id:null,source_blog_workout_id:null,media:media.length?media:null,lift_id:lift?lift.id:null,lift_scheme:lift_scheme||null,group_title:null};
  const klaar=melding=>blkKlaar(metBieb,titel,omschr,media,melding);
  try{
    // 1. Bouwer open op deze plek? Dan onderaan in de bouwer (opslaan met de knop van de sessie).
    if(blkBouwerOpen(ctx,ds)){
      blkInBouwer(blok,titel);
      await klaar('"'+titel+'" onderaan in de bouwer gezet; sla de workout op als je klaar bent');return;
    }
    if(ctx==="bouwer")throw new Error("De bouwer is intussen gesloten. Open de sessie opnieuw en probeer het nog eens.");
    if(ctx==="blog"){await blkOpslaanBlog(ds,blok,titel,klaar);return;}
    if(ctx==="prog"){await blkOpslaanProg(blok,titel,klaar);return;}
    // 2. Klantkalender: staat er al een workout op die dag (geen rustdag)? Dan eronder als volgend blok.
    // Vers uit de database, want de gekozen dag kan buiten de geladen kalender vallen.
    const{data:dagWos,error:de}=await db.from("workouts").select("id,title,created_at,blocks(id,sort)").eq("client_id",calClient).eq("workout_date",ds).order("created_at");
    if(de)throw de;
    const dag=(dagWos||[]).filter(w=>!blkIsRust(w));
    if(dag.length){
      const w=dag[dag.length-1],n=blkVolgende(w.blocks);
      const{error}=await db.from("blocks").insert(Object.assign({workout_id:w.id,label:n.label,sort:n.sort},blok));
      if(error)throw error;
      await klaar('Blok '+n.label+' "'+titel+'" onder "'+(w.title||"workout")+'" gezet');renderMonth();return;
    }
    // 3. Lege dag (of alleen een rustdag): nieuwe workout met deze titel en dit als blok A.
    const{data:w,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:ds,title:titel}).select().single();
    if(error)throw error;
    const{error:be}=await db.from("blocks").insert(Object.assign({workout_id:w.id,label:"A",sort:1},blok));
    if(be)throw be;
    await klaar('"'+titel+'" als nieuwe workout op '+ds.slice(8,10)+"-"+ds.slice(5,7)+' gezet');renderMonth();
  }catch(e){fout(e.message||"Opslaan mislukt.");}
}
