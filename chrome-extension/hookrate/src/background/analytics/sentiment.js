// Comment fetching + sentiment.
//
// Sentiment is lexicon-based on purpose: it runs offline, costs nothing, needs
// no API key, and is auditable — every score traces back to matched words.
// It is weaker than a model on sarcasm. Treated as a signal, not a verdict.

import * as yt from '../lib/innertube.js';
import * as cache from '../lib/cache.js';
import { find, findAll, text, num } from '../lib/parse.js';

const POS = {
  amazing: 3, awesome: 3, excellent: 3, perfect: 3, love: 3, brilliant: 3,
  fantastic: 3, incredible: 3, best: 2, great: 2, good: 2, nice: 2, helpful: 2,
  clear: 2, useful: 2, thanks: 2, thank: 2, appreciate: 2, underrated: 2,
  banger: 3, goated: 3, fire: 2, clean: 1, solid: 2, quality: 2, insightful: 3,
  masterpiece: 3, gem: 2, respect: 2, legend: 2, inspiring: 3, hilarious: 2,
  funny: 2, beautiful: 2, works: 1, worked: 1, finally: 1, subscribed: 2,
  deserves: 2, wow: 2, lifesaver: 3, saved: 2, congrats: 2, please: 0,
};

const NEG = {
  terrible: -3, awful: -3, garbage: -3, trash: -3, worst: -3, hate: -3,
  useless: -3, scam: -3, clickbait: -3, misleading: -3, boring: -2, bad: -2,
  wrong: -2, broken: -2, confusing: -2, unclear: -2, waste: -3, annoying: -2,
  cringe: -2, disappointed: -3, disappointing: -3, stupid: -2, dumb: -2,
  spam: -2, fake: -3, lies: -3, lying: -3, stolen: -3, stole: -2, ripoff: -3,
  outdated: -2, failed: -2, error: -1, problem: -1, issue: -1, sucks: -3,
  unwatchable: -3, ads: -1, adblock: -1, overrated: -2, mid: -1,
};

const NEGATORS = new Set(['not', "don't", 'dont', 'never', 'no', "isn't", 'isnt', "wasn't", 'cant', "can't"]);
const BOOSTERS = new Set(['very', 'really', 'so', 'super', 'absolutely', 'extremely', 'insanely']);

/** Score one comment. Returns { score, label, matches }. */
export function scoreText(input) {
  const words = String(input || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^a-z']+/)
    .filter(Boolean);

  let score = 0;
  const matches = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const base = POS[w] ?? NEG[w];
    if (base === undefined || base === 0) continue;

    let value = base;
    const prev = words[i - 1];
    const prev2 = words[i - 2];
    if (BOOSTERS.has(prev)) value *= 1.5;
    if (NEGATORS.has(prev) || NEGATORS.has(prev2)) value *= -0.8;

    score += value;
    matches.push({ word: w, value: +value.toFixed(2) });
  }

  // Emoji carry real signal in YouTube comments.
  const s = String(input || '');
  const emoji = [
    [/[\u{1F600}-\u{1F60F}\u{1F970}\u{2764}\u{1F525}\u{1F44F}\u{1F4AA}]/gu, 1.5],
    [/[\u{1F621}\u{1F624}\u{1F92C}\u{1F44E}\u{1F4A9}]/gu, -2],
  ];
  for (const [re, weight] of emoji) {
    const n = (s.match(re) || []).length;
    if (n) {
      score += Math.min(n, 3) * weight;
      matches.push({ word: 'emoji', value: Math.min(n, 3) * weight });
    }
  }

  const label = score >= 1.5 ? 'positive' : score <= -1.5 ? 'negative' : 'neutral';
  return { score: +score.toFixed(2), label, matches };
}

/** Find the continuation token that opens the comments section. */
function commentsToken(nextResponse) {
  const sections = findAll(nextResponse, 'itemSectionRenderer').filter(
    (s) => s.sectionIdentifier === 'comment-item-section'
  );
  const scope = sections.length ? sections : [nextResponse];
  for (const s of scope) {
    const token =
      findAll(s, 'continuationCommand').map((c) => c.token).find(Boolean) ||
      findAll(s, 'nextContinuationData').map((c) => c.continuation).find(Boolean);
    if (token) return token;
  }
  return null;
}

