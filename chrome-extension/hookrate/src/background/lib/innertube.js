// Minimal InnerTube client.
//
// Two access paths, deliberately:
//   1. page()   — fetch a normal youtube.com HTML page, lift ytInitialData.
//                 Durable, no key needed, gives the first ~30 items.
//   2. api()    — POST /youtubei/v1/*, needed for continuations, player data
//                 and search. Config (key + client version) is scraped once
//                 from a page load and cached.
//
// Every request is credentials-omitted on purpose. Signed-in cookies would
// (a) leak the user's identity into research calls and (b) suppress
// `adPlacements` for Premium accounts, which breaks monetization detection.

import { extractJson, findAll } from './parse.js';
import * as cache from './cache.js';

const ORIGIN = 'https://www.youtube.com';
const CFG_TTL = cache.TTL.hour * 6;

let cfgPromise = null;

async function fetchText(url) {
  const res = await fetch(url, {
    credentials: 'omit',
    headers: { 'accept-language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

function scrapeConfig(html) {
  const pick = (re) => (html.match(re) || [])[1] || null;
  const cfg = {
    apiKey: pick(/"INNERTUBE_API_KEY":"([^"]+)"/),
    clientVersion:
      pick(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) ||
      pick(/"clientVersion":"([\d.]+)"/),
    visitorData: pick(/"visitorData":"([^"]+)"/),
  };
  return cfg.apiKey && cfg.clientVersion ? cfg : null;
}

async function config() {
  const cached = await cache.get('cfg', 'innertube');
  if (cached) return cached;
  if (cfgPromise) return cfgPromise;

  cfgPromise = (async () => {
    try {
      const html = await fetchText(`${ORIGIN}/?hl=en&gl=US`);
      const cfg = scrapeConfig(html);
      if (!cfg) throw new Error('InnerTube config not found on youtube.com');
      await cache.set('cfg', 'innertube', cfg, CFG_TTL);
      return cfg;
    } finally {
      cfgPromise = null;
    }
  })();

  return cfgPromise;
}

/** Fetch a YouTube page and return { data, html }. */
export async function page(path) {
  const url = path.startsWith('http') ? path : `${ORIGIN}${path}`;
  const sep = url.includes('?') ? '&' : '?';
  const html = await fetchText(`${url}${sep}hl=en&gl=US`);
  return {
    html,
    data: extractJson(html, 'ytInitialData'),
    player: extractJson(html, 'ytInitialPlayerResponse'),
  };
}

/**
 * Ask a youtube.com tab to make the request for us.
 *
 * A worker-side fetch sends `Origin: chrome-extension://<id>` and YouTube
 * answers 403. `Origin` is a forbidden header, so it cannot be rewritten from
 * here. A content script's fetch carries the page's own origin instead, so the
 * relay in src/content/lib/relay.js performs the call. Cookies stay stripped
 * on that side too.
 */
async function relay(endpoint, payload) {
  const cfg = await config();
  const tabs = await chrome.tabs.query({ url: `${ORIGIN}/*` });
  if (!tabs.length) throw new Error('no youtube.com tab open to relay through');

  let lastError = null;
  for (const tab of tabs) {
    try {
      return await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tab.id,
          {
            action: 'relay.innertube',
            payload: {
              endpoint,
              key: cfg.apiKey,
              clientVersion: cfg.clientVersion,
              body: payload,
            },
          },
          (res) => {
            const err = chrome.runtime.lastError;
            if (err) return reject(new Error(err.message));
            if (!res) return reject(new Error('relay did not answer'));
            if (!res.ok) return reject(new Error(res.error));
            resolve(res.data);
          }
        );
      });
    } catch (err) {
      lastError = err; // that tab may still be loading; try the next one
    }
  }
  throw lastError || new Error('relay failed on every tab');
}

