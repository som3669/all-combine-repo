# Hookrate — Privacy Policy

**Last updated: 26 August 2026**

Hookrate is a browser extension that shows research and analytics for YouTube
channels and videos on the pages you are already viewing.

The short version: **Hookrate has no server.** There is no account, no login, no
analytics, no telemetry and no advertising. Nothing you do in the extension is
sent to us, because there is no "us" to send it to. Everything the extension
stores stays in your own browser profile.

---

## What Hookrate does with data

### Data it reads

When you are on a YouTube page, Hookrate reads publicly visible information in
order to calculate what it shows you:

- The channel or video you are currently viewing (its ID, title, view counts,
  publish dates, durations)
- Publicly available channel pages, video pages, captions and comments, fetched
  in the background to compute analytics such as outlier scores, revenue
  estimates and monetization signals

This is the same information any visitor to those pages can see. Hookrate does
not read your private YouTube data, your account details, your subscriptions,
your watch history, your email address, or your YouTube Studio revenue figures.

### Data it stores

All of it is stored locally, using the browser's own extension storage
(`chrome.storage.local`) on your device:

| What | Why | How long |
|---|---|---|
| Cached lookups of public channel/video data | So the same lookup does not repeat on every page view | Expires automatically (1 hour to 1 week depending on type); clearable at any time in Settings |
| Your swipe file — items you explicitly save | So your saved videos, channels and notes persist | Until you delete them |
| Tracked channels and their snapshot history | So growth deltas can be shown over time | Until you stop tracking that channel |
| Your settings and filter preferences | So the extension behaves the way you configured it | Until you reset them |

### Data it sends

Hookrate sends **no data to any server operated by its developer**, because no
such server exists.

The extension makes requests to the following hosts, and only these:

| Host | Purpose |
|---|---|
| `www.youtube.com` | Fetch public channel pages, video pages, captions and comments to compute analytics |
| `studio.youtube.com` | Display the ad-break helper, when you are on your own Studio pages |
| `i.ytimg.com` | Load and download video thumbnails |
| `suggestqueries-clients6.youtube.com` | Fetch YouTube's public search suggestions for keyword research |
| `www.googleapis.com` | **Only if you choose to.** Used for the official YouTube Data API, and only when you have selected an API data source and supplied your own API key |

**These requests are made without cookies** (`credentials: 'omit'`). Your YouTube
session, identity and account are deliberately not attached to them. This is a
design decision, not a side effect: research lookups should not be linked to your
account, and an unauthenticated request also returns more accurate advertising
data than a signed-in one would.

### Your YouTube Data API key, if you provide one

Hookrate can read its figures from the official YouTube Data API instead of from
public pages. That is optional and off by default. If you turn it on:

- You create the API key yourself in Google Cloud. Hookrate never issues one.
- The key is stored in local extension storage on your device, exactly like your
  other settings, and is never transmitted anywhere except to
  `www.googleapis.com` as part of the API request it authorises.
- Access to `www.googleapis.com` is an **optional** permission. Chrome asks for
  it only when you enable an API data source, and you can revoke it at any time.
- The developer never sees the key, the quota it consumes, or the results.

There is a strict setting that uses the API only and never reads a page. Some
features are switched off in that mode because the API does not provide the
data they need, which is stated in the settings rather than hidden.

---

## What Hookrate never does

- No user accounts, sign-in, or identifiers of any kind
- No analytics, telemetry, crash reporting or usage tracking
- No advertising, and no use of any data for advertising
- No selling, renting or sharing of data with anyone — there is no recipient
- No collection of personally identifiable information
- No reading of pages outside `youtube.com` and `studio.youtube.com`
- No remotely hosted code; the entire extension is contained in the package you
  install and can be read in full

## Permissions, and why each is needed

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Store your swipe file, tracked channels, settings and cached lookups on your device. `unlimitedStorage` is needed because saved thumbnails and snapshot history can exceed the small default quota. |
| `alarms` | Re-check tracked channels on a schedule so growth over time can be shown. Without it, tracking would only update while a YouTube tab is open. |
| `downloads` | Save thumbnails, transcripts and CSV exports to your computer when you click those buttons. Used only in response to a click. |
| Host access to `youtube.com`, `studio.youtube.com`, `i.ytimg.com`, `suggestqueries-clients6.youtube.com` | Read public YouTube data to calculate the analytics shown, and load thumbnails. |
| Optional host access to `www.googleapis.com` | Requested only if you enable the official YouTube Data API and supply your own key. Not granted otherwise. |

Hookrate does not request access to any other website.

## Files you export

Thumbnail, transcript and CSV downloads, and swipe-file JSON exports, are written
directly to your computer by your browser. They are not uploaded anywhere.

## Children

Hookrate is a tool for content creators and researchers. It is not directed at
children and collects no data from anyone, including children.

## Changes to this policy

If this policy changes, the updated version will be published at the same
location with a revised date at the top. Because the extension collects nothing,
any future change that introduced collection would be announced prominently in
the extension itself before it took effect.

## Contact

Questions about this policy or the extension's data handling can be raised via
the repository issue tracker for the project.

---

## A note on YouTube

Hookrate is an independent tool. It is not affiliated with, endorsed by, or
sponsored by YouTube or Google. "YouTube" is a trademark of Google LLC, used here
only to describe what the extension is compatible with.

Hookrate reads publicly available pages on youtube.com to compute its estimates.
All figures it presents — revenue, RPM, watch hours, monetization status — are
**estimates derived from public data**, not reports from YouTube, and are labelled
as such in the interface.
