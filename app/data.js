// app/data.js — de Data-sectie (topnav): twee kopjes, Atleten en Wedstrijden
// (indeling gekozen door Stefan, 17 juli). De inhoud per kopje wordt nog
// samen bepaald; dit is het raamwerk met nette lege staten.
let dataTab="atleten"; // atleten | wedstrijden

function fillData(){
  const cp=document.getElementById("cpage");if(!cp)return;
  cp.innerHTML='<div class="hrow"><h1>Data</h1></div>'+
    '<div class="ctabs" style="margin-bottom:14px">'+
      '<button class="'+(dataTab==="atleten"?"on":"")+'" onclick="dataZetTab(\'atleten\')">Atleten</button>'+
      '<button class="'+(dataTab==="wedstrijden"?"on":"")+'" onclick="dataZetTab(\'wedstrijden\')">Wedstrijden</button>'+
    '</div>'+
    '<div id="data-inhoud">'+dataInhoudHtml()+'</div>';
}
function dataZetTab(t){
  dataTab=t;
  const h=document.getElementById("data-inhoud");if(h)h.innerHTML=dataInhoudHtml();
  const tabs=document.querySelectorAll("#cpage .ctabs button");
  tabs.forEach(b=>b.classList.toggle("on",b.textContent.toLowerCase().indexOf(t==="atleten"?"atleten":"wedstrijden")===0));
}
function dataInhoudHtml(){
  if(dataTab==="atleten"){
    return '<div class="panel" style="padding:26px;text-align:center">'+
      '<div class="sm muted" style="line-height:1.7">Hier komt de atleten-data.<br>Stefan geeft aan wat hier moet komen.</div></div>';
  }
  return '<div class="panel" style="padding:26px;text-align:center">'+
    '<div class="sm muted" style="line-height:1.7">Hier komt de wedstrijden-data.<br>Stefan geeft aan wat hier moet komen.</div></div>';
}
