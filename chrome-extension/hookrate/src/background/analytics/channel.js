// Channel analytics aggregation — the panel behind most of the UI.

import * as yt from '../lib/innertube.js';
import * as cache from '../lib/cache.js';
import {
  find,
  findAll,
  text,
  num,
  metadataParts,
  videos as parseVideos,
} from '../lib/parse.js';
import * as outliers from './outliers.js';
import * as rpm from './rpm.js';
import * as monetization from './monetization.js';

const DAY = 864e5;

// Shorts lockup cards carry a view count but no upload date and no duration,
// which empties half the panel on a Shorts-only channel: no last-upload, no
// uploads/month, no average length, no median. Each video's own player response
// has all three, so for small channels resolve them directly. Bounded, because
// it costs one request per video.
const META_RESOLVE_CAP = 15;
const META_THROTTLE_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fill in dates and durations when the cards carried none.
 * No-ops unless EVERY sampled video is undated and the channel is small enough
 * that the request count stays sane.
 */
async function resolveMissingMeta(videos) {
  if (!videos.length || videos.length > META_RESOLVE_CAP) return videos;
  const undated = videos.filter((v) => !v.publishedAt).length;
  if (undated < videos.length) return videos;

  const out = [];
  for (const v of videos) {
    try {
      const res = await yt.player(v.videoId);
      const micro = res.microformat && res.microformat.playerMicroformatRenderer;
      const iso = micro && (micro.publishDate || micro.uploadDate);
      const parsed = iso ? Date.parse(iso) : NaN;
      const length = Number(res.videoDetails && res.videoDetails.lengthSeconds) || null;

      out.push({
        ...v,
        publishedAt: Number.isFinite(parsed) ? parsed : v.publishedAt,
        durationSec: v.durationSec ?? length,
        // A resolved duration is the authority on what is a Short.
        isShort: length != null ? length <= 60 : v.isShort,
        metaResolved: true,
      });
    } catch {
      out.push(v);
    }
    await sleep(META_THROTTLE_MS);
  }
  return out;
}

/** Accept a channel id, @handle, /c/ or /user/ path, or a video id. */
export async function resolve(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('nothing to resolve');

  const ucMatch = raw.match(/(UC[\w-]{22})/);
  if (ucMatch) return ucMatch[1];

  return cache.wrap('resolve', raw, cache.TTL.week, async () => {
    let path = raw;
    if (/^@/.test(raw)) path = `/${raw}`;
    else if (/^https?:/.test(raw)) path = new URL(raw).pathname;
    else if (/^[\w-]{11}$/.test(raw)) path = `/watch?v=${raw}`;
    else path = `/@${raw.replace(/^\/+/, '')}`;

    const { html, data, player } = await yt.page(path);
    const fromPlayer = player?.videoDetails?.channelId;
    if (fromPlayer) return fromPlayer;

    const fromData =
      find(data, 'browseId') ||
      (html.match(/"channelId":"(UC[\w-]{22})"/) || [])[1] ||
      (html.match(/channel_id=(UC[\w-]{22})/) || [])[1];

    if (!fromData || !/^UC[\w-]{22}$/.test(fromData)) {
      throw new Error(`could not resolve channel from "${raw}"`);
    }
    return fromData;
  });
}

