// Revenue advisor.
//
// Turns the numbers the panel already computes into a ranked list of actions:
// how to reach monetization if the channel is not there yet, and where the
// money actually is if it is.
//
// Two rules keep this from becoming horoscope output:
//
//   1. Every recommendation names the number that triggered it. If a rule
//      cannot compute its own trigger, it does not fire.
//   2. Impact is arithmetic on this channel's own figures, never a benchmark
//      borrowed from someone else's. Where a rule needs an industry constant
//      (mid-roll uplift, sponsor CPM) the constant is stated in the output so
//      the user can disagree with it.

import * as rpm from './rpm.js';

// Industry constants. Deliberately conservative, and surfaced in the UI.
const MIDROLL_MIN_SEC = 480; // 8 minutes: the mid-roll threshold
const MIDROLL_UPLIFT = 0.3; // +30% on ad revenue, conservative end of 20–50%
const SPONSOR_CPM_LOW = 15; // per 1,000 views, integrated mention
const SPONSOR_CPM_HIGH = 35;
const MEMBERSHIP_PRICE = 4.99;
const MEMBERSHIP_SHARE = 0.7; // YouTube takes 30%

/**
 * Membership conversion, tapered by audience size.
 *
 * A flat percentage does not survive contact with a large channel: 0.3% of 29M
 * subscribers is $300k a month, which is arithmetically correct and completely
 * false. Subscriber counts are cumulative and mostly inactive, and the share
 * willing to pay falls sharply as a channel grows past its core audience. This
 * taper keeps small-channel estimates honest without producing fantasy numbers
 * at the top end.
 */
function membershipRate(subscribers) {
  if (subscribers <= 100e3) return 0.003;
  if (subscribers <= 1e6) return 0.001;
  if (subscribers <= 5e6) return 0.0004;
  return 0.0002;
}

const YPP_SUBS = 1000;
const YPP_WATCH_HOURS = 4000;
const YPP_SHORTS_VIEWS = 10e6;

function rec(row) {
  return {
    effort: 'medium',
    confidence: 'medium',
    monthlyImpact: null,
    ...row,
  };
}

/** Monthly growth rate, from tracker history if present, else lifetime average. */
function growth({ subscribers, ageDays, tracker }) {
  const d30 = tracker && tracker.subs30d && tracker.subs30d.change;
  if (Number.isFinite(d30) && d30 > 0) {
    return { perMonth: d30, source: 'measured over the last 30 days' };
  }
  if (subscribers && ageDays && ageDays > 30) {
    return {
      perMonth: subscribers / (ageDays / 30.44),
      source: 'lifetime average — track the channel for a measured rate',
    };
  }
  return { perMonth: null, source: null };
}

// ---- path to monetization ------------------------------------------------

