# CPAGrip automation — affiliate 107151

Three pieces that automate everything around a CPAGrip content locker except the
part that must stay human: the offer completion itself.

```
landing/   static page -> trust + disclosure, sends visitors to the CPAGrip locker
worker/    Cloudflare Worker -> receives postbacks, stores them in KV, serves /stats + dashboard
fetcher/   optional -> pulls the offer feed, filters + ranks, writes offers.json
```

The live funnel is **landing page -> CPAGrip-hosted content locker (id 75202) -> postback
-> dashboard**. CPAGrip renders and geo-targets the offer wall itself, so the fetcher is
not on the critical path; it is there for picking offers and sanity-checking payouts.

## The one hard rule

**Never complete, simulate, or incentivize-fake your own offers.** CPAGrip treats
self-completed conversions as fraud: payment is withheld and the account is banned,
usually without appeal. Nothing in this repo clicks an offer, fills a form, or
fabricates a postback. Automate the plumbing; leave the conversion to real visitors.

The landing page reflects this too — it discloses that offers are paid ads and that
a reward only unlocks after the advertiser confirms.

---

## 1. Offer fetcher (optional)

Not required for the funnel to work — the hosted locker chooses offers per visitor. Use
this when you want to see what your account is actually being offered, compare EPCs, or
build a manually curated wall later.

Pulls `offer_feed_json.php` server-side, so the private key never reaches a browser.

**Filters:** country `US`, offer type `Email/Zip Submit`, payout `>= $0.50`.
**Ranking:** by net EPC. Offers with a reported EPC form the top tier; offers with no
EPC sort by payout underneath them (a $0.90 payout is not comparable to a $0.42 EPC,
so they are never mixed on one scale).
**Output:** top 10 to `landing/offers.json`.

### Run it

```powershell
# PowerShell
$env:CPAGRIP_PRIVATE_KEY = "your_private_key"
npm run fetch
```

```bash
# bash
export CPAGRIP_PRIVATE_KEY=your_private_key
npm run fetch
```

Get the private key from CPAGrip → **Tools → API / Offer Feed**. It is not the
public key; the public key (`deb40494db846602f9531f7e27745e76`) is already the default.

Typical output:

```
fetched 214 offers, 31 matched filters, wrote top 10
-> C:\tmp\cpagrip-automation\landing\offers.json
  $1.40  epc=0.512  Win a $100 Grocery Card
  ...
```

The raw feed response is saved to `fetcher/last_response.json` so you can inspect the
actual field names if a filter comes back empty. If nothing matches, the script prints
the `offer_type` values the feed actually returned — set `CPAGRIP_OFFER_TYPE` to one of
those.

### Config (all optional, via env)

| Variable | Default | Purpose |
|---|---|---|
| `CPAGRIP_PRIVATE_KEY` | — | **required** |
| `CPAGRIP_USER_ID` | `107151` | affiliate id |
| `CPAGRIP_PUBKEY` | `deb40494…` | public key |
| `CPAGRIP_COUNTRY` | `US` | geo filter |
| `CPAGRIP_OFFER_TYPE` | `Email/Zip Submit` | type filter (token-subset match, so `Email Submit` also passes) |
| `CPAGRIP_MIN_PAYOUT` | `0.5` | payout floor |
| `CPAGRIP_LIMIT` | `10` | how many to write |
| `CPAGRIP_OUT` | `landing/offers.json` | output path |

Copy `.env.example` if you prefer to keep them in a file — but note the script reads
the process environment, not the file, so source it yourself.

