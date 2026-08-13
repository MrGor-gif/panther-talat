// Client-side Web Push helpers (admin notification settings).
// The VAPID public key is public by design, so it can live here.

const VAPID_PUBLIC = "BPv9qdmBSm9cas8vW5Hsk4nZL7GjlIJne42mXzUY9ClS-m3TJFHE0nzbj8ba0kNKFRx9ps1aFj6XDYU11IL0yno";
const FILTERS_LS_KEY = "talat-push-filters";

export function pushSupported() {
  return typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window;
}

// iOS only allows Web Push from an installed (home-screen) PWA.
export function isStandalone() {
  return (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    (typeof navigator !== "undefined" && navigator.standalone === true);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export async function getPushState() {
  if (!pushSupported()) return { supported: false, permission: "default", subscribed: false, standalone: isStandalone() };
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.ready;
    subscribed = !!(await reg.pushManager.getSubscription());
  } catch (e) {}
  return { supported: true, permission: Notification.permission, subscribed, standalone: isStandalone() };
}

async function saveToServer(subscription, filters) {
  const res = await fetch("/api/push-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON ? subscription.toJSON() : subscription, filters }),
  });
  if (!res.ok) throw new Error("subscribe failed");
  try { localStorage.setItem(FILTERS_LS_KEY, JSON.stringify(filters)); } catch (e) {}
  return res.json();
}

// Ask permission (if needed), subscribe, and store with the chosen filters.
export async function enablePush(filters) {
  if (!pushSupported()) throw new Error("not-supported");
  if (Notification.permission !== "granted") {
    const p = await Notification.requestPermission();
    if (p !== "granted") throw new Error("permission-denied");
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  await saveToServer(sub, filters);
  return true;
}

// Update just the filters for an existing subscription.
export async function saveFilters(filters) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) throw new Error("not-subscribed");
  await saveToServer(sub, filters);
  return true;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch (e) {}
    try {
      await fetch("/api/push-unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
    } catch (e) {}
  }
  try { localStorage.removeItem(FILTERS_LS_KEY); } catch (e) {}
  return true;
}

// Admin-only: list registered devices (sanitized). `adminPw` is sent as a
// header and checked server-side against the stored manager password.
export async function getPushDevices(adminPw) {
  const res = await fetch("/api/push-list", { headers: { "X-Admin-Pw": adminPw || "" } });
  if (!res.ok) throw new Error("push-list failed (" + res.status + ")");
  return res.json();
}

export async function sendTestPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) throw new Error("not-subscribed");
  const res = await fetch("/api/push-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  return res.json();
}
