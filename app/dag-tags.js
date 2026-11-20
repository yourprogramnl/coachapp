// app/dag-tags.js — dagtags (Maandag t/m Zondag) en het tagfilter in de kop
// van het klant-scherm (18 nov 2026). Coaches programmeren per weekdag: op
// maandag de "maandagklanten", op dinsdag de dinsdagklanten, enzovoort.
// Een dagtag is een gewone tag (tabel tags) met de naam van een weekdag; we
// herkennen hem aan de naam, hoofdletters maken niet uit. Geen schemawijziging.
// Klassiek script: deelt de globale scope met klanten.js en klant-scherm.js.

// Weekdagnamen in volgorde maandag..zondag. Engelse namen tellen ook, voor een
// bedrijf dat in het Engels werkt.
const DAGTAG_NAMEN=[["maandag","monday"],["dinsdag","tuesday"],["woensdag","wednesday"],["donderdag","thursday"],["vrijdag","friday"],["zaterdag","saturday"],["zondag","sunday"]];
// 0 (maandag) t/m 6 (zondag), of -1 als het geen dagtag is.
function dagTagIndex(t){
  const n=String((t&&t.name)||"").trim().toLowerCase();
  return DAGTAG_NAMEN.findIndex(d=>d.includes(n));
}
const isDagTag=t=>!!t&&dagTagIndex(t)>=0;
// Dagtags eerst (maandag..zondag), daarna de rest op alfabet.
function tagsSorteer(lijst){
  return (lijst||[]).slice().sort((a,b)=>{
    const da=dagTagIndex(a),dbi=dagTagIndex(b);
    if(da>=0&&dbi>=0)return da-dbi;
    if(da>=0)return -1;
    if(dbi>=0)return 1;
    return (a.name||"").localeCompare(b.name||"",LOCALE,{sensitivity:"base"});
  });
}
// Een tag-lijst als HTML, met een scheidingslijn tussen de dagtags en de rest.
function tagLijstMetScheiding(tags,rij,sepHtml){
  let uit="",vorigeDag=null;
  tags.forEach(t=>{const dag=isDagTag(t);if(vorigeDag===true&&!dag)uit+=sepHtml;vorigeDag=dag;uit+=rij(t);});
  return uit;
}
// Bestaat er al een tag met deze naam? (voorkomt bijvoorbeeld een tweede "Maandag")
function tagNaamBestaat(lijst,naam){const n=String(naam||"").trim().toLowerCase();return (lijst||[]).some(t=>String(t.name||"").trim().toLowerCase()===n);}

