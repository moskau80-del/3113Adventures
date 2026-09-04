import {
  openDatabase,
  getSetting,
  setSetting,
  getAllTours,
  saveTour,
  deleteTour,
  getActiveTour,
  seedDefaultTour,
  saveTrack,
  getTrack,
  deleteTrack,
  getAllSettings,
  clearAppDatabase
} from "./database.js?v=41098";

import { loadLanguage, translate } from "./i18n.js?v=41098";
import { parseGpx, createPreviewSvg } from "./gpx.js?v=41098";
import { splitTrack, calculateStage, addDays, saveStagesLocal, loadStagesLocal, deleteStagesLocal, updateStageLocal, deleteStageLocal, recalculateStageDates, insertRestDayLocal, deleteRestDayLocal, splitStageLocal, mergeStageWithNextLocal, distributeRestDays, getStageStorageInfo, saveShoeIntervalLocal, loadShoeIntervalLocal, getShoeChangeMarkers, getNextShoeChangeKm } from "./stages.js?v=41098";
import { loadGearLocal, saveGearLocal, upsertGearLocal, deleteGearLocal, loadPackNamesLocal, savePackNamesLocal, loadTourPersonPackLocal, toggleGearInPersonPackLocal, updatePersonPackItemLocal, packedQuantityAcrossPersons, availableQuantityForPerson, loadTourShoePersonLocal, saveTourShoePersonLocal } from "./gear.js?v=41098";
import { loadPlacesLocal, savePlacesLocal, addPlaceLocal, deletePlaceLocal, toggleFavoriteLocal, setPreferredStartLocal, setPreferredEndLocal, clearPreferredStartLocal, clearPreferredEndLocal, getPreferredStartForStage, getPreferredEndForStage, getPlacesForStage, distanceToStageKm, buildOverpassQuery, boundsForStage, normalizeOverpassElement, stageSearchWindows, dedupePlaces } from "./places.js?v=41098";

const navButtons = document.querySelectorAll(".main-nav button");
const pages = document.querySelectorAll(".page");
const languageSelect = document.getElementById("languageSelect");
const themeSelect = document.getElementById("themeSelect");
const settingsStatus = document.getElementById("settingsStatus");
const databaseStatus = document.getElementById("databaseStatus");
const tourDialog = document.getElementById("tourDialog");
const tourForm = document.getElementById("tourForm");
let map = null;
let trackLayer = null;
let activeBaseLayer = null;
let activeHikingOverlay = null;
const MAP_STYLE_KEY="3113-map-style-v1";
let userMarker = null;
const stageDialog = document.getElementById("stageDialog");
const stageForm = document.getElementById("stageForm");
const splitStageDialog = document.getElementById("splitStageDialog");
const splitStageForm = document.getElementById("splitStageForm");
let currentMapStageId = null;
let currentSupplyStageId=null;
let currentSupplyCategory="accommodation";
let currentSupplyResults=[];
let pendingPreferredDestinationStageId=null;
let pendingPreferredStartStageId=null;
let placeFilter="all";

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    navButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    pages.forEach((page) => {
      page.classList.toggle("active", page.id === button.dataset.page);
    });

    if (button.dataset.page === "map") {
      setTimeout(async () => {
        initMap();
        if (map) {
          map.invalidateSize();
          await renderMapTrack();
        }
      }, 100);
    }
  });
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById(button.dataset.close)?.close();
  });
});

function applyTheme(theme) {
  if (theme === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    return;
  }

  document.documentElement.dataset.theme = theme;
}

function formatDate(value) {
  if (!value) return "–";

  const locale = document.documentElement.lang === "en" ? "en-GB" : "de-CH";
  return new Intl.DateTimeFormat(locale).format(new Date(`${value}T12:00:00`));
}


function setTextSafe(id,value){
  const element=document.getElementById(id);
  if(element) element.textContent=String(value??"");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function normalizeKomootUrl(value){
  const raw=String(value||"").trim();
  if(!raw) return "";
  try{
    const url=new URL(raw);
    const host=url.hostname.toLowerCase();
    if(url.protocol!=="https:" || !(host==="komoot.com" || host.endsWith(".komoot.com"))){
      throw new Error("Bitte einen gültigen https://www.komoot.com/... Link verwenden.");
    }
    return url.href;
  }catch(error){
    throw new Error("Ungültiger Komoot-Link. Bitte den vollständigen Collection-Link einfügen.");
  }
}

function buildCombinedGpx(name,points){
  const esc=(v)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const trkpts=points.map(point=>`<trkpt lat="${Number(point.lat).toFixed(7)}" lon="${Number(point.lng).toFixed(7)}">${Number.isFinite(Number(point.elevation))?`<ele>${Number(point.elevation).toFixed(1)}</ele>`:""}</trkpt>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="3113 Adventures" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(name)}</name><trkseg>${trkpts}</trkseg></trk></gpx>`;
}

function cleanStageName(filename){
  return String(filename||"Komoot-Etappe").replace(/\.gpx$/i,"").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
}


async function renderDashboardStats(){
  const activeTour=await getActiveTour();

  const stageCount=document.getElementById("dashStageCount");
  const restCount=document.getElementById("dashRestCount");
  const plannedKm=document.getElementById("dashPlannedKm");
  const remainingKm=document.getElementById("dashRemainingKm");
  const progressLabel=document.getElementById("dashProgressLabel");
  const progressBar=document.getElementById("dashProgressBar");
  const nextStage=document.getElementById("dashNextStage");
  const nextPreferredPlace=document.getElementById("dashNextPreferredPlace");

  if(!activeTour){
    stageCount.textContent="0";
    restCount.textContent="0";
    plannedKm.textContent="0 km";
    remainingKm.textContent="0 km";
    progressLabel.textContent="0 %";
    progressBar.style.width="0%";
    nextStage.textContent="Noch keine aktive Tour.";
    if(nextPreferredPlace) nextPreferredPlace.textContent="Noch keine aktive Tour.";
    return;
  }

  const stages=loadStagesLocal(activeTour.id);
  const walking=stages.filter(stage=>!stage.restDay);
  const rests=stages.filter(stage=>stage.restDay);

  const totalKm=walking.reduce(
    (sum,stage)=>sum+Number(stage.distanceKm||0),
    0
  );

  const completedKm=walking
    .filter(stage=>stage.completed)
    .reduce((sum,stage)=>sum+Number(stage.distanceKm||0),0);

  const remaining=Math.max(0,totalKm-completedKm);
  const percent=totalKm>0?Math.min(100,(completedKm/totalKm)*100):0;

  stageCount.textContent=String(walking.length);
  restCount.textContent=String(rests.length);
  plannedKm.textContent=`${totalKm.toFixed(1)} km`;
  remainingKm.textContent=`${remaining.toFixed(1)} km`;
  progressLabel.textContent=`${percent.toFixed(0)} %`;
  progressBar.style.width=`${percent}%`;

  const walkingStages=stages
    .filter(stage=>!stage.restDay)
    .sort((a,b)=>{
      const orderA=Number(a.order||0);
      const orderB=Number(b.order||0);
      return orderA-orderB;
    });

  const next=walkingStages.find(stage=>stage.completed!==true);

  if(!next){
    nextStage.innerHTML=walkingStages.length
      ? "<strong>Alle Wanderetappen abgeschlossen.</strong>"
      : "Noch keine geplante Etappe vorhanden.";
    if(nextPreferredPlace) nextPreferredPlace.textContent="Kein weiterer Stopp geplant.";
    return;
  }

  const preferredPlace=getPreferredEndForStage(activeTour.id,next.id);
  if(nextPreferredPlace){
    nextPreferredPlace.innerHTML=preferredPlace
      ? `<div class="next-stage-card"><strong>${escapeHtml(preferredPlace.name)}</strong><span>${escapeHtml(preferredPlace.category)}</span><span>${Number(preferredPlace.distanceKm||0).toFixed(2)} km von der Etappe</span></div>`
      : "Für die nächste Etappe ist noch kein bevorzugter Ort festgelegt.";
  }

  nextStage.innerHTML=`
    <div class="next-stage-card">
      <strong>${escapeHtml(next.name)}</strong>
      <span>${formatDate(next.date)}</span>
      <span>${escapeHtml(next.from)} → ${escapeHtml(next.to)}</span>
      <span>${Number(next.distanceKm||0).toFixed(1)} km · ↑ ${Math.round(next.ascentM||0)} m · ↓ ${Math.round(next.descentM||0)} m</span>
    </div>
  `;
}

async function renderTours() {
  const tours = (await getAllTours()).sort((a, b) => a.name.localeCompare(b.name));
  const container = document.getElementById("tourList");

  container.innerHTML = tours.length
    ? tours.map((tour) => `
      <article class="tour-card ${tour.active ? "active-tour" : ""}">
        <h3>${escapeHtml(tour.name)}</h3>
        ${tour.active
          ? `<span class="pill">${translate("tours.activeLabel", "Aktive Tour")}</span>`
          : ""}
        <div class="tour-meta">
          <span class="pill">${formatDate(tour.startDate)} → ${formatDate(tour.targetDate)}</span>
          <span class="pill">${Number(tour.distanceKm || 0).toFixed(1)} km</span>
        </div>
        <p>${escapeHtml(tour.description || "")}</p>
        ${tour.komootCollectionUrl ? `<p><a class="komoot-link" href="${escapeHtml(tour.komootCollectionUrl)}" target="_blank" rel="noopener noreferrer">↗ Komoot-Collection öffnen</a></p>` : ""}
        <div class="card-actions">
          ${tour.active
            ? ""
            : `<button data-activate-tour="${tour.id}">${translate("tours.activate", "Aktivieren")}</button>`}
          <button data-edit-tour="${tour.id}">${translate("tours.edit", "Bearbeiten")}</button>
          <button class="danger" data-delete-tour="${tour.id}">${translate("tours.delete", "Löschen")}</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty">${translate("tours.noTours", "Noch keine Touren vorhanden.")}</div>`;

  const activeTour = await getActiveTour();
  const dashboard = document.getElementById("currentTourCard");

  dashboard.innerHTML = activeTour
    ? `
      <strong>${escapeHtml(activeTour.name)}</strong>
      <p>${formatDate(activeTour.startDate)} → ${formatDate(activeTour.targetDate)}</p>
      <p>${Number(activeTour.distanceKm || 0).toFixed(1)} km</p>
      ${activeTour.komootCollectionUrl ? `<p><a class="komoot-link" href="${escapeHtml(activeTour.komootCollectionUrl)}" target="_blank" rel="noopener noreferrer">↗ Komoot-Collection</a></p>` : ""}
    `
    : translate("dashboard.noTour", "Noch keine Tour ausgewählt.");
}

function openTourDialog(tour = {}) {
  document.getElementById("tourId").value = tour.id || "";
  document.getElementById("tourName").value = tour.name || "";
  document.getElementById("tourDescription").value = tour.description || "";
  document.getElementById("tourStart").value = tour.startDate || "";
  document.getElementById("tourTarget").value = tour.targetDate || "";
  document.getElementById("tourDistance").value = tour.distanceKm ?? "";
  document.getElementById("tourKomootCollection").value = tour.komootCollectionUrl || "";
  document.getElementById("tourActive").checked = Boolean(tour.active);
  tourDialog.showModal();
}

document.getElementById("addTourBtn")?.addEventListener("click", () => {
  openTourDialog();
});

tourForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const existingId = document.getElementById("tourId").value;
  const now = new Date().toISOString();

  await saveTour({
    id: existingId || `tour-${Date.now()}`,
    name: document.getElementById("tourName").value.trim(),
    description: document.getElementById("tourDescription").value.trim(),
    startDate: document.getElementById("tourStart").value,
    targetDate: document.getElementById("tourTarget").value,
    distanceKm: Number(document.getElementById("tourDistance").value || 0),
    komootCollectionUrl: normalizeKomootUrl(document.getElementById("tourKomootCollection").value),
    active: document.getElementById("tourActive").checked,
    createdAt: now,
    updatedAt: now
  });

  tourDialog.close();
  await renderTours();
  await renderGpx();

  const activeTour=await getActiveTour();
  if(activeTour){
    document.getElementById("stageStartDate").value=activeTour.startDate||"";
  }

  await renderStages();
  if (document.getElementById('map').classList.contains('active')) {
    await renderMapTrack();
  }
});

document.getElementById("tourList")?.addEventListener("click", async (event) => {
  const activateId = event.target.dataset.activateTour;
  const editId = event.target.dataset.editTour;
  const deleteId = event.target.dataset.deleteTour;
  const tours = await getAllTours();

  if (activateId) {
    const tour = tours.find((item) => item.id === activateId);

    if (tour) {
      await saveTour({
        ...tour,
        active: true,
        updatedAt: new Date().toISOString()
      });
    }
  }

  if (editId) {
    const tour = tours.find((item) => item.id === editId);

    if (tour) {
      openTourDialog(tour);
    }

    return;
  }

  if (deleteId && confirm(translate("tours.confirmDelete", "Tour wirklich löschen?"))) {
    await deleteTour(deleteId);
  }

  await renderTours();
  await renderGpx();

  const activeTour=await getActiveTour();
  if(activeTour){
    document.getElementById("stageStartDate").value=activeTour.startDate||"";
  }

  await renderStages();
  if (document.getElementById('map').classList.contains('active')) {
    await renderMapTrack();
  }
});


function createMapLayers(){
  const standard=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:19,
    attribution:'&copy; OpenStreetMap-Mitwirkende'
  });

  const topo=L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",{
    maxZoom:17,
    attribution:'Kartendaten &copy; OpenStreetMap-Mitwirkende · SRTM | Kartenstil &copy; OpenTopoMap (CC-BY-SA)'
  });

  const hikingBase=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:19,
    attribution:'&copy; OpenStreetMap-Mitwirkende'
  });

  const hikingOverlay=L.tileLayer("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png",{
    maxZoom:18,
    opacity:.9,
    attribution:'Wanderrouten &copy; Waymarked Trails'
  });

  return {standard,topo,hikingBase,hikingOverlay};
}

function currentMapStyle(){
  return localStorage.getItem(MAP_STYLE_KEY)||"standard";
}

function applyMapStyle(style){
  if(!map||!window.L) return;

  if(activeBaseLayer){
    map.removeLayer(activeBaseLayer);
    activeBaseLayer=null;
  }
  if(activeHikingOverlay){
    map.removeLayer(activeHikingOverlay);
    activeHikingOverlay=null;
  }

  const layers=createMapLayers();

  if(style==="topo"){
    activeBaseLayer=layers.topo.addTo(map);
  }else if(style==="hiking"){
    activeBaseLayer=layers.hikingBase.addTo(map);
    activeHikingOverlay=layers.hikingOverlay.addTo(map);
  }else{
    activeBaseLayer=layers.standard.addTo(map);
    style="standard";
  }

  localStorage.setItem(MAP_STYLE_KEY,style);

  document.querySelectorAll("[data-map-style]").forEach(button=>{
    button.classList.toggle("active",button.dataset.mapStyle===style);
  });
}

function initMap() {
  if (map) return true;

  const canvas = document.getElementById("mapCanvas");

  if (!window.L) {
    canvas.innerHTML = `<div class="map-empty">${translate(
      "map.noLibrary",
      "Die Kartenbibliothek konnte nicht geladen werden."
    )}</div>`;
    return false;
  }

  map = L.map("mapCanvas", {
    zoomControl: true
  }).setView([51.2, 10.4], 6);

  applyMapStyle(currentMapStyle());

  trackLayer = L.layerGroup().addTo(map);
  return true;
}

async function renderMapTrack() {
  if (!initMap()) return;

  trackLayer.clearLayers();

  const activeTour = await getActiveTour();

  if (!activeTour) return;

  const track = await getTrack(activeTour.id);

  if (!track?.points?.length) return;

  const coordinates = track.points.map((point) => [point.lat, point.lng]);
  const line = L.polyline(coordinates, {
    weight: 4
  }).addTo(trackLayer);

  const first = track.points[0];
  const last = track.points.at(-1);

  L.marker([first.lat, first.lng])
    .addTo(trackLayer)
    .bindPopup(`<div class="map-popup"><strong>${translate("gpx.start", "Start")}</strong>${first.lat.toFixed(5)}, ${first.lng.toFixed(5)}</div>`);

  L.marker([last.lat, last.lng])
    .addTo(trackLayer)
    .bindPopup(`<div class="map-popup"><strong>${translate("gpx.end", "Ziel")}</strong>${last.lat.toFixed(5)}, ${last.lng.toFixed(5)}</div>`);

  // Show all planned stages directly on the tour map.
  const stages=loadStagesLocal(activeTour.id).filter(stage=>!stage.restDay);
  stages.forEach((stage,index)=>{
    if(stage.startCoord){
      L.circleMarker([stage.startCoord.lat,stage.startCoord.lng],{
        radius:6,weight:2,fillOpacity:1
      }).addTo(trackLayer)
        .bindPopup(`<div class="map-popup"><strong>Etappe ${index+1}</strong>${escapeHtml(stage.from||"Start")}</div>`);
    }

    if(stage.endCoord){
      L.circleMarker([stage.endCoord.lat,stage.endCoord.lng],{
        radius:7,weight:2,fillOpacity:1
      }).addTo(trackLayer)
        .bindPopup(`<div class="map-popup"><strong>Etappe ${index+1} – Ziel</strong>${escapeHtml(stage.to||"Ziel")}</div>`);
    }

    const preferredStart=getPreferredStartForStage(activeTour.id,stage.id);
    const preferredEnd=getPreferredEndForStage(activeTour.id,stage.id);

    [preferredStart,preferredEnd].filter(Boolean).forEach(place=>{
      if(Number.isFinite(Number(place.lat))&&Number.isFinite(Number(place.lon))){
        L.marker([Number(place.lat),Number(place.lon)])
          .addTo(trackLayer)
          .bindPopup(`<div class="map-popup"><strong>★ ${escapeHtml(place.name)}</strong>${escapeHtml(place.category||"Bevorzugter Ort")}<br>Etappe ${index+1}</div>`);
      }
    });
  });

  map.fitBounds(line.getBounds(), {
    padding: [28, 28]
  });
}

async function renderGpx() {
  const activeTour = await getActiveTour();
  const status = document.getElementById("gpxStatus");
  const pointCount = document.getElementById("gpxPointCount");
  const distance = document.getElementById("gpxDistance");
  const start = document.getElementById("gpxStart");
  const end = document.getElementById("gpxEnd");
  const preview = document.getElementById("trackPreview");

  if (!activeTour) {
    status.textContent = translate("dashboard.noTour", "Noch keine Tour ausgewählt.");
    return;
  }

  const track = await getTrack(activeTour.id);

  if (!track) {
    status.textContent = translate("gpx.noTrack", "Noch kein GPX-Track importiert.");
    pointCount.textContent = "0";
    distance.textContent = "0 km";
    start.textContent = "–";
    end.textContent = "–";
    if (preview) {
      preview.innerHTML = `<p class="muted">${translate(
        "gpx.previewEmpty",
        "Nach dem Import erscheint hier eine einfache Trackvorschau."
      )}</p>`;
    }
    return;
  }

  status.textContent = `${track.name} · ${translate("gpx.imported", "GPX-Track importiert.")}`;
  pointCount.textContent = String(track.points.length);
  distance.textContent = `${Number(track.distanceKm).toFixed(1)} km`;
  start.textContent = `${track.points[0].lat.toFixed(5)}, ${track.points[0].lng.toFixed(5)}`;
  end.textContent = `${track.points.at(-1).lat.toFixed(5)}, ${track.points.at(-1).lng.toFixed(5)}`;
  if (preview) preview.innerHTML = createPreviewSvg(track.points);
}

document.getElementById("gpxInput")?.addEventListener("change", async (event) => {
  const input=event.target;
  const file=input.files?.[0];
  if(!file) return;

  const activeTour=await getActiveTour();

  if(!activeTour){
    alert(translate("dashboard.noTour","Noch keine Tour ausgewählt."));
    input.value="";
    return;
  }

  const status=document.getElementById("gpxStatus");

  try{
    if(status) status.textContent="GPX wird importiert …";

    const text=await file.text();
    const parsed=parseGpx(text,file.name);

    if(!parsed?.points?.length){
      throw new Error("Die GPX-Datei enthält keine verwendbaren Trackpunkte.");
    }

    const trackToSave={
      ...parsed,
      originalText:parsed.originalText||text,
      tourId:activeTour.id,
      importedAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };

    await saveTrack(trackToSave);

    const verified=await getTrack(activeTour.id);
    if(!verified?.points?.length){
      throw new Error("Der GPX-Track konnte nach dem Import nicht aus dem lokalen Speicher gelesen werden.");
    }

    await markIndexedDbChangeAndSync();
    await renderGpx();

    initMap();
    if(map){
      setTimeout(async()=>{
        map.invalidateSize();
        await renderMapTrack();
      },80);
    }

    if(status){
      status.textContent=
        `${verified.name||file.name} · GPX gespeichert · ${verified.points.length} Trackpunkte · ${Number(verified.distanceKm||0).toFixed(1)} km`;
    }
  }catch(error){
    console.error("GPX-Import fehlgeschlagen:",error);
    if(status) status.textContent=`GPX-Import fehlgeschlagen: ${error.message}`;
    alert(`GPX-Import fehlgeschlagen: ${error.message}`);
  }finally{
    input.value="";
  }
});

document.getElementById("komootStageInput")?.addEventListener("change", async (event) => {
  const input=event.target;
  const files=[...(input.files||[])];
  if(!files.length) return;

  const activeTour=await getActiveTour();
  if(!activeTour){
    alert("Bitte zuerst eine Tour aktivieren.");
    input.value="";
    return;
  }

  const status=document.getElementById("komootStageStatus");
  try{
    if(status) status.textContent=`${files.length} Komoot-Etappe(n) werden importiert …`;

    const parsedFiles=[];
    for(const file of files){
      const text=await file.text();
      const parsed=parseGpx(text,file.name);
      if(!parsed?.points?.length) throw new Error(`${file.name}: keine verwendbaren Trackpunkte.`);
      parsedFiles.push({file,parsed,text});
    }

    const existingTrack=await getTrack(activeTour.id);
    const existingStages=loadStagesLocal(activeTour.id);
    let combinedPoints=existingTrack?.points?.length ? [...existingTrack.points] : [];
    const newStages=[...existingStages];
    let nextOrder=newStages.length+1;
    let stageDate=activeTour.startDate ? addDays(activeTour.startDate,newStages.length) : "";

    for(const {file,parsed} of parsedFiles){
      const pts=parsed.points;
      // Avoid an identical duplicate boundary point, but keep the true route geometry.
      if(combinedPoints.length && pts.length){
        const a=combinedPoints[combinedPoints.length-1], b=pts[0];
        if(Math.abs(a.lat-b.lat)<1e-7 && Math.abs(a.lng-b.lng)<1e-7) combinedPoints.push(...pts.slice(1));
        else combinedPoints.push(...pts);
      }else combinedPoints.push(...pts);

      const metrics=calculateStage(pts);
      const stageName=cleanStageName(file.name);
      newStages.push({
        id:`${activeTour.id}-komoot-${Date.now()}-${nextOrder}`,
        tourId:activeTour.id,
        order:nextOrder,
        name:stageName,
        date:stageDate,
        from: nextOrder>1 ? (newStages[newStages.length-1]?.to || "") : "",
        to: stageName,
        distanceKm:metrics.distanceKm,
        ascentM:metrics.ascentM,
        descentM:metrics.descentM,
        walkingHours:metrics.walkingHours,
        startCoord:{lat:pts[0].lat,lng:pts[0].lng},
        endCoord:{lat:pts[pts.length-1].lat,lng:pts[pts.length-1].lng},
        notes:`Komoot-GPX: ${file.name}`,
        completed:false,
        restDay:false
      });
      nextOrder++;
      if(stageDate) stageDate=addDays(stageDate,1);
    }

    const whole=calculateStage(combinedPoints);
    const combinedName=`${activeTour.name} – Komoot Etappen.gpx`;
    await saveTrack({
      id:activeTour.id,
      tourId:activeTour.id,
      name:combinedName,
      points:combinedPoints,
      distanceKm:whole.distanceKm,
      originalText:buildCombinedGpx(combinedName,combinedPoints),
      importedAt:existingTrack?.importedAt||new Date().toISOString(),
      updatedAt:new Date().toISOString()
    });
    saveStagesLocal(activeTour.id,newStages);

    await saveTour({...activeTour,distanceKm:whole.distanceKm,updatedAt:new Date().toISOString()});
    await markIndexedDbChangeAndSync();
    await renderTours();
    await renderGpx();
    await renderStages();
    initMap();
    if(map){ setTimeout(async()=>{map.invalidateSize(); await renderMapTrack();},80); }
    if(status) status.textContent=`Verbunden: ${parsedFiles.length} neue Etappe(n) · total ${newStages.length} Etappen · ${whole.distanceKm.toFixed(1)} km.`;
  }catch(error){
    console.error("Komoot-Etappenimport fehlgeschlagen:",error);
    if(status) status.textContent=`Import fehlgeschlagen: ${error.message}`;
    alert(`Komoot-Etappenimport fehlgeschlagen: ${error.message}`);
  }finally{
    input.value="";
  }
});

