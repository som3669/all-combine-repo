// Shorts: a compact metrics overlay that follows the active reel.
//
// Shorts are scored against the channel's SHORTS baseline only. Mixing them
// with long-form makes every Short look like a breakout hit.

(() => {
  const HR = (window.HR = window.HR || {});
  const el = HR.el;
  const OVERLAY_ID = 'hr-shorts-overlay';

  let lastId = null;
  let stopObserving = null;

  function row(label, value, tone) {
    return el('div.hr-mini-row', {}, [
      el('span.hr-mini-label', { text: label }),
      el('span', { class: tone ? `hr-mini-value hr-${tone}` : 'hr-mini-value', text: value }),
    ]);
  }

  function overlay() {
    let node = document.getElementById(OVERLAY_ID);
    if (node) return node;
    node = el('div.hr-mini', { id: OVERLAY_ID }, [
      el('div.hr-mini-head', {}, [
        el('span.hr-dot'),
        el('span', { text: 'Hookrate' }),
        el('button.hr-mini-close', {
          type: 'button',
          text: '✕',
          title: 'Hide until reload',
          onclick: () => {
            node.remove();
            stopObserving?.();
          },
        }),
      ]),
      el('div.hr-mini-body'),
    ]);
    document.body.append(node);
    return node;
  }

  async function render(videoId) {
    const node = overlay();
    const body = node.querySelector('.hr-mini-body');
    body.replaceChildren(el('div.hr-mini-row', { text: 'Loading…' }));

    try {
      const v = await HR.send('video.stats', { videoId, withChannel: true });
      body.replaceChildren(
        row('Views', HR.fmt.n(v.views)),
        row('Views/hr', HR.fmt.n(v.viewsPerHour)),
        row(
          'vs shorts median',
          v.outlier ? HR.fmt.multiplier(v.outlier.multiplier) : '—',
          v.outlier && v.outlier.multiplier >= 2.5 ? 'good' : null
        ),
        row('Likes', HR.fmt.n(v.likes)),
        row('Engagement', v.engagementRate == null ? '—' : `${v.engagementRate}%`),
        row('Est. revenue', HR.fmt.range(v.revenue)),
        row('Age', v.publishedAt ? HR.fmt.ago(v.publishedAt) : '—'),
        el('div.hr-mini-actions', {}, [
          HR.ui.button('Save', () => HR.features.watch.saveVideo({ ...v, isShort: true })),
          HR.ui.button('Thumb', () =>
            HR.send('download.thumbnail', { videoId })
              .then(() => HR.ui.toast('Saved', { kind: 'good' }))
              .catch((e) => HR.ui.toast(e.message, { kind: 'bad' }))
          ),
          HR.ui.button('Frame', () => HR.features.watch.screenshot(videoId)),
        ])
      );
    } catch (err) {
      body.replaceChildren(el('div.hr-mini-row.hr-bad', { text: err.message }));
    }
  }

  /** Shorts swap without a full navigation, so watch the DOM as well as the URL. */
  function watchActiveReel() {
    stopObserving?.();
    const host = HR.qs('ytd-shorts') || document.body;
    stopObserving = HR.observe(
      host,
      () => {
        const id = HR.page.videoId();
        if (id && id !== lastId) {
          lastId = id;
          render(id);
        }
      },
      { wait: 400 }
    );
  }

  async function mount() {
    if (!(await HR.enabled('shortsOverlay'))) return;
    const videoId = HR.page.videoId();
    if (!videoId) return;
    lastId = videoId;
    await render(videoId);
    watchActiveReel();
  }

  function unmount() {
    stopObserving?.();
    stopObserving = null;
    lastId = null;
    document.getElementById(OVERLAY_ID)?.remove();
  }

  HR.features = HR.features || {};
  HR.features.shorts = { mount, unmount, OVERLAY_ID };
})();
