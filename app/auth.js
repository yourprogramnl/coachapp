// app/auth.js — inloggen, account maken, uitloggen en het opstarten van de app.
// loadApp() bepaalt op basis van de rol welk scherm getoond wordt.
// Zodra de FORGE-app publiek in de App Store staat: hier de link invullen; het
// succes-scherm voor nieuwe leden toont dan een echte downloadknop.
const APP_STORE_URL="";
// Wachtwoord-eis, op één plek zodat de uitleg en de controle altijd gelijk lopen.
const PW_EIS="Minimaal 8 tekens, met minstens één letter en één cijfer.";
function pwProbleem(pw){
  if(pw.length<8)return "Het wachtwoord moet minimaal 8 tekens lang zijn.";
  if(!/[a-zA-Z]/.test(pw))return "Het wachtwoord moet minstens één letter bevatten.";
  if(!/[0-9]/.test(pw))return "Het wachtwoord moet minstens één cijfer bevatten.";
  return "";
}
let inviteRol="";
// Nieuwe uitnodigingsflow: het account is al door de coach aangemaakt en de
// klant hoeft alleen nog een wachtwoord te kiezen (invite-account Edge Function).
let inviteAccountBestaat=false;
let mode="in";
function setMode(m){
  mode=m;
  document.getElementById("tab-in").classList.toggle("on",m==="in");
  document.getElementById("tab-up").classList.toggle("on",m==="up");
  document.getElementById("go").textContent=m==="in"?"Inloggen":(inviteAccountBestaat?"Account activeren":"Account aanmaken");
  const p2=document.getElementById("pw2-veld");if(p2)p2.style.display=m==="up"?"":"none";
  const eis=document.getElementById("pw-eis");if(eis)eis.style.display=m==="up"?"":"none";
  setMsg("");
}
function setMsg(t,k){const e=document.getElementById("msg");e.textContent=t||"";e.className="msg "+(k||"");}

// Uitnodigingslink (?invite=TOKEN): e-mailadres en naam ophalen zodat de
// nieuwe klant alleen nog een wachtwoord hoeft te kiezen.
async function initInvite(token){
  if(!token)return;
  try{
    const{data}=await db.rpc("invite_info",{p_token:token});
    const inv=(data||[])[0];
    if(!inv||!inv.email){
      setMsg("Deze uitnodigingslink is verlopen of al gebruikt. Vraag je coach om een nieuwe uitnodiging.","err");
      return;
    }
    inviteAccountBestaat=!!inv.account_bestaat;
    setMode("up");
    inviteRol=inv.role||"lid";
    const em=document.getElementById("email");
    em.value=inv.email;em.readOnly=true;em.style.opacity=".65";
    const w=document.getElementById("inv-welkom");
    if(w){w.style.display="";w.textContent="Hoi"+(inv.first_name?" "+inv.first_name:"")+"! Kies een wachtwoord voor je account, daarna staat je programma voor je klaar.";}
  }catch(e){}
}

