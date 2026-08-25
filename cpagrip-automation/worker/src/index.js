/**
 * CPAGrip postback receiver + stats API on Cloudflare Workers.
 *
 * Routes:
 *   GET /postback?secret=..&payout=..&offer_id=..&country=..&ip=..&tracking_id=..
 *   GET /stats                 rollups for the dashboard
 *   GET /conversions?limit=50  recent raw conversion records
 *   GET /                      the dashboard itself
 *
 * KV layout (binding: CONVERSIONS)
 *   conv:<iso-ts>:<rand>  one conversion record, 90 day TTL
 *   day:<YYYY-MM-DD>      { count, payout, offers: { <id>: { count, payout, title } } }
 *   total                 same shape plus first_seen
 *   dedupe:<hash>         marker so a resent postback is not counted twice
 *
 * Day and total buckets are read-modify-write against an eventually consistent
 * store, so two conversions in the same instant can lose an increment. The
 * immutable conv: records stay authoritative if a rollup ever needs rebuilding.
 */

import DASHBOARD_HTML from './dashboard.html';

const DAY_MS = 86400000;
const CONV_TTL_SECONDS = (90 * DAY_MS) / 1000;
const DEDUPE_TTL_SECONDS = (7 * DAY_MS) / 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function lastDays(n, from = new Date()) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(dayKey(new Date(from.getTime() - i * DAY_MS)));
  return out;
}

function toMoney(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function emptyBucket() {
  return { count: 0, payout: 0, offers: {} };
}

function addToBucket(bucket, record) {
  bucket.count += 1;
  bucket.payout = toMoney(bucket.payout + record.payout);
  const key = record.offer_id || 'unknown';
  const slot = bucket.offers[key] || { count: 0, payout: 0, title: '' };
  slot.count += 1;
  slot.payout = toMoney(slot.payout + record.payout);
  if (record.offer_name && !slot.title) slot.title = record.offer_name;
  bucket.offers[key] = slot;
  return bucket;
}

async function readBucket(env, key) {
  const raw = await env.CONVERSIONS.get(key, 'json');
  if (!raw) return emptyBucket();
  return { count: raw.count || 0, payout: raw.payout || 0, offers: raw.offers || {} };
}

async function handlePostback(url, env) {
  const q = url.searchParams;

  // A shared secret keeps strangers from writing fake conversions into KV.
  if (env.POSTBACK_SECRET && q.get('secret') !== env.POSTBACK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const now = new Date();
  const record = {
    ts: now.toISOString(),
    payout: toMoney(q.get('payout')),
    offer_id: (q.get('offer_id') || '').trim(),
    offer_name: (q.get('offer_name') || '').trim(),
    country: (q.get('country') || '').trim(),
    ip: (q.get('ip') || '').trim(),
    tracking_id: (q.get('tracking_id') || '').trim(),
  };

  // CPAGrip retries postbacks. Same offer + tracking id + ip + payout inside the
  // dedupe window is a retry of one conversion, not a second conversion.
  const fingerprint = await sha256Hex([record.offer_id, record.tracking_id, record.ip, record.payout].join('|'));
  const dedupeKey = `dedupe:${fingerprint}`;
  if (record.tracking_id || record.ip) {
    if (await env.CONVERSIONS.get(dedupeKey)) {
      return new Response('1', { headers: { 'Content-Type': 'text/plain', 'X-Dedupe': 'hit' } });
    }
  }

  const dk = `day:${dayKey(now)}`;
  const [dayBucket, totalRaw] = await Promise.all([readBucket(env, dk), env.CONVERSIONS.get('total', 'json')]);
  const total = totalRaw
    ? {
        count: totalRaw.count || 0,
        payout: totalRaw.payout || 0,
        offers: totalRaw.offers || {},
        first_seen: totalRaw.first_seen || record.ts,
      }
    : { ...emptyBucket(), first_seen: record.ts };

  await Promise.all([
    env.CONVERSIONS.put(`conv:${record.ts}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify(record), {
      expirationTtl: CONV_TTL_SECONDS,
    }),
    env.CONVERSIONS.put(dk, JSON.stringify(addToBucket(dayBucket, record))),
    env.CONVERSIONS.put('total', JSON.stringify(addToBucket(total, record))),
    env.CONVERSIONS.put(dedupeKey, '1', { expirationTtl: DEDUPE_TTL_SECONDS }),
  ]);

  // CPAGrip only checks for a 200; the body is for eyeballing in a browser.
  return new Response('1', { headers: { 'Content-Type': 'text/plain' } });
}

function sumBuckets(buckets) {
  const out = emptyBucket();
  for (const b of buckets) {
    out.count += b.count;
    out.payout = toMoney(out.payout + b.payout);
    for (const [id, slot] of Object.entries(b.offers)) {
      const cur = out.offers[id] || { count: 0, payout: 0, title: '' };
      cur.count += slot.count;
      cur.payout = toMoney(cur.payout + slot.payout);
      cur.title = cur.title || slot.title || '';
      out.offers[id] = cur;
    }
  }
  return out;
}

function topOffers(bucket, limit = 10) {
  return Object.entries(bucket.offers || {})
    .map(([id, s]) => ({ offer_id: id, title: s.title || '', count: s.count, payout: toMoney(s.payout) }))
    .sort((a, b) => b.payout - a.payout)
    .slice(0, limit);
}

async function handleStats(env) {
  const days = lastDays(30);
  const buckets = await Promise.all(days.map((d) => readBucket(env, `day:${d}`)));
  const byDay = days.map((d, i) => ({ date: d, count: buckets[i].count, payout: toMoney(buckets[i].payout) }));

  const week = sumBuckets(buckets.slice(0, 7));
  const month = sumBuckets(buckets);
  const totalRaw = (await env.CONVERSIONS.get('total', 'json')) || { ...emptyBucket(), first_seen: null };

  const period = (b) => ({ conversions: b.count, earnings: toMoney(b.payout) });

  return json({
    generated_at: new Date().toISOString(),
    today: period(buckets[0]),
    week: period(week),
    month: period(month),
    all_time: {
      conversions: totalRaw.count || 0,
      earnings: toMoney(totalRaw.payout || 0),
      first_seen: totalRaw.first_seen || null,
    },
    top_offers: topOffers(month),
    top_offers_all_time: topOffers(totalRaw),
    by_day: byDay.reverse(),
  });
}

async function handleConversions(url, env) {
  const limit = Math.min(Number(url.searchParams.get('limit') || 50) || 50, 200);
  const list = await env.CONVERSIONS.list({ prefix: 'conv:', limit: 1000 });
  // conv keys are ISO-timestamp prefixed, so lexical order is chronological order.
  const keys = list.keys
    .map((k) => k.name)
    .sort()
    .reverse()
    .slice(0, limit);
  const rows = await Promise.all(keys.map((k) => env.CONVERSIONS.get(k, 'json')));
  return json({ count: rows.length, conversions: rows.filter(Boolean) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });

    switch (url.pathname) {
      case '/postback':
        return handlePostback(url, env);
      case '/stats':
        return handleStats(env);
      case '/conversions':
        return handleConversions(url, env);
      case '/':
      case '/dashboard':
        return new Response(DASHBOARD_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      case '/health':
        return json({ ok: true, ts: new Date().toISOString() });
      default:
        return new Response('not found', { status: 404 });
    }
  },
};
