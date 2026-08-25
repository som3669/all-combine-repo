// Comment request mining.
//
// A comment section is a demand queue nobody reads systematically. "please make
// part 2", "can you cover X", "tutorial on Y" — each one is a viewer telling you
// what they would watch, weighted by how many people liked them saying it.
//
// Pattern-based, offline, and auditable: every mined row keeps the comment it
// came from so a human can check it. Reuses the comment fetch in sentiment.js,
// so a video already analysed for sentiment costs nothing extra.

import * as sentiment from './sentiment.js';
import * as cache from '../lib/cache.js';

// Order matters: the first matching trigger claims the comment. Specific
// intents go first, because "please make part 2" is a sequel request, not a
// generic one — matching it as generic scatters one demand across three rows.
const TRIGGERS = [
  { kind: 'sequel', re: /\bpart\s*(\d+)\b/i },
  { kind: 'sequel', re: /\bsequel\b(.{0,60})/i },
  { kind: 'sequel', re: /\b(?:waiting for|need|want)\s+(?:the\s+)?(?:next|part\s*\d+)\b(.{0,60})/i },
  { kind: 'sequel', re: /\bnext\s+(?:part|episode|video)\b(.{0,60})/i },
  { kind: 'request', re: /\b(?:please|pls|plz)\s+(?:make|do|upload|cover|try)\s+(.{3,90})/i },
  { kind: 'request', re: /\bcan you (?:please )?(?:make|do|cover|review|try|explain)\s+(.{3,90})/i },
  { kind: 'request', re: /\b(?:make|do)\s+a\s+(?:video|vid|part|tutorial|review|series)\s+(?:on|about|for)\s+(.{3,90})/i },
  { kind: 'request', re: /\btutorial\s+(?:on|for|about)\s+(.{3,90})/i },
  { kind: 'request', re: /\b(?:i|we)\s+(?:would love|wanna|want)\s+to see\s+(.{3,90})/i },
  { kind: 'more', re: /\bmore\s+(?:of\s+)?(?:this|these|such|videos?)\s*(.{0,60})/i },
  { kind: 'timing', re: /\bwhen\s+(?:is|will|are you|do you)\b(.{0,70})/i },
  { kind: 'question', re: /\b(?:how|what|which|why)\s+(?:do|did|does|can|should)\s+(?:you|i|we)\s+(.{3,90})/i },
];

/** Normalised key so "make part 2" and "part 2 please" collapse together. */
function signature(text) {
  const STOP = new Set(
    'please pls plz can you make do a an the video vid on about for more of this these next i we would love to see want wanna need waiting'.split(
      /\s+/
    )
  );
  return [
    ...new Set(
      String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w))
    ),
  ]
    .sort()
    .slice(0, 4)
    .join(' ');
}

// When the capture group carries no content of its own, the intent is still
// clear from which trigger fired. Canonical labels keep those rows grouped
// together instead of scattering across whatever filler words got captured
// ("please", "2", "sequel upload" are all one request: make the next part).
const CANONICAL = {
  sequel: { key: 'next part / sequel', label: 'next part or sequel' },
  more: { key: 'more of the same', label: 'more videos like this' },
  timing: { key: 'when is the next one', label: 'when is the next upload' },
  request: { key: 'unspecified request', label: 'a request with no clear subject' },
  question: { key: 'question', label: 'a question' },
};

function mine(comments) {
  const rows = [];

  for (const c of comments) {
    const text = String(c.text || '');
    if (text.length > 600) continue; // long essays are rarely a request

    for (const trigger of TRIGGERS) {
      const m = text.match(trigger.re);
      if (!m) continue;

      const captured = (m[1] || '').trim().replace(/\s+/g, ' ');
      let ask = captured || m[0].trim();
      let sig = signature(captured);

      // "part 2" arrives as a bare digit from its own trigger; normalise it so
      // it merges with "please make part 2" from the request trigger.
      if (trigger.kind === 'sequel') {
        const partNo = text.match(/\bpart\s*(\d+)\b/i);
        ask = partNo ? `part ${partNo[1]}` : 'next part';
        sig = CANONICAL.sequel.key;
      } else if (!sig) {
        // Nothing meaningful captured — fall back to intent, not to filler.
        ask = CANONICAL[trigger.kind].label;
        sig = CANONICAL[trigger.kind].key;
      }

      rows.push({
        kind: trigger.kind,
        ask,
        // Keep the whole comment: the capture group is a hint, the comment is
        // the evidence.
        comment: text.slice(0, 300),
        author: c.author,
        likes: c.likes || 0,
        signature: sig,
      });
      break; // first matching trigger wins, so one comment counts once
    }
  }
  return rows;
}

