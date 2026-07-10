/**
 * TabLite — background service worker (Manifest V3)
 *
 * Responsibilities:
 *   1. Track the last-active timestamp for every tab.
 *   2. On a 1-minute alarm, discard tabs that have been idle longer than the
 *      user-configured threshold (chrome.tabs.discard preserves title, favicon
 *      and scroll position, so tabs restore cleanly when re-selected).
 *   3. Never discard protected tabs (see isDiscardable()).
 *
 * NOTE ON PERSISTENCE:
 *   MV3 service workers are frequently torn down, so we cannot rely on
 *   in-memory globals surviving between events. All state that must live
 *   across restarts (settings + per-tab timestamps) is kept in
 *   chrome.storage.local and re-read on demand.
 */

const ALARM_NAME = 'tablite-sweep';
const SWEEP_PERIOD_MINUTES = 1;

// Rough average RAM reclaimed per suspended tab. Chrome does not expose true
// per-tab memory, so this heuristic is only used for the "you're saving ~X MB"
// estimate shown in the popup. Kept here so it is easy to tune in one place.
const ESTIMATED_MB_PER_TAB = 100;

const DEFAULT_SETTINGS = {
  thresholdMinutes: 10, // discard tabs idle longer than this
  whitelist: [],        // array of tab URLs the user never wants suspended
  enabled: true,        // master on/off for auto-suspend
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/** Returns merged settings (stored values on top of defaults). */
async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** Read the { tabId: timestamp } map of last-active times. */
async function getLastActiveMap() {
  const { lastActive } = await chrome.storage.local.get({ lastActive: {} });
  return lastActive;
}

/** Mark a tab as active "now". */
async function touchTab(tabId) {
  if (typeof tabId !== 'number') return;
  const lastActive = await getLastActiveMap();
  lastActive[tabId] = Date.now();
  await chrome.storage.local.set({ lastActive });
}

/** Forget a tab we no longer track (closed tabs). */
async function forgetTab(tabId) {
  const lastActive = await getLastActiveMap();
  if (tabId in lastActive) {
    delete lastActive[tabId];
    await chrome.storage.local.set({ lastActive });
  }
}

// ---------------------------------------------------------------------------
// Discard eligibility
// ---------------------------------------------------------------------------

/**
 * Decide whether a tab is safe to discard.
 *
 * We deliberately skip:
 *   - the active/focused tab
 *   - pinned tabs
 *   - tabs currently playing audio
 *   - tabs already discarded
 *   - browser-internal pages (chrome://, edge://, about:, extension pages,
 *     devtools, and the new-tab page) which cannot be meaningfully discarded
 *   - user-whitelisted URLs
 *
 * Unsaved form input: Chrome offers no API to detect dirty forms from a
 * service worker without an injected content script (which would require the
 * "scripting" permission this MVP intentionally omits). This is therefore a
 * documented best-effort gap — see README. Whitelisting a tab is the reliable
 * way to protect in-progress form input today.
 */
function isDiscardable(tab, whitelist) {
  if (!tab || typeof tab.id !== 'number') return false;
  if (tab.active) return false;
  if (tab.pinned) return false;
  if (tab.audible) return false;
  if (tab.discarded) return false;

  const url = tab.url || tab.pendingUrl || '';
  if (!url) return false;

  // Browser-internal / privileged pages cannot be usefully discarded.
  if (/^(chrome|edge|brave|about|chrome-extension|moz-extension|devtools|view-source):/i.test(url)) {
    return false;
  }

  if (whitelist.includes(url)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Core sweep
// ---------------------------------------------------------------------------

/**
 * Discard eligible tabs.
 * @param {boolean} ignoreThreshold - if true (manual "suspend all"), discard
 *   every eligible tab regardless of how long it has been idle.
 * @returns {Promise<number>} number of tabs discarded this pass
 */
async function sweep(ignoreThreshold = false) {
  const { thresholdMinutes, whitelist, enabled } = await getSettings();

  // Manual sweeps run even when auto-suspend is disabled; automatic sweeps
  // (from the alarm) respect the master switch.
  if (!enabled && !ignoreThreshold) return 0;

  const thresholdMs = thresholdMinutes * 60 * 1000;
  const now = Date.now();
  const lastActive = await getLastActiveMap();

  const tabs = await chrome.tabs.query({});
  let discarded = 0;

  for (const tab of tabs) {
    if (!isDiscardable(tab, whitelist)) continue;

    // If we have never recorded activity for this tab, seed it now so it isn't
    // discarded until it has actually been idle for a full threshold window.
    const last = lastActive[tab.id];
    if (last === undefined) {
      lastActive[tab.id] = now;
      continue;
    }

    if (ignoreThreshold || now - last >= thresholdMs) {
      try {
        await chrome.tabs.discard(tab.id);
        discarded++;
      } catch (err) {
        // Tab may have been closed or navigated mid-sweep; safe to ignore.
        console.debug('TabLite: discard failed for tab', tab.id, err?.message);
      }
    }
  }

  // Persist any seeded timestamps from this pass.
  await chrome.storage.local.set({ lastActive });
  return discarded;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Seed timestamps for all currently open tabs so nothing is discarded instantly. */
async function seedExistingTabs() {
  const tabs = await chrome.tabs.query({});
  const lastActive = await getLastActiveMap();
  const now = Date.now();
  for (const tab of tabs) {
    if (typeof tab.id === 'number' && lastActive[tab.id] === undefined) {
      lastActive[tab.id] = now;
    }
  }
  await chrome.storage.local.set({ lastActive });
}

/** Ensure defaults exist and the recurring sweep alarm is scheduled. */
async function initialize() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...stored });
  await seedExistingTabs();
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: SWEEP_PERIOD_MINUTES });
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

// A tab becoming active means the user is looking at it right now.
chrome.tabs.onActivated.addListener(({ tabId }) => touchTab(tabId));

// Treat navigation / load completion as activity too, so a tab the user is
// actively driving isn't discarded just because focus events were missed.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.audible !== undefined) {
    touchTab(tabId);
  }
});

// Newly created tabs start their idle clock now.
chrome.tabs.onCreated.addListener((tab) => touchTab(tab.id));

// Clean up tracking for closed tabs.
chrome.tabs.onRemoved.addListener((tabId) => forgetTab(tabId));

// The recurring automatic sweep.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) sweep(false);
});

// ---------------------------------------------------------------------------
// Popup <-> worker messaging
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'SUSPEND_ALL': {
        const count = await sweep(true);
        sendResponse({ ok: true, discarded: count });
        break;
      }
      case 'PING':
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // keep the message channel open for the async response
});

// Expose constant for the popup's savings math without duplicating it.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'GET_ESTIMATE_PER_TAB') {
    sendResponse({ mbPerTab: ESTIMATED_MB_PER_TAB });
    return true;
  }
});