document.getElementById("exportGpxBtn")?.addEventListener("click", async () => {
  const activeTour = await getActiveTour();
  if (!activeTour) return;

  const track = await getTrack(activeTour.id);

  if (!track?.originalText) {
    alert(translate("gpx.noTrack", "Noch kein GPX-Track importiert."));
    return;
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([track.originalText], { type: "application/gpx+xml" })
  );
  link.download = track.name || "track.gpx";
  link.click();
  URL.revokeObjectURL(link.href);
});

document.getElementById("deleteGpxBtn")?.addEventListener("click", async () => {
  const activeTour = await getActiveTour();
  if (!activeTour) return;

  if (confirm(translate("gpx.confirmDelete", "GPX-Track wirklich löschen?"))) {
    await deleteTrack(activeTour.id);
    await markIndexedDbChangeAndSync();
    await renderGpx();
    if(trackLayer) trackLayer.clearLayers();
  }
});



document.querySelectorAll("[data-map-style]").forEach(button=>{
  button.addEventListener("click",()=>{
    if(!initMap()) return;
    applyMapStyle(button.dataset.mapStyle);
    setTimeout(()=>{
      if(map) map.invalidateSize();
    },50);
  });
});

document.getElementById("showWholeTrackBtn")?.addEventListener("click", async () => {
  currentMapStageId=null;
  await renderMapTrack();
});

document.getElementById("locateBtn")?.addEventListener("click", () => {
  if (!initMap()) return;

  if (!navigator.geolocation) {
    alert("Geolocation wird von diesem Gerät nicht unterstützt.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const coordinates = [
        position.coords.latitude,
        position.coords.longitude
      ];

      if (userMarker) {
        userMarker.remove();
      }

      userMarker = L.marker(coordinates)
        .addTo(map)
        .bindPopup("Meine Position")
        .openPopup();

      map.setView(coordinates, 14);
    },
    () => {
      alert("Position konnte nicht bestimmt werden.");
    }
  );
});



function formatKg3FromGrams(grams){
  return `${(Number(grams||0)/1000).toFixed(3)} kg`;
}

function formatHours(value){
  const hours=Math.floor(value);
  const minutes=Math.round((value-hours)*60);
  return `${hours} h ${String(minutes).padStart(2,"0")} min`;
}


function footwearBrandHint(place){
  if(place.category!=="footwear") return "";
  const text=[place.name,place.tags?.brand,place.tags?.brands,place.tags?.operator,place.tags?.description]
    .filter(Boolean).join(" ").toLowerCase();
  if(text.includes("decathlon")) return "🏬 Decathlon";
  if(text.includes("topo athletic")||text.includes("topo")) return "👟 Topo Athletic";
  if(text.includes("altra")) return "👟 Altra";
  if(text.includes("salomon")) return "👟 Salomon";
  return "👟 Schuh-/Outdoor-Geschäft";
}

function nearestPlaceByCategory(places,category){
  return places
    .filter(place=>place.category===category)
    .sort((a,b)=>Number(a.distanceKm||0)-Number(b.distanceKm||0))[0]||null;
}



function stageShoeChangeHtml(stage,shoeMarkers){
  const marker=shoeMarkers[stage.id];
  if(!marker) return "";

  return `<div class="shoe-change-alert">
    <strong>👟 Schuhwechsel ungefähr fällig</strong>
    <span>${marker.thresholds.map(km=>`ca. bei km ${Math.round(km)}`).join(" · ")}</span>
  </div>`;
}

function stagePlanningStatusHtml(tourId,stage){
  if(stage.restDay) return "";
  const places=getPlacesForStage(tourId,stage.id);
  const preferredStart=getPreferredStartForStage(tourId,stage.id);
  const preferredEnd=getPreferredEndForStage(tourId,stage.id);
  const categories=new Set(places.map(p=>p.category));
  const checks=[["camping","Übernachtung"],["water","Wasser"],["shop","Einkauf"]];
  const done=checks.filter(([key])=>categories.has(key)).length;
  return `<div class="planning-status"><strong>Planungsstand ${done}/3</strong><span>${checks.map(([key,label])=>`${categories.has(key)?"✓":"○"} ${label}`).join(" · ")}</span><span>${preferredStart?`★ Start: ${escapeHtml(preferredStart.name)}`:"○ Kein bevorzugter Start"}<br>${preferredEnd?`★ Ziel: ${escapeHtml(preferredEnd.name)}`:"○ Kein bevorzugtes Ziel"}</span></div>`;
}

function stagePreferredHtml(tourId,stageId){
  const start=getPreferredStartForStage(tourId,stageId);
  const end=getPreferredEndForStage(tourId,stageId);

  const startHtml=start
    ? `<div class="stage-preferred-start"><strong>★ Bevorzugter Start: ${escapeHtml(start.name)}</strong><span>${escapeHtml(start.category)} · ${Number(start.distanceKm||0).toFixed(2)} km von der Etappe</span><span class="stage-destination">Nur nach ausdrücklicher Bestätigung übernehmen.</span></div>`
    : "";

  const endHtml=end
    ? `<div class="stage-preferred-end"><strong>★ Bevorzugtes Ziel: ${escapeHtml(end.name)}</strong><span>${escapeHtml(end.category)} · ${Number(end.distanceKm||0).toFixed(2)} km von der Etappe</span><span class="stage-destination">Nur nach ausdrücklicher Bestätigung übernehmen.</span></div>`
    : "";

  return startHtml+endHtml;
}

function stageSupplyHtml(tourId,stageId){
  const places=getPlacesForStage(tourId,stageId);

  if(!places.length){
    return '<div class="stage-supply-empty">Noch keine Versorgung für diese Etappe gespeichert.</div>';
  }

  const categories=[
    ["camping","⛺ Camping"],
    ["water","💧 Wasser"],
    ["shop","🛒 Einkauf"],
    ["transport","🚆 ÖV"],["footwear","👟 Schuhe"]
  ];

  return `<div class="stage-supply-grid">
    ${categories.map(([category,label])=>{
      const place=nearestPlaceByCategory(places,category);
      return `<div class="stage-supply-item">
        <strong>${label}</strong>
        ${place
          ? `<span>${escapeHtml(place.name)}</span><span>${Number(place.distanceKm||0).toFixed(2)} km</span>`
          : '<span>–</span>'}
      </div>`;
    }).join("")}
  </div>`;
}


function stageInlineTimelineHtml(stage){
  if(stage.restDay) return "";

  const distance=Number(stage.distanceKm||0);
  const startLabel="Start";
  const endLabel="Ziel";

  const supplyPlaces=getPlacesForStage(stage.tourId,stage.id)
    .slice()
    .sort((a,b)=>Number(a.distanceKm||999)-Number(b.distanceKm||999))
    .slice(0,3);

  const points=[
    {label:startLabel,position:0,type:"start"},
    ...supplyPlaces.map((place,index)=>({
      label:place.name,
      position:Math.min(90,Math.max(10,20+index*25)),
      type:"supply"
    })),
    {label:endLabel,position:100,type:"end"}
  ];

  return `
    <div class="stage-inline-timeline">
      <div class="stage-inline-line"></div>
      ${points.map(point=>`
        <div class="stage-inline-point ${point.type}" style="left:${point.position}%">
          <span class="stage-inline-dot"></span>
          <span class="stage-inline-label">${escapeHtml(point.label)}</span>
        </div>
      `).join("")}
    </div>`;
}


function stageSequenceBadge(stage){
  if(stage.restDay) return "☕";
  const nr=Number(stage.order||0);
  return Number.isFinite(nr)&&nr>0?String(nr):"•";
}

function stageDisplayTitle(stage){
  if(stage.restDay) return "Ruhetag";
  return `${stage.from||"Start"} → ${stage.to||"Ziel"}`;
}

async function renderStages(){
  const activeTour=await getActiveTour();
  const list=document.getElementById("stageList");
  const status=document.getElementById("stageStatus");
  const diagnostic=document.getElementById("stageDiagnostic");

  if(!list) return;

  if(!activeTour){
    list.innerHTML='<div class="empty">Keine aktive Tour.</div>';
    if(status) status.textContent="Keine aktive Tour.";
    return;
  }

  const stages=loadStagesLocal(activeTour.id);
  const stagePlaces=loadPlacesLocal(activeTour.id);
  const packNames=loadPackNamesLocal(activeTour.id);
  const shoePerson1=loadTourShoePersonLocal(activeTour.id,"person1");
  const shoePerson2=loadTourShoePersonLocal(activeTour.id,"person2");
  const shoePerson1Stage=getShoeChangeStageInfo(stages,shoePerson1.currentKm,shoePerson1.intervalKm);
  const shoePerson2Stage=getShoeChangeStageInfo(stages,shoePerson2.currentKm,shoePerson2.intervalKm);
  const shoePlan={
    person1:{stageId:shoePerson1Stage.stage?.id||null,kmIntoStage:shoePerson1Stage.kmIntoStage},
    person2:{stageId:shoePerson2Stage.stage?.id||null,kmIntoStage:shoePerson2Stage.kmIntoStage}
  };
  const shoeInterval=loadShoeIntervalLocal(activeTour.id,700);
  const shoeMarkers=getShoeChangeMarkers(stages,shoeInterval);
  const shoeInput=document.getElementById("shoeChangeIntervalKm");
  if(shoeInput) shoeInput.value=shoeInterval;
  const shoeStatus=document.getElementById("shoePlanningStatus");
  if(shoeStatus){
    const nextShoeKm=getNextShoeChangeKm(stages,shoeInterval);
    shoeStatus.textContent=nextShoeKm
      ? `Schuhwechsel geplant alle ${shoeInterval} km · nächster Richtwert bei km ${Math.round(nextShoeKm)}`
      : `Schuhwechsel geplant alle ${shoeInterval} km`;
  }
  const distances=stages.map(stage=>Number(stage.distanceKm||0));

  document.getElementById("stageCount").textContent=String(stages.length);
  document.getElementById("stageAverage").textContent=stages.length
    ? `${(distances.reduce((sum,value)=>sum+value,0)/stages.length).toFixed(1)} km`
    : "0 km";
  document.getElementById("stageLongest").textContent=stages.length
    ? `${Math.max(...distances).toFixed(1)} km`
    : "0 km";
  document.getElementById("stageShortest").textContent=stages.length
    ? `${Math.min(...distances).toFixed(1)} km`
    : "0 km";

  if(status) status.textContent=stages.length
    ? `${stages.length} Etappen aus dem Browserspeicher geladen.`
    : "Noch keine Etappen vorhanden.";

  const info=getStageStorageInfo(activeTour.id);
  if(diagnostic) diagnostic.textContent=
    `Speicher: ${info.count} Etappen · ${info.characters} Zeichen · ${info.origin}`;

  list.innerHTML=stages.length
    ? stages.map(stage=>`
      <article id="stage-card-${stage.id}" class="stage-card stage-card-modern ${stage.completed?"completed":""} ${stage.restDay?"rest-day":""}">
        <div class="stage-card-top">
          <div class="stage-number-badge">${stageSequenceBadge(stage)}</div>
          <div class="stage-title-block">
            <div class="stage-date-line">${formatDate(stage.date)}${stage.restDay?" · Ruhetag":""}</div>
            <h3>${escapeHtml(stageDisplayTitle(stage))}</h3>
            ${stage.restDay?"":`<div class="stage-endpoints-summary"><span><strong>Start:</strong> ${escapeHtml(stage.from||"–")}</span><span><strong>Ziel:</strong> ${escapeHtml(stage.to||"–")}</span></div>`}
            ${stage.name&&!stage.restDay?`<div class="stage-name-sub">${escapeHtml(stage.name)}</div>`:""}
          </div>
        </div>
        ${stage.restDay?"":`
        <div class="stage-statbar">
          <span>🥾 ${Number(stage.distanceKm||0).toFixed(1)} km</span>
          <span>↑ ${Math.round(Number(stage.ascentM||0))} m</span>
          <span>↓ ${Math.round(Number(stage.descentM||0))} m</span>
          <span>◷ ${formatHours(stage.walkingHours||0)}</span>
          ${stage.completed?'<span>✓ Abgeschlossen</span>':""}
        </div>`}
        ${stage.startCoord&&stage.endCoord?`
        <div class="stage-coordinates">
          ${Number(stage.startCoord.lat||0).toFixed(5)}, ${Number(stage.startCoord.lng||0).toFixed(5)}
          →
          ${Number(stage.endCoord.lat||0).toFixed(5)}, ${Number(stage.endCoord.lng||0).toFixed(5)}
        </div>`:""}
        ${stage.notes?`<p>${escapeHtml(stage.notes)}</p>`:""}
        ${stage.restDay?"":`${stageShoePersonWarningHtml(stage,shoePlan,packNames)}${stageShoeChangeHtml(stage,shoeMarkers)}${stagePlanningStatusHtml(activeTour.id,stage)}${stagePreferredHtml(activeTour.id,stage.id)}<div class="stage-place-assign"><strong>Start / Ziel festlegen</strong><div class="stage-place-assign-row"><select data-stage-place-select="${stage.id}"><option value="">Ort wählen …</option>${stagePlaces.map(place=>`<option value="${place.id}">${escapeHtml(place.name||"Unbenannter Ort")}</option>`).join("")}</select><button data-stage-set-start="${stage.id}">Als Start</button><button data-stage-set-end="${stage.id}">Als Ziel</button></div><small>Wähle einen gespeicherten Ort und lege ihn gezielt für diese Etappe als Start oder Ziel fest.</small></div><div class="stage-supply">${stageSupplyHtml(activeTour.id,stage.id)}</div>${stageInlineTimelineHtml(stage)}`}
        <div class="card-actions">
          ${stage.restDay
            ? `<button class="danger" data-delete-rest="${stage.id}">Ruhetag entfernen</button>`
            : `<button data-map-stage="${stage.id}">Auf Karte</button><button data-track-edit-stage="${stage.id}">Track bearbeiten</button><button data-supply-stage="${stage.id}">Versorgung suchen</button>${getPreferredStartForStage(activeTour.id,stage.id)?`<button data-use-preferred-start="${stage.id}">Start übernehmen</button>`:""}${getPreferredEndForStage(activeTour.id,stage.id)?`<button data-use-preferred-destination="${stage.id}">Ziel übernehmen</button>`:""}
               <button data-edit-stage="${stage.id}">Bearbeiten</button>
               <button data-rest-before="${stage.id}">Ruhetag davor</button>
               <button data-rest-after="${stage.id}">Ruhetag danach</button>
               <button data-split-stage="${stage.id}">Teilen</button>
               <button data-merge-stage="${stage.id}">Mit nächster verbinden</button>
               <button class="danger" data-delete-stage="${stage.id}">Löschen</button>`}
        </div>
      </article>
    `).join("")
    : '<div class="empty">Noch keine Etappen vorhanden.</div>';

  const secondaryRenders=[
    ["Dashboard",()=>renderDashboardStats()],
    ["Packlisten",()=>renderTourPack()],
    ["Mein Transa",()=>renderGear()],
    ["Schuhe",()=>renderTourShoes()],
    ["Orte",()=>renderPlaces()],
    ["Roadbook",()=>typeof renderRoadbook==="function"?renderRoadbook():Promise.resolve()],
    ["Seitenleiste",()=>typeof renderSidebarSummary==="function"?renderSidebarSummary():Promise.resolve()]
  ];

  for(const [name,render] of secondaryRenders){
    try{
      await render();
    }catch(error){
      console.error(`${name} konnte nicht aktualisiert werden:`,error);
    }
  }
}




function jumpToStage(stageId){
  const element=document.getElementById(`stage-card-${stageId}`);
  if(!element) return;

  element.scrollIntoView({behavior:"smooth",block:"center"});
  element.classList.remove("flash");
  requestAnimationFrame(()=>element.classList.add("flash"));
  setTimeout(()=>element.classList.remove("flash"),1600);
}

function renderStageTimeline(stages,shoeMarkers={}){
  const container=document.getElementById("stageTimeline");
  if(!container) return;

  if(!stages.length){
    container.innerHTML='<p class="muted">Noch keine Etappen vorhanden.</p>';
    return;
  }

  const grouped={};
  stages.forEach(stage=>{
    const month=(stage.date||"").slice(0,7)||"ohne-datum";
    if(!grouped[month]) grouped[month]=[];
    grouped[month].push(stage);
  });

  container.innerHTML=Object.entries(grouped).map(([month,items])=>{
    const label=month==="ohne-datum"
      ?"Ohne Datum"
      :new Intl.DateTimeFormat("de-CH",{month:"long",year:"numeric"})
        .format(new Date(`${month}-01T12:00:00`));

    return `<div class="timeline-month">
      <h4>${label}</h4>
      <div class="timeline-items">
        ${items.map(stage=>`
          <div class="timeline-item ${stage.restDay?"rest":""} ${stage.completed?"completed":""}" data-timeline-stage="${stage.id}" title="Etappe öffnen">
            <span class="timeline-date">${formatDate(stage.date)}</span>
            <span>${stage.restDay
              ?"Ruhetag"
              :`${escapeHtml(stage.from)} → ${escapeHtml(stage.to)} · ${Number(stage.distanceKm||0).toFixed(1)} km${
                  getPreferredEndForStage(stage.tourId,stage.id)
                    ? `<small class="timeline-stop">★ ${escapeHtml(getPreferredEndForStage(stage.tourId,stage.id).name)}</small>`
                    : ""
                }${shoeMarkers?.[stage.id]?`<small class="timeline-shoe">👟 Schuhwechsel ca. km ${shoeMarkers?.[stage.id]?.thresholds.map(km=>Math.round(km)).join(" / ")}</small>`:""}`}
            </span>
          </div>`).join("")}
      </div>
    </div>`;
  }).join("");
}

function openStageDialog(stage){
  document.getElementById("editStageId").value=stage.id;
  document.getElementById("editStageName").value=stage.name||"";
  document.getElementById("editStageDate").value=stage.date||"";
  document.getElementById("editStageFrom").value=stage.from||"";
  document.getElementById("editStageTo").value=stage.to||"";
  document.getElementById("editStageNotes").value=stage.notes||"";
  document.getElementById("editStageCompleted").checked=Boolean(stage.completed);
  stageDialog.showModal();
}

function findNearestPointIndex(points,target){
  let bestIndex=0;
  let bestDistance=Infinity;

  points.forEach((point,index)=>{
    const dLat=point.lat-target.lat;
    const dLng=point.lng-target.lng;
    const value=dLat*dLat+dLng*dLng;

    if(value<bestDistance){
      bestDistance=value;
      bestIndex=index;
    }
  });

  return bestIndex;
}

async function showStageOnMap(stage){
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const track=await getTrack(activeTour.id);
  if(!track?.points?.length) return;

  currentMapStageId=stage.id;
  document.querySelector('[data-page="map"]').click();

  setTimeout(()=>{
    if(!initMap()) return;

    trackLayer.clearLayers();

    let startIndex=findNearestPointIndex(track.points,stage.startCoord);
    let endIndex=findNearestPointIndex(track.points,stage.endCoord);

    if(startIndex>endIndex){
      [startIndex,endIndex]=[endIndex,startIndex];
    }

    const segment=track.points.slice(startIndex,endIndex+1);
    if(segment.length<2) return;

    const line=L.polyline(segment.map(point=>[point.lat,point.lng]),{
      weight:5
    }).addTo(trackLayer);

    L.marker([stage.startCoord.lat,stage.startCoord.lng])
      .addTo(trackLayer)
      .bindPopup(`<strong>${escapeHtml(stage.from)}</strong>`);

    L.marker([stage.endCoord.lat,stage.endCoord.lng])
      .addTo(trackLayer)
      .bindPopup(`<strong>${escapeHtml(stage.to)}</strong>`);

    const savedPlaces=getPlacesForStage(activeTour.id,stage.id);
    const searchPlaces=currentSupplyStageId===stage.id ? currentSupplyResults : [];
    const places=dedupePlaces([...savedPlaces,...searchPlaces]).map(place=>({
      ...place,
      stageId:stage.id,
      _saved:savedPlaces.some(saved=>saved.id===place.id)
    }));
    const preferredStart=getPreferredStartForStage(activeTour.id,stage.id);
    const preferredEnd=getPreferredEndForStage(activeTour.id,stage.id);

    places.forEach(place=>{
      const isStart=preferredStart?.id===place.id;
      const isEnd=preferredEnd?.id===place.id;

      const popupHtml=`
        <div class="map-popup">
          <strong>${escapeHtml(place.name)}</strong>
          ${place.category==="footwear"?`<br><span>${escapeHtml(footwearBrandHint(place))}</span>`:""}
          <br>${escapeHtml(place.category)}
          <br>${Number(place.distanceKm||0).toFixed(2)} km von der Etappe
          ${place.favorite?"<br>★ Favorit":""}
          ${isStart?'<br><span class="map-popup-badge start">★ Bevorzugter Start</span>':""}
          ${isEnd?'<br><span class="map-popup-badge end">★ Bevorzugtes Ziel</span>':""}
          <div class="map-popup-actions">
            <button data-map-preferred-start="${place.id}" data-stage-id="${stage.id}" data-place-saved="${place._saved?"1":"0"}">${isStart?"Bevorzugter Start ✓":"Als bevorzugten Start"}</button>
            <button data-map-preferred-end="${place.id}" data-stage-id="${stage.id}" data-place-saved="${place._saved?"1":"0"}">${isEnd?"Bevorzugtes Ziel ✓":"Als bevorzugtes Ziel"}</button>
            ${isStart?`<button data-map-clear-preferred-start="${stage.id}">Start entfernen</button>`:""}
            ${isEnd?`<button data-map-clear-preferred-end="${stage.id}">Ziel entfernen</button>`:""}
          </div>
        </div>`;

      L.marker([place.lat,place.lng])
        .addTo(trackLayer)
        .bindPopup(popupHtml);
    });

    map.fitBounds(line.getBounds(),{padding:[20,20]});
  },150);
}


let trackEditorMap=null;
let trackEditorLayer=null;
let trackEditorStageId=null;
let trackEditorOriginalPoints=[];
let trackEditorWorkingPoints=[];
let trackEditorHistory=[];
let trackEditorRoutingBusy=false;
let trackEditorDragSnapshot=null;
let trackEditorClickMode=false;
let trackEditorClickedPoints=[];
let trackEditorClickedLayer=null;
let trackEditorLineDrag=null;


function cloneTrackPoints(points){
  return points.map(point=>({...point}));
}

function trackDistanceKm(points){
  let total=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    const R=6371;
    const dLat=(b.lat-a.lat)*Math.PI/180;
    const dLng=(b.lng-a.lng)*Math.PI/180;
    const lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180;
    const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    total+=2*R*Math.asin(Math.sqrt(h));
  }
  return total;
}

function trackEditorControlIndices(length){
  if(length<=12) return Array.from({length},(_,i)=>i);
  const count=Math.min(10,Math.max(5,Math.round(length/100)));
  const indices=[0];
  for(let i=1;i<count-1;i++) indices.push(Math.round(i*(length-1)/(count-1)));
  indices.push(length-1);
  return [...new Set(indices)];
}



