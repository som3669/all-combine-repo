// Settings page.

const send = (action, payload = {}) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, payload }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!res) return reject(new Error('no response'));
      if (!res.ok) return reject(new Error(res.error));
      resolve(res.data);
    });
  });

const $ = (s) => document.querySelector(s);

const FEATURE_LABELS = {
  channelPanel: 'Channel analytics panel',
  watchOverlay: 'Watch page stats',
  shortsOverlay: 'Shorts overlay',
  homeFilter: 'Home feed filter bar',
  homeOutliers: 'Feed outlier badges',
  searchAnnotations: 'Search result annotations',
  titleTester: 'Thumbnail & title tester',
  monetizationCheck: 'Monetization detection',
  similarPanel: 'Similar channels / videos',
  transcriptPanel: 'Transcript panel',
  sentimentPanel: 'Comment sentiment',
  studioTools: 'Studio ad-break helper',
};

let settings = null;

function flash(message = 'Saved') {
  $('#saved').textContent = message;
  setTimeout(() => ($('#saved').textContent = ''), 1600);
}

async function save(patch) {
  settings = await send('settings.set', { patch });
  flash();
  // Tell open YouTube tabs to re-apply.
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { action: 'content.remount' }, () => void chrome.runtime.lastError);
  }
}

function renderFeatures() {
  const host = $('#features');
  host.replaceChildren();

  for (const [key, label] of Object.entries(FEATURE_LABELS)) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = settings.features?.[key] !== false;
    input.addEventListener('change', () => save({ features: { [key]: input.checked } }));

    const wrap = document.createElement('label');
    wrap.className = 'toggle';
    wrap.append(input, document.createTextNode(label));
    host.append(wrap);
  }
}

function renderRpm(defaults) {
  const host = $('#rpm');
  host.replaceChildren();

  for (const [category, base] of Object.entries(defaults)) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.min = '0';
    input.placeholder = String(base);
    const override = settings.rpm?.baseRPM?.[category];
    if (override != null) input.value = override;

    input.addEventListener('change', () => {
      const value = input.value === '' ? undefined : Number(input.value);
      save({ rpm: { baseRPM: { [category]: value } } });
    });

    const label = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = `${category} (default $${base})`;
    label.append(span, input);
    host.append(label);
  }
}

async function init() {
  if (new URL(location.href).searchParams.get('welcome')) $('#welcome').hidden = false;

  settings = await send('settings.get');
  renderFeatures();

  // The RPM table lives in the background module — read it rather than keeping
  // a second copy here that can drift out of sync.
  const { baseRPM: defaults } = await send('rpm.defaults');
  renderRpm(defaults);

  $('#period').value = settings.tracker?.periodMinutes ?? 360;
  $('#period').addEventListener('change', (e) =>
    save({ tracker: { periodMinutes: Math.max(30, Number(e.target.value) || 360) } })
  );

  $('#clear').addEventListener('click', async () => {
    const { cleared } = await send('cache.clear');
    flash(`Cleared ${cleared} cached entries`);
  });

  $('#reset').addEventListener('click', async () => {
    if (!confirm('Reset all Hookrate settings to defaults? Your swipe file is not touched.')) return;
    settings = await send('settings.reset');
    renderFeatures();
    renderRpm(defaults);
    flash('Settings reset');
  });

  $('#swipe').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('src/swipe/swipe.html') })
  );
}

init();
