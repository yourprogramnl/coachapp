// app/meldingen.js: coaches melden bugs, ideeën en vragen over de app zelf
// (vraagteken in de balk > Iets melden). Elke melding gaat naar de tabel
// app_meldingen; een database-trigger zet er een mail bij in de wachtrij.
// Stefan en Michel (platform_admin) lezen ze op de pagina #meldingen en zetten
// ze daar op afgehandeld.
const MELD_SOORTEN=[["bug","Er gaat iets mis"],["idee","Idee of verbetering"],["vraag","Vraag"]];
let meldSoort="bug",meldFilter="open",meldLijst=[];

// Waar zat de coach op het moment van melden? Helpt bij het terugzoeken.
function meldPagina(){
  const h=(location.hash||"").replace(/^#/,"");
  const naam=(typeof cnavItems==="function"?(cnavItems().find(n=>n[0]===coachSection)||[])[1]:"")||coachSection||"";
  return (naam||"onbekend")+(h?" (#"+h+")":"");
}
function meldContext(){
  return {browser:(navigator.userAgent||"").slice(0,180),scherm:window.innerWidth+"×"+window.innerHeight};
}

function ensureMeldModal(){
  if(document.getElementById("meldmodal"))return;
  const d=document.createElement("div");
  d.innerHTML='<div class="lmodal" id="meldmodal" style="z-index:420"><div class="box">'+
    '<h3>Iets melden</h3>'+
    '<div class="sm muted" style="margin:-6px 0 12px">Gaat er iets mis, of kan iets beter? Laat het hier achter. Je melding komt direct bij Stefan binnen.</div>'+
    '<div class="field"><label>Wat is het?</label><div class="seg" id="meld-soort">'+
      MELD_SOORTEN.map((s,i)=>'<button class="'+(i===0?"on":"")+'" onclick="meldKiesSoort(\''+s[0]+'\',this)">'+esc(s[1])+'</button>').join("")+'</div></div>'+
    '<div class="field"><label>Onderwerp</label><input id="meld-onderwerp" maxlength="120" placeholder="Bijv. Kalender laadt niet bij Anne"></div>'+
    '<div class="field"><label>Vertel wat er gebeurde</label><textarea id="meld-bericht" rows="5" placeholder="Wat deed je, wat verwachtte je, en wat gebeurde er? Hoe meer je vertelt, hoe sneller het opgelost is."></textarea></div>'+
    '<div class="sm muted" style="margin-bottom:12px">We sturen automatisch mee op welk scherm je zat en welke browser je gebruikt.</div>'+
    '<div style="display:flex;gap:8px"><button class="btn" id="meld-stuur" onclick="meldVerstuur()">Versturen</button>'+
    '<button class="btn ghost" onclick="meldSluit()">Annuleren</button></div>'+
    '<div class="msg" id="meld-msg"></div></div></div>';
  document.body.appendChild(d.firstChild);
}
function meldOpen(){
  const m=document.getElementById("helpmenu");if(m)m.classList.remove("show");
  ensureMeldModal();
  meldSoort="bug";
  document.querySelectorAll("#meld-soort button").forEach((b,i)=>b.classList.toggle("on",i===0));
  document.getElementById("meld-onderwerp").value="";
  document.getElementById("meld-bericht").value="";
  document.getElementById("meld-msg").textContent="";
  document.getElementById("meld-stuur").disabled=false;
  document.getElementById("meldmodal").classList.add("show");
  setTimeout(()=>{const i=document.getElementById("meld-onderwerp");if(i)i.focus();},60);
}
function meldSluit(){const m=document.getElementById("meldmodal");if(m)m.classList.remove("show");}
function meldKiesSoort(s,btn){
  meldSoort=s;
  document.querySelectorAll("#meld-soort button").forEach(b=>b.classList.remove("on"));
  btn.classList.add("on");
}
async function meldVerstuur(){
  const onderwerp=document.getElementById("meld-onderwerp").value.trim();
  const bericht=document.getElementById("meld-bericht").value.trim();
  const msg=document.getElementById("meld-msg");
  if(!onderwerp){msg.className="msg err";msg.textContent="Vul een kort onderwerp in.";return;}
  if(bericht.length<5){msg.className="msg err";msg.textContent="Vertel even wat er aan de hand is.";return;}
  const knop=document.getElementById("meld-stuur");knop.disabled=true;
  msg.className="msg";msg.textContent="Bezig met versturen…";
  const{error}=await db.from("app_meldingen").insert({
    company_id:ME.profile.company_id,profile_id:ME.user.id,soort:meldSoort,
    onderwerp,bericht,pagina:meldPagina(),context:meldContext(),
  });
  if(error){knop.disabled=false;msg.className="msg err";msg.textContent=error.message||"Versturen mislukt. Probeer het nog eens.";return;}
  msg.className="msg ok";msg.textContent="Dank je, hij staat genoteerd.";
  setTimeout(meldSluit,1100);
  if(coachSection==="meldingen")fillMeldingen();
}

// ---------- Overzicht voor platform_admin (route #meldingen) ----------

const meldSoortLabel=s=>(MELD_SOORTEN.find(x=>x[0]===s)||[null,s])[1];
function meldDatum(iso){
  try{
    const d=new Date(iso);
    return d.toLocaleDateString("nl-NL",{day:"numeric",month:"long"})+" om "+d.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"});
  }catch(e){return "";}
}
async function fillMeldingen(){
  const cp=document.getElementById("cpage");if(!cp)return;
  if(myRole()!=="platform_admin"){cp.innerHTML='<div class="csoon">Deze pagina is alleen voor beheerders.</div>';return;}
  cp.innerHTML='<h1>Meldingen</h1><div class="spin">Laden…</div>';
  const{data,error}=await db.from("app_meldingen").select("*").order("created_at",{ascending:false});
  if(error){cp.innerHTML='<h1>Meldingen</h1><div class="card"><div class="row"><span class="muted">Laden mislukt: '+esc(error.message)+'</span></div></div>';return;}
  meldLijst=data||[];
  // Namen van de melders erbij (aparte query; profielen staan los van de melding).
  const ids=[...new Set(meldLijst.map(m=>m.profile_id))];
  let namen={};
  if(ids.length){
    const{data:ps}=await db.from("profiles").select("id,first_name,last_name,email").in("id",ids);
    (ps||[]).forEach(p=>{namen[p.id]=naamVan(p)+(p.email?" · "+p.email:"");});
  }
  meldRender(namen);
}
function meldRender(namen){
  const cp=document.getElementById("cpage");if(!cp)return;
  const open=meldLijst.filter(m=>m.status==="open").length;
  const zicht=meldLijst.filter(m=>meldFilter==="alles"||m.status===meldFilter);
  const rijen=zicht.map(m=>{
    const afg=m.status==="afgehandeld";
    return '<div class="card" style="margin-bottom:10px;padding:14px 16px">'+
      '<div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">'+
        '<span class="tag">'+esc(meldSoortLabel(m.soort))+'</span>'+
        '<b style="flex:1;min-width:180px">'+esc(m.onderwerp)+'</b>'+
        (afg?'<span class="pendtag" style="color:#27b376;background:rgba(39,179,118,.1);border-color:rgba(39,179,118,.35)">Afgehandeld</span>'
            :'<button class="btn sm" onclick="meldZet(\''+m.id+'\',\'afgehandeld\')">Markeer afgehandeld</button>')+
      '</div>'+
      '<div style="white-space:pre-wrap;margin:10px 0;font-size:13.5px;line-height:1.55">'+esc(m.bericht)+'</div>'+
      '<div class="sm muted">'+esc(namen[m.profile_id]||"Onbekend")+' · '+esc(meldDatum(m.created_at))+' · scherm: '+esc(m.pagina||"onbekend")+'</div>'+
      (afg?'<div style="margin-top:8px"><button class="btn ghost sm" onclick="meldZet(\''+m.id+'\',\'open\')">Toch weer openzetten</button></div>':'')+
    '</div>';
  }).join("");
  cp.innerHTML='<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">'+
    '<h1 style="margin:0">Meldingen</h1>'+
    '<span class="sm muted">'+(open?open+' open':'niets open')+'</span>'+
    '<div class="seg" style="margin-left:auto">'+
      ['open','afgehandeld','alles'].map(f=>'<button class="'+(meldFilter===f?"on":"")+'" onclick="meldFilterZet(\''+f+'\')">'+esc(f.charAt(0).toUpperCase()+f.slice(1))+'</button>').join("")+
    '</div></div>'+
    (rijen||'<div class="card"><div class="row"><span class="muted">Geen meldingen in deze weergave.</span></div></div>');
}
function meldFilterZet(f){meldFilter=f;fillMeldingen();}
async function meldZet(id,status){
  const patch={status,afgehandeld_op:status==="afgehandeld"?new Date().toISOString():null,
    afgehandeld_door:status==="afgehandeld"?ME.user.id:null};
  const{error}=await db.from("app_meldingen").update(patch).eq("id",id);
  if(error){toast(error.message||"Bijwerken mislukt");return;}
  toast(status==="afgehandeld"?"Afgehandeld":"Weer opengezet");
  fillMeldingen();
}
