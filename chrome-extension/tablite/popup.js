/**
 * TabLite popup dashboard.
 *
 * Renders the current tabs with their status, lets the user whitelist tabs,
 * adjust the idle threshold, toggle auto-suspend, suspend everything on demand,
 * and shows an estimated memory-savings figure.
 */

const DEFAULT_SETTINGS = {
  thresholdMinutes: 10,
  whitelist: [],
  enabled: true,
};

// Cached at load; the background worker owns the canonical value.
let mbPerTab = 100;

// --- element refs ---
const els = {
  enabledToggle: document.getElementById('enabledToggle'),
  savingsValue: document.getElementById('savingsValue'),
  savingsSub: document.getElementById('savingsSub'),
  thresholdRange: document.getElementById('thresholdRange'),
  thresholdValue: document.getElementById('thresholdValue'),
  suspendAllBtn: document.getElementById('suspendAllBtn'),
  tabList: document.getElementById('tabList'),
  tabCount: document.getElementById('tabCount'),
};

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function updateSettings(patch) {
  await chrome.storage.local.set(patch);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function statusFor(tab, whitelist) {
  const url = tab.url || tab.pendingUrl || '';
  if (whitelist.includes(url)) return { key: 'excluded', label: 'Excluded' };
  if (tab.discarded) return { key: 'suspended', label: 'Suspended' };
  return { key: 'active', label: 'Active' };
}

function faviconFor(tab) {
  // Fall back to a neutral globe glyph rendered as a data URI when a tab has
  // no favicon (e.g. discarded tabs sometimes drop it).
  return tab.favIconUrl && /^https?:|^data:/.test(tab.favIconUrl)
    ? tab.favIconUrl
    : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="%239aa2af" stroke-width="1.5"/></svg>';
}

async function render() {
  const settings = await getSettings();

  // Sync top-level controls.
  els.enabledToggle.checked = settings.enabled;
  els.thresholdRange.value = settings.thresholdMinutes;
  els.thresholdValue.textContent = settings.thresholdMinutes;

  const tabs = await chrome.tabs.query({});
  els.tabCount.textContent = `${tabs.length} open`;

  // Update savings estimate based on how many tabs are currently discarded.
  const suspendedCount = tabs.filter((t) => t.discarded).length;
  renderSavings(suspendedCount);

  // Build the list.
  els.tabList.innerHTML = '';
  for (const tab of tabs) {
    const status = statusFor(tab, settings.whitelist);
    const url = tab.url || tab.pendingUrl || '';

    const li = document.createElement('li');
    li.className = 'tab-item';

    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = faviconFor(tab);
    img.onerror = () => { img.src = faviconFor({}); };

    const meta = document.createElement('div');
    meta.className = 'tab-meta';
    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title || url || 'Untitled';
    title.title = url;
    const statusEl = document.createElement('div');
    statusEl.className = `tab-status status-${status.key}`;
    statusEl.textContent = status.label;
    meta.append(title, statusEl);

    // Per-tab whitelist toggle (checked = excluded from suspension).
    const toggle = document.createElement('label');
    toggle.className = 'row-toggle';
    toggle.title = 'Never suspend this tab';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = settings.whitelist.includes(url);
    cb.addEventListener('change', () => toggleWhitelist(url, cb.checked));
    const sw = document.createElement('span');
    sw.className = 'switch';
    toggle.append(cb, sw);

    li.append(img, meta, toggle);

    // Clicking the row (not the toggle) focuses that tab.
    li.addEventListener('click', (e) => {
      if (e.target.closest('.row-toggle')) return;
      chrome.tabs.update(tab.id, { active: true });
      if (typeof tab.windowId === 'number') {
        chrome.windows.update(tab.windowId, { focused: true });
      }
    });

    els.tabList.append(li);
  }
}

async function renderSavings(suspendedCount) {
  const estMb = suspendedCount * mbPerTab;
  els.savingsValue.textContent = `~${estMb} MB`;

  // Show real system memory context when available.
  try {
    const info = await chrome.system.memory.getInfo();
    const availMb = Math.round(info.availableCapacity / (1024 * 1024));
    els.savingsSub.textContent =
      `${suspendedCount} tab${suspendedCount === 1 ? '' : 's'} suspended · ${availMb} MB free`;
  } catch {
    els.savingsSub.textContent =
      `${suspendedCount} tab${suspendedCount === 1 ? '' : 's'} suspended`;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function toggleWhitelist(url, add) {
  if (!url) return;
  const { whitelist } = await getSettings();
  const set = new Set(whitelist);
  if (add) set.add(url);
  else set.delete(url);
  await updateSettings({ whitelist: [...set] });
  render();
}

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

// --- wire up controls ---

els.enabledToggle.addEventListener('change', () => {
  updateSettings({ enabled: els.enabledToggle.checked });
});

els.thresholdRange.addEventListener('input', () => {
  els.thresholdValue.textContent = els.thresholdRange.value;
});
els.thresholdRange.addEventListener('change', () => {
  updateSettings({ thresholdMinutes: Number(els.thresholdRange.value) });
});

els.suspendAllBtn.addEventListener('click', async () => {
  els.suspendAllBtn.disabled = true;
  els.suspendAllBtn.textContent = 'Suspending…';
  const res = await sendMessage({ type: 'SUSPEND_ALL' });
  const n = res?.discarded ?? 0;
  els.suspendAllBtn.textContent = `Suspended ${n} tab${n === 1 ? '' : 's'}`;
  setTimeout(() => {
    els.suspendAllBtn.disabled = false;
    els.suspendAllBtn.textContent = 'Suspend All Inactive Tabs Now';
    render();
  }, 1200);
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

(async function init() {
  const est = await sendMessage({ type: 'GET_ESTIMATE_PER_TAB' });
  if (est?.mbPerTab) mbPerTab = est.mbPerTab;
  render();
})();
