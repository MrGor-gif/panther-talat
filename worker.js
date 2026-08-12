// Cloudflare Worker for the טל"ת (pre-trip vehicle check) app.
// Serves the built single-file React site and exposes a tiny KV-backed
// storage API so every report is saved server-side and shared across all
// devices (drivers submit; commanders view the central database).
//
// Each report is stored under its own key `talat:<id>` so concurrent
// submissions never overwrite each other.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/storage") {
      if (request.method === "GET") {
        const key = url.searchParams.get("key");
        if (!key) return json({ error: "missing key" }, 400);
        const value = await env.TALAT_KV.get(key);
        if (value === null) return json({ error: "not found" }, 404);
        return json({ key, value, shared: true });
      }
      if (request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return json({ error: "invalid json body" }, 400);
        }
        const { key, value } = body || {};
        if (!key || typeof value !== "string") {
          return json({ error: "key and string value are required" }, 400);
        }
        await env.TALAT_KV.put(key, value);
        return json({ key, value, shared: true });
      }
      if (request.method === "DELETE") {
        const key = url.searchParams.get("key");
        if (!key) return json({ error: "missing key" }, 400);
        await env.TALAT_KV.delete(key);
        return json({ key, deleted: true, shared: true });
      }
    }

    if (url.pathname === "/api/storage-list" && request.method === "GET") {
      const prefix = url.searchParams.get("prefix") || "";
      const list = await env.TALAT_KV.list({ prefix });
      const keys = list.keys.map((k) => k.name).filter((n) => !n.startsWith("__"));
      return json({ keys, prefix, shared: true });
    }

    // Fetch every value under a prefix in one request (used to load every
    // report, each stored under its own key). Values are fetched in PARALLEL
    // (not sequentially) for speed. Pass `strip=img` to drop the heavy base64
    // image fields — the manager list only needs the summary, so this keeps the
    // response small and fast; full images are fetched per report on demand.
    if (url.pathname === "/api/storage-getall" && request.method === "GET") {
      const prefix = url.searchParams.get("prefix") || "";
      const strip = url.searchParams.get("strip");
      const list = await env.TALAT_KV.list({ prefix });
      const names = list.keys.map((k) => k.name).filter((n) => !n.startsWith("__"));
      const values = await Promise.all(names.map((n) => env.TALAT_KV.get(n)));
      const IMG_FIELDS = ["engineOilImg", "rearSeatsImg", "licenseImg", "talatSheetImg"];
      const items = [];
      for (let i = 0; i < names.length; i++) {
        let value = values[i];
        if (value === null) continue;
        if (strip === "img") {
          try {
            const obj = JSON.parse(value);
            for (const f of IMG_FIELDS) delete obj[f];
            value = JSON.stringify(obj);
          } catch (e) { /* leave value as-is if it isn't JSON */ }
        }
        items.push({ key: names[i], value });
      }
      return json({ items, prefix, shared: true });
    }

    // Not an API route - serve the built static site.
    return env.ASSETS.fetch(request);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
