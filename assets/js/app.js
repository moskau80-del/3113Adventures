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
  deleteTrack
} from "./database.js?v=4096";

import { loadLanguage, translate } from "./i18n.js?v=4096";
import { parseGpx, createPreviewSvg } from "./gpx.js?v=4096";
import { splitTrack, calculateStage, addDays, saveStagesLocal, loadStagesLocal, deleteStagesLocal, updateStageLocal, deleteStageLocal, recalculateStageDates, insertRestDayLocal, deleteRestDayLocal, splitStageLocal, mergeStageWithNextLocal, distributeRestDays, getStageStorageInfo, saveShoeIntervalLocal, loadShoeIntervalLocal, getShoeChangeMarkers, getNextShoeChangeKm } from "./stages.js?v=4096";
import { loadGearLocal, saveGearLocal, upsertGearLocal, deleteGearLocal, loadPackNamesLocal, savePackNamesLocal, loadTourPersonPackLocal, toggleGearInPersonPackLocal, updatePersonPackItemLocal, packedQuantityAcrossPersons, availableQuantityForPerson, loadTourShoePersonLocal, saveTourShoePersonLocal } from "./gear.js?v=4096";
import { loadPlacesLocal, savePlacesLocal, addPlaceLocal, deletePlaceLocal, toggleFavoriteLocal, setPreferredStartLocal, setPreferredEndLocal, clearPreferredStartLocal, clearPreferredEndLocal, getPreferredStartForStage, getPreferredEndForStage, getPlacesForStage, distanceToStageKm, buildOverpassQuery, boundsForStage, normalizeOverpassElement, stageSearchWindows, dedupePlaces } from "./places.js?v=4096";

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
let userMarker = null;
const stageDialog = document.getElementById("stageDialog");
const stageForm = document.getElementById("stageForm");
const splitStageDialog = document.getElementById("splitStageDialog");
const splitStageForm = document.getElementById("splitStageForm");
let currentMapStageId = null;
let currentSupplyStageId=null;
let currentSupplyCategory="camping";
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
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

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap-Mitwirkende"
  }).addTo(map);

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

  map.fitBounds(line.getBounds(), {
    padding: [20, 20]
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
  const file = event.target.files?.[0];
  if (!file) return;

  const activeTour = await getActiveTour();

  if (!activeTour) {
    alert(translate("dashboard.noTour", "Noch keine Tour ausgewählt."));
    return;
  }

  try {
    const parsed = parseGpx(await file.text(), file.name);

    await saveTrack({
      ...parsed,
      tourId: activeTour.id
    });

    await renderGpx();
    await renderMapTrack();
  } catch (error) {
    alert(error.message);
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
    await renderGpx();
    if (trackLayer) trackLayer.clearLayers();
  }
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

async function renderStages(){
  const activeTour=await getActiveTour();
  const list=document.getElementById("stageList");
  const status=document.getElementById("stageStatus");
  const diagnostic=document.getElementById("stageDiagnostic");

  if(!activeTour){
    list.innerHTML='<div class="empty">Keine aktive Tour.</div>';
    return;
  }

  const stages=loadStagesLocal(activeTour.id);
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

  status.textContent=stages.length
    ? `${stages.length} Etappen aus dem Browserspeicher geladen.`
    : "Noch keine Etappen vorhanden.";

  const info=getStageStorageInfo(activeTour.id);
  diagnostic.textContent=
    `Speicher: ${info.count} Etappen · ${info.characters} Zeichen · ${info.origin}`;

  renderStageTimeline(stages,shoeMarkers);

  list.innerHTML=stages.length
    ? stages.map(stage=>`
      <article id="stage-card-${stage.id}" class="stage-card ${stage.completed?"completed":""} ${stage.restDay?"rest-day":""}">
        <h3>${escapeHtml(stage.name)}</h3>
        <div class="stage-route">${escapeHtml(stage.from)} → ${escapeHtml(stage.to)}</div>
        <div class="stage-meta">
          <span class="pill">${formatDate(stage.date)}</span>
          <span class="pill">${Number(stage.distanceKm||0).toFixed(1)} km</span>
          <span class="pill">↑ ${Math.round(stage.ascentM||0)} m</span>
          <span class="pill">↓ ${Math.round(stage.descentM||0)} m</span>
          <span class="pill">${formatHours(stage.walkingHours||0)}</span>
          ${stage.completed?'<span class="pill">Abgeschlossen</span>':""}
        </div>
        ${stage.startCoord&&stage.endCoord?`
        <div class="stage-coordinates">
          ${Number(stage.startCoord.lat||0).toFixed(5)}, ${Number(stage.startCoord.lng||0).toFixed(5)}
          →
          ${Number(stage.endCoord.lat||0).toFixed(5)}, ${Number(stage.endCoord.lng||0).toFixed(5)}
        </div>`:""}
        ${stage.notes?`<p>${escapeHtml(stage.notes)}</p>`:""}
        ${stage.restDay?"":`${stageShoePersonWarningHtml(stage,shoePlan,packNames)}${stageShoeChangeHtml(stage,shoeMarkers)}${stagePlanningStatusHtml(activeTour.id,stage)}${stagePreferredHtml(activeTour.id,stage.id)}<div class="stage-supply">${stageSupplyHtml(activeTour.id,stage.id)}</div>`}
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

  await renderDashboardStats();
  renderGear();
  await renderTourPack();
  await renderTourShoes();
  await renderPlaces();
  if(typeof renderRoadbook==='function') await renderRoadbook();
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

function redrawTrackEditor(){
  if(!trackEditorMap) return;
  if(trackEditorLayer) trackEditorLayer.remove();
  trackEditorLayer=L.layerGroup().addTo(trackEditorMap);

  const coords=trackEditorWorkingPoints.map(p=>[p.lat,p.lng]);
  const line=L.polyline(coords,{weight:5}).addTo(trackEditorLayer);
  const indices=trackEditorControlIndices(trackEditorWorkingPoints.length);

  indices.forEach((pointIndex,controlIndex)=>{
    const point=trackEditorWorkingPoints[pointIndex];
    const marker=L.marker([point.lat,point.lng],{draggable:true}).addTo(trackEditorLayer);
    marker.bindTooltip(
      pointIndex===0?"Start":pointIndex===trackEditorWorkingPoints.length-1?"Ziel":`Punkt ${controlIndex}`,
      {permanent:false}
    );
    marker.on("dragstart",()=>{
      trackEditorHistory.push(cloneTrackPoints(trackEditorWorkingPoints));
      if(trackEditorHistory.length>30) trackEditorHistory.shift();
    });
    marker.on("contextmenu",()=>{
      if(pointIndex===0||pointIndex===trackEditorWorkingPoints.length-1) return;
      trackEditorHistory.push(cloneTrackPoints(trackEditorWorkingPoints));
      trackEditorWorkingPoints.splice(pointIndex,1);
      redrawTrackEditor();
    });
    marker.on("drag",event=>{
      const ll=event.target.getLatLng();
      trackEditorWorkingPoints[pointIndex]={...trackEditorWorkingPoints[pointIndex],lat:ll.lat,lng:ll.lng};
      const polylines=trackEditorLayer.getLayers().filter(layer=>layer instanceof L.Polyline);
      if(polylines[0]) polylines[0].setLatLngs(trackEditorWorkingPoints.map(p=>[p.lat,p.lng]));
      const info=document.getElementById("trackEditorInfo");
      if(info) info.textContent=`Vorschau: ${trackDistanceKm(trackEditorWorkingPoints).toFixed(1)} km · noch nicht gespeichert`;
    });
  });

  const info=document.getElementById("trackEditorInfo");
  if(info) info.textContent=`Vorschau: ${trackDistanceKm(trackEditorWorkingPoints).toFixed(1)} km · noch nicht gespeichert`;
  if(line.getBounds().isValid()) trackEditorMap.fitBounds(line.getBounds(),{padding:[20,20]});
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

  const routingStatus=document.getElementById("trackRoutingStatus");
  if(routingStatus) routingStatus.textContent="";
  const dialog=document.getElementById("trackEditorDialog");
  dialog.showModal();

  setTimeout(()=>{
    if(!trackEditorMap){
      trackEditorMap=L.map("trackEditorMap",{zoomControl:true});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:19,attribution:"&copy; OpenStreetMap-Mitwirkende"
      }).addTo(trackEditorMap);
    }
    trackEditorMap.invalidateSize();
    if(!trackEditorMap._3113EditorClickBound){
      trackEditorMap.on("click",event=>{
        if(!trackEditorStageId||trackEditorWorkingPoints.length<2) return;
        let bestIndex=1,best=Infinity;
        for(let i=1;i<trackEditorWorkingPoints.length;i++){
          const a=trackEditorWorkingPoints[i-1],b=trackEditorWorkingPoints[i];
          const midLat=(a.lat+b.lat)/2,midLng=(a.lng+b.lng)/2;
          const d=(event.latlng.lat-midLat)**2+(event.latlng.lng-midLng)**2;
          if(d<best){best=d;bestIndex=i}
        }
        trackEditorHistory.push(cloneTrackPoints(trackEditorWorkingPoints));
        trackEditorWorkingPoints.splice(bestIndex,0,{lat:event.latlng.lat,lng:event.latlng.lng});
        redrawTrackEditor();
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

document.getElementById("trackEditorRouteBtn")?.addEventListener("click",async()=>{
  if(!trackEditorWorkingPoints.length) return;

  const mode=document.getElementById("trackRoutingMode")?.value||"direct";
  const status=document.getElementById("trackRoutingStatus");

  if(mode==="direct"){
    status.textContent="Direkte Verbindung aktiv. Keine Neuberechnung notwendig.";
    return;
  }

  const indices=trackEditorWaypointIndices();
  const waypoints=indices.map(index=>trackEditorWorkingPoints[index]);

  if(waypoints.length<2){
    status.textContent="Zu wenige Punkte zum Routen.";
    return;
  }

  status.textContent="Route wird über Fuss-/Wanderwege berechnet …";

  try{
    const routed=await routeBetweenWaypoints(waypoints);

    if(routed.length<2){
      throw new Error("Keine verwertbare Route erhalten.");
    }

    trackEditorHistory.push(cloneTrackPoints(trackEditorWorkingPoints));
    trackEditorWorkingPoints=routed;
    redrawTrackEditor();

    status.textContent=`Routing erfolgreich · ${trackDistanceKm(routed).toFixed(1)} km`;
  }catch(error){
    console.error("Routing fehlgeschlagen:",error);
    status.textContent=`Routing fehlgeschlagen: ${error.message}. Direkte Bearbeitung bleibt erhalten.`;
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

  updateStageLocal(activeTour.id,{
    ...stage,
    startCoord:{lat:trackEditorWorkingPoints[0].lat,lng:trackEditorWorkingPoints[0].lng},
    endCoord:{lat:trackEditorWorkingPoints.at(-1).lat,lng:trackEditorWorkingPoints.at(-1).lng},
    distanceKm:trackDistanceKm(trackEditorWorkingPoints),
    notes:[stage.notes,"Track manuell bearbeitet"].filter(Boolean).join(" · ")
  });

  document.getElementById("trackEditorDialog").close();
  trackEditorStageId=null;
  await renderGpx();
  await renderStages();
  if(document.getElementById("map").classList.contains("active")) await renderMapTrack();
});

document.getElementById("trackEditorDialog")?.addEventListener("close",()=>{
  trackEditorStageId=null;
  trackEditorHistory=[];
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
      currentSupplyCategory="camping";
      currentSupplyResults=[];
      document.querySelectorAll("[data-supply-category]").forEach(button=>{
        button.classList.toggle("active",button.dataset.supplyCategory==="camping");
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
    if(stage){
      currentSupplyStageId=stage.id;
      const activeTour=await getActiveTour();
      if(activeTour){
        // switch to places page and preselect footwear search
        document.querySelectorAll(".main-nav button").forEach(btn=>btn.classList.remove("active"));
        document.querySelectorAll(".page").forEach(page=>page.classList.remove("active"));
        document.querySelector('[data-page="places"]')?.classList.add("active");
        document.getElementById("places")?.classList.add("active");

        const categorySelect=document.getElementById("supplyCategory");
        if(categorySelect) categorySelect.value="footwear";

        const stageSelect=document.getElementById("supplyStageSelect");
        if(stageSelect) stageSelect.value=stage.id;

        await renderPlaces();

        const personName=shoePersonKey==="person2"
          ?loadPackNamesLocal(activeTour.id).person2
          :loadPackNamesLocal(activeTour.id).person1;

        const info=document.getElementById("placesStatus")||document.getElementById("supplyStatus");
        if(info){
          info.textContent=`Schuhwechsel ${personName}: Versorgung rund um Etappe ${stage.order||stage.number||""} vorbereiten.`;
        }
      }
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

  updateStageLocal(activeTour.id,{
    ...stage,
    name:document.getElementById("editStageName").value.trim(),
    date:document.getElementById("editStageDate").value,
    from:document.getElementById("editStageFrom").value.trim(),
    to:document.getElementById("editStageTo").value.trim(),
    notes:document.getElementById("editStageNotes").value.trim(),
    completed:document.getElementById("editStageCompleted").checked
  });

  stageDialog.close();
  await renderStages();
});



document.getElementById("stageTimeline")?.addEventListener("click",(event)=>{
  const item=event.target.closest("[data-timeline-stage]");
  if(!item) return;

  jumpToStage(item.dataset.timelineStage);
});


function stageTrackSegment(trackPoints,stage){
  if(!trackPoints?.length) return [];

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
  if(!activeTour||!currentSupplyStageId) return;

  const stages=loadStagesLocal(activeTour.id);
  const stage=stages.find(item=>item.id===currentSupplyStageId);
  const track=await getTrack(activeTour.id);

  if(!stage||!track?.points?.length) return;

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

async function renderPlaces(){
  const activeTour=await getActiveTour();
  const list=document.getElementById("placeList");

  if(!activeTour){
    list.innerHTML='<div class="empty">Keine aktive Tour.</div>';
    return;
  }

  const places=loadPlacesLocal(activeTour.id);
  document.getElementById("placeCount").textContent=String(places.length);
  document.getElementById("campingCount").textContent=String(places.filter(p=>p.category==="camping").length);
  document.getElementById("waterCount").textContent=String(places.filter(p=>p.category==="water").length);
  document.getElementById("shopCount").textContent=String(places.filter(p=>p.category==="shop").length);
  document.getElementById("favoriteCount").textContent=String(places.filter(p=>p.favorite).length);

  const visiblePlaces=placeFilter==="favorites"?places.filter(place=>place.favorite):places;

  list.innerHTML=visiblePlaces.length
    ?visiblePlaces.map(place=>`
      <article class="place-card ${place.favorite?"favorite":""} ${place.preferredStart?'<span class="preferred-badge">Bevorzugter Start</span>':""}${place.preferredEnd?'<span class="preferred-badge">Bevorzugtes Ziel</span>':""}<div class="card-actions">
        <p class="stage-coordinates">${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}</p>
        ${place.preferred?'<span class="preferred-badge">Bevorzugter Stopp</span>':""}
        <div class="card-actions">
          <button data-preferred-start="${place.id}">${place.preferredStart?"Start ✓":"Als Start"}</button><button data-preferred-end="${place.id}">${place.preferredEnd?"Ziel ✓":"Als Ziel"}</button>
          ${place.preferredStart?`<button data-clear-preferred-start="${place.stageId}">Start entfernen</button>`:""}${place.preferredEnd?`<button data-clear-preferred-end="${place.stageId}">Ziel entfernen</button>`:""}
          <button data-favorite-place="${place.id}" class="favorite-star">${place.favorite?"★ Favorit":"☆ Favorit"}</button>
          <button data-show-place="${place.id}">Auf Karte</button>
          <button class="danger" data-delete-place="${place.id}">Löschen</button>
        </div>
      </article>
    `).join("")
    :'<div class="empty">Keine passenden Orte vorhanden.</div>';
}


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
          <strong>${escapeHtml(category)}</strong>
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
  await renderTourPack();
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
  document.getElementById("gearNotes").value=item?.notes||"";
  document.getElementById("gearFavorite").checked=Boolean(item?.favorite);
  gearDialog.showModal();
}

function renderGear(){
  const items=loadGearLocal();
  const query=(document.getElementById("gearSearch")?.value||"").trim().toLowerCase();
  const category=document.getElementById("gearCategoryFilter")?.value||"all";
  const sort=document.getElementById("gearSort")?.value||"name";

  let filtered=items.filter(item=>{
    const matchesCategory=category==="all"||item.category===category;
    const text=[item.name,item.brand,item.category,item.location,item.notes].filter(Boolean).join(" ").toLowerCase();
    return matchesCategory&&(!query||text.includes(query));
  });

  filtered=[...filtered].sort((a,b)=>{
    if(sort==="weightAsc") return Number(a.weightG||0)-Number(b.weightG||0);
    if(sort==="weightDesc") return Number(b.weightG||0)-Number(a.weightG||0);
    if(sort==="category") return String(a.category||"").localeCompare(String(b.category||""))||String(a.name||"").localeCompare(String(b.name||""));
    return String(a.name||"").localeCompare(String(b.name||""));
  });

  document.getElementById("gearCount").textContent=String(items.length);
  document.getElementById("gearWeightTotal").textContent=
    formatKg3FromGrams(
      items.reduce((sum,item)=>sum+Number(item.weightG||0)*Number(item.stock??item.quantity??1),0)
    );
  document.getElementById("gearShoeCount").textContent=
    String(items.filter(item=>item.category==="shoes").length);
  document.getElementById("gearFavoriteCount").textContent=
    String(items.filter(item=>item.favorite).length);

  const list=document.getElementById("gearList");
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
        <td>${Number(item.stock??item.quantity??1)}</td>
        <td>${escapeHtml(item.location||"–")}</td>
        <td>
          <div class="gear-actions">
            <button data-add-gear-person1="${item.id}">→ Person 1</button>
            <button data-add-gear-person2="${item.id}">→ Person 2</button>
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
    notes:document.getElementById("gearNotes").value.trim(),
    favorite:document.getElementById("gearFavorite").checked,
    updatedAt:new Date().toISOString()
  });

  gearDialog.close();
  renderGear();
  renderTourPack();
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
          `Wie viele Stück von „${gearItem.name}“ sollen ${personKey==="person1"?"Person 1":"Person 2"} zugewiesen werden?\nNoch verfügbar: ${available}`,
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
  renderGear();
  await renderTourPack();
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
          <p><strong>Start:</strong> ${escapeHtml(stage.from||"–")}</p>
          <p><strong>Ziel:</strong> ${escapeHtml(stage.to||"–")}</p>
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

  try {
    await renderTours();
    await renderGpx();

    const activeTour = await getActiveTour();
    if (activeTour) {
      document.getElementById("stageStartDate").value = activeTour.startDate || "";
    }

    await renderStages();

    if (document.getElementById("map").classList.contains("active")) {
      await renderMapTrack();
    }

    databaseStatus.textContent = translate("database.ready", "IndexedDB ist bereit.");
  } catch (error) {
    console.error("App-Daten konnten nicht geladen werden:", error);
    databaseStatus.textContent = `Ladefehler: ${error.message}`;
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

  window.location.href = "./?v=4096";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js?v=4096");
  });
}

initialize();
