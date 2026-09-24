# TabRest

MV3 Chrome extension that auto-suspends idle tabs (`chrome.tabs.discard`) and has a Suspend All button. Plain JS, no build step. Version 1.1.0.

## Repo
- Tracked in the som-personal monorepo under `chrome-extension/tabrest/`.
- Also mirrored to the standalone repo `som3669/tabrest` (extension at its root, its own `.github/workflows/tests.yml`, no zips committed). Sync by hand.

## Key files
- `sw.js` service worker: 1-minute alarm scan, idle tracking, protections, suspend/park/restore, badge, stats.
- `content.js` form-guard (marks tabs with unsaved input). `suspended.html/js` parking page for uncommitted tabs.
- `popup.*`, `options.*` (idle presets, per-site rules, whitelist, autoClose, "Stop tabs mid-load").
- `store/` description, permission-justifications, screenshots, promo tiles. `MANUAL.md`, README changelog.
- `test/` real-browser regression suite (burst, timer, options, guards) + `shots.mjs`.

## Commands
- `node test/run.mjs` all; `node test/run.mjs burst` one. Timer test takes 2-5 min.
- `node test/shots.mjs` regenerate `store/screenshot-*.png` from the running extension.
- Tests find puppeteer-core and Chrome for Testing via `../hookrate` (node_modules, `chrome/win64-152...`); override with `CHROME_PATH`, `PUPPETEER_DIR`.
- CI: `C:\laragon\www\som-personal\.github\workflows\tabrest-tests.yml` (path filter `chrome-extension/tabrest/**`, Node 20, xvfb-run). `--no-sandbox --disable-dev-shm-usage` added only when `CI` is set (GitHub runners: "No usable sandbox").
- No packaging script; `tabrest-v<ver>.zip` built ad hoc: code + icons + suspended page only, no `test/` or `store/`.

## Gotchas (learned 2026-09-05, 2-star review fix)
- MV3 SW is evicted ~30s idle: never keep state in module variables. Idle timestamps live in `storage.session`, cross-checked with `tab.lastAccessed`.
- Queued tabs have empty `tab.url` and address in `tab.pendingUrl`; `urlOf()` falls back to it. Discarding an uncommitted tab destroys its URL, so they are parked on `suspended.html` (URL in hash) instead.
- `chrome.tabs.discard()` resolves silently on skipped tabs; verify discards.
- Tests must never attach a debugger to the SW (keeps it alive, hides the bug). Always include a control tab. Do not click the headed test window.
- Single-origin test servers hit Chrome's 6-connections-per-host limit.
- Stable Chrome ignores `--load-extension`; use Chrome for Testing (verified 152, 154 beta).
- `.row { display:flex }` overrode `[hidden]` in popup (fixed).
- Alarms run at most once a minute: 1-min setting lands at 1-2 min (say so in replies/copy).
- Parked tabs need TabRest installed to restore; address is shown with a copy button; the option can be turned off.

## Store
- Privacy policy: https://som3669.github.io/privacy-policy/tabrest/ (source in som3669/privacy-policy).
- No new permissions in 1.1.0.

## Open items
- Reviewer reply drafted; send only after 1.1.0 is live in the store.
- Only tested on Windows (plus Ubuntu CI).
- README Roadmap is partly stale (badge and per-site rules already ship); remaining idea: per-tab CPU detection (`chrome.processes`, Dev/Canary only).
