// app/instellingen.js — het Instellingen-scherm (via het avatar-menu rechtsboven),
// linksbalk zoals CoachRx. Profiel en Wachtwoord werken echt; Thema,
// Consultatielink, Notificaties en Partners zijn nette placeholders.
// Bewust weggelaten (keuze Stefan, 17 juli): Plan & Billing, Organization,
// Client Settings.
let instTab="profiel";
const INST_TABS=[
  ["profiel","Profiel","i-user"],
  ["wachtwoord","Wachtwoord","i-keys"],
  ["thema","Thema","i-eye"],
  ["consult","Consultatielink","i-link"],
  ["notificaties","Notificaties","i-chat"],
  ["partners","Partners","i-fist"],
];
function fillInstellingen(){
  const cp=document.getElementById("cpage");if(!cp)return;
  cp.innerHTML='<h1>Instellingen</h1><div class="instwrap">'+
    '<div class="panel instnav">'+INST_TABS.map(t=>'<button class="'+(instTab===t[0]?"on":"")+'" onclick="instGa(\''+t[0]+'\')"><svg class="i sm-i"><use href="#'+t[2]+'"/></svg> '+t[1]+'</button>').join("")+'</div>'+
    '<div class="panel instpaneel" id="inst-paneel"></div></div>';
  instPaneel();
}
function instGa(t){instTab=t;fillInstellingen();}
function instPaneel(){
  const host=document.getElementById("inst-paneel");if(!host)return;
  const p=ME.profile;
  if(instTab==="profiel"){
    host.innerHTML='<h2 style="margin:0 0 4px">Profiel</h2><div class="sm muted" style="margin-bottom:16px">Je naam en foto zoals je klanten ze zien.</div>'+
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px"><div class="instav" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div>'+
      '<div><input type="file" id="inst-foto" accept="image/*" style="display:none" onchange="instFotoUpload(this)">'+
      '<button class="btn ghost sm" id="inst-fotoknop" onclick="document.getElementById(\'inst-foto\').click()">Foto wijzigen</button>'+
      '<div class="sm muted" style="margin-top:4px">Alleen afbeeldingen, max 5 MB.</div></div></div>'+
      '<div class="field" style="max-width:340px"><label>Voornaam</label><input id="inst-vn" value="'+esc(p.first_name||"")+'"></div>'+
      '<div class="field" style="max-width:340px"><label>Achternaam</label><input id="inst-an" value="'+esc(p.last_name||"")+'"></div>'+
      '<div class="field" style="max-width:340px"><label>E-mailadres</label><input value="'+esc(p.email||ME.user.email||"")+'" disabled></div>'+
      '<div class="msg" id="inst-msg"></div>'+
      '<button class="btn" onclick="instProfielOpslaan()">Profiel opslaan</button>';
  }else if(instTab==="wachtwoord"){
    host.innerHTML='<h2 style="margin:0 0 4px">Wachtwoord</h2><div class="sm muted" style="margin-bottom:16px">Kies een nieuw wachtwoord van minimaal 8 tekens.</div>'+
      '<div class="field" style="max-width:340px"><label>Nieuw wachtwoord</label><input type="password" id="inst-pw1" placeholder="••••••••"></div>'+
      '<div class="field" style="max-width:340px"><label>Herhaal nieuw wachtwoord</label><input type="password" id="inst-pw2" placeholder="••••••••"></div>'+
      '<div class="msg" id="inst-msg"></div>'+
      '<button class="btn" onclick="instWachtwoordOpslaan()">Wachtwoord wijzigen</button>';
  }else{
    const info={
      thema:["Thema","Lichte en donkere modus komen in een volgende stap."],
      consult:["Consultatielink","Een boekingslink voor consults (zoals Calendly) komt in een volgende stap."],
      notificaties:["Notificaties","Meldingsinstellingen komen samen met push- en e-mailnotificaties."],
      partners:["Partners","Partner- en doorverwijsopties komen in een volgende stap."],
    }[instTab]||["",""];
    host.innerHTML='<h2 style="margin:0 0 4px">'+info[0]+'</h2><div class="csoon" style="margin-top:10px">'+info[1]+'</div>';
  }
}
async function instProfielOpslaan(){
  const vn=(document.getElementById("inst-vn").value||"").trim();
  const an=(document.getElementById("inst-an").value||"").trim();
  const msg=document.getElementById("inst-msg");
  if(!vn||!an){if(msg)msg.textContent="Vul je voor- en achternaam in.";return;}
  const{data,error}=await db.from("profiles").update({first_name:vn,last_name:an}).eq("id",ME.user.id).select().single();
  if(error){if(msg)msg.textContent=error.message||"Opslaan mislukt";return;}
  Object.assign(ME.profile,data||{first_name:vn,last_name:an});
  toast("Profiel opgeslagen");
  coachRenderSection(); // naam/avatar in de balk verversen
}
// Eigen profielfoto uploaden (zelfde bucket en pad-opbouw als bij een klant).
async function instFotoUpload(input){
  const file=input.files&&input.files[0];input.value="";
  if(!file)return;
  if(!/^image\//.test(file.type||"")){toast("Kies een afbeelding");return;}
  if(file.size>5242880){toast("Afbeelding is te groot (max 5 MB)");return;}
  const knop=document.getElementById("inst-fotoknop");
  if(knop){knop.disabled=true;knop.textContent="Uploaden…";}
  const ext=((file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,""))||"jpg";
  const path=(ME.profile.company_id||"x")+"/"+ME.user.id+"/"+crypto.randomUUID()+"."+ext;
  const{error:upErr}=await db.storage.from("avatars").upload(path,file,{contentType:file.type,upsert:false});
  if(upErr){toast(upErr.message||"Upload mislukt");if(knop){knop.disabled=false;knop.textContent="Foto wijzigen";}return;}
  const{data:pub}=db.storage.from("avatars").getPublicUrl(path);
  const url=(pub&&pub.publicUrl)?pub.publicUrl:null;
  const oud=ME.profile.avatar_url;
  const{data,error}=await db.from("profiles").update({avatar_url:url}).eq("id",ME.user.id).select().single();
  if(error){
    await db.storage.from("avatars").remove([path]); // geen wees-bestand achterlaten
    toast(error.message||"Opslaan mislukt");if(knop){knop.disabled=false;knop.textContent="Foto wijzigen";}return;
  }
  Object.assign(ME.profile,data||{avatar_url:url});
  if(oud){const m=String(oud).split("/avatars/");if(m[1])db.storage.from("avatars").remove([decodeURIComponent(m[1])]);}
  toast("Profielfoto bijgewerkt");
  coachRenderSection();
}
async function instWachtwoordOpslaan(){
  const a=document.getElementById("inst-pw1").value||"";
  const b=document.getElementById("inst-pw2").value||"";
  const msg=document.getElementById("inst-msg");
  if(a.length<8){if(msg)msg.textContent="Gebruik minimaal 8 tekens.";return;}
  if(a!==b){if(msg)msg.textContent="De twee wachtwoorden zijn niet gelijk.";return;}
  const{error}=await db.auth.updateUser({password:a});
  if(error){if(msg)msg.textContent=error.message||"Wijzigen mislukt";return;}
  document.getElementById("inst-pw1").value="";document.getElementById("inst-pw2").value="";
  if(msg)msg.textContent="";
  toast("Wachtwoord gewijzigd");
}
