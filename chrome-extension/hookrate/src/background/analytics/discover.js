// Discovery — the free-tier stand-in for a niche finder.
//
// A real niche finder queries a pre-built index of every channel. Without that
// index we run YouTube's own search, then enrich and filter the results with
// the same maths the channel panel uses. Narrower recall, same rigour.

import * as yt from '../lib/innertube.js';
import * as cache from '../lib/cache.js';
import { videos as parseVideos, findAll, find, text, num } from '../lib/parse.js';
import * as channelApi from './channel.js';
import * as outliers from './outliers.js';
import * as rpm from './rpm.js';

// Pre-encoded protobuf search params. YouTube's own filter chips produce these.
export const SEARCH_FILTERS = {
  relevance: '',
  viewCount: 'CAMSAhAB',
  uploadDate: 'CAI',
  rating: 'CAE',
  thisWeek: 'EgQIAxAB',
  thisMonth: 'EgQIBBAB',
  thisYear: 'EgQIBRAB',
  under4min: 'EgQQARgB',
  over20min: 'EgQQARgC',
  channelsOnly: 'EgIQAg',
};

/** Raw keyword search returning normalised videos. */
export async function search(query, { filter = '', limit = 40 } = {}) {
  const params = SEARCH_FILTERS[filter] ?? filter;
  return cache.wrap('search', `${query}|${params}|${limit}`, cache.TTL.hour * 3, async () => {
    const res = await yt.search(query, params || undefined);
    const now = Date.now();
    const rows = parseVideos(res, now);

    // Attach the uploading channel where search gave it to us.
    const byId = new Map(rows.map((r) => [r.videoId, r]));
    for (const r of findAll(res, 'videoRenderer')) {
      const row = byId.get(r.videoId);
      if (!row) continue;
      row.channelId = find(r.ownerText || r.longBylineText || {}, 'browseId') || null;
      row.channelTitle = text(r.ownerText || r.longBylineText);
    }
    return rows.slice(0, limit);
  });
}

/**
 * Keyword research with channel enrichment.
 *
 * Filters mirror the ones a niche hunter actually uses: small channels getting
 * big views, recent uploads, monetisable geographies.
 */
export async function niche(query, opts = {}) {
  const {
    filter = 'viewCount',
    limit = 30,
    maxSubscribers = 0,
    minViews = 0,
    maxChannelAgeDays = 0,
    enrich = 12,
  } = opts;

  const rows = await search(query, { filter, limit });
  const settings = (await chrome.storage.local.get('hr:settings'))['hr:settings'] || {};

  // Enrichment costs one channel fetch each, so it is capped and sequential.
  const channelIds = [...new Set(rows.map((r) => r.channelId).filter(Boolean))].slice(0, enrich);
  const channels = new Map();

  for (const id of channelIds) {
    try {
      const a = await channelApi.analytics(id, { deep: false });
      channels.set(id, a);
    } catch {
      /* skip unresolvable channels */
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const enriched = rows.map((row) => {
    const ch = row.channelId ? channels.get(row.channelId) : null;
    const base = ch ? outliers.baseline(ch.videos, { shorts: row.isShort }) : null;
    return {
      ...row,
      channel: ch
        ? {
            channelId: ch.channelId,
            title: ch.title,
            subscribers: ch.subscribers,
            ageDays: ch.ageDays,
            country: ch.country,
            uploadsPerMonth: ch.uploadsPerMonth,
            avgViews: ch.avgViews,
            monetizedGuess: ch.subscribers >= 1000,
          }
        : null,
      outlier: base ? outliers.score(row.views, base) : null,
      revenue: rpm.revenue(row.views, {
        category: ch?.category,
        country: ch?.country,
        shorts: row.isShort,
        overrides: settings.rpm || {},
      }),
    };
  });

  const filtered = enriched.filter((r) => {
    if (minViews && (r.views || 0) < minViews) return false;
    if (maxSubscribers && r.channel && r.channel.subscribers > maxSubscribers) return false;
    if (maxChannelAgeDays && r.channel?.ageDays && r.channel.ageDays > maxChannelAgeDays) {
      return false;
    }
    return true;
  });

  // Rank by views-per-subscriber: the classic "punching above its weight" cut.
  const ranked = filtered
    .map((r) => ({
      ...r,
      leverage:
        r.channel?.subscribers && r.views
          ? +(r.views / r.channel.subscribers).toFixed(2)
          : null,
    }))
    .sort((a, b) => (b.leverage || 0) - (a.leverage || 0));

  return {
    query,
    filter,
    scanned: rows.length,
    enrichedChannels: channels.size,
    results: ranked,
    note: channels.size < channelIds.length
      ? 'some channels could not be enriched and were left unfiltered'
      : null,
  };
}

/** Search suggestions — a free proxy for relative keyword demand. */
export async function suggestions(prefix) {
  const url =
    'https://suggestqueries-clients6.youtube.com/complete/search' +
    `?client=youtube&ds=yt&hl=en&q=${encodeURIComponent(prefix)}`;
  try {
    const res = await fetch(url, { credentials: 'omit' });
    const body = await res.text();
    // JSONP: window.google.ac.h([...])
    const json = JSON.parse(body.slice(body.indexOf('(') + 1, body.lastIndexOf(')')));
    return (json[1] || []).map((row) => row[0]).filter((s) => typeof s === 'string');
  } catch {
    return [];
  }
}

/** Trending-adjacent: what a keyword's top channels uploaded most recently. */
export async function fresh(query, limit = 20) {
  return search(query, { filter: 'uploadDate', limit });
}

/** Channel-only search, for finding competitors by name or topic. */
export async function channels(query, limit = 20) {
  const res = await yt.search(query, SEARCH_FILTERS.channelsOnly);
  const out = [];
  for (const key of ['channelRenderer', 'gridChannelRenderer']) {
    for (const r of findAll(res, key)) {
      const id = r.channelId || find(r, 'browseId');
      if (!id) continue;
      out.push({
        channelId: id,
        title: text(r.title),
        subscribers: num(r.subscriberCountText),
        videoCount: num(r.videoCountText),
        description: text(find(r, 'descriptionSnippet')),
      });
    }
  }
  return out.slice(0, limit);
}
