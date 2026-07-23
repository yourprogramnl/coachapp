// app/coachrx-import.js — CoachRx-geschiedenis importeren op het klant-scherm
// (zijbalk > CoachRx-import). De coach kiest de kalender-PDF van CoachRx; de
// browser leest hem lokaal uit (pdf.js via CDN, het bestand verlaat de computer
// niet), toont eerst een controle-overzicht en schrijft daarna workouts +
// blokken + resultaten voor deze klant. Alles krijgt coach_notes
// "Geïmporteerd uit CoachRx" (herkenbaar en gericht terug te draaien).
// PR-kandidaten (1RM-testblokken met resultaat) zijn een aanvinklijst en gaan
// als metrics-rijen naar Metingen & PR's. Jaartallen staan niet in de export;
// die worden afgeleid uit de doorlopende datums en gecheckt op de weekdag.
const CRX_MERK="Geïmporteerd uit CoachRx";
let crxData=null; // {dagen, prs} van de laatst gekozen PDF

async function openCoachRx(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-coachrx");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-coachrx";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>CoachRx-import</h3><span class="sp-x" onclick="document.getElementById(\'sp-coachrx\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div class="sm" style="color:#8b919b;line-height:1.5;margin-bottom:12px">Kies de kalender-export (PDF) van deze klant uit CoachRx. De PDF wordt hier in je browser uitgelezen en verlaat je computer niet. Je ziet eerst een controle-overzicht; daarna importeer je de geschiedenis met één klik.</div>'+
    '<input type="file" id="crx-file" accept="application/pdf" style="display:none" onchange="crxGekozen(this)">'+
    '<button class="sp-btn" onclick="document.getElementById(\'crx-file\').click()">PDF kiezen…</button>'+
    '<div id="crx-uit" style="margin-top:14px"></div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  crxBestaandeCheck();
}

// Eerdere import voor deze klant? Dan een waarschuwing + opruimknop tonen.
async function crxBestaandeCheck(){
  const host=document.getElementById("crx-uit");if(!host)return;
  const{count}=await db.from("workouts").select("id",{count:"exact",head:true}).eq("client_id",calClient).eq("coach_notes",CRX_MERK);
  if(count>0){
    host.innerHTML='<div class="sp-dark" style="display:block;line-height:1.5">⚠️ Er staan al <b>'+count+'</b> geïmporteerde CoachRx-workouts bij deze klant. Nog een keer importeren geeft dubbele geschiedenis.'+
      '<br><button class="sp-btn ghost" style="width:auto;padding:8px 14px;margin-top:8px" onclick="crxEerdereWeg()">Eerdere import verwijderen</button></div>';
  }
}
async function crxEerdereWeg(){
  if(!confirm("Alle eerder geïmporteerde CoachRx-workouts (en de scores daarop) van deze klant verwijderen?"))return;
  const{error}=await db.from("workouts").delete().eq("client_id",calClient).eq("coach_notes",CRX_MERK);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  toast("Eerdere import verwijderd");
  const host=document.getElementById("crx-uit");if(host)host.innerHTML="";
  renderMonth();
}

// pdf.js één keer laden (CDN); UMD-build zet window.pdfjsLib klaar.
function crxPdfJs(){
  if(window.pdfjsLib)return Promise.resolve();
  return new Promise((ok,nee)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
    s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";ok();};
    s.onerror=()=>nee(new Error("pdf.js kon niet laden (internet?)"));
    document.head.appendChild(s);
  });
}

