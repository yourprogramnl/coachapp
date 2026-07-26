// app/rechten.js — rechten van een coach beheren (Coaches › ⋮ › Rechten…).
// Twee dingen, niet meer (verzoek Stefan, 26 juli 2026):
//   1. Beheerder: mag alles, inclusief rechten uitdelen en iemand anders
//      beheerder maken. Dit is de bestaande rol 'eigenaar' in de database.
//   2. Programma's: welke programma's mag deze coach aanpassen.
// Kijken mag altijd en voor iedereen; wijzigen alleen wat hier is aangevinkt.
// De database dwingt dit af (tabel program_editors + RLS), dus dit venster is
// alleen de bediening, niet de beveiliging.
let RECHTEN=null;

function ensureRechtenModal(){
  if(document.getElementById("rechtenmodal"))return;
  const d=document.createElement("div");
  d.innerHTML='<div class="lmodal" id="rechtenmodal"><div class="box">'+
    '<h3 id="recht-titel">Rechten</h3>'+
    '<div class="sm muted" style="margin:-6px 0 14px">Kijken mag iedereen. Aanpassen alleen wat je hier aanvinkt.</div>'+
    '<div id="recht-body"></div>'+
    '<div style="display:flex;gap:8px;margin-top:16px"><button class="btn" id="recht-save" onclick="rechtenOpslaan()">Opslaan</button>'+
    '<button class="btn ghost" onclick="rechtenSluit()">Annuleren</button></div>'+
    '<div class="msg" id="recht-msg"></div></div></div>';
  document.body.appendChild(d.firstChild);
}
function rechtenSluit(){const m=document.getElementById("rechtenmodal");if(m)m.classList.remove("show");RECHTEN=null;}

async function rechtenOpen(coachId){
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  ensureRechtenModal();
  const body=document.getElementById("recht-body");
  body.innerHTML='<div class="sm muted">Laden…</div>';
  document.getElementById("recht-msg").textContent="";
  document.getElementById("rechtenmodal").classList.add("show");
  const[rp,re,rc]=await Promise.all([
    db.from("program_templates").select("id,name,created_by").order("name"),
    db.from("program_editors").select("program_id").eq("profile_id",coachId),
    db.from("profiles").select("id,first_name,last_name,email,role").eq("id",coachId).single()
  ]);
  const coach=rc.data;
  if(!coach){body.innerHTML='<div class="msg err">Coach niet gevonden.</div>';return;}
  RECHTEN={id:coachId,rol:coach.role,huidig:new Set((re.data||[]).map(r=>r.program_id)),programs:rp.data||[]};
  document.getElementById("recht-titel").textContent="Rechten van "+naamVan(coach);
  rechtenRender();
}

function rechtenRender(){
  const body=document.getElementById("recht-body");if(!body||!RECHTEN)return;
  const isBeheerder=RECHTEN.rol==="eigenaar"||RECHTEN.rol==="platform_admin";
  const rijen=(RECHTEN.programs||[]).map(p=>
    '<label class="rrij" style="display:flex;gap:10px;align-items:center;padding:9px 2px;border-bottom:1px solid var(--line);cursor:pointer">'+
      '<input type="checkbox" class="rchk" data-pid="'+esc(p.id)+'"'+
        (isBeheerder||RECHTEN.huidig.has(p.id)?" checked":"")+(isBeheerder?" disabled":"")+'>'+
      '<span style="font-size:13px;font-weight:600">'+esc(p.name)+'</span>'+
    '</label>').join("")||'<div class="sm muted">Er zijn nog geen programma\'s.</div>';
  body.innerHTML=
    '<label style="display:flex;gap:10px;align-items:flex-start;padding:12px 13px;border:1px solid var(--line);border-radius:11px;cursor:pointer;margin-bottom:14px">'+
      '<input type="checkbox" id="recht-beheerder"'+(isBeheerder?" checked":"")+
      (RECHTEN.rol==="platform_admin"?" disabled":"")+' onchange="rechtenBeheerderWissel(this.checked)">'+
      '<span><b style="font-size:13.5px">Beheerder</b>'+
      '<div class="sm muted" style="margin-top:2px">Mag alles: in elk programma werken, rechten uitdelen en iemand anders beheerder maken.'+
      (RECHTEN.rol==="platform_admin"?' Dit is een platform-beheerder, die kun je hier niet wijzigen.':'')+'</div></span></label>'+
    '<div class="field" style="margin-bottom:4px"><label>Programma\'s die deze coach mag aanpassen</label>'+
      (isBeheerder?'<div class="sm muted" style="margin-bottom:6px">Een beheerder mag alle programma\'s aanpassen, dus hier valt niks te kiezen.</div>'
                  :'<div style="display:flex;gap:8px;margin-bottom:6px"><button type="button" class="btn ghost sm" onclick="rechtenAlle(true)">Alles aanvinken</button><button type="button" class="btn ghost sm" onclick="rechtenAlle(false)">Alles uitzetten</button></div>')+
      '<div style="max-height:280px;overflow:auto">'+rijen+'</div></div>';
}
function rechtenBeheerderWissel(aan){
  if(!RECHTEN)return;
  RECHTEN.rol=aan?"eigenaar":"coach";
  rechtenRender();
}
function rechtenAlle(aan){
  document.querySelectorAll("#recht-body .rchk").forEach(c=>{if(!c.disabled)c.checked=aan;});
}

async function rechtenOpslaan(){
  if(!RECHTEN)return;
  const msg=document.getElementById("recht-msg");
  const knop=document.getElementById("recht-save");knop.disabled=true;
  msg.textContent="";msg.className="msg";
  try{
    // 1. Rol bijwerken als het vinkje Beheerder is veranderd.
    const{data:nu}=await db.from("profiles").select("role").eq("id",RECHTEN.id).single();
    if(nu&&nu.role!=="platform_admin"&&nu.role!==RECHTEN.rol){
      const{error}=await db.from("profiles").update({role:RECHTEN.rol}).eq("id",RECHTEN.id);
      if(error)throw error;
    }
    // 2. Programma-rechten bijwerken (alleen het verschil, zodat we niks
    //    onnodig weggooien en weer terugzetten).
    const gewenst=new Set([...document.querySelectorAll("#recht-body .rchk")].filter(c=>c.checked&&!c.disabled).map(c=>c.dataset.pid));
    const weg=[...RECHTEN.huidig].filter(p=>!gewenst.has(p));
    const bij=[...gewenst].filter(p=>!RECHTEN.huidig.has(p));
    if(weg.length){
      const{error}=await db.from("program_editors").delete().eq("profile_id",RECHTEN.id).in("program_id",weg);
      if(error)throw error;
    }
    if(bij.length){
      const{error}=await db.from("program_editors").insert(bij.map(p=>({program_id:p,profile_id:RECHTEN.id,company_id:ME.profile.company_id})));
      if(error)throw error;
    }
    rechtenSluit();
    toast("Rechten opgeslagen");
    if(typeof fillCoaches==="function")fillCoaches();
    if(typeof programLaad==="function"&&typeof LIB!=="undefined"&&LIB&&LIB.programs)programLaad();
  }catch(e){
    msg.textContent=(e&&e.message)||"Opslaan mislukt";msg.className="msg err";
  }
  knop.disabled=false;
}
