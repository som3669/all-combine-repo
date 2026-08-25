// Resilient parsers for YouTube's ytInitialData / InnerTube responses.
// Strategy: never rely on deep fixed paths. Search by renderer key instead —
// YouTube reshuffles the tree constantly but keeps renderer names stable.

const BACKSLASH = String.fromCharCode(92);

/** Collect every value stored under `key`, at any depth. */
export function findAll(node, key, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const v of node) findAll(v, key, out);
    return out;
  }
  for (const k in node) {
    if (k === key) out.push(node[k]);
    findAll(node[k], key, out);
  }
  return out;
}

/** First value stored under `key`, or undefined. */
export function find(node, key) {
  return findAll(node, key)[0];
}

/** Flatten a `{simpleText}` / `{runs:[…]}` text node to a plain string. */
export function text(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || '').join('');
  if (node.content) return text(node.content);
  return '';
}

const SUFFIX = { k: 1e3, m: 1e6, b: 1e9 };

/** "1.2M subscribers" -> 1200000. "12,345 views" -> 12345. */
export function num(input) {
  const s = text(input).replace(new RegExp(String.fromCharCode(160),'g'),' ').trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/([\d.,]+)\s*([kmb])?/);
  if (!m) return null;
  const raw = m[1].replace(/,/g, '');
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (SUFFIX[m[2]] || 1));
}

/** "12:34" / "1:02:03" -> seconds. */
export function duration(input) {
  const s = text(input).trim();
  if (!s || !/^\d+(:\d{2})+$/.test(s)) return null;
  return s
    .split(':')
    .map(Number)
    .reduce((acc, part) => acc * 60 + part, 0);
}

/** "3 years ago" / "2 days ago" -> approx epoch ms. */
export function relativeDate(input, now = Date.now()) {
  const s = text(input).toLowerCase();
  const m = s.match(/(\d+)\s*(second|minute|hour|day|week|month|year)/);
  if (!m) return null;
  const unit = {
    second: 1e3,
    minute: 60e3,
    hour: 3600e3,
    day: 864e5,
    week: 6048e5,
    month: 2592e6,
    year: 31536e6,
  }[m[2]];
  return now - Number(m[1]) * unit;
}

/**
 * Pull a JSON object literal that follows `marker` in a page's HTML.
 * Brace-matched rather than regex-greedy, so nested `};` inside strings
 * cannot truncate the payload.
 */
export function extractJson(html, marker) {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const start = html.indexOf('{', at);
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === BACKSLASH) esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Flatten a contentMetadataViewModel into its text parts, in order.
 *
 * This is the shape YouTube moved to: instead of named fields like
 * `viewCountText` and `publishedTimeText`, a card now carries an ordered list
 * of anonymous strings — "372 views", "24 minutes ago" — and the caller has to
 * recognise them. Same for channel headers: "29.1M subscribers", "22K videos".
 */
export function metadataParts(node) {
  const out = [];
  for (const block of findAll(node, 'contentMetadataViewModel')) {
    for (const row of block.metadataRows || []) {
      for (const part of row.metadataParts || []) {
        const value = part && part.text && part.text.content;
        if (value) out.push(value);
      }
    }
  }
  return out;
}

/** lockupViewModel — the current shape for a long-form card. */
function fromLockup(lu, now) {
  const id = lu.contentId;
  if (!id || !/^[\w-]{11}$/.test(id)) return null;

  const meta = (lu.metadata && lu.metadata.lockupMetadataViewModel) || {};
  const parts = metadataParts(meta);
  const viewsText = parts.find((p) => /view/i.test(p));
  const ageText = parts.find((p) => /ago\s*$/i.test(p));

  // Duration lives in a thumbnail badge, alongside badges for "LIVE", "NEW"
  // and so on — so match the shape of a timestamp rather than taking the first.
  const durationText = findAll(lu.contentImage || {}, 'thumbnailBadgeViewModel')
    .map((b) => (b && b.text ? String(b.text).trim() : ''))
    .find((t) => /^\d{1,3}(:\d{2}){1,2}$/.test(t));

  const durationSec = duration(durationText);
  const isShort =
    /SHORT/i.test(lu.contentType || '') ||
    (durationSec != null && durationSec <= 60);

  return {
    videoId: id,
    title: text(meta.title),
    views: num(viewsText),
    durationSec,
    publishedText: ageText || '',
    publishedAt: relativeDate(ageText, now),
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    isShort,
  };
}

/** shortsLockupViewModel — the current shape for a Shorts card. */
function fromShortsLockup(s, now) {
  const id =
    String(s.entityId || '').replace(/^shorts-shelf-item-/, '') ||
    findAll(s, 'videoId').find(Boolean);
  if (!id || !/^[\w-]{11}$/.test(id)) return null;

  const overlay = s.overlayMetadata || {};
  return {
    videoId: id,
    title: text(overlay.primaryText) || text(s.accessibilityText),
    // Shorts cards carry a view count but no upload date. Leaving publishedAt
    // null is correct — inventing one would poison the age filters.
    views: num(text(overlay.secondaryText)),
    durationSec: null,
    publishedText: '',
    publishedAt: null,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    isShort: true,
  };
}

/** Normalise a videoRenderer / gridVideoRenderer / richItem into one shape. */
export function video(renderer, now = Date.now()) {
  if (!renderer || !renderer.videoId) return null;
  const views =
    num(renderer.viewCountText) ??
    num(renderer.shortViewCountText) ??
    num(find(renderer, 'viewCount'));

  return {
    videoId: renderer.videoId,
    title: text(renderer.title),
    views,
    durationSec:
      duration(renderer.lengthText) ??
      (renderer.thumbnailOverlays ? duration(find(renderer, 'text')) : null),
    publishedText: text(renderer.publishedTimeText),
    publishedAt: relativeDate(renderer.publishedTimeText, now),
    thumbnail: `https://i.ytimg.com/vi/${renderer.videoId}/hqdefault.jpg`,
    isShort:
      JSON.stringify(renderer.thumbnailOverlays || '').includes('SHORTS') ||
      (renderer.navigationEndpoint &&
        JSON.stringify(renderer.navigationEndpoint).includes('reel')),
  };
}

/**
 * Every video found anywhere in a response, de-duplicated by id.
 *
 * Order matters: the view-model shapes are what YouTube ships today, so they
 * are read first and win on conflict. The legacy renderers stay because older
 * surfaces (playlists, some watch-page shelves) still use them.
 */
export function videos(node, now = Date.now()) {
  const seen = new Map();
  const add = (v) => {
    if (v && v.videoId && !seen.has(v.videoId)) seen.set(v.videoId, v);
  };

  for (const lu of findAll(node, 'lockupViewModel')) add(fromLockup(lu, now));
  for (const s of findAll(node, 'shortsLockupViewModel')) add(fromShortsLockup(s, now));

  const legacy = [
    'videoRenderer',
    'gridVideoRenderer',
    'compactVideoRenderer',
    'playlistVideoRenderer',
    'reelItemRenderer',
  ];
  for (const key of legacy) {
    for (const r of findAll(node, key)) {
      const id =
        r.videoId ||
        String(r.entityId || '').replace(/^shorts-shelf-item-/, '') ||
        find(r, 'videoId');
      if (!id) continue;
      add(video({ ...r, videoId: id }, now));
    }
  }

  return [...seen.values()];
}
