// Revenue estimation.
//
// These are ESTIMATES, and every competitor's numbers are too. There is no
// public API for another channel's RPM. The model is:
//
//   revenue = views/1000 × baseRPM(category) × geoMultiplier(country)
//
// baseRPM values are US-weighted long-form averages drawn from public creator
// benchmarks. Users can override any of them in Options.

export const BASE_RPM = {
  finance: 14.0,
  insurance: 15.0,
  'real estate': 12.0,
  business: 9.0,
  luxury: 8.0,
  technology: 7.0,
  education: 6.0,
  health: 5.5,
  science: 5.2,
  'how-to & style': 5.0,
  'autos & vehicles': 5.0,
  history: 4.6,
  travel: 4.5,
  motivation: 4.2,
  'true crime': 4.0,
  food: 4.0,
  news: 3.5,
  pets: 3.2,
  sports: 3.0,
  comedy: 2.6,
  gaming: 2.5,
  entertainment: 2.2,
  music: 1.8,
  kids: 1.2,
  default: 3.5,
};

export const GEO_MULTIPLIER = {
  US: 1.0, NO: 1.05, CH: 1.0, DK: 0.95, AU: 0.92, CA: 0.88, GB: 0.86,
  SE: 0.85, NL: 0.84, DE: 0.82, NZ: 0.8, IE: 0.78, AT: 0.78, BE: 0.75,
  FI: 0.75, FR: 0.68, IT: 0.55, ES: 0.52, JP: 0.5, KR: 0.45, IL: 0.5,
  AE: 0.55, SA: 0.45, SG: 0.6, HK: 0.55, TW: 0.4, PL: 0.35, PT: 0.4,
  CZ: 0.35, GR: 0.3, TR: 0.18, MX: 0.25, BR: 0.2, AR: 0.15, CO: 0.16,
  CL: 0.22, RU: 0.2, UA: 0.15, ZA: 0.28, EG: 0.12, NG: 0.12, KE: 0.14,
  IN: 0.18, PK: 0.12, BD: 0.1, ID: 0.15, PH: 0.15, VN: 0.14, TH: 0.18,
  MY: 0.3, CN: 0.2, default: 0.35,
};

// Shorts monetise via a separate revenue-share pool. Flat and much lower.
export const SHORTS_RPM = 0.1;

function normaliseCategory(raw) {
  const s = String(raw || '').toLowerCase();
  for (const key of Object.keys(BASE_RPM)) {
    if (key !== 'default' && s.includes(key)) return key;
  }
  // A few common aliases YouTube uses that don't match the table verbatim.
  if (/people|blog|vlog/.test(s)) return 'entertainment';
  if (/film|animation|trailer/.test(s)) return 'entertainment';
  if (/nonprofit|activism|politic/.test(s)) return 'news';
  if (/fitness|workout|nutrition|medical/.test(s)) return 'health';
  if (/crypto|invest|stock|money|trading/.test(s)) return 'finance';
  if (/software|coding|ai|gadget|review/.test(s)) return 'technology';
  return 'default';
}

export function rpmFor({ category, country, overrides = {} }) {
  const cat = normaliseCategory(category);
  const base = overrides.baseRPM?.[cat] ?? BASE_RPM[cat] ?? BASE_RPM.default;
  const geo =
    overrides.geoMultiplier?.[country] ??
    GEO_MULTIPLIER[country] ??
    GEO_MULTIPLIER.default;
  return { category: cat, base, geo, rpm: +(base * geo).toFixed(2) };
}

/**
 * Estimate revenue for a view count.
 * Returned as a range because a point estimate is false precision:
 * fill rate, ad formats and seasonality move real RPM ±40%.
 */
export function revenue(views, opts = {}) {
  if (!Number.isFinite(views) || views <= 0) return null;
  const { rpm, category, base, geo } = opts.shorts
    ? { rpm: SHORTS_RPM, category: 'shorts', base: SHORTS_RPM, geo: 1 }
    : rpmFor(opts);

  const mid = (views / 1000) * rpm;
  return {
    category,
    baseRPM: base,
    geoMultiplier: geo,
    rpm,
    low: +(mid * 0.6).toFixed(2),
    mid: +mid.toFixed(2),
    high: +(mid * 1.4).toFixed(2),
  };
}
