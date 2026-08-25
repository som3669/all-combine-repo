# Hookrate

YouTube research and analytics as a Chrome extension. Channel analytics, outlier
scoring, monetization detection, revenue estimates, transcripts, comment
sentiment, sponsorship scans, a swipe file and a channel tracker — injected into
the pages you already browse.

No account. No backend. No API key.

## Install (unpacked)

1. `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this `hookrate` folder
4. Open YouTube

## What appears where

| Surface | What you get |
|---|---|
| Channel page | Analytics panel: subs, views, avg/median views, uploads per month, age, category, geo, revenue estimates, monetization verdict, YPP eligibility, top outliers. Buttons for Similar, Track, Save, CSV export. |
| Watch page | Sidebar card: views, views/hour, outlier multiplier vs the channel's median, engagement rate, comment rate, revenue estimate, ad-break count. Modals for similar videos, transcript, comment sentiment, sponsorship scan. Thumbnail and frame download. |
| Shorts | Floating overlay scored against the channel's **Shorts** baseline, not its long-form one. |
| Home / subscriptions | Filter bar (min/max views, max age, duration, hide Shorts, hide watched), views-per-hour badge on every card, click a badge for the true outlier score, thumbnail + title tester that swaps your asset into the live grid. |
| Search results | Per-row views/hour, on-demand outlier score and revenue estimate, save button. Keyword research modal and autocomplete-based related searches. |
| YouTube Studio | Mid-roll ad-break scheduler (copy timestamps, or try Studio's own auto-place). |
| Popup | Analyse the current page, or paste any channel/handle/video URL. |
| Swipe file page | Saved videos, Shorts, channels and thumbnails with notes, folders, JSON import/export. Tracked-channel tab with 24h/7d/30d deltas. |

## How the numbers are produced

**Outlier score.** `views ÷ median(channel's views)`. Median, not mean — a
single viral hit drags a mean up and hides every other hit. Spread uses MAD
(median absolute deviation), which one outlier cannot move. The two newest
uploads are excluded from the baseline because they have not finished accruing
views. Shorts and long-form get separate baselines.

**Revenue.** `views ÷ 1000 × categoryRPM × geoMultiplier`, reported as a ±40%
range. No public API exposes another channel's real RPM, so these are
benchmarks. Override any category in Settings with numbers from your own
dashboard.

**Monetization.** There is no API field for it. Signals, strongest first:

1. `adPlacements` / `playerAds` in the player response — ads are being served
2. memberships / merch / Super Thanks surfaces — all require an active YPP contract
3. computed YPP eligibility (1,000 subs + ~4,000 watch hours, or 10M Shorts views in 90 days)

Several recent long-form videos are sampled and the result is a vote, because a
single video can be limited-ads, region-gated or advertiser-unfriendly. Shorts,
live and premieres are excluded from the sample. The verdict always ships with
its confidence and its basis.

**Sentiment.** Lexicon-scored, like-weighted, offline. Auditable — every score
traces to matched words. Sarcasm is its blind spot; it is a signal, not a
verdict.

**Sponsorships.** Pattern matching over the transcript and description, with a
timestamp for every hit so you can verify each one yourself.

## What this deliberately does not do

**Niche Finder over the whole platform.** A real niche finder queries a
pre-built index of every channel on YouTube. Building that means crawling
~150M channels and holding them in a vector database — a backend, proxy budget
and months of compute. Instead, `discover.niche` runs YouTube's own search and
applies the same maths to the results. Narrower recall, identical rigour, zero
infrastructure. The interface is the seam: drop a vector search in behind it
later and every caller keeps working.

**Visual thumbnail similarity.** Needs CLIP embeddings over an indexed corpus.
The fallback is keyword matching, and it says so on screen rather than pretending
otherwise.

**Injecting ad breaks directly.** Studio has no stable API for it, and faking
clicks into a monetisation form is a bad idea. Hookrate computes the schedule and
hands you the timestamps.

## Architecture

```
YouTube page
  content scripts (src/content/*)      DOM injection, filters, panels — no network
        │  chrome.runtime.sendMessage
        ▼
  service worker (src/background/*)    the only code that fetches youtube.com
        │
        ├── lib/innertube.js           HTML page reads + /youtubei/v1 calls
        ├── lib/parse.js               renderer-key search, never fixed deep paths
        ├── lib/cache.js               TTL cache, in-flight de-duplication
        ├── analytics/*                channel, video, outliers, rpm,
        │                              monetization, transcript, sentiment,
        │                              similar, discover
        └── store/*                    swipe file, tracker, settings
```

Two rules hold the design together:

**Content scripts never fetch.** Every lookup goes through the worker, which
fetches with `credentials: 'omit'`. Your signed-in session is never attached to
a research call — which also stops YouTube Premium from suppressing the
`adPlacements` field that monetization detection depends on.

**Parse by renderer key, not by path.** YouTube reshuffles its response tree
constantly but keeps renderer names stable. `parse.js` deep-searches for
`videoRenderer`, `aboutChannelViewModel` and friends instead of walking
`contents[0].tabRenderer.content…`, so a layout change degrades one field rather
than breaking every panel.

## Data and privacy

- No backend. Nothing is sent anywhere except youtube.com.
- Lookups are cookie-less.
- Cache, swipe file and settings live in `chrome.storage.local`.
- Permissions: `storage`, `alarms`, `downloads` (thumbnails, CSV, transcripts).
  Host access is limited to `www.youtube.com`, `studio.youtube.com` and
  `i.ytimg.com`.

## Known limits

- Reading InnerTube responses is against YouTube's Terms of Service. Every
  extension in this category does it. Keep it server-side if you ever add a
  crawler; do not put one in the extension.
- Response shapes change without notice. When a field goes missing, the panel
  shows `—` rather than crashing, but the parser in `lib/parse.js` will need a
  new renderer key.
- Watch-hour estimates assume 45% average view duration. That is unknowable from
  outside; treat eligibility as a range, not a fact.
- The tracker only polls while Chrome is running.
- Frame capture fails on DRM-protected streams — the canvas is tainted and
  nothing client-side can fix it.

## Layout

```
hookrate/
  manifest.json
  assets/icons/
  src/
    background/
      service-worker.js       message router, alarms, downloads
      lib/       innertube.js  parse.js  cache.js
      analytics/ channel.js  video.js  outliers.js  rpm.js
                 monetization.js  transcript.js  sentiment.js
                 similar.js  discover.js
      store/     swipe.js  tracker.js  settings.js
    content/
      router.js               SPA navigation dispatch
      lib/       util.js  bus.js  ui.js
      features/  channel.js  watch.js  shorts.js  home.js
                 search.js  studio.js
    ui/styles.css
    popup/  options/  swipe/
```