/** Timestamps viewers quote — where they paused, rewound or got confused. */
function timestamps(comments) {
  const buckets = new Map();

  for (const c of comments) {
    for (const m of String(c.text || '').matchAll(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g)) {
      const parts = m[3]
        ? [Number(m[1]), Number(m[2]), Number(m[3])]
        : [0, Number(m[1]), Number(m[2])];
      const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (seconds > 6 * 3600) continue; // not a timestamp

      // 15-second buckets: viewers quoting "the same moment" rarely agree to
      // the second.
      const bucket = Math.floor(seconds / 15) * 15;
      if (!buckets.has(bucket)) buckets.set(bucket, { seconds: bucket, count: 0, likes: 0, examples: [] });
      const row = buckets.get(bucket);
      row.count++;
      row.likes += c.likes || 0;
      if (row.examples.length < 3) {
        row.examples.push({ author: c.author, text: String(c.text).slice(0, 180) });
      }
    }
  }

  const stamp = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  };

  return [...buckets.values()]
    .filter((r) => r.count >= 2)
    .map((r) => ({ ...r, at: stamp(r.seconds) }))
    .sort((a, b) => b.count - a.count || b.likes - a.likes)
    .slice(0, 12);
}

/** Group mined rows by signature and rank by demand. */
function group(rows, limit) {
  const byKey = new Map();

  for (const r of rows) {
    const key = r.signature || r.ask.toLowerCase().slice(0, 40);
    if (!byKey.has(key)) {
      byKey.set(key, { key, kind: r.kind, count: 0, likes: 0, asks: new Set(), examples: [] });
    }
    const row = byKey.get(key);
    row.count++;
    row.likes += r.likes;
    // Keep the distinct phrasings: "part 2" and "part 3" group together but are
    // worth reading separately.
    if (row.asks.size < 4) row.asks.add(r.ask);
    if (row.examples.length < 3) {
      row.examples.push({ author: r.author, comment: r.comment, likes: r.likes });
    }
  }

  return [...byKey.values()]
    .map((row) => ({
      ...row,
      asks: [...row.asks],
      // Demand = how many people asked, weighted by how many agreed with them.
      // Log-scaled so one 5,000-like comment cannot bury ten separate askers.
      demand: +(row.count * (1 + Math.log10(1 + row.likes))).toFixed(2),
    }))
    .sort((a, b) => b.demand - a.demand)
    .slice(0, limit);
}

/**
 * Mine one video's comments.
 * @returns {{videoId, sampled, requests, grouped, timestamps, available}}
 */
export async function forVideo(videoId, { limit = 150, groups = 15 } = {}) {
  return cache.wrap('requests', `${videoId}:${limit}`, cache.TTL.day, async () => {
    const comments = await sentiment.comments(videoId, limit);
    if (!comments.length) {
      return { videoId, available: false, sampled: 0, requests: [], grouped: [], timestamps: [] };
    }

    const rows = mine(comments);
    return {
      videoId,
      available: true,
      sampled: comments.length,
      requests: rows.sort((a, b) => b.likes - a.likes).slice(0, 40),
      grouped: group(rows, groups),
      timestamps: timestamps(comments),
    };
  });
}

/**
 * Mine across a channel's best videos — the content-idea queue.
 * Capped and throttled: this is one comment fetch per video.
 */
export async function forChannel({ channelId, videos = [], videoLimit = 5, commentLimit = 120 }) {
  const targets = videos
    .filter((v) => Number.isFinite(v.views))
    .sort((a, b) => b.views - a.views)
    .slice(0, videoLimit);

  const all = [];
  const perVideo = [];

  for (const v of targets) {
    try {
      const res = await forVideo(v.videoId, { limit: commentLimit });
      if (res.available) {
        all.push(...res.requests);
        perVideo.push({
          videoId: v.videoId,
          title: v.title,
          views: v.views,
          sampled: res.sampled,
          found: res.requests.length,
        });
      }
    } catch {
      /* a video with comments disabled is not an error worth failing on */
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  return {
    channelId: channelId || null,
    videosScanned: perVideo.length,
    requestsFound: all.length,
    perVideo,
    grouped: group(all, 25),
  };
}
