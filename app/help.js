// app/help.js: de Help/handleiding voor coaches (route #help, vraagteken in de
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
       tekst:"In de zwarte balk bovenin schakel je tussen alle onderdelen: Klanten, Bibliotheek, Blog, YP Showdown, Berichten en Data. Rechts daarvan zit het vraagteken dat deze handleiding opent, het belletje met je meldingen, en je eigen avatar met Instellingen en Uitloggen. Daaronder staan links de blokken over je klanten en rechts je eigen cijfers, je taken en de YP Showdown."},
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
      {titel:"YP Showdown",
       img:"img/help/dashboard-07-weekworkout.png",
       tekst:"De laatste YP Showdown die live staat, met het aantal deelnemers en hoeveel scores er vandaag binnenkwamen. Met de knop ga je naar het volledige leaderboard."},
    ],
  },
  {
    id:"klanten",icoon:"i-user",titel:"Klanten",
    intro:"Je klantenlijst. Hier nodig je nieuwe klanten uit, geef je tags, exporteer je gegevens en archiveer je mensen die stoppen.",
    stappen:[
      {titel:"De klantenlijst",
       img:"img/help/klanten-01-overzicht.png",
       tekst:"1 vier cijfers over je hele klantenbestand: hoeveel actieve klanten je hebt, de gemiddelde compliance (met een keuzelijst voor de periode), de consult-rate over 30 dagen en hoeveel klanten je deze week gesproken hebt. 2 het zoekveld gaat over de naam. 3 met Kies tag filter je de lijst op een of meer tags. 4 hier nodig je een nieuwe klant uit. 5 schakel tussen je actieve klanten en je archief. In de tabel staat per klant zijn eerstvolgende of gemiste workout, zijn compliance en zijn tags; klik op een rij om hem te openen."},
      {titel:"Een klant uitnodigen",
       img:"img/help/klanten-02-toevoegen.png",
       tekst:"Klik op + Klant toevoegen, vul naam en e-mailadres in en kies de coach. Iedereen die je hier uitnodigt wordt een 1-op-1 klant met zijn eigen programma; een gratis blog-lid nodig je uit bij Blog. Als je op Uitnodiging aanmaken klikt, wordt het account meteen aangemaakt en krijgt je klant een mail met drie stappen: wachtwoord kiezen, app installeren, inloggen. Hij staat direct in je lijst met het label Uitnodiging open, dus je kunt al voor hem programmeren."},
      {titel:"Werken met tags",
       img:"img/help/klanten-03-tags.png",
       tekst:"Tags zijn labels die je zelf maakt, bijvoorbeeld Wedstrijd, Blessure of Maandag. Klik op de + achter een klant en vink een tag aan of uit. Onderin het venstertje maak je een nieuwe tag met een eigen kleur; die staat daarna meteen in de tag-kiezer bovenaan. Filteren doe je met Kies tag naast het zoekveld: elke tag die je aanvinkt komt eronder als chip te staan en die haal je met het kruisje weer weg. Kies je twee tags, dan blijven alleen de klanten over die ze beide hebben, dus je filter wordt smaller in plaats van breder. Zolang er een tag aanstaat, krijgt elke rij een rondje om af te strepen terwijl je programmeert. Met Tags beheren hernoem je tags, geef je ze een andere kleur of gooi je ze weg."},
      {titel:"Het menu achter een klant",
       img:"img/help/klanten-04-menu.png",
       tekst:"De drie puntjes achter elke rij openen een menu: profiel bewerken, het intakeformulier openen, een bericht sturen, een wachtwoordlink sturen, de klant overzetten naar een andere coach, of archiveren. Archiveren haalt de klant uit alle lijsten en tellingen, maar bewaart alles. Via de tab Archief kun je hem terughalen."},
      {titel:"Exporteren naar een bestand",
       img:"img/help/klanten-05-export.png",
       tekst:"Met Exporteren maak je een CSV-bestand dat je in Excel of Google Sheets opent. Je vinkt zelf aan welke kolommen erin komen, van naam en e-mail tot compliance en de max lifts. Het bestand bevat de klanten die je op dat moment ziet, dus filter eerst als je maar een deel nodig hebt."},
    ],
  },
  {
    id:"klant",icoon:"i-cal",titel:"Klant-scherm & programmeren",
    intro:"Het hart van de app. Hier zie je de kalender van één klant, maak je zijn workouts en houd je zijn dossier bij.",
    stappen:[
      {titel:"Zo ziet het klant-scherm eruit",
       img:"img/help/klant-01-scherm.png",
       tekst:"Links het dossier van deze klant: zijn gegevens bovenaan, daaronder de panelen (assessment, metrics, notities, doelen en de rest). Rechts de kalender die gewoon doorloopt, maand na maand. Met de pijl linksonder klap je de zijbalk in tot een smalle iconenkolom als je meer ruimte wilt."},
      {titel:"De bedieningsbalk van de kalender",
       img:"img/help/klant-02-kalenderbalk.png",
       tekst:"1 blader per maand. 2 spring terug naar vandaag. 3 kies dag-, week- of maandweergave. 4 wissel naar een andere klant zonder terug te gaan naar de lijst; ben je eigenaar, dan kun je met de chip ernaast ook van coach wisselen. 5 verberg de gelogde scores, handig als je alleen de programmering wilt zien. 6 exporteer de kalender als PDF."},
      {titel:"Een dag vullen",
       img:"img/help/klant-03-dagmenu.png",
       tekst:"Klik op een lege dag en je krijgt vier keuzes. Workout opent de bouwer zodat je zelf iets maakt. Rustdag zet de dag dicht. Programma opent je templates en eerdere YP Showdowns om er een in te voegen. Plakken zet een workout die je eerder kopieerde op deze dag."},
      {titel:"De workout-bouwer",
       img:"img/help/klant-04-bouwer.png",
       tekst:"1 typ de naam van de oefening; de bibliotheek zoekt mee en koppelt zelf de demo-video. 2 zet in gewone tekst wat je klant moet doen: sets, reps, tempo en rust. 3 kies de kleur van het blok (geel is conditie, blauw kracht, paars gymnastics, rood intensief, groen herstel, oranje overig). 4 koppel of wissel de demo-video. 5 voeg een oefening, een conditioning-blok of een hele template toe. 6 opslaan, en de workout staat bij je klant in de app."},
      {titel:"Kaarten kopiëren, slepen en verwijderen",
       img:"img/help/klant-05-kaart.png",
       tekst:"Beweeg met de muis over een kaart en er verschijnen knopjes. 1 het vinkje selecteert de kaart; selecteer er meerdere en kopieer of verwijder ze in één keer. 2 bewerken, of scores invoeren als de dag al geweest is. 3 sleep de workout naar een andere dag. 4 kopiëren naar een andere dag, waarbij de afstand tussen meerdere dagen bewaard blijft. 5 verwijderen."},
      {titel:"Zelf scores invoeren",
       img:"img/help/klant-06-scores.png",
       tekst:"Bij personal training, of als je klant het loggen vergeet, vul je de scores zelf in. Klik op het potloodje van een kaart op vandaag of een dag die al geweest is. Je krijgt per onderdeel een veld; leeg laten betekent nog niet gelogd. Met het rode kruis markeer je een onderdeel als gemist."},
      {titel:"De panelen in de zijbalk",
       img:"img/help/klant-07-panelen.png",
       tekst:"Elk kopje in de zijbalk opent een paneel over deze klant. Dit is Metrics & 1RM: 1 bekijk de structural balance, 2 voeg een meting toe, 3 klap een groep open om de waarden per oefening te zien en bij te werken. De andere panelen werken hetzelfde: assessment, doelen, planning, notities, trainingsschema, prioriteiten en materiaal. Notities, planning en consults zijn alleen voor coaches; je klant ziet die nooit."},
    ],
  },
  {
    id:"bibliotheek",icoon:"i-book",titel:"Bibliotheek & programma's",
    intro:"Alles wat je hergebruikt: video's van oefeningen, vaste warming-ups en workouts, de benchmark-catalogus en complete programma's van meerdere weken.",
    stappen:[
      {titel:"Oefeningen met demo-video",
       img:"img/help/bibliotheek-01-oefeningen.png",
       tekst:"De videobibliotheek met ruim vierduizend oefeningen. Zoek op naam of tag, en klik op YouTube om de video te bekijken. Als je in de bouwer een oefening typt, pakt de app de video hiervandaan, zodat je klant in de app kan zien hoe de beweging hoort. Met + Oefening toevoegen zet je er zelf een bij."},
      {titel:"Warming-ups, workouts en cooldowns",
       img:"img/help/bibliotheek-02-templates.png",
       tekst:"Vaste blokken die je met één klik in een workout zet. De volledige tekst staat erbij, dus je ziet meteen wat je invoegt. Met de kleurenfilter vind je snel het soort blok dat je zoekt. Nieuwe templates maak je met de knop rechtsboven, of je slaat iets op vanuit de bouwer."},
      {titel:"Benchmarks",
       img:"img/help/bibliotheek-03-benchmarks.png",
       tekst:"De officiële omschrijvingen van de bekende workouts: alle CrossFit Open-onderdelen vanaf 2011, de Quarterfinals, de Girls en de Hero-workouts. Filter op categorie, jaar, format of divisie. Handig als je een benchmark wilt herhalen en de tekst exact goed wilt hebben."},
      {titel:"Programma's van meerdere weken",
       img:"img/help/bibliotheek-04-programmas.png",
       tekst:"Een programma is een blok van meerdere weken dat je een keer bouwt en daarna aan klanten toewijst. Klik op een programma om de weken te vullen; elke week heeft zeven dagen en per dag bouw je de workout zoals bij een klant. Met Programma toewijzen kies je een klant en een startdatum, en dan worden de workouts op zijn kalender gezet. Via Beheer toewijzingen zie je wie het programma volgt en kun je het vanaf vandaag terugdraaien. Staat er een slotje bij een programma, dan mag je het wel bekijken maar niet aanpassen: dat programma is van een collega. Een beheerder kan je er rechten op geven."},
    ],
  },
  {
    id:"blog",icoon:"i-clip",titel:"Blog",
    intro:"Blogprogramma's zijn doorlopende programma's voor je online leden. Ze volgen er één en zien elke dag de workout in hun app.",
    stappen:[
      {titel:"Je blogprogramma's",
       img:"img/help/blog-01-programmas.png",
       tekst:"Elk programma heeft een naam, een korte omschrijving, een type en een prijs die je alleen laat zien (betalen loopt nog buiten de app om). De kolom Klanten telt hoeveel leden het volgen. Klik op een programma om de week te vullen. Met + Klant uitnodigen zet je hier een gratis blog-lid klaar; staat er een programma open, dan volgt hij dat programma direct."},
      {titel:"De week vullen",
       img:"img/help/blog-02-week.png",
       tekst:"Je ziet één week van maandag tot zondag, met brede kolommen zodat de hele workout leesbaar is. Blader met de pijltjes of spring terug met Vandaag. Klik op + Toevoegen in een dag en je krijgt hetzelfde dag-menu als bij een klant. Met Leden koppelen kies je wie dit programma volgt; een lid volgt er één tegelijk."},
    ],
  },
  {
    id:"week",icoon:"i-fist",titel:"YP Showdown & leaderboard",
    intro:"De YP Showdown is de enige workout die iedereen doet: je betalende klanten én de gratis blog-leden. Daar hoort een gedeeld leaderboard bij.",
    stappen:[
      {titel:"De YP Showdowns",
       img:"img/help/week-01-lijst.png",
       tekst:"Elke YP Showdown staat als kaart onder elkaar, de nieuwste bovenaan. Met + Nieuwe YP Showdown maak je er een: naam, de workout-tekst met Rx en scaled, en het scoretype (tijd, rondes plus reps, reps, gewicht of vrije tekst). Hij staat direct live. Met de deel-link stuur je hem naar je leden."},
      {titel:"Het leaderboard lezen",
       img:"img/help/week-02-leaderboard.png",
       tekst:"De scores staan gesplitst op mannen, vrouwen en Rx of scaled, en zijn gesorteerd op het scoretype dat je koos. Per regel zie je de naam, de score en of iemand 1-op-1 klant of blog-lid is. 3 is de fist-bump ('goed gedaan'), 4 zijn de reacties. Alleen scores die een lid zelf op openbaar zet komen hier; privé-scores ziet alleen zijn eigen coach."},
    ],
  },
  {
    id:"berichten",icoon:"i-chat",titel:"Berichten & groepschats",
    intro:"Eén doorlopend gesprek per klant, plus groepen als je meerdere mensen tegelijk wilt bereiken.",
    stappen:[
      {titel:"Gesprekken en groepen",
       img:"img/help/berichten-01-overzicht.png",
       tekst:"Links al je gesprekken met de laatste regel eronder en een teller bij ongelezen berichten; klanten zonder berichten staan onderaan. Klik op een naam en het gesprek opent rechts, met het invoerveld onderaan (enter is versturen). Nieuwe berichten komen er live in. Met + Groepschat maak je een groep met meerdere leden, bijvoorbeeld voor een wedstrijdteam. Als coach zie je je eigen klanten; ben je eigenaar, dan zie je alle gesprekken en kun je op coach filteren."},
    ],
  },
  {
    id:"data",icoon:"i-target",titel:"Data",
    intro:"Cijfers om mee te programmeren: de krachtwaarden van je atleten, wat er op wedstrijden gevraagd wordt, en de scores uit de CrossFit Open.",
    stappen:[
      {titel:"Atleten",
       img:"img/help/data-01-atleten.png",
       tekst:"Hier houd je de testresultaten van je atleten bij: liften, benchmarks en lichaamsgewicht. Met de knoppen kies je het hele team, één atleet, een vergelijking tussen atleten of de ranglijst. Een atleet die je aan een klant koppelt, pakt zijn 1RM's automatisch uit zijn dossier."},
      {titel:"Wedstrijden",
       img:"img/help/data-02-wedstrijden.png",
       tekst:"Bijna duizend workouts van de Benelux-wedstrijden, van Amsterdam Throwdown tot Marbella. Bovenin schakel je tussen het overzicht, de losse workouts en zelf invoeren. Met de filters kies je wedstrijd, jaar, kwalificatie of finale, divisie en structuur. Het overzicht laat zien wat er echt getest wordt: welke bewegingen, welke tijdsdomeinen en hoe zwaar. Zo weet je wat je moet programmeren voor een atleet die meedoet."},
      {titel:"CrossFit Open",
       img:"img/help/data-03-open.png",
       tekst:"De volledige omschrijving van elk Open-onderdeel vanaf 2011, met de top-tien scores van de wereld erbij. Kies het jaar en mannen of vrouwen. De Analyse-knop rekent over alle jaren heen uit welke bewegingen en formats het vaakst terugkomen."},
    ],
  },
  {
    id:"instellingen",icoon:"i-gear",titel:"Instellingen",
    intro:"Je eigen profiel, je wachtwoord, de huisstijl en welke meldingen je wilt krijgen. Je opent het via je avatar rechtsboven.",
    stappen:[
      {titel:"Je profiel",
       img:"img/help/instellingen-01-profiel.png",
       tekst:"1 links staan zes pagina's: profiel, wachtwoord, thema, consultatielink, notificaties en partners. 2 met het potloodje op je foto upload je een profielfoto; die zien je klanten in de app en in de chat. Vul ook Over jou in, dat oogt vertrouwd. Ben je eigenaar, dan pas je hier ook de bedrijfsnaam en het logo aan. 3 vergeet niet op te slaan. Bij Thema kies je de merkkleur, bij Notificaties zet je per soort aan of je een melding in de app en een mail wilt."},
    ],
  },
  {
    id:"app",icoon:"i-walk",titel:"De sporter-app",
    intro:"Je klant werkt niet in dit dashboard maar in de YourProgram-app op zijn telefoon. Onderin die app zitten vier tabbladen: Home, YP Showdown, Chat en Profiel. Alles wat hij daar logt, komt meteen bij jou binnen. Goed om te weten wat hij ziet, dan kun je hem er ook doorheen praten.",
    stappen:[
      {titel:"Home: de dag van je klant",
       img:"img/help/app-01-home.png",telefoon:true,
       tekst:"1 de weekstrip: een puntje op een dag waarop een programma staat, een vinkje op een afgeronde dag, een kruis op een gemiste dag en een ring om vandaag. Je klant tikt op een dag om terug of vooruit te kijken, en veegt over de strip om een week terug of vooruit te bladeren. 2 met Start workout gaat hij loggen. 3 elk onderdeel staat als kaart met de volledige tekst die jij programmeerde; heb je een demo-video gekoppeld, dan zit die er meteen bij. Jouw notitie bij de workout staat bovenaan in het grijze briefje. Scrolt hij helemaal naar beneden, dan vindt hij daar Reacties: het gesprek over déze workout, los van de gewone chat."},
      {titel:"Zo logt je klant zijn score",
       img:"img/help/app-02-loggen.png",telefoon:true,
       tekst:"Na Start workout gaat hij per onderdeel door de dag heen, met bovenin de teller (hier 2 van 5). 1 het invoerveld staat al goed: hier vraagt de app om een gewicht, bij een metcon om rondes of een tijd. 2 met + Notitie schrijft hij erbij hoe het ging. 3 Opslaan zet het onderdeel op voltooid. 4 niet gedaan? Dan Gemist, zodat jij het ziet in plaats van dat de dag leeg blijft. Boven het veld zitten nog Demo-video, Historie (wat deed ik vorige keer) en % voor een percentage van zijn 1RM."},
      {titel:"De YP Showdown en het leaderboard",
       img:"img/help/app-03-weekworkout.png",telefoon:true,
       tekst:"Alleen bij de YP Showdown is er een leaderboard; gewone workouts blijven privé tussen jou en je klant. 1 hier logt hij zijn score, kiest hij Rx of scaled, en zet hij zelf of de score openbaar mag. Privé betekent: alleen jij en hij zien hem. 2 iedereen kan filteren op Rx of scaled. 3 per score zie je de naam, of iemand 1-op-1 klant of blog-volger is, de notitie, en de duimpjes en reacties van anderen."},
      {titel:"Chat met jou",
       img:"img/help/app-04-chat.png",telefoon:true,
       tekst:"1 dit is precies dezelfde chat als bij Berichten in je dashboard: wat jij daar typt, komt hier binnen. Boven het gesprek staat jouw naam en je profielfoto, dus zet die in Instellingen goed. Je klant ziet direct wie hem antwoordt."},
      {titel:"Profiel en zijn eigen gegevens",
       img:"img/help/app-05-profiel.png",telefoon:true,
       tekst:"1 zijn tellers: afgeronde workouts en de streak in weken. 2 bij Metingen en PR's ziet hij dezelfde cijfers als jij in het zijpaneel van het klant-scherm; hij mag zelf een meting toevoegen. Daaronder staan Timers, Voortgangsfoto's, het intakeformulier, materiaal, trainingsschema en doelen: allemaal dezelfde gegevens die jij ook ziet. Nog verder naar beneden zet hij aan dat hij zijn workout elke ochtend per mail krijgt, en maakt hij de letters in de hele app groter, handig voor wie het scherm klein vindt."},
      {titel:"Zelf meekijken op je telefoon",
       img:"img/help/app-06-coachweergave.png",telefoon:true,
       tekst:"Ben je zelf coach, dan staat onder Profiel de knop Wissel naar coach. 1 je ziet je atleten met per persoon wat er vandaag nog open staat; groen betekent dat alles gelogd is. Tik op een atleet en je komt in zijn week, waar je scores kunt invullen (handig bij personal training) en kleine dingen kunt aanpassen. 2 met Naar atleet ga je terug naar je eigen programma. Het echte programmeerwerk doe je op de computer, in dit dashboard."},
    ],
  },
];

