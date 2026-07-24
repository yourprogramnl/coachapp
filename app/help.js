// app/help.js — de Help/handleiding voor coaches (route #help, vraagteken in de
// balk rechtsboven). Links de hoofdstukken, rechts de stappen: per stap een
// screenshot met markeringen plus korte uitleg. Het zoekveld bovenaan filtert
// door alle titels en teksten van alle hoofdstukken heen.
// Nieuw hoofdstuk toevoegen = een blok bijzetten in HELP_HOOFDSTUKKEN.
// De screenshots staan in img/help/ en worden gemaakt met de mock-database,
// dus er staan nooit echte klantgegevens op.
let helpTab="dashboard",helpZoek="";

const HELP_HOOFDSTUKKEN=[
  {
    id:"dashboard",icoon:"i-chart",titel:"Dashboard",
    intro:"Je startscherm. Hier zie je in één blik welke klanten aandacht nodig hebben, wat er de afgelopen dagen gelogd is en wat er nog op je eigen lijstje staat.",
    stappen:[
      {titel:"Zo is het dashboard opgebouwd",
       img:"img/help/dashboard-01-overzicht.png",
       tekst:"In de zwarte balk bovenin schakel je tussen alle onderdelen: Klanten, Bibliotheek, Blog, Weekworkout, Berichten en Data. Rechts daarvan zit het vraagteken dat deze handleiding opent, het belletje met je meldingen, en je eigen avatar met Instellingen en Uitloggen. Daaronder staan links de blokken over je klanten en rechts je eigen cijfers, je taken en de weekworkout."},
      {titel:"Aandacht nodig",
       img:"img/help/dashboard-02-aandacht.png",
       tekst:"Hier staan de klanten waar iets mee is: een workout die klaarstaat maar nog niet gedaan is, of een lage compliance over de laatste 30 dagen. Met de knopjes bovenin filter je op één signaal. Het blauwe label zegt waarom iemand in de lijst staat. Rechts op de rij stuur je meteen een bericht of spring je naar de programmering. Klik op de naam om de klant helemaal te openen."},
      {titel:"Een klant even wegzetten",
       img:"img/help/dashboard-03-verbergen.png",
       tekst:"Weet je al dat iemand op vakantie is? Klik op de drie puntjes achter de rij en verberg de klant tot morgen, tot volgende week of tot volgende maand. Hij verdwijnt uit dit blok en komt daarna vanzelf terug. Onder de lijst zie je hoeveel klanten je verborgen hebt, met een link om ze weer te tonen."},
      {titel:"Activiteit van je klanten",
       img:"img/help/dashboard-04-feed.png",
       tekst:"Elke gedane workout komt hier als kaart voorbij: wie het was, wanneer, en hoeveel onderdelen af zijn. Onder elk onderdeel staat de score die je klant zelf invulde. Klopt er iets niet, dan zet je het met het vinkje op gemist en andersom. Het klokje ernaast opent de geschiedenis van die oefening bij deze klant. In het veld onderaan typ je een reactie die als chatbericht bij je klant aankomt."},
      {titel:"De feed filteren",
       img:"img/help/dashboard-05-feedfilter.png",
       tekst:"Met de keuzelijst naast Activiteit kijk je naar één klant of naar iedereen met een bepaalde tag. Daarnaast schakel je tussen Workouts en Check-ins. De feed laat zes kaarten zien; onderaan zit een knop om er telkens zes bij te laden."},
      {titel:"Mijn cijfers en Mijn taken",
       img:"img/help/dashboard-06-cijfers-taken.png",
       tekst:"Bij Mijn cijfers blader je met de stipjes langs drie kaarten: de compliance van je klanten, hoeveel klanten je deze week gesproken hebt, en hoeveel er aandacht vragen. De periode kies je zelf met de keuzelijst. Daaronder staat je eigen takenlijst. Met + Taak zet je er een bij, en met het vinkje streep je hem af."},
      {titel:"Workout van de week",
       img:"img/help/dashboard-07-weekworkout.png",
       tekst:"De laatste weekworkout die live staat, met het aantal deelnemers en hoeveel scores er vandaag binnenkwamen. Met de knop ga je naar het volledige leaderboard."},
    ],
  },
  {id:"klanten",icoon:"i-user",titel:"Klanten",intro:"Je klantenlijst: zoeken, tags, uitnodigen, exporteren en archiveren.",stappen:[]},
  {id:"klant",icoon:"i-cal",titel:"Klant-scherm & programmeren",intro:"De kalender van één klant en de workout-bouwer.",stappen:[]},
  {id:"bibliotheek",icoon:"i-book",titel:"Bibliotheek & programma's",intro:"Oefeningen, video's, templates en herbruikbare programma's.",stappen:[]},
  {id:"blog",icoon:"i-clip",titel:"Blog",intro:"Blogprogramma's voor je online leden.",stappen:[]},
  {id:"week",icoon:"i-fist",titel:"Weekworkout & leaderboard",intro:"De openbare weekworkout met scores, fist-bumps en reacties.",stappen:[]},
  {id:"berichten",icoon:"i-chat",titel:"Berichten & groepschats",intro:"Chatten met je klanten, los of in een groep.",stappen:[]},
  {id:"data",icoon:"i-target",titel:"Data",intro:"Atleten, CrossFit Open en wedstrijddata.",stappen:[]},
  {id:"instellingen",icoon:"i-gear",titel:"Instellingen",intro:"Je profiel, wachtwoord, thema en notificaties.",stappen:[]},
  {id:"app",icoon:"i-walk",titel:"De sporter-app",intro:"Wat je klant op zijn telefoon ziet, en hoe je zelf meekijkt vanaf je telefoon.",stappen:[]},
];

