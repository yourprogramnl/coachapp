// app/state.js — gedeeld fundament voor alle andere scripts.
// Bevat: de Supabase-verbinding, gedeelde constanten, kleine hulpfuncties,
// de ingelogde gebruiker (ME) en de toast-melding. Dit bestand laadt als
// eerste, zodat alle schermen erop kunnen leunen.
const SUPABASE_URL="https://ujuvbxqgnxkyjcmcrqpw.supabase.co";
const SUPABASE_KEY="sb_publishable_e_959eiOehMLgZzfZDFiuQ_2UVK-z_c";
let db=null;
try{
  if(typeof supabase==="undefined"||!supabase.createClient) throw new Error("lib");
  // cache:'no-store': database-antwoorden mogen nooit uit de browsercache komen
  // (een gecachet foutantwoord bleef anders hangen, zelfs na herstel serverside).
  db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:(u,o)=>fetch(u,Object.assign({},o,{cache:"no-store"}))}});
}catch(e){
  document.body.innerHTML='<div style="max-width:460px;margin:14vh auto;font-family:sans-serif;color:#1b2330;text-align:center;padding:24px"><h2 style="color:#4f8bff">Open in een gewone browser</h2><p style="color:#8a94a6;line-height:1.6">Deze app werkt niet in een klein voorbeeldvenster. Open de link in Chrome of Edge.</p></div>';
}
const ROLE_NL={platform_admin:"Platform-admin",eigenaar:"Eigenaar",coach:"Coach",lid:"Lid"};
const DAGEN=["MA","DI","WO","DO","VR","ZA","ZO"];
const MAANDVOL=["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
const esc=s=>(s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const todayStr=()=>ymd(new Date());
const mondayOf=d=>{const x=new Date(d);const k=(x.getDay()+6)%7;x.setDate(x.getDate()-k);x.setHours(0,0,0,0);return x;};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
let ME={user:null,profile:null};
const MAANDKORT=["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
function toast(t){let e=document.getElementById("toast2");if(!e){e=document.createElement("div");e.id="toast2";e.className="toast2";document.body.appendChild(e);}e.textContent=t;e.classList.add("show");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("show"),2600);}
function resultScoreTxt(r){if(!r)return"";if(r.time_seconds!=null)return Math.floor(r.time_seconds/60)+":"+pad(r.time_seconds%60);if(r.load_kg!=null)return r.load_kg+" kg";if(r.rounds!=null)return r.rounds+" rondes"+(r.reps!=null?" + "+r.reps:"");if(r.reps!=null)return r.reps+" reps";return r.score_text||"";}
const KLEUREN=[["","geen kleur"],["grijs","grijs"],["roze","roze"],["oranje","oranje"],["geel","geel"],["blauw","blauw"],["groen","groen"]];
const SCORETYPES=[["text","vrije tekst"],["time","tijd"],["load","gewicht"],["reps","reps"],["rounds_reps","rondes+reps"],["none","geen score"]];
const selOpts=(list,cur)=>list.map(o=>'<option value="'+o[0]+'"'+(o[0]===(cur||list[0][0])?" selected":"")+'>'+o[1]+'</option>').join("");
const AVKLEUREN=["linear-gradient(135deg,#38bdf8,#6366f1)","linear-gradient(135deg,#f472b6,#a855f7)","linear-gradient(135deg,#fb923c,#ef4444)","linear-gradient(135deg,#34d399,#0d9488)","linear-gradient(135deg,#a78bfa,#6366f1)","linear-gradient(135deg,#facc15,#f97316)"];
const avStijl=naam=>{let h=0;for(const c of String(naam||"?"))h=(h*31+c.charCodeAt(0))>>>0;return "background:"+AVKLEUREN[h%AVKLEUREN.length];};

function composePresc(b){
  if(b.kind==="conditioning")return b.notes||"";
  if(b.prescription)return b.prescription;
  const segs=[];const sr=[b.sets,b.reps].filter(Boolean).join(" x ");
  if(sr)segs.push(sr);if(b.tempo)segs.push("@ "+b.tempo);
  let s=segs.join(" ");if(b.rest)s+=(s?" · ":"")+"rust "+b.rest;return s;
}

// Merkkleur uit het bedrijfsthema ook in dit dashboard (Instellingen > Thema,
// schakelaar "ook in dit dashboard"). Let op: de coach-interface definieert
// --accent opnieuw binnen .cwrap, dus we overschrijven op die laag, met
// afgeleide tinten (donkerder voor tekst, heel licht voor pill-achtergronden).
function kleurTint(hex,f){
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const t=v=>Math.max(0,Math.min(255,Math.round(f>0?v+(255-v)*f:v*(1+f))));
  return "#"+[t(r),t(g),t(b)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
function pasDashKleur(theme){
  let st=document.getElementById("dashkleur");
  const aan=theme&&theme.dash_aan&&/^#[0-9a-fA-F]{6}$/.test(theme.color||"");
  if(!aan){if(st)st.remove();return;}
  const k=theme.color,d=kleurTint(k,-.22),licht=kleurTint(k,.88);
  if(!st){st=document.createElement("style");st.id="dashkleur";document.head.appendChild(st);}
  st.textContent=":root,.cwrap{--accent:"+k+";--accent-d:"+d+";--teal-bg:"+licht+"}";
}
// Gedeelde render-helpers (gebruikt door alle schermen)
function header(title,sub){return '<h2>'+esc(title)+'</h2>'+(sub?'<div class="muted">'+esc(sub)+'</div>':'');}
const naamVan=p=>esc([p.first_name,p.last_name].filter(Boolean).join(" ")||p.email);
// Avatar: toon de profielfoto (avatar_url) als die er is, anders een gekleurde cirkel met initialen.
const avFotoStyle=p=>(p&&p.avatar_url)?("background-image:url('"+esc(p.avatar_url)+"');background-size:cover;background-position:center"):avStijl(naamVan(p));
const avFotoText=p=>(p&&p.avatar_url)?"":esc(naamVan(p).slice(0,2).toUpperCase());
