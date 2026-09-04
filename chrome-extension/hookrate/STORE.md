# Chrome Web Store submission pack

## Building and testing the upload

```
npm install                 # dev tooling only; nothing here ships
npm run build               # validates, then writes dist/hookrate-<version>.zip
npm run check               # validate without writing anything

npm run chrome              # one-time: fetch Chrome for Testing
node tool/smoke.mjs --chrome "<path from the line above>"
```

`tool/build.mjs` ships only `manifest.json`, `src/` and `assets/icons/`. The
store copy, the privacy policy source, the screenshots and this tooling stay
out: reviewers read what you upload, and every extra file is either noise or a
question to answer.

Before writing the zip it checks the things that actually get submissions
rejected — every manifest-referenced file present, every relative import
resolving, no `eval`, no `innerHTML`, no `debugger`, no host contacted in code
that is missing from `host_permissions`, and the name and description inside
their character limits. It refuses to package if any of those fail. The
description limit is not theoretical: it caught a 154-character description that
would have been rejected on submission.

`tool/smoke.mjs` runs the built package — `dist/package`, the exact staged
contents — against live YouTube and exercises the channel panel, all three
modals, the watch panel, the search bar and the three extension pages. It also
asserts no `null`/`undefined`/`NaN` reaches the screen and that search results
are not squeezed by the injected bar, both of which are bugs that shipped once.

Note that ordinary Chrome cannot host this test: Chrome 137 refuses
`--load-extension`, and the flag that re-enabled it is gone by 151. Chrome for
Testing keeps the automation switches on, which is what `npm run chrome`
fetches.


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

**Short description** (132 char limit — this is also `description` in the
manifest, and `tool/build.mjs` refuses to package if it goes over)

```
Channel analytics, outlier scoring, monetization checks and revenue estimates, on the pages you already browse.
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

**Host permission use** — the dashboard asks for one combined justification
rather than one per host, so paste this in that single field:

```
Hookrate displays research and analytics about YouTube channels and videos on
the pages the user is already viewing, so it needs access to those pages.

www.youtube.com — reads publicly visible channel pages, video pages, captions
and comments to calculate what is shown: view counts, outlier scores against a
channel's own median, revenue estimates and monetization signals. These requests
are made without cookies, so the user's session is never attached to them.

studio.youtube.com — shows a mid-roll ad-break scheduling helper on the user's
own video pages. It reads the video length displayed on the page and calculates
suggested timestamps for the user to copy. It does not change any setting.

i.ytimg.com — loads and downloads video thumbnails, which are hosted on that
domain, for previews and the thumbnail download feature.

suggestqueries-clients6.youtube.com — fetches YouTube's public search-suggestion
list for the keyword research feature.

www.googleapis.com is an optional permission, requested only if the user chooses
to read data through the official YouTube Data API with their own API key.

No data is transmitted to any server operated by the developer, because there
is none.
```

**Remote code use**

Select **"No, I am not using remote code"**. If a justification box appears:

```
The extension executes no remotely hosted code. All logic ships inside the
package: there is no eval, no new Function, no injected script tags and no
remote imports. The build script refuses to package if any of those appear.
```

---

## Publishing limit

A new developer account can have only three published items at a time. If the
dashboard reports "You have published the maximum allowed number of 3
extensions", nothing above is wrong — either unpublish an item that is no longer
needed, or use the "request a limit increase" link the dashboard shows. The
increase is reviewed by Google and is not instant, so unpublishing is the fast
path if one of the three is dormant.

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
| Personal communications | **No** | This category means private messages. YouTube comments are public posts, read to compute sentiment and mine requests; they fall under Website content below |
| Location | **No** | |
| Web history | **No** | No list of visited pages is built or stored. Cached analytics are keyed by channel, which is a byproduct of a lookup rather than a browsing record, and never leaves the device |
| User activity | **No** | No clicks, keystrokes, scroll or network monitoring of any kind |
| Website content | **Yes** | The extension reads page text and view counts from YouTube and caches them locally to compute analytics |

**Why "Website content" is Yes.** It reads page content and writes it to local
storage, which is obtaining and handling website content even though nothing is
transmitted anywhere. The store's own FAQ lists "content scraping" as handling
user data. The enforcement risk here is asymmetric: under-disclosing is what gets
items suspended, while disclosing a category the extension genuinely touches
costs nothing but a line on the listing. Checking it also keeps the form
consistent with PRIVACY.md, which describes exactly this behaviour — and
inconsistency between the two is itself a violation.

Checking it commits the item to the Limited Use requirements, which this code
already satisfies: the data is used only for the stated purpose, is never
transferred, is never used for advertising, and no human ever sees it.

**Certifications** (all three must be checked, and all three are true):

- I do not sell or transfer user data to third parties, apart from the approved use cases
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL.** Run `node tool/privacy.mjs` to render `PRIVACY.md` into
`docs/index.html`, then host that. The page is generated rather than
hand-written so the hosted copy cannot drift from the source — drift between the
policy, the dashboard disclosures and actual behaviour is itself grounds for
suspension.

How comparable extensions host theirs:

| Extension | Hosting |
|---|---|
| vidIQ | own domain — `vidiq.com/privacy/` |
| NexLev | Google Sites — `sites.google.com/.../nexlev-privacy/home` |

Options here, best first:

1. **GitHub Pages** on the existing public repo. Free, no new account, and the
   policy sits in version control next to the code it describes, so a behaviour
   change and a policy change land in the same commit. Enable it under
   Settings → Pages → deploy from branch `main`, folder `/`, and the URL is
   `https://som3669.github.io/all-combine-repo/chrome-extension/hookrate/docs/`
