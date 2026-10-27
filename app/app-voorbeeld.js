// app/app-voorbeeld.js — "Voorbeeld voor de sporter" (verzoek Stefan 27 okt
// 2026, naar de Client Preview van CoachRx): een telefoonvenster rechts in
// beeld dat laat zien hoe de workout er in de YourProgram-app uitziet, in de
// zwart-gouden app-stijl (kaarten met gouden rand, Start workout-knop,
// Warm-up/blokken/Cooldown, Reacties). Je kunt erin scrollen.
// Vanuit de bouwer (oogje rechtsboven) loopt het voorbeeld live mee met wat
// je typt en met de video-chips; vanuit een kaart op de kalender (oogje in
// het zweefmenu) toont het de opgeslagen workout.
let AVB={open:false,bron:null,wid:null,timer:null};

// Het oogje in de hoek van de bouwer (klant-, blog- en programma-bouwer).
function avbOogHtml(){
  return '<div class="corner"><span class="oog" title="Voorbeeld: zo ziet de sporter deze workout in de app" onclick="appVoorbeeldToggle()"><svg class="i sm-i"><use href="#i-eye"/></svg></span></div>';
}
function appVoorbeeldToggle(){
  if(AVB.open&&AVB.bron==="bouwer"){appVoorbeeldDicht();return;}
  AVB.bron="bouwer";AVB.wid=null;appVoorbeeldOpen();
}
function appVoorbeeldVanKaart(wid){AVB.bron="kaart";AVB.wid=wid;appVoorbeeldOpen();}
function appVoorbeeldOpen(){
  let el=document.getElementById("appvb");
  if(!el){el=document.createElement("div");el.id="appvb";el.className="appvb";document.body.appendChild(el);}
  AVB.open=true;
  el.innerHTML='<div class="frame"><span class="x" title="Sluiten" onclick="appVoorbeeldDicht()">✕</span><div class="notch"></div>'+
    '<div class="kop">Zo ziet de sporter het in de app</div><div class="scherm" id="appvb-scherm"></div></div>';
  el.style.display="";
  appVoorbeeldVul();
}
function appVoorbeeldDicht(){
  const el=document.getElementById("appvb");if(el)el.style.display="none";
  AVB.open=false;AVB.bron=null;AVB.wid=null;
}

// De workout die we tonen: live uit de open bouwer, of de opgeslagen kaart.
function avbData(){
  if(AVB.bron==="kaart"){
    const w=(typeof monthWorkouts!=="undefined"&&monthWorkouts[AVB.wid])||null;
    if(!w)return null;
    return Object.assign({},w,{blocks:(w.blocks||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0))});
  }
  if(!document.querySelector(".ib2"))return null;
  const g=id=>{const el=document.getElementById(id);return el?el.value.trim():"";};
  const rows=[...document.querySelectorAll("#exrows .exrow")].map(r=>{
    const o=(typeof rowToObj==="function")?rowToObj(r):{};
    const lbl=r.querySelector(".lbl-badge");o.label=lbl?lbl.textContent:"";
    return o;
  }).filter(b=>b.exercise||b.notes);
  const lees=f=>(typeof f==="function");
  return{title:g("w_title"),coach_notes:g("w_notes"),warmup:g("w_warmup"),cooldown:g("w_cooldown"),
    warmup_oefening_id:lees(cwLees)?cwLees("warmup"):null,cooldown_oefening_id:lees(cwLees)?cwLees("cooldown"):null,
    warmup_media:lees(gmStripLees)?gmStripLees("warmup"):null,cooldown_media:lees(gmStripLees)?gmStripLees("cooldown"):null,
    blocks:rows};
}

