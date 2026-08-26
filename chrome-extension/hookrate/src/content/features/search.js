// Search results: per-row annotation plus keyword research.
//
// Annotation is free — views and age are already on the page, so
// views-per-hour costs nothing. Channel enrichment is opt-in per row because
// each one is a network round trip.

(() => {
  const HR = (window.HR = window.HR || {});
  const el = HR.el;
  const BAR_ID = 'hr-search-bar';
  const ROW_SELECTOR = 'ytd-video-renderer';

  let stopObserving = null;
  let stopAligning = null;

  function query() {
    return new URL(location.href).searchParams.get('search_query') || '';
  }

  function annotate(row) {
    if (row.querySelector('.hr-inline')) return;

    const videoId = HR.videoIdFromCard(row);
    if (!videoId) return;

    const metaText = [...row.querySelectorAll('#metadata-line span, .inline-metadata-item')]
      .map((n) => n.textContent.trim())
      .filter(Boolean);
    const views = HR.parseCount(metaText.find((t) => /view/i.test(t)));
    const publishedAt = HR.parseAge(metaText.find((t) => /ago/i.test(t)));
    const vph =
      views && publishedAt
        ? Math.round(views / Math.max(1, (Date.now() - publishedAt) / 3600e3))
        : null;

    const chip = el('span.hr-chip.hr-chip-muted', {
      text: vph == null ? 'no data' : `${HR.fmt.n(vph)}/h`,
      title: 'Views per hour since upload',
    });

    const deep = HR.ui.button(
      'score',
      async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const v = await HR.send('video.stats', { videoId, withChannel: true });
          btn.replaceWith(
            el('span.hr-chips', {}, [
              v.outlier ? HR.ui.outlier(v.outlier, { compact: true }) : HR.ui.chip('no baseline', 'muted'),
              HR.ui.chip(HR.fmt.range(v.revenue), 'muted', 'Estimated revenue'),
              v.channelId
                ? HR.ui.button('channel', () => {
                    location.href = `/channel/${v.channelId}`;
                  })
                : null,
            ])
          );
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'retry';
          HR.ui.toast(err.message, { kind: 'bad' });
        }
      },
      { title: 'Fetch the true outlier score and revenue estimate' }
    );

    const save = HR.ui.button('＋', () =>
      HR.send('swipe.save', {
        item: {
          type: 'video',
          ref: videoId,
          title: row.querySelector('#video-title')?.textContent?.trim() || videoId,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          meta: { views, vph },
        },
      }).then(() => HR.ui.toast('Saved', { kind: 'good' }))
    , { title: 'Save to swipe file' });

    const host = row.querySelector('#meta, #metadata') || row;
    HR.ui.add(host, el('div.hr-inline', {}, [chip, deep, save]));
  }

  function annotateAll() {
    for (const row of HR.qsa(ROW_SELECTOR)) annotate(row);
  }

  async function research(q) {
    const modal = HR.ui.modal({ title: `Keyword research — "${q}"`, width: 860 });

    const maxSubs = el('input.hr-input', { type: 'number', placeholder: '100000', value: '100000' });
    const minViews = el('input.hr-input', { type: 'number', placeholder: '50000', value: '50000' });
    const filterSel = el('select.hr-input', {}, [
      el('option', { value: 'viewCount', text: 'Most viewed' }),
      el('option', { value: 'relevance', text: 'Relevance' }),
      el('option', { value: 'uploadDate', text: 'Newest' }),
      el('option', { value: 'thisMonth', text: 'This month' }),
      el('option', { value: 'thisYear', text: 'This year' }),
    ]);

    const out = el('div.hr-results');

    const run = async () => {
      HR.ui.fill(out, HR.ui.skeleton(6, 'Searching and enriching channels…'));
      try {
        const res = await HR.send('discover.niche', {
          query: q,
          filter: filterSel.value,
          limit: 30,
          maxSubscribers: Number(maxSubs.value) || 0,
          minViews: Number(minViews.value) || 0,
          enrich: 12,
        });

        HR.ui.fill(out, 
          el('div.hr-note', {
            text:
              `${res.results.length} of ${res.scanned} results kept · ` +
              `${res.enrichedChannels} channels enriched · ` +
              'ranked by views ÷ subscribers (punching above its weight)' +
              (res.note ? ` · ${res.note}` : ''),
          }),
          ...res.results.map((r) =>
            el('div.hr-row', {}, [
              el('a.hr-row-thumb', { href: `/watch?v=${r.videoId}` }, [
                el('img', { src: r.thumbnail, loading: 'lazy', alt: '' }),
              ]),
              el('div.hr-row-main', {}, [
                el('a.hr-row-title', { href: `/watch?v=${r.videoId}`, text: r.title }),
                el('div.hr-row-meta', {
                  text: [
                    `${HR.fmt.n(r.views)} views`,
                    r.channel ? `${HR.fmt.n(r.channel.subscribers)} subs` : null,
                    r.channel?.ageDays ? `${(r.channel.ageDays / 365).toFixed(1)}y old` : null,
                    r.channel?.country,
                    r.publishedText,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }),
                r.channel
                  ? el('a.hr-row-sub', {
                      href: `/channel/${r.channel.channelId}`,
                      text: r.channel.title,
                    })
                  : null,
              ]),
              el('div.hr-row-side', {}, [
                r.leverage ? HR.ui.chip(`${r.leverage}× subs`, 'good', 'views ÷ subscribers') : null,
                HR.ui.outlier(r.outlier, { compact: true }),
                HR.ui.chip(HR.fmt.range(r.revenue), 'muted', 'Estimated revenue'),
              ]),
            ])
          )
        );
        if (!res.results.length) HR.ui.add(out, el('div.hr-empty', { text: 'Nothing passed the filters.' }));
      } catch (err) {
        HR.ui.fill(out, el('div.hr-error', { text: err.message }));
      }
    };

    HR.ui.add(modal.body, 
      el('div.hr-note', {
        text: 'Runs YouTube search, then enriches the top channels and applies the same maths the channel panel uses. Recall is narrower than an indexed niche finder — this searches, it does not scan every channel on the platform.',
      }),
      el('div.hr-form-row', {}, [
        el('label.hr-field', {}, [el('span', { text: 'Sort' }), filterSel]),
        el('label.hr-field', {}, [el('span', { text: 'Max subs' }), maxSubs]),
        el('label.hr-field', {}, [el('span', { text: 'Min views' }), minViews]),
        HR.ui.button('Run', run, { kind: 'solid' }),
      ]),
      out
    );

    run();
  }

  function bar(q) {
    document.getElementById(BAR_ID)?.remove();
    return el('div.hr-bar-wrap', { id: BAR_ID }, [
      el('div.hr-bar-row', {}, [
        el('strong', { text: 'Hookrate' }),
        el('span.hr-muted', { text: `"${q}"` }),
        HR.ui.button('Keyword research', () => research(q), { kind: 'solid' }),
        HR.ui.button('Suggestions', async () => {
          const modal = HR.ui.modal({ title: `Related searches — "${q}"`, width: 520 });
          HR.ui.add(modal.body, HR.ui.skeleton(4, 'Loading…'));
          const rows = await HR.send('discover.suggestions', { prefix: q }).catch(() => []);
          HR.ui.fill(modal.body, 
            el('div.hr-note', { text: "YouTube's own autocomplete — a free read on what people actually type." }),
            ...rows.map((s) =>
              el('div.hr-link-row', {}, [
                el('a', { href: `/results?search_query=${encodeURIComponent(s)}`, text: s }),
              ])
            )
          );
          if (!rows.length) HR.ui.add(modal.body, el('div.hr-empty', { text: 'No suggestions returned.' }));
        }),
      ]),
    ]);
  }

  async function mount() {
    if (!(await HR.enabled('searchAnnotations'))) return;
    const q = query();
    if (!q) return;

    // Insert INSIDE the primary column, at the top.
    //
    // Inserting as a sibling of the results container puts us in a flex row
    // beside it, where a full-width bar consumes the row and squeezes the
    // results off the right edge. The primary column is a block context, so a
    // child there stacks above the results the way it should.
    const primary = await HR.waitFor(
      'ytd-search #primary, ytd-two-column-search-results-renderer #primary'
    );
    const list = HR.qs('ytd-search ytd-section-list-renderer');
    const results = HR.qs('ytd-search ytd-section-list-renderer #contents') || list;

    const node = bar(q);
    if (primary) primary.insertAdjacentElement('afterbegin', node);
    else if (list) HR.ui.insertAbove(node, list);
    else if (results) HR.ui.insertAbove(node, results);
    else return;

    // Match the results column's measured box rather than assuming a width.
    stopAligning?.();
    if (results) stopAligning = HR.ui.alignTo(node, results);

    annotateAll();
    stopObserving?.();
    stopObserving = HR.observe(results || primary, HR.debounce(annotateAll, 350), { wait: 350 });
  }

  function unmount() {
    stopObserving?.();
    stopObserving = null;
    stopAligning?.();
    stopAligning = null;
    document.getElementById(BAR_ID)?.remove();
    for (const n of HR.qsa('.hr-inline')) n.remove();
  }

  HR.features = HR.features || {};
  HR.features.search = { mount, unmount, research };
})();