// PDF -> tekstregels: items per pagina groeperen op regelhoogte (y), binnen
// een regel op x sorteren. In de CoachRx-export springen GELOGDE resultaten
// een paar punten in t.o.v. het voorschrift (ontdekt 23 juli, Bianca's export:
// voorschrift op x23, resultaat op x26). Die regels krijgen een onzichtbare markering (CRX_RES_MARK)
// zodat de parser voorschrift en resultaat betrouwbaar kan scheiden, ook als
// de coach geen "*"-instructieregels gebruikt.
const CRX_RES_MARK="\u0001";
async function crxTekstUitPdf(file){
  await crxPdfJs();
  const doc=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  const rijen=[]; // {x, tekst}
  for(let p=1;p<=doc.numPages;p++){
    const tc=await (await doc.getPage(p)).getTextContent();
    const perY={};
    tc.items.forEach(it=>{const y=Math.round(it.transform[5]);(perY[y]=perY[y]||[]).push(it);});
    Object.keys(perY).map(Number).sort((a,b)=>b-a).forEach(y=>{
      const items=perY[y].sort((a,b)=>a.transform[4]-b.transform[4]);
      rijen.push({x:Math.round(items[0].transform[4]),tekst:items.map(i=>i.str).join("")});
    });
    const el=document.getElementById("crx-uit");
    if(el&&p%25===0)el.innerHTML='<div class="sm" style="color:#8b919b">PDF lezen… pagina '+p+"/"+doc.numPages+"</div>";
  }
  // Meest voorkomende beginpositie = het voorschrift-niveau; regels die daar
  // 2-6 punten rechts van beginnen zijn gelogde resultaten.
  const telling={};
  rijen.forEach(r=>{if(r.tekst.trim())telling[r.x]=(telling[r.x]||0)+1;});
  const basisX=Number((Object.entries(telling).sort((a,b)=>b[1]-a[1])[0]||[0])[0]);
  return rijen.map(r=>((r.x>=basisX+2&&r.x<=basisX+6)?CRX_RES_MARK:"")+r.tekst).join("\n");
}

// ---------- Parser (zelfde logica als coachrx-import/parse-coachrx.js) ----------
const CRX_WD={SUN:0,MON:1,TUE:2,WED:3,THU:4,FRI:5,SAT:6};
function crxParse(ruw){
  const NOISE=[/^CALENDAR: /i,/^COACH /i,/^EXERCISE RX:/i];
  const regels=ruw.split(/\r?\n/).map(r=>r.trim()).filter(r=>r&&!NOISE.some(p=>p.test(r)));
  const DAG_RE=/^(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{1,2})\/(\d{1,2})\s*(.*)$/;
  const BLOK_RE=/^([A-K]\d?)\.\s+(.+)$/;
  const dagen=[];let dag=null;
  for(const regel of regels){
    const dm=regel.match(DAG_RE);
    if(dm){dag={wd:dm[1],maand:+dm[2],dagnr:+dm[3],titel:(dm[4]||"").trim(),regels:[]};dagen.push(dag);continue;}
    if(dag)dag.regels.push(regel);
  }
  // Jaartallen: datums lopen op (maand omlaag = jaarwissel); kies het startjaar
  // waarbij de weekdagen het vaakst kloppen.
  const metJaren=(sj)=>{
    let jaar=sj,vorige=null,goed=0;const uit=[];
    for(const d of dagen){
      if(vorige!=null&&d.maand<vorige)jaar+=1;
      vorige=d.maand;
      if(new Date(Date.UTC(jaar,d.maand-1,d.dagnr)).getUTCDay()===CRX_WD[d.wd])goed+=1;
      uit.push({...d,jaar});
    }
    return{uit,goed};
  };
  let beste=null;
  for(let sj=2020;sj<=2027;sj++){const k=metJaren(sj);if(!beste||k.goed>beste.goed)beste=k;}
  const STERK=/^(Complete|\d{1,2}:\d{2}(\s*min\.?)?|\d+([.,]\d+)?(\s*(kg|reps|rondes|rounds|cal))?)$/i;
  const uit=beste.uit.map(d=>{
    const blokken=[];const warmup=[];let blok=null;
    for(const regel of d.regels){
      const bm=regel.match(BLOK_RE);
      if(bm){blok={label:bm[1],naam:bm[2].trim(),regels:[]};blokken.push(blok);continue;}
      if(!blok){warmup.push(regel.replace(CRX_RES_MARK,"").replace(/^WARMUP:\s*/i,""));continue;}
      blok.regels.push(regel);
    }
    const nette=blokken.map(b=>{
      let voorschrift,resultaat;
      if(b.regels.some(r=>r.startsWith(CRX_RES_MARK))){
        // Betrouwbaarste route: de PDF markeert gelogde resultaten met een
        // inspringing (zie crxTekstUitPdf), ongeacht de stijl van de coach.
        voorschrift=b.regels.filter(r=>!r.startsWith(CRX_RES_MARK));
        resultaat=b.regels.filter(r=>r.startsWith(CRX_RES_MARK)).map(r=>r.slice(CRX_RES_MARK.length));
      }else{
        // Terugval (PDF zonder bruikbare inspringing): splits op de laatste
        // "*"-instructieregel, anders simpele score-regels van achteren afpellen.
        let ster=-1;b.regels.forEach((r,i)=>{if(r.startsWith("*"))ster=i;});
        if(ster>=0){voorschrift=b.regels.slice(0,ster+1);resultaat=b.regels.slice(ster+1);}
        else{
          voorschrift=[...b.regels];resultaat=[];
          while(voorschrift.length&&STERK.test(voorschrift[voorschrift.length-1]))resultaat.unshift(voorschrift.pop());
        }
      }
      return{label:b.label,naam:b.naam,voorschrift:voorschrift.join("\n").trim(),resultaat:resultaat.join("\n").trim()};
    });
    const datum=d.jaar+"-"+String(d.maand).padStart(2,"0")+"-"+String(d.dagnr).padStart(2,"0");
    return{datum,wdKlopt:new Date(datum+"T12:00:00Z").getUTCDay()===CRX_WD[d.wd],titel:d.titel,warmup:warmup.join("\n").trim(),blokken:nette};
  });
  const prs=[];
  // Naast echte RM-tests ook zware sets op herkende liften (5x5, heavy 3…):
  // die leveren een GESCHATTE 1RM op met dezelfde rekenregel als de app
  // (gewicht x (1 + reps/30)). Verzoek Stefan 23 juli.
  const SCHEMA_RE=/(\d+)\s*[x×]\s*(\d+)|heavy\s+(single|double|triple|\d+)/i;
  uit.forEach(d=>d.blokken.forEach(b=>{
    if(!b.resultaat)return;
    const tekst=b.voorschrift+" "+b.naam;
    if(/\b\d?\s?RM\b|1RM/i.test(tekst)){prs.push({datum:d.datum,naam:b.naam,resultaat:b.resultaat});return;}
    const m=tekst.match(SCHEMA_RE);
    if(m&&crxMetingVoor(b.naam)){
      let reps=null;
      if(m[2])reps=parseInt(m[2],10); // "5 x 5" = sets x reps, de reps tellen
      else if(m[3])reps={single:1,double:2,triple:3}[m[3].toLowerCase()]||parseInt(m[3],10);
      if(reps&&reps>=1&&reps<=10)prs.push({datum:d.datum,naam:b.naam,resultaat:b.resultaat,reps});
    }
  }));
  return{dagen:uit,prs};
}