const avbVideos=(oefId,media)=>(oefId?1:0)+((media||[]).filter(m=>m&&m.youtube_id).length);
function avbVideoChip(n){return n>0?'<div class="chips"><span class="chip">🎬 '+(n===1?"Demo-video":"Video's ("+n+")")+'</span></div>':"";}
function avbInfo(tag,body,oefId,media){
  return '<div class="kaart"><div class="kb"><div class="tag">'+esc(tag)+'</div><div class="body">'+esc(body)+'</div>'+avbVideoChip(avbVideos(oefId,media))+'</div></div>';
}
// Opeenvolgende supersetblokken (A1, A2) = één kaart, zoals in de app.
function avbGroepen(blocks){
  const uit=[];let i=0;
  const deel=b=>String(b.label||"").match(/^([A-Za-z]+)(\d+)$/);
  while(i<blocks.length){
    const m=deel(blocks[i]);
    if(m){const g=[blocks[i]];let j=i+1;while(j<blocks.length){const mm=deel(blocks[j]);if(!mm||mm[1]!==m[1])break;g.push(blocks[j]);j++;}uit.push(g);i=j;}
    else{uit.push([blocks[i]]);i++;}
  }
  return uit;
}
function avbBlokKaart(groep){
  const naamVan=b=>b.exercise||(b.kind==="conditioning"?"Conditioning":"Onderdeel");
  const tekstVan=b=>b.kind==="conditioning"?(b.notes||""):[b.prescription,b.notes].filter(Boolean).join("\n");
  const eerste=groep[0];
  let titel,body;
  if(groep.length>1){
    const letter=String(eerste.label||"").replace(/\d+$/,"");
    titel=(letter?letter+") ":"")+(eerste.group_title||groep.map(naamVan).join(" + "));
    body=groep.map(b=>{const t=tekstVan(b);return (b.label?b.label+") ":"")+naamVan(b)+(t?"\n"+t:"");}).join("\n\n");
  }else{
    titel=(eerste.label?eerste.label+") ":"")+naamVan(eerste);
    body=tekstVan(eerste);
  }
  const n=groep.reduce((t,b)=>t+avbVideos(b.oefening_id,b.media),0);
  return '<div class="kaart"><div class="kb"><div class="bt">'+esc(titel)+'</div>'+(body?'<div class="body">'+esc(body)+'</div>':'')+avbVideoChip(n)+'</div></div>';
}
function appVoorbeeldVul(){
  const host=document.getElementById("appvb-scherm");if(!host||!AVB.open)return;
  const w=avbData();
  if(!w){host.innerHTML='<div class="leeg">Open een workout in de bouwer om het voorbeeld te zien.</div>';return;}
  const blocks=w.blocks||[];
  if(!w.title&&!w.coach_notes&&!w.warmup&&!w.cooldown&&!blocks.length){
    host.innerHTML='<div class="leeg">Nog niets ingevuld. Typ een titel of voeg een onderdeel toe; het voorbeeld loopt mee.</div>';return;
  }
  let h="";
  if(w.title)h+='<div class="titel">'+esc(w.title)+'</div>';
  if(w.coach_notes)h+='<div class="notes">📝 '+esc(w.coach_notes)+'</div>';
  if(blocks.length)h+='<div class="start">▶&nbsp; Start workout</div>';
  if(w.warmup)h+=avbInfo("Warm-up",w.warmup,w.warmup_oefening_id,w.warmup_media);
  avbGroepen(blocks).forEach(g=>{h+=avbBlokKaart(g);});
  if(w.cooldown)h+=avbInfo("Cooldown",w.cooldown,w.cooldown_oefening_id,w.cooldown_media);
  h+='<div class="reacties">💬 Reacties<span style="margin-left:auto;color:#9A9A9E">›</span></div>';
  host.innerHTML=h;
}
// Live meebewegen met de bouwer: typen (input) en chips/blokken (DOM-wijzigingen).
// Sluit de bouwer (opslaan/annuleren), dan gaat het voorbeeld ook dicht.
function avbPlan(){
  if(!AVB.open||AVB.bron!=="bouwer")return;
  clearTimeout(AVB.timer);
  AVB.timer=setTimeout(()=>{if(!document.querySelector(".ib2")){appVoorbeeldDicht();return;}appVoorbeeldVul();},250);
}
document.addEventListener("input",e=>{if(e.target&&e.target.closest&&e.target.closest(".ib2"))avbPlan();});
new MutationObserver(muts=>{
  if(!AVB.open||AVB.bron!=="bouwer")return;
  for(const m of muts){const t=m.target;if(t&&t.closest&&(t.closest(".ib2")||t.querySelector&&t.querySelector(".ib2")||t.id==="cmain"||t.id==="cpage")){avbPlan();return;}}
}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["data-media","data-gmedia","data-oefid"]});