async function submitAuth(){
  const email=document.getElementById("email").value.trim(),pw=document.getElementById("pw").value;
  if(!email||!pw){setMsg("Vul e-mail en wachtwoord in.","err");return;}
  if(mode==="up"){
    const pw2=(document.getElementById("pw2")||{}).value||"";
    const fout=pwProbleem(pw);
    if(fout){setMsg(fout,"err");return;}
    if(pw!==pw2){setMsg("De wachtwoorden zijn niet gelijk.","err");return;}
  }
  document.getElementById("go").disabled=true;
  try{
    if(mode==="in"){const{error}=await db.auth.signInWithPassword({email,password:pw});if(error)throw error;}
    else{
      const tokNieuw=new URLSearchParams(location.search).get("invite");
      if(inviteAccountBestaat&&tokNieuw){
        // Nieuwe flow: het account bestaat al, we zetten alleen het gekozen
        // wachtwoord via de serverfunctie en loggen daarna direct in.
        const{data:wd,error:wErr}=await db.functions.invoke("invite-account",{body:{actie:"wachtwoord",token:tokNieuw,wachtwoord:pw}});
        if(wErr||(wd&&wd.error)){
          let t=(wd&&wd.error)||"";
          if(!t&&wErr&&wErr.context&&wErr.context.json){try{t=((await wErr.context.json())||{}).error||"";}catch(e2){}}
          throw new Error(t||"Activeren mislukt, probeer het opnieuw.");
        }
        const{error:inErr}=await db.auth.signInWithPassword({email,password:pw});
        if(inErr)throw inErr;
        localStorage.removeItem("invite_token");
        document.getElementById("go").disabled=false;
        toonAccountKlaar(true);
        return;
      }
      // Bewaar de invite-token ook lokaal: na e-mailbevestiging komt de gebruiker
      // zonder ?invite= terug en moet de koppeling alsnog gebeuren (zie loadApp).
      const tok=new URLSearchParams(location.search).get("invite");
      if(tok)localStorage.setItem("invite_token",tok);
      const redir=location.origin+location.pathname+(tok?"?invite="+tok:"");
      const{data,error}=await db.auth.signUp({email,password:pw,options:{emailRedirectTo:redir}});if(error)throw error;
      // Uitnodiging meteen inwisselen (er is direct een sessie): het account is
      // dan al volledig gekoppeld, óók als de klant hierna rechtstreeks de
      // FORGE-app op zijn telefoon pakt en de browser nooit meer opent.
      if(data&&data.session&&tok){
        try{await db.rpc("redeem_invite",{p_token:tok});localStorage.removeItem("invite_token");}catch(e){}
      }
      document.getElementById("go").disabled=false;
      toonAccountKlaar(!!(data&&data.session));
      return;
    }
    await loadApp();
  }catch(e){setMsg(e.message||"Er ging iets mis.","err");}
  document.getElementById("go").disabled=false;
}

// Duidelijk succes-scherm na het aanmaken. Is er meteen een sessie (geen
// e-mailbevestiging nodig), dan logt de knop direct in; anders eerst de
// bevestigingsmail.
function toonAccountKlaar(ingelogd){
  const kaart=document.querySelector("#login .card");if(!kaart)return;
  if(!kaart.dataset.orig)kaart.dataset.orig=kaart.innerHTML;
  // Een nieuw lid hoort in de FORGE-app op zijn telefoon te belanden, niet in
  // het web-scherm (verzoek Stefan, 21 juli); coaches loggen wél hier in.
  const lidNaarApp=ingelogd&&(inviteRol||"lid")==="lid";
  kaart.innerHTML='<div style="text-align:center;padding:8px 0">'+
    '<div style="font-size:40px;line-height:1;margin-bottom:10px">✅</div>'+
    '<h3 style="margin:0 0 8px">Account aangemaakt!</h3>'+
    (lidNaarApp
      ?'<div class="muted" style="font-size:13px;margin-bottom:14px;line-height:1.55">Je account is klaar. Nog één stap: download de <b>FORGE-app</b> op je telefoon en log daar in met dit e-mailadres en je wachtwoord.</div>'+
       (APP_STORE_URL
         ?'<a class="btn" style="width:100%;display:block;text-align:center;box-sizing:border-box;text-decoration:none" href="'+APP_STORE_URL+'">Download de FORGE-app</a>'
         :'<div class="muted" style="font-size:12.5px;line-height:1.5">De app staat binnenkort in de App Store; je coach stuurt je de downloadlink zodra hij klaarstaat.</div>')+
       '<button class="lnk" style="margin-top:12px" onclick="accountDoorgaan()">Of bekijk je programma alvast in de browser</button>'
      :ingelogd
      ?'<div class="muted" style="font-size:13px;margin-bottom:16px">Je account is klaar.</div>'+
       '<button class="btn" style="width:100%" onclick="accountDoorgaan()">Klik hier om in te loggen</button>'
      :'<div class="muted" style="font-size:13px;margin-bottom:16px;line-height:1.5">We hebben je een mail gestuurd om je e-mailadres te bevestigen. Klik op de link in die mail en log daarna in.</div>'+
       '<button class="btn" style="width:100%" onclick="accountTerug()">Naar inloggen</button>')+
    '</div>';
}
async function accountDoorgaan(){
  const kaart=document.querySelector("#login .card");
  if(kaart&&kaart.dataset.orig){kaart.innerHTML=kaart.dataset.orig;delete kaart.dataset.orig;}
  await loadApp();
}
function accountTerug(){
  const kaart=document.querySelector("#login .card");
  if(kaart&&kaart.dataset.orig){kaart.innerHTML=kaart.dataset.orig;delete kaart.dataset.orig;}
  setMode("in");
  setMsg("Bevestig eerst je e-mailadres via de mail, log daarna hier in.","ok");
}
function show(which){
  if(which!=="app"){
    document.body.classList.remove("coachmode");
    // zwevende lid-chat opruimen (anders blijft hij over het inlogscherm zweven)
    const b=document.getElementById("lidchat-btn");if(b)b.remove();
    const p=document.getElementById("chatpop");if(p)p.remove();
  }
  document.getElementById("login").classList.toggle("hidden",which!=="login");
  document.getElementById("app").classList.toggle("hidden",which!=="app");
}
async function signOut(){if(typeof msgBadgeStop==="function")msgBadgeStop();if(typeof stopNotifs==="function")stopNotifs();await db.auth.signOut();document.getElementById("pw").value="";show("login");}

