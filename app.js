(() => {
"use strict";
const STORAGE_KEY="3113-adventures-v2";
const LEGACY_KEYS=["a3113-v121","a3113-v12","a3113-v11","adventures3113_v1"];
const $=id=>document.getElementById(id);
let state=loadState();
let map=null,trackLayer=null,markerLayer=null,userMarker=null;

function clone(v){return JSON.parse(JSON.stringify(v))}
function loadState(){
  const current=localStorage.getItem(STORAGE_KEY);
  if(current){try{return normalize(JSON.parse(current))}catch(e){}}
  for(const key of LEGACY_KEYS){
    const raw=localStorage.getItem(key);
    if(raw){try{return normalize(JSON.parse(raw))}catch(e){}}
  }
  return clone(window.APP_DEFAULT_DATA);
}
function normalize(raw){
  const base=clone(window.APP_DEFAULT_DATA);
  if(raw.tour) base.tour={...base.tour,...raw.tour};
  if(raw.arrival) base.tour.arrivalDate=raw.arrival;
  if(raw.start) base.tour.startDate=raw.start;
  if(raw.target) base.tour.targetDate=raw.target;
  if(Number.isFinite(Number(raw.restDays))) base.tour.restDays=Number(raw.restDays);
  base.stages=Array.isArray(raw.stages)?raw.stages:[];
  base.places=Array.isArray(raw.places)?raw.places:[];
  base.gpx=raw.gpx||null;
  return base;
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
function formatDate(value){if(!value)return "–";return new Intl.DateTimeFormat("de-CH").format(new Date(value+"T12:00:00"))}
function daysInclusive(a,b){return Math.max(1,Math.round((new Date(b)-new Date(a))/86400000)+1)}
function totalStageKm(list=state.stages){return list.reduce((sum,s)=>sum+Number(s.km||0),0)}
function categoryName(key){return ({camping:"Camping",water:"Wasser",shop:"Einkauf",transport:"ÖV",sight:"Sehenswürdigkeit",other:"Weitere"})[key]||key}
function markerIcon(category){return ({camping:"⛺",water:"💧",shop:"🛒",transport:"🚆",sight:"★",other:"●"})[category]||"●"}

function initNavigation(){
  document.querySelectorAll("#mainNav button").forEach(button=>{
    button.addEventListener("click",()=>{
      document.querySelectorAll("#mainNav button").forEach(item=>item.classList.toggle("active",item===button));
      document.querySelectorAll(".page").forEach(page=>page.classList.toggle("active",page.id===button.dataset.page));
      if(button.dataset.page==="map") setTimeout(()=>{initMap();map?.invalidateSize();renderMap()},60);
    });
  });
}
function renderDashboard(){
  $("tourTitle").textContent=state.tour.name;
  const calendar=daysInclusive(state.tour.startDate,state.tour.targetDate);
  const walking=Math.max(1,calendar-Number(state.tour.restDays||0));
  const planned=totalStageKm();
  const completed=totalStageKm(state.stages.filter(s=>s.completed));
  $("calendarDays").textContent=calendar;
  $("requiredAverage").textContent=(Number(state.tour.officialDistance)/walking).toFixed(1)+" km";
  $("plannedRestDays").textContent=state.tour.restDays;
  $("completedDistance").textContent=completed.toFixed(1)+" km";
  $("plannedDistance").textContent=planned.toFixed(1)+" km";
  $("unplannedDistance").textContent=Math.max(0,state.tour.officialDistance-planned).toFixed(1)+" km";
  $("progressBar").style.width=Math.min(100,completed/state.tour.officialDistance*100)+"%";
  $("stageCount").textContent=state.stages.length;
  $("placeCount").textContent=state.places.length;
  $("gpxStatus").textContent=state.gpx?`${state.gpx.points.length} Punkte`:"nicht importiert";
  const next=[...state.stages].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).find(s=>!s.completed);
  $("nextStage").innerHTML=next?`<strong>${formatDate(next.date)} · ${escapeHtml(next.from)} → ${escapeHtml(next.to)}</strong><p>${Number(next.km||0).toFixed(1)} km · ↑ ${Number(next.up||0)} m · ↓ ${Number(next.down||0)} m</p><p class="muted">${escapeHtml(next.overnight||"Keine Übernachtung eingetragen")}</p>`:"Noch keine offene Etappe.";
}
function renderStages(){
  const search=$("stageSearch").value.trim().toLowerCase();
  const filter=$("stageFilter").value;
  let stages=[...state.stages].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  stages=stages.filter(s=>`${s.from} ${s.to} ${s.section} ${s.notes}`.toLowerCase().includes(search));
  if(filter==="open") stages=stages.filter(s=>!s.completed);
  if(filter==="completed") stages=stages.filter(s=>s.completed);
  if(filter==="heid") stages=stages.filter(s=>s.section==="Heidschnuckenweg");
  $("stageList").innerHTML=stages.length?stages.map(s=>`
    <article class="stage-card ${s.section==="Heidschnuckenweg"?"heid":""} ${s.completed?"completed":""}">
      <h3>${formatDate(s.date)} · ${escapeHtml(s.from)} → ${escapeHtml(s.to)}</h3>
      <span class="pill">${escapeHtml(s.section)}</span><span class="pill">${Number(s.km||0).toFixed(1)} km</span>
      ${s.completed?'<span class="pill verified">Abgeschlossen</span>':""}
      <p>↑ ${Number(s.up||0)} m · ↓ ${Number(s.down||0)} m</p>
      <p><strong>Übernachtung:</strong> ${escapeHtml(s.overnight||"–")}</p>
      ${s.notes?`<p class="muted">${escapeHtml(s.notes)}</p>`:""}
      <div class="card-actions"><button data-edit-stage="${s.id}">Bearbeiten</button><button data-toggle-stage="${s.id}">${s.completed?"Wieder öffnen":"Abschliessen"}</button><button class="danger" data-delete-stage="${s.id}">Löschen</button></div>
    </article>`).join(""):'<div class="empty">Keine passenden Etappen.</div>';
}
function renderPlaces(){
  const search=$("placeSearch").value.trim().toLowerCase();
  const filter=$("placeFilter").value;
  let places=state.places.filter(p=>`${p.name} ${p.notes}`.toLowerCase().includes(search));
  if(filter!=="all") places=places.filter(p=>p.category===filter);
  $("placeList").innerHTML=places.length?places.map(p=>`
    <article class="place-card">
      <h3>${markerIcon(p.category)} ${escapeHtml(p.name)}</h3>
      <span class="pill">${categoryName(p.category)}</span>${p.verified?'<span class="pill verified">Selbst geprüft</span>':""}
      <p>${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}</p>
      ${p.notes?`<p class="muted">${escapeHtml(p.notes)}</p>`:""}
      <div class="card-actions"><button data-show-place="${p.id}">Auf Karte</button><button data-edit-place="${p.id}">Bearbeiten</button><button class="danger" data-delete-place="${p.id}">Löschen</button></div>
    </article>`).join(""):'<div class="empty">Noch keine Orte erfasst.</div>';
}
function fillSettings(){
  $("tourNameInput").value=state.tour.name;
  $("arrivalInput").value=state.tour.arrivalDate;
  $("startInput").value=state.tour.startDate;
  $("targetInput").value=state.tour.targetDate;
  $("restDaysInput").value=state.tour.restDays;
}
function renderAll(){renderDashboard();renderStages();renderPlaces();fillSettings();if(map)renderMap()}

function openStage(stage={}){
  $("stageId").value=stage.id||"";
  $("stageDate").value=stage.date||state.tour.startDate;
  $("stageSection").value=stage.section||state.sections[0];
  $("stageFrom").value=stage.from||"";
  $("stageTo").value=stage.to||"";
  $("stageKm").value=stage.km??"";
  $("stageUp").value=stage.up??0;
  $("stageDown").value=stage.down??0;
  $("stageOvernight").value=stage.overnight||"";
  $("stageNotes").value=stage.notes||"";
  $("stageCompleted").checked=!!stage.completed;
  $("stageDialog").showModal();
}
function saveStage(event){
  event.preventDefault();
  const id=Number($("stageId").value)||Date.now();
  const stage={id,date:$("stageDate").value,section:$("stageSection").value,from:$("stageFrom").value.trim(),to:$("stageTo").value.trim(),km:Number($("stageKm").value||0),up:Number($("stageUp").value||0),down:Number($("stageDown").value||0),overnight:$("stageOvernight").value.trim(),notes:$("stageNotes").value.trim(),completed:$("stageCompleted").checked};
  if(!stage.from||!stage.to)return;
  const index=state.stages.findIndex(s=>s.id===id);
  if(index>=0)state.stages[index]=stage;else state.stages.push(stage);
  save();$("stageDialog").close();renderAll();
}
function openPlace(place={}){
  $("placeId").value=place.id||"";
  $("placeName").value=place.name||"";
  $("placeCategory").value=place.category||"camping";
  $("placeLat").value=place.lat??"";
  $("placeLng").value=place.lng??"";
  $("placeNotes").value=place.notes||"";
  $("placeVerified").checked=!!place.verified;
  $("placeDialog").showModal();
}
function savePlace(event){
  event.preventDefault();
  const id=Number($("placeId").value)||Date.now();
  const place={id,name:$("placeName").value.trim(),category:$("placeCategory").value,lat:Number($("placeLat").value),lng:Number($("placeLng").value),notes:$("placeNotes").value.trim(),verified:$("placeVerified").checked};
  if(!place.name||!Number.isFinite(place.lat)||!Number.isFinite(place.lng))return;
  const index=state.places.findIndex(p=>p.id===id);
  if(index>=0)state.places[index]=place;else state.places.push(place);
  save();$("placeDialog").close();renderAll();
}

function initMap(){
  if(map||typeof L==="undefined")return;
  map=L.map("mapCanvas").setView([51.2,10.4],6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap-Mitwirkende"}).addTo(map);
  trackLayer=L.layerGroup().addTo(map);
  markerLayer=L.layerGroup().addTo(map);
  map.on("click",event=>{
    if(confirm("An dieser Stelle einen neuen Ort anlegen?"))openPlace({lat:event.latlng.lat,lng:event.latlng.lng});
  });
}
function renderMap(){
  if(!map)return;
  trackLayer.clearLayers();markerLayer.clearLayers();
  if(state.gpx?.points?.length){
    const coords=state.gpx.points.map(p=>[p.lat,p.lng]);
    const line=L.polyline(coords,{weight:4}).addTo(trackLayer);
    map.fitBounds(line.getBounds(),{padding:[20,20]});
  }
  state.places.forEach(place=>{
    L.marker([place.lat,place.lng]).addTo(markerLayer).bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${categoryName(place.category)}${place.verified?"<br>Selbst geprüft":""}`);
  });
}
function parseGpx(text,name){
  const xml=new DOMParser().parseFromString(text,"application/xml");
  if(xml.querySelector("parsererror"))throw new Error("Ungültige GPX-Datei");
  const nodes=[...xml.querySelectorAll("trkpt, rtept")];
  const points=nodes.map(node=>({lat:Number(node.getAttribute("lat")),lng:Number(node.getAttribute("lon"))})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  if(points.length<2)throw new Error("Keine Trackpunkte gefunden");
  let distance=0;
  for(let i=1;i<points.length;i++)distance+=haversine(points[i-1],points[i]);
  return {name,points,distanceKm:distance};
}
function haversine(a,b){
  const R=6371,toRad=v=>v*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lng-a.lng);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function renderGpxInfo(){
  $("gpxInfo").textContent=state.gpx?`${state.gpx.name}: ${state.gpx.points.length} Trackpunkte, ca. ${state.gpx.distanceKm.toFixed(1)} km`:"Noch kein GPX-Track importiert.";
}

function bindEvents(){
  $("stageSection").innerHTML=state.sections.map(section=>`<option>${escapeHtml(section)}</option>`).join("");
  $("addStageBtn").addEventListener("click",()=>openStage());
  $("stageForm").addEventListener("submit",saveStage);
  $("stageSearch").addEventListener("input",renderStages);
  $("stageFilter").addEventListener("change",renderStages);
  $("stageList").addEventListener("click",event=>{
    const edit=event.target.dataset.editStage,toggle=event.target.dataset.toggleStage,remove=event.target.dataset.deleteStage;
    if(edit)openStage(state.stages.find(s=>s.id===Number(edit)));
    if(toggle){const stage=state.stages.find(s=>s.id===Number(toggle));stage.completed=!stage.completed;save();renderAll()}
    if(remove&&confirm("Etappe wirklich löschen?")){state.stages=state.stages.filter(s=>s.id!==Number(remove));save();renderAll()}
  });
  $("addPlaceBtn").addEventListener("click",()=>openPlace());
  $("placeForm").addEventListener("submit",savePlace);
  $("placeSearch").addEventListener("input",renderPlaces);
  $("placeFilter").addEventListener("change",renderPlaces);
  $("placeList").addEventListener("click",event=>{
    const show=event.target.dataset.showPlace,edit=event.target.dataset.editPlace,remove=event.target.dataset.deletePlace;
    if(show){document.querySelector('[data-page="map"]').click();setTimeout(()=>{const p=state.places.find(x=>x.id===Number(show));map.setView([p.lat,p.lng],14)},80)}
    if(edit)openPlace(state.places.find(p=>p.id===Number(edit)));
    if(remove&&confirm("Ort wirklich löschen?")){state.places=state.places.filter(p=>p.id!==Number(remove));save();renderAll()}
  });
  document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>$(btn.dataset.close).close()));
  $("saveSettingsBtn").addEventListener("click",()=>{
    state.tour.name=$("tourNameInput").value.trim()||state.tour.name;
    state.tour.arrivalDate=$("arrivalInput").value;
    state.tour.startDate=$("startInput").value;
    state.tour.targetDate=$("targetInput").value;
    state.tour.restDays=Number($("restDaysInput").value||0);
    save();renderAll();
  });
  $("gpxInput").addEventListener("change",async event=>{
    const file=event.target.files[0];if(!file)return;
    try{state.gpx=parseGpx(await file.text(),file.name);save();renderAll();renderGpxInfo();initMap();renderMap()}catch(error){alert(error.message)}
  });
  $("clearGpxBtn").addEventListener("click",()=>{if(confirm("Importierten GPX-Track entfernen?")){state.gpx=null;save();renderAll();renderGpxInfo()}});
  $("locateBtn").addEventListener("click",()=>{
    initMap();
    navigator.geolocation?.getCurrentPosition(position=>{
      const coords=[position.coords.latitude,position.coords.longitude];
      if(userMarker)userMarker.remove();
      userMarker=L.marker(coords).addTo(map).bindPopup("Meine Position").openPopup();
      map.setView(coords,14);
    },()=>alert("Position konnte nicht bestimmt werden."));
  });
  $("exportBtn").addEventListener("click",()=>{
    const link=document.createElement("a");
    link.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));
    link.download="3113-adventures-v2-backup.json";link.click();URL.revokeObjectURL(link.href);
  });
  $("importInput").addEventListener("change",async event=>{
    const file=event.target.files[0];if(!file)return;
    try{state=normalize(JSON.parse(await file.text()));save();renderAll();renderGpxInfo()}catch(e){alert("Backup konnte nicht gelesen werden.")}
  });
  $("resetBtn").addEventListener("click",()=>{if(confirm("Alle eigenen Daten und den GPX-Track löschen?")){state=clone(window.APP_DEFAULT_DATA);save();renderAll();renderGpxInfo()}});
  $("refreshBtn").addEventListener("click",async()=>{
    if("serviceWorker"in navigator){for(const reg of await navigator.serviceWorker.getRegistrations())await reg.unregister()}
    if("caches"in window){for(const name of await caches.keys())await caches.delete(name)}
    location.href="./?v=200";
  });
}
function start(){
  initNavigation();bindEvents();renderAll();renderGpxInfo();
  if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js?v=200");
}
document.addEventListener("DOMContentLoaded",start);
})();