// Beste catalogus-meting bij een bloknaam (voor de PR-aanvinklijst)
function crxMetingVoor(naam){
  const alle=Object.values(METRICS_DEF).flat();
  const norm=s=>String(s||"").toLowerCase().replace(/\(.*?\)/g," ").replace(/\b\d+\s*rm\b/g," ").replace(/[^a-z]+/g," ").trim();
  const n=norm(naam);
  if(!n)return"";
  let hit=alle.find(m=>norm(m)===n);
  if(!hit)hit=alle.find(m=>norm(m)===n+" ");
  if(!hit)hit=alle.find(m=>norm(m).startsWith(n)||n.startsWith(norm(m)));
  return hit||"";
}
// Beste kilogetal uit een resultaat (voorzetje; coach kan het aanpassen).
// Sporters loggen sets als "83,86,88,91" (zonder spaties) — dat is een reeks
// gewichten, geen decimaal getal. En "(failed)"-pogingen tellen niet mee.
function crxKgUit(res){
  let t=String(res||"");
  t=t.replace(/\b\d+:\d+(?::\d+)?(?:[.,]\d+)?\b/g," ");   // tijden (4:32) weg
  // Mislukte pogingen weg: "77(failed)", "83 failed", "70 gemist"… Het getal
  // mag hooguit een echte decimaal hebben (,5/,25/,75), anders zou in
  // "82,83(failed)" ook de gelukte 82 sneuvelen.
  t=t.replace(/(\d+(?:[.,](?:25|75|\d))?)\s*\(?\s*(failed|fail|gemist|mislukt|niet gelukt|no rep)\s*\)?/gi," ");
  t=t.replace(/(\d+(?:[.,]\d+)?)\s*%/g," ");               // percentages weg
  const kand=[];
  // Getallen met "kg" erachter zijn het betrouwbaarst — die winnen.
  for(const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)\b/gi)){
    const v=parseFloat(m[1].replace(",","."));
    if(v>=20&&v<=400)kand.push(v);
  }
  if(!kand.length){
    t=t.replace(/\([^)]*\)/g," ");                          // commentaar tussen haakjes weg
    // Reeksen als "55,65,70,72.5" splitsen; ",5" / ",25" / ",75" blijven decimalen.
    for(const run of t.match(/\d+(?:[.,]\d+)*/g)||[]){
      const delen=run.split(/[.,]/);
      let huidig=delen[0];
      for(let i=1;i<delen.length;i++){
        const d=delen[i];
        if(!huidig.includes(".")&&(d.length===1||d==="25"||d==="75"))huidig+="."+d;
        else{kand.push(parseFloat(huidig));huidig=d;}
      }
      kand.push(parseFloat(huidig));
    }
  }
  const ok=kand.filter(v=>!isNaN(v)&&v>=20&&v<=400);
  if(!ok.length)return"";
  return String(Math.max(...ok)).replace(".",",");
}

