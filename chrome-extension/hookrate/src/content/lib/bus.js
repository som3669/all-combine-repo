// Message bus to the service worker. Every background call goes through here.

(() => {
  const HR = (window.HR = window.HR || {});

  // In-flight de-duplication: two panels asking for the same channel during
  // one page view should cost one fetch, not two.
  const inFlight = new Map();

  function key(action, payload) {
    return `${action}:${JSON.stringify(payload || {})}`;
  }

  /**
   * Call the worker.
   * @returns {Promise<any>} resolves with `data`, rejects with an Error.
   */
  HR.send = function send(action, payload = {}, { dedupe = true } = {}) {
    const k = key(action, payload);
    if (dedupe && inFlight.has(k)) return inFlight.get(k);

    const flight = new Promise((resolve, reject) => {
      let settled = false;
      try {
        chrome.runtime.sendMessage({ action, payload }, (res) => {
          settled = true;
          const lastError = chrome.runtime.lastError;
          if (lastError) return reject(new Error(lastError.message));
          if (!res) return reject(new Error('no response from background'));
          if (!res.ok) return reject(new Error(res.error || 'request failed'));
          resolve(res.data);
        });
      } catch (err) {
        // Extension reloaded mid-session: the port is gone.
        return reject(new Error(`extension context lost: ${err.message}`));
      }
      // Guard against a worker that dies without replying.
      setTimeout(() => {
        if (!settled) reject(new Error('background timed out'));
      }, 45000);
    }).finally(() => {
      if (dedupe) inFlight.delete(k);
    });

    if (dedupe) inFlight.set(k, flight);
    return flight;
  };

  /** Settings, cached for the life of the page view. */
  let settingsCache = null;
  HR.settings = async function settings(force = false) {
    if (!settingsCache || force) settingsCache = HR.send('settings.get');
    return settingsCache;
  };

  HR.saveSettings = async function saveSettings(patch) {
    settingsCache = null;
    const next = await HR.send('settings.set', { patch });
    settingsCache = Promise.resolve(next);
    document.dispatchEvent(new CustomEvent('hookrate:settings', { detail: next }));
    return next;
  };

  HR.enabled = async function enabled(feature) {
    const s = await HR.settings();
    return s.features?.[feature] !== false;
  };
})();
