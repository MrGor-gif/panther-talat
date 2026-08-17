// Cloudflare Worker for the טל"ת app.
// Serves the built single-file site + a KV storage API, and (new) Web Push
// notifications: commanders (admin/manig49) subscribe with a filter
// (company + severity + specific faults) and get a push when a NEW matching
// report arrives. Subscriptions are stored under `__push:<id>` (the `__`
// prefix keeps them out of the public storage listing). The VAPID private key
// lives in KV under `__vapid_private__`.

const VAPID_PUBLIC = "BPv9qdmBSm9cas8vW5Hsk4nZL7GjlIJne42mXzUY9ClS-m3TJFHE0nzbj8ba0kNKFRx9ps1aFj6XDYU11IL0yno";
const VAPID_SUBJECT = "mailto:guygula.gula@gmail.com";

const TOOLS = ["מטף", "ג'ק", "ידית הפעלה", "מפתח גלגלים", "אפוד זוהר", "משולש אזהרה"];

export default {
  async fetch(request, env, ctx) {
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
        // Only a brand-new report (key didn't exist yet) triggers notifications
        // — edits/overwrites must not fire a push.
        const isNewReport = key.startsWith("talat:") ? (await env.TALAT_KV.get(key)) === null : false;
        await env.TALAT_KV.put(key, value);
        if (isNewReport) {
          try {
            const report = JSON.parse(value);
            ctx.waitUntil(notifyMatching(env, report));
          } catch (e) { /* not JSON — skip notify */ }
        }
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

    // Fetch values under a prefix, ONE PAGE at a time. Cloudflare's free plan
    // caps a request at 50 subrequests (each KV read is one), so we read at most
    // ~45 records per call and return a `cursor` for the client to fetch the
    // next page. Pass `strip=img` to drop the heavy base64 image fields (the
    // manager list only needs the summary — images load per report on demand).
    if (url.pathname === "/api/storage-getall" && request.method === "GET") {
      const prefix = url.searchParams.get("prefix") || "";
      const strip = url.searchParams.get("strip");
      const cursor = url.searchParams.get("cursor") || undefined;
      const limit = 45;
      const list = await env.TALAT_KV.list({ prefix, limit, cursor });
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
          } catch (e) { /* leave as-is */ }
        }
        items.push({ key: names[i], value });
      }
      return json({
        items,
        prefix,
        cursor: list.list_complete ? null : list.cursor,
        list_complete: !!list.list_complete,
        shared: true,
      });
    }

    // --- Web Push endpoints ---

    // Expose the public VAPID key so the client can subscribe.
    if (url.pathname === "/api/push-public-key" && request.method === "GET") {
      return json({ key: VAPID_PUBLIC });
    }

    // Register / update a subscription together with its notification filter.
    if (url.pathname === "/api/push-subscribe" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !body.subscription || !body.subscription.endpoint) {
        return json({ error: "subscription required" }, 400);
      }
      const id = await sha256hex(body.subscription.endpoint);
      await env.TALAT_KV.put("__push:" + id, JSON.stringify({
        subscription: body.subscription,
        filters: body.filters || {},
        updatedAt: new Date().toISOString(),
      }));
      return json({ ok: true, id });
    }

    // Remove a subscription.
    if (url.pathname === "/api/push-unsubscribe" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !body.endpoint) return json({ error: "endpoint required" }, 400);
      const id = await sha256hex(body.endpoint);
      await env.TALAT_KV.delete("__push:" + id);
      return json({ ok: true });
    }

    // List registered devices (admin only). Returns sanitized info — platform,
    // chosen filters, date — never the raw push endpoint or keys.
    if (url.pathname === "/api/push-list" && request.method === "GET") {
      const provided = request.headers.get("X-Admin-Pw");
      const adminPw = await env.TALAT_KV.get("__admin_pw__");
      if (!adminPw || provided !== adminPw) return json({ error: "forbidden" }, 403);
      const list = await env.TALAT_KV.list({ prefix: "__push:" });
      const values = await Promise.all(list.keys.map((k) => env.TALAT_KV.get(k.name)));
      const devices = [];
      for (const v of values) {
        if (!v) continue;
        let o;
        try { o = JSON.parse(v); } catch (e) { continue; }
        const ep = (o.subscription && o.subscription.endpoint) || "";
        let platform = "לא ידוע";
        if (/apple/i.test(ep)) platform = "iPhone (iOS)";
        else if (/fcm|google/i.test(ep)) platform = "Android / Chrome";
        else if (/mozilla|firefox/i.test(ep)) platform = "Firefox";
        else if (/windows|microsoft|wns|notify/i.test(ep)) platform = "Windows";
        devices.push({ platform, filters: o.filters || {}, updatedAt: o.updatedAt || null });
      }
      devices.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      return json({ count: devices.length, devices });
    }

    // Send a test push to a single subscription (used by the settings UI).
    if (url.pathname === "/api/push-test" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !body.endpoint) return json({ error: "endpoint required" }, 400);
      const id = await sha256hex(body.endpoint);
      const raw = await env.TALAT_KV.get("__push:" + id);
      if (!raw) return json({ error: "subscription not found" }, 404);
      try {
        const status = await sendPush(env, JSON.parse(raw).subscription, {
          title: "בדיקת התראה",
          body: 'זו התראת בדיקה מאתר הטל"ת ✓',
        });
        return json({ ok: status >= 200 && status < 300, status });
      } catch (e) {
        return json({ error: String(e && e.message || e) }, 500);
      }
    }

    // Not an API route - serve the built static site.
    return env.ASSETS.fetch(request);
  },
};

