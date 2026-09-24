# Hookrate

MV3 Chrome extension: YouTube research/analytics injected into YouTube pages (channel analytics, outlier scoring, monetization detection, revenue estimates, transcripts, sentiment, sponsorship scan, swipe file, tracker). No backend, no account. Version 0.1.2. Built from a study of NexLev (started 2026-08-25).

## Repo
- Tracked in the som-personal monorepo (`origin` = som3669/vs-code-extenstion-setup, which GitHub redirects to som3669/all-combine-repo). Work has been on `main`; earlier `release` and `advance` branches existed.
- `node_modules/` and `chrome/` (Chrome for Testing 152 and 154) are gitignored but used by the adwipe and tabrest test rigs too. Don't delete.

## Layout
- `src/background/` service worker (module): `lib/innertube.js`, `lib/parse.js`, `lib/cache.js`, `lib/dataapi.js`, `analytics/*`, `store/*` (settings, swipe, tracker).
- `src/content/` router + features (channel, watch, shorts, home, search, studio). `src/popup`, `src/options`, `src/swipe`, `src/ui`.
- `assets/icons/` shipped; `assets/store/` listing images (not shipped). `STORE.md` = all dashboard copy, justifications, data disclosures.
- `tool/build.mjs` (validate + zip), `tool/smoke.mjs` (live YouTube smoke test), `tool/shots.mjs` (store screenshots).

## Commands
- `npm install` (dev tooling only)
- `npm run build` -> validates and writes `dist/hookrate-<version>.zip` (+ `dist/package` staged)
- `npm run check` validate only
- `npm run chrome` fetch Chrome for Testing; `node tool/smoke.mjs --chrome "<path>"` (runs against `dist/package`, 15 checks)
- `node tool/shots.mjs --chrome "<path>"` recapture screenshots (flags `--no-redact`, `--skip-hero`)
- Build ships only `manifest.json`, `src/`, `assets/icons/`. Refuses to package on: missing manifest paths, bad imports, `eval`/`innerHTML`/`debugger`, undeclared hosts, name/description over limits (description max 132 chars).

## Design rules
- Content scripts never fetch; worker fetches with `credentials: 'omit'` (also stops Premium hiding `adPlacements`).
- Parse by renderer key (deep search), never fixed response paths.
- Data source setting: `page` (default, reads pages, against YouTube ToS), `api` (Data API key), `strict` (API only; disables monetization, transcripts, comments, similar).
- DOM: never pass possible `null` to `append`/`replaceChildren` (renders "null"); use `HR.ui.fill`/`HR.ui.add`.
- `saveSettings` triggers remount; use the `quiet` option for UI-applied prefs.

## Gotchas / history
- Chrome 137+ refuses `--load-extension`; override flag gone by 151. Use Chrome for Testing.
- PowerShell 5.1 `Compress-Archive` writes backslash zip entries; build writes entries with forward slashes and checks.
- Store images must be 24-bit PNG, no alpha (icon may keep alpha). Store icon `assets/store/store-icon-128.png` = 96x96 art in 128 canvas.
- Screenshots blur the host channel (masthead, avatar, IDs) via container-level redaction in `shots.mjs`. A `*/` inside a CSS comment once broke the blur rules.
- Channel panel collapsed by default, remembers choice (2026-09-03). Filter bar aligned to column (0.1.1, 2026-09-04).
- 0.1.2 (2026-09-05) has no shipped-code change vs 0.1.1.
- Dashboard hit "maximum of 3 published extensions" on new account (2026-08-26).
- Listing went live; Enhanced Safe Browsing "not trusted" warning is developer-reputation based, not a code issue.

## Store
- Privacy policy: https://som3669.github.io/privacy-policy/hookrate/ (source `src/hookrate.md` in som3669/privacy-policy).
- Data usage: only "Website content" ticked. Remote code: No. Justifications in STORE.md.

## Open items
- `assets/store/screenshots/hookrate-3-revenue-advice.png` was deleted; rerun `tool/shots.mjs` to restore the 5-shot set.
- Untracked `a.png`/`b.png`/`c.png` in screenshots dir left on purpose.