function updateClickedPointUi(){
  const count=document.getElementById("trackClickedCount");
  const connect=document.getElementById("trackConnectClickedBtn");
  const clear=document.getElementById("trackClearClickedBtn");
  const modeBtn=document.getElementById("trackClickModeBtn");

  if(count) count.textContent=`${trackEditorClickedPoints.length} Punkt${trackEditorClickedPoints.length===1?"":"e"}`;
  if(connect) connect.disabled=trackEditorClickedPoints.length<2;
  if(clear) clear.disabled=trackEditorClickedPoints.length===0;
  if(modeBtn){
    modeBtn.classList.toggle("active",trackEditorClickMode);
    modeBtn.textContent=trackEditorClickMode?"✓ Punkte setzen aktiv":"＋ Punkte setzen";
  }
}


function nearestTrackPointToLatLng(latlng){
  if(!trackEditorWorkingPoints.length) return {lat:latlng.lat,lng:latlng.lng};

  let best=trackEditorWorkingPoints[0];
  let bestDistance=Infinity;

  for(const point of trackEditorWorkingPoints){
    const dLat=Number(point.lat)-Number(latlng.lat);
    const dLng=Number(point.lng)-Number(latlng.lng);
    const d=dLat*dLat+dLng*dLng;
    if(d<bestDistance){
      bestDistance=d;
      best=point;
    }
  }

  return {lat:Number(best.lat),lng:Number(best.lng)};
}

function addClickedTrackPoint(latlng,{snapToTrack=false}={}){
  if(!trackEditorClickMode) return;

  const point=snapToTrack
    ?nearestTrackPointToLatLng(latlng)
    :{lat:Number(latlng.lat),lng:Number(latlng.lng)};

  trackEditorClickedPoints.push(point);
  redrawClickedPoints();

  const status=document.getElementById("trackRoutingStatus");
  if(status){
    status.textContent=
      `${trackEditorClickedPoints.length} Punkt${trackEditorClickedPoints.length===1?"":"e"} gesetzt${snapToTrack?" · auf Track eingerastet":""}. `+
      `Mindestens 2 Punkte setzen und danach „Punkte verbinden“.`;
  }
}

function redrawClickedPoints(){
  if(!trackEditorMap) return;

  if(trackEditorClickedLayer){
    trackEditorClickedLayer.remove();
    trackEditorClickedLayer=null;
  }

  trackEditorClickedLayer=L.layerGroup().addTo(trackEditorMap);

  trackEditorClickedPoints.forEach((point,index)=>{
    const clickedMarker=L.circleMarker([point.lat,point.lng],{
      radius:7,
      weight:2,
      fillOpacity:1,
      bubblingMouseEvents:false
    })
      .addTo(trackEditorClickedLayer)
      .bindTooltip(String(index+1),{permanent:true,direction:"top"});

    clickedMarker.on("click",()=>{
      trackEditorClickedPoints.splice(index,1);
      redrawClickedPoints();
      const status=document.getElementById("trackRoutingStatus");
      if(status) status.textContent="Punkt entfernt. Weitere Punkte setzen oder verbinden.";
    });
  });

  if(trackEditorClickedPoints.length>1){
    L.polyline(
      trackEditorClickedPoints.map(point=>[point.lat,point.lng]),
      {weight:3,dashArray:"7 7",opacity:.7}
    ).addTo(trackEditorClickedLayer);
  }

  updateClickedPointUi();
}

async function rerouteTrackEditorAfterDrag(){
  if(trackEditorRoutingBusy) return;

  const mode=document.getElementById("trackRoutingMode")?.value||"direct";
  const autoRoute=document.getElementById("trackEditorAutoRoute")?.checked!==false;
  const status=document.getElementById("trackRoutingStatus");

  if(mode!=="foot"||!autoRoute){
    if(status) status.textContent="Weg verschoben · Start/Ziel fix · freie/wegelose Trackform aktiv · noch nicht gespeichert";
    return;
  }

  const indices=trackEditorWaypointIndices();
  const waypoints=indices.map(index=>trackEditorWorkingPoints[index]);

  if(waypoints.length<2) return;

  trackEditorRoutingBusy=true;
  if(status) status.textContent="Neuplanung über Wander-/Fusswege …";

  try{
    const routed=await routeBetweenWaypoints(waypoints);
    if(!routed?.length||routed.length<2) throw new Error("Keine verwertbare Route erhalten.");

    trackEditorWorkingPoints=routed;
    redrawTrackEditor({fit:false});
    if(status){
      status.textContent=`✓ Route neu berechnet · ${trackDistanceKm(routed).toFixed(1)} km · noch nicht gespeichert`;
    }
  }catch(error){
    console.warn("Automatisches Drag-&-Drop-Routing fehlgeschlagen:",error);
    if(status){
      status.textContent=`Automatisches Routing nicht möglich: ${error.message}. Die verschobene Vorschau bleibt erhalten.`;
    }
  }finally{
    trackEditorRoutingBusy=false;
  }
}

function redrawTrackEditor(options={}){
  if(!trackEditorMap) return;
  const shouldFit=options.fit!==false;

  if(trackEditorLayer) trackEditorLayer.remove();
  trackEditorLayer=L.layerGroup().addTo(trackEditorMap);

  const coords=trackEditorWorkingPoints.map(p=>[p.lat,p.lng]);
  const line=L.polyline(coords,{
    weight:7,
    opacity:.9,
    bubblingMouseEvents:false
  }).addTo(trackEditorLayer);

  line.on("click",event=>{
    if(!trackEditorClickMode) return;
    addClickedTrackPoint(event.latlng,{snapToTrack:true});
  });

  // Sprint 10.9.5: grab the visible track itself and drag it.
  // Leaflet polylines are not draggable by default, so we temporarily move
  // the nearest track vertex (and its neighbours) while the pointer is held.
  line.on("mousedown",event=>{
    if(trackEditorClickMode||trackEditorRoutingBusy||!trackEditorWorkingPoints.length) return;
    const ll=event.latlng;
    let pointIndex=0;
    let best=Infinity;
    trackEditorWorkingPoints.forEach((p,i)=>{
      const d=(Number(p.lat)-ll.lat)**2+(Number(p.lng)-ll.lng)**2;
      if(d<best){best=d;pointIndex=i;}
    });
    trackEditorHistory.push(cloneTrackPoints(trackEditorWorkingPoints));
    if(trackEditorHistory.length>30) trackEditorHistory.shift();
    trackEditorLineDrag={pointIndex,last:{lat:ll.lat,lng:ll.lng}};
    trackEditorMap.dragging.disable();
    const status=document.getElementById("trackRoutingStatus");
    if(status) status.textContent="Track gegriffen – Weg ziehen; Start und Ziel bleiben fix …";
    if(event.originalEvent){
      L.DomEvent.stopPropagation(event.originalEvent);
      L.DomEvent.preventDefault(event.originalEvent);
    }
  });

  const indices=trackEditorControlIndices(trackEditorWorkingPoints.length);

  indices.forEach((pointIndex,controlIndex)=>{
    const point=trackEditorWorkingPoints[pointIndex];
    const isStart=pointIndex===0;
    const isEnd=pointIndex===trackEditorWorkingPoints.length-1;

    const marker=L.marker([point.lat,point.lng],{
      // Sprint 10.9.8: Start und Ziel dürfen bewusst über ihre Marker verschoben werden.
      // Beim Ziehen der Tracklinie selbst bleiben die Endpunkte weiterhin fix.
      draggable:true,
      keyboard:false,
      title:isStart?"Start":isEnd?"Ziel":`Kontrollpunkt ${controlIndex}`
    }).addTo(trackEditorLayer);

    marker.bindTooltip(
      isStart?"Start":isEnd?"Ziel":`Ziehpunkt ${controlIndex}`,
      {permanent:false}
    );

    marker.on("dragstart",()=>{
      if(trackEditorRoutingBusy) return;
      trackEditorDragSnapshot=cloneTrackPoints(trackEditorWorkingPoints);
      trackEditorHistory.push(cloneTrackPoints(trackEditorWorkingPoints));
      if(trackEditorHistory.length>30) trackEditorHistory.shift();

      const status=document.getElementById("trackRoutingStatus");
      if(status) status.textContent="Punkt verschieben …";
    });

    marker.on("contextmenu",()=>{
      if(isStart||isEnd||trackEditorRoutingBusy) return;
      trackEditorHistory.push(cloneTrackPoints(trackEditorWorkingPoints));
      trackEditorWorkingPoints.splice(pointIndex,1);
      redrawTrackEditor({fit:false});
    });

    marker.on("drag",event=>{
      if(trackEditorRoutingBusy) return;

      const ll=event.target.getLatLng();
      const old=trackEditorWorkingPoints[pointIndex];
      const dLat=ll.lat-old.lat;
      const dLng=ll.lng-old.lng;

      // Start/Ziel: nur den bewusst gegriffenen Endpunkt verschieben.
      // Die Tracklinie selbst verschiebt Start/Ziel weiterhin nie.
      if(isStart||isEnd){
        trackEditorWorkingPoints[pointIndex]={...old,lat:ll.lat,lng:ll.lng};
        const polylines=trackEditorLayer.getLayers().filter(layer=>layer instanceof L.Polyline);
        if(polylines[0]) polylines[0].setLatLngs(trackEditorWorkingPoints.map(p=>[p.lat,p.lng]));
        const info=document.getElementById("trackEditorInfo");
        if(info) info.textContent=`Vorschau: ${trackDistanceKm(trackEditorWorkingPoints).toFixed(1)} km · ${isStart?"Start":"Ziel"} verschoben · noch nicht gespeichert`;
        return;
      }

      // Move the selected point plus nearby track points with a smooth falloff.
      // This makes dragging feel like moving the route rather than breaking
      // a single vertex out of a dense GPX line.
      const radius=Math.max(4,Math.min(40,Math.round(trackEditorWorkingPoints.length/20)));

      for(let i=Math.max(0,pointIndex-radius);i<=Math.min(trackEditorWorkingPoints.length-1,pointIndex+radius);i++){
        // Start und Ziel nie als Nebenwirkung eines Kontrollpunkt-Drags verschieben.
        if(i===0||i===trackEditorWorkingPoints.length-1) continue;

        const distance=Math.abs(i-pointIndex);
        const influence=Math.cos((distance/(radius+1))*Math.PI/2);
        if(influence<=0) continue;

        trackEditorWorkingPoints[i]={
          ...trackEditorWorkingPoints[i],
          lat:Number(trackEditorWorkingPoints[i].lat)+dLat*influence,
          lng:Number(trackEditorWorkingPoints[i].lng)+dLng*influence
        };
      }

      marker.setLatLng([
        trackEditorWorkingPoints[pointIndex].lat,
        trackEditorWorkingPoints[pointIndex].lng
      ]);

      const polylines=trackEditorLayer.getLayers().filter(layer=>layer instanceof L.Polyline);
      if(polylines[0]){
        polylines[0].setLatLngs(trackEditorWorkingPoints.map(p=>[p.lat,p.lng]));
      }

      const info=document.getElementById("trackEditorInfo");
      if(info){
        info.textContent=`Vorschau: ${trackDistanceKm(trackEditorWorkingPoints).toFixed(1)} km · Punkt verschoben · noch nicht gespeichert`;
      }
    });

    marker.on("dragend",async()=>{
      if(trackEditorRoutingBusy) return;
      await rerouteTrackEditorAfterDrag();
    });
  });

  const info=document.getElementById("trackEditorInfo");
  if(info){
    info.textContent=`Vorschau: ${trackDistanceKm(trackEditorWorkingPoints).toFixed(1)} km · ${indices.length} Drag-Punkte · noch nicht gespeichert`;
  }

  if(shouldFit&&line.getBounds().isValid()){
    trackEditorMap.fitBounds(line.getBounds(),{padding:[20,20]});
  }
}

async function openTrackEditor(stage){
  const activeTour=await getActiveTour();
  const track=activeTour?await getTrack(activeTour.id):null;
  if(!track?.points?.length){
    alert("Für diese Tour ist kein GPX-Track vorhanden.");
    return;
  }
  const segment=stageTrackSegment(track.points,stage);
  if(segment.length<2){
    alert("Der Etappentrack konnte nicht bestimmt werden.");
    return;
  }

  trackEditorStageId=stage.id;
  trackEditorOriginalPoints=cloneTrackPoints(segment);
  trackEditorWorkingPoints=cloneTrackPoints(segment);
  trackEditorHistory=[];
  trackEditorClickMode=false;
  trackEditorClickedPoints=[];
  updateClickedPointUi();

  const routingStatus=document.getElementById("trackRoutingStatus");
  if(routingStatus) routingStatus.textContent="";
  const routingMode=document.getElementById("trackRoutingMode")?.value||"foot";
  const autoRouteControl=document.getElementById("trackEditorAutoRoute");
  if(autoRouteControl) autoRouteControl.disabled=routingMode!=="foot";
  const dialog=document.getElementById("trackEditorDialog");
  dialog.showModal();

  setTimeout(()=>{
    if(!trackEditorMap){
      trackEditorMap=L.map("trackEditorMap",{zoomControl:true});
      const editorStyle=currentMapStyle();
      if(editorStyle==="topo"){
        L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",{
          maxZoom:17,attribution:"&copy; OpenTopoMap / OpenStreetMap"
        }).addTo(trackEditorMap);
      }else{
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
          maxZoom:19,attribution:"&copy; OpenStreetMap-Mitwirkende"
        }).addTo(trackEditorMap);
        if(editorStyle==="hiking"){
          L.tileLayer("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png",{
            maxZoom:18,opacity:.85,attribution:"&copy; Waymarked Trails"
          }).addTo(trackEditorMap);
        }
      }
    }
    trackEditorMap.invalidateSize();
    if(!trackEditorMap._3113EditorClickBound){
      trackEditorMap.on("click",event=>{
        if(!trackEditorStageId||!trackEditorClickMode) return;
        addClickedTrackPoint(event.latlng,{snapToTrack:false});
      });
      trackEditorMap.on("mousemove",event=>{
        if(!trackEditorLineDrag||trackEditorRoutingBusy) return;
        const {pointIndex,last}=trackEditorLineDrag;
        const dLat=event.latlng.lat-last.lat;
        const dLng=event.latlng.lng-last.lng;
        const radius=Math.max(4,Math.min(40,Math.round(trackEditorWorkingPoints.length/20)));
        for(let i=Math.max(0,pointIndex-radius);i<=Math.min(trackEditorWorkingPoints.length-1,pointIndex+radius);i++){
          // Sprint 10.9.8: Etappen-Start und -Ziel bleiben fest verankert.
          // Beim Ziehen verändert sich nur der Weg dazwischen.
          if(i===0||i===trackEditorWorkingPoints.length-1) continue;
          const distance=Math.abs(i-pointIndex);
          const influence=Math.cos((distance/(radius+1))*Math.PI/2);
          if(influence<=0) continue;
          trackEditorWorkingPoints[i]={...trackEditorWorkingPoints[i],lat:Number(trackEditorWorkingPoints[i].lat)+dLat*influence,lng:Number(trackEditorWorkingPoints[i].lng)+dLng*influence};
        }
        trackEditorLineDrag.last={lat:event.latlng.lat,lng:event.latlng.lng};
        const polylines=trackEditorLayer?.getLayers().filter(layer=>layer instanceof L.Polyline)||[];
        if(polylines[0]) polylines[0].setLatLngs(trackEditorWorkingPoints.map(p=>[p.lat,p.lng]));
        const info=document.getElementById("trackEditorInfo");
        if(info) info.textContent=`Vorschau: ${trackDistanceKm(trackEditorWorkingPoints).toFixed(1)} km · Track verschoben · noch nicht gespeichert`;
      });
      trackEditorMap.on("mouseup",async()=>{
        if(!trackEditorLineDrag) return;
        trackEditorLineDrag=null;
        trackEditorMap.dragging.enable();
        await rerouteTrackEditorAfterDrag();
      });
      trackEditorMap._3113EditorClickBound=true;
    }
    redrawTrackEditor();
  },100);
}


function trackEditorWaypointIndices(){
  return trackEditorControlIndices(trackEditorWorkingPoints.length);
}

async function routeBetweenWaypoints(points){
  if(!points.length) return [];

  // Public routing service using GraphHopper demo endpoint is not reliable without key.
  // Use Valhalla public endpoint as best-effort pedestrian routing.
  const locations=points.map(point=>({
    lat:point.lat,
    lon:point.lng,
    type:"break"
  }));

  const payload={
    locations,
    costing:"pedestrian",
    units:"kilometers",
    directions_options:{units:"kilometers"}
  };

  const url=`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(payload))}`;

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);

  try{
    const response=await fetch(url,{signal:controller.signal});
    clearTimeout(timer);

    if(!response.ok) throw new Error(`Routing-Server ${response.status}`);

    const data=await response.json();
    const shape=data?.trip?.legs?.map(leg=>leg.shape).filter(Boolean)||[];
    if(!shape.length) throw new Error("Keine Route erhalten.");

    function decodePolyline6(str){
      let index=0,lat=0,lng=0;
      const coordinates=[];
      while(index<str.length){
        let result=0,shift=0,b;
        do{
          b=str.charCodeAt(index++)-63;
          result|=(b&0x1f)<<shift;
          shift+=5;
        }while(b>=0x20);
        const dlat=(result&1)?~(result>>1):(result>>1);
        lat+=dlat;

        result=0;shift=0;
        do{
          b=str.charCodeAt(index++)-63;
          result|=(b&0x1f)<<shift;
          shift+=5;
        }while(b>=0x20);
        const dlng=(result&1)?~(result>>1):(result>>1);
        lng+=dlng;

        coordinates.push({lat:lat/1e6,lng:lng/1e6});
      }
      return coordinates;
    }

    let routed=[];
    shape.forEach((encoded,index)=>{
      const decoded=decodePolyline6(encoded);
      if(index>0&&decoded.length) decoded.shift();
      routed.push(...decoded);
    });

    return routed;
  }catch(error){
    clearTimeout(timer);
    throw error;
  }
}

document.getElementById("trackRoutingMode")?.addEventListener("change",()=>{
  const mode=document.getElementById("trackRoutingMode")?.value||"direct";
  const auto=document.getElementById("trackEditorAutoRoute");
  const status=document.getElementById("trackRoutingStatus");
  if(auto){
    auto.disabled=mode!=="foot";
    if(mode!=="foot") auto.checked=false;
    else auto.checked=true;
  }
  if(status){
    status.textContent=mode==="foot"
      ?"Wander-/Fussweg: Nach Drag & Drop wird über vorhandene Wege neu geroutet."
      :"Frei / weglos: Der Track darf beliebig verlaufen. Drag & Drop bleibt exakt dort, wo du ihn hinziehst.";
  }
});

document.getElementById("trackEditorRouteBtn")?.addEventListener("click",async()=>{
  if(!trackEditorWorkingPoints.length||trackEditorRoutingBusy) return;

  const mode=document.getElementById("trackRoutingMode")?.value||"direct";
  const status=document.getElementById("trackRoutingStatus");

  if(mode==="direct"){
    if(status) status.textContent="Freies/wegeloses Routing aktiv. Deine manuelle Trackform bleibt unverändert und muss keinem vorhandenen Weg folgen.";
    return;
  }

  const indices=trackEditorWaypointIndices();
  const waypoints=indices.map(index=>trackEditorWorkingPoints[index]);
  if(waypoints.length<2) return;

  trackEditorHistory.push(cloneTrackPoints(trackEditorWorkingPoints));
  trackEditorRoutingBusy=true;
  if(status) status.textContent="Route wird über Wander-/Fusswege neu berechnet …";

  try{
    const routed=await routeBetweenWaypoints(waypoints);
    if(!routed?.length||routed.length<2) throw new Error("Keine verwertbare Route erhalten.");
    trackEditorWorkingPoints=routed;
    redrawTrackEditor({fit:false});
    if(status) status.textContent=`✓ Routing erfolgreich · ${trackDistanceKm(routed).toFixed(1)} km`;
  }catch(error){
    console.error("Routing fehlgeschlagen:",error);
    if(status) status.textContent=`Routing fehlgeschlagen: ${error.message}. Die manuelle Trackform bleibt erhalten.`;
  }finally{
    trackEditorRoutingBusy=false;
  }
});


document.getElementById("trackClickModeBtn")?.addEventListener("click",()=>{
  trackEditorClickMode=!trackEditorClickMode;
  updateClickedPointUi();

  const mapElement=document.getElementById("trackEditorMap");
  if(mapElement) mapElement.classList.toggle("point-mode",trackEditorClickMode);

  const status=document.getElementById("trackRoutingStatus");
  if(status){
    status.textContent=trackEditorClickMode
      ?"Punkte setzen aktiv: auf den vorhandenen Track klicken = Punkt rastet auf dem Track ein; daneben klicken = freier Wegpunkt."
      :"Punkte setzen beendet. Normale Kartenklicks verändern den Track nicht.";
  }
});

document.getElementById("trackClearClickedBtn")?.addEventListener("click",()=>{
  trackEditorClickedPoints=[];
  redrawClickedPoints();

  const status=document.getElementById("trackRoutingStatus");
  if(status) status.textContent="Gesetzte Punkte gelöscht.";
});

document.getElementById("trackConnectClickedBtn")?.addEventListener("click",async()=>{
  if(trackEditorClickedPoints.length<2||trackEditorRoutingBusy) return;

  const status=document.getElementById("trackRoutingStatus");
  trackEditorRoutingBusy=true;

  try{
    if(status) status.textContent=(document.getElementById("trackRoutingMode")?.value==="direct")?"Gesetzte Punkte werden frei/weglos verbunden …":"Gesetzte Punkte werden über Wander-/Fusswege verbunden …";

    trackEditorHistory.push(cloneTrackPoints(trackEditorWorkingPoints));

    const mode=document.getElementById("trackRoutingMode")?.value||"foot";

    if(mode==="direct"){
      trackEditorWorkingPoints=cloneTrackPoints(trackEditorClickedPoints);
    }else{
      const routed=await routeBetweenWaypoints(trackEditorClickedPoints);
      if(!routed?.length||routed.length<2){
        throw new Error("Keine verwertbare Route erhalten.");
      }
      trackEditorWorkingPoints=routed;
    }

    trackEditorClickMode=false;
    trackEditorClickedPoints=[];
    document.getElementById("trackEditorMap")?.classList.remove("point-mode");
    redrawClickedPoints();
    redrawTrackEditor({fit:true});

    if(status){
      status.textContent=`✓ Neue Route verbunden · ${trackDistanceKm(trackEditorWorkingPoints).toFixed(1)} km · noch nicht gespeichert`;
    }
  }catch(error){
    console.error("Punkte verbinden fehlgeschlagen:",error);
    if(status) status.textContent=`Punkte konnten nicht verbunden werden: ${error.message}`;
  }finally{
    trackEditorRoutingBusy=false;
  }
});

document.getElementById("trackEditorUndoBtn")?.addEventListener("click",()=>{
  const previous=trackEditorHistory.pop();
  if(!previous) return;
  trackEditorWorkingPoints=previous;
  redrawTrackEditor();
});

document.getElementById("trackEditorResetBtn")?.addEventListener("click",()=>{
  if(!trackEditorOriginalPoints.length) return;
  trackEditorHistory.push(cloneTrackPoints(trackEditorWorkingPoints));
  trackEditorWorkingPoints=cloneTrackPoints(trackEditorOriginalPoints);
  redrawTrackEditor();
});

