// Router: YouTube is a single-page app, so features mount and unmount on
// navigation events rather than on page load.

(() => {
  const HR = (window.HR = window.HR || {});

  let current = null;
  let lastUrl = location.href;

  const MOUNTS = {
    channel: () => HR.features.channel.mount(),
    watch: () => HR.features.watch.mount(),
    shorts: () => HR.features.shorts.mount(),
    home: () => HR.features.home.mount(),
    search: () => HR.features.search.mount(),
  };

  function unmountAll() {
    HR.features.shorts?.unmount?.();
    HR.features.home?.unmount?.();
    HR.features.search?.unmount?.();
    // The channel feature hides YouTube's own content while its Analysis tab
    // is open, so it must be given the chance to put it back.
    HR.features.channel?.unmount?.();
    document.getElementById(HR.features.watch?.PANEL_ID)?.remove();
    document.querySelectorAll('.hr-modal-backdrop').forEach((n) => n.remove());
  }

  async function route(reason) {
    const type = HR.page.type();
    const url = location.href;

    // Same page type AND same target: nothing to do. Guards against the
    // several redundant navigate events YouTube fires per transition.
    if (current === type && url === lastUrl) return;

    lastUrl = url;
    // Rebuild whether or not the page type changed: a new channel or video of
    // the same type still needs fresh panels.
    unmountAll();
    current = type;
    HR.log('route', { type, reason });

    const mount = MOUNTS[type];
    if (!mount) return;
    try {
      await mount();
    } catch (err) {
      HR.log('mount failed', type, err);
    }
  }

  const routeSoon = HR.debounce((reason) => route(reason), 220);

  // YouTube's own navigation event — the most reliable signal.
  document.addEventListener('yt-navigate-finish', () => routeSoon('yt-navigate-finish'));
  document.addEventListener('yt-page-data-updated', () => routeSoon('yt-page-data-updated'));

  // Shorts scrolling rewrites the URL without firing a navigate event.
  window.addEventListener('popstate', () => routeSoon('popstate'));

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function patched(...args) {
      const result = original.apply(this, args);
      routeSoon(method);
      return result;
    };
  }

  // Settings changes should take effect without a reload.
  document.addEventListener('hookrate:settings', () => {
    current = null;
    routeSoon('settings');
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.action === 'content.remount') {
      current = null;
      routeSoon('remount');
    }
  });

  route('initial');
})();
