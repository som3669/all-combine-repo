// Outlier scoring — the number the whole product hangs on.
//
// "Outlier" = how far a video's views sit above what THAT channel normally
// does. Mean is useless here: one viral hit drags it up and hides every other
// hit. So the baseline is the median, and the spread is MAD (median absolute
// deviation), which a single outlier cannot move.

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mad(nums, med) {
  if (!nums.length) return null;
  return median(nums.map((n) => Math.abs(n - med)));
}

/**
 * Build a baseline from a channel's videos.
 * Shorts and long-form are scored separately — mixing them makes every short
 * look like a monster hit.
 */
export function baseline(videos, { shorts = false } = {}) {
  const views = videos
    .filter((v) => v.isShort === shorts && Number.isFinite(v.views) && v.views > 0)
    // The newest uploads have not finished accruing views; including them
    // depresses the baseline. Skip the freshest few.
    .slice(2)
    .map((v) => v.views);

  if (views.length < 4) return null;

  const med = median(views);
  return {
    n: views.length,
    median: med,
    mad: mad(views, med),
    max: Math.max(...views),
    min: Math.min(...views),
  };
}

/**
 * Score one video against a baseline.
 * multiplier — plain "12x channel average", what users actually read.
 * z          — robust z-score, what the filters sort on.
 */
export function score(views, base) {
  if (!base || !Number.isFinite(views) || !base.median) return null;

  const multiplier = views / base.median;
  // 1.4826 scales MAD to be comparable with a standard deviation.
  const spread = (base.mad || base.median * 0.25) * 1.4826;
  const z = spread ? (views - base.median) / spread : 0;

  let tier = 'normal';
  if (multiplier >= 10) tier = 'monster';
  else if (multiplier >= 5) tier = 'breakout';
  else if (multiplier >= 2.5) tier = 'outlier';
  else if (multiplier >= 1.5) tier = 'above';
  else if (multiplier < 0.5) tier = 'under';

  return {
    multiplier: +multiplier.toFixed(1),
    z: +z.toFixed(2),
    tier,
    baselineMedian: base.median,
  };
}

/** Annotate a whole list in one pass. */
export function annotate(videos) {
  const longBase = baseline(videos, { shorts: false });
  const shortBase = baseline(videos, { shorts: true });

  return videos.map((v) => ({
    ...v,
    outlier: score(v.views, v.isShort ? shortBase : longBase),
  }));
}

/** Top performers, strongest multiplier first. */
export function top(videos, { limit = 12, minMultiplier = 2 } = {}) {
  return annotate(videos)
    .filter((v) => v.outlier && v.outlier.multiplier >= minMultiplier)
    .sort((a, b) => b.outlier.multiplier - a.outlier.multiplier)
    .slice(0, limit);
}

/** Views-per-hour, for judging videos too new to have a stable total. */
export function velocity(video, now = Date.now()) {
  if (!video.views || !video.publishedAt) return null;
  const hours = Math.max(1, (now - video.publishedAt) / 3600e3);
  return Math.round(video.views / hours);
}

export { median, mad };
