// YouTube Studio: mid-roll ad break helper.
//
// Honest about its limits. Studio's DOM is unstable and unversioned, so this
// does the safe part deterministically (compute a break schedule, put it on
// the clipboard) and only *attempts* the click-through, reporting when the
// control it needs is not on the page.

(() => {
  const HR = (window.HR = window.HR || {});
  const el = HR.el;
  const PANEL_ID = 'hr-studio-panel';

  /**
   * Suggested mid-roll positions.
   * Rules that come from how mid-rolls actually behave:
   *   - nothing in the first 120s (viewers are still deciding)
   *   - nothing in the last 60s (skipped, and it hurts retention)
   *   - one every `everySec`, nudged off round numbers so a break never lands
   *     exactly on a likely cut point
   */
  function schedule(lengthSec, { everySec = 240, leadIn = 120, tailOff = 60 } = {}) {
    if (!Number.isFinite(lengthSec) || lengthSec < leadIn + tailOff + 60) return [];
    const out = [];
    for (let t = leadIn; t <= lengthSec - tailOff; t += everySec) {
      out.push(Math.round(t + 3));
    }
    return out;
  }

  function stamp(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /** Read the video length from whatever Studio has rendered. */
  function videoLength() {
    const text = [...document.querySelectorAll('*')]
      .slice(0, 4000)
      .map((n) => (n.children.length === 0 ? n.textContent.trim() : ''))
      .find((t) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(t));
    if (!text) return null;
    return text.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
  }

  /** Best-effort click on Studio's own automatic-placement control. */
  function tryAutoPlace() {
    const candidates = [...document.querySelectorAll('button, tp-yt-paper-button, ytcp-button')];
    const target = candidates.find((b) =>
      /place\s*(ad\s*breaks?)?\s*automatically|auto[- ]?place/i.test(b.textContent || '')
    );
    if (!target) {
      HR.ui.toast('Studio’s automatic-placement button is not on this page', { kind: 'bad' });
      return false;
    }
    target.click();
    HR.ui.toast('Clicked Studio’s automatic placement', { kind: 'good' });
    return true;
  }

  function panelBody(lengthSec) {
    const everySec = el('input.hr-input', { type: 'number', value: '240', min: '60' });
    const out = el('div.hr-note');

    const compute = () => {
      const list = schedule(lengthSec, { everySec: Number(everySec.value) || 240 });
      out.replaceChildren(
        list.length
          ? el('div', {}, [
              el('strong', { text: `${list.length} breaks: ` }),
              el('span', { text: list.map(stamp).join(', ') }),
            ])
          : el('span', { text: 'Video too short for mid-rolls under these rules.' })
      );
      return list;
    };

    const list = compute();
    everySec.addEventListener('input', compute);

    return [
      el('div.hr-note', {
        text: lengthSec
          ? `Detected length ${stamp(lengthSec)}. Breaks skip the first 2 minutes and the last minute.`
          : 'Could not read the video length from this page — enter it in the box below.',
      }),
      el('div.hr-form-row', {}, [
        el('label.hr-field', {}, [el('span', { text: 'Every (seconds)' }), everySec]),
        HR.ui.button('Copy timestamps', () => {
          const current = compute();
          HR.ui.copy(current.map(stamp).join('\n'), `${current.length} timestamps copied`);
        }, { kind: 'solid' }),
        HR.ui.button('Try auto-place', tryAutoPlace, {
          title: 'Clicks Studio’s own control if it is present. Experimental.',
        }),
      ]),
      out,
      el('div.hr-note.hr-muted', {
        text: 'Hookrate does not inject breaks directly — Studio has no stable API for that, and faking clicks into a monetisation form is a bad idea. Copy the schedule and place them, or use Studio’s automatic option.',
      }),
    ];
  }

  async function mount() {
    if (!(await HR.enabled('studioTools'))) return;
    if (!/\/video\/[\w-]+\/(monetization|editor)/.test(location.pathname)) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }

    const anchor = await HR.waitFor('#main, ytcp-content, body');
    if (!anchor || document.getElementById(PANEL_ID)) return;

    const panel = HR.ui.panel({ id: PANEL_ID, title: 'Hookrate — ad break helper' });
    panel.setBody(...panelBody(videoLength()));
    anchor.insertAdjacentElement('afterbegin', panel.root);
  }

  // Studio is also an SPA; poll the path cheaply rather than guessing its events.
  let lastPath = '';
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      mount();
    }
  }, 1200);

  mount();

  HR.features = HR.features || {};
  HR.features.studio = { mount, schedule };
})();