async function crxGekozen(inp){
  const file=inp.files&&inp.files[0];if(!file)return;
  inp.value=""; // zodat opnieuw kiezen (ook hetzelfde bestand) altijd werkt
  const host=document.getElementById("crx-uit");
  host.innerHTML='<div class="sm" style="color:#8b919b">PDF lezen…</div>';
  try{
    const tekst=await crxTekstUitPdf(file);
    crxData=crxParse(tekst);
  }catch(e){
    host.innerHTML='<div class="sp-dark" style="display:block">PDF lezen mislukt: '+esc(e.message||e)+'</div>'+crxAnderePdfKnop();
    return;
  }
  const d=crxData.dagen;
  if(!d.length){host.innerHTML='<div class="sp-dark" style="display:block">Geen trainingsdagen gevonden. Is dit wel een CoachRx-kalenderexport?</div>'+crxAnderePdfKnop();return;}
  const blokken=d.reduce((n,x)=>n+x.blokken.length,0);
  const metRes=d.reduce((n,x)=>n+x.blokken.filter(b=>b.resultaat).length,0);
  const wdFout=d.filter(x=>!x.wdKlopt).length;
  const proef=d.find(x=>x.blokken.some(b=>b.resultaat))||d[0];
  host.innerHTML=
    '<div class="sp-dark" style="display:block;line-height:1.6"><b>Gevonden in de PDF:</b><br>'+
    d.length+' trainingsdagen · '+d[0].datum+' t/m '+d[d.length-1].datum+'<br>'+
    blokken+' onderdelen, waarvan '+metRes+' met een gelogd resultaat<br>'+
    (wdFout===0?'✅ Alle datums kloppen tot op de weekdag':'⚠️ '+wdFout+' datums kloppen niet met de weekdag — importeer pas na controle')+
    '</div>'+
    '<div class="sm" style="color:#8b919b;margin:10px 0 4px">Steekproef · '+esc(proef.datum)+' · '+esc(proef.titel||"")+'</div>'+
    '<div class="sp-list">'+proef.blokken.slice(0,3).map(b=>'<b>'+esc(b.label)+') '+esc(b.naam)+'</b>'+(b.resultaat?'<br><span style="color:#27b376">'+esc(b.resultaat.split("\n")[0])+'</span>':'')).join("<br>")+'</div>'+
    '<button class="sp-btn" style="margin-top:12px" id="crx-go" onclick="crxImporteer()">Geschiedenis importeren ('+d.length+' dagen)</button>'+
    '<div id="crx-voortgang" class="sm" style="color:#8b919b;margin-top:8px"></div>'+
    crxPrHtml()+
    crxAnderePdfKnop();
  crxBestaandeVooraan();
}
// Verkeerde PDF gekozen? Hiermee kies je gewoon een andere (vervangt het overzicht).
function crxAnderePdfKnop(){
  return '<button class="sp-btn ghost" style="margin-top:10px" onclick="document.getElementById(\'crx-file\').click()">Andere PDF kiezen…</button>';
}
// Waarschuwing over een eerdere import bovenaan het resultaat houden
async function crxBestaandeVooraan(){
  const{count}=await db.from("workouts").select("id",{count:"exact",head:true}).eq("client_id",calClient).eq("coach_notes",CRX_MERK);
  const host=document.getElementById("crx-uit");
  if(count>0&&host)host.insertAdjacentHTML("afterbegin",
    '<div class="sp-dark" style="display:block;line-height:1.5">⚠️ Er staan al <b>'+count+'</b> geïmporteerde workouts bij deze klant. <button class="sp-btn ghost" style="width:auto;padding:6px 12px;margin-top:6px" onclick="crxEerdereWeg()">Eerdere import verwijderen</button></div>');
}

