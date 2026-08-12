// Offline support for טל"ת reports.
//
// When a driver submits while offline (or the server is unreachable) the full
// report — including its base64 images — is queued in IndexedDB on the device.
// When connectivity returns the queue is flushed to Cloudflare and the local
// copy is cleared. Each report keeps its original id, so re-sending is
// idempotent (same KV key just overwrites).

const DB_NAME = "talat-offline";
const DB_VERSION = 1;
const STORE = "pending";

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueReport(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPending() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removePending(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function countPending() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return 0;
  }
}

// POST a single report straight to the server. Throws on any failure — there is
// deliberately NO localStorage fallback here, so the caller can tell whether the
// report actually reached the server or must be queued for later.
export async function sendReportToServer(record) {
  const res = await fetch("/api/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "talat:" + record.id, value: JSON.stringify(record) }),
  });
  if (!res.ok) throw new Error("server rejected report (" + res.status + ")");
  return true;
}

// Try to flush the queue to the server. Returns the number successfully synced.
// Stops at the first failure (still offline) and leaves the rest for next time.
export async function syncPending() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  let pend = [];
  try {
    pend = await getPending();
  } catch (e) {
    return 0;
  }
  let synced = 0;
  for (const r of pend) {
    try {
      await sendReportToServer(r);
      await removePending(r.id);
      synced++;
    } catch (e) {
      break; // still offline / server down — retry later
    }
  }
  return synced;
}
