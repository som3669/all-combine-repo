#!/usr/bin/env node
/**
 * CPAGrip offer fetcher.
 *
 * Pulls the JSON offer feed server-side, filters to the niche we care about,
 * ranks by net EPC, and writes the top N to offers.json for the landing page.
 *
 * The private key must never reach the browser, which is why this runs here
 * and the page only ever reads the generated offers.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG = {
  userId: process.env.CPAGRIP_USER_ID || '107151',
  pubKey: process.env.CPAGRIP_PUBKEY || 'deb40494db846602f9531f7e27745e76',
  privateKey: process.env.CPAGRIP_PRIVATE_KEY || '',
  country: process.env.CPAGRIP_COUNTRY || 'US',
  offerType: process.env.CPAGRIP_OFFER_TYPE || 'Email/Zip Submit',
  minPayout: Number(process.env.CPAGRIP_MIN_PAYOUT || 0.5),
  limit: Number(process.env.CPAGRIP_LIMIT || 10),
  outFile: process.env.CPAGRIP_OUT || path.resolve(__dirname, '..', 'landing', 'offers.json'),
  rawFile: process.env.CPAGRIP_RAW || path.resolve(__dirname, 'last_response.json'),
  timeoutMs: Number(process.env.CPAGRIP_TIMEOUT_MS || 20000),
};

const FEED_BASE = 'https://www.cpagrip.com/common/offer_feed_json.php';

/** Feed field names drift between account types, so read through aliases. */
function pick(obj, names, fallback) {
  for (const n of names) {
    if (obj[n] !== undefined && obj[n] !== null && obj[n] !== '') return obj[n];
  }
  return fallback;
}

function num(value, fallback = 0) {
  const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function buildUrl() {
  const u = new URL(FEED_BASE);
  u.searchParams.set('user_id', CONFIG.userId);
  u.searchParams.set('pubkey', CONFIG.pubKey);
  u.searchParams.set('key', CONFIG.privateKey);
  u.searchParams.set('country', CONFIG.country);
  u.searchParams.set('showall', 'yes');
  return u;
}

async function fetchFeed() {
  const url = buildUrl();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), CONFIG.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'User-Agent': 'cpagrip-offer-fetcher/1.0', Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`feed HTTP ${res.status}: ${text.slice(0, 300)}`);
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`feed did not return JSON. First 300 chars: ${text.slice(0, 300)}`);
    }
    fs.writeFileSync(CONFIG.rawFile, JSON.stringify(json, null, 2));
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The feed's "general" block is a list of single-key objects reporting how CPAGrip
 * resolved the request (detected country, tracking id, user agent). Flatten it so an
 * empty offer list can explain itself.
 */
function generalInfo(json) {
  if (!json || !Array.isArray(json.general)) return {};
  return Object.assign({}, ...json.general);
}

/** The feed sometimes nests the array, sometimes returns it bare. */
function extractOffers(json) {
  if (Array.isArray(json)) return json;
  for (const key of ['offers', 'offer', 'data', 'results']) {
    if (Array.isArray(json[key])) return json[key];
  }
  if (json.error || json.Error) {
    throw new Error(`feed returned an error: ${JSON.stringify(json).slice(0, 300)}`);
  }
  throw new Error(`could not find an offer array in the response: ${JSON.stringify(json).slice(0, 300)}`);
}

function normalize(raw) {
  const payout = num(pick(raw, ['payout', 'amount', 'rate', 'payout_amount']));
  const epcRaw = pick(raw, ['epc', 'net_epc', 'netepc', 'EPC'], null);
  return {
    id: String(pick(raw, ['offerid', 'offer_id', 'id', 'campaign_id'], '')),
    title: String(pick(raw, ['title', 'offer_name', 'name', 'offertitle'], 'Untitled offer')).trim(),
    description: String(pick(raw, ['description', 'offerdesc', 'desc'], '')).trim(),
    payout,
    epc: epcRaw === null ? null : num(epcRaw, 0),
    offer_type: String(pick(raw, ['offertype', 'offer_type', 'type', 'category'], '')).trim(),
    country: String(pick(raw, ['country', 'countries', 'geo'], '')).trim(),
    link: String(pick(raw, ['tracking_link', 'trackinglink', 'offerlink', 'link', 'url'], '')).trim(),
    image: String(pick(raw, ['previewurl', 'preview_url', 'image', 'creative'], '')).trim(),
  };
}

