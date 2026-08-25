// Hookrate service worker: the only place that talks to youtube.com.
//
// Content scripts never fetch YouTube data themselves. They post a message,
// the worker fetches cookie-less, caches, and posts back. That keeps the
// user's session out of research calls and gives one place to throttle.

import * as cache from './lib/cache.js';
import * as channelApi from './analytics/channel.js';
import * as videoApi from './analytics/video.js';
import * as similarApi from './analytics/similar.js';
import * as transcriptApi from './analytics/transcript.js';
import * as sentimentApi from './analytics/sentiment.js';
import * as discoverApi from './analytics/discover.js';
import * as monetizationApi from './analytics/monetization.js';
import * as swipe from './store/swipe.js';
import * as tracker from './store/tracker.js';
import * as settings from './store/settings.js';
import { BASE_RPM, GEO_MULTIPLIER, SHORTS_RPM } from './analytics/rpm.js';

const handlers = {
  'ping': async () => ({ ok: true, version: chrome.runtime.getManifest().version }),

  // ---- channel -----------------------------------------------------------
  'channel.resolve': ({ input }) => channelApi.resolve(input),
  'channel.analytics': ({ channel, deep }) => channelApi.analytics(channel, { deep }),
  'channel.brief': ({ channel }) => channelApi.brief(channel),
  'channel.uploads': ({ channel, limit }) => channelApi.uploads(channel, limit),
  'channel.monetization': ({ channel }) =>
    channelApi.analytics(channel, { deep: true }).then((a) => a.monetization),

  // Opt-in: resolves a publish date per Short, so it costs one fetch each.
  'channel.shortsWindow': async ({ channel, limit }) => {
    const a = await channelApi.analytics(channel, { deep: false });
    return monetizationApi.shortsWindow({
      channelId: a.channelId,
      videos: a.videos,
      limit,
    });
  },

  // ---- video -------------------------------------------------------------
  'video.stats': ({ videoId, withChannel }) => videoApi.stats(videoId, { withChannel }),
  'video.similar': ({ videoId, limit }) => videoApi.similar(videoId, limit),
  'video.monetized': ({ videoId }) => monetizationApi.detectVideo(videoId),
  'video.adBreaks': ({ videoId }) => monetizationApi.adBreaks(videoId),
  'video.chapters': ({ videoId }) => videoApi.chapters(videoId),

  // ---- similar / discovery ----------------------------------------------
  'similar.channels': ({ channel, limit }) => similarApi.channels(channel, { limit }),
  'similar.thumbnails': ({ videoId, limit }) => similarApi.thumbnails(videoId, { limit }),
  'discover.search': ({ query, filter, limit }) =>
    discoverApi.search(query, { filter, limit }),
  'discover.niche': ({ query, ...opts }) => discoverApi.niche(query, opts),
  'discover.channels': ({ query, limit }) => discoverApi.channels(query, limit),
  'discover.suggestions': ({ prefix }) => discoverApi.suggestions(prefix),

  // ---- transcript / sentiment ------------------------------------------
  'transcript.get': ({ videoId, language }) => transcriptApi.get(videoId, language),
  'transcript.languages': ({ videoId }) => transcriptApi.languages(videoId),
  'transcript.sponsorships': ({ videoId }) => transcriptApi.sponsorships(videoId),
  'sentiment.analyse': ({ videoId, limit }) => sentimentApi.analyse(videoId, limit),
  'sentiment.comments': ({ videoId, limit }) => sentimentApi.comments(videoId, limit),

  // ---- swipe file --------------------------------------------------------
  'swipe.list': (p) => swipe.list(p),
  'swipe.save': ({ item }) => swipe.save(item),
  'swipe.remove': ({ itemId }) => swipe.remove(itemId),
  'swipe.update': ({ itemId, patch }) => swipe.update(itemId, patch),
  'swipe.has': ({ ref }) => swipe.has(ref),
  'swipe.folder': ({ name }) => swipe.folder(name),
  'swipe.removeFolder': ({ folderId }) => swipe.removeFolder(folderId),
  'swipe.export': () => swipe.exportAll(),
  'swipe.import': ({ payload, merge }) => swipe.importAll(payload, { merge }),

  // ---- tracker -----------------------------------------------------------
  'tracker.add': ({ channel }) => tracker.add(channel),
  'tracker.remove': ({ channelId }) => tracker.remove(channelId),
  'tracker.list': () => tracker.list(),
  'tracker.isTracked': ({ channelId }) => tracker.isTracked(channelId),
  'tracker.pollAll': () => tracker.pollAll(),

  // ---- settings / maintenance -------------------------------------------
  'settings.get': () => settings.get(),
  'settings.set': ({ patch }) => settings.set(patch),
  'settings.reset': () => settings.reset(),
  // The options page renders the RPM table; it reads it from here rather than
  // keeping a second copy that can drift.
  'rpm.defaults': async () => ({ baseRPM: BASE_RPM, geoMultiplier: GEO_MULTIPLIER, shortsRPM: SHORTS_RPM }),
  'cache.clear': () => cache.clear().then((n) => ({ cleared: n })),

  // ---- files -------------------------------------------------------------
  'download.thumbnail': async ({ videoId, quality = 'maxresdefault' }) => {
    // maxres does not exist for every video; fall back down the ladder.
    const ladder = [quality, 'maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];
    for (const q of [...new Set(ladder)]) {
      const url = `https://i.ytimg.com/vi/${videoId}/${q}.jpg`;
      try {
        const head = await fetch(url, { method: 'GET', credentials: 'omit' });
        if (!head.ok) continue;
        const blob = await head.blob();
        if (blob.size < 2000) continue; // YouTube's grey placeholder
        const id = await chrome.downloads.download({
          url,
          filename: `hookrate/${videoId}-${q}.jpg`,
          saveAs: false,
        });
        return { downloadId: id, quality: q, bytes: blob.size };
      } catch {
        /* try next rung */
      }
    }
    throw new Error('no thumbnail available');
  },

  'download.text': async ({ filename, content }) => {
    const url = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
    const id = await chrome.downloads.download({
      url,
      filename: `hookrate/${filename}`,
      saveAs: false,
    });
    return { downloadId: id };
  },

  'open.page': async ({ path }) => {
    await chrome.tabs.create({ url: chrome.runtime.getURL(path) });
    return { opened: path };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  const handler = msg && handlers[msg.action];
  if (!handler) {
    respond({ ok: false, error: `unknown action: ${msg && msg.action}` });
    return false;
  }

  Promise.resolve()
    .then(() => handler(msg.payload || {}))
    .then((data) => respond({ ok: true, data }))
    .catch((err) => {
      console.warn('[hookrate]', msg.action, err);
      respond({ ok: false, error: String(err && err.message ? err.message : err) });
    });

  return true; // async response
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === tracker.ALARM) tracker.pollAll();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await settings.get(); // materialise defaults

  // A new build usually means changed parsers. Cached rows from the old build
  // would keep serving answers the new code would not produce — a monetization
  // row lives a week, long enough to look like a live bug.
  if (details.reason === 'update') {
    const n = await cache.clear();
    console.info('[hookrate] cleared', n, 'cached rows after update');
  }

  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html?welcome=1') });
  }
});