/** Direct POST. Kept as a fallback in case the origin check is ever relaxed. */
async function direct(endpoint, payload) {
  const cfg = await config();
  const res = await fetch(
    `${ORIGIN}/youtubei/v1/${endpoint}?key=${cfg.apiKey}&prettyPrint=false`,
    {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'content-type': 'application/json',
        'x-youtube-client-name': '1',
        'x-youtube-client-version': cfg.clientVersion,
      },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error(`POST ${endpoint} -> ${res.status}`);
  return res.json();
}

/** POST an InnerTube endpoint with the standard WEB context. */
export async function api(endpoint, body = {}, clientOverride = {}) {
  const cfg = await config();
  const payload = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: cfg.clientVersion,
        hl: 'en',
        gl: 'US',
        visitorData: cfg.visitorData || undefined,
        ...clientOverride,
      },
    },
    ...body,
  };

  try {
    return await relay(endpoint, payload);
  } catch (relayError) {
    try {
      return await direct(endpoint, payload);
    } catch (directError) {
      throw new Error(`${endpoint} unavailable (${relayError.message}; ${directError.message})`);
    }
  }
}

export const browse = (params) => api('browse', params);

/**
 * Search. Falls back to reading the results page, which needs no API call —
 * at the cost of the filter params, since those only exist on the endpoint.
 */
export async function search(query, params) {
  try {
    return await api('search', params ? { query, params } : { query });
  } catch {
    const { data } = await page(`/results?search_query=${encodeURIComponent(query)}`);
    if (!data) throw new Error('search results page carried no data');
    return data;
  }
}

// ---- watch-page reads ----------------------------------------------------
//
// /youtubei/v1/player now rejects unattested WEB requests with 403 — it wants
// a proof-of-origin token an extension cannot mint, and `Origin`/`Referer` are
// forbidden headers for fetch(), so the request cannot be made to look right.
//
// The watch page itself still ships the whole payload inline as
// ytInitialPlayerResponse, so read it from there. Same data, no attestation.
// The API call stays as a fallback in case the inline blob disappears.

const WATCH_TTL = 90e3;
const watchCache = new Map();

/** Fetch a watch page once and reuse it — several callers want the same page. */
async function watch(videoId) {
  const hit = watchCache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await page(`/watch?v=${videoId}`);
  watchCache.set(videoId, { value, expires: Date.now() + WATCH_TTL });

  // Bound the map: this holds full page payloads.
  if (watchCache.size > 12) {
    for (const [k, v] of watchCache) {
      if (v.expires <= Date.now() || watchCache.size > 12) watchCache.delete(k);
      if (watchCache.size <= 12) break;
    }
  }
  return value;
}

/** Player response for a video: inline blob first, API second. */
export async function player(videoId) {
  try {
    const { player: inline } = await watch(videoId);
    if (inline && inline.videoDetails) return inline;
  } catch {
    /* fall through to the API */
  }
  return api('player', { videoId, contentCheckOk: true, racyCheckOk: true });
}

/** Watch-next data (related videos, comment continuation, like counts). */
export async function next(videoId) {
  try {
    return await api('next', { videoId });
  } catch {
    // Same inline trick: ytInitialData on the watch page carries the related
    // shelf and the comments continuation token.
    const { data } = await watch(videoId);
    if (!data) throw new Error('watch page carried no ytInitialData');
    return data;
  }
}

/** Raw watch page, for callers that need the HTML too. */
export const watchPage = watch;

/** Follow a continuation token until `limit` items or the list runs dry. */
export async function paginate(firstResponse, extract, limit = 120) {
  let items = extract(firstResponse);
  let response = firstResponse;
  let guard = 0;

  while (items.length < limit && guard++ < 6) {
    const token = findAll(response, 'continuationCommand')
      .map((c) => c.token)
      .find(Boolean);
    if (!token) break;
    try {
      response = await browse({ continuation: token });
    } catch {
      // Continuations need the endpoint. If it is unreachable, keep the first
      // page rather than failing the whole panel — 30 videos is enough for a
      // median baseline.
      break;
    }
    const more = extract(response);
    if (!more.length) break;
    items = items.concat(more);
  }
  return items.slice(0, limit);
}

export { ORIGIN };
