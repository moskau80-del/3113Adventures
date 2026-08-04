const KEY="a3113-v13";
let state=JSON.parse(localStorage.getItem(KEY)||"null")||structuredClone(DEFAULT_STATE);
if(!state.gpx) state.gpx=null;

const $=id=>document.getElementById(id);
const saveLocal=()=>localStorage.setItem(KEY,JSON.stringify(state));
let map;
let routeLayer;

function days(a,b){return Math.max(1,Math.round((new Date(b)-new Date(a))/86400000)+1)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function haversine(a,b){
 const R=6371, dLat=(b[0]-a[0])*Math.PI/180, dLon=(b[1]-a[1])*Math.PI/180;
 const la1=a[0]*Math.PI/180,la2=b[0]*Math.PI/180;
 const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
 return 2*R*Math.asin(Math.sqrt(x));
}
function routeDistance(points){let d=0;for(let i=1;i<points.length;i++)d+=haversine(points[i-1],points[i]);return d}
function simplifyPoints(points,max=6000){
 if(points.length<=max)return points;
 const step=Math.ceil(points.length/max);
 const out=points.filter((_,i)=>i%step===0);
 if(out[out.length-1]!==points[points.length-1])out.push(points[points.length-1]);
 return out;
}

const navButtons=document.querySelectorAll("nav button");
const pages=document.querySelectorAll(".page");
navButtons.forEach(button=>button.addEventListener("click",()=>{
 navButtons.forEach(item=>item.classList.toggle("active",item===button));
 pages.forEach(page=>page.classList.toggle("active",page.id===button.dataset.page));
 if(button.dataset.page==="mapPage") setTimeout(()=>{initMap();map.invalidateSize();drawRoute()},80);
}));

function initMap(){
 if(map||typeof L==="undefined")return;
 map=L.map("map").setView([51.2,10.4],6);
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
   maxZoom:19,attribution:"© OpenStreetMap-Mitwirkende"
 }).addTo(map);
}
function drawRoute(){
 initMap();
 if(!map)return;
 if(routeLayer){map.removeLayer(routeLayer);routeLayer=null}
 const pts=state.gpx?.points||[];
 if(pts.length){
   routeLayer=L.polyline(pts,{weight:4}).addTo(map);
   map.fitBounds(routeLayer.getBounds(),{padding:[20,20]});
 }
 renderGpxStats();
}
function renderGpxStats(){
 const pts=state.gpx?.points||[];
 $("gpxPoints").textContent=pts.length;
 $("gpxDistance").textContent=pts.length?routeDistance(pts).toFixed(1)+" km":"0 km";
 $("gpxStart").textContent=pts.length?`${pts[0][0].toFixed(4)}, ${pts[0][1].toFixed(4)}`:"–";
 $("gpxEnd").textContent=pts.length?`${pts.at(-1)[0].toFixed(4)}, ${pts.at(-1)[1].toFixed(4)}`:"–";
 $("gpxInfo").textContent=state.gpx?`${state.gpx.name} · ${pts.length} gespeicherte Punkte`:"Noch kein GPX-Track importiert.";
}
function parseGpx(text){
 const xml=new DOMParser().parseFromString(text,"application/xml");
 if(xml.querySelector("parsererror"))throw new Error("Ungültige GPX-Datei");
 let nodes=[...xml.querySelectorAll("trkpt")];
 if(!nodes.length)nodes=[...xml.querySelectorAll("rtept")];
 const points=nodes.map(n=>[Number(n.getAttribute("lat")),Number(n.getAttribute("lon"))]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
 if(points.length<2)throw new Error("Keine Route gefunden");
 return simplifyPoints(points);
}

$("gpxInput").addEventListener("change",async e=>{
 try{
   const file=e.target.files[0]; if(!file)return;
   const points=parseGpx(await file.text());
   state.gpx={name:file.name,points};
   try{saveLocal()}catch(err){
     state.gpx.points=simplifyPoints(points,2500);saveLocal();
   }
   drawRoute();
 }catch(err){alert(err.message||"GPX konnte nicht gelesen werden")}
});
$("clearGpx").addEventListener("click",()=>{
 if(confirm("Importierten GPX-Track löschen?")){state.gpx=null;saveLocal();drawRoute()}
});

function render(){
 $("arrival").value=state.arrival;$("start").value=state.start;$("target").value=state.target;
 $("lang").value=state.lang;$("restDays").value=state.restDays;
 $("section").innerHTML=NST_SECTIONS.map(x=>`<option>${x}</option>`).join("");
 const totalDays=days(state.start,state.target),walkDays=Math.max(1,totalDays-Number(state.restDays||0));
 $("needKm").textContent=(3700/walkDays).toFixed(1)+" km";$("buffer").textContent=state.restDays;
 const total=state.stages.reduce((a,s)=>a+Number(s.km||0),0);
 const doneKm=state.stages.filter(s=>s.done).reduce((a,s)=>a+Number(s.km||0),0);
 $("status").innerHTML=`${state.stages.length} Etappen geplant · ${total.toFixed(1)} km eingetragen · ${doneKm.toFixed(1)} km abgeschlossen`;
 $("bar").style.width=Math.min(100,total/3700*100)+"%";
 const n=state.stages.find(s=>!s.done);
 $("next").innerHTML=n?`<b>${esc(n.date)} · ${esc(n.from)} → ${esc(n.to)}</b><p>${Number(n.km||0).toFixed(1)} km · ↑ ${n.up||0} m · ↓ ${n.down||0} m</p>`:'<p class="muted">Noch keine offene Etappe.</p>';
 renderSections();renderStages();renderGpxStats();
}
function renderSections(){
 const q=$("sectionSearch").value.toLowerCase();
 $("sectionList").innerHTML=NST_SECTIONS.filter(x=>x.toLowerCase().includes(q)).map(x=>`<article class="section ${x==="Heidschnuckenweg"?"heid":""}"><h3>${x}</h3>${x==="Heidschnuckenweg"?'<span class="pill">SPEZIELL MARKIERT</span>':""}</article>`).join("");
}
function renderStages(){
 const q=$("stageSearch").value.toLowerCase(),f=$("stageFilter").value;
 let list=state.stages.filter(s=>`${s.from} ${s.to} ${s.section}`.toLowerCase().includes(q));
 if(f==="open")list=list.filter(s=>!s.done);if(f==="done")list=list.filter(s=>s.done);if(f==="heid")list=list.filter(s=>s.section==="Heidschnuckenweg");
 $("stageList").innerHTML=list.length?list.sort((a,b)=>a.date.localeCompare(b.date)).map(s=>`<article class="stage"><h3>${esc(s.date)} · ${esc(s.from)} → ${esc(s.to)}</h3><span class="pill">${esc(s.section)}</span><span class="pill">${Number(s.km||0).toFixed(1)} km</span>${s.done?'<span class="pill">Erledigt</span>':""}<p>↑ ${s.up||0} m · ↓ ${s.down||0} m</p><p><b>Übernachtung:</b> ${esc(s.sleep||"–")}</p><p class="muted">${esc(s.notes||"")}</p><div class="buttons"><button onclick="editStage(${s.id})">Bearbeiten</button><button onclick="delStage(${s.id})" class="danger">Löschen</button></div></article>`).join(""):'<div class="card">Keine passenden Etappen.</div>';
}
$("sectionSearch").addEventListener("input",renderSections);$("stageSearch").addEventListener("input",renderStages);$("stageFilter").addEventListener("change",renderStages);
$("add").addEventListener("click",()=>openStage());
window.editStage=id=>openStage(state.stages.find(s=>s.id===id));
window.delStage=id=>{if(confirm("Etappe löschen?")){state.stages=state.stages.filter(s=>s.id!==id);saveLocal();render()}};
function openStage(s={}){
 $("sid").value=s.id||"";$("date").value=s.date||state.start;$("section").value=s.section||NST_SECTIONS[0];
 $("from").value=s.from||"";$("to").value=s.to||"";$("km").value=s.km||"";$("up").value=s.up||0;$("down").value=s.down||0;
 $("sleep").value=s.sleep||"";$("notes").value=s.notes||"";$("done").checked=!!s.done;$("dlg").showModal();
}
$("saveStage").addEventListener("click",()=>{
 const obj={id:Number($("sid").value)||Date.now(),date:$("date").value,section:$("section").value,from:$("from").value.trim(),to:$("to").value.trim(),km:Number($("km").value||0),up:Number($("up").value||0),down:Number($("down").value||0),sleep:$("sleep").value.trim(),notes:$("notes").value.trim(),done:$("done").checked};
 if(!obj.from||!obj.to)return;
 const i=state.stages.findIndex(x=>x.id===obj.id);i>=0?state.stages[i]=obj:state.stages.push(obj);
 saveLocal();$("dlg").close();render();
});
$("save").addEventListener("click",()=>{
 state.lang=$("lang").value;state.arrival=$("arrival").value;state.start=$("start").value;state.target=$("target").value;state.restDays=Number($("restDays").value||0);saveLocal();render();
});
$("exportBtn").addEventListener("click",()=>{
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download="3113-adventures-v1.3-backup.json";a.click();URL.revokeObjectURL(a.href);
});
$("importInput").addEventListener("change",async e=>{try{const file=e.target.files[0];if(!file)return;state=JSON.parse(await file.text());if(!state.gpx)state.gpx=null;saveLocal();render();drawRoute()}catch{alert("Backup ungültig")}});
$("reset").addEventListener("click",()=>{if(confirm("Alle Änderungen zurücksetzen?")){state=structuredClone(DEFAULT_STATE);state.gpx=null;saveLocal();render();drawRoute()}});
$("refreshApp").addEventListener("click",async()=>{
 if("serviceWorker"in navigator){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister()}
 for(const name of await caches.keys())await caches.delete(name);
 location.href="./?v=13";
});
if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js?v=13");
render();