// In het zijpaneel alleen een knop; de lijst zelf opent in een groot venster
// (het paneel is te smal voor tientallen regels — bevinding Stefan 22 juli).
function crxPrHtml(){
  const prs=crxData.prs||[];
  if(!prs.length)return"";
  return '<button class="sp-btn" style="margin-top:10px" onclick="openCrxPr()">PR-kandidaten bekijken ('+prs.length+')</button>';
}

// ---------- PR-kandidaten: groot venster met nette rijen ----------
function ensureCrxPrModal(){
  if(document.getElementById("crxprmodal"))return;
  const w=document.createElement("div");
  w.innerHTML='<div class="lmodal" id="crxprmodal" style="z-index:450"><div class="box" style="width:880px;max-width:96vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><h3 style="margin:0" id="crxpr-titel">PR-kandidaten</h3><span onclick="closeCrxPr()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div class="sm muted" style="margin-bottom:12px;line-height:1.5">Testblokken met een 1RM/RM en een gelogd resultaat. Vink aan wat er als meting bij Metingen & PR\'s moet komen; meting en gewicht kun je per regel aanpassen. Regels zonder herkende meting laat je leeg of vul je zelf in.</div>'+
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap">'+
      '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;font-weight:700"><input type="checkbox" id="crxpr-alles" onchange="crxPrAlles(this.checked)"> Alles aanvinken</label>'+
      '<span class="sm muted" id="crxpr-teller"></span>'+
      '<button class="btn ghost sm" id="crxpr-ai" onclick="crxAiVul()" style="margin-left:auto">🤖 Vul gewichten in met AI</button></div>'+
    '<div class="sm muted" id="crxpr-ai-status" style="margin-bottom:8px;display:none"></div>'+
    '<div class="crxpr-kop"><span></span><span>Testblok · resultaat</span><span>Meting</span><span>Gewicht</span></div>'+
    '<div style="max-height:54vh;overflow:auto;border:1px solid var(--line);border-radius:0 0 10px 10px;border-top:none"><div id="crxpr-lijst"></div></div>'+
    '<div class="mfoot" style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--line);padding-top:14px;margin-top:16px">'+
      '<button class="btn ghost" onclick="closeCrxPr()">Sluiten</button>'+
      '<button class="btn" onclick="crxPrsBoeken()">Aangevinkte PR\'s opslaan als metingen</button></div>'+
    '</div></div>';
  document.body.appendChild(w.firstChild);
  document.getElementById("crxprmodal").addEventListener("click",e=>{if(e.target.id==="crxprmodal")closeCrxPr();});
}
function openCrxPr(){
  ensureCrxPrModal();
  const prs=(crxData&&crxData.prs)||[];
  // Splitsing: liften die aan de metingen-catalogus te koppelen zijn staan
  // vooraan; de rest (banded/bamboo/accessorewerk met een RM-schema) is meestal
  // geen echte test en staat verborgen achter een knopje (verzoek Stefan 23 juli).
  const rij=(p,i,extraKlasse)=>{
    const meting=crxMetingVoor(p.naam);
    // Bij een repsschema (5x5, heavy 3) vullen we de geschatte 1RM alvast in.
    const kgVoorstel=p.reps?crxGeschat1Rm(crxKgUit(p.resultaat),p.reps):crxKgUit(p.resultaat);
    return '<div class="crxpr-rij'+(extraKlasse||"")+'">'+
      '<input type="checkbox" class="crx-pr" data-i="'+i+'" onchange="crxPrTel()">'+
      '<div style="min-width:0"><div style="font-weight:700;font-size:13px">'+esc(p.naam)+(p.reps?' <span class="sm" style="color:#9a7b1f;font-weight:700">≈ 1RM uit '+p.reps+' reps</span>':'')+'</div>'+
        '<div class="sm muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(datumNL(p.datum))+(p.resultaat?' · '+esc(p.resultaat.split("\n").slice(0,2).join(" · ")).slice(0,110):'')+'</div></div>'+
      '<input class="crx-pr-m" data-i="'+i+'" list="crx-metingen" value="'+esc(meting)+'" placeholder="meting…">'+
      '<div style="display:flex;align-items:center;gap:5px"><input class="crx-pr-kg" data-i="'+i+'" value="'+esc(kgVoorstel)+'" placeholder="–" style="width:64px;text-align:center"><span class="sm muted">kg</span></div>'+
      '</div>';
  };
  const herkend=[],schatting=[],overig=[];
  prs.forEach((p,i)=>{
    if(p.reps)schatting.push([p,i]);
    else (crxMetingVoor(p.naam)?herkend:overig).push([p,i]);
  });
  document.getElementById("crxpr-titel").textContent="PR-kandidaten ("+herkend.length+
    (schatting.length?" + "+schatting.length+" geschat":"")+(overig.length?" + "+overig.length+" overig":"")+")";
  document.getElementById("crxpr-lijst").innerHTML=(
    herkend.map(([p,i])=>rij(p,i,"")).join("")+
    (schatting.length
      ?'<div class="crxpr-scheiding"><button class="btn ghost sm" onclick="crxPrOverigToggle(this,\'crxpr-schat\')">Toon '+schatting.length+' geschatte 1RM-kandidaten (5x5, heavy 3…)</button></div>'+
       schatting.map(([p,i])=>rij(p,i," crxpr-overig crxpr-schat")).join("")
      :"")+
    (overig.length
      ?'<div class="crxpr-scheiding"><button class="btn ghost sm" onclick="crxPrOverigToggle(this,\'crxpr-los\')">Toon '+overig.length+' overige testblokken (geen herkende lift)</button></div>'+
       overig.map(([p,i])=>rij(p,i," crxpr-overig crxpr-los")).join("")
      :"")
  )||'<div style="padding:14px" class="sm muted">Geen PR-kandidaten in deze PDF.</div>';
  if(!document.getElementById("crx-metingen")){
    const dl=document.createElement("datalist");dl.id="crx-metingen";
    dl.innerHTML=Object.values(METRICS_DEF).flat().map(m=>'<option value="'+esc(m)+'">').join("");
    document.body.appendChild(dl);
  }
  const alles=document.getElementById("crxpr-alles");if(alles)alles.checked=false;
  crxPrTel();
  document.getElementById("crxprmodal").classList.add("show");
}
function closeCrxPr(){const m=document.getElementById("crxprmodal");if(m)m.classList.remove("show");}
// Geschatte 1RM uit een zware set: gewicht x (1 + reps/30), afgerond op 0,5 kg
// (zelfde rekenregel als het PR-voorstel in de sporter-app).
function crxGeschat1Rm(kgTekst,reps){
  const kg=parseFloat(String(kgTekst||"").replace(",","."));
  if(isNaN(kg)||kg<=0)return"";
  if(reps<=1)return String(kg).replace(".",",");
  return String(Math.round(kg*(1+reps/30)*2)/2).replace(".",",");
}
// Verborgen groep (geschatte 1RM's of overige testblokken) tonen/verbergen
function crxPrOverigToggle(knop,klasse){
  const aan=knop.dataset.aan==="1";
  document.querySelectorAll("."+klasse).forEach(r=>{r.style.display=aan?"none":"grid";});
  knop.dataset.aan=aan?"0":"1";
  knop.textContent=(aan?"Toon":"Verberg")+knop.textContent.replace(/^(Toon|Verberg)/,"");
  crxPrTel();
}
// AI-invulhulp: laat Claude per regel het beste gelukte gewicht bepalen
// (Edge Function pr-gewichten). Vult alleen de velden; boeken blijft handwerk.
async function crxAiVul(){
  const prs=(crxData&&crxData.prs)||[];
  if(!prs.length)return;
  const knop=document.getElementById("crxpr-ai"),stat=document.getElementById("crxpr-ai-status");
  knop.disabled=true;stat.style.display="";stat.textContent="AI leest de logteksten… (een paar seconden)";
  const rijen=prs.map((p,i)=>({i,naam:p.naam,resultaat:p.resultaat}));
  const{data,error}=await db.functions.invoke("pr-gewichten",{body:{rijen}});
  knop.disabled=false;
  if(error||(data&&data.error)){
    let t=(data&&data.error)||"";
    if(!t&&error&&error.context&&error.context.json){try{t=((await error.context.json())||{}).error||"";}catch(e){}}
    stat.textContent=t||(error&&error.message)||"AI-controle mislukt, probeer het nog een keer.";
    return;
  }
  let gevuld=0,open=0;
  (data.rijen||[]).forEach(r=>{
    const kEl=document.querySelector('.crx-pr-kg[data-i="'+r.i+'"]');if(!kEl)return;
    const rij=kEl.closest(".crxpr-rij");
    const oude=rij&&rij.querySelector(".airden");if(oude)oude.remove();
    if(r.kg!=null){
      const p=crxData.prs[r.i];
      if(p&&p.reps){
        // Repsschema: de AI leest de beste set, wij rekenen de geschatte 1RM.
        kEl.value=crxGeschat1Rm(String(r.kg),p.reps);
        kEl.title="AI las beste set "+r.kg+" kg · geschat 1RM uit "+p.reps+" reps";
      }else{
        kEl.value=String(r.kg).replace(".",",");
        kEl.title="Door AI ingevuld";
      }
      kEl.style.borderColor="#27b376";gevuld++;
    }else{
      kEl.value="";kEl.style.borderColor="#e5a13d";kEl.title="AI: "+(r.reden||"geen bruikbaar gewicht");
      const sub=rij&&rij.querySelector(".sm.muted");
      if(sub){const s=document.createElement("span");s.className="airden";s.style.color="#b57614";s.textContent=" · AI: "+(r.reden||"onduidelijk");sub.appendChild(s);}
      open++;
    }
  });
  stat.textContent="AI-controle klaar: "+gevuld+" gewicht"+(gevuld===1?"":"en")+" ingevuld"+(open?", "+open+" open gelaten (oranje rand, even zelf bekijken)":"")+(data.kosten&&data.kosten.usd?" · kosten ≈ $"+data.kosten.usd:"");
}
// Alles aanvinken pakt alleen zichtbare regels (verborgen "overige" niet mee)
function crxPrAlles(aan){
  document.querySelectorAll(".crx-pr").forEach(c=>{
    const rij=c.closest(".crxpr-rij");
    if(rij&&rij.offsetParent!==null)c.checked=aan;
  });
  crxPrTel();
}
function crxPrTel(){
  const n=document.querySelectorAll(".crx-pr:checked").length;
  const tot=(crxData&&crxData.prs)?crxData.prs.length:0;
  const t=document.getElementById("crxpr-teller");if(t)t.textContent=n+" van "+tot+" aangevinkt";
}

