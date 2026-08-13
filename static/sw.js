// Service worker for the טל"ת PWA.
// Strategy: network-first for the app document (so an online user always gets
// the freshest build), falling back to the cached shell when offline. API
// requests are never cached. Because the app is a single inlined HTML file,
// caching "/" is enough for the whole app to load offline.

const CACHE = "talat-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add("/")).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through
  if (url.pathname.startsWith("/api/")) return;     // never cache the API

  const isDocument = req.mode === "navigate" || req.destination === "document";

  if (isDocument) {
    // network-first, fall back to cached shell
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || caches.match(req)))
    );
    return;
  }

  // other same-origin GETs (icons, manifest): cache-first, fall back to network
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
    )
  );
});

// --- Web Push ---
self.addEventListener("push", (event) => {
  let title = 'טל"ת — דיווח חדש';
  let body = 'התקבל דיווח טל"ת חדש שתואם להתראות שלך';
  try {
    if (event.data) {
      const d = event.data.json();
      if (d.title) title = d.title;
      if (d.body) body = d.body;
    }
  } catch (e) { /* payload-less push — use defaults */ }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      dir: "rtl",
      lang: "he",
      tag: "talat-report",
      renotify: true,
      data: { url: "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) { try { await c.focus(); return; } catch (e) {} }
    }
    await self.clients.openWindow("/");
  })());
});
