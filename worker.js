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
    // report, each stored under its own key).
    if (url.pathname === "/api/storage-getall" && request.method === "GET") {
      const prefix = url.searchParams.get("prefix") || "";
      const list = await env.TALAT_KV.list({ prefix });
      const items = [];
      for (const k of list.keys) {
        if (k.name.startsWith("__")) continue;
        const value = await env.TALAT_KV.get(k.name);
        if (value !== null) items.push({ key: k.name, value });
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