2. **The GitHub file view** of `PRIVACY.md` — works immediately with no setup,
   but it 404s the moment the repo goes private, and a dead privacy policy URL
   is a live compliance problem rather than a broken link.
3. **Google Sites**, which is what NexLev uses. Independent of the repo, but a
   second place to keep in sync by hand.
4. **Own domain**, if Hookrate ever gets one. What vidIQ does.

Paste the final URL into the dedicated dashboard field. It must not live only in
the description.

---

## Single purpose statement

```
Hookrate has one purpose: showing research and analytics about YouTube channels
and videos to the person browsing them. Every feature — analytics panels, outlier
scoring, monetization detection, revenue estimates, transcripts, the swipe file
and the tracker — exists to serve that single purpose.
```

---

## Assets

- [x] Store icon 128x128 — `assets/icons/icon128.png`
- [x] Small promo tile 440x280 — `assets/store/promo-small-440x280.png`
- [x] Marquee promo tile 1400x560 — `assets/store/promo-marquee-1400x560.png`
- [x] Screenshots, 1280x800 — `assets/store/screenshots/`

Upload them in this order; the first is the one most people judge the listing on:

1. `hookrate-1-channel-analytics.png` — the panel on a large channel, with the
   monetization badge beside the channel name
2. `hookrate-2-formats.png` — format clustering, with the detected title template
3. `hookrate-3-revenue-advice.png` — ranked recommendations and their impact estimates
4. `hookrate-4-watch-panel.png` — watch page stats and the outlier multiplier
5. `hookrate-5-monetization.png` — the monetization verdict and the evidence
   behind it: thresholds, sampled videos and the YPP surfaces found

These are captures of the extension actually running against live YouTube,
produced by `tool/shots.mjs`, `tool/smoke.mjs`'s sibling harness, rather than
mocked up. That distinction matters: a fabricated screenshot misrepresents
functionality, which is what the "Be Honest" policy removes extensions for.
Re-capture after any UI change so the listing never shows something the
extension no longer does:

```
node tool/build.mjs
node tool/shots.mjs --chrome "<path to Chrome for Testing>"
```

The host channel's identity is blurred before capture — its header, the video
grid, the masthead and any video ids our own panel prints. The numbers stay
sharp, since they are what the screenshot sells, but no real creator's name,
avatar or branding appears in the listing implying an endorsement that does not
exist. `--no-redact` turns that off; the script refuses to capture if the blur
did not land.

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

**3. ~~`tryAutoPlace` in the Studio module~~ — removed.** It searched Studio for
its own automatic ad-placement control and clicked it. Synthesising clicks inside
a form that governs the user's earnings, against an unversioned DOM that would
rot silently, was the riskiest code in the package for the least benefit. The
timestamp calculator beside it does the same job and the person clicks. The
extension now performs no synthetic clicks on any YouTube surface.

**4. Estimates must stay labelled.** The store removes extensions that "deceive
or mislead users". Revenue, RPM and monetization figures are inferred, and the
interface says so today. Keep it that way in the listing copy as well — never
present an estimate as a report.
