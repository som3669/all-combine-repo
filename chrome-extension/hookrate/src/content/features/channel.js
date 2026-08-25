// Channel page: the main analytics panel.

(() => {
  const HR = (window.HR = window.HR || {});
  const el = HR.el;
  const PANEL_ID = 'hr-channel-panel';

  function monetizationChip(m) {
    if (!m) return HR.ui.chip('monetization unknown', 'muted');
    // monetized === null means "could not tell", which is not the same as no.
    if (m.monetized == null) return HR.ui.chip('monetization unknown', 'muted', m.basis);
    const kind = m.monetized
      ? m.confidence === 'high'
        ? 'good'
        : 'warn'
      : m.eligibility?.eligible
        ? 'warn'
        : 'bad';
    const label = m.monetized
      ? `monetized (${m.confidence})`
      : m.eligibility?.eligible
        ? 'eligible, no ads seen'
        : 'not monetized';
    return HR.ui.chip(label, kind, m.basis);
  }

  function statsFor(a) {
    const rev = a.revenue || {};
    // On a Shorts-only channel the long-form figures are legitimately empty, so
    // fall back to the Shorts numbers and say that is what they are. A bare
    // dash reads as "broken"; a labelled Shorts figure reads as an answer.
    const avg = a.avgViews ?? a.avgViewsAny;
    const median = a.medianViews ?? a.medianViewsAny;

    return HR.ui.stats([
      { label: 'Subscribers', value: HR.fmt.n(a.subscribers), sub: HR.fmt.full(a.subscribers) },
      {
        label: 'Total views',
        value: HR.fmt.n(a.totalViews),
        sub: a.totalViewsExcludesShorts
          ? `${HR.fmt.n(a.totalViewsSampled)} incl. Shorts`
          : HR.fmt.full(a.totalViews),
        hint: a.totalViewsExcludesShorts
          ? "YouTube's About-page total excludes Shorts views, so it reads lower than the views visible on the Shorts tab. Both figures are shown."
          : 'Reported by YouTube on the channel About page.',
      },
      {
        label: 'Avg views / video',
        value: HR.fmt.n(avg),
        sub: avg == null
          ? 'no view counts read'
          : `median ${HR.fmt.n(median)}${a.shortsOnly ? ' · Shorts only' : ''}`,
        hint: 'Median is the honest baseline — one viral hit skews the average.',
      },
      {
        label: 'Views / month',
        value: HR.fmt.n(a.monthlyViews),
        sub:
          a.monthlyBasis === '30d'
            ? `${a.uploadsLast30} uploads in 30d`
            : a.monthlyBasis === 'lifetime'
              ? 'lifetime average, not recent'
              : 'no dated uploads',
        hint:
          a.monthlyBasis === 'lifetime'
            ? 'No uploads carried a date inside the last 30 days, so this is total views divided by channel age — a lifetime average, not current activity.'
            : 'Sum of views on uploads dated within the last 30 days.',
      },
      {
        label: 'Est. revenue / month',
        value: HR.fmt.range(rev.monthly),
        sub: rev.model ? `RPM $${rev.model.rpm} (${rev.model.category})` : null,
        hint: 'views/1000 × category RPM × geo multiplier. An estimate, not a report.',
      },
      {
        label: 'Est. revenue / video',
        value: HR.fmt.range(rev.perVideo),
        sub: rev.lifetime ? `lifetime ${HR.fmt.range(rev.lifetime)}` : null,
      },
      {
        label: 'Uploads / month',
        value: a.uploadsPerMonth ?? '—',
        sub: a.uploadsPerMonth == null ? 'no upload dates available' : 'last 90 days',
        hint: a.uploadsPerMonth == null
          ? 'Shorts cards carry no upload date. Dates are resolved automatically for channels with 15 or fewer sampled videos; above that it would cost one request per video.'
          : 'Uploads dated in the last 90 days, divided by three.',
      },
      {
        label: 'Last upload',
        value: a.daysSinceUpload == null ? '—' : `${a.daysSinceUpload}d ago`,
        sub: a.daysSinceUpload == null ? 'no upload dates available' : null,
        tone: a.daysSinceUpload > 60 ? 'bad' : null,
      },
      {
        label: 'Channel age',
        value: a.ageDays ? `${(a.ageDays / 365).toFixed(1)}y` : '—',
        sub: a.ageDays ? `${HR.fmt.full(a.ageDays)} days` : null,
      },
      {
        label: 'Avg length',
        value: HR.fmt.duration(a.avgDurationSec),
        sub: a.avgDurationSec == null ? 'no durations available' : a.shortsOnly ? 'Shorts only' : null,
      },
      {
        label: 'Country',
        // Most small channels never set one. "not set" is the fact; "—" implies
        // we failed to read it.
        value: a.country || 'not set',
        sub: a.category || null,
      },
      {
        label: 'Videos',
        value: HR.fmt.n(a.videoCount),
        sub:
          `${a.videoSample} sampled` +
          (a.shortsOnly ? ' · Shorts only' : a.hasShorts ? ' · has Shorts' : '') +
          (a.metaResolved ? ' · dates resolved' : ''),
      },
    ]);
  }

  function eligibilityRow(m) {
    const e = m?.eligibility;
    if (!e) return null;
    const shorts = e.shortsWindowKnown
      ? `${HR.fmt.n(e.shortsViews90d)} Shorts views (90d)`
      : `${HR.fmt.n(e.shortsViewsSampled)} Shorts views (sampled, no dates)`;
    return el('div.hr-note', {}, [
      el('strong', { text: 'YPP eligibility: ' }),
      el('span', {
        text:
          `${HR.fmt.full(e.subscribers)} subs · ` +
          `~${HR.fmt.full(e.watchHoursEstimate)} watch hours (12mo est.) · ` +
          `${shorts} — ` +
          (e.eligible ? 'thresholds met' : 'below thresholds'),
      }),
    ]);
  }

  async function showOutliers(a) {
    const modal = HR.ui.modal({ title: `Top outliers — ${a.title}` });
    modal.body.append(
      el('div.hr-note', {
        text:
          'Ranked by how far each video beat this channel’s median. ' +
          'The two newest uploads are excluded from the baseline.',
      }),
      ...a.topOutliers.map((v) =>
        HR.ui.videoRow(v, {
          onSave: (video) => saveVideo(video, a),
        })
      )
    );
    if (!a.topOutliers.length) {
      modal.body.append(el('div.hr-empty', { text: 'No clear outliers in the sampled uploads.' }));
    }
  }

  async function showSimilar(a) {
    const modal = HR.ui.modal({ title: `Similar channels — ${a.title}` });
    modal.body.append(HR.ui.skeleton(5, 'Searching…'));
    try {
      const res = await HR.send('similar.channels', { channel: a.channelId, limit: 24 });
      modal.body.replaceChildren(
        el('div.hr-note', {
          text: `Signals: featured channels, related-video graph, keyword search (${res.terms.join(', ')}). No embedding index — recall is narrower than a paid tool.`,
        }),
        ...res.results.map((c) =>
          el('div.hr-row', {}, [
            el('a.hr-row-thumb.hr-avatar', { href: `/channel/${c.channelId}` }, [
              c.avatar ? el('img', { src: c.avatar, alt: '', loading: 'lazy' }) : el('div.hr-avatar-blank'),
            ]),
            el('div.hr-row-main', {}, [
              el('a.hr-row-title', { href: `/channel/${c.channelId}`, text: c.title || c.channelId }),
              el('div.hr-row-meta', {
                text: `${c.subscribers ? `${HR.fmt.n(c.subscribers)} subs · ` : ''}${c.signals.join(', ')}`,
              }),
            ]),
            el('div.hr-row-side', {}, [HR.ui.chip(`score ${c.score}`, 'muted')]),
          ])
        )
      );
      if (!res.results.length) {
        modal.body.append(el('div.hr-empty', { text: 'Nothing similar found.' }));
      }
    } catch (err) {
      modal.body.replaceChildren(el('div.hr-error', { text: err.message }));
    }
  }

  function csv(a) {
    const head = 'videoId,title,views,published,durationSec,outlierMultiplier,isShort';
    const rows = a.videos.map((v) =>
      [
        v.videoId,
        `"${(v.title || '').replace(/"/g, "'")}"`,
        v.views ?? '',
        v.publishedText || '',
        v.durationSec ?? '',
        v.outlier?.multiplier ?? '',
        v.isShort,
      ].join(',')
    );
    return [head, ...rows].join('\n');
  }

  function saveVideo(video, a) {
    return HR.send('swipe.save', {
      item: {
        type: video.isShort ? 'short' : 'video',
        ref: video.videoId,
        title: video.title,
        thumbnail: video.thumbnail,
        url: `https://www.youtube.com/watch?v=${video.videoId}`,
        meta: {
          views: video.views,
          outlier: video.outlier?.multiplier ?? null,
          channelTitle: a?.title,
          channelId: a?.channelId,
        },
      },
    }).then(() => HR.ui.toast('Saved to swipe file', { kind: 'good' }));
  }

  async function actionsFor(a) {
    const tracked = await HR.send('tracker.isTracked', { channelId: a.channelId }).catch(() => false);

    const trackBtn = HR.ui.button(
      tracked ? 'Tracking ✓' : 'Track',
      async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          if (btn.textContent.startsWith('Tracking')) {
            await HR.send('tracker.remove', { channelId: a.channelId });
            btn.textContent = 'Track';
            HR.ui.toast('Stopped tracking');
          } else {
            await HR.send('tracker.add', { channel: a.channelId });
            btn.textContent = 'Tracking ✓';
            HR.ui.toast('Tracking — snapshots every 6h', { kind: 'good' });
          }
        } catch (err) {
          HR.ui.toast(err.message, { kind: 'bad' });
        } finally {
          btn.disabled = false;
        }
      },
      { kind: tracked ? 'solid' : 'ghost', title: 'Snapshot subs and views on a schedule' }
    );

    return [
      HR.ui.button('Outliers', () => showOutliers(a)),
      HR.ui.button('Similar', () => showSimilar(a)),
      trackBtn,
      HR.ui.button('Save', () =>
        HR.send('swipe.save', {
          item: {
            type: 'channel',
            ref: a.channelId,
            title: a.title,
            thumbnail: a.avatar,
            url: a.url,
            meta: { subscribers: a.subscribers, avgViews: a.avgViews, country: a.country },
          },
        }).then(() => HR.ui.toast('Channel saved', { kind: 'good' }))
      ),
      HR.ui.button('CSV', () =>
        HR.send('download.text', {
          filename: `${a.handle || a.channelId}-videos.csv`,
          content: csv(a),
        }).then(() => HR.ui.toast('CSV downloaded', { kind: 'good' }))
      ),
    ];
  }

  // ---- monetization badge on the channel title -------------------------
  //
  // Placed next to the channel name because that is where the eye lands, and
  // because the verdict is the one fact people open a competitor's channel to
  // learn. Follows the ✅/❌ convention the data itself uses: green means ads
  // were observed, amber means eligible-but-unproven, red means neither.

  const BADGE_ID = 'hr-monetized-badge';

  function badgeState(m) {
    if (!m || m.monetized == null) {
      return {
        glyph: '?',
        kind: 'unknown',
        label: `Monetization unknown. ${m ? m.basis : 'no data collected'}`,
      };
    }
    if (m.monetized) {
      return {
        glyph: '$',
        kind: m.confidence === 'high' ? 'yes' : 'maybe',
        label: `Monetized — ${m.confidence} confidence. ${m.basis}`,
      };
    }
    if (m.eligibility?.eligible) {
      return { glyph: '$', kind: 'maybe', label: `Eligible, no ads observed. ${m.basis}` };
    }
    return { glyph: '⊘', kind: 'no', label: `Not monetized. ${m.basis}` };
  }

  function injectBadge(a) {
    document.getElementById(BADGE_ID)?.remove();

    const title =
      HR.qs('.page-header-view-model-wiz__page-header-title') ||
      HR.qs('yt-dynamic-text-view-model h1') ||
      HR.qs('#channel-name #text') ||
      HR.qs('ytd-channel-name #text');
    if (!title) return;

    const state = badgeState(a.monetization);
    const badge = el('span', {
      id: BADGE_ID,
      class: `hr-badge hr-badge-${state.kind}`,
      title: state.label,
      text: state.glyph,
    });

    // Clicking it jumps to the evidence rather than just asserting a verdict.
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      showMonetization(a);
    });

    title.append(badge);
  }

  /**
   * Valid vs invalid Shorts views, in YouTube's sense: "valid" means the view
   * counts toward the 10M / 90-day monetization threshold. Resolving that needs
   * a publish date per Short, which is one fetch each — so it runs on demand.
   */
  function shortsBreakdown(a) {
    if (!a.hasShorts) return null;

    const out = el('div.hr-note', {
      text: 'Shorts cards carry no upload date, so which views count toward the 10M threshold cannot be read from the channel page. Resolving it costs one request per Short.',
    });

    const run = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Resolving dates…';
      out.replaceChildren(HR.ui.skeleton(3, 'Fetching a publish date per Short…'));

      try {
        const w = await HR.send('channel.shortsWindow', { channel: a.channelId, limit: 30 });
        const pct = Math.min(100, (w.countedViews / w.threshold) * 100);

        out.replaceChildren(
          HR.ui.stats([
            {
              label: 'Valid — counts toward threshold',
              value: HR.fmt.n(w.inWindow.views),
              sub: `${w.inWindow.count} Shorts, last 90 days`,
              tone: w.meetsThreshold ? 'good' : null,
              hint: 'Public Shorts uploaded inside the 90-day window. These are the views YouTube counts for the Shorts monetization path.',
            },
            {
              label: 'Invalid — too old to count',
              value: HR.fmt.n(w.outWindow.views),
              sub: `${w.outWindow.count} Shorts, older than 90 days`,
              tone: w.outWindow.views ? 'bad' : null,
              hint: 'Real views, but outside the rolling window, so they do not count toward eligibility.',
            },
            w.unresolved.count
              ? {
                  label: 'Date unresolved',
                  value: HR.fmt.n(w.unresolved.views),
                  sub: `${w.unresolved.count} Shorts`,
                  hint: 'The publish date could not be read, so these are counted on neither side rather than guessed.',
                }
              : null,
            w.capped
              ? {
                  label: 'Not sampled',
                  value: HR.fmt.n(w.notSampled.views),
                  sub: `${w.notSampled.count} more Shorts beyond the cap`,
                  hint: 'Sampling is capped to keep the request count sane. Raise it and this shrinks.',
                }
              : null,
          ]),
          el('div.hr-bar', {}, [
            el('div.hr-bar-seg.hr-good', { style: { width: `${pct}%` }, title: `${pct.toFixed(2)}% of 10M` }),
          ]),
          el('div.hr-note', {
            text:
              `${HR.fmt.n(w.countedViews)} of 10,000,000 valid views (${pct.toFixed(2)}%) — ` +
              `${w.meetsThreshold ? 'Shorts path threshold met' : 'Shorts path threshold not met'}. ` +
              `Sampled ${w.sampled} of ${w.totalShortsFound} Shorts found.`,
          }),
          el('div.hr-note.hr-muted', { text: w.caveat }),
          w.inWindow.videos.length
            ? el('div.hr-subsection', {}, [
                el('div.hr-subsection-title', { text: 'Top valid Shorts (in window)' }),
                ...w.inWindow.videos.map((v) =>
                  el('div.hr-row', {}, [
                    el('div.hr-row-main', {}, [
                      el('a.hr-row-title', { href: `/shorts/${v.videoId}`, text: v.title || v.videoId }),
                      el('div.hr-row-meta', {
                        text: `${HR.fmt.n(v.views)} views · ${v.ageDays}d old`,
                      }),
                    ]),
                  ])
                ),
              ])
            : null,
          w.outWindow.videos.length
            ? el('div.hr-subsection', {}, [
                el('div.hr-subsection-title', { text: 'Top invalid Shorts (outside window)' }),
                ...w.outWindow.videos.map((v) =>
                  el('div.hr-row', {}, [
                    el('div.hr-row-main', {}, [
                      el('a.hr-row-title', { href: `/shorts/${v.videoId}`, text: v.title || v.videoId }),
                      el('div.hr-row-meta', {
                        text: `${HR.fmt.n(v.views)} views · ${v.ageDays}d old`,
                      }),
                    ]),
                  ])
                ),
              ])
            : null
        );
        btn.textContent = 'Re-check';
      } catch (err) {
        out.replaceChildren(el('div.hr-error', { text: err.message }));
        btn.textContent = 'Retry';
      } finally {
        btn.disabled = false;
      }
    };

    return el('div.hr-subsection', {}, [
      el('div.hr-subsection-title', { text: 'Shorts views — valid vs invalid' }),
      el('div.hr-modal-actions', {}, [
        HR.ui.button('Split valid / invalid', run, {
          kind: 'solid',
          title: 'Resolves a publish date per Short to see which views count toward the 10M threshold',
        }),
      ]),
      out,
    ]);
  }

  function showMonetization(a) {
    const m = a.monetization;
    const modal = HR.ui.modal({ title: `Monetization — ${a.title}`, width: 620 });
    if (!m) {
      modal.body.append(el('div.hr-empty', { text: 'No monetization data was collected.' }));
      return;
    }

    modal.body.append(
      el('div.hr-panel-badges', {}, [monetizationChip(m)]),
      el('div.hr-note', { text: m.basis }),
      HR.ui.stats([
        {
          label: 'Subscribers',
          value: HR.fmt.full(m.eligibility?.subscribers),
          sub: 'threshold 1,000',
          tone: (m.eligibility?.subscribers || 0) >= 1000 ? 'good' : 'bad',
        },
        {
          label: 'Watch hours (12mo est.)',
          value: HR.fmt.full(m.eligibility?.watchHoursEstimate),
          sub: m.eligibility?.longFormCount
            ? 'threshold 4,000'
            : 'no long-form uploads',
          tone: m.eligibility?.longFormPath ? 'good' : null,
        },
        // Shorts cards carry no upload date, so the 90-day window usually
        // cannot be measured. Say which figure is on screen instead of
        // printing a 0 that reads as "no views".
        m.eligibility?.shortsWindowKnown
          ? {
              label: 'Shorts views (90d)',
              value: HR.fmt.n(m.eligibility.shortsViews90d),
              sub: 'threshold 10M',
              tone: m.eligibility.shortsPath ? 'good' : null,
            }
          : {
              label: 'Shorts views (sampled)',
              value: HR.fmt.n(m.eligibility?.shortsViewsSampled),
              sub: 'no dates on Shorts cards',
              hint: 'Shorts lockups expose a view count but no upload date, so the 90-day window cannot be measured from them. This is the total across sampled Shorts.',
              tone: m.eligibility?.shortsPath ? 'good' : null,
            },
      ]),
      shortsBreakdown(a),
      el('div.hr-subsection', {}, [
        el('div.hr-subsection-title', { text: 'Sampled videos' }),
        ...(m.probes || []).map((p) =>
          el('div.hr-link-row', {}, [
            el('a', { href: `/watch?v=${p.videoId}`, text: p.videoId }),
            el('span', { text: '  ' }),
            HR.ui.chip(
              p.ads === true ? 'ad slots present' : p.ads === false ? 'no ad slots' : 'unreadable',
              p.ads === true ? 'good' : p.ads === false ? 'bad' : 'muted'
            ),
          ])
        ),
      ]),
      el('div.hr-subsection', {}, [
        el('div.hr-subsection-title', { text: 'YPP surfaces on the channel' }),
        el('div.hr-chips', {}, [
          HR.ui.chip('memberships', m.surfaces?.memberships ? 'good' : 'muted'),
          HR.ui.chip('merch shelf', m.surfaces?.merch ? 'good' : 'muted'),
          HR.ui.chip('super thanks', m.surfaces?.superThanks ? 'good' : 'muted'),
          m.surfaces?.autoGenerated ? HR.ui.chip('auto-generated label channel', 'warn') : null,
        ]),
      ]),
      el('div.hr-note.hr-muted', {
        text: 'YouTube publishes no monetization field, so this is inferred. Limited ads, region gating and advertiser-unfriendly topics all suppress ad slots — which is why the sample is voted, not trusted one video at a time.',
      })
    );
  }

  // ---- "Analysis" tab in YouTube's own tab strip ------------------------

  const TAB_ID = 'hr-analysis-tab';
  const VIEW_ID = 'hr-analysis-view';
  let hiddenContent = null;
  let stopAligning = null;

  /** YouTube has shipped several tab-strip implementations; support them all. */
  function tabStrip() {
    return (
      HR.qs('.tabGroupShapeTabs') ||
      HR.qs('.yt-tab-group-shape-wiz__tabs') ||
      HR.qs('yt-tab-group-shape .yt-tab-group-shape-wiz__tabs') ||
      HR.qs('ytd-c4-tabbed-header-renderer #tabsContent') ||
      HR.qs('tp-yt-paper-tabs#tabs')
    );
  }

  function nativeTabs(strip) {
    return [...strip.children].filter((n) => n.id !== TAB_ID);
  }

  function contentHost() {
    return (
      HR.qs('ytd-browse[page-subtype="channels"] ytd-two-column-browse-results-renderer') ||
      HR.qs('ytd-browse[page-subtype="channels"] #contentContainer') ||
      HR.qs('ytd-browse[page-subtype="channels"] #contents')
    );
  }

  function restoreNativeView() {
    document.getElementById(VIEW_ID)?.remove();
    if (hiddenContent) {
      hiddenContent.style.display = '';
      hiddenContent = null;
    }
    document.getElementById(TAB_ID)?.classList.remove('hr-tab-active');
    document.getElementById(PANEL_ID)?.style.removeProperty('display');
  }

  function analysisView(a) {
    const table = el('div.hr-subsection', {}, [
      el('div.hr-subsection-title', { text: `All sampled uploads (${a.videos.length})` }),
      ...a.videos.map((v) => HR.ui.videoRow(v, { onSave: (x) => saveVideo(x, a) })),
    ]);

    const similarHost = el('div.hr-subsection', {}, [
      el('div.hr-subsection-title', { text: 'Similar channels' }),
      HR.ui.skeleton(3, 'Searching…'),
    ]);

    HR.send('similar.channels', { channel: a.channelId, limit: 12 })
      .then((res) => {
        similarHost.replaceChildren(
          el('div.hr-subsection-title', { text: 'Similar channels' }),
          ...res.results.map((c) =>
            el('div.hr-row', {}, [
              el('a.hr-row-thumb.hr-avatar', { href: `/channel/${c.channelId}` }, [
                c.avatar
                  ? el('img', { src: c.avatar, alt: '', loading: 'lazy' })
                  : el('div.hr-avatar-blank'),
              ]),
              el('div.hr-row-main', {}, [
                el('a.hr-row-title', {
                  href: `/channel/${c.channelId}`,
                  text: c.title || c.channelId,
                }),
                el('div.hr-row-meta', {
                  text: `${c.subscribers ? `${HR.fmt.n(c.subscribers)} subs · ` : ''}${c.signals.join(', ')}`,
                }),
              ]),
            ])
          )
        );
      })
      .catch((err) =>
        similarHost.replaceChildren(el('div.hr-error', { text: err.message }))
      );

    return el('div.hr-analysis', { id: VIEW_ID }, [
      el('div.hr-panel-badges', {}, [
        monetizationChip(a.monetization),
        a.hasShorts ? HR.ui.chip('Shorts', 'muted') : null,
        a.category ? HR.ui.chip(a.category, 'muted') : null,
        a.country ? HR.ui.chip(a.country, 'muted') : null,
        HR.ui.button('Monetization detail', () => showMonetization(a)),
      ]),
      statsFor(a),
      eligibilityRow(a.monetization),
      a.topOutliers.length
        ? el('div.hr-subsection', {}, [
            el('div.hr-subsection-title', { text: 'Best performers' }),
            ...a.topOutliers.map((v) => HR.ui.videoRow(v, { onSave: (x) => saveVideo(x, a) })),
          ])
        : null,
      similarHost,
      table,
    ]);
  }

  function openAnalysis(a) {
    const host = contentHost();
    if (!host) return;

    document.getElementById(VIEW_ID)?.remove();
    hiddenContent = host;
    host.style.display = 'none';

    // The panel duplicates this view, so hide it while the tab is open.
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = 'none';

    const view = analysisView(a);
    host.insertAdjacentElement('afterend', view);

    // The tab strip is the row the user reads this against, so match its box.
    const reference = HR.ui.contentReference();
    if (reference) HR.ui.alignTo(view, reference);

    document.getElementById(TAB_ID)?.classList.add('hr-tab-active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Clone one of YouTube's own tabs so ours inherits their typography, spacing
   * and hover states. Hand-built tabs drift the moment they restyle the strip.
   */
  function cloneTab(template, { id, label, onClick }) {
    const tab = template.cloneNode(true);
    tab.id = id;
    tab.classList.add('hr-tab');

    // Strip anything that would make YouTube's router act on it.
    tab.removeAttribute('tab-title');
    for (const link of tab.querySelectorAll('a')) {
      link.removeAttribute('href');
      link.setAttribute('role', 'button');
    }
    for (const node of tab.querySelectorAll('*')) {
      if (!node.children.length && node.textContent.trim()) node.textContent = label;
    }
    if (!tab.querySelector('*') && tab.textContent.trim()) tab.textContent = label;

    tab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return tab;
  }

  async function injectTab(a) {
    const strip = tabStrip() || (await HR.waitFor('.tabGroupShapeTabs, .yt-tab-group-shape-wiz__tabs, #tabsContent', { timeout: 6000 }));
    if (!strip) return;

    document.getElementById(TAB_ID)?.remove();
    const siblings = nativeTabs(strip);
    if (!siblings.length) return;

    strip.append(
      cloneTab(siblings[siblings.length - 1], {
        id: TAB_ID,
        label: 'Analysis',
        onClick: () => {
          if (document.getElementById(VIEW_ID)) restoreNativeView();
          else openAnalysis(a);
        },
      })
    );

    // Any native tab click hands the page back to YouTube.
    for (const native of siblings) {
      native.addEventListener('click', restoreNativeView, { once: false });
    }
  }

  function unmount() {
    stopAligning?.();
    stopAligning = null;
    restoreNativeView();
    document.getElementById(TAB_ID)?.remove();
    document.getElementById(BADGE_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
  }

  async function mount() {
    if (!(await HR.enabled('channelPanel'))) return;
    const ref = HR.page.channelId() || HR.page.channelRef();
    if (!ref) return;

    // Anchor below the channel header, above the tab strip.
    const anchor =
      (await HR.waitFor('ytd-browse[page-subtype="channels"] #page-header')) ||
      (await HR.waitFor('#channel-header')) ||
      (await HR.waitFor('ytd-browse[page-subtype="channels"]'));
    if (!anchor) return;

    if (document.getElementById(PANEL_ID)?.dataset.ref === ref) return;

    const panel = HR.ui.panel({
      id: PANEL_ID,
      title: 'Hookrate — channel analytics',
      subtitle: 'estimates from public data',
    });
    panel.root.dataset.ref = ref;
    panel.loading('Reading channel…');
    anchor.insertAdjacentElement('afterend', panel.root);

    // Line the panel up with YouTube's own content column — measured from the
    // tab strip, not hardcoded, so it tracks sidebar and viewport changes.
    stopAligning?.();
    const reference = HR.ui.contentReference();
    if (reference) stopAligning = HR.ui.alignTo(panel.root, reference);

    try {
      const a = await HR.send('channel.analytics', { channel: ref, deep: true });
      panel.root.dataset.ref = ref;

      const head = el('div.hr-panel-badges', {}, [
        monetizationChip(a.monetization),
        a.hasShorts ? HR.ui.chip('Shorts', 'muted') : null,
        a.category ? HR.ui.chip(a.category, 'muted') : null,
        a.country ? HR.ui.chip(a.country, 'muted') : null,
      ]);

      panel.setBody(
        head,
        statsFor(a),
        eligibilityRow(a.monetization),
        a.topOutliers.length
          ? el('div.hr-subsection', {}, [
              el('div.hr-subsection-title', { text: 'Best performers' }),
              ...a.topOutliers.slice(0, 5).map((v) => HR.ui.videoRow(v, { onSave: (x) => saveVideo(x, a) })),
            ])
          : null
      );

      const actions = await actionsFor(a);
      panel.root.querySelector('.hr-panel-actions')?.replaceChildren(...actions);
      panel.setStatus('');

      // The verdict badge on the title and the Analysis tab in YouTube's own
      // strip. Neither is essential, so neither may break the panel.
      try {
        injectBadge(a);
        await injectTab(a);
      } catch (err) {
        HR.log('badge/tab injection failed', err);
      }
    } catch (err) {
      panel.error(err.message);
    }
  }

  HR.features = HR.features || {};
  HR.features.channel = { mount, unmount, PANEL_ID, TAB_ID, VIEW_ID, BADGE_ID };
})();