function eligibilityPlan(a) {
  const e = (a.monetization && a.monetization.eligibility) || {};
  const out = [];

  const subs = e.subscribers || a.subscribers || 0;
  const subsGap = Math.max(0, YPP_SUBS - subs);
  const hours = e.watchHoursEstimate || 0;
  const hoursGap = Math.max(0, YPP_WATCH_HOURS - hours);
  const shortsViews = e.shortsWindowKnown ? e.shortsViews90d : e.shortsViewsSampled;
  const shortsGap = Math.max(0, YPP_SHORTS_VIEWS - (shortsViews || 0));

  // Which path is closest? This is the whole decision — chasing watch hours on
  // a Shorts channel, or Shorts views on a long-form channel, wastes months.
  const longProgress = Math.min(1, hours / YPP_WATCH_HOURS);
  const shortsProgress = Math.min(1, (shortsViews || 0) / YPP_SHORTS_VIEWS);
  const path = longProgress >= shortsProgress ? 'long-form' : 'shorts';

  const g = growth({ subscribers: subs, ageDays: a.ageDays, tracker: a.tracker });

  if (subsGap > 0) {
    // A projection is only worth printing when the rate is meaningful. Below
    // ~1 sub/month the honest reading is that the channel is not growing at
    // all, and "9,733 months" is a number that helps nobody.
    const rate = g.perMonth || 0;
    const months = rate >= 1 ? Math.ceil(subsGap / rate) : null;

    let action;
    if (months && months <= 60) {
      action = `At ${Math.round(rate).toLocaleString('en-US')} subs/month you reach 1,000 in about ${months} month${months === 1 ? '' : 's'} (${g.source}).`;
    } else if (months) {
      action = `At the current ${Math.round(rate).toLocaleString('en-US')} subs/month this takes over five years. The rate is the problem, not the gap — a format that works changes it, waiting does not.`;
    } else if (rate > 0) {
      action = `Growth is under 1 subscriber a month (${subs} subs in ${(a.ageDays / 365).toFixed(1)} years). Nothing here is a patience problem: the first 1,000 comes from finding one format that lands, not from more uploads of the current one.`;
    } else {
      action = 'No growth measured. Track the channel for 30 days to get a real rate.';
    }

    out.push(
      rec({
        id: 'subs-gap',
        category: 'eligibility',
        title: `${subsGap.toLocaleString('en-US')} more subscribers needed`,
        detail: `${subs.toLocaleString('en-US')} of ${YPP_SUBS.toLocaleString('en-US')}. This is a hard rule — no monetization below it, on either path.`,
        action,
        effort: 'high',
        confidence: months && months <= 60 ? 'medium' : 'low',
        basis: `subscribers ${subs} vs threshold ${YPP_SUBS}`,
      })
    );
  }

  if (path === 'long-form' && hoursGap > 0) {
    // Watch hours are views × duration, so length is the cheaper lever: the
    // same view count on a 12-minute video is 3× the hours of a 4-minute one.
    const avgViews = a.avgViews || a.avgViewsAny || 0;
    const avgDur = a.avgDurationSec || 0;
    const hoursPerVideo = avgViews && avgDur ? (avgViews * avgDur * 0.45) / 3600 : null;
    const videosNeeded = hoursPerVideo ? Math.ceil(hoursGap / hoursPerVideo) : null;

    out.push(
      rec({
        id: 'watch-hours-gap',
        category: 'eligibility',
        title: `${Math.round(hoursGap).toLocaleString('en-US')} more watch hours needed`,
        detail: `~${Math.round(hours).toLocaleString('en-US')} of ${YPP_WATCH_HOURS.toLocaleString('en-US')} in the last 12 months (estimated at 45% average view duration).`,
        action: videosNeeded
          ? `About ${videosNeeded} more videos at your current average (${Math.round(hoursPerVideo)} hours each).` +
            (avgDur < MIDROLL_MIN_SEC
              ? ` Or fewer, longer ones: your average is ${Math.round(avgDur / 60)} min, and watch hours scale with length.`
              : '')
          : 'Publish more long-form video — watch hours are views × duration.',
        effort: 'high',
        confidence: hoursPerVideo ? 'medium' : 'low',
        basis: `watch hours ${Math.round(hours)} vs threshold ${YPP_WATCH_HOURS}`,
      })
    );
  }

  if (path === 'shorts' && shortsGap > 0) {
    const medianShort = a.avgShortViews || 0;
    const shortsNeeded = medianShort ? Math.ceil(shortsGap / medianShort) : null;
    out.push(
      rec({
        id: 'shorts-gap',
        category: 'eligibility',
        title: `${Math.round(shortsGap / 1e6 * 10) / 10}M more Shorts views needed`,
        detail: `${(shortsViews || 0).toLocaleString('en-US')} of ${YPP_SHORTS_VIEWS.toLocaleString('en-US')} in 90 days.${
          e.shortsWindowKnown ? '' : ' Window unmeasured — this total spans all sampled Shorts, so the real 90-day figure is lower.'
        }`,
        action: shortsNeeded
          ? `About ${shortsNeeded.toLocaleString('en-US')} Shorts at your current average of ${medianShort.toLocaleString('en-US')} views — which is why the Shorts path rewards volume plus one breakout, not steady output.`
          : 'Publish Shorts consistently; the path needs 10M views inside a rolling 90 days.',
        effort: 'high',
        confidence: e.shortsWindowKnown ? 'medium' : 'low',
        basis: `shorts views ${shortsViews || 0} vs threshold ${YPP_SHORTS_VIEWS}`,
      })
    );
  }

  // Reality check. When the remaining gap needs an implausible amount of output
  // at the current performance, more uploads is the wrong prescription — the
  // per-video number has to move first. Saying so is more useful than handing
  // over a five-year plan.
  const medianOut = path === 'shorts' ? a.avgShortViews || 0 : a.avgViews || a.avgViewsAny || 0;
  const needed =
    path === 'shorts'
      ? medianOut
        ? shortsGap / medianOut
        : null
      : medianOut && a.avgDurationSec
        ? hoursGap / ((medianOut * a.avgDurationSec * 0.45) / 3600)
        : null;

  if (needed && needed > 200) {
    out.push(
      rec({
        id: 'gap-reality',
        category: 'content',
        title: `At current performance this needs ~${Math.round(needed).toLocaleString('en-US')} more uploads`,
        detail: `Each ${path === 'shorts' ? 'Short' : 'video'} currently earns about ${Math.round(medianOut).toLocaleString('en-US')} views. The threshold is not far away because the catalogue is small — it is far away because the per-video number is low.`,
        action:
          'Treat the next 10 uploads as experiments on one variable at a time — hook, thumbnail, first three seconds — and compare against your own median rather than publishing more of the same.',
        effort: 'medium',
        confidence: 'high',
        basis: `${Math.round(needed)} uploads needed at ${Math.round(medianOut)} views each`,
      })
    );
  }

  if (!subsGap && (path === 'long-form' ? !hoursGap : !shortsGap)) {
    out.push(
      rec({
        id: 'apply-ypp',
        category: 'eligibility',
        title: 'Thresholds met — check the YPP application',
        detail: 'Both requirements on this path are satisfied but no ads were observed. Eligibility is not automatic: the application has to be submitted and reviewed.',
        action: 'Open YouTube Studio → Earn, and apply or check the review status.',
        effort: 'low',
        confidence: 'high',
        basis: 'eligible, no ad slots observed',
      })
    );
  }

  return { path, out };
}

