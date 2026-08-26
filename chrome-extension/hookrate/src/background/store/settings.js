// Settings: feature toggles + RPM overrides. One key, whole object.

const KEY = 'hr:settings';

export const DEFAULTS = {
  features: {
    channelPanel: true,
    watchOverlay: true,
    shortsOverlay: true,
    homeFilter: true,
    homeOutliers: true,
    searchAnnotations: true,
    titleTester: true,
    monetizationCheck: true,
    similarPanel: true,
    transcriptPanel: true,
    sentimentPanel: true,
    studioTools: true,
  },
  homeFilter: {
    enabled: false,
    minViews: 0,
    maxViews: 0,
    maxAgeDays: 0,
    minDurationSec: 0,
    maxDurationSec: 0,
    hideWatched: false,
    hideShorts: false,
  },
  rpm: {
    baseRPM: {},
    geoMultiplier: {},
  },
  tracker: {
    periodMinutes: 360,
  },

  /**
   * Where channel and video data comes from.
   *
   *   'page'   — read youtube.com pages. Everything works. This is against
   *              YouTube's Terms, which prohibit automated access.
   *   'api'    — use the official Data API with the user's own key, and fall
   *              back to page reads only for what the API cannot provide.
   *   'strict' — API only. Features the API cannot serve are switched off
   *              rather than quietly falling back. Fully within the Terms.
   */
  data: {
    source: 'page',
    apiKey: '',
  },
  ui: {
    compact: false,
    accent: '#ff4d3d',
  },
  privacy: {
    // Server-side lookups hit youtube.com from the extension with no cookies.
    // Nothing is sent anywhere else. Kept as an explicit, visible switch.
    allowBackgroundLookups: true,
  },
};

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k in patch) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k] || {}, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export async function get() {
  const bag = await chrome.storage.local.get(KEY);
  return deepMerge(DEFAULTS, bag[KEY] || {});
}

export async function set(patch) {
  const merged = deepMerge(await get(), patch);
  await chrome.storage.local.set({ [KEY]: merged });
  return merged;
}

export async function reset() {
  await chrome.storage.local.remove(KEY);
  return DEFAULTS;
}

export { KEY };
