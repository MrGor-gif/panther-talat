// Storage shim: talks to the Cloudflare Worker KV-backed API so reports are
// genuinely shared across every device. Falls back to localStorage if the
// API is unreachable (e.g. local dev without wrangler), so the form still
// works while developing.
//
//   GET    /api/storage?key=...          -> { key, value, shared }
//   POST   /api/storage  { key, value }  -> { key, value, shared }
//   DELETE /api/storage?key=...          -> { key, deleted, shared }
//   GET    /api/storage-list?prefix=...  -> { keys, prefix, shared }
//   GET    /api/storage-getall?prefix=.. -> { items, prefix, shared }

const LOCAL_PREFIX = "panther-talat:";

function localReadAll() {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + "data");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function localWriteAll(obj) {
  localStorage.setItem(LOCAL_PREFIX + "data", JSON.stringify(obj));
}

async function apiGet(key) {
  const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("storage GET failed");
  return res.json();
}
async function apiSet(key, value) {
  const res = await fetch("/api/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error("storage POST failed");
  return res.json();
}
async function apiDelete(key) {
  const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("storage DELETE failed");
  return res.json();
}
async function apiList(prefix) {
  const res = await fetch(`/api/storage-list?prefix=${encodeURIComponent(prefix || "")}`);
  if (!res.ok) throw new Error("storage LIST failed");
  return res.json();
}
async function apiGetAll(prefix) {
  const res = await fetch(`/api/storage-getall?prefix=${encodeURIComponent(prefix || "")}`);
  if (!res.ok) throw new Error("storage GETALL failed");
  return res.json();
}

const storage = {
  async get(key, shared = false) {
    if (!shared) {
      const all = localReadAll();
      return key in all ? { key, value: all[key], shared: false } : null;
    }
    try {
      return await apiGet(key);
    } catch (e) {
      const all = localReadAll();
      return key in all ? { key, value: all[key], shared: false } : null;
    }
  },
  async set(key, value, shared = false) {
    if (!shared) {
      const all = localReadAll();
      all[key] = value;
      localWriteAll(all);
      return { key, value, shared: false };
    }
    try {
      return await apiSet(key, value);
    } catch (e) {
      const all = localReadAll();
      all[key] = value;
      localWriteAll(all);
      return { key, value, shared: false };
    }
  },
  async delete(key, shared = false) {
    if (!shared) {
      const all = localReadAll();
      const existed = key in all;
      delete all[key];
      localWriteAll(all);
      return { key, deleted: existed, shared: false };
    }
    return await apiDelete(key);
  },
  async list(prefix = "", shared = false) {
    if (!shared) {
      const all = localReadAll();
      return { keys: Object.keys(all).filter((k) => k.startsWith(prefix)), prefix, shared: false };
    }
    try {
      return await apiList(prefix);
    } catch (e) {
      return { keys: [], prefix, shared: true };
    }
  },
  async getAll(prefix = "", shared = false) {
    if (!shared) {
      const all = localReadAll();
      const items = Object.keys(all)
        .filter((k) => k.startsWith(prefix))
        .map((k) => ({ key: k, value: all[k] }));
      return { items, prefix, shared: false };
    }
    try {
      return await apiGetAll(prefix);
    } catch (e) {
      const all = localReadAll();
      const items = Object.keys(all)
        .filter((k) => k.startsWith(prefix))
        .map((k) => ({ key: k, value: all[k] }));
      return { items, prefix, shared: false };
    }
  },
};

if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;
