// app/auth.js — inloggen, account maken, uitloggen en het opstarten van de app.
// loadApp() bepaalt op basis van de rol welk scherm getoond wordt.
let mode="in";
function setMode(m){mode=m;document.getElementById("tab-in").classList.toggle("on",m==="in");document.getElementById("tab-up").classList.toggle("on",m==="up");document.getElementById("go").textContent=m==="in"?"Inloggen":"Account maken";setMsg("");}
function setMsg(t,k){const e=document.getElementById("msg");e.textContent=t||"";e.className="msg "+(k||"");}
async function submitAuth(){
  const email=document.getElementById("email").value.trim(),pw=document.getElementById("pw").value;
  if(!email||!pw){setMsg("Vul e-mail en wachtwoord in.","err");return;}
  document.getElementById("go").disabled=true;
  try{
    if(mode==="in"){const{error}=await db.auth.signInWithPassword({email,password:pw});if(error)throw error;}
    else{
      // Bewaar de invite-token ook lokaal: na e-mailbevestiging komt de gebruiker
      // zonder ?invite= terug en moet de koppeling alsnog gebeuren (zie loadApp).
      const tok=new URLSearchParams(location.search).get("invite");
      if(tok)localStorage.setItem("invite_token",tok);
      const redir=location.origin+location.pathname+(tok?"?invite="+tok:"");
      const{error}=await db.auth.signUp({email,password:pw,options:{emailRedirectTo:redir}});if(error)throw error;
      setMsg("Account gemaakt. Mogelijk e-mail bevestigen, log daarna in.","ok");document.getElementById("go").disabled=false;setMode("in");return;
    }
    await loadApp();
  }catch(e){setMsg(e.message||"Er ging iets mis.","err");}
  document.getElementById("go").disabled=false;
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
async function signOut(){await db.auth.signOut();document.getElementById("pw").value="";show("login");}

async function loadApp(){
  const{data:{user}}=await db.auth.getUser();
  if(!user){show("login");return;}
  const{data:profile}=await db.from("profiles").select("*").eq("id",user.id).single();
  ME={user,profile:profile||{role:"lid"}};
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
  const role=ME.profile.role||"lid";
  document.getElementById("roleLabel").textContent=ROLE_NL[role]||role;
  document.getElementById("avatar").textContent=(user.email||"?").slice(0,1).toUpperCase();
  show("app");
  const tb=document.querySelector(".topbar");if(tb)tb.style.display="";
  if(role==="lid")renderLid();
  else{const b=document.getElementById("lidchat-btn");if(b)b.remove();routeHash();}
}