// Het vraagteken in de balk rechtsboven (naast het belletje). Klikken opent een
// klein menu: de handleiding, iets melden, en voor beheerders de binnengekomen
// meldingen (zie app/meldingen.js).
function helpKnopHtml(){
  const aan=coachSection==="help"||coachSection==="meldingen";
  const admin=typeof myRole==="function"&&myRole()==="platform_admin";
  return '<div class="avwrap">'+
    '<button class="belbtn'+(aan?" on":"")+'" title="Help en meldingen" onclick="helpMenuToggle(event)"><svg class="i"><use href="#i-help"/></svg></button>'+
    '<div class="avmenu" id="helpmenu">'+
      '<button onclick="helpOpen()"><svg class="i sm-i"><use href="#i-help"/></svg> Handleiding</button>'+
      '<button onclick="meldOpen()"><svg class="i sm-i"><use href="#i-chat"/></svg> Iets melden</button>'+
      (admin?'<button onclick="coachGo(\'meldingen\')"><svg class="i sm-i"><use href="#i-doc"/></svg> Binnengekomen meldingen</button>':'')+
    '</div></div>';
}
function helpMenuToggle(ev){
  ev.stopPropagation();
  const m=document.getElementById("helpmenu");if(m)m.classList.toggle("show");
}
document.addEventListener("click",e=>{
  if(!e.target.closest(".avwrap")){const m=document.getElementById("helpmenu");if(m)m.classList.remove("show");}
});
function helpOpen(hoofdstuk){
  const hm=document.getElementById("helpmenu");if(hm)hm.classList.remove("show");
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
    (s.img?'<figure class="helpshot'+(s.telefoon?" telefoon":"")+'" onclick="helpZoom(\''+esc(s.img)+'\')" title="Klik om te vergroten">'+
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
      :'<div class="csoon">Dit hoofdstuk schrijven we binnenkort.</div>');
}

// Screenshot groot bekijken
function helpZoom(src){
  let o=document.getElementById("helpzoom");
  if(!o){o=document.createElement("div");o.id="helpzoom";o.onclick=()=>o.classList.remove("show");document.body.appendChild(o);}
  o.innerHTML='<span class="vx">&times;</span><img src="'+esc(src)+'" alt="">';
  o.classList.add("show");
}
