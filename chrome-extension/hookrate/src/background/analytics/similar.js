// Similar-channel discovery.
//
// Honest limits: NexLev-class "similar channels" runs kNN over an embedding
// index of 150M channels. We have no index, so we approximate with three
// free signals and merge them:
//
//   1. Featured channels the target itself links to  (curated by the creator)
//   2. Channels YouTube surfaces in the target's related-video graph
//   3. A keyword search built from the channel's own title + top video titles
//
// Result quality is lower than an embedding index, but it costs nothing and
// needs no backend. Swap in a vector search later behind the same interface.

import * as yt from '../lib/innertube.js';
import * as cache from '../lib/cache.js';
import { find, findAll, text, num, videos as parseVideos } from '../lib/parse.js';
import * as channelApi from './channel.js';

const STOP = new Set(
  ('the a an and or of for to in on with my your this that how why what best top ' +
    'video videos channel official new full free vs is are was were be been it its ' +
    'i you we they he she them his her our their from at by as but not no yes do does ' +
    'did done can could will would should shall may might must have has had 2020 2021 ' +
    '2022 2023 2024 2025 2026 part ep episode shorts short live stream').split(/\s+/)
);

function keywords(strings, limit = 6) {
  const counts = new Map();
  for (const s of strings) {
    for (const raw of String(s || '').toLowerCase().split(/[^a-z0-9']+/)) {
      const w = raw.replace(/^'+|'+$/g, '');
      if (w.length < 4 || STOP.has(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

function channelResults(node) {
  const keys = ['channelRenderer', 'gridChannelRenderer', 'compactChannelRenderer'];
  const out = new Map();

  for (const key of keys) {
    for (const r of findAll(node, key)) {
      const id = r.channelId || find(r, 'browseId');
      if (!id || !/^UC[\w-]{22}$/.test(id)) continue;
      if (out.has(id)) continue;
      out.set(id, {
        channelId: id,
        title: text(r.title),
        handle: text(find(r, 'subscriberCountText')).startsWith('@')
          ? text(find(r, 'subscriberCountText'))
          : null,
        subscribers:
          num(r.subscriberCountText) ??
          num(r.videoCountText) ??
          null,
        avatar:
          findAll(r, 'thumbnails')
            .flat()
            .filter((t) => t && t.url)
            .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null,
        source: 'search',
      });
    }
  }
  return [...out.values()];
}

/** Channels the creator features on their own page. */
async function featured(channelId) {
  try {
    const { data } = await yt.page(`/channel/${channelId}/channels`);
    return channelResults(data).map((c) => ({ ...c, source: 'featured' }));
  } catch {
    return [];
  }
}

/** Channels appearing in the related-video graph of the target's top videos. */
async function fromRelated(videos) {
  const out = new Map();
  for (const v of videos.slice(0, 3)) {
    try {
      const res = await yt.next(v.videoId);
      for (const r of findAll(res, 'compactVideoRenderer')) {
        const id = find(r, 'browseId');
        const title = text(r.shortBylineText || r.longBylineText);
        if (!id || !/^UC[\w-]{22}$/.test(id) || out.has(id)) continue;
        out.set(id, { channelId: id, title, subscribers: null, avatar: null, source: 'related' });
      }
    } catch {
      /* skip */
    }
  }
  return [...out.values()];
}

/** Keyword search restricted to channel results. */
async function fromSearch(terms) {
  if (!terms.length) return [];
  // Search filter "type: channel". Raw protobuf param — not URL-encoded, it
  // travels in the JSON body.
  const res = await yt.search(terms.join(' '), 'EgIQAg').catch(() => null);
  return res ? channelResults(res) : [];
}

/**
 * Similar channels for a target, ranked.
 * Ranking favours channels found by more than one signal, then subscriber
 * proximity — a 500-sub channel is not a useful "similar" for a 5M channel.
 */
export async function channels(channelIdOrHandle, { limit = 20 } = {}) {
  const channelId = await channelApi.resolve(channelIdOrHandle);

  return cache.wrap('similar-channels', channelId, cache.TTL.day, async () => {
    const target = await channelApi.analytics(channelId, { deep: false });
    const terms = keywords([
      target.title,
      ...(target.keywords || []),
      ...target.videos.slice(0, 12).map((v) => v.title),
    ]);

    const [a, b, c] = await Promise.all([
      featured(channelId),
      fromRelated(target.videos),
      fromSearch(terms),
    ]);

    const merged = new Map();
    for (const row of [...a, ...b, ...c]) {
      if (row.channelId === channelId) continue;
      const prev = merged.get(row.channelId);
      if (prev) {
        prev.signals.add(row.source);
        prev.subscribers = prev.subscribers ?? row.subscribers;
        prev.avatar = prev.avatar || row.avatar;
        prev.title = prev.title || row.title;
      } else {
        merged.set(row.channelId, { ...row, signals: new Set([row.source]) });
      }
    }

    const targetSubs = target.subscribers || 0;
    const ranked = [...merged.values()]
      .map((row) => {
        const proximity =
          targetSubs && row.subscribers
            ? 1 / (1 + Math.abs(Math.log10((row.subscribers + 1) / (targetSubs + 1))))
            : 0.4;
        return {
          channelId: row.channelId,
          title: row.title,
          subscribers: row.subscribers,
          avatar: row.avatar,
          signals: [...row.signals],
          score: +(row.signals.size * 1.5 + proximity).toFixed(2),
        };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, limit);

    return { channelId, terms, results: ranked };
  });
}

/**
 * Visual thumbnail search is NOT implemented: it needs CLIP embeddings over an
 * indexed corpus, which means a backend. This falls back to title-keyword
 * search so the UI has something honest to show, and is labelled as such.
 */
export async function thumbnails(videoId, { limit = 12 } = {}) {
  const res = await yt.player(videoId).catch(() => null);
  const title = res?.videoDetails?.title || '';
  const terms = keywords([title, ...(res?.videoDetails?.keywords || [])], 5);
  const search = await yt.search(terms.join(' ')).catch(() => null);

  return {
    approximate: true,
    note: 'keyword match, not visual similarity (needs an embedding index)',
    terms,
    results: search
      ? parseVideos(search).filter((v) => v.videoId !== videoId).slice(0, limit)
      : [],
  };
}
