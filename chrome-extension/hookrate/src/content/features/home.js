// Home / subscriptions / trending feed:
//   - client-side filter bar (views, age, duration, shorts, watched)
//   - views-per-hour badge on every card (computed from what's already rendered)
//   - on-demand true outlier score per card
//   - thumbnail + title tester that previews your asset in the real grid

(() => {
  const HR = (window.HR = window.HR || {});
  const el = HR.el;
  const BAR_ID = 'hr-filter-bar';
  const CARD_SELECTOR =
    'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer';

  let filters = null;
  let stopObserving = null;
  let stopAligning = null;

  // ---- reading a card ----------------------------------------------------

  function cardMeta(card) {
    const cached = card.__hr;
    if (cached && cached.stamp > Date.now() - 15000) return cached;

    const metaText = [...card.querySelectorAll('#metadata-line span, .inline-metadata-item')]
      .map((n) => n.textContent.trim())
      .filter(Boolean);

    const viewsText = metaText.find((t) => /view/i.test(t));
    const ageText = metaText.find((t) => /ago/i.test(t));
    const durationText = card.querySelector(
      'ytd-thumbnail-overlay-time-status-renderer #text, .badge-shape-wiz__text, #time-status #text'
    )?.textContent;

    const views = viewsText ? HR.parseCount(viewsText) : null;
    const publishedAt = ageText ? HR.parseAge(ageText) : null;
    const durationSec = durationText
      ? durationText
          .trim()
          .split(':')
          .map(Number)
          .reduce((a, b) => a * 60 + b, 0)
      : null;

    const meta = {
      stamp: Date.now(),
      videoId: HR.videoIdFromCard(card),
      views,
      publishedAt,
      durationSec,
      isShort: !!card.querySelector('a[href*="/shorts/"]') || (durationSec != null && durationSec <= 60),
      watched: !!card.querySelector('#progress, .ytd-thumbnail-overlay-resume-playback-renderer'),
      vph:
        views && publishedAt
          ? Math.round(views / Math.max(1, (Date.now() - publishedAt) / 3600e3))
          : null,
    };
    card.__hr = meta;
    return meta;
  }

  // ---- badges ------------------------------------------------------------

  async function deepScore(card, meta, badge) {
    badge.textContent = '…';
    try {
      const v = await HR.send('video.stats', { videoId: meta.videoId, withChannel: true });
      if (v.outlier) {
        badge.textContent = HR.fmt.multiplier(v.outlier.multiplier);
        badge.className = `hr-thumb-badge hr-tier-${v.outlier.tier}`;
        badge.title = `${HR.fmt.multiplier(v.outlier.multiplier)} the channel's median (${HR.fmt.n(
          v.outlier.baselineMedian
        )})`;
      } else {
        badge.textContent = HR.fmt.n(v.viewsPerHour) + '/h';
        badge.title = 'no channel baseline available';
      }
    } catch (err) {
      badge.textContent = '!';
      badge.title = err.message;
    }
  }

  function badgeCard(card, meta) {
    if (card.querySelector('.hr-thumb-badge')) return;
    // Prefer the anchor YouTube already positions. Forcing `position` onto a
    // container we do not own re-parents its absolutely-positioned children
    // and can collapse the card, so never touch layout styles here.
    const thumb =
      card.querySelector('a#thumbnail') ||
      card.querySelector('#thumbnail') ||
      card.querySelector('ytd-thumbnail');
    if (!thumb || meta.vph == null) return;

    const badge = el('span.hr-thumb-badge', {
      text: `${HR.fmt.n(meta.vph)}/h`,
      title: 'Views per hour since upload. Click for the true outlier score.',
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (meta.videoId) deepScore(card, meta, badge);
      },
    });
    HR.ui.add(thumb, badge);
  }

  // ---- filtering ---------------------------------------------------------

  function passes(meta, f) {
    if (f.hideShorts && meta.isShort) return false;
    if (f.hideWatched && meta.watched) return false;
    if (f.minViews && (meta.views ?? Infinity) < f.minViews) return false;
    if (f.maxViews && (meta.views ?? 0) > f.maxViews) return false;
    if (f.maxAgeDays && meta.publishedAt && Date.now() - meta.publishedAt > f.maxAgeDays * 864e5) {
      return false;
    }
    if (f.minDurationSec && (meta.durationSec ?? Infinity) < f.minDurationSec) return false;
    if (f.maxDurationSec && (meta.durationSec ?? 0) > f.maxDurationSec) return false;
    return true;
  }

  function apply() {
    const cards = HR.qsa(CARD_SELECTOR);
    let hidden = 0;

    for (const card of cards) {
      const meta = cardMeta(card);
      if (filters?.enabled) {
        const ok = passes(meta, filters);
        card.style.display = ok ? '' : 'none';
        if (!ok) hidden++;
      } else if (card.style.display === 'none') {
        // Only clear a value we set ourselves.
        card.style.removeProperty('display');
      }
      if (filters?.badges !== false) badgeCard(card, meta);
    }

    // Safety valve. If the filter would empty the feed, it is far more likely
    // that metadata parsing broke than that the user meant to hide everything —
    // so show the feed and say so, rather than handing back a blank page.
    let note = '';
    if (filters?.enabled && cards.length >= 6 && hidden === cards.length) {
      for (const card of cards) card.style.removeProperty('display');
      hidden = 0;
      note = ' · filter matched nothing, showing all';
    }

    const count = document.getElementById('hr-filter-count');
    if (count) {
      count.textContent =
        (filters?.enabled
          ? `${cards.length - hidden} shown · ${hidden} hidden`
          : `${cards.length} cards`) + note;
    }
  }

  const applyDebounced = HR.debounce(apply, 300);

  // ---- filter bar --------------------------------------------------------

  function numberField(label, key, placeholder) {
    const input = el('input.hr-input', {
      type: 'number',
      min: '0',
      placeholder: placeholder || '0',
      value: filters[key] || '',
      oninput: (e) => {
        filters[key] = Number(e.target.value) || 0;
        persist();
        apply();
      },
    });
    return el('label.hr-field', {}, [el('span', { text: label }), input]);
  }

  function toggleField(label, key) {
    const input = el('input', {
      type: 'checkbox',
      checked: !!filters[key],
      onchange: (e) => {
        filters[key] = e.target.checked;
        persist();
        apply();
      },
    });
    return el('label.hr-field.hr-field-check', {}, [input, el('span', { text: label })]);
  }

  function persist() {
    HR.saveSettings({ homeFilter: filters });
  }

  function bar() {
    document.getElementById(BAR_ID)?.remove();

    const master = el('input', {
      type: 'checkbox',
      checked: !!filters.enabled,
      onchange: (e) => {
        filters.enabled = e.target.checked;
        persist();
        apply();
      },
    });

    return el('div.hr-bar-wrap', { id: BAR_ID }, [
      el('div.hr-bar-row', {}, [
        el('label.hr-field.hr-field-check.hr-master', {}, [master, el('strong', { text: 'Hookrate filter' })]),
        numberField('Min views', 'minViews', '10000'),
        numberField('Max views', 'maxViews'),
        numberField('Max age (days)', 'maxAgeDays', '30'),
        numberField('Min length (s)', 'minDurationSec'),
        numberField('Max length (s)', 'maxDurationSec'),
        toggleField('Hide Shorts', 'hideShorts'),
        toggleField('Hide watched', 'hideWatched'),
        el('span.hr-bar-count', { id: 'hr-filter-count' }),
        HR.ui.button('Title tester', () => tester(), { title: 'Preview your thumbnail and title in this grid' }),
        HR.ui.button('Reset', () => {
          filters = { enabled: false, badges: true };
          persist();
          mount(true);
        }),
      ]),
    ]);
  }

  // ---- thumbnail + title tester -----------------------------------------

  const swapped = [];

  function restore() {
    if (!swapped.length) return; // stay silent when there is nothing to undo
    for (const s of swapped.splice(0)) {
      if (s.img) s.img.src = s.src;
      if (s.titleNode) s.titleNode.textContent = s.title;
    }
    HR.ui.toast('Grid restored');
  }

  function tester() {
    const modal = HR.ui.modal({ title: 'Thumbnail & title tester', width: 560 });

    const file = el('input.hr-input', { type: 'file', accept: 'image/*' });
    const title = el('input.hr-input', { type: 'text', placeholder: 'Your title here' });
    const slot = el('input.hr-input', { type: 'number', min: '1', max: '12', value: '1' });

    const swap = () => {
      const cards = HR.qsa(CARD_SELECTOR).filter((c) => c.style.display !== 'none');
      const index = Math.max(1, Math.min(Number(slot.value) || 1, cards.length)) - 1;
      const card = cards[index];
      if (!card) return HR.ui.toast('No card in that slot', { kind: 'bad' });

      const img = card.querySelector('img');
      const titleNode = card.querySelector('#video-title, a#video-title-link, yt-formatted-string#video-title');
      if (!img && !titleNode) return HR.ui.toast('Card has no thumbnail or title node', { kind: 'bad' });

      swapped.push({ img, src: img?.src, titleNode, title: titleNode?.textContent });

      if (title.value && titleNode) titleNode.textContent = title.value;

      const chosen = file.files?.[0];
      if (chosen && img) {
        const reader = new FileReader();
        reader.onload = () => {
          img.src = reader.result;
          img.removeAttribute('srcset');
        };
        reader.readAsDataURL(chosen);
      }
      HR.ui.toast(`Swapped into slot ${index + 1}`, { kind: 'good' });
      modal.close();
    };

    HR.ui.add(modal.body, 
      el('div.hr-note', {
        text: 'Swaps your asset into a real grid card so you judge it against live competition, not a blank mockup. Nothing is uploaded — the change is local and reverts on reload.',
      }),
      el('label.hr-field-block', {}, [el('span', { text: 'Thumbnail image' }), file]),
      el('label.hr-field-block', {}, [el('span', { text: 'Title' }), title]),
      el('label.hr-field-block', {}, [el('span', { text: 'Grid slot (1 = first card)' }), slot]),
      el('div.hr-modal-actions', {}, [
        HR.ui.button('Swap in', swap, { kind: 'solid' }),
        HR.ui.button('Restore all', restore),
      ])
    );
  }

  // ---- lifecycle ---------------------------------------------------------

  async function mount(force = false) {
    const settings = await HR.settings(force);
    if (settings.features?.homeFilter === false && settings.features?.homeOutliers === false) return;

    filters = { badges: settings.features?.homeOutliers !== false, ...(settings.homeFilter || {}) };

    // Insert as a SIBLING above the grid, never inside it. The grid renderer
    // and its header are flex/grid children with their own sizing; a foreign
    // child in that slot stretches and pushes the feed out of view.
    const grid = await HR.waitFor('ytd-rich-grid-renderer');
    const anchor = grid || (await HR.waitFor('#primary'));
    if (!anchor) return;

    try {
      if (settings.features?.homeFilter !== false) {
        const node = bar();
        if (grid) HR.ui.insertAbove(node, grid);
        else anchor.insertAdjacentElement('afterbegin', node);

        // Match the grid's measured box so the bar lines up with the cards
        // instead of guessing at YouTube's content width.
        stopAligning?.();
        const reference = HR.qs('ytd-rich-grid-renderer #contents') || grid;
        if (reference) stopAligning = HR.ui.alignTo(node, reference);
      }
      apply();
    } catch (err) {
      // A throw mid-pass could leave cards hidden. Restore, then give up.
      HR.log('home mount failed', err);
      for (const card of HR.qsa(CARD_SELECTOR)) card.style.removeProperty('display');
      document.getElementById(BAR_ID)?.remove();
      return;
    }

    stopObserving?.();
    stopObserving = HR.observe(grid || document.body, applyDebounced, { wait: 350 });
  }

  function unmount() {
    stopObserving?.();
    stopObserving = null;
    stopAligning?.();
    stopAligning = null;
    document.getElementById(BAR_ID)?.remove();
    restore();
    for (const card of HR.qsa(CARD_SELECTOR)) {
      card.style.removeProperty('display');
      card.querySelector('.hr-thumb-badge')?.remove();
    }
  }

  HR.features = HR.features || {};
  HR.features.home = { mount, unmount, apply, tester, restore };
})();