/* ---------------- notification matching ---------------- */

function reportStatus(r) {
  if (r.status) return r.status;
  const red = r.sprayers === "לא תקין" || r.tirePressure === "לא תקין" || r.lights === "לא תקין" ||
    (r.rearSeatsDamage && r.rearSeatsDamage.trim()) || r.photo360 === "לא מאשר";
  if (red) return "red";
  const yellow = r.fuel === "1/4" || r.coolant === "מים מתחת לקו האמצע" || r.trunkLock === "לא קיים" ||
    TOOLS.some((t) => !(r.tools || []).includes(t)) || (r.additionalFaults && r.additionalFaults.trim());
  return yellow ? "yellow" : "green";
}

// Boolean conditions for the "specific parameters" filter. Keys are shared with
// the client UI.
function paramConditions(r) {
  return {
    sprayersBad: r.sprayers === "לא תקין",
    tireBad: r.tirePressure === "לא תקין",
    lightsBad: r.lights === "לא תקין",
    no360: r.photo360 === "לא מאשר",
    rearDamage: !!(r.rearSeatsDamage && r.rearSeatsDamage.trim()),
    fuelLow: r.fuel === "1/4",
    coolantLow: r.coolant === "מים מתחת לקו האמצע",
    noTrunkLock: r.trunkLock === "לא קיים",
    toolsMissing: TOOLS.some((t) => !(r.tools || []).includes(t)),
    extraFaults: !!(r.additionalFaults && r.additionalFaults.trim()),
  };
}

// Empty array on a dimension = "no restriction" (matches all).
function matchesFilters(report, filters) {
  const f = filters || {};
  const companies = f.companies || [];
  const severities = f.severities || [];
  const params = f.params || [];
  if (companies.length && !companies.includes(report.company)) return false;
  if (severities.length && !severities.includes(reportStatus(report))) return false;
  if (params.length) {
    const conds = paramConditions(report);
    if (!params.some((p) => conds[p])) return false;
  }
  return true;
}

async function notifyMatching(env, report) {
  const list = await env.TALAT_KV.list({ prefix: "__push:" });
  const entries = await Promise.all(
    list.keys.map((k) => env.TALAT_KV.get(k.name).then((v) => ({ name: k.name, v })))
  );
  for (const e of entries) {
    if (!e.v) continue;
    let rec;
    try { rec = JSON.parse(e.v); } catch (err) { continue; }
    if (!matchesFilters(report, rec.filters)) continue;
    try {
      const status = await sendPush(env, rec.subscription, buildMessage(report));
      if (status === 404 || status === 410) await env.TALAT_KV.delete(e.name); // subscription expired
    } catch (err) { /* ignore individual send failures */ }
  }
}

