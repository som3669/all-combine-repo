// Single-video analytics: the watch-page overlay and Shorts overlay.

import * as yt from '../lib/innertube.js';
import * as cache from '../lib/cache.js';
import { find, findAll, num, videos as parseVideos } from '../lib/parse.js';
import * as outliers from './outliers.js';
import * as rpm from './rpm.js';
import * as monetization from './monetization.js';
import * as channelApi from './channel.js';

const HOUR = 3600e3;

/** Parse the ISO publish date out of a player response. */
function publishedAt(player) {
  const micro = player && player.microformat && player.microformat.playerMicroformatRenderer;
  const iso = micro && (micro.publishDate || micro.uploadDate);
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
}

/**
 * Video stats. `withChannel` costs an extra channel fetch but is what turns a
 * raw view count into an outlier multiplier — the number worth showing.
 */
export async function stats(videoId, { withChannel = true } = {}) {
  return cache.wrap('video', videoId, cache.TTL.hour, async () => {
    const now = Date.now();
    const [player, watch] = await Promise.all([
      yt.player(videoId),
      yt.next(videoId).catch(() => null),
    ]);

    const details = player.videoDetails || {};
    const micro = (player.microformat && player.microformat.playerMicroformatRenderer) || {};

    const views = Number(details.viewCount) || num(micro.viewCount) || null;

    // Likes are exposed inconsistently across surfaces. Try the named field,
    // then the accessibility label that reads "…along with 1,234 other people".
    let likes = num(find(watch, 'likeCountText'));
    if (likes == null && watch) {
      const label = findAll(watch, 'accessibilityData')
        .map((a) => a && a.label)
        .filter(Boolean)
        .find((l) => /like this video along with|other people/i.test(l));
      const m = label && label.match(/along with ([\d,.]+)/);
      if (m) likes = num(m[1]);
    }

    const comments = num(find(watch, 'commentCount'));

    const at = publishedAt(player);
    const ageHours = at ? Math.max(1, (now - at) / HOUR) : null;
    const durationSec = Number(details.lengthSeconds) || null;

    const base = {
      videoId,
      title: details.title || '',
      channelId: details.channelId || null,
      channelTitle: details.author || '',
      views,
      likes,
      comments,
      durationSec,
      isShort: durationSec != null && durationSec <= 60,
      publishedAt: at,
      ageHours: ageHours ? Math.round(ageHours) : null,
      viewsPerHour: views && ageHours ? Math.round(views / ageHours) : null,
      engagementRate: views && likes ? +((likes / views) * 100).toFixed(2) : null,
      commentRate: views && comments ? +((comments / views) * 100).toFixed(3) : null,
      keywords: details.keywords || [],
      category: micro.category || null,
      country:
        micro.availableCountries && micro.availableCountries.length === 1
          ? micro.availableCountries[0]
          : null,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      adBreaks: (player.adPlacements || []).length || null,
      hasAds: !!(
        (player.adPlacements && player.adPlacements.length) ||
        (player.playerAds && player.playerAds.length)
      ),
    };

    if (!withChannel || !base.channelId) return base;

    try {
      const vids = await channelApi.uploads(base.channelId, 60);
      const chBase = outliers.baseline(vids, { shorts: base.isShort });
      base.outlier = outliers.score(views, chBase);
      base.channelMedian = chBase ? chBase.median : null;
    } catch {
      base.outlier = null;
    }

    const stored = await chrome.storage.local.get('hr:settings');
    const settings = stored['hr:settings'] || {};
    base.revenue = rpm.revenue(views, {
      category: base.category,
      country: base.country,
      shorts: base.isShort,
      overrides: settings.rpm || {},
    });

    return base;
  });
}

/** Videos YouTube itself considers related — free, no index of our own. */
export async function similar(videoId, limit = 20) {
  return cache.wrap('similar-video', videoId, cache.TTL.hour * 6, async () => {
    const res = await yt.next(videoId);
    const now = Date.now();
    return parseVideos(res.secondaryResults || res, now)
      .filter((v) => v.videoId !== videoId)
      .slice(0, limit);
  });
}

/** Monetization for the single video in view. */
export const monetized = (videoId) => monetization.detectVideo(videoId);

/** Chapter list, when the uploader defined one. */
export async function chapters(videoId) {
  try {
    const res = await yt.next(videoId);
    const { text } = await import('../lib/parse.js');
    return findAll(res, 'chapterRenderer').map((c) => ({
      title: text(c.title),
      startMs: Number(c.timeRangeStartMillis) || 0,
    }));
  } catch {
    return [];
  }
}