document.getElementById("trackEditorSaveBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour||!trackEditorStageId||trackEditorWorkingPoints.length<2) return;

  const stages=loadStagesLocal(activeTour.id);
  const stage=stages.find(item=>item.id===trackEditorStageId);
  const track=await getTrack(activeTour.id);
  if(!stage||!track?.points?.length) return;

  let startIndex=0,endIndex=track.points.length-1,startBest=Infinity,endBest=Infinity;
  track.points.forEach((point,index)=>{
    const ds=(point.lat-stage.startCoord.lat)**2+(point.lng-stage.startCoord.lng)**2;
    const de=(point.lat-stage.endCoord.lat)**2+(point.lng-stage.endCoord.lng)**2;
    if(ds<startBest){startBest=ds;startIndex=index}
    if(de<endBest){endBest=de;endIndex=index}
  });
  if(startIndex>endIndex)[startIndex,endIndex]=[endIndex,startIndex];

  const updatedPoints=[
    ...track.points.slice(0,startIndex),
    ...cloneTrackPoints(trackEditorWorkingPoints),
    ...track.points.slice(endIndex+1)
  ];

  if(!track.originalPoints){
    track.originalPoints=cloneTrackPoints(track.points);
  }

  await saveTrack({...track,points:updatedPoints,edited:true,updatedAt:new Date().toISOString()});
  await markIndexedDbChangeAndSync();

  const editedStartCoord={lat:trackEditorWorkingPoints[0].lat,lng:trackEditorWorkingPoints[0].lng};
  const editedEndCoord={lat:trackEditorWorkingPoints.at(-1).lat,lng:trackEditorWorkingPoints.at(-1).lng};
  const moved=(a,b)=>!a||Math.abs(Number(a.lat)-Number(b.lat))>1e-7||Math.abs(Number(a.lng)-Number(b.lng))>1e-7;
  const startMoved=moved(stage.startCoord,editedStartCoord);
  const endMoved=moved(stage.endCoord,editedEndCoord);
  const startName=startMoved?"Manueller Start":stage.from;
  const endName=endMoved?"Manuelles Ziel":stage.to;

  updateStageLocal(activeTour.id,{
    ...stage,
    from:startName,
    to:endName,
    startCoord:editedStartCoord,
    endCoord:editedEndCoord,
    distanceKm:trackDistanceKm(trackEditorWorkingPoints),
    notes:[stage.notes,"Track manuell bearbeitet",startMoved?"Start auf Karte verschoben":"",endMoved?"Ziel auf Karte verschoben":""].filter(Boolean).join(" · ")
  });

  // Anschluss an Nachbar-Etappen geometrisch und namentlich konsistent halten.
  if(startMoved) propagateStageStartToPrevious(activeTour.id,stage.id,startName,editedStartCoord);
  propagateStageDestinationToNext(activeTour.id,stage.id,endName,editedEndCoord);

  document.getElementById("trackEditorDialog").close();
  trackEditorStageId=null;
  await renderGpx();
  await renderStages();
  if(document.getElementById("map").classList.contains("active")) await renderMapTrack();
});

document.getElementById("trackEditorDialog")?.addEventListener("close",()=>{
  trackEditorStageId=null;
  trackEditorHistory=[];
  trackEditorClickMode=false;
  trackEditorClickedPoints=[];
  document.getElementById("trackEditorMap")?.classList.remove("point-mode");
  if(trackEditorClickedLayer){
    trackEditorClickedLayer.remove();
    trackEditorClickedLayer=null;
  }
  updateClickedPointUi();
});


document.addEventListener("click",async(event)=>{
  const startPlaceId=event.target.dataset.mapPreferredStart;
  const endPlaceId=event.target.dataset.mapPreferredEnd;
  const clearStartStageId=event.target.dataset.mapClearPreferredStart;
  const clearEndStageId=event.target.dataset.mapClearPreferredEnd;
  const stageId=event.target.dataset.stageId;

  if(!startPlaceId&&!endPlaceId&&!clearStartStageId&&!clearEndStageId) return;

  const activeTour=await getActiveTour();
  if(!activeTour) return;

  if((startPlaceId||endPlaceId)&&event.target.dataset.placeSaved==="0"){
    const placeId=startPlaceId||endPlaceId;
    const candidate=currentSupplyResults.find(place=>place.id===placeId);
    if(candidate){
      addPlaceLocal(activeTour.id,{...candidate,stageId:stageId||currentMapStageId});
    }
  }

  if(startPlaceId) setPreferredStartLocal(activeTour.id,startPlaceId);
  if(endPlaceId) setPreferredEndLocal(activeTour.id,endPlaceId);
  if(clearStartStageId) clearPreferredStartLocal(activeTour.id,clearStartStageId);
  if(clearEndStageId) clearPreferredEndLocal(activeTour.id,clearEndStageId);

  await renderPlaces();
  await renderStages();
  await renderDashboardStats();

  const targetStageId=stageId||clearStartStageId||clearEndStageId||currentMapStageId;
  if(targetStageId){
    const stages=loadStagesLocal(activeTour.id);
    const stage=stages.find(item=>item.id===targetStageId);
    if(stage) await showStageOnMap(stage);
  }
});

async function applyPlaceToStageAndRoute(activeTour,stage,place,kind){
  const coord={lat:Number(place.lat),lng:Number(place.lng)};
  const track=await getTrack(activeTour.id);
  if(!track?.points?.length) throw new Error("Kein GPX-Track für diese Tour vorhanden.");

  let startIndex=findNearestPointIndex(track.points,stage.startCoord||track.points[0]);
  let endIndex=findNearestPointIndex(track.points,stage.endCoord||track.points[track.points.length-1]);
  if(startIndex>endIndex) [startIndex,endIndex]=[endIndex,startIndex];

  const oldSegment=track.points.slice(startIndex,endIndex+1);
  const opposite=kind==="start"
    ? (stage.endCoord||oldSegment[oldSegment.length-1])
    : (stage.startCoord||oldSegment[0]);
  const waypoints=kind==="start" ? [coord,opposite] : [opposite,coord];
  let routed;
  try{
    routed=await routeBetweenWaypoints(waypoints);
  }catch(error){
    throw new Error(`Wanderroute konnte nicht berechnet werden (${error.message}).`);
  }
  if(!routed||routed.length<2) throw new Error("Routing hat keine nutzbare Strecke geliefert.");

  const newTrackPoints=[...track.points.slice(0,startIndex),...routed,...track.points.slice(endIndex+1)];
  await saveTrack({...track,points:newTrackPoints,updatedAt:new Date().toISOString()});
  await markIndexedDbChangeAndSync();

  const stats=calculateStage(routed);
  const updated={
    ...stage,
    ...(kind==="start"?{from:place.name,startCoord:coord}:{to:place.name,endCoord:coord}),
    ...stats
  };
  updateStageLocal(activeTour.id,updated);

  if(kind==="end"){
    propagateStageDestinationToNext(activeTour.id,stage.id,place.name,coord);
  }else{
    // A changed start is also the end of the preceding walking stage.
    const ordered=loadStagesLocal(activeTour.id);
    const index=ordered.findIndex(item=>item.id===stage.id);
    for(let i=index-1;i>=0;i--){
      if(!ordered[i].restDay){
        updateStageLocal(activeTour.id,{...ordered[i],to:place.name,endCoord:coord});
        break;
      }
    }
  }
}

document.getElementById("stageList")?.addEventListener("click",async(event)=>{
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const stages=loadStagesLocal(activeTour.id);
  const editId=event.target.dataset.editStage;
  const deleteId=event.target.dataset.deleteStage;
  const mapId=event.target.dataset.mapStage;
  const trackEditId=event.target.dataset.trackEditStage;
  const shoeSupplyStageId=event.target.dataset.shoeSupplyStage;
  const shoePersonKey=event.target.dataset.shoePerson;
  const restBefore=event.target.dataset.restBefore;
  const restAfter=event.target.dataset.restAfter;
  const deleteRest=event.target.dataset.deleteRest;
  const splitId=event.target.dataset.splitStage;
  const mergeId=event.target.dataset.mergeStage;
  const supplyId=event.target.dataset.supplyStage;
  const preferredDestinationId=event.target.dataset.usePreferredDestination;
  const preferredStartIdStage=event.target.dataset.usePreferredStart;
  const setStartStageId=event.target.dataset.stageSetStart;
  const setEndStageId=event.target.dataset.stageSetEnd;

  if(setStartStageId||setEndStageId){
    const stageId=setStartStageId||setEndStageId;
    const select=document.querySelector(`[data-stage-place-select="${stageId}"]`);
    const placeId=select?.value;
    if(!placeId){ alert("Bitte zuerst einen Ort auswählen."); return; }
    const place=loadPlacesLocal(activeTour.id).find(item=>item.id===placeId);
    const stage=stages.find(item=>item.id===stageId);
    if(!place||!stage){ alert("Ort oder Etappe wurde nicht gefunden."); return; }
    if(!Number.isFinite(Number(place.lat))||!Number.isFinite(Number(place.lng))){
      alert("Für diesen Ort sind keine gültigen Koordinaten gespeichert. Bitte den Ort mit Koordinaten erfassen.");
      return;
    }
    try{
      if(setStartStageId) setPreferredStartLocal(activeTour.id,placeId,stageId);
      else setPreferredEndLocal(activeTour.id,placeId,stageId);
      await applyPlaceToStageAndRoute(activeTour,stage,place,setStartStageId?"start":"end");
      markCloudDirty();
      await renderGpx();
      await renderStages();
      await renderPlaces();
      await renderDashboardStats();
    }catch(error){
      alert(`Ort konnte nicht übernommen werden: ${error.message}`);
    }
    return;
  }

  if(preferredStartIdStage){
    const preferred=getPreferredStartForStage(activeTour.id,preferredStartIdStage);
    const stage=stages.find(item=>item.id===preferredStartIdStage);

    if(preferred&&stage){
      pendingPreferredStartStageId=stage.id;
      document.getElementById("preferredStartInfo").innerHTML=
        `<strong>${escapeHtml(stage.name)}</strong><br>`+
        `${escapeHtml(stage.from)} → ${escapeHtml(preferred.name)}<br>`+
        `${escapeHtml(preferred.category)} · ${Number(preferred.distanceKm||0).toFixed(2)} km von der Etappe`;
      document.getElementById("preferredStartDialog").showModal();
    }
    return;
  }

  if(preferredDestinationId){
    const preferred=getPreferredEndForStage(activeTour.id,preferredDestinationId);
    const stage=stages.find(item=>item.id===preferredDestinationId);

    if(preferred&&stage){
      pendingPreferredDestinationStageId=stage.id;
      document.getElementById("preferredDestinationInfo").innerHTML=
        `<strong>${escapeHtml(stage.name)}</strong><br>` +
        `${escapeHtml(stage.to)} → ${escapeHtml(preferred.name)}<br>` +
        `${escapeHtml(preferred.category)} · ${Number(preferred.distanceKm||0).toFixed(2)} km von der Etappe`;

      document.getElementById("preferredDestinationDialog").showModal();
    }
    return;
  }

  if(supplyId){
    const stage=stages.find(item=>item.id===supplyId);
    if(stage&&!stage.restDay){
      currentSupplyStageId=stage.id;
      currentSupplyCategory="accommodation";
      currentSupplyResults=[];
      document.querySelectorAll("[data-supply-category]").forEach(button=>{
        button.classList.toggle("active",button.dataset.supplyCategory==="accommodation");
      });
      document.getElementById("supplyStageInfo").innerHTML=
        `<strong>${escapeHtml(stage.name)}</strong><br>${escapeHtml(stage.from)} → ${escapeHtml(stage.to)} · ${Number(stage.distanceKm||0).toFixed(1)} km`;
      document.getElementById("supplyStatus").textContent="Kategorie auswählen und suchen.";
      document.getElementById("supplyResults").innerHTML="";
      document.getElementById("supplyDialog").showModal();
    }
    return;
  }

  if(restBefore){
    insertRestDayLocal(activeTour.id,restBefore,"before");
    recalculateStageDates(activeTour.id,activeTour.startDate||stages[0]?.date||new Date().toISOString().slice(0,10));
    await renderStages();
    await renderSidebarSummary();
    await renderRoadbook();
    return;
  }

  if(restAfter){
    insertRestDayLocal(activeTour.id,restAfter,"after");
    recalculateStageDates(activeTour.id,activeTour.startDate||stages[0]?.date||new Date().toISOString().slice(0,10));
    await renderStages();
    return;
  }

  if(deleteRest){
    deleteRestDayLocal(activeTour.id,deleteRest);
    recalculateStageDates(activeTour.id,activeTour.startDate||stages[0]?.date||new Date().toISOString().slice(0,10));
    await renderStages();
    return;
  }

  if(splitId){
    const stage=stages.find(item=>item.id===splitId);
    if(stage){
      document.getElementById("splitStageId").value=stage.id;
      document.getElementById("splitStageLocation").value="";
      document.getElementById("splitStageKm").value=(Number(stage.distanceKm||0)/2).toFixed(1);
      splitStageDialog.showModal();
    }
    return;
  }

  if(mergeId){
    try{
      mergeStageWithNextLocal(activeTour.id,mergeId);
      recalculateStageDates(activeTour.id,activeTour.startDate||stages[0]?.date||new Date().toISOString().slice(0,10));
      await renderStages();
    }catch(error){
      alert(error.message);
    }
    return;
  }

  if(editId){
    const stage=stages.find(item=>item.id===editId);
    if(stage) openStageDialog(stage);
  }

  if(deleteId&&confirm("Etappe wirklich löschen?")){
    deleteStageLocal(activeTour.id,deleteId);
    await renderStages();
  }


  if(shoeSupplyStageId){
    const stage=stages.find(item=>item.id===shoeSupplyStageId);
    if(stage&&!stage.restDay){
      currentSupplyStageId=stage.id;
      currentSupplyCategory="footwear";
      currentSupplyResults=[];

      document.querySelectorAll("[data-supply-category]").forEach(button=>{
        button.classList.toggle("active",button.dataset.supplyCategory==="footwear");
      });

      const personName=shoePersonKey==="person2"
        ?loadPackNamesLocal(activeTour.id).person2
        :loadPackNamesLocal(activeTour.id).person1;

      document.getElementById("supplyStageInfo").innerHTML=
        `<strong>${escapeHtml(stage.name)}</strong><br>`+
        `${escapeHtml(stage.from)} → ${escapeHtml(stage.to)} · ${Number(stage.distanceKm||0).toFixed(1)} km<br>`+
        `<span class="muted">Schuhwechsel ${escapeHtml(personName)}</span>`;

      document.getElementById("supplyStatus").textContent=
        "Schuhe / Outdoor ist ausgewählt. Jetzt «Suchen» drücken.";
      document.getElementById("supplyResults").innerHTML="";
      document.getElementById("supplyDialog").showModal();
    }
    return;
  }

  if(trackEditId){
    const stage=stages.find(item=>item.id===trackEditId);
    if(stage) await openTrackEditor(stage);
    return;
  }

  if(mapId){
    const stage=stages.find(item=>item.id===mapId);
    if(stage) await showStageOnMap(stage);
  }
});


function propagateStageDestinationToNext(tourId,stageId,destinationName,destinationCoord=null){
  const stages=loadStagesLocal(tourId);
  const currentIndex=stages.findIndex(stage=>stage.id===stageId);
  if(currentIndex<0) return null;

  const nextStage=stages
    .slice(currentIndex+1)
    .find(stage=>!stage.restDay);

  if(!nextStage) return null;

  const updatedNext={
    ...nextStage,
    from:destinationName||nextStage.from
  };

  if(destinationCoord &&
     Number.isFinite(Number(destinationCoord.lat)) &&
     Number.isFinite(Number(destinationCoord.lng))){
    updatedNext.startCoord={
      lat:Number(destinationCoord.lat),
      lng:Number(destinationCoord.lng)
    };
  }

  updateStageLocal(tourId,updatedNext);
  return updatedNext;
}

function propagateStageStartToPrevious(tourId,stageId,startName,startCoord=null){
  const stages=loadStagesLocal(tourId);
  const currentIndex=stages.findIndex(stage=>stage.id===stageId);
  if(currentIndex<0) return null;
  const previousStage=stages.slice(0,currentIndex).reverse().find(stage=>!stage.restDay);
  if(!previousStage) return null;
  const updatedPrevious={...previousStage,to:startName||previousStage.to};
  if(startCoord && Number.isFinite(Number(startCoord.lat)) && Number.isFinite(Number(startCoord.lng))){
    updatedPrevious.endCoord={lat:Number(startCoord.lat),lng:Number(startCoord.lng)};
  }
  updateStageLocal(tourId,updatedPrevious);
  return updatedPrevious;
}

stageForm?.addEventListener("submit",async(event)=>{
  event.preventDefault();

  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const id=document.getElementById("editStageId").value;
  const stages=loadStagesLocal(activeTour.id);
  const stage=stages.find(item=>item.id===id);

  if(!stage){
    alert("Etappe wurde nicht gefunden.");
    return;
  }

  const newDestination=document.getElementById("editStageTo").value.trim();

  updateStageLocal(activeTour.id,{
    ...stage,
    name:document.getElementById("editStageName").value.trim(),
    date:document.getElementById("editStageDate").value,
    from:document.getElementById("editStageFrom").value.trim(),
    to:newDestination,
    notes:document.getElementById("editStageNotes").value.trim(),
    completed:document.getElementById("editStageCompleted").checked
  });

  if(newDestination && newDestination!==stage.to){
    propagateStageDestinationToNext(
      activeTour.id,
      stage.id,
      newDestination,
      stage.endCoord||null
    );
  }

  stageDialog.close();
  await renderStages();
});



document.getElementById("stageTimeline")?.addEventListener("click",(event)=>{
  const item=event.target.closest("[data-timeline-stage]");
  if(!item) return;

  jumpToStage(item.dataset.timelineStage);
});


function stageTrackSegment(trackPoints,stage){
  if(!trackPoints?.length||!stage) return [];

  // Preferred: determine the exact stage segment from coordinates.
  if(stage.startCoord&&stage.endCoord){
    let startIndex=0,endIndex=trackPoints.length-1;
    let startBest=Infinity,endBest=Infinity;

    trackPoints.forEach((point,index)=>{
      const ds=(point.lat-stage.startCoord.lat)**2+(point.lng-stage.startCoord.lng)**2;
      const de=(point.lat-stage.endCoord.lat)**2+(point.lng-stage.endCoord.lng)**2;
      if(ds<startBest){startBest=ds;startIndex=index}
      if(de<endBest){endBest=de;endIndex=index}
    });

    if(startIndex>endIndex)[startIndex,endIndex]=[endIndex,startIndex];
    return trackPoints.slice(startIndex,endIndex+1);
  }

  // Fallback for older/recreated stages: use stored track indexes when available.
  const startIndex=Math.max(0,Number(stage.startIndex??stage.trackStartIndex??0));
  const endIndex=Math.min(
    trackPoints.length-1,
    Number(stage.endIndex??stage.trackEndIndex??trackPoints.length-1)
  );
  return trackPoints.slice(Math.min(startIndex,endIndex),Math.max(startIndex,endIndex)+1);
}

function renderSupplyResults(results){
  const container=document.getElementById("supplyResults");

  container.innerHTML=results.length
    ?results.map((place,index)=>`
      <article class="poi-row">
        <h4>${escapeHtml(place.name)}</h4>
        <div class="poi-meta">
          <span class="pill">${escapeHtml(place.category)}</span>
          <span class="pill">${Number(place.distanceKm||0).toFixed(2)} km von der Etappe</span>
        </div>
        <button data-save-supply="${index}" class="primary">Speichern</button>
      </article>
    `).join("")
    :'<div class="empty">Keine passenden Orte gefunden.</div>';
}

document.querySelectorAll("[data-supply-category]").forEach(button=>{
  button.addEventListener("click",()=>{
    currentSupplyCategory=button.dataset.supplyCategory;
    document.querySelectorAll("[data-supply-category]").forEach(item=>{
      item.classList.toggle("active",item===button);
    });
  });
});

document.getElementById("runSupplySearchBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour){
    alert("Keine aktive Tour vorhanden.");
    return;
  }
  if(!currentSupplyStageId){
    alert("Bitte zuerst bei einer Etappe «Versorgung» öffnen.");
    return;
  }

  const stages=loadStagesLocal(activeTour.id);
  const stage=stages.find(item=>item.id===currentSupplyStageId);
  const track=await getTrack(activeTour.id);

  if(!stage){
    alert("Die ausgewählte Etappe wurde nicht gefunden.");
    return;
  }
  if(!track?.points?.length){
    alert("Für diese Tour ist kein GPX-Track verfügbar.");
    return;
  }

  const segment=stageTrackSegment(track.points,stage);
  if(segment.length<2){
    alert("Etappentrack konnte nicht bestimmt werden.");
    return;
  }

  const maxDistance=Number(document.getElementById("supplyMaxDistance").value||1);
  const windows=stageSearchWindows(segment,maxDistance+0.4,70);
  const status=document.getElementById("supplyStatus");

  currentSupplyResults=[];
  let collected=[];
  let completed=0;
  let failures=0;

  const endpoints=[
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  for(let windowIndex=0;windowIndex<windows.length;windowIndex++){
    const bounds=windows[windowIndex];
    const query=buildOverpassQuery(bounds,currentSupplyCategory);

    status.innerHTML=
      `Suche Teil ${windowIndex+1} von ${windows.length} …<div class="search-progress">${completed} erfolgreich · ${failures} fehlgeschlagen</div>`;

    let success=false;

    for(const endpoint of endpoints){
      try{
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),18000);

        const response=await fetch(endpoint,{
          method:"POST",
          headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
          body:`data=${encodeURIComponent(query)}`,
          signal:controller.signal
        });

        clearTimeout(timer);

        if(!response.ok) throw new Error(`Serverantwort ${response.status}`);

        const data=await response.json();
        const normalized=(data.elements||[])
          .map(element=>normalizeOverpassElement(element,currentSupplyCategory))
          .filter(Boolean);

        collected.push(...normalized);
        completed++;
        success=true;
        break;
      }catch(error){
        console.warn("Overpass-Teilabfrage fehlgeschlagen:",error);
      }
    }

    if(!success) failures++;
  }

  collected=dedupePlaces(collected);

  currentSupplyResults=collected
    .map(place=>({
      ...place,
      stageId:stage.id,
      distanceKm:distanceToStageKm(place,segment)
    }))
    .filter(place=>place.distanceKm<=maxDistance)
    .sort((a,b)=>a.distanceKm-b.distanceKm)
    .slice(0,80);

  status.textContent=
    `${currentSupplyResults.length} Treffer gefunden · ${completed}/${windows.length} Teilabfragen erfolgreich${failures?` · ${failures} fehlgeschlagen`:""}.`;

  renderSupplyResults(currentSupplyResults);
});


document.getElementById("saveManualPlaceBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour||!currentSupplyStageId) return;

  const name=document.getElementById("manualPlaceName").value.trim();
  const category=document.getElementById("manualPlaceCategory").value;
  const lat=Number(document.getElementById("manualPlaceLat").value);
  const lng=Number(document.getElementById("manualPlaceLng").value);

  if(!name||!Number.isFinite(lat)||!Number.isFinite(lng)){
    alert("Bitte Name sowie gültige Koordinaten eingeben.");
    return;
  }

  const stages=loadStagesLocal(activeTour.id);
  const stage=stages.find(item=>item.id===currentSupplyStageId);
  const track=await getTrack(activeTour.id);
  const segment=stage&&track?.points?.length?stageTrackSegment(track.points,stage):[];

  const place={
    id:`manual-${Date.now()}`,
    stageId:currentSupplyStageId,
    name,
    category,
    lat,
    lng,
    distanceKm:segment.length>=2?distanceToStageKm({lat,lng},segment):0,
    tags:{source:"manual"}
  };

  addPlaceLocal(activeTour.id,place);
  document.getElementById("manualPlaceName").value="";
  document.getElementById("manualPlaceLat").value="";
  document.getElementById("manualPlaceLng").value="";

  document.getElementById("supplyStatus").textContent="Manueller Ort gespeichert.";
  await renderPlaces();
  await renderStages();
});

document.getElementById("supplyResults")?.addEventListener("click",async(event)=>{
  const index=event.target.dataset.saveSupply;
  if(index===undefined) return;

  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const place=currentSupplyResults[Number(index)];
  if(!place) return;

  addPlaceLocal(activeTour.id,place);
  event.target.textContent="Gespeichert";
  event.target.disabled=true;
  await renderPlaces();
  await renderStages();
});

function placeCategoryLabel(category){
  const labels={
    accommodation:"Übernachten",
    camping:"Camping",
    water:"Wasser",
    shop:"Einkauf",
    pharmacy:"Apotheke",
    footwear:"Outdoor / Schuhe",
    other:"Ort"
  };
  return labels[category]||category||"Ort";
}

