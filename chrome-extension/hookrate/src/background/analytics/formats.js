// Format clustering.
//
// The outlier score answers "did this video beat the channel?". The more useful
// question is "does this FORMAT beat the channel?", because a format is the
// repeatable unit — you cannot re-upload a lucky video, but you can shoot
// another one in a format that works.
//
// Clusters come from recurring title n-grams plus duration bands. No model and
// no network: this runs on the video list the channel panel already fetched.

import { median } from './outliers.js';

const DURATION_BANDS = [
  { id: 'short', label: 'Shorts (≤60s)', max: 60 },
  { id: 'quick', label: '1–4 min', max: 240 },
  { id: 'mid', label: '4–10 min', max: 600 },
  { id: 'long', label: '10–20 min', max: 1200 },
  { id: 'xlong', label: '20–40 min', max: 2400 },
  { id: 'epic', label: '40 min+', max: Infinity },
];

// Words that carry no format signal. Deliberately short: over-filtering throws
// away the very phrases that define a series ("how to", "i tried", "part").
const STOP = new Set(
  ('a an the and or of for to in on at by with from is are was were be been am ' +
    'this that these those it its as if then than so very just really new full ' +
    'official video vs 2020 2021 2022 2023 2024 2025 2026').split(/\s+/)
);

/**
 * Split a title into its segments.
 *
 * Titles on established channels are templated: "<hook> | CID | New Season |".
 * The hook is the only part that varies, so segments must be kept apart —
 * building n-grams across a delimiter invents phrases like "season best" that
 * appear in no title at all, and those fake phrases then form fake clusters.
 */