function header(data) {
  const vm = find(data, 'pageHeaderViewModel');
  const legacy = find(data, 'c4TabbedHeaderRenderer') || {};
  const meta = find(data, 'channelMetadataRenderer') || {};

  // The header is a contentMetadataViewModel now: an ordered list of anonymous
  // strings ("@handle", "29.1M subscribers", "22K videos") rather than named
  // fields. metadataRowRenderer no longer appears anywhere on the page.
  const parts = metadataParts(vm || {});
  const subsRow = parts.find((t) => /subscriber/i.test(t));
  const videosRow = parts.find((t) => /\bvideos?\b/i.test(t));
  const handleRow = parts.find((t) => t.startsWith('@'));

  const avatar =
    findAll(vm || legacy, 'thumbnails')
      .flat()
      .filter((t) => t && t.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;

  return {
    title:
      text(find(vm, 'dynamicTextViewModel')?.text) ||
      text(legacy.title) ||
      meta.title ||
      '',
    handle: handleRow || (meta.vanityChannelUrl || '').split('/').pop() || null,
    avatar,
    subscribers: num(subsRow) ?? num(legacy.subscriberCountText),
    videoCount: num(videosRow) ?? num(legacy.videosCountText),
    keywords: (meta.keywords || '')
      .split(/["',]/)
      .map((s) => s.trim())
      .filter(Boolean),
    description: meta.description || '',
  };
}

async function about(channelId) {
  const { data, html } = await yt.page(`/channel/${channelId}/about`);
  const vm = find(data, 'aboutChannelViewModel') || {};

  const joinedText =
    text(find(vm, 'joinedDateText')) ||
    (html.match(/Joined ([A-Z][a-z]+ \d{1,2}, \d{4})/) || [])[1] ||
    '';
  const joinedAt = joinedText ? Date.parse(joinedText.replace(/^Joined /, '')) : NaN;

  return {
    country: vm.country || (html.match(/"country":"([A-Z]{2})"/) || [])[1] || null,
    totalViews: num(vm.viewCountText) ?? num(find(vm, 'viewCountText')),
    joinedAt: Number.isFinite(joinedAt) ? joinedAt : null,
    links: findAll(vm, 'channelExternalLinkViewModel')
      .map((l) => ({ title: text(l.title), url: text(l.link) }))
      .filter((l) => l.url),
    html,
  };
}

/** Category comes from a video's microformat — channels no longer expose it. */
async function category(videoId) {
  if (!videoId) return null;
  try {
    const res = await yt.player(videoId);
    return res.microformat?.playerMicroformatRenderer?.category || null;
  } catch {
    return null;
  }
}

/** Recent uploads, long-form and shorts, with continuations followed. */
export async function uploads(channelId, limit = 60) {
  return cache.wrap('uploads', `${channelId}:${limit}`, cache.TTL.hour * 6, async () => {
    const now = Date.now();
    const [longForm, shorts] = await Promise.all([
      yt
        .page(`/channel/${channelId}/videos`)
        .then((r) => yt.paginate(r.data, (res) => parseVideos(res, now), limit)),
      yt
        .page(`/channel/${channelId}/shorts`)
        .then((r) => parseVideos(r.data, now).map((v) => ({ ...v, isShort: true })))
        .catch(() => []),
    ]);

    const seen = new Set();
    return [...longForm, ...shorts].filter((v) => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    });
  });
}

/** Full analytics bundle for one channel. */
export async function analytics(channelIdOrHandle, { deep = true } = {}) {
  const channelId = await resolve(channelIdOrHandle);

  return cache.wrap('channel', channelId, cache.TTL.hour * 6, async () => {
    const now = Date.now();
    const [main, meta, vids] = await Promise.all([
      yt.page(`/channel/${channelId}`),
      about(channelId),
      uploads(channelId),
    ]);

    const head = header(main.data);
    const enriched = await resolveMissingMeta(vids);
    const scored = outliers.annotate(enriched);
    const longForm = scored.filter((v) => !v.isShort);
    const shortForm = scored.filter((v) => v.isShort);

    const viewsOf = (list) => list.map((v) => v.views).filter(Number.isFinite);
    const sum = (ns) => ns.reduce((a, b) => a + b, 0);

    const dated = scored.filter((v) => v.publishedAt);
    const lastUploadAt = dated.length
      ? Math.max(...dated.map((v) => v.publishedAt))
      : null;
    const in90 = dated.filter((v) => now - v.publishedAt <= 90 * DAY);
    const in30 = dated.filter((v) => now - v.publishedAt <= 30 * DAY);

    const ageDays = meta.joinedAt ? Math.round((now - meta.joinedAt) / DAY) : null;
    const months = ageDays ? Math.max(1, ageDays / 30.44) : null;

    const longViews = viewsOf(longForm);
    const avgLongViews = longViews.length
      ? Math.round(sum(longViews) / longViews.length)
      : null;
    const shortViews = viewsOf(shortForm);
    const avgShortViews = shortViews.length
      ? Math.round(sum(shortViews) / shortViews.length)
      : null;

    const cat = await category(longForm[0]?.videoId);
    const stored = await chrome.storage.local.get('hr:settings');
    const settings = stored['hr:settings'] || {};
    const revenueOpts = {
      category: cat,
      country: meta.country,
      overrides: settings.rpm || {},
    };

    // Two very different numbers with the same units. Say which one is on
    // screen rather than letting a lifetime average read as recent activity.
    const monthlyViews = in30.length
      ? sum(viewsOf(in30))
      : months && meta.totalViews
        ? Math.round(meta.totalViews / months)
        : null;
    const monthlyBasis = in30.length ? '30d' : monthlyViews != null ? 'lifetime' : null;

    // Duration across everything resolved, not just long-form — otherwise a
    // Shorts-only channel reports no average length even after resolution.
    const withDuration = scored.filter((v) => v.durationSec);
    const allViews = viewsOf(scored);

    const result = {
      channelId,
      url: `https://www.youtube.com/channel/${channelId}`,
      ...head,
      country: meta.country,
      totalViews: meta.totalViews,
      joinedAt: meta.joinedAt,
      ageDays,
      links: meta.links,
      category: cat,

      lastUploadAt,
      daysSinceUpload: lastUploadAt
        ? Math.round((now - lastUploadAt) / DAY)
        : null,
      uploadsPerMonth: in90.length ? +(in90.length / 3).toFixed(1) : null,
      uploadsLast30: in30.length,

      avgViews: avgLongViews,
      avgShortViews,
      // Fallbacks so a Shorts-only channel still reports an average and a
      // median. `shortsOnly` tells the UI to label them as Shorts figures.
      avgViewsAny: allViews.length ? Math.round(sum(allViews) / allViews.length) : null,
      medianViews: outliers.median(longViews),
      medianViewsAny: outliers.median(allViews),
      avgDurationSec: withDuration.length
        ? Math.round(sum(withDuration.map((v) => v.durationSec)) / withDuration.length)
        : null,
      monthlyViews,
      monthlyBasis,

      shortsOnly: shortForm.length > 0 && longForm.length === 0,
      metaResolved: scored.some((v) => v.metaResolved),
      // YouTube's About-page total excludes Shorts views, so on a Shorts-heavy
      // channel it can read lower than the views we can see. Report both
      // instead of picking one and looking wrong.
      totalViewsSampled: allViews.length ? sum(allViews) : null,
      totalViewsExcludesShorts:
        Number.isFinite(meta.totalViews) &&
        allViews.length > 0 &&
        sum(allViews) > meta.totalViews,

      revenue: {
        perVideo: rpm.revenue(avgLongViews, revenueOpts),
        monthly: rpm.revenue(monthlyViews, revenueOpts),
        lifetime: rpm.revenue(meta.totalViews, revenueOpts),
        shortsMonthly: shortViews.length
          ? rpm.revenue(sum(shortViews), { shorts: true })
          : null,
        model: rpm.rpmFor(revenueOpts),
      },

      hasShorts: shortForm.length > 0,
      videoSample: scored.length,
      videos: scored.slice(0, 60),
      topOutliers: outliers.top(scored, { limit: 10 }),
    };

    if (deep) {
      result.monetization = await monetization.detect({
        channelId,
        channelHtml: meta.html + main.html.slice(0, 200000),
        videos: scored,
        subscribers: head.subscribers,
      });
    }

    return result;
  });
}

/** Cheap header-only lookup, for annotating search rows and feed cards. */
export async function brief(channelIdOrHandle) {
  const channelId = await resolve(channelIdOrHandle);
  return cache.wrap('brief', channelId, cache.TTL.day, async () => {
    const { data } = await yt.page(`/channel/${channelId}`);
    return { channelId, ...header(data) };
  });
}
