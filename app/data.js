// app/data.js — de Data-sectie (topnav): cijfers en overzichten over je
// klanten en de gym. De inhoud wordt samen met Stefan bepaald; dit is de
// eerste opzet van het scherm.
async function fillData(){
  const cp=document.getElementById("cpage");if(!cp)return;
  cp.innerHTML='<div class="hrow"><h1>Data</h1></div>'+
    '<div class="panel" style="padding:26px;text-align:center">'+
      '<div class="sm muted" style="line-height:1.7">Hier komen je cijfers en overzichten.<br>We bepalen samen wat hier precies komt te staan.</div>'+
    '</div>';
}