async function renderPlaces(){
  const activeTour=await getActiveTour();
  const list=document.getElementById("placeList");
  if(!list) return;

  if(!activeTour){
    list.innerHTML='<div class="empty">Keine aktive Tour.</div>';
    return;
  }

  const places=loadPlacesLocal(activeTour.id);
  const stageSelect=document.getElementById("placeCreateStage");
  if(stageSelect){
    const current=stageSelect.value;
    const stages=loadStagesLocal(activeTour.id).filter(stage=>!stage.restDay);
    stageSelect.innerHTML='<option value="">Keine Etappe</option>'+stages.map((stage,index)=>
      `<option value="${stage.id}">Etappe ${index+1}: ${escapeHtml(stage.from||"")} → ${escapeHtml(stage.to||"")}</option>`
    ).join("");
    if([...stageSelect.options].some(option=>option.value===current)) stageSelect.value=current;
  }
  document.getElementById("placeCount").textContent=String(places.length);
  document.getElementById("campingCount").textContent=String(places.filter(p=>p.category==="camping").length);
  document.getElementById("waterCount").textContent=String(places.filter(p=>p.category==="water").length);
  document.getElementById("shopCount").textContent=String(places.filter(p=>p.category==="shop").length);
  document.getElementById("favoriteCount").textContent=String(places.filter(p=>p.favorite).length);

  const visiblePlaces=placeFilter==="favorites"?places.filter(place=>place.favorite):places;

  list.innerHTML=visiblePlaces.length
    ?visiblePlaces.map(place=>`
      <article class="place-card ${place.favorite?"favorite":""}">
        <h3>${escapeHtml(place.name||"Unbenannter Ort")}</h3>
        <div class="poi-meta">
          <span class="pill">${escapeHtml(placeCategoryLabel(place.category))}</span>
          ${place.stageId?'<span class="pill">Etappe zugeordnet</span>':""}
          ${place.preferredStart?'<span class="preferred-badge">Bevorzugter Start</span>':""}
          ${place.preferredEnd?'<span class="preferred-badge">Bevorzugtes Ziel</span>':""}
          ${place.preferred?'<span class="preferred-badge">Bevorzugter Stopp</span>':""}
        </div>
        <div class="card-actions">
          <button data-preferred-start="${place.id}">${place.preferredStart?"Start ✓":"Als Start"}</button>
          <button data-preferred-end="${place.id}">${place.preferredEnd?"Ziel ✓":"Als Ziel"}</button>
          ${place.preferredStart?`<button data-clear-preferred-start="${place.stageId}">Start entfernen</button>`:""}
          ${place.preferredEnd?`<button data-clear-preferred-end="${place.stageId}">Ziel entfernen</button>`:""}
          <button data-favorite-place="${place.id}" class="favorite-star">${place.favorite?"★ Favorit":"☆ Favorit"}</button>
          <button data-show-place="${place.id}">Auf Karte</button>
          <button class="danger" data-delete-place="${place.id}">Löschen</button>
        </div>
      </article>
    `).join("")
    :'<div class="empty">Keine passenden Orte vorhanden.</div>';
}


document.getElementById("savePlaceFromPlacesBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const name=document.getElementById("placeCreateName")?.value.trim();
  const category=document.getElementById("placeCreateCategory")?.value||"other";
  const stageId=document.getElementById("placeCreateStage")?.value||"";
  const lat=Number(document.getElementById("placeCreateLat")?.value);
  const lng=Number(document.getElementById("placeCreateLng")?.value);

  if(!name||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180){
    alert("Bitte Name sowie gültige Koordinaten eingeben.");
    return;
  }

  let distanceKm=0;
  if(stageId){
    const stage=loadStagesLocal(activeTour.id).find(item=>item.id===stageId);
    const track=await getTrack(activeTour.id);
    const segment=stage&&track?.points?.length?stageTrackSegment(track.points,stage):[];
    if(segment.length>=2) distanceKm=distanceToStageKm({lat,lng},segment);
  }

  addPlaceLocal(activeTour.id,{
    id:`manual-${Date.now()}`,
    stageId,
    name,
    category,
    lat,
    lng,
    distanceKm,
    tags:{source:"manual-places"}
  });

  document.getElementById("placeCreateName").value="";
  document.getElementById("placeCreateLat").value="";
  document.getElementById("placeCreateLng").value="";
  document.getElementById("placeCreateStage").value="";
  await renderPlaces();
  await renderStages();
});

document.getElementById("showAllPlacesBtn")?.addEventListener("click",async()=>{
  placeFilter="all";
  await renderPlaces();
});

document.getElementById("showFavoritePlacesBtn")?.addEventListener("click",async()=>{
  placeFilter="favorites";
  await renderPlaces();
});

document.getElementById("placeList")?.addEventListener("click",async(event)=>{
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const places=loadPlacesLocal(activeTour.id);
  const deleteId=event.target.dataset.deletePlace;
  const showId=event.target.dataset.showPlace;
  const favoriteId=event.target.dataset.favoritePlace;
  const preferredStartId=event.target.dataset.preferredStart;
  const preferredEndId=event.target.dataset.preferredEnd;
  const clearPreferredStartStageId=event.target.dataset.clearPreferredStart;
  const clearPreferredEndStageId=event.target.dataset.clearPreferredEnd;


  if(preferredStartId){
    setPreferredStartLocal(activeTour.id,preferredStartId);
    await renderPlaces(); await renderStages(); await renderDashboardStats(); return;
  }

  if(preferredEndId){
    setPreferredEndLocal(activeTour.id,preferredEndId);
    await renderPlaces(); await renderStages(); await renderDashboardStats(); return;
  }

  if(clearPreferredStartStageId){
    clearPreferredStartLocal(activeTour.id,clearPreferredStartStageId);
    await renderPlaces(); await renderStages(); await renderDashboardStats(); return;
  }

  if(clearPreferredEndStageId){
    clearPreferredEndLocal(activeTour.id,clearPreferredEndStageId);
    await renderPlaces(); await renderStages(); await renderDashboardStats(); return;
  }

  if(favoriteId){
    toggleFavoriteLocal(activeTour.id,favoriteId);
    await renderPlaces();
    return;
  }

  if(deleteId&&confirm("Ort wirklich löschen?")){
    deletePlaceLocal(activeTour.id,deleteId);
    await renderPlaces();
    await renderStages();
  }

  if(showId){
    const place=places.find(item=>item.id===showId);
    if(!place) return;

    document.querySelector('[data-page="map"]').click();
    setTimeout(()=>{
      initMap();
      map.setView([place.lat,place.lng],15);
      L.marker([place.lat,place.lng])
        .addTo(trackLayer)
        .bindPopup(`<strong>${escapeHtml(place.name)}</strong>${place.category==="footwear"?`<span>${escapeHtml(footwearBrandHint(place))}</span>`:""}`)
        .openPopup();
    },150);
  }
});

splitStageForm?.addEventListener("submit",async(event)=>{
  event.preventDefault();

  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const id=document.getElementById("splitStageId").value;
  const location=document.getElementById("splitStageLocation").value.trim();
  const firstKm=Number(document.getElementById("splitStageKm").value);

  try{
    splitStageLocal(activeTour.id,id,location,firstKm);
    const stages=loadStagesLocal(activeTour.id);

    recalculateStageDates(
      activeTour.id,
      activeTour.startDate||stages[0]?.date||new Date().toISOString().slice(0,10)
    );

    splitStageDialog.close();
    await renderStages();
  }catch(error){
    alert(error.message);
  }
});

document.getElementById("recalculateStageDatesBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const stages=loadStagesLocal(activeTour.id);
  if(!stages.length) return;

  recalculateStageDates(
    activeTour.id,
    activeTour.startDate||stages[0].date||new Date().toISOString().slice(0,10)
  );

  await renderStages();
});



document.getElementById("confirmPreferredStartBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour||!pendingPreferredStartStageId) return;

  const stages=loadStagesLocal(activeTour.id);
  const stage=stages.find(item=>item.id===pendingPreferredStartStageId);
  const preferred=getPreferredStartForStage(activeTour.id,pendingPreferredStartStageId);

  if(!stage||!preferred){
    pendingPreferredStartStageId=null;
    document.getElementById("preferredStartDialog").close();
    return;
  }

  updateStageLocal(activeTour.id,{
    ...stage,
    from:preferred.name,
    notes:[stage.notes,`Bevorzugter Start nach ausdrücklicher Bestätigung übernommen (${preferred.category})`]
      .filter(Boolean).join(" · ")
  });

  pendingPreferredStartStageId=null;
  document.getElementById("preferredStartDialog").close();
  await renderStages();
  await renderDashboardStats();
});

document.getElementById("preferredStartDialog")?.addEventListener("close",()=>{
  pendingPreferredStartStageId=null;
});

document.getElementById("confirmPreferredDestinationBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour||!pendingPreferredDestinationStageId) return;

  const stages=loadStagesLocal(activeTour.id);
  const stage=stages.find(item=>item.id===pendingPreferredDestinationStageId);
  const preferred=getPreferredEndForStage(activeTour.id,pendingPreferredDestinationStageId);

  if(!stage||!preferred){
    pendingPreferredDestinationStageId=null;
    document.getElementById("preferredDestinationDialog").close();
    return;
  }

  updateStageLocal(activeTour.id,{
    ...stage,
    to:preferred.name,
    notes:[
      stage.notes,
      `Bevorzugter Stopp nach ausdrücklicher Bestätigung als Etappenziel übernommen (${preferred.category})`
    ].filter(Boolean).join(" · ")
  });

  propagateStageDestinationToNext(
    activeTour.id,
    stage.id,
    preferred.name,
    Number.isFinite(Number(preferred.lat)) && Number.isFinite(Number(preferred.lng))
      ? {lat:Number(preferred.lat),lng:Number(preferred.lng)}
      : stage.endCoord||null
  );

  pendingPreferredDestinationStageId=null;
  document.getElementById("preferredDestinationDialog").close();

  await renderStages();
  await renderDashboardStats();
});

document.getElementById("preferredDestinationDialog")?.addEventListener("close",()=>{
  pendingPreferredDestinationStageId=null;
});


document.getElementById("saveShoeIntervalBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const input=document.getElementById("shoeChangeIntervalKm");
  const interval=Number(input?.value||0);

  if(!Number.isFinite(interval)||interval<100){
    alert("Bitte ein Schuhwechsel-Intervall ab 100 km eingeben.");
    return;
  }

  saveShoeIntervalLocal(activeTour.id,interval);
  await renderStages();
});

document.getElementById("generateStagesBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const track=await getTrack(activeTour.id);
  if(!track?.points?.length){
    alert("Bitte zuerst einen GPX-Track importieren.");
    return;
  }

  const targetKm=Number(document.getElementById("stageTargetKm").value||28);
  const startDate=
    document.getElementById("stageStartDate").value||
    activeTour.startDate||
    new Date().toISOString().slice(0,10);

  const chunks=splitTrack(track.points,targetKm);
  let stages=chunks.map((points,index)=>{
    const stats=calculateStage(points);
    return {
      id:`${activeTour.id}-stage-${index+1}`,
      tourId:activeTour.id,
      order:index+1,
      name:`Etappe ${index+1}`,
      date:addDays(startDate,index),
      from:`Start ${index+1}`,
      to:`Ziel ${index+1}`,
      distanceKm:stats.distanceKm,
      ascentM:stats.ascentM,
      descentM:stats.descentM,
      walkingHours:stats.walkingHours,
      startCoord:points[0],
      endCoord:points.at(-1),
      notes:"",
      completed:false,
      restDay:false
    };
  });

  const restEveryDays=Number(document.getElementById("restEveryDays").value||0);
  stages=distributeRestDays(stages,restEveryDays);

  // Dates must include automatically inserted rest days.
  stages=stages.map((stage,index)=>({
    ...stage,
    order:index+1,
    date:addDays(startDate,index),
    name:stage.restDay?"Ruhetag":stage.name
  }));

  let saveResult;
  try{
    saveResult=saveStagesLocal(activeTour.id,stages);
  }catch(error){
    document.getElementById("stageStatus").textContent=`Speichern fehlgeschlagen: ${error.message}`;
    alert(`Etappen konnten nicht gespeichert werden: ${error.message}`);
    return;
  }

  const restCount=stages.filter(stage=>stage.restDay).length;
  const walkingCount=stages.length-restCount;
  document.getElementById("stageStatus").textContent=
    `${walkingCount} Wandertage und ${restCount} automatische Ruhetage gespeichert und geprüft.`;

  try{
    await renderStages();
  }catch(error){
    console.error("Etappen wurden gespeichert, konnten aber nicht vollständig dargestellt werden:",error);
    document.getElementById("stageStatus").textContent=
      `${walkingCount} Wandertage und ${restCount} Ruhetage gespeichert. Anzeigeproblem: ${error.message}`;
    alert(`Die Etappen wurden gespeichert, aber die Anzeige konnte nicht vollständig aktualisiert werden: ${error.message}`);
  }
});

document.getElementById("deleteStagesBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  if(confirm("Alle Etappen löschen?")){
    deleteStagesLocal(activeTour.id);
    await renderStages();
  }
});

document.getElementById("exportStagesBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const stages=loadStagesLocal(activeTour.id);
  if(!stages.length){
    alert("Keine Etappen zum Exportieren vorhanden.");
    return;
  }

  const link=document.createElement("a");
  link.href=URL.createObjectURL(
    new Blob([JSON.stringify({
      version:"5.2",
      tourId:activeTour.id,
      exportedAt:new Date().toISOString(),
      stages
    },null,2)],{type:"application/json"})
  );
  link.download=`${activeTour.id}-etappen.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});


function downloadJsonFile(filename,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

document.getElementById("exportFullTourBtn")?.addEventListener("click",async()=>{
  const activeTour=await getActiveTour();
  const status=document.getElementById("backupStatus");

  if(!activeTour){
    status.textContent="Keine aktive Tour zum Exportieren.";
    return;
  }

  try{
    const track=await getTrack(activeTour.id);
    const stages=loadStagesLocal(activeTour.id);
    const places=loadPlacesLocal(activeTour.id);
    const shoeIntervalKm=loadShoeIntervalLocal(activeTour.id,700);

    const payload={
      schema:"3113-adventures-tour-backup",
      schemaVersion:1,
      exportedAt:new Date().toISOString(),
      appVersion:"v4.0.0 · Sprint 7.8",
      tour:activeTour,
      track:track||null,
      stages,
      places,
      settings:{
        shoeIntervalKm
      }
    };

    const safeName=(activeTour.name||"tour")
      .replace(/[^a-z0-9äöüß_-]+/gi,"-")
      .replace(/^-+|-+$/g,"");

    downloadJsonFile(`${safeName||"tour"}-3113-backup.json`,payload);

    status.textContent=
      `Export erstellt: ${stages.length} Etappen · ${places.length} Orte · ${track?.points?.length||0} GPX-Punkte.`;
  }catch(error){
    console.error("Backup-Export fehlgeschlagen:",error);
    status.textContent=`Export fehlgeschlagen: ${error.message}`;
  }
});

document.getElementById("importFullTourInput")?.addEventListener("change",async(event)=>{
  const file=event.target.files?.[0];
  const status=document.getElementById("backupStatus");
  if(!file) return;

  try{
    const data=JSON.parse(await file.text());

    if(data?.schema!=="3113-adventures-tour-backup"){
      throw new Error("Diese Datei ist kein gültiges 3113-Adventures-Tourbackup.");
    }

    if(!data.tour?.id){
      throw new Error("Tourdaten fehlen.");
    }

    const now=new Date().toISOString();
    const importedTour={
      ...data.tour,
      active:true,
      updatedAt:now,
      createdAt:data.tour.createdAt||now
    };

    await saveTour(importedTour);

    if(data.track?.points?.length){
      await saveTrack({
        ...data.track,
        tourId:importedTour.id,
        updatedAt:now
      });
    }

    if(Array.isArray(data.stages)){
      saveStagesLocal(importedTour.id,data.stages.map(stage=>({
        ...stage,
        tourId:importedTour.id
      })));
    }

    if(Array.isArray(data.places)){
      savePlacesLocal(importedTour.id,data.places.map(place=>({
        ...place,
        tourId:importedTour.id
      })));
    }

    if(data.settings?.shoeIntervalKm){
      saveShoeIntervalLocal(importedTour.id,Number(data.settings.shoeIntervalKm));
    }

    status.textContent=
      `Import erfolgreich: ${data.stages?.length||0} Etappen · ${data.places?.length||0} Orte.`;

    await renderTours();
    await renderGpx();
    await renderStages();
    await renderPlaces();
    await renderDashboardStats();
  }catch(error){
    console.error("Backup-Import fehlgeschlagen:",error);
    status.textContent=`Import fehlgeschlagen: ${error.message}`;
    alert(`Tour konnte nicht importiert werden: ${error.message}`);
  }finally{
    event.target.value="";
  }
});




let activePackPerson="person1";
const collapsedPackCategories=new Set();



function getShoeChangeStageInfo(stages,currentKm,intervalKm){
  const remaining=Math.max(0,Number(intervalKm||700)-Number(currentKm||0));
  let cumulative=0;

  for(const stage of stages){
    if(stage.restDay) continue;
    const distance=Number(stage.distanceKm||0);
    const before=cumulative;
    cumulative+=distance;

    if(remaining<=cumulative+1e-9){
      return {
        stage,
        remainingKm:remaining,
        kmIntoStage:Math.max(0,remaining-before),
        cumulativeKm:cumulative
      };
    }
  }

  return {
    stage:null,
    remainingKm:remaining,
    kmIntoStage:null,
    cumulativeKm:cumulative
  };
}

function stageShoePersonWarningHtml(stage,shoePlan,names){
  const warnings=[];

  ["person1","person2"].forEach(personKey=>{
    const info=shoePlan[personKey];
    if(info?.stageId===stage.id){
      const personName=personKey==="person1"?names.person1:names.person2;
      warnings.push(
        `<div class="shoe-stage-warning">
          <strong>👟 Schuhwechsel ${escapeHtml(personName)}</strong>
          <span>voraussichtlich auf dieser Etappe${Number.isFinite(info.kmIntoStage)?` · ca. ${Math.round(info.kmIntoStage)} km nach Etappenstart`:""}</span>
          <div class="shoe-supply-actions">
            <button type="button" data-shoe-supply-stage="${stage.id}" data-shoe-person="${personKey}">
              Schuhversorgung suchen
            </button>
          </div>
          <span class="shoe-supply-note">Sucht gezielt nach Schuh-/Outdoor-Versorgung rund um diese Etappe.</span>
        </div>`
      );
    }
  });

  return warnings.join("");
}

async function renderTourShoes(){
  const activeTour=await getActiveTour();
  const gear=loadGearLocal().filter(item=>item.category==="shoes");

  const pairs=[
    {key:"person1",selectId:"shoePerson1Select",kmId:"shoePerson1Km",intervalId:"shoePerson1Interval",statusId:"shoePerson1Status",titleId:"shoePerson1Title"},
    {key:"person2",selectId:"shoePerson2Select",kmId:"shoePerson2Km",intervalId:"shoePerson2Interval",statusId:"shoePerson2Status",titleId:"shoePerson2Title"}
  ];

  if(!activeTour){
    pairs.forEach(cfg=>{
      const select=document.getElementById(cfg.selectId);
      if(select) select.innerHTML='<option value="">Keine aktive Tour</option>';
      const status=document.getElementById(cfg.statusId);
      if(status) status.textContent="Keine aktive Tour.";
    });
    return;
  }

  const names=loadPackNamesLocal(activeTour.id);

  pairs.forEach(cfg=>{
    const title=document.getElementById(cfg.titleId);
    if(title) title.textContent=cfg.key==="person1"?names.person1:names.person2;

    const state=loadTourShoePersonLocal(activeTour.id,cfg.key);
    const select=document.getElementById(cfg.selectId);

    if(select){
      const otherKey=cfg.key==="person1"?"person2":"person1";
      const otherState=loadTourShoePersonLocal(activeTour.id,otherKey);
      select.innerHTML='<option value="">Kein Schuh ausgewählt</option>'+
        gear.map(item=>{
          const usedByOther=otherState.gearId===item.id && state.gearId!==item.id;
          return `<option value="${item.id}" ${usedByOther?"disabled":""}>${escapeHtml(item.brand?`${item.brand} ${item.name}`:item.name)}${usedByOther?" · bereits andere Person":""}</option>`;
        }).join("");
      select.value=state.gearId||"";
    }

    const kmInput=document.getElementById(cfg.kmId);
    const intervalInput=document.getElementById(cfg.intervalId);
    if(kmInput) kmInput.value=Number(state.currentKm||0);
    if(intervalInput) intervalInput.value=Number(state.intervalKm||700);

    const selected=gear.find(item=>item.id===state.gearId);
    const remaining=Math.max(0,Number(state.intervalKm||700)-Number(state.currentKm||0));
    const status=document.getElementById(cfg.statusId);
    const stages=loadStagesLocal(activeTour.id);
    const stageInfo=getShoeChangeStageInfo(stages,state.currentKm,state.intervalKm);

    if(status){
      if(!selected){
        status.textContent="Noch kein aktives Schuhpaar gewählt.";
      }else if(stageInfo.stage){
        status.textContent=
          `${selected.brand?selected.brand+" ":""}${selected.name} · ${Math.round(state.currentKm||0)} km gelaufen · ca. ${Math.round(remaining)} km bis Wechsel · voraussichtlich Etappe ${stageInfo.stage.order||stageInfo.stage.number||""}${stageInfo.stage.name?` (${stageInfo.stage.name})`:""}`;
      }else{
        status.textContent=
          `${selected.brand?selected.brand+" ":""}${selected.name} · ${Math.round(state.currentKm||0)} km gelaufen · ca. ${Math.round(remaining)} km bis Wechsel · Wechsel liegt nach dem aktuell geplanten Tourende`;
      }
    }
  });
}

async function saveTourShoeFromControls(personKey){
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const suffix=personKey==="person1"?"1":"2";
  const select=document.getElementById(`shoePerson${suffix}Select`);
  const km=document.getElementById(`shoePerson${suffix}Km`);
  const interval=document.getElementById(`shoePerson${suffix}Interval`);

  const requestedGearId=select?.value||"";
  const otherKey=personKey==="person1"?"person2":"person1";
  const otherState=loadTourShoePersonLocal(activeTour.id,otherKey);

  if(requestedGearId && otherState.gearId===requestedGearId){
    alert("Dieses Schuhpaar ist bereits der anderen Person zugeteilt. Ein Schuh kann pro Tour nur einer Person zugeordnet sein.");
    const current=loadTourShoePersonLocal(activeTour.id,personKey);
    if(select) select.value=current.gearId||"";
    return;
  }

  saveTourShoePersonLocal(activeTour.id,personKey,{
    gearId:requestedGearId,
    currentKm:Number(km?.value||0),
    intervalKm:Number(interval?.value||700)
  });

  await renderTourShoes();
}

["shoePerson1Select","shoePerson1Km","shoePerson1Interval"].forEach(id=>{
  document.getElementById(id)?.addEventListener("change",()=>saveTourShoeFromControls("person1"));
});
["shoePerson2Select","shoePerson2Km","shoePerson2Interval"].forEach(id=>{
  document.getElementById(id)?.addEventListener("change",()=>saveTourShoeFromControls("person2"));
});

function gearCategoryLabel(category){
  const de={shoes:"Schuhe",backpack:"Rucksack",sleep:"Schlafen",clothing:"Bekleidung",cooking:"Kochen",electronics:"Elektronik",hygiene:"Hygiene",firstaid:"Erste Hilfe",food:"Verpflegung",other:"Weiteres"};
  const en={shoes:"Shoes",backpack:"Backpack",sleep:"Sleep",clothing:"Clothing",cooking:"Cooking",electronics:"Electronics",hygiene:"Hygiene",firstaid:"First aid",food:"Food",other:"Other"};
  const language=document.getElementById("languageSelect")?.value||"de";
  return (language==="de"?de:en)[category]||category||((language==="de")?"Weiteres":"Other");
}

async function renderTourPack(){
  const activeTour=await getActiveTour();
  const container=document.getElementById("tourPackList");
  if(!container) return;

  if(!activeTour){
    container.innerHTML='<div class="pack-empty">Keine aktive Tour.</div>';
    document.getElementById("packTotalWeight").textContent="0.000 kg";
    document.getElementById("packWornWeight").textContent="0.000 kg";
    document.getElementById("packNetWeight").textContent="0.000 kg";
    document.getElementById("packItemCount").textContent="0";
    return;
  }

  const names=loadPackNamesLocal(activeTour.id);
  currentPersonNames={...names};
  document.getElementById("packPerson1Name").value=names.person1;
  document.getElementById("packPerson2Name").value=names.person2;
  document.getElementById("packPerson1Btn").textContent=names.person1;
  document.getElementById("packPerson2Btn").textContent=names.person2;

  document.getElementById("packPerson1Btn").classList.toggle("active",activePackPerson==="person1");
  document.getElementById("packPerson2Btn").classList.toggle("active",activePackPerson==="person2");

  const gear=loadGearLocal();
  const pack=loadTourPersonPackLocal(activeTour.id,activePackPerson);
  const byId=new Map(gear.map(item=>[item.id,item]));

  let total=0,worn=0;
  const rows=[];

  pack.forEach(entry=>{
    const item=byId.get(entry.gearId);
    if(!item) return;
    const quantity=Math.max(1,Number(entry.quantity||1));
    const lineWeight=Number(item.weightG||0)*quantity;
    total+=lineWeight;
    if(entry.worn) worn+=lineWeight;
    rows.push({item,entry,quantity,lineWeight});
  });

  rows.sort((a,b)=>
    String(a.item.category||"Weiteres").localeCompare(String(b.item.category||"Weiteres")) ||
    String(a.item.name||"").localeCompare(String(b.item.name||""))
  );

  document.getElementById("packTotalWeight").textContent=formatKg3FromGrams(total);
  document.getElementById("packWornWeight").textContent=formatKg3FromGrams(worn);
  document.getElementById("packNetWeight").textContent=formatKg3FromGrams(total-worn);
  document.getElementById("packItemCount").textContent=String(rows.length);

  if(!rows.length){
    container.innerHTML='<div class="pack-empty">Noch keine Artikel in dieser Packliste. Füge Artikel in „Mein Transa“ über Person 1 oder Person 2 hinzu.</div>';
    return;
  }

  const groups=new Map();
  rows.forEach(row=>{
    const category=row.item.category||"Weiteres";
    if(!groups.has(category)) groups.set(category,[]);
    groups.get(category).push(row);
  });

  container.innerHTML=[...groups.entries()].map(([category,groupRows])=>{
    const categoryWeight=groupRows.reduce((sum,row)=>sum+row.lineWeight,0);
    const categoryWorn=groupRows.filter(row=>row.entry.worn).reduce((sum,row)=>sum+row.lineWeight,0);
    const categoryNet=categoryWeight-categoryWorn;
    const key=`${activePackPerson}:${category}`;
    const collapsed=collapsedPackCategories.has(key);

    return `<section class="pack-category ${collapsed?"collapsed":""}">
      <button type="button" class="pack-category-header" data-pack-category-toggle="${escapeHtml(key)}">
        <div>
          <strong>${escapeHtml(gearCategoryLabel(category))}</strong>
          <span class="muted small">${groupRows.length} Position${groupRows.length===1?"":"en"}</span>
        </div>
        <div class="pack-category-meta">
          <span class="pill">Total ${formatKg3FromGrams(categoryWeight)}</span>
          <span class="pill">Körper ${formatKg3FromGrams(categoryWorn)}</span>
          <span class="pill">Netto ${formatKg3FromGrams(categoryNet)}</span>
          <span>${collapsed?"▸":"▾"}</span>
        </div>
      </button>

      <div class="pack-category-body">
        ${groupRows.map(({item,entry,quantity,lineWeight})=>`
          <div class="pack-item-row ${item.consumable?"consumable":""} ${entry.worn?"worn":""}">
            <div class="pack-item-main">
              <strong>${escapeHtml(item.brand?`${item.brand} ${item.name}`:item.name)}</strong>
              <span>${Number(item.weightG||0)} g pro Stück</span>
              ${item.consumable?'<span class="pack-consumable">Verbrauchsartikel</span>':""}
              ${entry.worn?'<span class="pack-worn-badge">am Körper</span>':""}
            </div>

            <label>
              <span>Menge</span>
              <input type="number"
                     data-pack-quantity="${item.id}"
                     min="1"
                     max="${availableQuantityForPerson(activeTour.id,activePackPerson,item.id,Number(item.stock??item.quantity??1))}"
                     step="1"
                     value="${quantity}">
              <small class="muted">Bestand ${Number(item.stock??item.quantity??1)}</small>
            </label>

            <label>
              <input type="checkbox" data-pack-worn="${item.id}" ${entry.worn?"checked":""}>
              am Körper
            </label>

            <div class="pack-item-weight">${formatKg3FromGrams(lineWeight)}</div>

            <div class="pack-item-actions">
              <button class="danger" data-pack-remove="${item.id}" type="button">Entfernen</button>
            </div>
          </div>
        `).join("")}
      </div>
    </section>`;
  }).join("");
}

document.getElementById("packPerson1Btn")?.addEventListener("click",async()=>{
  activePackPerson="person1";
  await renderTourPack();
});
document.getElementById("packPerson2Btn")?.addEventListener("click",async()=>{
  activePackPerson="person2";
  await renderTourPack();
});

async function savePackNamesFromInputs(){
  const activeTour=await getActiveTour();
  if(!activeTour) return;
  const names={
    person1:document.getElementById("packPerson1Name").value.trim()||"Person 1",
    person2:document.getElementById("packPerson2Name").value.trim()||"Person 2"
  };
  savePackNamesLocal(activeTour.id,names);
  currentPersonNames={...names};
  await renderTourPack();
  renderGear();
}
document.getElementById("packPerson1Name")?.addEventListener("change",savePackNamesFromInputs);
document.getElementById("packPerson2Name")?.addEventListener("change",savePackNamesFromInputs);

document.getElementById("tourPackList")?.addEventListener("change",async(event)=>{
  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const toggleId=event.target.dataset.packToggle;
  const qtyId=event.target.dataset.packQuantity;
  const wornId=event.target.dataset.packWorn;

  if(toggleId){
    const gearItem=loadGearLocal().find(item=>item.id===toggleId);
    if(gearItem){
      const used=packedQuantityAcrossPersons(activeTour.id,toggleId);
      const stock=Number(gearItem.stock??gearItem.quantity??1);
      if(used>=stock){
        alert(`Nicht möglich. Bestand: ${stock}. Bereits eingepackt: ${used}.`);
      }else{
        toggleGearInPersonPackLocal(activeTour.id,activePackPerson,toggleId);
      }
    }
  }

  if(qtyId){
    const gearItem=loadGearLocal().find(item=>item.id===qtyId);
    if(gearItem){
      const maxForPerson=availableQuantityForPerson(
        activeTour.id,
        activePackPerson,
        qtyId,
        Number(gearItem.stock??gearItem.quantity??1)
      );
      const requested=Math.max(1,Number(event.target.value||1));
      const quantity=Math.min(requested,maxForPerson);

      if(requested>maxForPerson){
        alert(`Maximal ${maxForPerson} Stück möglich. Gesamtbestand: ${Number(gearItem.stock??gearItem.quantity??1)}.`);
      }

      if(maxForPerson<=0){
        event.target.value=1;
      }else{
        updatePersonPackItemLocal(activeTour.id,activePackPerson,qtyId,{quantity});
      }
    }
  }

  if(wornId) updatePersonPackItemLocal(activeTour.id,activePackPerson,wornId,{worn:event.target.checked});

  await renderTourPack();
});

document.getElementById("tourPackList")?.addEventListener("click",async(event)=>{
  const categoryKey=event.target.closest("[data-pack-category-toggle]")?.dataset.packCategoryToggle;
  if(categoryKey){
    if(collapsedPackCategories.has(categoryKey)) collapsedPackCategories.delete(categoryKey);
    else collapsedPackCategories.add(categoryKey);
    await renderTourPack();
    return;
  }

  const removeId=event.target.dataset.packRemove;
  if(!removeId) return;

  const activeTour=await getActiveTour();
  if(!activeTour) return;

  const pack=loadTourPersonPackLocal(activeTour.id,activePackPerson);
  if(pack.some(item=>item.gearId===removeId)){
    toggleGearInPersonPackLocal(activeTour.id,activePackPerson,removeId);
  }
  await renderTourPack();
});


function csvEscape(value){
  const text=String(value??"");
  if(/[",\n;]/.test(text)){
    return `"${text.replace(/"/g,'""')}"`;
  }
  return text;
}

