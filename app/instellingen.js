// app/instellingen.js — het Instellingen-scherm (via het avatar-menu rechtsboven),
// linksbalk zoals CoachRx. Profiel en Wachtwoord werken echt; Thema,
// Consultatielink, Notificaties en Partners zijn nette placeholders.
// Bewust weggelaten (keuze Stefan, 17 juli): Plan & Billing, Organization,
// Client Settings.
let instTab="profiel",instCompany=null;
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
function instGa(t){instTab=t;setHash("settings/"+t);fillInstellingen();}
// Hoeveel van je profiel is ingevuld (foto, voornaam, achternaam, over jou)?
function instVoortgang(){
  const p=ME.profile;
  const delen=[!!p.avatar_url,!!(p.first_name||"").trim(),!!(p.last_name||"").trim(),!!(p.bio||"").trim()];
  return Math.round(delen.filter(Boolean).length/delen.length*100);
}
async function instPaneel(){
  const host=document.getElementById("inst-paneel");if(!host)return;
  const p=ME.profile;
  if(instTab==="profiel"){
    // Bedrijfsgegevens (naam + logo) erbij halen; alleen eigenaar/platform_admin mogen ze wijzigen.
    if(instCompany===null&&p.company_id){
      host.innerHTML='<div class="spin">Laden…</div>';
      const{data}=await db.from("companies").select("id,name,logo_url,theme").eq("id",p.company_id).single();
      instCompany=data||{};
      if(instTab!=="profiel")return; // tab is intussen gewisseld
    }
    const pct=instVoortgang();
    const magBedrijf=myRole()==="eigenaar"||myRole()==="platform_admin";
    const bedrijf=instCompany||{};
    host.innerHTML=
      '<div class="instprog"><div class="pring" style="background:conic-gradient(var(--accent) '+(pct*3.6)+'deg,#e8ebef 0)"><span>'+pct+'%</span></div>'+
        '<div><b style="font-size:15px">Profiel-voortgang</b><div class="sm muted" style="margin-top:2px">Een compleet profiel (foto, naam en iets over jezelf) oogt vertrouwd voor je klanten.</div></div></div>'+
      '<div class="instbanner"><span class="instav-wrap"><span class="instav groot" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</span>'+
        '<input type="file" id="inst-foto" accept="image/*" style="display:none" onchange="instFotoUpload(this)">'+
        '<button class="instav-pen" id="inst-fotoknop" title="Foto wijzigen" onclick="document.getElementById(\'inst-foto\').click()"><svg class="i sm-i"><use href="#i-pen"/></svg></button></span>'+
        '<span><b style="font-size:19px">'+esc(naamVan(p))+'</b>'+
        (p.avatar_url?'<div class="instlink" style="margin-top:3px;font-size:12px" onclick="instFotoAanpassen()">Foto passend maken</div>':'')+'</span></div>'+
      '<div class="instgrid">'+
        '<div>'+
          '<div style="display:flex;gap:12px"><div class="field" style="flex:1"><label>Voornaam</label><input id="inst-vn" value="'+esc(p.first_name||"")+'"></div>'+
          '<div class="field" style="flex:1"><label>Achternaam</label><input id="inst-an" value="'+esc(p.last_name||"")+'"></div></div>'+
          '<div class="field"><label>E-mailadres <span class="instlink" onclick="instEmailStart()">Wijzig</span></label><input id="inst-email" value="'+esc(ME.user.email||p.email||"")+'" disabled></div>'+
          '<div id="inst-emailwissel" style="display:none"><div class="field"><label>Nieuw e-mailadres</label><input id="inst-email-nieuw" type="email" placeholder="naam@voorbeeld.nl"></div>'+
          '<button class="btn ghost sm" onclick="instEmailVerstuur()">Verstuur bevestigingsmail</button>'+
          '<div class="sm muted" style="margin-top:6px">Je krijgt een mail op je oude én nieuwe adres; het nieuwe adres geldt pas na bevestiging.</div></div>'+
        '</div>'+
        '<div>'+
          '<div class="field"><label>Over jou</label><textarea id="inst-bio" maxlength="220" style="min-height:96px" placeholder="Vertel je klanten kort iets over jezelf…" oninput="document.getElementById(\'inst-bioteller\').textContent=this.value.length+\'/220\'">'+esc(p.bio||"")+'</textarea>'+
          '<div class="sm muted" style="text-align:right" id="inst-bioteller">'+((p.bio||"").length)+'/220</div></div>'+
          '<div class="field"><label>Bedrijfsnaam</label><input id="inst-bedrijf" value="'+esc(bedrijf.name||"")+'"'+(magBedrijf?"":" disabled")+'></div>'+
          '<div class="field"><label>Bedrijfslogo</label><div style="display:flex;align-items:center;gap:12px">'+
            '<span class="instlogo"'+(bedrijf.logo_url?' style="background-image:url(\''+esc(bedrijf.logo_url)+'\');background-size:cover;background-position:center"':'')+'>'+(bedrijf.logo_url?'':'<svg class="i"><use href="#i-cam"/></svg>')+'</span>'+
            (magBedrijf?'<input type="file" id="inst-logo" accept="image/*" style="display:none" onchange="instLogoUpload(this)"><button class="btn ghost sm" id="inst-logoknop" onclick="document.getElementById(\'inst-logo\').click()">Logo uploaden</button>'+(bedrijf.logo_url?'<button class="btn ghost sm" onclick="instLogoAanpassen()">Passend maken</button>':'')+'<span class="sm muted">Max 5 MB.</span>':'<span class="sm muted">Alleen de eigenaar kan het logo wijzigen.</span>')+
          '</div></div>'+
        '</div>'+
      '</div>'+
      '<div class="msg" id="inst-msg"></div>'+
      '<button class="btn" onclick="instProfielOpslaan()">Profiel opslaan</button>';
  }else if(instTab==="wachtwoord"){
    host.innerHTML='<h2 style="margin:0 0 4px">Wachtwoord</h2><div class="sm muted" style="margin-bottom:16px">Vul eerst je huidige wachtwoord in; het nieuwe wachtwoord is minimaal 8 tekens.</div>'+
      '<div class="field" style="max-width:340px"><label>Huidig wachtwoord</label><input type="password" id="inst-pw0" placeholder="••••••••"></div>'+
      '<div class="field" style="max-width:340px"><label>Nieuw wachtwoord</label><input type="password" id="inst-pw1" placeholder="••••••••"></div>'+
      '<div class="field" style="max-width:340px"><label>Herhaal nieuw wachtwoord</label><input type="password" id="inst-pw2" placeholder="••••••••"></div>'+
      '<div class="msg" id="inst-msg"></div>'+
      '<button class="btn" id="inst-pwknop" onclick="instWachtwoordOpslaan()">Wachtwoord wijzigen</button>';
  }else if(instTab==="thema"){
    if(instCompany===null&&p.company_id){
      host.innerHTML='<div class="spin">Laden…</div>';
      const{data}=await db.from("companies").select("id,name,logo_url,theme").eq("id",p.company_id).single();
      instCompany=data||{};
      if(instTab!=="thema")return;
    }
    if(!instThema)instThema=Object.assign({},THEMA_STD,(instCompany&&instCompany.theme)||{});
    if(!Array.isArray(instThema.quotes))instThema.quotes=THEMA_STD.quotes.slice();
    const mag=myRole()==="eigenaar"||myRole()==="platform_admin";
    const dis=mag?"":" disabled";
    host.innerHTML='<h2 style="margin:0 0 4px">Thema</h2><div class="sm muted" style="margin-bottom:16px">De kleuren en uitstraling van de sporter-app. Standaard is onze zwart-goud-stijl.'+(mag?"":" Alleen de eigenaar kan dit aanpassen.")+'</div>'+
      '<div class="themagrid">'+
      '<div>'+
        '<div class="field"><label>Merkkleur</label><div style="display:flex;align-items:center;gap:10px">'+
          '<input type="color" id="th-kleur" value="'+esc(instThema.color)+'" oninput="thZet(\'color\',this.value)"'+dis+' style="width:44px;height:36px;padding:2px;border-radius:9px;border:1px solid #dfe3e8;cursor:pointer">'+
          '<input id="th-hex" value="'+esc(instThema.color)+'" style="width:110px" oninput="thHex(this.value)"'+dis+'>'+
          '<span class="sm muted">of kies:</span>'+
          THEMA_PRESETS.map(k=>'<span class="th-preset" style="background:'+k+'" onclick="'+(mag?'thPreset(\''+k+'\')':'')+'"></span>').join("")+
        '</div></div>'+
        '<label class="pf-toggle" style="margin:2px 0 14px"><input type="checkbox" id="th-grad"'+(instThema.gradient?" checked":"")+' onchange="thZet(\'gradient\',this.checked)"'+dis+'><span class="pf-sw"></span> Kleurverloop (metallic-effect, zoals ons goud)</label>'+
        '<div class="field"><label>Typografie (koppen in de app)</label><div style="display:flex;gap:8px">'+
          [["modern","Modern"],["vet","Vet"],["smal","Smal"]].map(f=>'<button class="btn '+(instThema.font===f[0]?"":"ghost ")+'sm" onclick="'+(mag?'thZet(\'font\',\''+f[0]+'\')':'')+'">'+f[1]+'</button>').join("")+
        '</div></div>'+
        '<div class="field"><label>Motivatiequotes (afwisselend op Home in de app)</label><div id="th-quotes">'+
          instThema.quotes.map((q,i)=>'<div style="display:flex;gap:8px;margin-bottom:8px"><input value="'+esc(q)+'" oninput="thQuote('+i+',this.value)"'+dis+' style="flex:1">'+(mag?'<button class="btn ghost sm" onclick="thQuoteWeg('+i+')" title="Verwijderen"><svg class="i sm-i"><use href="#i-trash"/></svg></button>':'')+'</div>').join("")+
        '</div>'+(mag?'<button class="btn ghost sm" onclick="thQuoteBij()">+ Quote toevoegen</button>':'')+'</div>'+
        '<div class="msg" id="inst-msg"></div>'+
        (mag?'<div style="display:flex;gap:10px;margin-top:10px"><button class="btn" onclick="thOpslaan()">Thema opslaan</button><button class="btn ghost" onclick="thStandaard()">Terug naar standaard</button></div>':'')+
      '</div>'+
      '<div><div class="sm" style="font-weight:800;margin-bottom:2px">Live voorbeeld</div><div class="sm muted" style="margin-bottom:10px">Zo ziet je klant het straks.</div>'+
        '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">'+[["home","Home"],["splash","Splash"],["prog","Programma"],["msg","Bericht"],["mail","E-mail"]].map(t=>'<button class="btn '+(instPrevTab===t[0]?"":"ghost ")+'sm" onclick="thPrev(\''+t[0]+'\')">'+t[1]+'</button>').join("")+'</div>'+
        '<div id="th-preview"></div>'+
      '</div></div>';
    thPreviewRender();
  }else if(instTab==="consult"){
    host.innerHTML='<h2 style="margin:0 0 4px">Consultatielink</h2>'+
      '<div class="sm muted" style="margin-bottom:16px">Jouw persoonlijke boekingslink (bijv. Calendly) waarmee klanten een gesprek met je kunnen inplannen.</div>'+
      '<div class="field" style="max-width:520px"><label>Boekingslink</label><input id="inst-consult" value="'+esc(p.consult_url||"")+'" placeholder="https://calendly.com/jouwnaam/30min"></div>'+
      '<div class="msg" id="inst-msg"></div>'+
      '<div style="display:flex;gap:10px;align-items:center"><button class="btn" onclick="instConsultOpslaan()">Opslaan</button>'+
      (p.consult_url?'<a class="btn ghost" href="'+esc(p.consult_url)+'" target="_blank" rel="noopener">Link testen</a>':'')+'</div>';
  }else if(instTab==="notificaties"){
    host.innerHTML=instNotifHtml();
  }else if(instTab==="partners"){
    // Voorbeeld-indeling (17 juli): er zijn nog geen partners; Stripe en Loom
    // staan gepland als echte samenwerkingen. Kaarten alvast in CoachRx-stijl.
    const kaart=(naam,kleur,txt,knop)=>'<div class="pt-kaart">'+
      '<div style="font-weight:900;font-size:17px;color:'+kleur+'">'+naam+'</div>'+
      '<div class="sm" style="color:#5b6470;line-height:1.55;margin:8px 0 14px">'+txt+'</div>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto">'+
        '<span class="pt-status"><span class="pt-dot"></span> Nog niet gekoppeld</span>'+
        '<button class="btn ghost sm" onclick="toast(\''+naam+'-koppeling komt in een latere fase\')">'+knop+'</button>'+
      '</div></div>';
    host.innerHTML='<h2 style="margin:0 0 4px">Partners</h2>'+
      '<div class="sm muted" style="margin-bottom:16px">Koppelingen met diensten die het coachen makkelijker maken. Deze samenwerkingen staan gepland; zodra ze live zijn kun je ze hier aanzetten.</div>'+
      '<div class="pt-grid">'+
        kaart("stripe","#635bff","Betalingen van klanten wereldwijd innen, direct gekoppeld aan je klantenlijst. Komt samen met het facturatie-blok.","Binnenkort")+
        kaart("loom","#565add","Korte videoboodschappen opnemen en delen met je klanten, bijvoorbeeld voor techniek-feedback.","Binnenkort")+
      '</div>'+
      '<div class="sm muted" style="margin-top:16px">Ideeën voor een partner die hier zou moeten staan? Zet het op de lijst, dan bouwen we de koppeling in.</div>';
  }else{
    host.innerHTML='<div class="csoon">Deze pagina bestaat niet (meer).</div>';
  }
}
async function instConsultOpslaan(){
  const inp=document.getElementById("inst-consult");
  const msg=document.getElementById("inst-msg");
  let url=(inp&&inp.value||"").trim();
  if(url&&!/^https?:\/\//i.test(url))url="https://"+url; // “calendly.com/…” mag ook
  if(url&&!/^https?:\/\/.+\..+/i.test(url)){if(msg)msg.textContent="Dat ziet er niet uit als een geldige link.";return;}
  const{data,error}=await db.from("profiles").update({consult_url:url||null}).eq("id",ME.user.id).select().single();
  if(error){if(msg)msg.textContent=error.message||"Opslaan mislukt";return;}
  Object.assign(ME.profile,data||{consult_url:url||null});
  toast(url?"Consultatielink opgeslagen":"Consultatielink verwijderd");
  instPaneel();
}
// ---------- Thema (kleuren/typografie/quotes van de sporter-app) ----------
const THEMA_STD={color:"#D9B44A",gradient:true,font:"modern",quotes:[
  "Elke dag een beetje beter.",
  "Discipline wint van motivatie.",
  "Sterk word je niet per ongeluk.",
  "Kleine stappen, elke week weer.",
  "Rust is ook training.",
  "Consistency over intensity.",
  "Assess, don't guess.",
  "Every rep is a step towards progress.",
  "Earned dopamine > free dopamine.",
  "Move because you can, not because you should.",
]};
const THEMA_PRESETS=["#D9B44A","#E4572E","#D81E5B","#8E44AD","#00A8A8","#2ECC71"];
let instThema=null,instPrevTab="home";
function thZet(k,v){if(!instThema)return;instThema[k]=v;if(k==="color"){const h=document.getElementById("th-hex");if(h)h.value=v;}if(k==="font")instPaneel();else thPreviewRender();}
function thHex(v){v=(v||"").trim();if(/^#[0-9a-fA-F]{6}$/.test(v)){instThema.color=v;const c=document.getElementById("th-kleur");if(c)c.value=v;thPreviewRender();}}
function thPreset(k){instThema.color=k;instPaneel();}
function thQuote(i,v){if(instThema&&instThema.quotes[i]!=null)instThema.quotes[i]=v;thPreviewRender();}
function thQuoteBij(){instThema.quotes.push("");instPaneel();}
function thQuoteWeg(i){instThema.quotes.splice(i,1);instPaneel();}
function thPrev(t){instPrevTab=t;instPaneel();}
function thStandaard(){instThema=JSON.parse(JSON.stringify(THEMA_STD));instPaneel();}
// Kleur lichter/donkerder maken voor het verloop (zelfde idee als goldHi/goldDeep).
function thTint(hex,f){
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const t=v=>Math.max(0,Math.min(255,Math.round(f>0?v+(255-v)*f:v*(1+f))));
  return "#"+[t(r),t(g),t(b)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
function thFontCss(){
  if(instThema.font==="vet")return "font-weight:900;letter-spacing:.4px";
  if(instThema.font==="smal")return "font-family:'Arial Narrow',Inter,sans-serif;letter-spacing:.2px;font-weight:700";
  return "font-weight:800;letter-spacing:.6px";
}
function thPreviewRender(){
  const host=document.getElementById("th-preview");if(!host||!instThema)return;
  const k=instThema.color,hi=thTint(k,.35),deep=thTint(k,-.35);
  const accent=instThema.gradient?("linear-gradient(135deg,"+hi+","+k+" 55%,"+deep+")"):k;
  const kop=thFontCss();
  const naam=(ME.profile.first_name||"Sporter");
  const quote=(instThema.quotes.find(q=>(q||"").trim())||"").trim();
  const bedrijf=(instCompany&&instCompany.name)||"Jouw gym";
  const logo=instCompany&&instCompany.logo_url;
  let scherm="";
  if(instPrevTab==="home"){
    scherm='<div style="display:flex;align-items:center;gap:10px"><span style="width:38px;height:38px;border-radius:50%;background:'+accent+';display:inline-flex;align-items:center;justify-content:center;color:#0E0E10;font-weight:800;font-size:12px">'+esc(avFotoText(ME.profile)||naam.slice(0,2).toUpperCase())+'</span>'+
      '<div><div style="font-size:15px;font-weight:800">Hi '+esc(naam)+',</div>'+(quote?'<div style="font-size:10.5px;color:#9A9A9E;font-style:italic">'+esc(quote)+'</div>':'')+'</div></div>'+
      '<div style="display:flex;align-items:center;gap:8px;margin:12px 0 8px"><span style="'+kop+';font-size:13px">17 JUL 2026</span><span style="font-size:9px;font-weight:800;color:#0E0E10;background:'+accent+';border-radius:99px;padding:2px 8px">Streak: 3 🔥</span></div>'+
      '<div style="display:flex;gap:5px;margin-bottom:12px">'+["13","14","15","16","17","18","19"].map((d,i)=>'<span style="flex:1;text-align:center;padding:6px 0;border-radius:9px;font-size:10.5px;font-weight:700;'+(i===4?("border:2px solid "+k+";color:"+k):"background:#17171A;color:#9A9A9E")+'">'+d+'</span>').join("")+'</div>'+
      '<div style="'+kop+';font-size:13px;margin-bottom:8px">JOUW DAILY RX</div>'+
      thWorkoutKaartHtml(k)+
      '<div style="background:'+accent+';border-radius:11px;text-align:center;padding:10px;color:#0E0E10;'+kop+';font-size:12px;margin-top:10px">WORKOUT AFRONDEN</div>';
  }else if(instPrevTab==="splash"){
    scherm='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px">'+
      '<span style="width:76px;height:76px;border-radius:50%;background:'+(logo?("url('"+esc(logo)+"') center/cover"):accent)+';display:inline-flex;align-items:center;justify-content:center;color:#0E0E10;font-weight:900;font-size:22px;border:3px solid '+k+'">'+(logo?'':esc(bedrijf.slice(0,2).toUpperCase()))+'</span>'+
      '<div style="'+kop+';font-size:17px">'+esc(bedrijf.toUpperCase())+'</div>'+
      '<div style="font-size:10.5px;color:#9A9A9E">Training · Coaching · Community</div>'+
      '<div style="width:44px;height:3px;border-radius:2px;background:'+accent+'"></div></div>';
  }else if(instPrevTab==="prog"){
    scherm='<div style="'+kop+';font-size:13px;margin-bottom:8px">PROGRAMMA · WEEK 3</div>'+
      thWorkoutKaartHtml(k)+
      '<div style="background:#17171A;border:1px solid rgba(255,255,255,.08);border-radius:13px;padding:11px;margin-top:9px">'+
        '<div style="font-size:12px;font-weight:800;color:'+k+'">D) WOD</div>'+
        '<div style="font-size:10.5px;color:#D8D7D4;margin-top:3px">3 × 4 min on / 1 min off<br>12 cal bike erg · 5-7 strict pull-ups</div></div>';
  }else if(instPrevTab==="mail"){
    // E-mail: zo ziet de ochtend-workoutmail eruit (mail-send gebruikt dezelfde
    // opbouw en sinds v5 ook de merkkleur van het thema).
    const blok=(kop,regels)=>'<div style="margin:6px 0;padding:7px 9px;border-left:3px solid '+k+';background:#1a1a1e;border-radius:0 7px 7px 0">'+
      '<div style="font-size:10.5px;font-weight:600;color:#f4f4f5">'+kop+'</div>'+
      '<div style="font-size:9.5px;line-height:1.5;color:#c9c9ce">'+regels+'</div></div>';
    scherm='<div style="border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:8px;margin-bottom:10px">'+
      '<div style="font-size:9.5px;color:#9A9A9E">Van: '+esc(bedrijf)+' &lt;coach@mail.yourprogram.nl&gt;</div>'+
      '<div style="font-size:11px;font-weight:800;margin-top:3px">Je workout voor vandaag · 17 juli 2026</div></div>'+
      '<div style="background:#0E0E10;border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:12px">'+
      '<div style="color:'+k+';font-size:13.5px;font-weight:800;margin-bottom:4px">Je workout voor vandaag</div>'+
      '<div style="font-size:9.5px;line-height:1.5;color:#c9c9ce;margin-bottom:8px">Goedemorgen '+esc(naam)+', dit staat er vandaag voor je klaar.</div>'+
      '<div style="background:#141417;border:1px solid #26262b;border-radius:10px;padding:9px 10px">'+
        '<div style="font-size:11.5px;font-weight:700;color:'+k+';margin-bottom:4px">Kracht + conditie</div>'+
        blok("A · Back Squat","5×5 reps @20X1 · rust 2 min")+
        blok("B · WOD","3 × 4 min on / 1 min off<br>12 cal bike erg · 5-7 strict pull-ups")+
      '</div>'+
      '<div style="font-size:8.5px;color:#8a919c;line-height:1.5;margin-top:9px">Je krijgt deze mail omdat je ‘Workout per e-mail’ hebt aangezet op je Profiel in de app.</div>'+
      '</div>';
  }else{
    // Bericht: de chat met de coach, in de themakleur; invoerbalk vast onderaan.
    const coachN=naamVan(ME.profile)||"Je coach";
    const bub=(mij,txt)=>'<div style="display:flex;justify-content:'+(mij?"flex-end":"flex-start")+';margin-bottom:7px"><span style="max-width:78%;padding:7px 10px;border-radius:13px;font-size:10.5px;line-height:1.45;'+(mij?("background:"+accent+";color:#0E0E10;border-bottom-right-radius:4px;font-weight:600"):"background:#1F1F23;border:1px solid rgba(255,255,255,.08);color:#F5F4F2;border-bottom-left-radius:4px")+'">'+esc(txt)+'</span></div>';
    scherm='<div style="display:flex;flex-direction:column;height:100%">'+
      '<div style="display:flex;align-items:center;gap:9px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:9px;margin-bottom:10px">'+
      '<span style="width:32px;height:32px;border-radius:50%;background:'+accent+';display:inline-flex;align-items:center;justify-content:center;color:#0E0E10;font-weight:800;font-size:11px">'+esc(avFotoText(ME.profile)||coachN.slice(0,2).toUpperCase())+'</span>'+
      '<div><div style="font-size:12.5px;font-weight:800">'+esc(coachN)+'</div><div style="font-size:9.5px;color:#9A9A9E">Jouw coach</div></div></div>'+
      '<div style="text-align:center;font-size:9px;color:#9A9A9E;margin-bottom:8px">Vandaag</div>'+
      bub(false,"Hoi! Hoe ging de training vandaag?")+
      bub(true,"Ging lekker, 100 kg gesquat 💪")+
      bub(false,"Sterk! Volgende week gaan we voor 102,5 kg.")+
      bub(true,"Ik stuur zo even mijn video mee.")+
      '<div style="display:flex;align-items:center;gap:7px;margin-top:auto;padding-top:10px">'+
        '<span style="flex:1;background:#1F1F23;border:1px solid rgba(255,255,255,.08);border-radius:99px;padding:8px 12px;font-size:10px;color:#9A9A9E">Typ een bericht…</span>'+
        '<span style="width:30px;height:30px;border-radius:50%;background:'+accent+';display:inline-flex;align-items:center;justify-content:center;color:#0E0E10;font-size:12px">➤</span></div></div>';
  }
  // Statusicoontjes (signaal/wifi/batterij) als kleine SVG's, zoals op een echte iPhone.
  const statIco='<svg width="15" height="10" viewBox="0 0 15 10" fill="#F5F4F2"><rect x="0" y="6" width="2.6" height="4" rx="0.8"/><rect x="4" y="4" width="2.6" height="6" rx="0.8"/><rect x="8" y="2" width="2.6" height="8" rx="0.8"/><rect x="12" y="0" width="2.6" height="10" rx="0.8"/></svg>'+
    '<svg width="14" height="10" viewBox="0 0 14 10" fill="#F5F4F2"><path d="M7 9.4 1.6 4.3a7.6 7.6 0 0 1 10.8 0Z"/></svg>'+
    '<svg width="21" height="10" viewBox="0 0 21 10" fill="none"><rect x="0.5" y="0.5" width="17" height="9" rx="2.5" stroke="#F5F4F2" opacity="0.5"/><rect x="2" y="2" width="12" height="6" rx="1.4" fill="#F5F4F2"/><path d="M19.5 3.5v3a1.8 1.8 0 0 0 0-3Z" fill="#F5F4F2" opacity="0.5"/></svg>';
  host.innerHTML='<div class="th-phone"><div class="th-screen2">'+
    '<div class="th-status"><span>13:37</span><span class="th-island"></span><span class="th-ico">'+statIco+'</span></div>'+
    '<div class="th-scherm">'+scherm+'</div>'+
    (instPrevTab==="mail"?"":'<div class="th-tabbar">'+["Home","Weekworkout","Chat","Profiel"].map((t,i)=>'<span style="flex:1;text-align:center;font-size:8.5px;font-weight:700;color:'+((instPrevTab==="msg"?i===2:i===0)?k:"#9A9A9E")+'">'+t+'</span>').join("")+'</div>')+
    '<div class="th-homebar"></div></div></div>';
}
function thWorkoutKaartHtml(k){
  return '<div style="background:#17171A;border:1px solid rgba(255,255,255,.08);border-left:4px solid '+k+';border-radius:13px;padding:11px">'+
    '<div style="font-size:13px;font-weight:800">A) Back Squat</div>'+
    '<div style="font-size:10.5px;color:#D8D7D4;margin-top:3px">5×5 reps @20X1 · rust 2 min</div>'+
    '<div style="background:#1F1F23;border-radius:9px;padding:7px 9px;margin-top:8px;font-size:10.5px;color:#9A9A9E">100 kg</div></div>';
}
async function thOpslaan(){
  const msg=document.getElementById("inst-msg");
  if(!/^#[0-9a-fA-F]{6}$/.test(instThema.color)){if(msg)msg.textContent="Kies een geldige kleur (bijv. #D9B44A).";return;}
  instThema.quotes=instThema.quotes.map(q=>(q||"").trim()).filter(Boolean);
  const{error}=await db.from("companies").update({theme:instThema}).eq("id",ME.profile.company_id);
  if(error){if(msg)msg.textContent=error.message||"Opslaan mislukt";return;}
  if(instCompany)instCompany.theme=instThema;
  toast("Thema opgeslagen. Sporters zien het bij de volgende keer openen van de app.");
  instPaneel();
}
async function instProfielOpslaan(){
  const vn=(document.getElementById("inst-vn").value||"").trim();
  const an=(document.getElementById("inst-an").value||"").trim();
  const bio=(document.getElementById("inst-bio").value||"").trim();
  const msg=document.getElementById("inst-msg");
  if(!vn||!an){if(msg)msg.textContent="Vul je voor- en achternaam in.";return;}
  const{data,error}=await db.from("profiles").update({first_name:vn,last_name:an,bio:bio||null}).eq("id",ME.user.id).select().single();
  if(error){if(msg)msg.textContent=error.message||"Opslaan mislukt";return;}
  Object.assign(ME.profile,data||{first_name:vn,last_name:an,bio:bio||null});
  // Bedrijfsnaam (alleen eigenaar/platform_admin; het veld is anders disabled)
  const bIn=document.getElementById("inst-bedrijf");
  if(bIn&&!bIn.disabled&&instCompany&&(bIn.value||"").trim()&&(bIn.value||"").trim()!==(instCompany.name||"")){
    const{error:cErr}=await db.from("companies").update({name:bIn.value.trim()}).eq("id",ME.profile.company_id);
    if(cErr){if(msg)msg.textContent=cErr.message||"Bedrijfsnaam opslaan mislukt";return;}
    instCompany.name=bIn.value.trim();
  }
  toast("Profiel opgeslagen");
  coachRenderSection(); // naam/avatar in de balk verversen
}
// E-mailadres wijzigen: Supabase stuurt bevestigingsmails naar oud én nieuw adres.
function instEmailStart(){
  const w=document.getElementById("inst-emailwissel");
  if(w)w.style.display=w.style.display==="none"?"":"none";
}
async function instEmailVerstuur(){
  const inp=document.getElementById("inst-email-nieuw");
  const msg=document.getElementById("inst-msg");
  const nieuw=(inp&&inp.value||"").trim();
  if(!/.+@.+\..+/.test(nieuw)){if(msg)msg.textContent="Vul een geldig e-mailadres in.";return;}
  const{error}=await db.auth.updateUser({email:nieuw});
  if(error){if(msg)msg.textContent=error.message||"Wijzigen mislukt";return;}
  if(msg)msg.textContent="";
  toast("Bevestigingsmails verstuurd. Het nieuwe adres geldt na bevestiging.");
}
// Bedrijfslogo uploaden (avatars-bucket, map {company_id}/logo/…).
async function instLogoUpload(input){
  const file=input.files&&input.files[0];input.value="";
  if(!file)return;
  if(!/^image\//.test(file.type||"")){toast("Kies een afbeelding");return;}
  if(file.size>5242880){toast("Afbeelding is te groot (max 5 MB)");return;}
  // Eerst passend maken (vierkant kader voor het logo)
  const snede=await fotoCrop(file,{rond:false});
  await instLogoZet(snede);
}
async function instLogoAanpassen(){
  const url=instCompany&&instCompany.logo_url;if(!url)return;
  const snede=await fotoCropVanUrl(url,{rond:false});
  await instLogoZet(snede);
}
async function instLogoZet(snede){
  if(!snede)return;
  const knop=document.getElementById("inst-logoknop");
  if(knop){knop.disabled=true;knop.textContent="Uploaden…";}
  const path=ME.profile.company_id+"/logo/"+crypto.randomUUID()+"."+snede.ext;
  const{error:upErr}=await db.storage.from("avatars").upload(path,snede.blob,{contentType:snede.type,upsert:false});
  if(upErr){toast(upErr.message||"Upload mislukt");if(knop){knop.disabled=false;knop.textContent="Logo uploaden";}return;}
  const{data:pub}=db.storage.from("avatars").getPublicUrl(path);
  const url=(pub&&pub.publicUrl)?pub.publicUrl:null;
  const oud=instCompany&&instCompany.logo_url;
  const{error}=await db.from("companies").update({logo_url:url}).eq("id",ME.profile.company_id);
  if(error){
    await db.storage.from("avatars").remove([path]); // geen wees-bestand achterlaten
    toast(error.message||"Opslaan mislukt");if(knop){knop.disabled=false;knop.textContent="Logo uploaden";}return;
  }
  if(instCompany)instCompany.logo_url=url;
  if(oud){const m=String(oud).split("/avatars/");if(m[1])db.storage.from("avatars").remove([decodeURIComponent(m[1])]);}
  toast("Logo bijgewerkt");
  instPaneel();
}
// Eigen profielfoto uploaden (zelfde bucket en pad-opbouw als bij een klant).
async function instFotoUpload(input){
  const file=input.files&&input.files[0];input.value="";
  if(!file)return;
  if(!/^image\//.test(file.type||"")){toast("Kies een afbeelding");return;}
  if(file.size>5242880){toast("Afbeelding is te groot (max 5 MB)");return;}
  // Eerst passend maken (zoomen/slepen) zodat de foto goed in het rondje valt
  const snede=await fotoCrop(file,{rond:true});
  await instFotoZet(snede);
}
// De huidige foto bijstellen zonder opnieuw te uploaden
async function instFotoAanpassen(){
  if(!ME.profile.avatar_url)return;
  const snede=await fotoCropVanUrl(ME.profile.avatar_url,{rond:true});
  await instFotoZet(snede);
}
async function instFotoZet(snede){
  if(!snede)return;
  const knop=document.getElementById("inst-fotoknop");
  if(knop)knop.disabled=true;
  const path=(ME.profile.company_id||"x")+"/"+ME.user.id+"/"+crypto.randomUUID()+"."+snede.ext;
  const{error:upErr}=await db.storage.from("avatars").upload(path,snede.blob,{contentType:snede.type,upsert:false});
  if(upErr){toast(upErr.message||"Upload mislukt");if(knop)knop.disabled=false;return;}
  const{data:pub}=db.storage.from("avatars").getPublicUrl(path);
  const url=(pub&&pub.publicUrl)?pub.publicUrl:null;
  const oud=ME.profile.avatar_url;
  const{data,error}=await db.from("profiles").update({avatar_url:url}).eq("id",ME.user.id).select().single();
  if(error){
    await db.storage.from("avatars").remove([path]); // geen wees-bestand achterlaten
    toast(error.message||"Opslaan mislukt");if(knop)knop.disabled=false;return;
  }
  Object.assign(ME.profile,data||{avatar_url:url});
  if(oud){const m=String(oud).split("/avatars/");if(m[1])db.storage.from("avatars").remove([decodeURIComponent(m[1])]);}
  toast("Profielfoto bijgewerkt");
  coachRenderSection();
}
async function instWachtwoordOpslaan(){
  const oud=document.getElementById("inst-pw0").value||"";
  const a=document.getElementById("inst-pw1").value||"";
  const b=document.getElementById("inst-pw2").value||"";
  const msg=document.getElementById("inst-msg");
  const knop=document.getElementById("inst-pwknop");
  if(!oud){if(msg)msg.textContent="Vul eerst je huidige wachtwoord in.";return;}
  if(a.length<8){if(msg)msg.textContent="Het nieuwe wachtwoord moet minimaal 8 tekens zijn.";return;}
  if(a!==b){if(msg)msg.textContent="De twee nieuwe wachtwoorden zijn niet gelijk.";return;}
  if(a===oud){if(msg)msg.textContent="Het nieuwe wachtwoord is hetzelfde als het huidige.";return;}
  if(knop){knop.disabled=true;knop.textContent="Bezig…";}
  // Eerst het huidige wachtwoord controleren (zoals CoachRx), dan pas wijzigen.
  const{error:oudErr}=await db.auth.signInWithPassword({email:ME.user.email,password:oud});
  if(oudErr){
    if(msg)msg.textContent="Je huidige wachtwoord klopt niet.";
    if(knop){knop.disabled=false;knop.textContent="Wachtwoord wijzigen";}
    return;
  }
  const{error}=await db.auth.updateUser({password:a});
  if(knop){knop.disabled=false;knop.textContent="Wachtwoord wijzigen";}
  if(error){if(msg)msg.textContent=error.message||"Wijzigen mislukt";return;}
  document.getElementById("inst-pw0").value="";document.getElementById("inst-pw1").value="";document.getElementById("inst-pw2").value="";
  if(msg)msg.textContent="";
  toast("Wachtwoord gewijzigd");
}
