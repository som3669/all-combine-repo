// Official YouTube Data API v3 client.
//
// Why this exists: reading youtube.com pages programmatically is against
// YouTube's Terms, which prohibit accessing the service "using any automated
// means". The Data API is the sanctioned route, and most of what this extension
// computes can come from it — for a user who brings their own key.
//
// The quota shapes the design. A key gets 10,000 units a day, and the costs are
// wildly uneven:
//
//   channels.list        1 unit    ← everything about a channel
//   playlistItems.list   1 unit    ← 50 uploads per call
//   videos.list          1 unit    ← 50 videos per call, full statistics
//   commentThreads.list  1 unit
//   search.list        100 unit    ← avoided entirely; this is the trap
//
// So a full channel analysis costs about 3 units, and a 10,000-unit day is
// roughly 3,000 channel lookups. That is not a compromise, it is more headroom
// than page reading ever had. `search.list` is deliberately never called: one
// careless search feature would burn the day's quota in 100 calls.

const BASE = 'https://www.googleapis.com/youtube/v3';

/** Cost in quota units per endpoint, for the usage meter. */
const COST = {
  channels: 1,
  playlistItems: 1,
  videos: 1,
  commentThreads: 1,
  captions: 50,
  search: 100,
};

let spent = 0;

export function quotaSpent() {
  return spent;
}

export function resetQuota() {
  spent = 0;
}

async function call(endpoint, params, apiKey) {
  if (!apiKey) throw new Error('no API key configured');
  if (endpoint === 'search') {
    // Guard rather than comment: search costs 100 units and there is no feature
    // here worth a hundredth of a day's quota per query.
    throw new Error('search.list is deliberately not used — it costs 100 quota units per call');
  }

  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  url.searchParams.set('key', apiKey);

  const res = await fetch(url, { credentials: 'omit' });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const reason =
      json && json.error && json.error.errors && json.error.errors[0]
        ? json.error.errors[0].reason
        : null;
    if (reason === 'quotaExceeded') {
      throw new Error('YouTube API daily quota exhausted — resets at midnight Pacific');
    }
    if (reason === 'keyInvalid' || res.status === 400) {
      throw new Error('API key rejected — check it is a YouTube Data API v3 key with the API enabled');
    }
    throw new Error(
      (json && json.error && json.error.message) || `YouTube API returned ${res.status}`
    );
  }

  spent += COST[endpoint] || 1;
  return json;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** ISO 8601 duration (PT1H2M3S) to seconds. */
