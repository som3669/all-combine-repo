// SEO Inspector - license backend (Cloudflare Worker)
//
// Two jobs:
//   POST /webhook   - receives FastSpring events, verifies HMAC signature,
//                     and stores valid license keys in KV on purchase
//                     (and revokes them on refund/chargeback/return).
//   POST /validate  - the extension posts { key }; we look it up in KV.
//
// Setup:
//   1. Create a KV namespace and bind it as LICENSES (see wrangler.toml).
//   2. Set secrets:  wrangler secret put FS_WEBHOOK_SECRET
//   3. In FastSpring dashboard, add a webhook -> https://YOUR-WORKER.workers.dev/webhook
//      and copy its HMAC secret into FS_WEBHOOK_SECRET.
//   4. Deploy:  wrangler deploy

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight for the extension's fetch.
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    if (url.pathname === "/validate" && request.method === "POST") {
      return cors(await handleValidate(request, env));
    }
    if (url.pathname === "/webhook" && request.method === "POST") {
      return handleWebhook(request, env); // no CORS (server-to-server)
    }
    return new Response("Not found", { status: 404 });
  },
};

// ---- extension asks: is this key valid? ----
async function handleValidate(request, env) {
  let key = "";
  try { key = (await request.json()).key || ""; } catch {}
  key = String(key).trim();
  if (!key) return json({ valid: false, message: "No key provided." });

  const rec = await env.LICENSES.get("key:" + key, { type: "json" });
  if (rec && rec.valid) return json({ valid: true, message: "License active." });
  return json({ valid: false, message: "Invalid or unrecognized key." });
}

// ---- FastSpring calls this on order events ----
async function handleWebhook(request, env) {
  const raw = await request.text();

  // Verify HMAC-SHA256 signature (base64) in X-FS-Signature.
  const sig = request.headers.get("X-FS-Signature") || "";
  const ok = await verifyHmac(raw, sig, env.FS_WEBHOOK_SECRET);
  if (!ok) return new Response("bad signature", { status: 401 });

  let body;
  try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  for (const ev of body.events || []) {
    const type = ev.type;
    const data = ev.data || {};

    // Pull any license keys out of the order's fulfillments.
    const keys = extractLicenseKeys(data);

    if (type === "order.completed") {
      for (const k of keys) {
        await env.LICENSES.put(
          "key:" + k,
          JSON.stringify({ valid: true, email: data.customer?.email || "", ts: Date.now() })
        );
      }
    } else if (
      type === "return.created" ||
      type === "order.refunded" ||
      type === "subscription.deactivated"
    ) {
      for (const k of keys) {
        await env.LICENSES.put("key:" + k, JSON.stringify({ valid: false, ts: Date.now() }));
      }
    }
  }
  return new Response("ok");
}

// FastSpring nests license keys under item fulfillments.
function extractLicenseKeys(data) {
  const keys = [];
  for (const item of data.items || []) {
    const f = item.fulfillments || {};
    for (const arr of Object.values(f)) {
      for (const entry of arr || []) {
        if (entry && entry.license) keys.push(String(entry.license).trim());
        if (entry && entry.value) keys.push(String(entry.value).trim());
      }
    }
  }
  return [...new Set(keys)];
}

async function verifyHmac(raw, sigB64, secret) {
  if (!secret || !sigB64) return false;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(raw));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, sigB64);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json" },
  });
}
function cors(res) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}