async function crxPrsBoeken(){
  const vinken=[...document.querySelectorAll(".crx-pr:checked")];
  if(!vinken.length){toast("Vink eerst één of meer PR's aan");return;}
  // Geldige regels boeken; onvolledige (geen meting of gewicht) blijven
  // aangevinkt staan met een rood randje, zodat "alles aanvinken" niet
  // strandt op een paar lege regels.
  const rows=[],geboekt=[],onvolledig=[];
  for(const v of vinken){
    const i=v.dataset.i;
    const mEl=document.querySelector('.crx-pr-m[data-i="'+i+'"]'),kEl=document.querySelector('.crx-pr-kg[data-i="'+i+'"]');
    const meting=(mEl.value||"").trim();
    const kg=parseFloat((kEl.value||"").replace(",","."));
    const ok=meting&&!isNaN(kg)&&kg>0;
    mEl.style.borderColor=ok||meting?"":"#e5484d";
    kEl.style.borderColor=ok||(!isNaN(kg)&&kg>0)?"":"#e5484d";
    if(!ok){onvolledig.push(v);continue;}
    const p=crxData.prs[i];
    // Notitie mét het blok en de gelogde tekst, zodat je later kunt terugzien
    // waar het getal vandaan komt (verzoek Stefan 22 juli).
    const log=String(p.resultaat||"").split("\n").slice(0,2).join(" · ").slice(0,120);
    const schatting=p.reps?" · geschat 1RM uit "+p.reps+" reps":"";
    rows.push({athlete_id:calClient,company_id:ME.profile.company_id,metric:meting,value:kg,unit:"kg",measured_at:p.datum,created_by:ME.user.id,note:CRX_MERK+schatting+" · "+p.naam+(log?": "+log:"")});
    geboekt.push(v);
  }
  if(!rows.length){toast("Vul bij de aangevinkte regels een meting en een gewicht in (rood gemarkeerd)");return;}
  const{error}=await db.from("metrics").insert(rows);
  if(error){toast(error.message||"Opslaan mislukt");return;}
  toast(rows.length+" meting"+(rows.length===1?"":"en")+" opgeslagen"+(onvolledig.length?" · "+onvolledig.length+" regel"+(onvolledig.length===1?"":"s")+" overgeslagen (meting/gewicht ontbreekt, rood gemarkeerd)":""));
  geboekt.forEach(v=>{v.checked=false;v.closest(".crxpr-rij").style.opacity=".45";});
  const alles=document.getElementById("crxpr-alles");if(alles)alles.checked=false;
  crxPrTel();
}

