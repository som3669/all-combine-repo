# Chrome Web Store submission pack

Everything the dashboard asks for, written out. Copy each block into the matching
field. Nothing here should be improvised at submission time — the review process
compares what you type against what the code does, and inconsistencies between
the listing, the data disclosures and actual behaviour are themselves a policy
violation.

---

## Listing

**Name** (45 char limit)

```
Hookrate — Research & Analytics for Creators
```

> Deliberately does not contain "YouTube". Using another company's trademark in a
> product name invites both a store rejection and a trademark complaint. The
> description below states compatibility instead, which is the accepted way to
> say it.

**Short description** (132 char limit)

```
Channel analytics, outlier scoring, monetization checks and revenue estimates, shown on the pages you already browse.
```

**Category:** Productivity (Tools)

**Language:** English

### Detailed description

```
Hookrate turns a channel page into a research surface. Everything it shows is
calculated from publicly visible data, on your machine, with no account and no
server.

WHAT YOU GET

• Channel analytics — subscribers, views, average and median views per video,
  uploads per month, channel age, average length, category and geography.

• Outlier scoring — how far a video beat the channel's own median, measured
  against the median rather than the mean so a single viral hit cannot hide
  every other result. Shorts and long-form are scored separately.

• Format clustering — which recurring title patterns and video lengths beat the
  channel's median. A format is repeatable in a way a single lucky video is not.

• Monetization detection — an inferred verdict with its confidence and the
  evidence behind it, including YouTube Partner Program eligibility against both
  the watch-hours and the Shorts paths.

• Revenue estimates — views x category RPM x geography, shown as a range, with
  every assumption listed and every figure overridable in Settings.

• Revenue advice — a ranked list of what would actually move the number, with
  the arithmetic shown for each suggestion.

• Transcripts, comment sentiment, sponsorship scans and viewer-request mining.

• A swipe file, a channel tracker with growth deltas, a feed filter, and a
  thumbnail and title tester that previews your asset in the live grid.

HONEST ABOUT ITS LIMITS

YouTube publishes no monetization field and no RPM for other people's channels,
so those figures are estimates, and Hookrate labels them as estimates everywhere
they appear. Confidence levels and the reasoning behind each verdict are shown
rather than hidden.

PRIVACY

No account. No telemetry. No advertising. No server. Nothing you do is
transmitted anywhere, because there is nowhere for it to go. Lookups are made
without cookies, so your YouTube session is never attached to them. Your swipe
file and settings never leave your browser profile.

Hookrate is an independent tool, not affiliated with or endorsed by YouTube or
Google.
```

---

## Permission justifications

Each field in the dashboard, answered. Keep these accurate — they are checked
against the code.

**`storage`**

```
Stores the user's swipe file, tracked channels, filter settings and cached
lookups of public data on their own device. No data is transmitted; this is the
only place the extension keeps state.
```

**`unlimitedStorage`**

```
Saved thumbnails and the snapshot history for tracked channels exceed the small
default storage quota after normal use. Without it, a user's saved items would
begin failing silently once the quota filled.
```

**`alarms`**

```
Re-checks tracked channels on a schedule so subscriber and view growth can be
shown over time. Without alarms, tracking would only update while a YouTube tab
happened to be open, which would leave gaps in the history.
```

**`downloads`**

```
Saves thumbnails, transcripts and CSV exports to the user's computer when they
click the corresponding button. Only ever triggered by a user action.
```

**Host permission — `https://www.youtube.com/*`**

```
The extension's entire purpose is to display research about YouTube channels and
videos. It reads publicly visible channel pages, video pages, captions and
comments to calculate the analytics shown. Requests are made without cookies, so
the user's session is never attached to them.
```

**Host permission — `https://studio.youtube.com/*`**

```
Displays a mid-roll ad-break scheduling helper on the user's own video pages in
YouTube Studio. Reads the video length shown on the page and calculates suggested
timestamps for the user to copy.
```

**Host permission — `https://i.ytimg.com/*`**

```
Loads and downloads video thumbnails, which are hosted on this domain. Required
for the thumbnail download feature and for previews inside the extension.
```

**Host permission — `https://suggestqueries-clients6.youtube.com/*`**

```
Fetches YouTube's public search-suggestion list for the keyword research feature,
which shows what related terms people actually search for.
```

**Remote code use**

```
No. The extension executes no remotely hosted code. All logic is contained in the
submitted package.
```

---

## Data disclosures

Answer the dashboard checkboxes exactly as follows. These are the answers the
code supports.

| Data type | Collected? | Notes |
|---|---|---|
| Personally identifiable information | **No** | |
| Health information | **No** | |
| Financial and payment information | **No** | |
| Authentication information | **No** | |
| Personal communications | **No** | Comments are read from public pages to compute sentiment and mine requests; they are not collected, stored beyond a local cache, or transmitted |
| Location | **No** | |
| Web history | **No** | The extension does not read or store browsing history |
| User activity | **No** | No clicks, keystrokes or usage are recorded or transmitted |
| Website content | **No** | Public page content is read and cached locally to compute analytics, but is never transmitted to the developer or any third party |

**Certifications** (all three must be checked, and all three are true):

- I do not sell or transfer user data to third parties, apart from the approved use cases
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** host `PRIVACY.md` somewhere public — a GitHub Pages
page or the repository file view both qualify — and paste the URL into the
dedicated dashboard field. It must not live only in the description.

---

## Single purpose statement

```
Hookrate has one purpose: showing research and analytics about YouTube channels
and videos to the person browsing them. Every feature — analytics panels, outlier
scoring, monetization detection, revenue estimates, transcripts, the swipe file
and the tracker — exists to serve that single purpose.
```

---

## Assets still needed

- [ ] At least one screenshot, 1280x800 or 640x400 — the channel analytics panel
      on a real channel is the strongest first image
- [ ] Optional: small promo tile 440x280
- [ ] Store icon 128x128 — already in `assets/icons/icon128.png`

---

## Known risks before you submit

Read these and decide deliberately; none of them is a surprise waiting to happen.

**1. YouTube's Terms of Service prohibit automated access.** The Terms forbid
accessing the service "using any automated means (such as robots, botnets or
scrapers)" and forbid circumventing or interfering with any part of the service.
Hookrate reads page data programmatically, and the InnerTube relay exists
specifically because extension-origin requests are refused. Store reviewers do
not test for this and every competing extension does the same thing — but Google
owns both the store and YouTube, and a complaint from the YouTube side would end
the listing. There is no compliant version of this feature set: the official Data
API provides roughly one hundred searches per day and none of the monetization,
RPM, transcript or outlier data the extension is built on.

**2. Single purpose is defensible but not airtight.** The Studio ad-break helper
is the piece most easily argued to be a separate product. If review pushes back
on single purpose, that is the part to drop first.

**3. `tryAutoPlace` in the Studio module** clicks YouTube's own automatic
ad-placement control on the user's behalf. It is the highest-risk, lowest-value
code in the package. Consider removing it before submission; the timestamp
calculator that sits beside it delivers most of the value with none of the
exposure.

**4. Estimates must stay labelled.** The store removes extensions that "deceive
or mislead users". Revenue, RPM and monetization figures are inferred, and the
interface says so today. Keep it that way in the listing copy as well — never
present an estimate as a report.
