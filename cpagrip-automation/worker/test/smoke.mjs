/**
 * Smoke test for the Worker's postback -> KV -> stats path, run on plain Node.
 *
 * The Worker imports dashboard.html as a text module, which only Wrangler can
 * resolve, so the test loads the source with that import swapped for a stub.
 *
 *   node test/smoke.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const SRC = path.resolve(import.meta.dirname, '..', 'src', 'index.js');

async function loadWorker() {
  const source = fs
    .readFileSync(SRC, 'utf8')
    .replace(/^import DASHBOARD_HTML from .*$/m, "const DASHBOARD_HTML = '<html>stub</html>';");
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cpagrip-')), 'worker.mjs');
  fs.writeFileSync(tmp, source);
  return (await import(pathToFileURL(tmp).href)).default;
}

/** In-memory stand-in for a KV namespace. TTLs are ignored; nothing here expires. */
function fakeKV() {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async list({ prefix = '', limit = 1000 } = {}) {
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .slice(0, limit)
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

const worker = await loadWorker();
const kv = fakeKV();
const env = { CONVERSIONS: kv, POSTBACK_SECRET: 's3cret' };
const call = (url) => worker.fetch(new Request(url), env);
const BASE = 'https://example.workers.dev';

// Postbacks without the secret must not write anything.
{
  const res = await call(`${BASE}/postback?payout=1.25&offer_id=99`);
  assert.equal(res.status, 403, 'missing secret should be rejected');
  assert.equal(kv.store.size, 0, 'rejected postback must not write to KV');
}

// A valid postback records the conversion.
{
  const res = await call(
    `${BASE}/postback?secret=s3cret&payout=1.25&offer_id=99&offer_name=Gift+Survey&country=US&ip=1.2.3.4&tracking_id=vabc`
  );
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '1', 'CPAGrip expects a 200 with a short body');
}

// The same ping replayed is a retry, not a second conversion.
{
  const res = await call(
    `${BASE}/postback?secret=s3cret&payout=1.25&offer_id=99&offer_name=Gift+Survey&country=US&ip=1.2.3.4&tracking_id=vabc`
  );
  assert.equal(res.headers.get('X-Dedupe'), 'hit', 'duplicate postback should be deduped');
}

// A different visitor on the same offer is a real second conversion.
await call(`${BASE}/postback?secret=s3cret&payout=0.80&offer_id=99&country=US&ip=5.6.7.8&tracking_id=vdef`);
// And a different offer entirely.
await call(`${BASE}/postback?secret=s3cret&payout=2.00&offer_id=42&offer_name=Zip+Drop&country=US&ip=9.9.9.9&tracking_id=vghi`);

{
  const stats = await (await call(`${BASE}/stats`)).json();
  assert.equal(stats.today.conversions, 3, 'three unique conversions today');
  assert.equal(stats.today.earnings, 4.05, '1.25 + 0.80 + 2.00');
  assert.equal(stats.week.earnings, 4.05);
  assert.equal(stats.month.earnings, 4.05);
  assert.equal(stats.all_time.conversions, 3);
  assert.equal(stats.all_time.earnings, 4.05);
  assert.equal(stats.by_day.length, 30, 'dashboard sparkline expects 30 buckets');
  assert.equal(stats.by_day.at(-1).payout, 4.05, 'today is the last bucket');

  const top = stats.top_offers;
  assert.equal(top[0].offer_id, '99', 'offer 99 earned the most');
  assert.equal(top[0].count, 2);
  assert.equal(top[0].payout, 2.05);
  assert.equal(top[0].title, 'Gift Survey', 'title is captured from offer_name when present');
  assert.equal(top[1].offer_id, '42');
}

{
  const recent = await (await call(`${BASE}/conversions?limit=10`)).json();
  assert.equal(recent.count, 3);
  assert.ok(recent.conversions[0].ts >= recent.conversions[2].ts, 'newest conversion first');
}

{
  assert.equal((await call(`${BASE}/health`)).status, 200);
  assert.equal((await call(`${BASE}/nope`)).status, 404);
  const dash = await call(`${BASE}/`);
  assert.match(dash.headers.get('Content-Type'), /text\/html/);
}

console.log('smoke: all assertions passed');
