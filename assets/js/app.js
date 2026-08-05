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
} from "./database.js?v=4030";

import { loadLanguage, translate } from "./i18n.js?v=4030";
import { parseGpx, createPreviewSvg } from "./gpx.js?v=4030";

const navButtons = document.querySelectorAll(".main-nav button");
const pages = document.querySelectorAll(".page");
const languageSelect = document.getElementById("languageSelect");
const themeSelect = document.getElementById("themeSelect");
const settingsStatus = document.getElementById("settingsStatus");
const databaseStatus = document.getElementById("databaseStatus");
const tourDialog = document.getElementById("tourDialog");
const tourForm = document.getElementById("tourForm");

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    navButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    pages.forEach((page) => {
      page.classList.toggle("active", page.id === button.dataset.page);
    });
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
});

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
    preview.innerHTML = `<p class="muted">${translate(
      "gpx.previewEmpty",
      "Nach dem Import erscheint hier eine einfache Trackvorschau."
    )}</p>`;
    return;
  }

  status.textContent = `${track.name} · ${translate("gpx.imported", "GPX-Track importiert.")}`;
  pointCount.textContent = String(track.points.length);
  distance.textContent = `${Number(track.distanceKm).toFixed(1)} km`;
  start.textContent = `${track.points[0].lat.toFixed(5)}, ${track.points[0].lng.toFixed(5)}`;
  end.textContent = `${track.points.at(-1).lat.toFixed(5)}, ${track.points.at(-1).lng.toFixed(5)}`;
  preview.innerHTML = createPreviewSvg(track.points);
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
  }
});

async function initialize() {
  try {
    await openDatabase();
    await seedDefaultTour();
  } catch (error) {
    databaseStatus.textContent = `IndexedDB-Fehler: ${error.message}`;
  }

  const language = await getSetting("language", "de");
  const theme = await getSetting("theme", "system");

  languageSelect.value = language;
  themeSelect.value = theme;

  await loadLanguage(language);
  applyTheme(theme);

  databaseStatus.textContent = translate("database.ready", "IndexedDB ist bereit.");

  await renderTours();
  await renderGpx();
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

  window.location.href = "./?v=4030";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js?v=4030");
  });
}

initialize();