function exportGearItems(){
  const items=loadGearLocal();
  const headers=[
    "id","name","brand","category","weightG","stock",
    "location","favorite","wishlist","notes"
  ];

  const rows=[headers.join(";")];

  items.forEach(item=>{
    rows.push([
      item.id,
      item.name,
      item.brand,
      item.category,
      Number(item.weightG||0),
      Number(item.stock??item.quantity??1),
      item.location,
      item.favorite?"1":"0",
      item.wishlist?"1":"0",
      item.notes
    ].map(csvEscape).join(";"));
  });

  const blob=new Blob(["\ufeff"+rows.join("\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download="3113-adventures-artikel.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);

  document.getElementById("gearTransferStatus").textContent=
    `${items.length} Artikel als CSV exportiert.`;
}

function detectCsvDelimiter(text){
  const firstLine=(text.split(/\r?\n/)[0]||"");
  const candidates=[";",",","\t"];
  let best=";",bestCount=-1;

  for(const delimiter of candidates){
    let count=0,quoted=false;
    for(let i=0;i<firstLine.length;i++){
      const ch=firstLine[i];
      if(ch==='"'){
        if(quoted&&firstLine[i+1]==='"'){i++;continue;}
        quoted=!quoted;
      }else if(!quoted&&ch===delimiter){
        count++;
      }
    }
    if(count>bestCount){
      bestCount=count;
      best=delimiter;
    }
  }
  return best;
}

function parseCsv(text){
  const delimiter=detectCsvDelimiter(text);
  const rows=[];
  let row=[],field="",quoted=false;

  for(let i=0;i<text.length;i++){
    const ch=text[i];

    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){
        field+='"'; i++;
      }else if(ch==='"'){
        quoted=false;
      }else{
        field+=ch;
      }
    }else{
      if(ch==='"'){
        quoted=true;
      }else if(ch===delimiter){
        row.push(field); field="";
      }else if(ch==="\n"){
        row.push(field); rows.push(row); row=[]; field="";
      }else if(ch!=="\r"){
        field+=ch;
      }
    }
  }

  if(field.length||row.length){
    row.push(field); rows.push(row);
  }

  return {rows,delimiter};
}

document.getElementById("exportGearBtn")?.addEventListener("click",exportGearItems);

