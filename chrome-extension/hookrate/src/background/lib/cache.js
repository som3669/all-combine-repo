// TTL cache on chrome.storage.local, with an in-memory front so repeated
// lookups inside one page view never touch disk.

const mem = new Map();

// Bump this whenever a parser or shape changes. Cached rows are keyed by it, so
// old entries become unreachable instead of serving stale wrong answers for the
// rest of their TTL — a monetization row lives a week, which is far too long to
// keep handing back a verdict a fixed parser would no longer produce.
const SCHEMA = 3;
const PREFIX = `hr:v${SCHEMA}:`;

function key(ns, id) {
  return `${PREFIX}${ns}:${id}`;
}

/** Drop rows written by earlier schema versions. Runs once per worker start. */
async function purgeOldSchemas() {
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter((k) => /^hr:v\d+:/.test(k) && !k.startsWith(PREFIX));
  if (stale.length) await chrome.storage.local.remove(stale);
  return stale.length;
}

purgeOldSchemas().catch(() => {});

export async function get(ns, id) {
  const k = key(ns, id);
  const hot = mem.get(k);
  if (hot && hot.expires > Date.now()) return hot.value;

  const bag = await chrome.storage.local.get(k);
  const row = bag[k];
  if (!row) return null;
  if (row.expires <= Date.now()) {
    chrome.storage.local.remove(k);
    return null;
  }
  mem.set(k, row);
  return row.value;
}

export async function set(ns, id, value, ttlMs) {
  const k = key(ns, id);
  const row = { value, expires: Date.now() + ttlMs };
  mem.set(k, row);
  await chrome.storage.local.set({ [k]: row });
  return value;
}

/** get-or-compute. Concurrent callers for the same key share one flight. */
const flights = new Map();

export async function wrap(ns, id, ttlMs, producer) {
  const cached = await get(ns, id);
  if (cached !== null) return cached;

  const k = key(ns, id);
  if (flights.has(k)) return flights.get(k);

  const flight = (async () => {
    try {
      const value = await producer();
      if (value !== undefined && value !== null) await set(ns, id, value, ttlMs);
      return value;
    } finally {
      flights.delete(k);
    }
  })();

  flights.set(k, flight);
  return flight;
}

export const TTL = {
  minute: 60e3,
  hour: 3600e3,
  day: 864e5,
  week: 6048e5,
};

/**
 * Drop every cached row.
 *
 * Matches only versioned cache keys (`hr:v2:…`). The user's own data lives at
 * `hr:swipe`, `hr:tracked` and `hr:settings` — an `hr:` prefix match would
 * delete their swipe file and tracked channels, which is not what "clear
 * cached lookups" means to anyone.
 */
export async function clear() {
  mem.clear();
  const all = await chrome.storage.local.get(null);
  const doomed = Object.keys(all).filter((k) => /^hr:v\d+:/.test(k));
  if (doomed.length) await chrome.storage.local.remove(doomed);
  return doomed.length;
}
