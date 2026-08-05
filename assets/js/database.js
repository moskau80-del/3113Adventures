const DB_NAME = "3113AdventuresDB";
const DB_VERSION = 9;
const SETTINGS_STORE = "settings";
const TOURS_STORE = "tours";
const TRACKS_STORE = "tracks";
const STAGES_STORE = "stages";

const STAGE_BACKUP_PREFIX = "3113-stages-backup:";

function stageBackupKey(tourId) {
  return `${STAGE_BACKUP_PREFIX}${tourId}`;
}

function readStageBackup(tourId) {
  try {
    const raw = localStorage.getItem(stageBackupKey(tourId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Etappen-Backup konnte nicht gelesen werden:", error);
    return [];
  }
}

function writeStageBackup(tourId, stages) {
  try {
    localStorage.setItem(stageBackupKey(tourId), JSON.stringify(stages));
    return true;
  } catch (error) {
    console.warn("Etappen-Backup konnte nicht geschrieben werden:", error);
    return false;
  }
}

function deleteStageBackup(tourId) {
  try {
    localStorage.removeItem(stageBackupKey(tourId));
  } catch (error) {
    console.warn("Etappen-Backup konnte nicht gelöscht werden:", error);
  }
}


export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(TOURS_STORE)) {
        const store = db.createObjectStore(TOURS_STORE, { keyPath: "id" });
        store.createIndex("active", "active", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }

      if (!db.objectStoreNames.contains(TRACKS_STORE)) {
        const store = db.createObjectStore(TRACKS_STORE, { keyPath: "tourId" });
        store.createIndex("name", "name", { unique: false });
      }

      if (!db.objectStoreNames.contains(STAGES_STORE)) {
        const store = db.createObjectStore(STAGES_STORE, { keyPath: "id" });
        store.createIndex("tourId", "tourId", { unique: false });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("order", "order", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runRequest(storeName, mode, operation) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function getSetting(key, fallback = null) {
  const result = await runRequest(
    SETTINGS_STORE,
    "readonly",
    (store) => store.get(key)
  );
  return result?.value ?? fallback;
}

export async function setSetting(key, value) {
  await runRequest(
    SETTINGS_STORE,
    "readwrite",
    (store) => store.put({ key, value })
  );
}

export async function getAllTours() {
  return (await runRequest(
    TOURS_STORE,
    "readonly",
    (store) => store.getAll()
  )) || [];
}

export async function saveTour(tour) {
  if (tour.active) {
    const tours = await getAllTours();
    for (const item of tours) {
      if (item.id !== tour.id && item.active) {
        await runRequest(
          TOURS_STORE,
          "readwrite",
          (store) => store.put({ ...item, active: false })
        );
      }
    }
  }

  await runRequest(
    TOURS_STORE,
    "readwrite",
    (store) => store.put(tour)
  );
}

export async function deleteTour(id) {
  await runRequest(
    TOURS_STORE,
    "readwrite",
    (store) => store.delete(id)
  );
}

export async function getActiveTour() {
  const tours = await getAllTours();
  return tours.find((tour) => tour.active) || null;
}

export async function seedDefaultTour() {
  const tours = await getAllTours();
  const existing = tours.find(
    (tour) => tour.id === "nst-2027" || tour.name === "Nord-Süd-Trail 2027"
  );

  const defaults = {
    id: "nst-2027",
    name: "Nord-Süd-Trail 2027",
    description: "Offizieller Nord-Süd-Trail von Sylt bis zum Haldenwanger Eck.",
    startDate: "2027-03-27",
    targetDate: "2027-08-13",
    distanceKm: 3700,
    active: true
  };

  const now = new Date().toISOString();

  if (!existing) {
    await saveTour({
      ...defaults,
      createdAt: now,
      updatedAt: now
    });
    return;
  }

  await saveTour({
    ...existing,
    description: existing.description || defaults.description,
    startDate: existing.startDate || defaults.startDate,
    targetDate: existing.targetDate || defaults.targetDate,
    distanceKm: Number(existing.distanceKm) || defaults.distanceKm,
    active: existing.active !== false,
    createdAt: existing.createdAt || now,
    updatedAt: now
  });
}

export async function saveTrack(track) {
  await runRequest(
    TRACKS_STORE,
    "readwrite",
    (store) => store.put(track)
  );
}

export async function getTrack(tourId) {
  return await runRequest(
    TRACKS_STORE,
    "readonly",
    (store) => store.get(tourId)
  ) || null;
}

export async function deleteTrack(tourId) {
  await runRequest(
    TRACKS_STORE,
    "readwrite",
    (store) => store.delete(tourId)
  );
}


const STAGES_LOCAL_KEY = "3113-adventures-v4-stages";

function readAllLocalStages() {
  try {
    const raw = localStorage.getItem(STAGES_LOCAL_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    console.error("Etappenspeicher konnte nicht gelesen werden:", error);
    return {};
  }
}

function writeAllLocalStages(data) {
  const serialized = JSON.stringify(data);
  localStorage.setItem(STAGES_LOCAL_KEY, serialized);

  const verification = localStorage.getItem(STAGES_LOCAL_KEY);
  if (verification !== serialized) {
    throw new Error("Der Browserspeicher konnte nicht verifiziert werden.");
  }

  return serialized.length;
}

export async function getStagesForTour(tourId) {
  const allStages = readAllLocalStages();
  const stages = Array.isArray(allStages[tourId]) ? allStages[tourId] : [];

  return [...stages].sort(
    (a, b) => Number(a.order || 0) - Number(b.order || 0)
  );
}

export async function saveStages(stages) {
  if (!Array.isArray(stages)) {
    throw new Error("Ungültige Etappendaten.");
  }

  if (!stages.length) {
    return { count: 0, bytes: 0, storage: "localStorage" };
  }

  const tourId = stages[0].tourId;
  if (!tourId) {
    throw new Error("Die Tour-ID der Etappen fehlt.");
  }

  const compactStages = stages.map((stage) => {
    const { trackPoints, ...compact } = stage;
    return compact;
  });

  const allStages = readAllLocalStages();
  allStages[tourId] = compactStages;

  const bytes = writeAllLocalStages(allStages);
  const verified = await getStagesForTour(tourId);

  if (verified.length !== compactStages.length) {
    throw new Error(
      `Speicherprüfung fehlgeschlagen: ${verified.length} von ${compactStages.length} Etappen.`
    );
  }

  return {
    count: verified.length,
    bytes,
    storage: "localStorage"
  };
}

export async function saveStage(stage) {
  const stages = await getStagesForTour(stage.tourId);
  const index = stages.findIndex((item) => item.id === stage.id);

  if (index >= 0) stages[index] = stage;
  else stages.push(stage);

  stages.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  return saveStages(stages);
}

export async function deleteStage(id, tourId) {
  const stages = await getStagesForTour(tourId);
  return saveStages(stages.filter((stage) => stage.id !== id));
}

export async function deleteStagesForTour(tourId) {
  const allStages = readAllLocalStages();
  delete allStages[tourId];
  writeAllLocalStages(allStages);
}

export async function compactStagesForTour(tourId) {
  const stages = await getStagesForTour(tourId);
  if (!stages.length) return stages;
  await saveStages(stages);
  return stages;
}

export function getStageStorageDiagnostic(tourId) {
  const raw = localStorage.getItem(STAGES_LOCAL_KEY) || "";
  const allStages = readAllLocalStages();
  const stages = Array.isArray(allStages[tourId]) ? allStages[tourId] : [];

  return {
    key: STAGES_LOCAL_KEY,
    count: stages.length,
    characters: raw.length,
    origin: window.location.origin
  };
}