document.getElementById("importGearInput")?.addEventListener("change",async(event)=>{
  const file=event.target.files?.[0];
  if(!file) return;

  const status=document.getElementById("gearTransferStatus");

  try{
    const text=(await file.text()).replace(/^\ufeff/,"");
    const parsed=parseCsv(text);
    const rows=parsed.rows;

    if(rows.length<2) throw new Error("Die CSV-Datei enthält keine Artikel.");

    const headers=rows[0].map(value=>value.trim());
    const normalized=headers.map(h=>h.toLowerCase());

    function headerIndex(...names){
      for(const name of names){
        const i=normalized.indexOf(name.toLowerCase());
        if(i>=0) return i;
      }
      return -1;
    }

    const idx={
      id:headerIndex("id"),
      name:headerIndex("name","item name","artikelname"),
      brand:headerIndex("brand","manufacturer","hersteller"),
      category:headerIndex("category","kategorie"),
      weight:headerIndex("weightg","weight","gewicht"),
      qty:headerIndex("stock","qty","menge"),
      location:headerIndex("location","lagerplatz","lagerort"),
      favorite:headerIndex("favorite","favorit"),
      wishlist:headerIndex("wishlist","wunschliste"),
      notes:headerIndex("notes","desc","notizen","beschreibung"),
      price:headerIndex("price","preis"),
      worn:headerIndex("worn"),
      consumable:headerIndex("consumable")
    };

    if(idx.name<0) throw new Error("Spalte für Artikelname fehlt.");
    if(idx.weight<0) throw new Error("Spalte für Gewicht fehlt.");

    const existing=loadGearLocal();
    const byId=new Map(existing.map(item=>[item.id,item]));
    let imported=0;

    rows.slice(1).forEach(values=>{
      if(values.every(value=>!String(value).trim())) return;

      const val=i=>i>=0?(values[i]??""):"";
      const id=val(idx.id)||`gear-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

      byId.set(id,{
        id,
        name:String(val(idx.name)).trim(),
        brand:String(val(idx.brand)).trim(),
        category:String(val(idx.category)).trim()||"other",
        weightG:Number(String(val(idx.weight)).replace(",","."))||0,
        stock:Number(val(idx.qty)||1),
        quantity:Number(val(idx.qty)||1),
        location:String(val(idx.location)).trim(),
        favorite:["1","true","ja","yes"].includes(String(val(idx.favorite)).toLowerCase()),
        wishlist:["1","true","ja","yes"].includes(String(val(idx.wishlist)).toLowerCase()),
        notes:String(val(idx.notes)).trim(),
        price:Number(String(val(idx.price)).replace(",","."))||0,
        shop:String(val(idx.shop)).trim(),
        url:String(val(idx.url)).trim(),
        priority:String(val(idx.priority)).trim().toLowerCase()||"normal",
        wornDefault:["1","true","ja","yes"].includes(String(val(idx.worn)).toLowerCase()),
        consumable:["1","true","ja","yes"].includes(String(val(idx.consumable)).toLowerCase()),
        updatedAt:new Date().toISOString()
      });
      imported++;
    });

    saveGearLocal([...byId.values()]);
    renderGear();
    await renderTourPack();
    status.textContent=`CSV-Import erfolgreich: ${imported} Artikel übernommen · Trennzeichen ${parsed.delimiter==="\t"?"Tabulator":parsed.delimiter}`;
  }catch(error){
    status.textContent=`CSV-Import fehlgeschlagen: ${error.message}`;
  }finally{
    event.target.value="";
  }
});

const gearDialog=document.getElementById("gearDialog");
const gearForm=document.getElementById("gearForm");
let selectedGearIds=new Set();
let currentPersonNames={person1:"Person 1",person2:"Person 2"};

function openGearDialog(item=null){
  document.getElementById("gearId").value=item?.id||"";
  document.getElementById("gearName").value=item?.name||"";
  document.getElementById("gearBrand").value=item?.brand||"";
  document.getElementById("gearCategory").value=item?.category||"other";
  document.getElementById("gearWeight").value=item?.weightG??"";
  document.getElementById("gearQuantity").value=item?.quantity??1;
  document.getElementById("gearLocation").value=item?.location||"";
  document.getElementById("gearStock").value=item?.stock??item?.quantity??1;
  document.getElementById("gearWishlist").checked=Boolean(item?.wishlist);
  document.getElementById("gearPrice").value=item?.price??"";
  document.getElementById("gearShop").value=item?.shop||"";
  document.getElementById("gearUrl").value=item?.url||"";
  document.getElementById("gearPriority").value=item?.priority||"normal";
  document.getElementById("gearNotes").value=item?.notes||"";
  document.getElementById("gearFavorite").checked=Boolean(item?.favorite);
  gearDialog.showModal();
}


function gearAllocatedQuantity(tourId,gearId){
  return ["person1","person2"].reduce((sum,personKey)=>{
    return sum+loadTourPersonPackLocal(tourId,personKey)
      .filter(entry=>entry.gearId===gearId)
      .reduce((subtotal,entry)=>subtotal+Number(entry.quantity||1),0);
  },0);
}

function gearAvailabilityInfo(tourId,item){
  const stock=Math.max(0,Number(item.stock??item.quantity??1));
  const allocated=gearAllocatedQuantity(tourId,item.id);
  return {
    stock,
    allocated,
    available:Math.max(0,stock-allocated)
  };
}

async function renderGear(){
  const list=document.getElementById("gearList");
  if(!list) return;

  const items=loadGearLocal();
  const activeTour=await getActiveTour();
  const query=(document.getElementById("gearSearch")?.value||"").trim().toLowerCase();
  const category=document.getElementById("gearCategoryFilter")?.value||"all";
  const sort=document.getElementById("gearSort")?.value||"name";

  let filtered=items.filter(item=>{
    const matchesCategory=category==="all"||(category==="wishlist"?Boolean(item.wishlist):item.category===category);
    const text=[item.name,item.brand,item.category,item.location,item.notes].filter(Boolean).join(" ").toLowerCase();
    return matchesCategory&&(!query||text.includes(query));
  });

  filtered=[...filtered].sort((a,b)=>{
    if(sort==="weightAsc") return Number(a.weightG||0)-Number(b.weightG||0);
    if(sort==="weightDesc") return Number(b.weightG||0)-Number(a.weightG||0);
    if(sort==="category") return String(a.category||"").localeCompare(String(b.category||""))||String(a.name||"").localeCompare(String(b.name||""));
    return String(a.name||"").localeCompare(String(b.name||""));
  });

  setTextSafe("gearCount",String(items.filter(item=>!item.wishlist).length));
  setTextSafe("gearWeightTotal",
    formatKg3FromGrams(
      items.filter(item=>!item.wishlist).reduce((sum,item)=>sum+Number(item.weightG||0)*Number(item.stock??item.quantity??1),0)
    ));
  setTextSafe("gearShoeCount",
    String(items.filter(item=>item.category==="shoes").length));
  setTextSafe("gearFavoriteCount",
    String(items.filter(item=>item.favorite).length));
  const wishlistItems=items.filter(item=>item.wishlist);
  setTextSafe("gearWishlistCount",String(wishlistItems.length));
  setTextSafe("gearWishlistValue",`CHF ${wishlistItems.reduce((sum,item)=>sum+Number(item.price||0),0).toFixed(2)}`);

  const wishlistList=document.getElementById("gearWishlistList");
  if(wishlistList){
    wishlistList.innerHTML=wishlistItems.length
      ?wishlistItems
        .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")))
        .map(item=>`
          <div class="wishlist-item">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.brand||"")}${item.weightG?` · ${Number(item.weightG)} g`:""}</span>
              <div class="wishlist-meta">
                ${Number(item.price||0)>0?`<span class="pill">CHF ${Number(item.price).toFixed(2)}</span>`:""}
                ${item.shop?`<span class="pill">${escapeHtml(item.shop)}</span>`:""}
                <span class="pill">Priorität: ${item.priority==="high"?"Hoch":item.priority==="low"?"Niedrig":"Normal"}</span>
              </div>
              ${item.notes?`<small>${escapeHtml(item.notes)}</small>`:""}
            </div>
            <div class="button-row">
              ${item.url?`<a class="button secondary" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Artikel öffnen ↗</a>`:""}
              <button class="primary" data-buy-wishlist="${item.id}">✓ Gekauft / in Bestand</button>
              <button class="secondary" data-edit-gear="${item.id}">Bearbeiten</button>
            </div>
          </div>`).join("")
      :'<div class="empty">Noch keine Artikel auf der Wunschliste.</div>';
  }

  list.innerHTML=filtered.length
    ?filtered.map(item=>`
      <tr class="${item.wishlist?"wishlist-row":""} ${item.favorite?"favorite-row":""}">
        <td><input type="checkbox" data-select-gear="${item.id}" ${selectedGearIds.has(item.id)?"checked":""}></td>
        <td class="gear-name">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.brand||"")}</span>
          ${item.favorite?'<span>★ Favorit</span>':""}
          ${item.wishlist?'<span>Wunschliste</span>':""}
        </td>
        <td>${escapeHtml(item.category||"")}</td>
        <td>
          <strong>${Number(item.weightG||0)} g</strong>
          <span class="muted small">${Number(item.stock??item.quantity??1)} × ${Number(item.weightG||0)} g</span>
        </td>
        <td>${activeTour?(()=>{
          const info=gearAvailabilityInfo(activeTour.id,item);
          return `<div class="stock-status"><strong>${info.available}</strong><span>frei von ${info.stock}</span>${info.allocated?`<span>${info.allocated} eingepackt</span>`:""}</div>`;
        })():Number(item.stock??item.quantity??1)}</td>
        <td>${escapeHtml(item.location||"–")}</td>
        <td>
          <div class="gear-actions">
            <button data-add-gear-person1="${item.id}" ${item.wishlist||activeTour&&gearAvailabilityInfo(activeTour.id,item).available<=0?"disabled":""}>→ ${escapeHtml(currentPersonNames.person1)}</button>
            <button data-add-gear-person2="${item.id}" ${item.wishlist||activeTour&&gearAvailabilityInfo(activeTour.id,item).available<=0?"disabled":""}>→ ${escapeHtml(currentPersonNames.person2)}</button>
            <button data-edit-gear="${item.id}">Bearbeiten</button>
            <button class="danger" data-delete-gear="${item.id}">Löschen</button>
          </div>
        </td>
      </tr>
    `).join("")
    :'<tr><td colspan="7" class="muted">Noch keine passenden Ausrüstungsartikel vorhanden.</td></tr>';
}

document.getElementById("addGearBtn")?.addEventListener("click",()=>openGearDialog());

gearForm?.addEventListener("submit",(event)=>{
  event.preventDefault();
  const id=document.getElementById("gearId").value||`gear-${Date.now()}`;

  upsertGearLocal({
    id,
    name:document.getElementById("gearName").value.trim(),
    brand:document.getElementById("gearBrand").value.trim(),
    category:document.getElementById("gearCategory").value,
    weightG:Number(document.getElementById("gearWeight").value||0),
    quantity:Number(document.getElementById("gearQuantity").value||1),
    location:document.getElementById("gearLocation").value.trim(),
    stock:Number(document.getElementById("gearStock").value||0),
    wishlist:document.getElementById("gearWishlist").checked,
    price:Number(document.getElementById("gearPrice").value||0),
    shop:document.getElementById("gearShop").value.trim(),
    url:document.getElementById("gearUrl").value.trim(),
    priority:document.getElementById("gearPriority").value||"normal",
    notes:document.getElementById("gearNotes").value.trim(),
    favorite:document.getElementById("gearFavorite").checked,
    updatedAt:new Date().toISOString()
  });

  gearDialog.close();
  renderGear();
  renderTourPack();
});


document.getElementById("gearWishlistList")?.addEventListener("click",(event)=>{
  const buyId=event.target.dataset.buyWishlist;
  const editId=event.target.dataset.editGear;
  const items=loadGearLocal();

  if(buyId){
    const item=items.find(entry=>entry.id===buyId);
    if(!item) return;
    const answer=prompt(`Wie viele Stück von „${item.name}“ hast du gekauft?`,"1");
    if(answer===null) return;
    const stock=Math.max(1,Math.floor(Number(answer)||1));
    upsertGearLocal({
      ...item,
      wishlist:false,
      stock,
      quantity:stock,
      updatedAt:new Date().toISOString()
    });
    renderGear();
    renderTourPack();
    return;
  }

  if(editId){
    const item=items.find(entry=>entry.id===editId);
    if(item) openGearDialog(item);
  }
});

document.getElementById("gearList")?.addEventListener("change",(event)=>{
  const selectId=event.target.dataset.selectGear;
  if(!selectId) return;
  if(event.target.checked) selectedGearIds.add(selectId);
  else selectedGearIds.delete(selectId);
});

document.getElementById("gearList")?.addEventListener("click",async(event)=>{
  const person1Id=event.target.dataset.addGearPerson1;
  const person2Id=event.target.dataset.addGearPerson2;

  if(person1Id||person2Id){
    const activeTour=await getActiveTour();
    if(!activeTour) return;

    const personKey=person1Id?"person1":"person2";
    const gearId=person1Id||person2Id;
    const currentPack=loadTourPersonPackLocal(activeTour.id,personKey);
    const gearItem=loadGearLocal().find(item=>item.id===gearId);

    if(gearItem){
      const stock=Number(gearItem.stock??gearItem.quantity??1);
      const used=packedQuantityAcrossPersons(activeTour.id,gearId);
      const available=Math.max(0,stock-used);
      const existing=currentPack.find(item=>item.gearId===gearId);

      if(available<=0){
        alert(`Artikel kann nicht hinzugefügt werden. Bestand: ${stock}. Bereits eingepackt: ${used}.`);
      }else{
        const answer=prompt(
          `Wie viele Stück von „${gearItem.name}“ sollen ${personKey==="person1"?currentPersonNames.person1:currentPersonNames.person2} zugewiesen werden?\nNoch verfügbar: ${available}`,
          "1"
        );

        if(answer!==null){
          const requested=Math.max(1,Math.floor(Number(answer)||1));
          const quantity=Math.min(requested,available);

          if(requested>available){
            alert(`Es sind nur noch ${available} Stück verfügbar. Es werden ${quantity} Stück zugewiesen.`);
          }

          if(existing){
            updatePersonPackItemLocal(activeTour.id,personKey,gearId,{
              quantity:Number(existing.quantity||1)+quantity
            });
          }else{
            toggleGearInPersonPackLocal(activeTour.id,personKey,gearId);
            updatePersonPackItemLocal(activeTour.id,personKey,gearId,{quantity});
          }
        }
      }
    }

    activePackPerson=personKey;
    await renderTourPack();
    await renderGear();
    if(typeof renderSidebarSummary==="function") await renderSidebarSummary();
    return;
  }
});

document.getElementById("gearList")?.addEventListener("click",(event)=>{
  const editId=event.target.dataset.editGear;
  const deleteId=event.target.dataset.deleteGear;
  const items=loadGearLocal();

  if(editId){
    const item=items.find(entry=>entry.id===editId);
    if(item) openGearDialog(item);
  }

  if(deleteId&&confirm("Ausrüstungsartikel wirklich löschen?")){
    deleteGearLocal(deleteId);
    renderGear();
    renderTourPack();
  }
});

document.getElementById("gearSearch")?.addEventListener("input",renderGear);
document.getElementById("gearCategoryFilter")?.addEventListener("change",renderGear);
document.getElementById("gearSort")?.addEventListener("change",renderGear);


document.getElementById("selectAllGearBtn")?.addEventListener("click",()=>{
  loadGearLocal().forEach(item=>selectedGearIds.add(item.id));
  renderGear();
});

document.getElementById("clearGearSelectionBtn")?.addEventListener("click",()=>{
  selectedGearIds.clear();
  renderGear();
});

document.getElementById("deleteSelectedGearBtn")?.addEventListener("click",async()=>{
  if(!selectedGearIds.size) return;
  if(!confirm(`${selectedGearIds.size} ausgewählte Artikel wirklich löschen?`)) return;

  const remaining=loadGearLocal().filter(item=>!selectedGearIds.has(item.id));
  saveGearLocal(remaining);
  selectedGearIds.clear();
  await renderGear();
  await renderTourPack();
  if(typeof renderSidebarSummary==="function") await renderSidebarSummary();
});



async function renderPrintPreview(){
  const preview=document.getElementById("printPreview");
  if(!preview) return;

  const mode=document.getElementById("printMode")?.value||"gear";
  const gear=loadGearLocal();

  if(mode==="gear"){
    const rows=[...gear].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
    preview.innerHTML=`
      <h2>3113 Adventures – Artikelliste</h2>
      <table>
        <thead><tr><th>Artikel</th><th>Marke</th><th>Kategorie</th><th>Gewicht</th><th>Bestand</th><th>Lagerort</th></tr></thead>
        <tbody>${rows.map(item=>`
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.brand||"")}</td>
            <td>${escapeHtml(item.category||"")}</td>
            <td>${Number(item.weightG||0)} g</td>
            <td>${Number(item.stock??item.quantity??1)}</td>
            <td>${escapeHtml(item.location||"")}</td>
          </tr>`).join("")}</tbody>
      </table>`;
    return;
  }

  const activeTour=await getActiveTour();
  if(!activeTour){
    preview.innerHTML="<p>Keine aktive Tour.</p>";
    return;
  }

  const personKey=mode==="person2"?"person2":"person1";
  const names=loadPackNamesLocal(activeTour.id);
  const label=personKey==="person1"?names.person1:names.person2;
  const pack=loadTourPersonPackLocal(activeTour.id,personKey);
  const byId=new Map(gear.map(item=>[item.id,item]));

  let total=0,worn=0;
  const rows=pack.map(entry=>{
    const item=byId.get(entry.gearId);
    if(!item) return null;
    const weight=Number(item.weightG||0)*Number(entry.quantity||1);
    total+=weight;
    if(entry.worn) worn+=weight;
    return {item,entry,weight};
  }).filter(Boolean);

  preview.innerHTML=`
    <h2>${escapeHtml(activeTour.name||"Tour")} – Packliste ${escapeHtml(label)}</h2>
    <p><strong>Total:</strong> ${formatKg3FromGrams(total)} · <strong>am Körper:</strong> ${formatKg3FromGrams(worn)} · <strong>Netto:</strong> ${formatKg3FromGrams(total-worn)}</p>
    <table>
      <thead><tr><th>Artikel</th><th>Menge</th><th>Gewicht</th><th>am Körper</th></tr></thead>
      <tbody>${rows.map(({item,entry,weight})=>`
        <tr>
          <td>${escapeHtml(item.brand?`${item.brand} ${item.name}`:item.name)}</td>
          <td>${Number(entry.quantity||1)}</td>
          <td>${formatKg3FromGrams(weight)}</td>
          <td>${entry.worn?"Ja":"Nein"}</td>
        </tr>`).join("")}</tbody>
    </table>`;
}


document.getElementById("printPreviewBtn")?.addEventListener("click",renderPrintPreview);
document.getElementById("printMode")?.addEventListener("change",renderPrintPreview);
document.getElementById("printNowBtn")?.addEventListener("click",async()=>{
  await renderPrintPreview();
  window.print();
});


function roadbookSupplyItems(tourId,stageId){
  const places=getPlacesForStage(tourId,stageId);
  const categories=[
    ["camping","Camping"],
    ["food","Lebensmittel"],
    ["water","Wasser"],
    ["restaurant","Restaurant"],
    ["transport","ÖV"],
    ["footwear","Schuhe"]
  ];

  return categories.map(([category,label])=>{
    const matches=places
      .filter(place=>place.category===category)
      .sort((a,b)=>Number(a.distanceKm||999)-Number(b.distanceKm||999));
    const best=matches[0];
    return best
      ? `<li><strong>${label}:</strong> ${escapeHtml(best.name)} · ${Number(best.distanceKm||0).toFixed(2)} km</li>`
      : `<li><strong>${label}:</strong> –</li>`;
  }).join("");
}

function roadbookShoeWarnings(tourId,stage,stages){
  const names=loadPackNamesLocal(tourId);
  const warnings=[];

  ["person1","person2"].forEach(personKey=>{
    const state=loadTourShoePersonLocal(tourId,personKey);
    if(!state.gearId) return;

    const info=getShoeChangeStageInfo(stages,state.currentKm,state.intervalKm);
    if(info.stage?.id!==stage.id) return;

    const gearItem=loadGearLocal().find(item=>item.id===state.gearId);
    const personName=personKey==="person1"?names.person1:names.person2;
    const shoeName=gearItem
      ? (gearItem.brand?`${gearItem.brand} ${gearItem.name}`:gearItem.name)
      : "Schuh";

    warnings.push(
      `<li><strong>${escapeHtml(personName)}:</strong> ${escapeHtml(shoeName)} · Wechsel voraussichtlich nach ca. ${Math.round(info.kmIntoStage||0)} km dieser Etappe</li>`
    );
  });

  return warnings.length
    ? warnings.join("")
    : "<li>Kein Schuhwechsel auf dieser Etappe prognostiziert.</li>";
}

async function renderRoadbook(){
  const preview=document.getElementById("roadbookPreview");
  const select=document.getElementById("roadbookStageSelect");
  if(!preview||!select) return;

  const activeTour=await getActiveTour();
  if(!activeTour){
    select.innerHTML='<option value="">Keine aktive Tour</option>';
    preview.innerHTML='<div class="empty">Keine aktive Tour.</div>';
    return;
  }

  const stages=loadStagesLocal(activeTour.id);
  const walkingStages=stages.filter(stage=>!stage.restDay);

  const currentValue=select.value;
  select.innerHTML=walkingStages.length
    ? walkingStages.map(stage=>`<option value="${stage.id}">${escapeHtml(stage.name||`Etappe ${stage.order}`)} · ${stage.date||""}</option>`).join("")
    : '<option value="">Keine Etappen</option>';

  if(currentValue&&walkingStages.some(stage=>stage.id===currentValue)){
    select.value=currentValue;
  }

  const stage=walkingStages.find(item=>item.id===select.value)||walkingStages[0];
  if(!stage){
    preview.innerHTML='<div class="empty">Noch keine Wanderetappen vorhanden.</div>';
    return;
  }

  select.value=stage.id;

  const preferredStart=getPreferredStartForStage(activeTour.id,stage.id);
  const preferredEnd=getPreferredEndForStage(activeTour.id,stage.id);

  preview.innerHTML=`
    <article class="roadbook-sheet">
      <div class="roadbook-head">
        <div>
          <h3>${escapeHtml(stage.name||`Etappe ${stage.order}`)}</h3>
          <div class="roadbook-route"><strong>${escapeHtml(stage.from||"–")}</strong> → <strong>${escapeHtml(stage.to||"–")}</strong></div>
          <div class="muted">${escapeHtml(activeTour.name||"Tour")} · ${escapeHtml(stage.date||"")}</div>
        </div>
        <div class="pill">${Number(stage.distanceKm||0).toFixed(1)} km</div>
      </div>

      <div class="roadbook-stats">
        <div class="roadbook-stat"><strong>${Number(stage.distanceKm||0).toFixed(1)} km</strong><span>Distanz</span></div>
        <div class="roadbook-stat"><strong>${Math.round(Number(stage.ascentM||0))} m</strong><span>Aufstieg</span></div>
        <div class="roadbook-stat"><strong>${Math.round(Number(stage.descentM||0))} m</strong><span>Abstieg</span></div>
        <div class="roadbook-stat"><strong>${formatHours(stage.walkingHours||0)}</strong><span>Gehzeit</span></div>
      </div>

      <div class="roadbook-grid">
        <div class="roadbook-box">
          <h4>Start & Ziel</h4>
          <p><strong>Festgelegter Start:</strong> ${escapeHtml(stage.from||"–")}</p>
          <p><strong>Festgelegtes Ziel:</strong> ${escapeHtml(stage.to||"–")}</p>
          <p><strong>Bevorzugter Start:</strong> ${preferredStart?escapeHtml(preferredStart.name):"–"}</p>
          <p><strong>Bevorzugtes Ziel:</strong> ${preferredEnd?escapeHtml(preferredEnd.name):"–"}</p>
        </div>

        <div class="roadbook-box">
          <h4>Versorgung</h4>
          <ul class="roadbook-list">${roadbookSupplyItems(activeTour.id,stage.id)}</ul>
        </div>

        <div class="roadbook-box">
          <h4>Schuhe</h4>
          <ul class="roadbook-list">${roadbookShoeWarnings(activeTour.id,stage,stages)}</ul>
        </div>

        <div class="roadbook-box">
          <h4>Notizen</h4>
          <p>${stage.notes?escapeHtml(stage.notes):"Keine Notizen."}</p>
        </div>
      </div>
    </article>`;
}

document.getElementById("roadbookStageSelect")?.addEventListener("change",renderRoadbook);
document.getElementById("roadbookRefreshBtn")?.addEventListener("click",renderRoadbook);
document.getElementById("roadbookPrintBtn")?.addEventListener("click",async()=>{
  await renderRoadbook();
  window.print();
});


function activatePage(pageId){
  navButtons.forEach(button=>{
    button.classList.toggle("active",button.dataset.page===pageId);
  });
  pages.forEach(page=>{
    page.classList.toggle("active",page.id===pageId);
  });

  if(pageId==="map"){
    setTimeout(async()=>{
      initMap();
      if(map){
        map.invalidateSize();
        await renderMapTrack();
      }
    },100);
  }
}

document.querySelectorAll("[data-page-jump]").forEach(button=>{
  button.addEventListener("click",()=>activatePage(button.dataset.pageJump));
});

async function renderSidebarSummary(){
  const tour=await getActiveTour();
  const tourName=document.getElementById("sidebarTourName");
  const tourDates=document.getElementById("sidebarTourDates");
  const tourStages=document.getElementById("sidebarTourStages");

  if(tour){
    const stages=loadStagesLocal(tour.id);
    if(tourName) tourName.textContent=tour.name||"Aktive Tour";
    if(tourDates) tourDates.textContent=[tour.startDate,tour.targetDate].filter(Boolean).join(" – ")||"–";
    if(tourStages) tourStages.textContent=`${stages.filter(s=>!s.restDay).length} Etappen`;

    const names=loadPackNamesLocal(tour.id);
    const p1=document.getElementById("sidebarPerson1");
    const p2=document.getElementById("sidebarPerson2");
    if(p1) p1.textContent=names.person1;
    if(p2) p2.textContent=names.person2;

    const gear=loadGearLocal();
    const byId=new Map(gear.map(item=>[item.id,item]));
    const calc=(personKey)=>loadTourPersonPackLocal(tour.id,personKey).reduce((sum,entry)=>{
      const item=byId.get(entry.gearId);
      return sum+(item?Number(item.weightG||0)*Number(entry.quantity||1):0);
    },0);

    const w1=document.getElementById("sidebarPerson1Weight");
    const w2=document.getElementById("sidebarPerson2Weight");
    if(w1) w1.textContent=formatKg3FromGrams(calc("person1"));
    if(w2) w2.textContent=formatKg3FromGrams(calc("person2"));
  }else{
    if(tourName) tourName.textContent="Keine aktive Tour";
    if(tourDates) tourDates.textContent="–";
    if(tourStages) tourStages.textContent="0 Etappen";
  }
}


const CLOUD_CONFIG_KEY="3113-cloud-config-v1";
const CLOUD_AUTOLOAD_KEY="3113-cloud-autoload-v1";
let cloudClient=null;

function getCloudConfig(){
  try{
    return JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY)||"{}");
  }catch{
    return {};
  }
}

function saveCloudConfig(url,key){
  localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify({
    url:String(url||"").trim(),
    key:String(key||"").trim()
  }));
}

function createCloudClient(){
  const config=getCloudConfig();
  if(!config.url||!config.key||!window.supabase?.createClient){
    cloudClient=null;
    return null;
  }

  cloudClient=window.supabase.createClient(config.url,config.key,{
    auth:{
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:true,
      storage:window.localStorage,
      storageKey:"3113-adventures-auth"
    }
  });
  return cloudClient;
}

function cloudSetStatus(message,error=false){
  const el=document.getElementById("cloudStatus");
  if(el){
    el.textContent=message;
    el.classList.toggle("error",Boolean(error));
  }
}

function cloudSetBusy(busy){
  ["cloudUploadBtn","cloudDownloadBtn","cloudSignInBtn","cloudSignUpBtn","cloudSignOutBtn","cloudForgotPasswordBtn","cloudSetNewPasswordBtn"]
    .forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.disabled=Boolean(busy);
    });
}

async function cloudCurrentUser(){
  if(!cloudClient) return null;
  const {data,error}=await cloudClient.auth.getUser();
  if(error) return null;
  return data?.user||null;
}

async function renderCloudState(){
  const config=getCloudConfig();
  const urlInput=document.getElementById("cloudSupabaseUrl");
  const keyInput=document.getElementById("cloudSupabaseKey");
  if(urlInput&&!urlInput.value) urlInput.value=config.url||"";
  if(keyInput&&!keyInput.value) keyInput.value=config.key||"";

  const auto=document.getElementById("cloudAutoLoad");
  if(auto) auto.checked=localStorage.getItem(CLOUD_AUTOLOAD_KEY)==="1";

  const badge=document.getElementById("cloudStateBadge");
  const label=document.getElementById("cloudUserLabel");
  const accountInfo=document.getElementById("cloudAccountInfo");

  if(!cloudClient){
    if(badge) badge.textContent=config.url?"Verbindung prüfen":"Nicht verbunden";
    if(label) label.textContent="Nicht angemeldet";
    if(accountInfo) accountInfo.textContent="Nicht angemeldet · Supabase-Verbindung nicht bereit.";
    cloudSetStatus(config.url
      ?"Supabase-Konfiguration gefunden, Verbindung konnte aber nicht initialisiert werden."
      :"Cloud ist noch nicht eingerichtet.",Boolean(config.url));
    return;
  }

  const user=await cloudCurrentUser();
  if(user){
    if(badge) badge.textContent="Cloud aktiv";
    if(label) label.textContent=`Angemeldet als ${user.email||"Benutzer"}`;
    if(accountInfo) accountInfo.textContent=`✓ Angemeldet als: ${user.email||"Benutzer"}`;
    const emailInput=document.getElementById("cloudEmail");
    if(emailInput&&!emailInput.value&&user.email) emailInput.value=user.email;
    cloudSetStatus(`Cloud verbunden · angemeldet als ${user.email||"Benutzer"}. Die Anmeldung bleibt auf diesem Gerät gespeichert.`);
  }else{
    if(badge) badge.textContent="Bereit";
    if(label) label.textContent="Nicht angemeldet";
    if(accountInfo) accountInfo.textContent="Nicht angemeldet. Verwende dieselbe E-Mail-Adresse wie auf deinem bereits angemeldeten Gerät.";
    cloudSetStatus("Supabase-Verbindung ist eingerichtet. Bitte anmelden.");
  }
}

function collect3113LocalStorage(){
  const values={};
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key) continue;
    if(key.startsWith("3113-") && !key.startsWith("3113-cloud-") && key!=="3113-adventures-auth"){
      values[key]=localStorage.getItem(key);
    }
  }
  return values;
}

async function buildCloudSnapshot(){
  const tours=await getAllTours();
  const tracks=[];

  for(const tour of tours){
    const track=await getTrack(tour.id);
    if(track) tracks.push(track);
  }

  const settings=await getAllSettings();

  return {
    schema:"3113-adventures-cloud-snapshot",
    schemaVersion:1,
    appVersion:"v4.0.0 · Sprint 10.0",
    exportedAt:new Date().toISOString(),
    indexedDb:{
      tours,
      tracks,
      settings
    },
    localStorage:collect3113LocalStorage()
  };
}

async function restoreCloudSnapshot(snapshot){
  if(!snapshot||snapshot.schema!=="3113-adventures-cloud-snapshot"){
    throw new Error("Cloud-Datensatz hat ein unbekanntes Format.");
  }

  const indexed=snapshot.indexedDb||{};
  await clearAppDatabase();

  for(const setting of indexed.settings||[]){
    await setSetting(setting.key,setting.value);
  }

  for(const tour of indexed.tours||[]){
    await saveTour(tour);
  }

  for(const track of indexed.tracks||[]){
    await saveTrack(track);
  }

  // Only clear app-owned local keys, never Supabase auth/session or unrelated site data.
  const toDelete=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key&&key.startsWith("3113-")&&!key.startsWith("3113-cloud-")&&key!=="3113-adventures-auth"){
      toDelete.push(key);
    }
  }
  toDelete.forEach(key=>localStorage.removeItem(key));

  Object.entries(snapshot.localStorage||{}).forEach(([key,value])=>{
    if(key.startsWith("3113-")&&!key.startsWith("3113-cloud-")&&key!=="3113-adventures-auth"){
      localStorage.setItem(key,String(value));
    }
  });
}


const CLOUD_TRACK_CHUNK_POINTS=4000;

function splitTrackForCloud(track){
  const points=Array.isArray(track?.points)?track.points:[];
  const base={...track};
  delete base.points;

  const chunks=[];
  for(let i=0;i<points.length;i+=CLOUD_TRACK_CHUNK_POINTS){
    chunks.push(points.slice(i,i+CLOUD_TRACK_CHUNK_POINTS));
  }

  return {base,chunks};
}

async function buildCloudChunks(revision){
  const tours=await getAllTours();
  const settings=await getAllSettings();
  const chunks=[];

  chunks.push({
    chunk_key:`rev:${revision}:meta`,
    payload:{
      schema:"3113-adventures-cloud-chunks",
      schemaVersion:3,
      revision,
      appVersion:"v4.0.0 · Sprint 10.3",
      exportedAt:new Date().toISOString(),
      sourceDevice:cloudDeviceId(),
      tours,
      settings,
      localStorage:collect3113LocalStorage()
    }
  });

  for(const tour of tours){
    const track=await getTrack(tour.id);
    if(!track) continue;

    const split=splitTrackForCloud(track);

    chunks.push({
      chunk_key:`rev:${revision}:track-meta:${tour.id}`,
      payload:{
        tourId:tour.id,
        base:split.base,
        chunkCount:split.chunks.length
      }
    });

    split.chunks.forEach((points,index)=>{
      chunks.push({
        chunk_key:`rev:${revision}:track:${tour.id}:${String(index).padStart(5,"0")}`,
        payload:{tourId:tour.id,index,points}
      });
    });
  }

  return chunks;
}

async function uploadCloudSnapshot(){
  if(!cloudClient) throw new Error("Supabase-Verbindung ist nicht eingerichtet.");
  const user=await cloudCurrentUser();
  if(!user) throw new Error("Bitte zuerst anmelden.");

  const revision=`${Date.now()}-${cloudDeviceId().slice(0,8)}-${Math.random().toString(16).slice(2,8)}`;
  const chunks=await buildCloudChunks(revision);
  const now=new Date().toISOString();

  cloudSetStatus(`Cloud-Speichern: ${chunks.length} Datenpakete werden vorbereitet …`);

  // 1) Upload every chunk of the new revision first.
  for(let i=0;i<chunks.length;i++){
    const chunk=chunks[i];
    cloudSetStatus(`Cloud-Speichern: Paket ${i+1} von ${chunks.length} …`);

    const {error}=await cloudClient
      .from("user_sync_chunks")
      .upsert({
        user_id:user.id,
        chunk_key:chunk.chunk_key,
        payload:chunk.payload,
        updated_at:now
      },{onConflict:"user_id,chunk_key"});

    if(error) throw error;
  }

  // 2) Publish pointer LAST. Other devices continue using the old complete
  // revision until this one is fully present.
  const pointerPayload={
    revision,
    updatedAt:now,
    sourceDevice:cloudDeviceId(),
    chunkCount:chunks.length
  };

  const {error:pointerError}=await cloudClient
    .from("user_sync_chunks")
    .upsert({
      user_id:user.id,
      chunk_key:"current",
      payload:pointerPayload,
      updated_at:now
    },{onConflict:"user_id,chunk_key"});

  if(pointerError) throw pointerError;

  localStorage.setItem("3113-cloud-last-sync",now);
  const last=document.getElementById("cloudLastSync");
  if(last) last.textContent=`Zuletzt gespeichert: ${new Date(now).toLocaleString("de-CH")}`;

  return {
    chunks:chunks.length,
    updatedAt:now,
    revision,
    sourceDevice:cloudDeviceId()
  };
}

async function downloadCloudSnapshot(){
  if(localStorage.getItem(CLOUD_DIRTY_KEY)==="1" && cloudAutoSyncBusy){
    throw new Error("Lokale Änderungen werden gerade synchronisiert. Cloud-Laden wurde zum Schutz der lokalen Daten abgebrochen.");
  }
  if(!cloudClient) throw new Error("Supabase-Verbindung ist nicht eingerichtet.");
  const user=await cloudCurrentUser();
  if(!user) throw new Error("Bitte zuerst anmelden.");

  cloudSetStatus("Cloud-Daten werden geladen …");

  const {data:pointerRows,error:pointerError}=await cloudClient
    .from("user_sync_chunks")
    .select("payload,updated_at")
    .eq("user_id",user.id)
    .eq("chunk_key","current")
    .limit(1);

  if(pointerError) throw pointerError;
  const pointer=pointerRows?.[0]?.payload;
  if(!pointer?.revision) throw new Error("In der Cloud ist noch kein vollständiger App-Stand gespeichert.");

  const prefix=`rev:${pointer.revision}:`;

  const {data,error}=await cloudClient
    .from("user_sync_chunks")
    .select("chunk_key,payload,updated_at")
    .eq("user_id",user.id)
    .like("chunk_key",`${prefix}%`)
    .order("chunk_key",{ascending:true});

  if(error) throw error;
  if(!data?.length) throw new Error("Der aktuelle Cloud-Stand ist unvollständig.");

  const metaRow=data.find(row=>row.chunk_key===`${prefix}meta`);
  if(!metaRow?.payload) throw new Error("Cloud-Datensatz ist unvollständig: Metadaten fehlen.");

  const meta=metaRow.payload;
  if(meta.schema!=="3113-adventures-cloud-chunks"){
    throw new Error("Cloud-Datensatz hat ein unbekanntes Format.");
  }

  await clearAppDatabase();

  for(const setting of meta.settings||[]){
    await setSetting(setting.key,setting.value);
  }

  for(const tour of meta.tours||[]){
    await saveTour(tour);
  }

  const trackMetaRows=data.filter(row=>row.chunk_key.startsWith(`${prefix}track-meta:`));

  for(const row of trackMetaRows){
    const info=row.payload||{};
    const tourId=info.tourId;
    if(!tourId) continue;

    const pointRows=data
      .filter(item=>item.chunk_key.startsWith(`${prefix}track:${tourId}:`))
      .sort((a,b)=>Number(a.payload?.index||0)-Number(b.payload?.index||0));

    const points=pointRows.flatMap(item=>Array.isArray(item.payload?.points)?item.payload.points:[]);

    await saveTrack({
      ...(info.base||{}),
      tourId,
      points
    });
  }

  const toDelete=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key&&key.startsWith("3113-")&&!key.startsWith("3113-cloud-")&&key!=="3113-adventures-auth"){
      toDelete.push(key);
    }
  }
  toDelete.forEach(key=>localStorage.removeItem(key));

  Object.entries(meta.localStorage||{}).forEach(([key,value])=>{
    if(key.startsWith("3113-")&&!key.startsWith("3113-cloud-")&&key!=="3113-adventures-auth"){
      localStorage.setItem(key,String(value));
    }
  });

  const updatedAt=pointer.updatedAt||pointerRows?.[0]?.updated_at||null;

  const last=document.getElementById("cloudLastSync");
  if(last&&updatedAt){
    last.textContent=`Cloud-Stand geladen: ${new Date(updatedAt).toLocaleString("de-CH")}`;
  }

  return {
    chunks:data.length,
    updatedAt,
    revision:pointer.revision,
    sourceDevice:pointer.sourceDevice||meta.sourceDevice||null
  };
}


const CLOUD_AUTOSYNC_KEY="3113-cloud-autosync-v1";
const CLOUD_DIRTY_KEY="3113-cloud-dirty-v1";
const CLOUD_REMOTE_UPDATED_KEY="3113-cloud-remote-updated-v1";
const CLOUD_DEVICE_ID_KEY="3113-cloud-device-id-v1";
const CLOUD_LOCAL_CHANGED_KEY="3113-cloud-local-changed-v1";

let cloudAutoSyncTimer=null;
let cloudAutoSyncBusy=false;
let cloudLastLocalFingerprint="";
let cloudPollTimer=null;


function cloudDeviceId(){
  let id=localStorage.getItem(CLOUD_DEVICE_ID_KEY);
  if(!id){
    id=(crypto?.randomUUID?.()||`device-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    localStorage.setItem(CLOUD_DEVICE_ID_KEY,id);
  }
  return id;
}