function segments(title) {
  return String(title || '')
    .split(/[|•·]|(?:\s[-–—:]\s)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\[\]()"“”‘’_,.!?:;#*]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w && w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
}

function ngrams(list, n) {
  const out = [];
  for (let i = 0; i + n <= list.length; i++) out.push(list.slice(i, i + n).join(' '));
  return out;
}

/** Normalised segment text, for detecting repeated boilerplate. */
function segKey(segment) {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bandFor(durationSec, isShort) {
  if (isShort || (durationSec != null && durationSec <= 60)) return DURATION_BANDS[0];
  if (durationSec == null) return null;
  return DURATION_BANDS.find((b) => durationSec <= b.max) || DURATION_BANDS[DURATION_BANDS.length - 1];
}

function summarise(label, kind, members, baseline) {
  const views = members.map((v) => v.views).filter(Number.isFinite);
  if (!views.length) return null;
  const med = median(views);
  const best = members.slice().sort((a, b) => (b.views || 0) - (a.views || 0))[0];

  const durations = members.map((v) => v.durationSec).filter(Number.isFinite);

  return {
    label,
    kind,
    count: members.length,
    medianViews: med,
    // Lift is against the channel's own median, so it reads on the same scale
    // as the per-video outlier multiplier users already know.
    lift: baseline ? +(med / baseline).toFixed(2) : null,
    totalViews: views.reduce((a, b) => a + b, 0),
    avgDurationSec: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    best: best ? { videoId: best.videoId, title: best.title, views: best.views } : null,
    videoIds: members.map((v) => v.videoId),
  };
}

/**
 * Cluster one set of videos (all long-form, or all Shorts — never mixed, since
 * mixing makes every Short look like a hit).
 */
function clusterKind(videos, { minCluster = 3 } = {}) {
  const scored = videos.filter((v) => Number.isFinite(v.views));
  if (scored.length < minCluster * 2) return { baseline: null, formats: [], bands: [] };

  const baseline = median(scored.map((v) => v.views));

  // Step 1: find the title template. Any segment repeated across at least a
  // third of uploads is branding — "| CID |", "| New Season |" — and describes
  // the channel rather than a format inside it.
  const segCounts = new Map();
  for (const v of scored) {
    for (const key of new Set(segments(v.title).map(segKey))) {
      if (key) segCounts.set(key, (segCounts.get(key) || 0) + 1);
    }
  }
  const templateFloor = Math.max(minCluster, Math.ceil(scored.length * 0.33));
  const template = [...segCounts.entries()]
    .filter(([, n]) => n >= templateFloor)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => ({ segment: key, count: n }));
  const boilerplate = new Set(template.map((t) => t.segment));

  // Step 2: n-grams from the remaining segments only, never spanning a
  // delimiter.
  const docCount = new Map();
  const perVideo = scored.map((v) => {
    const grams = new Set();
    for (const seg of segments(v.title)) {
      if (boilerplate.has(segKey(seg))) continue;
      const t = tokens(seg);
      for (const g of [...ngrams(t, 3), ...ngrams(t, 2)]) grams.add(g);
    }
    for (const g of grams) docCount.set(g, (docCount.get(g) || 0) + 1);
    return { video: v, grams: [...grams] };
  });

  // A phrase that survived the template filter but still appears in most
  // titles has no discriminating power either.
  const ceiling = Math.max(minCluster, Math.floor(scored.length * 0.6));
  const viable = new Map(
    [...docCount.entries()].filter(([, n]) => n >= minCluster && n <= ceiling)
  );

  // Assign each video to its most specific viable phrase: prefer 3-grams over
  // 2-grams, then the more frequent phrase.
  const assigned = new Map();
  const leftovers = [];

  for (const { video, grams } of perVideo) {
    let best = null;
    for (const g of grams) {
      const n = viable.get(g);
      if (!n) continue;
      const words = g.split(' ').length;
      const score = words * 1000 + n;
      if (!best || score > best.score) best = { gram: g, score };
    }
    if (best) {
      if (!assigned.has(best.gram)) assigned.set(best.gram, []);
      assigned.get(best.gram).push(video);
    } else {
      leftovers.push(video);
    }
  }

  const formats = [...assigned.entries()]
    .filter(([, members]) => members.length >= minCluster)
    .map(([gram, members]) => summarise(`"${gram}"`, 'title', members, baseline))
    .filter(Boolean)
    .sort((a, b) => (b.lift || 0) - (a.lift || 0));

  // Duration bands are always computed: they work even when titles are noisy.
  const byBand = new Map();
  for (const v of scored) {
    const band = bandFor(v.durationSec, v.isShort);
    if (!band) continue;
    if (!byBand.has(band.id)) byBand.set(band.id, { band, members: [] });
    byBand.get(band.id).members.push(v);
  }

  const bands = [...byBand.values()]
    .filter(({ members }) => members.length >= 2)
    .map(({ band, members }) => summarise(band.label, 'duration', members, baseline))
    .filter(Boolean)
    .sort((a, b) => (b.lift || 0) - (a.lift || 0));

  return {
    baseline,
    sampled: scored.length,
    unclustered: leftovers.length,
    // The template is worth surfacing on its own: it is the channel's naming
    // convention, and a new upload that ignores it looks off-brand in the feed.
    template,
    formats,
    bands,
  };
}

/**
 * Cluster a channel's uploads.
 * @param {Array} videos normalised videos from parse.js
 * @returns {{longForm: object, shorts: object, note: string|null}}
 */
export function clusters(videos = [], opts = {}) {
  const longForm = videos.filter((v) => !v.isShort);
  const shorts = videos.filter((v) => v.isShort);

  return {
    longForm: clusterKind(longForm, opts),
    shorts: clusterKind(shorts, opts),
    note:
      videos.length < 12
        ? 'few uploads sampled — clusters need at least 3 videos each to mean anything'
        : null,
  };
}

/**
 * Which title phrases correlate with outperformance, as a flat ranked list.
 * Useful on its own: it answers "what should I make next" more directly than a
 * per-video score does.
 */
export function lift(videos = [], { limit = 12, minCluster = 3 } = {}) {
  const both = clusters(videos, { minCluster });
  const rows = [
    ...both.longForm.formats.map((f) => ({ ...f, kind: 'title', scope: 'long-form' })),
    ...both.shorts.formats.map((f) => ({ ...f, kind: 'title', scope: 'shorts' })),
  ];
  return rows.sort((a, b) => (b.lift || 0) - (a.lift || 0)).slice(0, limit);
}

export { DURATION_BANDS };
