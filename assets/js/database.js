const DB_NAME = "3113AdventuresDB";
const DB_VERSION = 5;
const SETTINGS_STORE = "settings";
const TOURS_STORE = "tours";
const TRACKS_STORE = "tracks";
const STAGES_STORE = "stages";

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(TOURS_STORE)) {
        const tours = db.createObjectStore(TOURS_STORE, { keyPath: "id" });
        tours.createIndex("active", "active", { unique: false });
        tours.createIndex("name", "name", { unique: false });
      }

      if (!db.objectStoreNames.contains(TRACKS_STORE)) {
        const tracks = db.createObjectStore(TRACKS_STORE, { keyPath: "tourId" });
        tracks.createIndex("name", "name", { unique: false });
      }

      if (!db.objectStoreNames.contains(STAGES_STORE)) {
        const stages = db.createObjectStore(STAGES_STORE, { keyPath: "id" });
        stages.createIndex("tourId", "tourId", { unique: false });
        stages.createIndex("date", "date", { unique: false });
        stages.createIndex("order", "order", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(storeName, mode, callback) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);

    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

export async function getSetting(key, fallback = null) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SETTINGS_STORE, "readonly");
    const request = transaction.objectStore(SETTINGS_STORE).get(key);

    request.onsuccess = () => resolve(request.result?.value ?? fallback);
    request.onerror = () => reject(request.error);
  });
}

export async function setSetting(key, value) {
  return withStore(SETTINGS_STORE, "readwrite", (store) => store.put({ key, value }));
}

export async function getAllTours() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TOURS_STORE, "readonly");
    const request = transaction.objectStore(TOURS_STORE).getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveTour(tour) {
  if (tour.active) {
    const tours = await getAllTours();

    for (const item of tours.filter((entry) => entry.id !== tour.id && entry.active)) {
      await withStore(TOURS_STORE, "readwrite", (store) => store.put({
        ...item,
        active: false
      }));
    }
  }

  return withStore(TOURS_STORE, "readwrite", (store) => store.put(tour));
}

export async function deleteTour(id) {
  return withStore(TOURS_STORE, "readwrite", (store) => store.delete(id));
}

export async function getActiveTour() {
  const tours = await getAllTours();
  return tours.find((tour) => tour.active) || null;
}

export async function seedDefaultTour() {
  const tours = await getAllTours();
  const existing = tours.find((tour) =>
    tour.id === "nst-2027" || tour.name === "Nord-Süd-Trail 2027"
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
  return withStore(TRACKS_STORE, "readwrite", (store) => store.put(track));
}

export async function getTrack(tourId) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRACKS_STORE, "readonly");
    const request = transaction.objectStore(TRACKS_STORE).get(tourId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteTrack(tourId) {
  return withStore(TRACKS_STORE, "readwrite", (store) => store.delete(tourId));
}


export async function getStagesForTour(tourId) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STAGES_STORE, "readonly");
    const index = transaction.objectStore(STAGES_STORE).index("tourId");
    const request = index.getAll(tourId);

    request.onsuccess = () => {
      const stages = request.result || [];
      stages.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      resolve(stages);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function saveStage(stage) {
  return withStore(STAGES_STORE, "readwrite", (store) => store.put(stage));
}

export async function saveStages(stages) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STAGES_STORE, "readwrite");
    const store = transaction.objectStore(STAGES_STORE);

    stages.forEach((stage) => store.put(stage));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteStage(id) {
  return withStore(STAGES_STORE, "readwrite", (store) => store.delete(id));
}

export async function deleteStagesForTour(tourId) {
  const stages = await getStagesForTour(tourId);
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STAGES_STORE, "readwrite");
    const store = transaction.objectStore(STAGES_STORE);

    stages.forEach((stage) => store.delete(stage.id));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