### Schedule it (every 6 hours)

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File fetcher\schedule.ps1 -PrivateKey "your_key"
Start-ScheduledTask -TaskName CPAGripOfferFetch   # run once now
```

That writes `fetcher/run_fetch.cmd` holding the key — it is gitignored, keep it that way.

Linux/macOS cron:

```cron
0 */6 * * * CPAGRIP_PRIVATE_KEY=your_key /usr/bin/node /path/to/fetcher/fetch_offers.js >> /path/to/fetch.log 2>&1
```

If the landing page is on Cloudflare Pages / Netlify / GitHub Pages, have the cron job
commit and push the regenerated `offers.json` — the site redeploys itself and the page
updates with no manual editing.

---

## 2. Landing page

Static: `index.html`, `styles.css`, `app.js`, `config.js`. No build step, no framework.

```bash
npm run serve       # http://localhost:4173
```

Deploy by uploading the `landing/` folder anywhere static — Cloudflare Pages, Netlify
drop, S3, any host.

Everything configurable lives in `landing/config.js`:

```js
window.RV_CONFIG = {
  lockerUrl: 'https://singingfiles.com/show.php?l=0&u=107151&id=75202',
  rewardName: '$25 gift card code',
  rewardUrl: null,
};
```

What the page does:

- Mints a per-visitor id in `localStorage` and appends it as `tracking_id` to the locker
  URL, so the postback attributes the conversion back to this page:
  `…/show.php?l=0&u=107151&id=75202&tracking_id=vabc123`
- Single **Unlock reward** CTA, marked `rel="noopener sponsored nofollow"`.
- After the click, shows a plain "waiting on the advertiser" state with the visitor
  reference — no fake countdown, no "you won", no invented winner names.
- Returning visitors who already opened the wall land back in the waiting state.
- Carries the advertising disclosure in the body, not buried in a footer link.

### Geo

The locker is geo-gated by CPAGrip. From an unsupported country it renders
`Error Code: 01-((XX) not allowed)` instead of an offer wall — that is CPAGrip's page,
not this one. The hero copy tells visitors the offer window will say so.

**Do not test by completing an offer yourself, VPN or not.** A self-completed conversion
on your own affid is the fraud pattern CPAGrip bans for. Verify the plumbing with the
Worker's test postback instead (below), which proves the whole chain without touching
a real offer.

## 3. Postback receiver + dashboard

One Cloudflare Worker on the free tier. The dashboard HTML is bundled into the Worker,
so there is no second thing to host.

| Route | Purpose |
|---|---|
| `GET /postback` | CPAGrip pings this on every conversion |
| `GET /stats` | JSON rollups: today / 7d / 30d / all-time, top offers, 30-day series |
| `GET /conversions?limit=50` | recent raw conversion records |
| `GET /` | live dashboard, polls `/stats` every 60s |
| `GET /health` | liveness check |

### Deploy

```bash
cd worker
npm install
npx wrangler login

# Create the KV namespace and paste the printed id into wrangler.toml
npx wrangler kv namespace create CONVERSIONS

# Set the shared secret that guards /postback (any long random string)
npx wrangler secret put POSTBACK_SECRET

npx wrangler deploy
```

You get a URL like `https://cpagrip-postback.<your-subdomain>.workers.dev`.

Local run: copy `.dev.vars.example` to `.dev.vars`, then `npx wrangler dev`.

### Wire it into CPAGrip

1. Log in to CPAGrip → **Tools → Postback Tools** (also listed as *Postback URL* /
   *Server Postback*).
2. Paste this as the global postback URL, substituting your Worker host and secret:

```
https://cpagrip-postback.YOUR-SUBDOMAIN.workers.dev/postback?secret=YOUR_SECRET&payout={payout}&offer_id={offer_id}&country={country}&ip={ip}&tracking_id={tracking_id}
```

3. Save, then use CPAGrip's **Test Postback** button. The Worker replies `1` with a
   200; anything else means the URL or secret is wrong.
4. Open the Worker root URL in a browser — the test conversion should appear within
   60 seconds.

Watch live requests while testing with `npx wrangler tail`.

### Storage model

```
conv:<iso-ts>:<rand>   one conversion, 90-day TTL, immutable
day:<YYYY-MM-DD>       { count, payout, offers: { id: { count, payout, title } } }
total                  same shape plus first_seen
dedupe:<sha256>        7-day marker; CPAGrip retries postbacks
```

Two caveats worth knowing:

- **Dedupe** keys on `offer_id + tracking_id + ip + payout`. A retry is ignored; two
  genuinely different visitors are not.
- **Day/total buckets are read-modify-write** on an eventually consistent store. Two
  conversions in the same instant can lose one increment in the rollup. The `conv:`
  records are never touched after writing, so they stay authoritative — rebuild a
  rollup from `/conversions` if the numbers ever look off. At content-locker volumes
  this is rare enough not to warrant a Durable Object.

### Dashboard elsewhere

`worker/src/dashboard.html` is standalone. Drop it on any static host and point it at
the Worker:

```
https://your-site.com/dashboard.html?api=https://cpagrip-postback.YOUR-SUBDOMAIN.workers.dev/stats
```

`/stats` sends permissive CORS headers, so cross-origin polling works. It is also
unauthenticated — anyone with the URL can read your earnings. Put Cloudflare Access in
front of the Worker if that matters.

---

## Tests

```bash
npm test
```

- `fetcher/test/filter.test.js` — field aliasing, geo/type/payout filtering, and the
  EPC-vs-payout ranking tiers, against a feed sample with mixed field names. No network.
- `worker/test/smoke.mjs` — postback auth, dedupe, KV rollups, and every route, against
  an in-memory KV stand-in. No Cloudflare account needed.

## Order of operations

1. Deploy the Worker, wire the postback, send CPAGrip's test ping. Confirm it shows on
   the dashboard — that validates the whole attribution chain with no offer completed.
2. Set `lockerUrl` in `landing/config.js`, deploy the landing page.
3. Optionally run the fetcher to see what offers your locker is drawing from.
4. Send real traffic. Only real traffic.