// ---------- Klanten-pagina: wie heeft nog geen dag? ----------
// Speciale waarde in het tagfilter (klantTags) voor "Zonder dag".
const KLANT_GEEN_DAG="geen-dag";
const dagTagsBestaan=()=>!!KDATA&&(KDATA.alleTags||[]).some(isDagTag);
function klantHeeftDag(p){return (KDATA.tagsByClient[p.id]||[]).some(id=>isDagTag(tagById(id)));}
// Actieve klanten binnen de huidige coach-selectie zonder dagtag. Leeg zolang
// de tags nog laden of als het bedrijf (nog) geen dagtags heeft.
function klantenZonderDag(){
  if(!KDATA||KDATA.laden||!dagTagsBestaan())return [];
  // Showdown-leden hebben geen programma van een coach en dus geen dag nodig.
  return klantScope().filter(p=>!p.archived&&!isShowdownLid(p)&&!klantHeeftDag(p));
}
// Waarschuwingsregel boven de lijst.
function klantGeenDagMelding(){
  const z=klantenZonderDag();if(!z.length)return "";
  const n=z.length;
  const alGefilterd=klantTags.size===1&&klantTags.has(KLANT_GEEN_DAG)&&!klantArchief&&!klantShowdown;
  return '<div class="geendag-melding"><span class="geendag-uitroep">!</span>'+
    '<b>'+(n===1?"1 klant heeft nog geen dag.":n+" klanten hebben nog geen dag.")+'</b>'+
    '<span class="muted">Geef iedereen een dagtag, dan mis je niemand bij het programmeren.</span>'+
    (alGefilterd?'':'<button class="btn sm" onclick="klantToonZonderDag()">Toon ze</button>')+
  '</div>';
}
function klantToonZonderDag(){
  klantArchief=false;klantShowdown=false;klantZoek="";klantAf.clear();
  klantTags.clear();klantTags.add(KLANT_GEEN_DAG);
  klantTagDropWeg();klantenRender();
}
// Rood labeltje in de Tags-kolom; opent de tag-kiezer van die klant. Niet bij
// Showdown-leden: die krijgen geen programma van een coach en dus geen dag
// (wens Stefan, 20 nov 2026: het leek alsof nog veel meer mensen een dag misten).
function klantGeenDagLabel(p){
  if(p.archived||isShowdownLid(p)||!dagTagsBestaan()||klantHeeftDag(p))return "";
  return '<button class="geendag-label" title="Deze klant heeft nog geen dag. Klik om er een te kiezen." onclick="event.stopPropagation();openTagPicker(event,\''+p.id+'\')">geen dag</button>';
}
// Optie "Zonder dag (n)" onderaan de Kies tag-lijst.
function klantGeenDagOptie(){
  if(!dagTagsBestaan())return "";
  const n=klantenZonderDag().length;
  return '<div class="tagsep"></div><button class="tagopt" onclick="event.stopPropagation();klantTagFilterKies(\''+KLANT_GEEN_DAG+'\')">'+
    '<span class="kdot" style="background:'+(n?'#e5484d':'#c3c8cf')+'"></span><span style="flex:1;'+(n?'color:#e5484d;font-weight:700':'color:#8a919c')+'">Zonder dag ('+n+')</span>'+
    (klantTags.has(KLANT_GEEN_DAG)?'<span class="vk">✓</span>':'')+'</button>';
}