async function crxImporteer(){
  if(!crxData)return;
  const knop=document.getElementById("crx-go");
  const vg=document.getElementById("crx-voortgang");
  knop.disabled=true;knop.textContent="Bezig met importeren…";
  const dagen=crxData.dagen;
  const BATCH=40;
  try{
    for(let i=0;i<dagen.length;i+=BATCH){
      const deel=dagen.slice(i,i+BATCH);
      // 1) workouts (PostgREST geeft de rijen terug in de volgorde van invoer)
      const wRows=deel.map(d=>({company_id:ME.profile.company_id,coach_id:coachClients.find(k=>k.id===calClient)?.coach_id||ME.user.id,client_id:calClient,workout_date:d.datum,title:d.titel||"Training",coach_notes:CRX_MERK,warmup:d.warmup||null}));
      const{data:ws,error:we}=await db.from("workouts").insert(wRows).select("id");
      if(we)throw we;
      // 2) blokken
      const bRows=[];
      deel.forEach((d,di)=>d.blokken.forEach((b,bi)=>bRows.push({workout_id:ws[di].id,kind:"exercise",label:b.label,exercise:b.naam,prescription:b.voorschrift||null,sort:bi+1,score_type:"text",_res:b.resultaat})));
      const kaal=bRows.map(({_res,...r})=>r);
      const{data:bs,error:be}=await db.from("blocks").insert(kaal).select("id,workout_id");
      if(be)throw be;
      // 3) resultaten (zelfde volgorde als de blokken)
      const rRows=[];
      bRows.forEach((b,bi)=>{
        if(b._res)rRows.push({block_id:bs[bi].id,workout_id:bs[bi].workout_id,athlete_id:calClient,company_id:ME.profile.company_id,status:"completed",score_text:b._res,is_public:false});
      });
      if(rRows.length){const{error:re}=await db.from("results").insert(rRows);if(re)throw re;}
      vg.textContent="Geïmporteerd: "+Math.min(i+BATCH,dagen.length)+" van "+dagen.length+" dagen…";
    }
    vg.textContent="";
    knop.textContent="Import klaar ✓";
    toast(dagen.length+" dagen geschiedenis geïmporteerd");
    renderMonth();
  }catch(e){
    knop.disabled=false;knop.textContent="Geschiedenis importeren ("+dagen.length+" dagen)";
    vg.textContent="Mislukt: "+(e.message||e)+" — al geïmporteerde dagen kun je opruimen met 'Eerdere import verwijderen' en dan opnieuw proberen.";
  }
}