// ---- earning more once monetized ---------------------------------------

function revenuePlan(a) {
  const out = [];
  const monthly = (a.revenue && a.revenue.monthly && a.revenue.monthly.mid) || 0;
  const model = (a.revenue && a.revenue.model) || null;
  const avgViews = a.avgViews || a.avgViewsAny || 0;
  const monthlyViews = a.monthlyViews || 0;
  const uploads = a.uploadsPerMonth || 0;

  // 1. Mid-rolls. The single cheapest lever if videos are under 8 minutes.
  if (a.avgDurationSec && a.avgDurationSec < MIDROLL_MIN_SEC && !a.shortsOnly) {
    out.push(
      rec({
        id: 'midrolls',
        category: 'revenue',
        title: 'Cross 8 minutes to unlock mid-roll ads',
        detail: `Average length is ${Math.round(a.avgDurationSec / 60)}:${String(a.avgDurationSec % 60).padStart(2, '0')}. Videos of 8 minutes or more can carry mid-rolls, which is the largest single change to RPM available without changing topic.`,
        action: 'Restructure the format so episodes land at 9–12 minutes, then place 1–2 mid-rolls away from the intro.',
        monthlyImpact: monthly * MIDROLL_UPLIFT,
        impactLabel: `+${Math.round(MIDROLL_UPLIFT * 100)}% on ad revenue (conservative)`,
        effort: 'medium',
        confidence: 'medium',
        basis: `avg duration ${a.avgDurationSec}s < ${MIDROLL_MIN_SEC}s`,
      })
    );
  }

  // 2. Sponsorship. Usually larger than ad revenue, and rarely being used.
  if (avgViews >= 5000 && uploads > 0) {
    const low = (avgViews / 1000) * SPONSOR_CPM_LOW * Math.min(uploads, 4);
    const high = (avgViews / 1000) * SPONSOR_CPM_HIGH * Math.min(uploads, 4);
    out.push(
      rec({
        id: 'sponsorship',
        category: 'diversification',
        title: 'Sell integrated sponsorships',
        detail: `${avgViews.toLocaleString('en-US')} average views at $${SPONSOR_CPM_LOW}–${SPONSOR_CPM_HIGH} CPM for an integrated mention. On most channels of this size a sponsor pays more than the ads do, and it is not rate-limited by RPM.`,
        action: 'Build a one-page rate card from the channel analytics and pitch brands already advertising on similar channels — the Sponsors scan on a competitor video shows who is buying.',
        monthlyImpact: (low + high) / 2,
        impactLabel: `$${Math.round(low).toLocaleString('en-US')}–${Math.round(high).toLocaleString('en-US')}/mo at up to 4 sponsored videos`,
        effort: 'medium',
        confidence: 'low',
        basis: `avg views ${avgViews}, ${uploads} uploads/month`,
      })
    );
  }

  // 3. Category RPM. Honest about the cost of moving.
  if (model && model.base < 6) {
    const better = Object.entries(rpm.BASE_RPM)
      .filter(([k]) => k !== 'default')
      .sort((x, y) => y[1] - x[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ($${v})`);

    const uplift = monthlyViews ? (monthlyViews / 1000) * (6 - model.base) * model.geo : 0;
    out.push(
      rec({
        id: 'category-rpm',
        category: 'revenue',
        title: `"${model.category}" pays $${model.base} base RPM — low for the effort`,
        detail: `Advertisers bid by topic. The same ${monthlyViews.toLocaleString('en-US')} monthly views in a higher-paying category earn several times more. Highest paying: ${better.join(', ')}.`,
        action: 'Move gradually: keep the format that works and shift subject matter toward an adjacent, better-paid niche. An abrupt switch resets the audience and the recommendations.',
        monthlyImpact: uplift > 0 ? uplift : null,
        impactLabel: uplift > 0 ? 'if RPM reached $6 at the same view count' : null,
        effort: 'high',
        confidence: 'low',
        basis: `category ${model.category}, base RPM $${model.base}`,
      })
    );
  }

  // 4. Audience geography.
  if (model && model.geo < 0.5) {
    const uplift = monthly ? monthly * (0.85 / model.geo - 1) : 0;
    out.push(
      rec({
        id: 'geo-rpm',
        category: 'revenue',
        title: `Audience geography cuts RPM to ${Math.round(model.geo * 100)}% of US rates`,
        detail: `${a.country || 'This audience'} earns a fraction of what the same views earn from US/UK/CA/AU viewers, because advertisers pay per market.`,
        action: 'Publish in English, target search terms with Western search volume, and schedule for US evening. This changes who the algorithm serves, which takes months.',
        monthlyImpact: uplift > 0 ? uplift : null,
        impactLabel: uplift > 0 ? 'if the audience shifted to majority tier-1' : null,
        effort: 'high',
        confidence: 'low',
        basis: `geo multiplier ${model.geo}`,
      })
    );
  }

  // 5. Memberships and merch, when the surfaces are not switched on.
  const surfaces = (a.monetization && a.monetization.surfaces) || {};
  if (a.subscribers >= 1000 && !surfaces.memberships) {
    const rate = membershipRate(a.subscribers);
    const value = a.subscribers * rate * MEMBERSHIP_PRICE * MEMBERSHIP_SHARE;
    out.push(
      rec({
        id: 'memberships',
        category: 'diversification',
        title: 'Channel memberships are not enabled',
        detail: `At ${(rate * 100).toFixed(2)}% of ${a.subscribers.toLocaleString('en-US')} subscribers joining at $${MEMBERSHIP_PRICE}, after YouTube's 30% cut. The rate is tapered for audience size — a flat percentage of a large subscriber count produces a fantasy number.`,
        action: 'Enable memberships and give one perk the content already produces — early access, or the source files.',
        monthlyImpact: value,
        impactLabel: `${(rate * 100).toFixed(2)}% conversion assumed`,
        effort: 'low',
        confidence: 'low',
        basis: 'no membership surface found on the channel',
      })
    );
  }

  // 6. Cadence — linear and reliable, unlike everything above it.
  if (uploads > 0 && uploads < 8 && avgViews) {
    const perVideo = rpm.revenue(avgViews, {
      category: a.category,
      country: a.country,
    });
    const extra = perVideo ? perVideo.mid * 2 : 0;
    out.push(
      rec({
        id: 'cadence',
        category: 'cadence',
        title: `Publishing ${uploads}/month — each extra upload is worth about ${perVideo ? `$${Math.round(perVideo.mid)}` : 'a video average'}`,
        detail: 'The most predictable lever here. Revenue scales with uploads until the format or the maker runs out.',
        action: `Two more uploads a month at your current average adds roughly $${Math.round(extra)}/mo.`,
        monthlyImpact: extra,
        impactLabel: '2 extra uploads per month',
        effort: 'high',
        confidence: 'medium',
        basis: `${uploads} uploads/month, ${avgViews} avg views`,
      })
    );
  }

  // 7. Shorts: reach, not revenue. Say so plainly.
  if (!a.hasShorts && avgViews > 0) {
    out.push(
      rec({
        id: 'shorts-reach',
        category: 'content',
        title: 'No Shorts — a reach channel, not a revenue one',
        detail: `Shorts pay about $${rpm.SHORTS_RPM} RPM against $${model ? model.rpm : '—'} for your long-form, so they are not a revenue play. They are the cheapest way to put the channel in front of people who have never seen it.`,
        action: 'Cut Shorts from existing long-form peaks — the outlier list is the place to look — and point them at the full video.',
        effort: 'low',
        confidence: 'medium',
        basis: 'no Shorts found on the channel',
      })
    );
  }

  return out;
}