function markLocalChangedNow(){
  localStorage.setItem(CLOUD_LOCAL_CHANGED_KEY,new Date().toISOString());
}

function setCloudSyncIndicator(state,message){
  const dot=document.getElementById("cloudSyncDot");
  const label=document.getElementById("cloudSyncLabel");
  if(dot) dot.className=`cloud-sync-dot ${state}`;
  if(label) label.textContent=message;
}

function autoSyncEnabled(){
  return localStorage.getItem(CLOUD_AUTOSYNC_KEY)==="1";
}

function markCloudDirty(){
  if(!autoSyncEnabled()) return;
  markLocalChangedNow();
  localStorage.setItem(CLOUD_DIRTY_KEY,"1");
  setCloudSyncIndicator(navigator.onLine?"pending":"offline",
    navigator.onLine?"Änderungen warten auf Synchronisation":"Offline – Änderungen ausstehend");
  scheduleCloudAutoSync();
}

async function markIndexedDbChangeAndSync(){
  if(!autoSyncEnabled()) return;
  markLocalChangedNow();
  localStorage.setItem(CLOUD_DIRTY_KEY,"1");
  setCloudSyncIndicator(navigator.onLine?"pending":"offline",
    navigator.onLine?"Lokale Änderung wird synchronisiert":"Offline – Änderung vorgemerkt");
  clearTimeout(cloudAutoSyncTimer);
  cloudAutoSyncTimer=setTimeout(()=>runCloudAutoSync("indexeddb-change"),700);
}

function scheduleCloudAutoSync(delay=1800){
  if(!autoSyncEnabled()) return;
  clearTimeout(cloudAutoSyncTimer);
  cloudAutoSyncTimer=setTimeout(()=>runCloudAutoSync("local-change"),delay);
}

async function localCloudFingerprint(){
  const tours=await getAllTours();
  const settings=await getAllSettings();
  const tracks=[];

  for(const tour of tours){
    const track=await getTrack(tour.id);
    if(track) tracks.push(track);
  }

  const stable={
    tours,
    settings,
    tracks,
    localStorage:collect3113LocalStorage()
  };

  const text=JSON.stringify(stable);
  let hash=2166136261;
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return `${text.length}:${hash>>>0}`;
}

async function remoteCloudInfo(){
  if(!cloudClient) return null;
  const user=await cloudCurrentUser();
  if(!user) return null;

  const {data,error}=await cloudClient
    .from("user_sync_chunks")
    .select("payload,updated_at")
    .eq("user_id",user.id)
    .eq("chunk_key","current")
    .limit(1);

  if(error) throw error;
  const row=data?.[0];
  if(!row?.payload?.revision) return null;

  return {
    revision:row.payload.revision,
    updatedAt:row.payload.updatedAt||row.updated_at,
    sourceDevice:row.payload.sourceDevice||null
  };
}

async function runCloudAutoSync(reason="timer"){
  if(!autoSyncEnabled()||cloudAutoSyncBusy) return;

  if(!navigator.onLine){
    setCloudSyncIndicator("offline","Offline – Änderungen ausstehend");
    return;
  }

  if(!cloudClient) createCloudClient();
  if(!cloudClient) return;

  const user=await cloudCurrentUser();
  if(!user){
    setCloudSyncIndicator("idle","Automatische Synchronisation wartet auf Anmeldung");
    return;
  }

  cloudAutoSyncBusy=true;

  try{
    setCloudSyncIndicator("syncing","Synchronisiere …");

    const currentFingerprint=await localCloudFingerprint();
    const localChanged=Boolean(cloudLastLocalFingerprint) &&
      currentFingerprint!==cloudLastLocalFingerprint;

    if(localChanged){
      markLocalChangedNow();
      localStorage.setItem(CLOUD_DIRTY_KEY,"1");
    }

    const dirty=localStorage.getItem(CLOUD_DIRTY_KEY)==="1";
    const remote=await remoteCloudInfo();
    const knownRevision=localStorage.getItem(CLOUD_REMOTE_UPDATED_KEY);
    const remoteChanged=Boolean(remote?.revision) &&
      Boolean(knownRevision) &&
      remote.revision!==knownRevision;

    // Local change has priority if the cloud is still at the revision we know.
    if(dirty && !remoteChanged){
      const result=await uploadCloudSnapshot();
      localStorage.setItem(CLOUD_DIRTY_KEY,"0");
      localStorage.setItem(CLOUD_REMOTE_UPDATED_KEY,result.revision);
      cloudLastLocalFingerprint=await localCloudFingerprint();
      setCloudSyncIndicator("synced","✓ Synchronisiert");
      return;
    }

    // Both sides changed independently: do not overwrite.
    if(dirty && remoteChanged){
      setCloudSyncIndicator("conflict","Konflikt – beide Geräte wurden geändert");
      cloudSetStatus("Dieses Gerät und ein anderes Gerät wurden seit der letzten Synchronisation geändert. Es wurde nichts überschrieben.",true);
      return;
    }

    // Only remote changed: download the fully published revision.
    if(remote?.revision && (!knownRevision || remote.revision!==knownRevision)){
      const result=await downloadCloudSnapshot();
      localStorage.setItem(CLOUD_REMOTE_UPDATED_KEY,result.revision);
      localStorage.setItem(CLOUD_DIRTY_KEY,"0");
      cloudLastLocalFingerprint=await localCloudFingerprint();
      setCloudSyncIndicator("synced","✓ Synchronisiert");
      return;
    }

    if(remote?.revision){
      localStorage.setItem(CLOUD_REMOTE_UPDATED_KEY,remote.revision);
    }
    cloudLastLocalFingerprint=currentFingerprint;
    setCloudSyncIndicator("synced","✓ Synchronisiert");
  }catch(error){
    console.warn("Automatische Cloud-Synchronisation fehlgeschlagen:",error);
    setCloudSyncIndicator("error","Synchronisation fehlgeschlagen");
  }finally{
    cloudAutoSyncBusy=false;
  }
}

function startCloudPolling(){
  clearInterval(cloudPollTimer);
  if(!autoSyncEnabled()) return;
  cloudPollTimer=setInterval(()=>runCloudAutoSync("poll"),5000);
}

function installLocalChangeWatcher(){
  // localStorage writes are used throughout the app. Wrapping setItem lets the
  // auto-sync engine see changes without rewriting every feature module.
  if(localStorage.__3113Wrapped) return;
  const originalSetItem=localStorage.setItem.bind(localStorage);
  const ignored=new Set([
    CLOUD_CONFIG_KEY,CLOUD_AUTOLOAD_KEY,CLOUD_AUTOSYNC_KEY,CLOUD_DIRTY_KEY,
    CLOUD_REMOTE_UPDATED_KEY,"3113-cloud-last-sync"
  ]);

  localStorage.setItem=function(key,value){
    originalSetItem(key,value);
    if(String(key).startsWith("3113-")&&!ignored.has(String(key))){
      markCloudDirty();
    }
  };
  try{ localStorage.__3113Wrapped=true; }catch{}
}

document.getElementById("cloudAutoSync")?.addEventListener("change",async event=>{
  localStorage.setItem(CLOUD_AUTOSYNC_KEY,event.target.checked?"1":"0");
  if(event.target.checked){
    setCloudSyncIndicator("pending","Automatische Synchronisation aktiv");
    try{
      cloudLastLocalFingerprint=await localCloudFingerprint();
      const remote=await remoteCloudInfo();
      const known=localStorage.getItem(CLOUD_REMOTE_UPDATED_KEY);
      if(!known && remote?.revision){
        // First activation: use current cloud as baseline only if this device
        // has no pending local edits. Otherwise upload/prompt on next cycle.
        if(localStorage.getItem(CLOUD_DIRTY_KEY)!=="1"){
          localStorage.setItem(CLOUD_REMOTE_UPDATED_KEY,remote.revision);
        }
      }
    }catch{}
    startCloudPolling();
    runCloudAutoSync("enabled");
  }else{
    clearInterval(cloudPollTimer);
    clearTimeout(cloudAutoSyncTimer);
    setCloudSyncIndicator("idle","Automatische Synchronisation aus");
  }
});


document.addEventListener("visibilitychange",()=>{
  if(!document.hidden && autoSyncEnabled()){
    setTimeout(()=>runCloudAutoSync("visibility"),250);
  }
});

window.addEventListener("focus",()=>{
  if(autoSyncEnabled()){
    setTimeout(()=>runCloudAutoSync("focus"),250);
  }
});

window.addEventListener("online",()=>{
  if(autoSyncEnabled()){
    setCloudSyncIndicator("pending","Online – Synchronisation wird fortgesetzt");
    runCloudAutoSync("online");
  }
});

window.addEventListener("offline",()=>{
  if(autoSyncEnabled()){
    setCloudSyncIndicator("offline","Offline – Änderungen ausstehend");
  }
});

window.addEventListener("storage",event=>{
  if(autoSyncEnabled() && event.key?.startsWith("3113-")){
    runCloudAutoSync("other-tab");
  }
});

document.getElementById("saveCloudConfigBtn")?.addEventListener("click",async()=>{
  const url=document.getElementById("cloudSupabaseUrl")?.value||"";
  const key=document.getElementById("cloudSupabaseKey")?.value||"";

  if(!url.trim()||!key.trim()){
    cloudSetStatus("Bitte Supabase Project URL und Browser-Schlüssel eingeben.",true);
    return;
  }

  saveCloudConfig(url,key);
  createCloudClient();
  await renderCloudState();
  if(cloudClient){
    cloudSetStatus("Supabase-Verbindung auf diesem Gerät gespeichert und initialisiert.");
  }
});

document.getElementById("cloudSignUpBtn")?.addEventListener("click",async()=>{
  try{
    cloudSetBusy(true);
    if(!cloudClient) createCloudClient();
    if(!cloudClient) throw new Error("Bitte zuerst die Supabase-Verbindung einrichten.");

    const email=document.getElementById("cloudEmail")?.value.trim();
    const password=document.getElementById("cloudPassword")?.value||"";
    if(!email||!password) throw new Error("E-Mail und Passwort eingeben.");

    const {data,error}=await cloudClient.auth.signUp({email,password});
    if(error) throw error;

    await renderCloudState();
    cloudSetStatus(data?.session
      ?"Konto erstellt und angemeldet."
      :"Konto erstellt. Falls E-Mail-Bestätigung aktiviert ist, bitte zuerst die E-Mail bestätigen.");
  }catch(error){
    cloudSetStatus(`Konto konnte nicht erstellt werden: ${error.message}`,true);
  }finally{
    cloudSetBusy(false);
  }
});

document.getElementById("cloudSignInBtn")?.addEventListener("click",async()=>{
  try{
    cloudSetBusy(true);
    if(!cloudClient) createCloudClient();
    if(!cloudClient) throw new Error("Bitte zuerst die Supabase-Verbindung einrichten.");

    const email=document.getElementById("cloudEmail")?.value.trim();
    const password=document.getElementById("cloudPassword")?.value||"";
    if(!email||!password) throw new Error("E-Mail und Passwort eingeben.");

    const {error}=await cloudClient.auth.signInWithPassword({email,password});
    if(error) throw error;

    await renderCloudState();
    cloudSetStatus("Anmeldung erfolgreich.");

    if(localStorage.getItem(CLOUD_AUTOLOAD_KEY)==="1" && !autoSyncEnabled()){
      try{
        await downloadCloudSnapshot();
        window.location.reload();
      }catch(error){
        if(String(error.message||"").includes("noch kein App-Stand")){
          cloudSetStatus("Anmeldung erfolgreich. In der Cloud ist noch kein App-Stand gespeichert. Auf dem Hauptgerät zuerst „Cloud speichern“.");
        }else{
          throw error;
        }
      }
    }
  }catch(error){
    cloudSetStatus(`Anmeldung fehlgeschlagen: ${error.message}`,true);
  }finally{
    cloudSetBusy(false);
  }
});

document.getElementById("cloudForgotPasswordBtn")?.addEventListener("click",async()=>{
  try{
    cloudSetBusy(true);
    if(!cloudClient) createCloudClient();
    if(!cloudClient) throw new Error("Bitte zuerst die Supabase-Verbindung einrichten.");
    const email=document.getElementById("cloudEmail")?.value.trim();
    if(!email) throw new Error("Bitte zuerst deine E-Mail-Adresse eingeben.");
    const redirectTo=`${window.location.origin}${window.location.pathname}`;
    const {error}=await cloudClient.auth.resetPasswordForEmail(email,{redirectTo});
    if(error) throw error;
    cloudSetStatus(`Passwort-Link wurde an ${email} angefordert. Öffne die E-Mail auf diesem Gerät und folge dem Link.`);
  }catch(error){
    cloudSetStatus(`Passwort-Wiederherstellung fehlgeschlagen: ${error.message}`,true);
  }finally{ cloudSetBusy(false); }
});

document.getElementById("cloudSetNewPasswordBtn")?.addEventListener("click",async()=>{
  try{
    cloudSetBusy(true);
    const password=document.getElementById("cloudNewPassword")?.value||"";
    if(password.length<6) throw new Error("Das neue Passwort muss mindestens 6 Zeichen lang sein.");
    const {error}=await cloudClient.auth.updateUser({password});
    if(error) throw error;
    document.getElementById("cloudRecoveryPanel").hidden=true;
    document.getElementById("cloudNewPassword").value="";
    await renderCloudState();
    cloudSetStatus("Neues Passwort gespeichert. Dieses Gerät ist jetzt angemeldet.");
  }catch(error){ cloudSetStatus(`Passwort konnte nicht gespeichert werden: ${error.message}`,true); }
  finally{ cloudSetBusy(false); }
});

document.getElementById("cloudSignOutBtn")?.addEventListener("click",async()=>{
  try{
    cloudSetBusy(true);
    if(cloudClient) await cloudClient.auth.signOut();
    await renderCloudState();
    cloudSetStatus("Abgemeldet. Lokale Daten bleiben auf diesem Gerät erhalten.");
  }catch(error){
    cloudSetStatus(`Abmelden fehlgeschlagen: ${error.message}`,true);
  }finally{
    cloudSetBusy(false);
  }
});

document.getElementById("cloudUploadBtn")?.addEventListener("click",async()=>{
  try{
    cloudSetBusy(true);
    const result=await uploadCloudSnapshot();
    localStorage.setItem(CLOUD_DIRTY_KEY,"0");
    localStorage.setItem(CLOUD_REMOTE_UPDATED_KEY,result.revision);
    cloudLastLocalFingerprint=await localCloudFingerprint();
    setCloudSyncIndicator("synced","✓ Synchronisiert");
    cloudSetStatus("Vollständiger App-Stand in kleinen Datenpaketen in der Cloud gespeichert.");
  }catch(error){
    cloudSetStatus(`Cloud-Speichern fehlgeschlagen: ${error.message}`,true);
  }finally{
    cloudSetBusy(false);
  }
});

document.getElementById("cloudDownloadBtn")?.addEventListener("click",async()=>{
  if(!confirm("Cloud-Stand laden? Die lokalen 3113ADVENTURE-Daten auf diesem Gerät werden dadurch ersetzt.")) return;

  try{
    cloudSetBusy(true);
    const result=await downloadCloudSnapshot();
    localStorage.setItem(CLOUD_DIRTY_KEY,"0");
    if(result.revision) localStorage.setItem(CLOUD_REMOTE_UPDATED_KEY,result.revision);
    setCloudSyncIndicator("synced","✓ Synchronisiert");
    cloudSetStatus("Cloud-Stand geladen. App wird neu gestartet.");
    setTimeout(()=>window.location.reload(),500);
  }catch(error){
    cloudSetStatus(`Cloud-Laden fehlgeschlagen: ${error.message}`,true);
  }finally{
    cloudSetBusy(false);
  }
});

document.getElementById("cloudAutoLoad")?.addEventListener("change",event=>{
  localStorage.setItem(CLOUD_AUTOLOAD_KEY,event.target.checked?"1":"0");
});

async function initializeCloud(){
  createCloudClient();
  installLocalChangeWatcher();

  if(cloudClient){
    try{
      const {data}=await cloudClient.auth.getSession();
      if(data?.session){
        // Supabase refreshes the access token automatically; the persisted
        // refresh token keeps the user signed in across app/browser restarts.
        await cloudClient.auth.getUser();
      }
    }catch(error){
      console.warn("Gespeicherte Anmeldung konnte nicht geprüft werden:",error);
    }
  }

  const autoSync=document.getElementById("cloudAutoSync");
  if(autoSync) autoSync.checked=autoSyncEnabled();

  await renderCloudState();

  const lastSync=localStorage.getItem("3113-cloud-last-sync");
  const last=document.getElementById("cloudLastSync");
  if(last&&lastSync){
    last.textContent=`Letzte lokale Cloud-Aktion: ${new Date(lastSync).toLocaleString("de-CH")}`;
  }

  if(cloudClient){
    cloudClient.auth.onAuthStateChange((event)=>{
      if(event==="PASSWORD_RECOVERY"){
        const panel=document.getElementById("cloudRecoveryPanel");
        if(panel) panel.hidden=false;
        cloudSetStatus("Passwort-Link erkannt. Bitte jetzt ein neues Passwort festlegen.");
      }
      setTimeout(async()=>{
        await renderCloudState();
        if(autoSyncEnabled()) runCloudAutoSync("auth");
      },0);
    });
  }

  if(autoSyncEnabled()){
    try{
      cloudLastLocalFingerprint=await localCloudFingerprint();
    }catch{}
    startCloudPolling();
    setCloudSyncIndicator(navigator.onLine?"pending":"offline",
      navigator.onLine?"Automatische Synchronisation aktiv":"Offline – Änderungen ausstehend");
    setTimeout(()=>runCloudAutoSync("startup"),1200);
  }else{
    setCloudSyncIndicator("idle","Automatische Synchronisation aus");
  }
}

async function initialize() {
  let language = "de";
  let theme = "system";

  try {
    await openDatabase();
    await seedDefaultTour();
    language = await getSetting("language", "de");
    theme = await getSetting("theme", "system");
  } catch (error) {
    console.error("Initialisierung der lokalen Datenbank fehlgeschlagen:", error);
    databaseStatus.textContent = `IndexedDB-Fehler: ${error.message}`;
  }

  languageSelect.value = language;
  themeSelect.value = theme;

  try {
    await loadLanguage(language);
  } catch (error) {
    console.warn("Sprachdatei konnte nicht geladen werden:", error);
  }

  applyTheme(theme);

  const startupSteps=[
    ["Touren",()=>renderTours()],
    ["GPX",()=>renderGpx()],
    ["Etappen",()=>renderStages()],
    ["Mein Transa",()=>renderGear()],
    ["Packlisten",()=>renderTourPack()],
    ["Schuhe",()=>renderTourShoes()],
    ["Orte",()=>renderPlaces()],
    ["Roadbook",()=>typeof renderRoadbook==="function"?renderRoadbook():Promise.resolve()],
    ["Seitenleiste",()=>typeof renderSidebarSummary==="function"?renderSidebarSummary():Promise.resolve()]
  ];

  const startupErrors=[];

  try{
    const activeTour=await getActiveTour();
    if(activeTour){
      const stageStart=document.getElementById("stageStartDate");
      if(stageStart) stageStart.value=activeTour.startDate||"";
    }
  }catch(error){
    startupErrors.push(`Aktive Tour: ${error.message}`);
  }

  for(const [name,step] of startupSteps){
    try{
      await step();
    }catch(error){
      console.error(`${name} konnte beim Start nicht geladen werden:`,error);
      startupErrors.push(`${name}: ${error.message}`);
    }
  }

  try{
    const mapPage=document.getElementById("map");
    if(mapPage?.classList.contains("active")){
      await renderMapTrack();
    }
  }catch(error){
    startupErrors.push(`Karte: ${error.message}`);
  }

  if(databaseStatus){
    databaseStatus.textContent=startupErrors.length
      ? `App geladen · ${startupErrors.length} Teilfehler (siehe Konsole).`
      : translate("database.ready", "IndexedDB ist bereit.");
  }

  try{
    await initializeCloud();
  }catch(error){
    console.warn("Cloud konnte nicht initialisiert werden:",error);
  }
}

document.getElementById("saveSettings")?.addEventListener("click", async () => {
  const language = languageSelect.value;
  const theme = themeSelect.value;

  await setSetting("language", language);
  await setSetting("theme", theme);
  await loadLanguage(language);
  applyTheme(theme);

  settingsStatus.textContent = translate("settings.saved", "Einstellungen gespeichert.");

  await renderTours();
  await renderGpx();

  const activeTour=await getActiveTour();
  if(activeTour){
    document.getElementById("stageStartDate").value=activeTour.startDate||"";
  }

  await renderStages();
  if (document.getElementById('map').classList.contains('active')) {
    await renderMapTrack();
  }
});

document.getElementById("refreshApp")?.addEventListener("click", async () => {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();

    for (const registration of registrations) {
      await registration.unregister();
    }
  }

  if ("caches" in window) {
    const cacheNames = await caches.keys();

    for (const name of cacheNames) {
      await caches.delete(name);
    }
  }

  window.location.href = "./?v=41098";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js?v=41098");
  });
}

initialize();