function isoDuration(iso) {
  const m = String(iso || '').match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/**
 * Channel core data. One unit.
 * Note `statistics.viewCount` here is YouTube's own total, with the same
 * Shorts caveat the About page has.
 */
export async function channel(channelId, apiKey) {
  const json = await call(
    'channels',
    {
      part: 'snippet,statistics,contentDetails,topicDetails,brandingSettings',
      id: channelId,
    },
    apiKey
  );

  const item = json.items && json.items[0];
  if (!item) throw new Error(`channel ${channelId} not found via the API`);

  const joined = Date.parse(item.snippet.publishedAt);
  return {
    channelId: item.id,
    title: item.snippet.title,
    handle: item.snippet.customUrl || null,
    description: item.snippet.description || '',
    country: item.snippet.country || null,
    avatar:
      (item.snippet.thumbnails &&
        (item.snippet.thumbnails.high || item.snippet.thumbnails.default).url) ||
      null,
    subscribers: item.statistics.hiddenSubscriberCount ? null : num(item.statistics.subscriberCount),
    totalViews: num(item.statistics.viewCount),
    videoCount: num(item.statistics.videoCount),
    joinedAt: Number.isFinite(joined) ? joined : null,
    uploadsPlaylist:
      item.contentDetails &&
      item.contentDetails.relatedPlaylists &&
      item.contentDetails.relatedPlaylists.uploads,
    keywords: (item.brandingSettings &&
      item.brandingSettings.channel &&
      item.brandingSettings.channel.keywords) || '',
    topics: (item.topicDetails && item.topicDetails.topicCategories) || [],
  };
}

/** Resolve a @handle to a channel id. One unit. */
export async function resolveHandle(handle, apiKey) {
  const clean = String(handle).replace(/^@/, '');
  const json = await call(
    'channels',
    { part: 'id', forHandle: `@${clean}` },
    apiKey
  );
  const item = json.items && json.items[0];
  if (!item) throw new Error(`handle @${clean} not found via the API`);
  return item.id;
}

/**
 * Recent uploads with full statistics, normalised to the same shape parse.js
 * produces so every downstream consumer works unchanged.
 *
 * Cost: ceil(limit/50) for the playlist plus ceil(limit/50) for the details.
 * 60 videos is 4 units.
 */
export async function uploads(uploadsPlaylist, apiKey, limit = 60) {
  const ids = [];
  let pageToken;

  while (ids.length < limit) {
    const page = await call(
      'playlistItems',
      {
        part: 'contentDetails',
        playlistId: uploadsPlaylist,
        maxResults: Math.min(50, limit - ids.length),
        pageToken,
      },
      apiKey
    );
    for (const item of page.items || []) {
      if (item.contentDetails && item.contentDetails.videoId) ids.push(item.contentDetails.videoId);
    }
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }

  return videos(ids, apiKey);
}

/** Full details for up to 50 ids per unit. */
export async function videos(ids, apiKey) {
  const out = [];

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const json = await call(
      'videos',
      { part: 'snippet,statistics,contentDetails', id: batch.join(',') },
      apiKey
    );

    for (const item of json.items || []) {
      const durationSec = isoDuration(item.contentDetails && item.contentDetails.duration);
      const publishedAt = Date.parse(item.snippet.publishedAt);
      out.push({
        videoId: item.id,
        title: item.snippet.title,
        views: num(item.statistics.viewCount),
        likes: num(item.statistics.likeCount),
        comments: num(item.statistics.commentCount),
        durationSec,
        publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
        publishedText: '',
        thumbnail: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
        // The API has no "is a Short" flag. Duration is the only signal
        // available, and it is the same one the page parser falls back to.
        isShort: durationSec != null && durationSec <= 60,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        categoryId: item.snippet.categoryId || null,
        tags: item.snippet.tags || [],
        fromApi: true,
      });
    }
  }
  return out;
}

/** Top-level comments. One unit per 100. */
export async function comments(videoId, apiKey, limit = 100) {
  const json = await call(
    'commentThreads',
    {
      part: 'snippet',
      videoId,
      maxResults: Math.min(100, limit),
      order: 'relevance',
      textFormat: 'plainText',
    },
    apiKey
  ).catch((err) => {
    // Comments disabled is a normal state, not a failure worth propagating.
    if (/disabled/i.test(err.message)) return { items: [] };
    throw err;
  });

  return (json.items || []).map((t) => {
    const c = t.snippet.topLevelComment.snippet;
    return {
      author: c.authorDisplayName,
      text: c.textOriginal || c.textDisplay || '',
      likes: num(c.likeCount) || 0,
      replies: num(t.snippet.totalReplyCount) || 0,
      publishedText: c.publishedAt,
      pinned: false,
    };
  });
}

/** Categories, so a numeric categoryId can become an RPM bucket. One unit. */
export async function categories(apiKey, regionCode = 'US') {
  const json = await call(
    'videoCategories',
    { part: 'snippet', regionCode },
    apiKey
  ).catch(() => null);
  const map = {};
  for (const item of (json && json.items) || []) map[item.id] = item.snippet.title;
  return map;
}

/**
 * What the API cannot provide, at any quota. Stated here rather than discovered
 * feature by feature.
 */
export const UNAVAILABLE = {
  monetization:
    'ad slots are not exposed by the API — monetization can only be inferred from page data',
  transcripts:
    'captions.download requires OAuth as the video owner; third-party transcripts are not available',
  similarVideos: 'the related-videos endpoint was removed from the API in 2023',
  searchDiscovery: 'search.list works but costs 100 units per call, which is not viable',
};