// ---- content leverage, shared by both states ---------------------------

function contentPlan(a, formats, requests) {
  const out = [];

  const best = formats && formats.longForm && formats.longForm.formats && formats.longForm.formats[0];
  if (best && best.lift > 1.3) {
    const median = a.medianViews || a.medianViewsAny || 0;
    const gain = median ? (best.medianViews - median) * (a.uploadsPerMonth || 1) : 0;
    const revenue = gain
      ? rpm.revenue(gain, { category: a.category, country: a.country })
      : null;

    out.push(
      rec({
        id: 'best-format',
        category: 'content',
        title: `Your best format ${best.label} does ${best.lift}× the channel median`,
        detail: `${best.count} videos, median ${best.medianViews.toLocaleString('en-US')} against the channel's ${median.toLocaleString('en-US')}. A format is repeatable in a way a single lucky video is not.`,
        action: 'Make the next few uploads in this format before trying anything new.',
        monthlyImpact: revenue ? revenue.mid : null,
        impactLabel: revenue ? 'if every upload matched this format' : null,
        effort: 'low',
        confidence: 'medium',
        basis: `format lift ${best.lift}× over ${best.count} videos`,
      })
    );
  }

  const topRequest = requests && requests.grouped && requests.grouped[0];
  if (topRequest && topRequest.count >= 2) {
    out.push(
      rec({
        id: 'viewer-request',
        category: 'content',
        title: `${topRequest.count} viewers asked for "${topRequest.key}"`,
        detail: `${topRequest.likes.toLocaleString('en-US')} likes across those comments. Demand that already exists, from people who already watch.`,
        action: 'Make it next. The audience for it is measurable before you shoot.',
        effort: 'low',
        confidence: 'medium',
        basis: `${topRequest.count} requests, demand score ${topRequest.demand}`,
      })
    );
  }

  if (a.daysSinceUpload != null && a.daysSinceUpload > 45) {
    out.push(
      rec({
        id: 'dormant',
        category: 'cadence',
        title: `No upload in ${a.daysSinceUpload} days`,
        detail: 'Recommendations decay with inactivity. Nothing else on this list matters while the channel is dormant.',
        action: 'Publish something in the best-performing format before optimising anything else.',
        effort: 'medium',
        confidence: 'high',
        basis: `${a.daysSinceUpload} days since last upload`,
      })
    );
  }

  return out;
}