// Het vraagteken in de balk rechtsboven (naast het belletje).
function helpKnopHtml(){
  return '<button class="belbtn'+(coachSection==="help"?" on":"")+'" title="Help en handleiding" onclick="helpOpen()"><svg class="i"><use href="#i-help"/></svg></button>';
}
function helpOpen(hoofdstuk){
  if(hoofdstuk)helpTab=hoofdstuk;
  coachSection="help";setHash("help"+(hoofdstuk?"/"+hoofdstuk:""));coachRenderSection();
}
function helpGa(t){helpTab=t;helpZoek="";setHash("help/"+t);fillHelp();}

const helpHoofdstuk=id=>HELP_HOOFDSTUKKEN.find(h=>h.id===id)||HELP_HOOFDSTUKKEN[0];

function fillHelp(){
  const cp=document.getElementById("cpage");if(!cp)return;
  cp.innerHTML='<div class="helpkop"><div><h1 style="margin-bottom:4px">Handleiding</h1>'+
    '<div class="sm muted">Zoek een onderwerp of kies links een hoofdstuk. Bij elke stap staat een schermafbeelding met de knop erop aangewezen.</div></div>'+
    '<div class="helpzoek"><svg class="i"><use href="#i-search"/></svg>'+
    '<input id="help-zoek" placeholder="Zoeken in de handleiding…" value="'+esc(helpZoek)+'" oninput="helpZoekIn(this.value)">'+
    '<button class="helpzoek-x" onclick="helpZoekIn(\'\');document.getElementById(\'help-zoek\').value=\'\'" style="'+(helpZoek?"":"display:none")+'">&times;</button></div></div>'+
    '<div class="helpwrap"><div class="panel helpnav">'+
      HELP_HOOFDSTUKKEN.map(h=>'<button class="'+(helpTab===h.id&&!helpZoek?"on":"")+'" onclick="helpGa(\''+h.id+'\')">'+
        '<svg class="i sm-i"><use href="#'+h.icoon+'"/></svg> <span>'+esc(h.titel)+'</span>'+
        (h.stappen.length?'<span class="helpnav-n">'+h.stappen.length+'</span>':'<span class="helpnav-n soon">…</span>')+'</button>').join("")+
    '</div><div class="panel helppaneel" id="help-paneel"></div></div>';
  helpPaneel();
}