// ---------- Wachtwoord vergeten / herstellen ----------
// De herstel-mail van Supabase komt terug op deze pagina met tokens in de
// #hash (type=recovery). detectSessionInUrl staat uit, dus we verwerken de
// hash zelf: sessie zetten en een formulier tonen voor een nieuw wachtwoord.
async function wachtwoordVergeten(){
  const email=(document.getElementById("email").value||"").trim();
  if(!email){setMsg("Vul eerst je e-mailadres in, dan sturen we je een herstel-link.","err");return;}
  const{error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  if(error){setMsg(error.message||"Versturen mislukt. Probeer het later opnieuw.","err");return;}
  setMsg("Als dit adres bij ons bekend is, staat er zo een e-mail met een herstel-link in je inbox.","ok");
}
async function checkRecovery(){
  const h=new URLSearchParams((location.hash||"").replace(/^#/,""));
  if(h.get("type")==="recovery"&&h.get("access_token")){
    const{error}=await db.auth.setSession({access_token:h.get("access_token"),refresh_token:h.get("refresh_token")||""});
    history.replaceState(null,"",location.pathname);
    if(error){show("login");setMsg("De herstel-link is verlopen. Vraag een nieuwe aan via 'Wachtwoord vergeten?'.","err");return true;}
    toonNieuwWachtwoord();
    return true;
  }
  if(h.get("error_description")){
    // Verlopen of al gebruikte link: nette melding, daarna gewoon doorstarten.
    history.replaceState(null,"",location.pathname);
    setMsg("Deze link is verlopen of al gebruikt. Vraag zo nodig een nieuwe aan via 'Wachtwoord vergeten?'.","err");
  }
  return false;
}
function toonNieuwWachtwoord(){
  show("login");
  const kaart=document.querySelector("#login .card");if(!kaart)return;
  if(!kaart.dataset.orig)kaart.dataset.orig=kaart.innerHTML;
  kaart.innerHTML='<h3 style="margin:0 0 6px">Nieuw wachtwoord instellen</h3>'+
    '<div class="muted" style="font-size:13px;margin-bottom:14px">Kies een nieuw wachtwoord voor je account. '+PW_EIS+'</div>'+
    '<div class="field"><label>Nieuw wachtwoord</label><input id="rc-pw1" type="password" placeholder="••••••••"></div>'+
    '<div class="field"><label>Herhaal nieuw wachtwoord</label><input id="rc-pw2" type="password" placeholder="••••••••"></div>'+
    '<button class="btn" id="rc-go" style="width:100%" onclick="nieuwWachtwoordOpslaan()">Opslaan en inloggen</button>'+
    '<div class="msg" id="rc-msg"></div>';
}
async function nieuwWachtwoordOpslaan(){
  const p1=document.getElementById("rc-pw1").value,p2=document.getElementById("rc-pw2").value;
  const m=document.getElementById("rc-msg");
  const zeg=(t,k)=>{m.textContent=t;m.className="msg "+(k||"");};
  const fout=pwProbleem(p1);
  if(fout){zeg(fout,"err");return;}
  if(p1!==p2){zeg("De wachtwoorden zijn niet gelijk.","err");return;}
  document.getElementById("rc-go").disabled=true;
  const{error}=await db.auth.updateUser({password:p1});
  if(error){zeg(error.message||"Opslaan mislukt. Probeer het opnieuw.","err");document.getElementById("rc-go").disabled=false;return;}
  const kaart=document.querySelector("#login .card");
  if(kaart&&kaart.dataset.orig){kaart.innerHTML=kaart.dataset.orig;delete kaart.dataset.orig;}
  toast("Wachtwoord aangepast, je bent ingelogd");
  await loadApp();
}

async function loadApp(){
  const{data:{user}}=await db.auth.getUser();
  if(!user){show("login");return;}
  const{data:profile}=await db.from("profiles").select("*").eq("id",user.id).single();
  ME={user,profile:profile||{role:"lid"}};
  // Na een bevestigde e-mailwijziging loopt profiles.email achter op het
  // auth-adres; stilletjes gelijktrekken.
  if(profile&&user.email&&profile.email!==user.email){
    try{await db.from("profiles").update({email:user.email}).eq("id",user.id);ME.profile.email=user.email;}catch(e){}
  }
  // Uitnodiging inwisselen: serverside koppeling aan bedrijf/rol/coach.
  // Token uit de link (?invite=TOKEN) of uit localStorage (bewaard bij account maken,
  // want de e-mailbevestigingslink komt zonder ?invite= terug).
  const inviteToken=new URLSearchParams(location.search).get("invite")||localStorage.getItem("invite_token");
  if(inviteToken&&!ME.profile.company_id){
    const{error}=await db.rpc("redeem_invite",{p_token:inviteToken});
    history.replaceState(null,"",location.pathname);
    localStorage.removeItem("invite_token");
    if(error)toast("Uitnodiging: "+(error.message||"inwisselen mislukt"));
    else{
      toast("Uitnodiging geaccepteerd, welkom!");
      const{data:p2}=await db.from("profiles").select("*").eq("id",user.id).single();
      if(p2)ME.profile=p2;
    }
  }else if(inviteToken){
    // Al gekoppeld aan een bedrijf: token opruimen zodat er geen foutmelding komt.
    history.replaceState(null,"",location.pathname);
    localStorage.removeItem("invite_token");
  }
  // Merkkleur van het bedrijf ook in het dashboard, als die schakelaar aanstaat
  if(ME.profile.company_id){
    try{
      const{data:comp}=await db.from("companies").select("theme").eq("id",ME.profile.company_id).single();
      pasDashKleur(comp&&comp.theme);
    }catch(e){}
  }
  const role=ME.profile.role||"lid";
  document.getElementById("roleLabel").textContent=ROLE_NL[role]||role;
  document.getElementById("avatar").textContent=(user.email||"?").slice(0,1).toUpperCase();
  show("app");
  const tb=document.querySelector(".topbar");if(tb)tb.style.display="";
  if(role==="lid"){
    if(ME.profile.archived){renderGearchiveerd();return;}
    renderLid();
  }
  else{const b=document.getElementById("lidchat-btn");if(b)b.remove();routeHash();}
}

// Gearchiveerd lid: alle data blijft bewaard, maar de app is op slot tot de
// coach het account weer activeert (Klanten > Archief > Terughalen).
function renderGearchiveerd(){
  const c=document.getElementById("content");
  c.innerHTML='<div class="cwrap" style="max-width:520px;margin:60px auto;text-align:center">'+
    '<div style="font-size:34px;margin-bottom:10px">📦</div>'+
    '<h2 style="margin:0 0 8px">Je account is niet actief</h2>'+
    '<div class="muted" style="line-height:1.6;margin-bottom:18px">Je account staat in het archief. Al je gegevens en resultaten blijven gewoon bewaard. Wil je weer starten? Neem dan contact op met je coach, die zet je account direct weer aan.</div>'+
    '<button class="btn" onclick="signOut()">Uitloggen</button></div>';
}
