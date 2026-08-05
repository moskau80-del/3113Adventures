const DB_NAME = "3113AdventuresDB";
const DB_VERSION = 6;
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

export async function getStagesForTour(tourId) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STAGES_STORE, "readonly");
    const index = transaction.objectStore(STAGES_STORE).index("tourId");
    const request = index.getAll(IDBKeyRange.only(tourId));

    request.onsuccess = () => {
      const stages = request.result || [];
      stages.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      resolve(stages);
    };

    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveStage(stage) {
  await runRequest(
    STAGES_STORE,
    "readwrite",
    (store) => store.put(stage)
  );
}

export async function saveStages(stages) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STAGES_STORE, "readwrite");
    const store = transaction.objectStore(STAGES_STORE);

    for (const stage of stages) {
      store.put(stage);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function deleteStage(id) {
  await runRequest(
    STAGES_STORE,
    "readwrite",
    (store) => store.delete(id)
  );
}

export async function deleteStagesForTour(tourId) {
  const stages = await getStagesForTour(tourId);
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STAGES_STORE, "readwrite");
    const store = transaction.objectStore(STAGES_STORE);

    for (const stage of stages) {
      store.delete(stage.id);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