/** Normalise both the legacy commentRenderer and the entity-payload shape. */
function extractComments(response) {
  const out = [];

  for (const c of findAll(response, 'commentRenderer')) {
    out.push({
      author: text(c.authorText),
      text: text(c.contentText),
      likes: num(c.voteCount) || 0,
      replies: num(find(c, 'replyCount')) || 0,
      publishedText: text(c.publishedTimeText),
      pinned: !!find(c, 'pinnedCommentBadgeRenderer'),
    });
  }

  const mutations = findAll(response, 'mutations').flat();
  for (const m of mutations) {
    const p = m?.payload?.commentEntityPayload;
    if (!p) continue;
    out.push({
      author: p.author?.displayName || '',
      text: p.properties?.content?.content || '',
      likes: num(p.toolbar?.likeCountLiked || p.toolbar?.likeCountNotliked) || 0,
      replies: num(p.toolbar?.replyCount) || 0,
      publishedText: p.properties?.publishedTime || '',
      pinned: false,
    });
  }

  const seen = new Set();
  return out.filter((c) => {
    const key = `${c.author}|${c.text.slice(0, 40)}`;
    if (!c.text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Fetch up to `limit` top comments for a video. */
export async function comments(videoId, limit = 100) {
  return cache.wrap('comments', `${videoId}:${limit}`, cache.TTL.day, async () => {
    const next = await yt.next(videoId);
    let token = commentsToken(next);
    if (!token) return [];

    let all = [];
    let guard = 0;
    while (all.length < limit && token && guard++ < 5) {
      let res;
      try {
        res = await yt.browse({ continuation: token });
      } catch (err) {
        // Comments live behind a continuation, so this is the one feature with
        // no HTML fallback. Return whatever earlier pages gave us.
        if (!all.length) throw err;
        break;
      }
      const batch = extractComments(res);
      if (!batch.length) break;
      all = all.concat(batch);
      token = findAll(res, 'continuationCommand').map((c) => c.token).find(Boolean);
    }
    return all.slice(0, limit);
  });
}

/** Aggregate sentiment across a video's comments. */
export async function analyse(videoId, limit = 100) {
  const rows = await comments(videoId, limit);
  if (!rows.length) {
    return { videoId, sampled: 0, available: false };
  }

  const scored = rows.map((c) => ({ ...c, sentiment: scoreText(c.text) }));
  const counts = { positive: 0, neutral: 0, negative: 0 };
  let weighted = 0;
  let weight = 0;

  for (const c of scored) {
    counts[c.sentiment.label]++;
    // A comment with 400 likes represents more viewers than one with 0.
    const w = 1 + Math.log10(1 + (c.likes || 0));
    weighted += c.sentiment.score * w;
    weight += w;
  }

  const pct = (n) => +((n / scored.length) * 100).toFixed(1);
  const avg = weight ? weighted / weight : 0;

  const words = new Map();
  for (const c of scored) {
    for (const m of c.sentiment.matches) {
      if (m.word === 'emoji') continue;
      words.set(m.word, (words.get(m.word) || 0) + 1);
    }
  }

  return {
    videoId,
    available: true,
    sampled: scored.length,
    positivePct: pct(counts.positive),
    neutralPct: pct(counts.neutral),
    negativePct: pct(counts.negative),
    weightedScore: +avg.toFixed(2),
    verdict: avg >= 1 ? 'positive' : avg <= -0.5 ? 'negative' : 'mixed',
    topWords: [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    topComments: scored
      .slice()
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .slice(0, 5)
      .map((c) => ({ author: c.author, text: c.text.slice(0, 240), likes: c.likes, label: c.sentiment.label })),
    mostNegative: scored
      .slice()
      .sort((a, b) => a.sentiment.score - b.sentiment.score)
      .slice(0, 3)
      .map((c) => ({ author: c.author, text: c.text.slice(0, 240), score: c.sentiment.score })),
  };
}