function matchesCountry(offer, want) {
  if (!want) return true;
  if (!offer.country) return false;
  // Feed may give "US", "US,CA", or "United States".
  return offer.country
    .split(/[,\/|;]/)
    .map((c) => c.trim().toUpperCase())
    .some((c) => c === want.toUpperCase() || c.startsWith(want.toUpperCase()));
}

function typeTokens(s) {
  return new Set(
    String(s)
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean)
  );
}

/**
 * The feed labels the same category as "Email/Zip Submit", "Email Submit", or
 * "Zip Submit" depending on the advertiser, so treat one token set as a match
 * when it is a subset of the other. "Pin Submit" and "Mobile Install" still fail.
 */
function matchesType(offer, want) {
  if (!want) return true;
  const a = typeTokens(offer.offer_type);
  const b = typeTokens(want);
  if (!a.size) return false;
  const subset = (x, y) => [...x].every((t) => y.has(t));
  return subset(a, b) || subset(b, a);
}

function hasEpc(offer) {
  return offer.epc !== null && offer.epc > 0;
}

/**
 * Net EPC is the ranking signal. Payout is a fallback, not a substitute: a $0.90
 * payout is not comparable to a $0.42 EPC, so offers with a reported EPC form the
 * first tier and unmeasured offers sort by payout underneath them.
 */
function rankScore(offer) {
  return hasEpc(offer) ? offer.epc : offer.payout;
}

function compareOffers(a, b) {
  if (hasEpc(a) !== hasEpc(b)) return hasEpc(a) ? -1 : 1;
  return rankScore(b) - rankScore(a);
}

function selectOffers(all) {
  const normalized = all.map(normalize).filter((o) => o.link);
  const filtered = normalized.filter(
    (o) => matchesCountry(o, CONFIG.country) && matchesType(o, CONFIG.offerType) && o.payout >= CONFIG.minPayout
  );
  filtered.sort(compareOffers);
  return { normalized, filtered, top: filtered.slice(0, CONFIG.limit) };
}

async function main() {
  if (!CONFIG.privateKey) {
    console.error(
      'Missing CPAGRIP_PRIVATE_KEY.\n' +
        'Get it from CPAGrip -> Tools -> API / Offer Feed, then:\n' +
        '  PowerShell:  $env:CPAGRIP_PRIVATE_KEY = "your_key"\n' +
        '  bash:        export CPAGRIP_PRIVATE_KEY=your_key'
    );
    process.exit(1);
  }

  const json = await fetchFeed();
  const info = generalInfo(json);
  const all = extractOffers(json);
  const { normalized, filtered, top } = selectOffers(all);

  // An empty feed is not an error, so say why it came back empty.
  if (all.length === 0) {
    console.log('feed returned zero offers.');
    if (info.country_code) {
      console.log(`  CPAGrip resolved your request as country=${info.country_code} (${info.country_detection_method || 'unknown method'})`);
      if (CONFIG.country && info.country_code !== CONFIG.country) {
        console.log(`  requested country=${CONFIG.country}; if the key were rejected the feed falls back to your own IP geo`);
      }
    }
    console.log(`  full response saved to ${CONFIG.rawFile}`);
  }

  const payload = {
    generated_at: new Date().toISOString(),
    filters: {
      country: CONFIG.country,
      offer_type: CONFIG.offerType,
      min_payout: CONFIG.minPayout,
    },
    counts: { fetched: all.length, matched: filtered.length, returned: top.length },
    offers: top.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      payout: Number(o.payout.toFixed(2)),
      epc: o.epc === null ? null : Number(o.epc.toFixed(3)),
      offer_type: o.offer_type,
      country: o.country,
      link: o.link,
    })),
  };

  fs.mkdirSync(path.dirname(CONFIG.outFile), { recursive: true });
  fs.writeFileSync(CONFIG.outFile, JSON.stringify(payload, null, 2));

  console.log(`fetched ${all.length} offers, ${filtered.length} matched filters, wrote top ${top.length}`);
  console.log(`-> ${CONFIG.outFile}`);
  if (filtered.length === 0 && normalized.length > 0) {
    const types = [...new Set(normalized.map((o) => o.offer_type).filter(Boolean))];
    console.log(`no matches. offer_type values present in feed: ${types.join(' | ') || '(none)'}`);
  }
  for (const o of payload.offers) {
    console.log(`  $${o.payout.toFixed(2)}  epc=${o.epc ?? 'n/a'}  ${o.title}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`fetch_offers failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { CONFIG, normalize, selectOffers, extractOffers, matchesCountry, matchesType, rankScore, compareOffers };