/* ---------------- VAPID web push (payload-less) ---------------- */

function b64urlFromBytes(buf) {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromString(str) {
  return b64urlFromBytes(new TextEncoder().encode(str));
}

async function importVapidPrivateKey(env) {
  const jwkStr = await env.TALAT_KV.get("__vapid_private__");
  if (!jwkStr) throw new Error("VAPID private key not configured");
  const jwk = JSON.parse(jwkStr);
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function vapidAuthHeader(env, endpoint) {
  const key = await importVapidPrivateKey(env);
  const aud = new URL(endpoint).origin;
  const header = b64urlFromString(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = b64urlFromString(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  }));
  const signingInput = header + "." + payload;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput)
  );
  const jwt = signingInput + "." + b64urlFromBytes(sig);
  return `vapid t=${jwt}, k=${VAPID_PUBLIC}`;
}

function b64urlToBytes(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concatBytes(...arrays) {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}

// Encrypt a push payload per RFC 8291 (aes128gcm) so the notification can carry
// text (vehicle / company / severity).
async function encryptPayload(plaintextStr, p256dhB64, authB64) {
  const enc = new TextEncoder();
  const plaintext = enc.encode(plaintextStr);
  const uaPublic = b64urlToBytes(p256dhB64);   // 65 bytes
  const authSecret = b64urlToBytes(authB64);   // 16 bytes

  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey)); // 65 bytes
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));

  // stage 1 (RFC 8291): combine the ECDH secret with the auth secret
  const keyInfo = concatBytes(enc.encode("WebPush: info"), new Uint8Array([0]), uaPublic, asPublic);
  const ecdhKey = await crypto.subtle.importKey("raw", ecdhSecret, "HKDF", false, ["deriveBits"]);
  const ikm = new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: authSecret, info: keyInfo }, ecdhKey, 256));

  // stage 2 (RFC 8188 aes128gcm): derive CEK + nonce from a random record salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikmKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const cek = new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: concatBytes(enc.encode("Content-Encoding: aes128gcm"), new Uint8Array([0])) }, ikmKey, 128));
  const nonce = new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: concatBytes(enc.encode("Content-Encoding: nonce"), new Uint8Array([0])) }, ikmKey, 96));

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const record = concatBytes(plaintext, new Uint8Array([2])); // 0x02 = last-record delimiter
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, record));

  // aes128gcm header: salt(16) + rs(4, uint32 BE = 4096) + idlen(1) + keyid(as_public 65)
  const header = concatBytes(salt, new Uint8Array([0, 0, 0x10, 0x00]), new Uint8Array([asPublic.length]), asPublic);
  return concatBytes(header, ct);
}

// Send a push. If `message` + subscription keys are present, send an encrypted
// payload; if that fails (or on 400), fall back to a payload-less "tickle" so a
// notification still arrives.
async function sendPush(env, subscription, message) {
  const auth = await vapidAuthHeader(env, subscription.endpoint);
  const sub = subscription || {};
  if (message && sub.keys && sub.keys.p256dh && sub.keys.auth) {
    try {
      const body = await encryptPayload(JSON.stringify(message), sub.keys.p256dh, sub.keys.auth);
      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          "Authorization": auth,
          "TTL": "86400",
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
        },
        body,
      });
      if (res.status !== 400) return res.status;
      // 400 → likely a payload problem; fall through to payload-less
    } catch (e) { /* fall through to payload-less */ }
  }
  const res2 = await fetch(sub.endpoint, { method: "POST", headers: { "Authorization": auth, "TTL": "86400" } });
  return res2.status;
}

// Notification text for a matched report.
function buildMessage(report) {
  const st = reportStatus(report);
  const sev = st === "red" ? '🔴 דורש התייחסות טנ"א' : st === "yellow" ? "🟡 התייחסות פלוגתית" : "🟢 תקין";
  return {
    title: 'דיווח טל"ת חדש',
    body: `צ' ${report.vehicleNumber || "—"} · פלוגה ${report.company || "—"} · ${sev}`,
  };
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
