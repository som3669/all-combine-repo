// UI kit for injected surfaces. Everything is prefixed `hr-` so YouTube's own
// styles cannot collide with ours, and ours cannot leak into theirs.

(() => {
  const HR = (window.HR = window.HR || {});
  const el = HR.el;

  HR.ui = {
    /**
     * A titled card. Returns { root, body, setBody, setStatus, remove }.
     * Cards are idempotent by `id`: injecting twice replaces, never stacks.
     */
    panel({ id, title, subtitle, actions = [], collapsible = true, collapsed = false }) {
      document.getElementById(id)?.remove();

      const body = el('div.hr-panel-body');
      const status = el('div.hr-panel-status');
      const caret = el('button.hr-caret', {
        type: 'button',
        title: 'Collapse',
        'aria-expanded': String(!collapsed),
        html: '&#9662;',
      });

      const head = el('div.hr-panel-head', {}, [
        el('div.hr-panel-titles', {}, [
          el('div.hr-panel-title', {}, [
            el('span.hr-dot'),
            el('span', { text: title }),
          ]),
          subtitle ? el('div.hr-panel-sub', { text: subtitle }) : null,
        ]),
        el('div.hr-panel-actions', {}, actions),
        collapsible ? caret : null,
      ]);

      const root = el('div.hr-panel', { id }, [head, status, body]);
      if (collapsed) root.classList.add('hr-collapsed');

      if (collapsible) {
        caret.addEventListener('click', () => {
          const now = root.classList.toggle('hr-collapsed');
          caret.setAttribute('aria-expanded', String(!now));
        });
      }

      return {
        root,
        body,
        setBody(...nodes) {
          body.replaceChildren(...nodes.flat().filter(Boolean));
        },
        setStatus(text, kind = 'info') {
          status.className = `hr-panel-status hr-${kind}`;
          status.textContent = text || '';
          status.style.display = text ? 'block' : 'none';
        },
        loading(label = 'Loading…') {
          body.replaceChildren(HR.ui.skeleton(4, label));
        },
        error(message) {
          body.replaceChildren(
            el('div.hr-error', {}, [
              el('strong', { text: 'Could not load. ' }),
              el('span', { text: message }),
            ])
          );
        },
        remove: () => root.remove(),
      };
    },

    skeleton(rows = 3, label = '') {
      return el(
        'div.hr-skeleton',
        {},
        [
          label ? el('div.hr-skeleton-label', { text: label }) : null,
          ...Array.from({ length: rows }, () => el('div.hr-skeleton-row')),
        ]
      );
    },

    /** Grid of label/value stats. `hint` renders as a tooltip. */
    stats(items) {
      return el(
        'div.hr-stats',
        {},
        items.filter(Boolean).map((s) =>
          el('div.hr-stat', { title: s.hint || '' }, [
            el('div.hr-stat-label', { text: s.label }),
            el('div.hr-stat-value', { text: s.value, class: s.tone ? `hr-stat-value hr-${s.tone}` : 'hr-stat-value' }),
            s.sub ? el('div.hr-stat-sub', { text: s.sub }) : null,
          ])
        )
      );
    },

    /** Outlier chip. Colour tracks the tier, so it reads at a glance. */
    outlier(score, { compact = false } = {}) {
      if (!score) return null;
      const label = compact
        ? HR.fmt.multiplier(score.multiplier)
        : `${HR.fmt.multiplier(score.multiplier)} vs median`;
      return el('span', {
        class: `hr-chip hr-tier-${score.tier}`,
        text: label,
        title: `${HR.fmt.multiplier(score.multiplier)} the channel's median (${HR.fmt.n(
          score.baselineMedian
        )}), robust z=${score.z}`,
      });
    },

    chip(text, kind = 'muted', title = '') {
      return el('span', { class: `hr-chip hr-chip-${kind}`, text, title });
    },

    button(label, onClick, { kind = 'ghost', title = '' } = {}) {
      return el('button', {
        type: 'button',
        class: `hr-btn hr-btn-${kind}`,
        text: label,
        title: title || label,
        onclick: onClick,
      });
    },

    /** Row for a video list: thumb, title, stats, outlier chip. */
    videoRow(video, { onSave } = {}) {
      const meta = [
        `${HR.fmt.n(video.views)} views`,
        video.publishedText || (video.publishedAt ? HR.fmt.ago(video.publishedAt) : null),
        video.durationSec ? HR.fmt.duration(video.durationSec) : null,
      ]
        .filter(Boolean)
        .join(' · ');

      return el('div.hr-row', {}, [
        el('a.hr-row-thumb', { href: `/watch?v=${video.videoId}` }, [
          el('img', { src: video.thumbnail, loading: 'lazy', alt: '' }),
        ]),
        el('div.hr-row-main', {}, [
          el('a.hr-row-title', { href: `/watch?v=${video.videoId}`, text: video.title }),
          el('div.hr-row-meta', { text: meta }),
        ]),
        el('div.hr-row-side', {}, [
          HR.ui.outlier(video.outlier, { compact: true }),
          onSave
            ? HR.ui.button('＋', () => onSave(video), { title: 'Save to swipe file' })
            : null,
        ]),
      ]);
    },

    /** Toast, bottom-right, self-dismissing. */
    toast(message, { kind = 'info', ms = 3200 } = {}) {
      let host = document.getElementById('hr-toasts');
      if (!host) {
        host = el('div', { id: 'hr-toasts' });
        document.body.append(host);
      }
      const node = el(`div.hr-toast.hr-${kind}`, { text: message });
      host.append(node);
      setTimeout(() => {
        node.classList.add('hr-toast-out');
        setTimeout(() => node.remove(), 300);
      }, ms);
      return node;
    },

    /** Modal with a backdrop. Returns { root, body, close }. */
    modal({ title, width = 720 }) {
      const body = el('div.hr-modal-body');
      const close = () => root.remove();
      const root = el('div.hr-modal-backdrop', { onclick: (e) => e.target === root && close() }, [
        el('div.hr-modal', { style: { maxWidth: `${width}px` } }, [
          el('div.hr-modal-head', {}, [
            el('div.hr-modal-title', { text: title }),
            HR.ui.button('✕', close, { title: 'Close' }),
          ]),
          body,
        ]),
      ]);
      document.body.append(root);

      const onKey = (e) => {
        if (e.key === 'Escape') {
          close();
          document.removeEventListener('keydown', onKey);
        }
      };
      document.addEventListener('keydown', onKey);
      return { root, body, close };
    },

    /** Small inline badge overlaid on a thumbnail in a feed. */
    thumbBadge(text, tier = 'normal') {
      return el('span', { class: `hr-thumb-badge hr-tier-${tier}`, text });
    },

    /** Copy helper with feedback, used by transcript + sponsor panels. */
    async copy(text, label = 'Copied') {
      try {
        await navigator.clipboard.writeText(text);
        HR.ui.toast(label, { kind: 'good' });
      } catch {
        HR.ui.toast('Clipboard blocked by the page', { kind: 'bad' });
      }
    },

    /**
     * True when this element lays its children out in a single horizontal
     * track, so a full-width child would consume the row.
     */
    rowContainer(node) {
      if (!node) return false;
      const s = getComputedStyle(node);
      if (s.display === 'flex' || s.display === 'inline-flex') {
        return !s.flexDirection.startsWith('column') && s.flexWrap === 'nowrap';
      }
      if (s.display === 'grid' || s.display === 'inline-grid') {
        return (
          s.gridAutoFlow.includes('column') ||
          s.gridTemplateColumns.split(/\s+/).filter(Boolean).length > 1
        );
      }
      return false;
    },

    /**
     * Insert `node` so it STACKS ABOVE `target` rather than beside it.
     *
     * Injecting next to one of YouTube's containers has broken the layout twice
     * — once on the home feed, once on search — because the parent was a
     * horizontal flex/grid track and our full-width bar ate the row, pushing
     * their content off-screen. So walk up past any row container first and
     * insert where block stacking actually applies.
     */
    insertAbove(node, target) {
      let ref = target;
      for (let hops = 0; hops < 5 && ref; hops++) {
        const parent = ref.parentElement;
        if (!parent) break;
        if (!HR.ui.rowContainer(parent)) {
          parent.insertBefore(node, ref);
          return node;
        }
        ref = parent; // parent is a row — step out and try its parent
      }
      target.insertAdjacentElement('beforebegin', node);
      return node;
    },

    /**
     * Match an injected element to the width and left edge of one of YouTube's
     * own elements.
     *
     * Why measure instead of hardcoding a max-width: the channel tab strip
     * (`tp-yt-paper-tabs#tabs`) is `scrollable`, so it sets no max-width of its
     * own — it fills its parent and scrolls. The real constraint lives on an
     * ancestor content column whose value moves with the viewport, the
     * collapsed/expanded sidebar, and whatever layout experiment the user is
     * bucketed into. Copying their measured box tracks all of that for free and
     * survives their next restyle.
     *
     * @returns {() => void} disconnect
     */
    alignTo(target, reference, { observe = true } = {}) {
      if (!target || !reference) return () => {};

      const sync = () => {
        const ref = reference.getBoundingClientRect();
        // A hidden or not-yet-laid-out reference measures 0. Leave our own
        // styles alone rather than collapsing to nothing.
        if (!ref.width) return;

        const parent = target.offsetParent || target.parentElement;
        const base = parent ? parent.getBoundingClientRect() : { left: 0 };

        target.style.boxSizing = 'border-box';
        target.style.width = `${Math.round(ref.width)}px`;
        target.style.maxWidth = '100%';
        target.style.marginLeft = `${Math.round(ref.left - base.left)}px`;
        target.style.marginRight = 'auto';
      };

      sync();
      if (!observe) return () => {};

      const ro = new ResizeObserver(sync);
      ro.observe(reference);
      if (target.offsetParent) ro.observe(target.offsetParent);
      window.addEventListener('resize', sync);

      return () => {
        ro.disconnect();
        window.removeEventListener('resize', sync);
      };
    },

    /**
     * The element whose box defines YouTube's content column on this page.
     * Ordered most- to least-specific; the tab strip is the best reference on
     * a channel page because it is exactly the row users read our panel against.
     */
    contentReference() {
      return (
        HR.qs('tp-yt-paper-tabs#tabs') ||
        HR.qs('.tabGroupShapeTabs') ||
        HR.qs('.yt-tab-group-shape-wiz__tabs') ||
        HR.qs('ytd-tabbed-page-header') ||
        HR.qs('ytd-rich-grid-renderer #contents') ||
        HR.qs('#page-manager ytd-browse #contents') ||
        null
      );
    },

    /** Sparkline path from a numeric series. Pure SVG, no library. */
    sparkline(values, { width = 120, height = 28, stroke = '#ff4d3d' } = {}) {
      const nums = values.filter(Number.isFinite);
      if (nums.length < 2) return el('span.hr-muted', { text: 'not enough data' });

      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const span = max - min || 1;
      const step = width / (nums.length - 1);
      const points = nums
        .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
        .join(' ');

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.setAttribute('class', 'hr-spark');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', points);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', stroke);
      poly.setAttribute('stroke-width', '2');
      poly.setAttribute('stroke-linejoin', 'round');
      svg.append(poly);
      return svg;
    },
  };
})();