function helpZoekIn(v){
  helpZoek=v||"";
  const x=document.querySelector(".helpzoek-x");if(x)x.style.display=helpZoek?"":"none";
  document.querySelectorAll(".helpnav button").forEach(b=>b.classList.remove("on"));
  if(!helpZoek){const nav=document.querySelectorAll(".helpnav button");
    HELP_HOOFDSTUKKEN.forEach((h,i)=>{if(h.id===helpTab&&nav[i])nav[i].classList.add("on");});}
  helpPaneel();
}

// Alle stappen die op de zoekterm passen (titel, tekst of hoofdstuknaam).
function helpTreffers(){
  const t=helpZoek.trim().toLowerCase();if(!t)return[];
  const woorden=t.split(/\s+/);
  const uit=[];
  HELP_HOOFDSTUKKEN.forEach(h=>{
    h.stappen.forEach((s,i)=>{
      const hooi=(h.titel+" "+h.intro+" "+s.titel+" "+s.tekst).toLowerCase();
      if(woorden.every(w=>hooi.includes(w)))uit.push({h:h,s:s,i:i});
    });
  });
  return uit;
}

function helpStapHtml(s,nr,hoofdstukTitel){
  return '<div class="helpstap" id="helpstap-'+nr+'">'+
    '<div class="helpstap-kop"><span class="helpnr">'+nr+'</span><h2>'+esc(s.titel)+'</h2>'+
    (hoofdstukTitel?'<span class="helpbron">'+esc(hoofdstukTitel)+'</span>':'')+'</div>'+
    '<p>'+esc(s.tekst)+'</p>'+
    (s.img?'<figure class="helpshot" onclick="helpZoom(\''+esc(s.img)+'\')" title="Klik om te vergroten">'+
      '<img src="'+esc(s.img)+'" alt="'+esc(s.titel)+'" loading="lazy" onerror="this.parentNode.classList.add(\'ontbreekt\')">'+
      '<figcaption>Klik op de afbeelding om te vergroten</figcaption></figure>':'')+
    '</div>';
}

function helpPaneel(){
  const host=document.getElementById("help-paneel");if(!host)return;
  if(helpZoek.trim()){
    const tr=helpTreffers();
    host.innerHTML='<div class="helpintro"><b>'+tr.length+' '+(tr.length===1?"resultaat":"resultaten")+'</b> voor "'+esc(helpZoek.trim())+'"</div>'+
      (tr.length?tr.map((r,i)=>helpStapHtml(r.s,i+1,r.h.titel)).join("")
        :'<div class="csoon">Niets gevonden. Probeer een ander woord, bijvoorbeeld "workout", "tag" of "leaderboard".</div>');
    return;
  }
  const h=helpHoofdstuk(helpTab);
  host.innerHTML='<div class="helpintro"><h1 style="font-size:20px;margin:0 0 6px">'+esc(h.titel)+'</h1><div class="muted">'+esc(h.intro)+'</div></div>'+
    (h.stappen.length?h.stappen.map((s,i)=>helpStapHtml(s,i+1)).join("")
      :'<div class="csoon">Dit hoofdstuk schrijven we binnenkort. Het hoofdstuk Dashboard is al klaar.</div>');
}

// Screenshot groot bekijken
function helpZoom(src){
  let o=document.getElementById("helpzoom");
  if(!o){o=document.createElement("div");o.id="helpzoom";o.onclick=()=>o.classList.remove("show");document.body.appendChild(o);}
  o.innerHTML='<span class="vx">&times;</span><img src="'+esc(src)+'" alt="">';
  o.classList.add("show");
}
