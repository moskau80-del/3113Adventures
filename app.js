(() => {
"use strict";
const STORAGE_KEY="3113-adventures-v210";
const KNOWN_LEGACY_KEYS=[
  "3113-adventures-v202","3113-adventures-v201","3113-adventures-v2",
  "a3113-v14","a3113-v141","a3113-v13","a3113-v12","a3113-v121","a3113-v11",
  "adventures3113_v1","3113Adventures","3113-adventures"
];
const $=id=>document.getElementById(id);
let state=loadState();
let map=null,trackLayer=null,markerLayer=null,userMarker=null;

function clone(v){return JSON.parse(JSON.stringify(v))}
function loadState(){
  const current=localStorage.getItem(STORAGE_KEY);
  if(current){
    try{return normalize(JSON.parse(current))}catch(e){}
  }

  const candidates=[];
  for(const key of KNOWN_LEGACY_KEYS){
    const raw=localStorage.getItem(key);
    if(raw){
      try{candidates.push(JSON.parse(raw))}catch(e){}
    }
  }

  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key || key===STORAGE_KEY || KNOWN_LEGACY_KEYS.includes(key)) continue;
    const raw=localStorage.getItem(key);
    if(!raw) continue;
    try{
      const parsed=JSON.parse(raw);
      if(parsed && typeof parsed==="object" && (
        Array.isArray(parsed.stages) ||
        Array.isArray(parsed.places) ||
        parsed.gpx ||
        parsed.tour
      )){
        candidates.push(parsed);
      }
    }catch(e){}
  }

  const merged=clone(window.APP_DEFAULT_DATA);
  for(const candidate of candidates){
    mergeLegacyInto(merged,candidate);
  }
  return merged;
}
function mergeLegacyInto(base,raw){
  if(raw.tour && typeof raw.tour==="object"){
    base.tour={...base.tour,...raw.tour};
  }
  if(raw.arrival) base.tour.arrivalDate=raw.arrival;
  if(raw.start) base.tour.startDate=raw.start;
  if(raw.target) base.tour.targetDate=raw.target;
  if(Number.isFinite(Number(raw.restDays))) base.tour.restDays=Number(raw.restDays);

  if(Array.isArray(raw.stages) && raw.stages.length){
    base.stages=raw.stages;
  }
  if(Array.isArray(raw.places) && raw.places.length){
    base.places=raw.places;
  }

  if(raw.gpx){
    base.gpx=normalizeGpx(raw.gpx);
  }else if(raw.track && Array.isArray(raw.track)){
    base.gpx=normalizeGpx({name:"Importierter Track",points:raw.track});
  }else if(Array.isArray(raw.gpxPoints)){
    base.gpx=normalizeGpx({name:"Importierter Track",points:raw.gpxPoints});
  }
}
function normalizeGpx(gpx){
  if(!gpx) return null;
  const points=(gpx.points||gpx.trackPoints||gpx.coords||[]).map(p=>{
    if(Array.isArray(p)) return {lat:Number(p[0]),lng:Number(p[1])};
    return {
      lat:Number(p.lat ?? p.latitude),
      lng:Number(p.lng ?? p.lon ?? p.longitude)
    };
  }).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));

  let distanceKm=Number(gpx.distanceKm||gpx.distance||0);
  if(!distanceKm && points.length>1){
    for(let i=1;i<points.length;i++) distanceKm+=haversine(points[i-1],points[i]);
  }

  return points.length ? {
    name:gpx.name||gpx.fileName||"Importierter Track",
    points,
    distanceKm
  } : null;
}
function normalize(raw){
  const base=clone(window.APP_DEFAULT_DATA);
  mergeLegacyInto(base,raw||{});
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
      if(button.dataset.page==="map") setTimeout(()=>{if(initMap()){map.invalidateSize();renderMap()}},100);
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

function renderSections(){
  renderSectionProgress();
  const searchElement=$("sectionSearch");
  const filterElement=$("sectionFilter");
  if(!searchElement || !filterElement || !$("sectionList")) return;

  const search=searchElement.value.trim().toLowerCase();
  const filter=filterElement.value;
  let sections=[...(state.sections||[])];

  sections=sections.filter(section=>section.toLowerCase().includes(search));
  if(filter==="heid") sections=sections.filter(section=>section==="Heidschnuckenweg");

  $("sectionList").innerHTML=sections.length
    ? sections.map(section=>{
        const originalIndex=(state.sections||[]).indexOf(section)+1;
        const isHeid=section==="Heidschnuckenweg";
        return `<article class="section-card ${isHeid?"heid":""}">
          <h3><span class="section-number">${originalIndex}</span>${escapeHtml(section)}</h3>
          ${isHeid?'<span class="pill verified">Speziell markiert</span>':""}
        </article>`;
      }).join("")
    : '<div class="empty">Keine passenden Abschnitte.</div>';
}


function renderSectionProgress(){
  const container=$("sectionProgress");
  if(!container) return;

  const groups=(state.sections||[]).map(section=>{
    const stages=state.stages.filter(stage=>stage.section===section && !stage.restDay);
    const planned=totalStageKm(stages);
    const completed=totalStageKm(stages.filter(stage=>stage.completed));
    return {section,planned,completed,count:stages.length};
  }).filter(group=>group.count>0);

  container.innerHTML=groups.length
    ? groups.map(group=>{
        const percent=group.planned?Math.min(100,group.completed/group.planned*100):0;
        return `<div class="section-progress-row">
          <div class="section-progress-head">
            <strong>${escapeHtml(group.section)}</strong>
            <span>${group.completed.toFixed(1)} / ${group.planned.toFixed(1)} km</span>
          </div>
          <div class="mini-progress"><span style="width:${percent}%"></span></div>
        </div>`;
      }).join("")
    : '<p class="muted">Noch keine Etappen einem Abschnitt zugeordnet.</p>';
}

function pointDistance(a,b){
  return haversine({lat:a.lat,lng:a.lng},{lat:b.lat,lng:b.lng});
}

function interpolatePoint(a,b,fraction){
  return {
    lat:a.lat+(b.lat-a.lat)*fraction,
    lng:a.lng+(b.lng-a.lng)*fraction
  };
}

function splitTrackByDistance(points,targetKm){
  if(!Array.isArray(points)||points.length<2) return [];
  const segments=[];
  let current=[points[0]];
  let accumulated=0;

  for(let i=1;i<points.length;i++){
    let previous=points[i-1];
    const next=points[i];
    let remainingSegment=pointDistance(previous,next);

    while(accumulated+remainingSegment>=targetKm && remainingSegment>0){
      const needed=targetKm-accumulated;
      const fraction=needed/remainingSegment;
      const cut=interpolatePoint(previous,next,fraction);
      current.push(cut);
      segments.push(current);
      current=[cut];
      previous=cut;
      remainingSegment=pointDistance(previous,next);
      accumulated=0;
    }

    current.push(next);
    accumulated+=remainingSegment;
  }

  if(current.length>1) segments.push(current);
  return segments;
}

function addDays(dateString,days){
  const date=new Date(dateString+"T12:00:00");
  date.setDate(date.getDate()+days);
  return date.toISOString().slice(0,10);
}

function nearestSectionForIndex(index,total){
  const sections=state.sections||[];
  if(!sections.length) return "";
  const ratio=total<=1?0:index/(total-1);
  return sections[Math.min(sections.length-1,Math.floor(ratio*sections.length))];
}

function generateStagesFromGpx(){
  if(!state.gpx?.points?.length){
    alert("Bitte zuerst unter Karte einen GPX-Track importieren.");
    return;
  }

  const targetKm=Number($("plannerKm").value||28);
  const restEvery=Number($("plannerRestEvery").value||0);
  if(targetKm<5){
    alert("Bitte mindestens 5 km als Tagesdistanz wählen.");
    return;
  }

  const existingGenerated=state.stages.filter(stage=>stage.generated);
  if(existingGenerated.length && !confirm("Bereits automatisch erzeugte Etappen ersetzen?")){
    return;
  }

  state.stages=state.stages.filter(stage=>!stage.generated);
  const chunks=splitTrackByDistance(state.gpx.points,targetKm);
  let date=state.tour.startDate;
  let walkingCounter=0;
  let number=1;

  chunks.forEach((chunk,index)=>{
    if(restEvery>0 && walkingCounter>0 && walkingCounter%restEvery===0){
      state.stages.push({
        id:Date.now()+number++,
        date,
        section:nearestSectionForIndex(index,chunks.length),
        from:"Ruhetag",
        to:"Ruhetag",
        km:0,
        up:0,
        down:0,
        overnight:"",
        notes:"Automatisch eingefügter Ruhetag",
        completed:false,
        restDay:true,
        generated:true
      });
      date=addDays(date,1);
    }

    const startPoint=chunk[0];
    const endPoint=chunk[chunk.length-1];
    let km=0;
    for(let i=1;i<chunk.length;i++) km+=pointDistance(chunk[i-1],chunk[i]);

    state.stages.push({
      id:Date.now()+number++,
      date,
      section:nearestSectionForIndex(index,chunks.length),
      from:`Etappe ${index+1} Start`,
      to:`Etappe ${index+1} Ziel`,
      km:Number(km.toFixed(1)),
      up:0,
      down:0,
      overnight:"",
      notes:`Start: ${startPoint.lat.toFixed(5)}, ${startPoint.lng.toFixed(5)} · Ziel: ${endPoint.lat.toFixed(5)}, ${endPoint.lng.toFixed(5)}`,
      completed:false,
      restDay:false,
      generated:true,
      startCoord:startPoint,
      endCoord:endPoint
    });

    walkingCounter++;
    date=addDays(date,1);
  });

  save();
  renderAll();
  renderPlannerInfo();
}

function renderPlannerInfo(){
  const box=$("plannerInfo");
  if(!box) return;

  if(!state.gpx?.points?.length){
    box.textContent="Für die automatische Planung zuerst einen GPX-Track importieren.";
    return;
  }

  const generated=state.stages.filter(stage=>stage.generated);
  const walking=generated.filter(stage=>!stage.restDay);
  const rest=generated.filter(stage=>stage.restDay);
  box.innerHTML=generated.length
    ? `<strong>${walking.length} automatische Wandertage</strong> und ${rest.length} Ruhetage · ${totalStageKm(walking).toFixed(1)} km`
    : `GPX bereit: ${state.gpx.points.length} Trackpunkte, ca. ${Number(state.gpx.distanceKm||0).toFixed(1)} km.`;
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
      ${s.completed?'<span class="pill verified">Abgeschlossen</span>':""}${s.generated?'<span class="pill">Automatisch</span>':""}${s.restDay?'<span class="pill">Ruhetag</span>':""}
      <p>↑ ${Number(s.up||0)} m · ↓ ${Number(s.down||0)} m</p>
      <p><strong>Übernachtung:</strong> ${escapeHtml(s.overnight||"–")}</p>
      ${s.notes?`<p class="muted">${escapeHtml(s.notes)}</p>`:""}
      <div class="card-actions">${s.startCoord?`<button data-show-stage="${s.id}">Auf Karte</button>`:""}<button data-edit-stage="${s.id}">Bearbeiten</button><button data-toggle-stage="${s.id}">${s.completed?"Wieder öffnen":"Abschliessen"}</button><button class="danger" data-delete-stage="${s.id}">Löschen</button></div>
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
function renderAll(){renderDashboard();renderSections();renderStages();renderPlaces();fillSettings();renderPlannerInfo();if(map)renderMap()}

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
  const mapError=$("mapError");

  if(typeof window.L==="undefined"){
    if(mapError){
      mapError.hidden=false;
      mapError.innerHTML="<strong>Karte konnte nicht geladen werden.</strong><p>Die Kartenbibliothek ist nicht erreichbar. Bitte Internetverbindung prüfen und unter Einstellungen die App-Dateien aktualisieren.</p>";
    }
    return false;
  }

  if(map){
    map.invalidateSize();
    return true;
  }

  if(mapError) mapError.hidden=true;

  try{
    map=L.map("mapCanvas",{zoomControl:true}).setView([51.2,10.4],6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      attribution:"&copy; OpenStreetMap-Mitwirkende"
    }).addTo(map);

    trackLayer=L.layerGroup().addTo(map);
    markerLayer=L.layerGroup().addTo(map);

    map.on("click",event=>{
      if(confirm("An dieser Stelle einen neuen Ort anlegen?")){
        openPlace({lat:event.latlng.lat,lng:event.latlng.lng});
      }
    });

    setTimeout(()=>map.invalidateSize(),100);
    return true;
  }catch(error){
    if(mapError){
      mapError.hidden=false;
      mapError.innerHTML=`<strong>Kartenfehler</strong><p>${escapeHtml(error.message||"Unbekannter Fehler")}</p>`;
    }
    return false;
  }
}
function renderMap(){
  if(!map || !trackLayer || !markerLayer)return;
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
  if($("sectionSearch")) $("sectionSearch").addEventListener("input",renderSections);
  if($("sectionFilter")) $("sectionFilter").addEventListener("change",renderSections);
  $("stageSection").innerHTML=state.sections.map(section=>`<option>${escapeHtml(section)}</option>`).join("");
  $("addStageBtn").addEventListener("click",()=>openStage());
  $("generateStagesBtn").addEventListener("click",generateStagesFromGpx);
  $("deleteGeneratedBtn").addEventListener("click",()=>{
    const count=state.stages.filter(stage=>stage.generated).length;
    if(!count){alert("Keine automatisch erzeugten Etappen vorhanden.");return}
    if(confirm(`${count} automatisch erzeugte Einträge löschen?`)){
      state.stages=state.stages.filter(stage=>!stage.generated);
      save();
      renderAll();
    }
  });
  $("stageForm").addEventListener("submit",saveStage);
  $("stageSearch").addEventListener("input",renderStages);
  $("stageFilter").addEventListener("change",renderStages);
  $("stageList").addEventListener("click",event=>{
    const show=event.target.dataset.showStage,edit=event.target.dataset.editStage,toggle=event.target.dataset.toggleStage,remove=event.target.dataset.deleteStage;
    if(show){
      const stage=state.stages.find(s=>s.id===Number(show));
      if(stage?.startCoord){
        document.querySelector('[data-page="map"]').click();
        setTimeout(()=>{
          initMap();
          map.setView([stage.startCoord.lat,stage.startCoord.lng],13);
          L.marker([stage.startCoord.lat,stage.startCoord.lng]).addTo(map).bindPopup(`${escapeHtml(stage.from)} → ${escapeHtml(stage.to)}`).openPopup();
        },150);
      }
    }
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
    location.href="./?v=210";
  });
}
function start(){
  initNavigation();bindEvents();renderAll();renderGpxInfo();
  if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js?v=210");
}
document.addEventListener("DOMContentLoaded",start);
})();