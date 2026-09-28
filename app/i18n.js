// Taal van het dashboard (nl/en). Laadt vóór alle andere scripts.
// Werkwijze: de app rendert gewoon Nederlands; in het Engels vertaalt een
// MutationObserver elke tekst die op het scherm komt via het woordenboek in
// app/vertaling-en.js (sleutel = de exacte Nederlandse tekst). Zo hoeven de
// 23 schermbestanden niet aangepast te worden en blijft Nederlands de bron.
// Volgorde van de taalkeuze: localStorage (forge_lang) > browsertaal; na het
// inloggen wint profiles.lang (zie loadApp in auth.js).
const TALEN=["nl","en"];
let LANG=(()=>{
  try{const l=localStorage.getItem("forge_lang");if(TALEN.includes(l))return l;}catch(e){}
  const b=((navigator.languages&&navigator.languages[0])||navigator.language||"nl").toLowerCase();
  return b.startsWith("nl")?"nl":"en";
})();
const LOCALE=LANG==="en"?"en-GB":"nl-NL";
const I18N={dict:{},ontbreekt:new Set(),geproduceerd:new Set(),klaar:false};
const tNorm=s=>String(s).replace(/\s+/g," ").trim();
// HTML-entiteiten in de woordenboeksleutels (&nbsp; &amp; …) worden in de DOM
// als tekens gelezen; sleutels dus decoderen bij het laden.
function i18nDecode(s){
  if(s.indexOf("&")<0)return s;
  const ta=i18nDecode._ta||(i18nDecode._ta=document.createElement("textarea"));
  ta.innerHTML=s;return ta.value;
}
function i18nLaad(dict){
  for(const k in dict){const v=dict[k];if(typeof v!=="string"||!v)continue;const kk=tNorm(i18nDecode(k));if(kk&&kk!==tNorm(i18nDecode(v))){I18N.dict[kk]=i18nDecode(v);I18N.geproduceerd.add(tNorm(i18nDecode(v)));}}
  I18N.klaar=true;
}
function i18nRand(orig,vert){const m=String(orig).match(/^(\s*)[\s\S]*?(\s*)$/);return (m?m[1]:"")+vert+(m?m[2]:"");}
// Getallen in de tekst → {n}, zodat "3 klanten" via de sleutel "{n} klanten" gaat.
function i18nPatroon(k){
  const nums=[];const sj=k.replace(/\d+(?:[.,:]\d+)*/g,m=>{nums.push(m);return "{n}";});
  if(!nums.length)return undefined;
  const d=I18N.dict[sj];if(d===undefined)return undefined;
  let i=0;return d.replace(/\{n\}/g,()=>nums[i++]!==undefined?nums[i-1]:"");
}
// Sleutels met {naam} ("Programma van {naam} geopend") worden regexen, zodat
// een tekst met een echte naam erin toch gevonden wordt.
function i18nNaam(k){
  if(!I18N.naamRegels){I18N.naamRegels=[];for(const key in I18N.dict){if(key.indexOf("{naam}")<0)continue;const re=new RegExp("^"+key.split("{naam}").map(d=>d.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\\\{n\\\}/g,"(\\d+(?:[.,:]\\d+)*)")).join("(.+?)")+"$");I18N.naamRegels.push({re,uit:I18N.dict[key]});}}
  for(const r of I18N.naamRegels){const m=k.match(r.re);if(!m)continue;let i=1;return r.uit.replace(/\{naam\}|\{n\}/g,()=>m[i++]!==undefined?m[i-1]:"");}
  return undefined;
}
// Regels voor teksten die de code zelf in elkaar plakt (bijv. "Gedaan op <datum>"):
// i18nRegel(/^Gedaan op (.+)$/, "Done on $1") in vertaling-en-extra.js.
function i18nRegel(re,uit){(I18N.regels=I18N.regels||[]).push({re,uit});}
function i18nViaRegels(k){for(const r of (I18N.regels||[])){if(r.re.test(k))return k.replace(r.re,r.uit);}return undefined;}
// Meerdere zinnen: vertaal per zin als elke zin apart bekend is.
function i18nZinnen(k){
  const delen=k.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Þ])/);if(delen.length<2)return undefined;
  const uit=[];for(const z of delen){const d=I18N.dict[z]!==undefined?I18N.dict[z]:i18nPatroon(z);if(d===undefined)return undefined;uit.push(d);}
  return uit.join(" ");
}
function t(s){
  if(LANG==="nl"||typeof s!=="string")return s;
  const k=tNorm(s);if(!k||!/[A-Za-zÀ-ÿ]/.test(k))return s;
  let d=I18N.dict[k];
  if(d===undefined)d=i18nPatroon(k);
  if(d===undefined)d=i18nNaam(k);
  if(d===undefined)d=i18nViaRegels(k);
  if(d===undefined)d=i18nZinnen(k);
  if(d===undefined){if(/[a-zà-ÿ]{3,}/i.test(k)&&!/^[A-Za-z0-9_.-]+@/.test(k)&&!I18N.geproduceerd.has(k))I18N.ontbreekt.add(k);return s;}
  return i18nRand(s,d);
}
// Vertaling met invulwaarden: tf("{n} klanten",{n:3}) → "3 clients" (ook in het NL invullen).
function tf(s,vals){let u=t(s);for(const k in (vals||{}))u=u.split("{"+k+"}").join(vals[k]);return u;}
const I18N_SKIP=new Set(["SCRIPT","STYLE","TEXTAREA","CODE","PRE","NOSCRIPT"]);
const I18N_ATTRS=["placeholder","title","aria-label","alt","data-tip"];
const i18nOrig=new WeakMap(); // tekstknoop → {en}: voorkomt dubbel vertalen
function i18nTekst(node){
  const cur=node.nodeValue;if(!cur||!/[A-Za-zÀ-ÿ]/.test(cur))return;
  const o=i18nOrig.get(node);if(o&&o.en===cur)return;
  const p=node.parentNode;if(p&&p.nodeType===1&&(I18N_SKIP.has(p.tagName)||p.closest("[data-notr]")))return;
  const nieuw=t(cur);if(nieuw!==cur){i18nOrig.set(node,{en:nieuw});node.nodeValue=nieuw;}
}
function i18nEl(el){
  if(!el.hasAttribute)return;
  for(const a of I18N_ATTRS){if(el.hasAttribute(a)){const v=el.getAttribute(a);const n=t(v);if(n!==v)el.setAttribute(a,n);}}
  if(el.tagName==="INPUT"&&/^(button|submit|reset)$/i.test(el.type||"")){const n=t(el.value);if(n!==el.value)el.value=n;}
}
function i18nBoom(root){
  if(root.nodeType===3){i18nTekst(root);return;}
  if(root.nodeType!==1)return;
  if(I18N_SKIP.has(root.tagName)||root.closest("[data-notr]"))return;
  i18nEl(root);
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{acceptNode(n){
    if(n.nodeType===1)return (I18N_SKIP.has(n.tagName)||n.hasAttribute("data-notr"))?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
    return NodeFilter.FILTER_ACCEPT;}});
  let n;while((n=w.nextNode())){if(n.nodeType===3)i18nTekst(n);else i18nEl(n);}
}
function i18nStart(){
  if(LANG!=="en")return;
  document.documentElement.lang="en";
  i18nBoom(document.body);
  new MutationObserver(muts=>{
    for(const m of muts){
      if(m.type==="childList")m.addedNodes.forEach(i18nBoom);
      else if(m.type==="characterData")i18nTekst(m.target);
      else if(m.type==="attributes")i18nEl(m.target);
    }
  }).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:I18N_ATTRS});
  // Meldingen die niet via de DOM lopen
  if(typeof toast==="function"){const f=toast;toast=function(m){return f.apply(this,[t(m)].concat([].slice.call(arguments,1)));};}
  if(typeof setMsg==="function"){const f=setMsg;setMsg=function(m,k){return f.call(this,t(m),k);};}
  ["confirm","alert","prompt"].forEach(n=>{const f=window[n].bind(window);window[n]=function(m,d){return f(t(m),d===undefined?d:t(d));};});
  // Dag- en maandnamen uit state.js (arrays: inhoud vervangen, de const blijft)
  const zet=(naam,vals)=>{try{const a=eval(naam);if(Array.isArray(a))a.splice(0,a.length,...vals);}catch(e){}};
  zet("DAGEN",["MO","TU","WE","TH","FR","SA","SU"]);
  zet("DAGVOL",["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]);
  zet("DAGENVOL",["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]);
  zet("MAANDVOL",["January","February","March","April","May","June","July","August","September","October","November","December"]);
  zet("MAANDKORT",["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]);
}
document.addEventListener("DOMContentLoaded",i18nStart);
// Taal wisselen: onthouden, in het profiel bewaren en herladen.
async function setLang(l){
  if(!TALEN.includes(l)||l===LANG)return;
  try{localStorage.setItem("forge_lang",l);}catch(e){}
  try{if(typeof ME!=="undefined"&&ME&&ME.user&&typeof db!=="undefined")await db.from("profiles").update({lang:l}).eq("id",ME.user.id);}catch(e){}
  location.reload();
}
// Heeft de gebruiker op dit apparaat zelf een taal gekozen? Dan wint die van
// het profiel (en wordt hij naar het profiel geschreven), anders volgt het
// apparaat het profiel. Zo springt de taal niet terug na het inloggen.
function taalExpliciet(){try{return TALEN.includes(localStorage.getItem("forge_lang"));}catch(e){return false;}}
// Vlaggetjes als SVG (Windows toont vlag-emoji niet).
const VLAG={
  nl:'<svg class="vlag" viewBox="0 0 22 15" aria-hidden="true"><rect width="22" height="5" fill="#AE1C28"/><rect y="5" width="22" height="5" fill="#fff"/><rect y="10" width="22" height="5" fill="#21468B"/></svg>',
  en:'<svg class="vlag" viewBox="0 0 22 15" aria-hidden="true"><rect width="22" height="15" fill="#012169"/><path d="M0 0L22 15M22 0L0 15" stroke="#fff" stroke-width="3"/><path d="M0 0L22 15M22 0L0 15" stroke="#C8102E" stroke-width="1.2"/><path d="M11 0V15M0 7.5H22" stroke="#fff" stroke-width="5"/><path d="M11 0V15M0 7.5H22" stroke="#C8102E" stroke-width="3"/></svg>'
};
const TAALNAAM={nl:"Nederlands",en:"English"};
// Zelfde vlaggetjes voor de taalkeuze onder het inlogkaartje (index.html).
document.addEventListener("DOMContentLoaded",()=>TALEN.forEach(l=>{
  const a=document.getElementById("taal-"+l);if(a&&!a.querySelector(".vlag"))a.insertAdjacentHTML("afterbegin",VLAG[l]);
}));
// Taalkiezer rechts in de bovenbalk: vlag + pijltje, uitklapmenu met beide talen.
function taalMenuHtml(){
  return '<div class="avwrap taalwrap" data-notr><button class="cavbtn taalbtn" title="'+(LANG==="en"?"Language":"Taal")+'" onclick="taalMenuToggle(event)">'+VLAG[LANG]+'<svg class="i cav-caret"><use href="#i-chev"/></svg></button>'+
    '<div class="avmenu taalmenu" id="taalmenu">'+TALEN.map(l=>'<button onclick="setLang(\''+l+'\')">'+VLAG[l]+' '+TAALNAAM[l]+(l===LANG?' <span class="taal-check">✓</span>':'')+'</button>').join("")+'</div></div>';
}
function taalMenuToggle(ev){ev.stopPropagation();const m=document.getElementById("taalmenu");if(m)m.classList.toggle("show");const a=document.getElementById("avmenu");if(a)a.classList.remove("show");}
document.addEventListener("click",e=>{if(!e.target.closest(".taalwrap")){const m=document.getElementById("taalmenu");if(m)m.classList.remove("show");}});
// Voor het testen: welke teksten op het scherm hebben nog geen vertaling?
function i18nOntbreekt(){return [...I18N.ontbreekt].sort();}