/**
 * Build the advice bundle.
 * @param {object} input { analytics, formats, requests }
 */
export function advise({ analytics, formats = null, requests = null }) {
  const a = analytics;
  const m = a.monetization || null;
  const monetized = m ? m.monetized : null;

  const eligibility = monetized === true ? { path: null, out: [] } : eligibilityPlan(a);
  const revenue = monetized === false ? [] : revenuePlan(a);
  const content = contentPlan(a, formats, requests);

  const all = [...eligibility.out, ...revenue, ...content];

  // Eligibility work comes first when there is no revenue to grow: a 30%
  // uplift on zero is zero.
  const weight = (r) => {
    if (monetized !== true && r.category === 'eligibility') return 1e9;
    return r.monthlyImpact || 0;
  };
  const ranked = all.sort((x, y) => weight(y) - weight(x));

  const totalUpside = ranked.reduce((sum, r) => sum + (r.monthlyImpact || 0), 0);

  let state;
  let headline;
  if (monetized === true) {
    state = 'monetized';
    headline = `Monetized. Ranked upside below totals about $${Math.round(totalUpside).toLocaleString('en-US')}/mo — treat it as a ceiling, not a forecast, since the levers overlap.`;
  } else if (monetized === false) {
    state = 'not-monetized';
    headline = `Not monetized. Closest route is the ${eligibility.path} path.`;
  } else {
    state = 'unknown';
    headline = `Monetization could not be read${m && m.basis ? ` (${m.basis})` : ''}. Eligibility work below applies either way.`;
  }

  return {
    channelId: a.channelId,
    title: a.title,
    state,
    headline,
    path: eligibility.path,
    totalMonthlyUpside: monetized === true ? totalUpside : null,
    recommendations: ranked,
    assumptions: [
      `mid-roll uplift +${Math.round(MIDROLL_UPLIFT * 100)}% on ad revenue`,
      `sponsor CPM $${SPONSOR_CPM_LOW}–${SPONSOR_CPM_HIGH} per 1,000 views`,
      `membership conversion tapered by audience size, at $${MEMBERSHIP_PRICE} less YouTube's 30%`,
      'watch hours estimated at 45% average view duration',
      'revenue figures inherit the RPM model, which is a benchmark, not your dashboard',
    ],
  };
}