// ---------- Klant-scherm: tagfilter tussen het coach- en het klantmenu ----------
// Keuze geldt alleen voor deze browsersessie: een nieuwe dag begint met "Alle".
let ksTag=null; // null = Alle; anders een tag-id of KLANT_GEEN_DAG
try{ksTag=sessionStorage.getItem("forge_ks_tag")||null;}catch(e){}
// Eigen kleine voorraad tags + koppelingen voor de actieve klanten (het klant-scherm
// kan geopend worden zonder dat de Klanten-pagina geladen is).
const KSTAG={tags:[],byClient:{},tijd:0,bezig:null,fout:false};
function ksTagsVerouderd(){KSTAG.tijd=0;}
async function ksTagsLaad(){
  if(KSTAG.bezig)return KSTAG.bezig;
  if(KSTAG.tijd&&Date.now()-KSTAG.tijd<60000)return;
  KSTAG.bezig=(async()=>{
    // Zelfde afbakening als de klantenlijst: alleen de actieve klanten die je al
    // ziet (coachClients is per bedrijf/coach gefilterd) en de tags van je eigen bedrijf.
    const ids=actieveKlanten().map(p=>p.id);
    const leeg={data:[]};
    const[tq,pq]=await Promise.all([
      ME.profile.company_id?db.from("tags").select("id,name,color").eq("company_id",ME.profile.company_id):leeg,
      ids.length?db.from("profile_tags").select("profile_id,tag_id").in("profile_id",ids):leeg,
    ]);
    if(tq.error||pq.error){KSTAG.fout=true;return;}
    KSTAG.fout=false;
    KSTAG.tags=tagsSorteer(tq.data||[]);
    const by={};(pq.data||[]).forEach(r=>{(by[r.profile_id]=by[r.profile_id]||[]).push(String(r.tag_id));});
    KSTAG.byClient=by;KSTAG.tijd=Date.now();
  })();
  try{await KSTAG.bezig;}catch(e){KSTAG.fout=true;}finally{KSTAG.bezig=null;}
}
const ksTagVan=id=>KSTAG.tags.find(t=>String(t.id)===String(id));
const ksDagTagsBestaan=()=>KSTAG.tags.some(isDagTag);
const ksHeeftTag=(p,id)=>(KSTAG.byClient[p.id]||[]).includes(String(id));
const ksHeeftDag=p=>(KSTAG.byClient[p.id]||[]).some(id=>isDagTag(ksTagVan(id)));
// Het actieve filter, of null als het (nog) niet kan: tags niet geladen, tag
// intussen verwijderd, of "Zonder dag" zonder dagtags.
function ksTagActief(){
  if(!ksTag||!KSTAG.tijd)return null;
  if(ksTag===KLANT_GEEN_DAG)return ksDagTagsBestaan()?ksTag:null;
  return ksTagVan(ksTag)?ksTag:null;
}
// "Zonder dag": blogleden tellen niet mee, die krijgen geen eigen programmering
// en dus geen dag (zelfde regel als de weekcheck, app/weekcheck.js).
function ksPastBijTag(p,tag){return tag===KLANT_GEEN_DAG?(!ksHeeftDag(p)&&p.membership_type!=="free_blog"):ksHeeftTag(p,tag);}
// Klanten binnen de coach-keuze (staff: de gekozen coach; coach: zijn eigen lijst).
function ksCoachKlanten(){return myRole()!=="coach"?actieveKlanten().filter(k=>k.coach_id===coachFilterId):actieveKlanten();}
// Klanten voor het klantmenu: coach-keuze + tagfilter, de open klant blijft er altijd in.
function ksDropKlanten(p){
  const tag=ksTagActief();
  let lijst=ksCoachKlanten();
  if(tag)lijst=lijst.filter(k=>ksPastBijTag(k,tag));
  if(p&&!lijst.some(k=>k.id===p.id))lijst=lijst.concat([p]);
  return lijst.slice().sort((a,b)=>naamVan(a).localeCompare(naamVan(b)));
}
// Filter een lijst klanten op de gekozen tag (voor "eerste klant van deze coach").
function ksKlantenFilter(lijst){const tag=ksTagActief();return tag?lijst.filter(k=>ksPastBijTag(k,tag)):lijst;}
function ksKlantRijHtml(k,p){
  return '<div class="pd-row'+(p&&k.id===p.id?' actief':'')+'" data-n="'+esc(naamVan(k).toLowerCase())+'" onclick="openClient(\''+k.id+'\')"><div class="pd-badge" style="'+avFotoStyle(k)+'">'+avFotoText(k)+'</div><div class="pd-naam">'+naamVan(k)+'</div><span class="pd-vink"><svg class="i sm-i"><use href="#i-check"/></svg></span></div>';
}
function ksKlantRijenHtml(p){
  const lijst=ksDropKlanten(p);
  const tag=ksTagActief();
  // Alleen de open klant over terwijl er een filter staat? Even zeggen waarom.
  const leeg=tag&&!lijst.some(k=>k.id!==(p&&p.id))?'<div class="cempty" style="padding:10px">Geen andere klanten met deze tag.</div>':'';
  return lijst.map(k=>ksKlantRijHtml(k,p)).join("")+leeg;
}
// Het knopje in de kop.
function ksTagChipHtml(){
  // Tags nog niet (of meer dan een minuut geleden) geladen: op de achtergrond ophalen.
  if(!KSTAG.tijd||Date.now()-KSTAG.tijd>60000)ksTagsLaad().then(ksTagKopVernieuw);
  return '<div class="progsel tagsel" id="tagsel" onclick="toggleTagDrop(event)">'+ksTagChipBinnen()+
    '<div class="progdrop" id="tagdrop" style="width:250px;left:auto;right:0" onclick="event.stopPropagation()"><div class="pd-lijst" id="tg-lijst"></div></div></div>';
}
function ksTagChipBinnen(){
  const tag=ksTagActief();
  let naam="Alle",kleur="#c3c8cf",rood=false;
  if(tag===KLANT_GEEN_DAG){naam="Zonder dag";kleur="#e5484d";rood=true;}
  else if(tag){const t=ksTagVan(tag);naam=t.name;kleur=tagKleur(t.color);}
  const n=ksKlantenFilter(ksCoachKlanten()).length;
  return '<span class="tagsel-dot" style="background:'+kleur+'"></span><div><div class="pn"'+(rood?' style="color:#e5484d"':'')+'>'+esc(naam)+'</div><div class="pt">'+(KSTAG.tijd?(n===1?"1 klant":n+" klanten"):"Dag of tag")+'</div></div><span class="car">▾</span>';
}
function ksTagDropHtml(){
  if(!KSTAG.tijd)return '<div class="cempty" style="padding:10px">'+(KSTAG.fout?"Tags laden mislukt.":"Tags laden…")+'</div>';
  const basis=ksCoachKlanten(),tag=ksTagActief();
  const rij=(id,naam,kleur,n,extra)=>'<div class="pd-row'+((id||null)===tag?' actief':'')+'" onclick="kiesKsTag('+(id?'\''+esc(String(id))+'\'':'null')+')"><span class="tagsel-dot" style="background:'+kleur+'"></span><div class="pd-naam"'+(extra||'')+'>'+esc(naam)+' <span class="muted" style="font-weight:500">('+n+')</span></div><span class="pd-vink"><svg class="i sm-i"><use href="#i-check"/></svg></span></div>';
  let html='<div class="pd-kop" style="border-top:none;margin-top:0">Filter op dag of tag</div>'+rij(null,"Alle","#c3c8cf",basis.length);
  if(KSTAG.tags.length){
    html+='<div class="pd-sep"></div>'+tagLijstMetScheiding(KSTAG.tags,t=>rij(t.id,t.name,tagKleur(t.color),basis.filter(k=>ksHeeftTag(k,t.id)).length),'<div class="pd-sep"></div>');
  }
  if(ksDagTagsBestaan()){
    const n=basis.filter(k=>ksPastBijTag(k,KLANT_GEEN_DAG)).length;
    html+='<div class="pd-sep"></div>'+rij(KLANT_GEEN_DAG,"Zonder dag",n?"#e5484d":"#c3c8cf",n,n?' style="color:#e5484d"':' style="color:#8a919c"');
  }
  return html;
}
async function toggleTagDrop(ev){
  ev.stopPropagation();
  const d=document.getElementById("tagdrop");if(!d)return;
  const openNu=!d.classList.contains("show");
  document.querySelectorAll(".progdrop.show").forEach(x=>x.classList.remove("show"));
  if(!openNu)return;
  d.classList.add("show");
  const host=document.getElementById("tg-lijst");if(host)host.innerHTML=ksTagDropHtml();
  if(!KSTAG.tijd||Date.now()-KSTAG.tijd>60000){await ksTagsLaad();ksTagKopVernieuw();}
}
function kiesKsTag(id){
  ksTag=id||null;
  try{if(ksTag)sessionStorage.setItem("forge_ks_tag",ksTag);else sessionStorage.removeItem("forge_ks_tag");}catch(e){}
  const d=document.getElementById("tagdrop");if(d)d.classList.remove("show");
  ksTagKopVernieuw();
}
// Knopje + uitklaplijst + klantmenu bijwerken zonder de hele kalender opnieuw te tekenen.
function ksTagKopVernieuw(){
  const sel=document.getElementById("tagsel");if(!sel)return;
  const drop=document.getElementById("tagdrop");
  sel.querySelectorAll(":scope > :not(.progdrop)").forEach(x=>x.remove());
  sel.insertAdjacentHTML("afterbegin",ksTagChipBinnen());
  if(drop&&drop.classList.contains("show")){const host=document.getElementById("tg-lijst");if(host)host.innerHTML=ksTagDropHtml();}
  const kd=document.getElementById("kd-lijst");
  if(kd){
    const p=coachClients.find(x=>x.id===calClient);
    kd.querySelectorAll(".pd-row,.cempty").forEach(x=>x.remove());
    kd.insertAdjacentHTML("beforeend",ksKlantRijenHtml(p));
    // Stond er een zoekterm in het klantmenu? Die blijft gelden.
    const z=document.querySelector("#klantdrop .pd-search input");
    if(z&&z.value&&typeof filterKlantDrop==="function")filterKlantDrop(z.value);
  }
}
