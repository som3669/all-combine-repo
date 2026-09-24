# TabLite

Minimal MV3 Chrome extension (MVP) that auto-suspends inactive tabs via `chrome.tabs.discard` and shows estimated memory savings in a popup. Plain JS, no build step, no tests. Version 1.0.0.

## Repo
- Tracked in the som-personal monorepo under `chrome-extension/tablite/`. No past Claude session history for this project.
- Same problem space as `../tabrest` (the maintained, published tab suspender). Bugs fixed in TabRest 1.1.0 likely apply here too (see Constraints).

## Key files
- `manifest.json` permissions: `tabs`, `storage`, `alarms`, `system.memory`.
- `background.js` service worker: tracking + 1-minute sweep, discard eligibility, single `onMessage` switch; `ESTIMATED_MB_PER_TAB` heuristic.
- `popup.html|css|js` dashboard (per-tab status, whitelist toggle, Suspend All, idle slider, master switch; light/dark).
- `icons/` placeholder icons.

## Commands
- None. Load unpacked from this folder via `chrome://extensions`.

## Constraints / known limits (README)
- Default idle threshold 10 min, checked every minute.
- Never suspends active, pinned, audible, already-discarded, internal pages, or whitelisted tabs.
- No unsaved-form detection (`scripting` intentionally omitted); memory figure is an estimate.
- TabRest lessons worth checking here (not verified in TabLite): MV3 service worker is evicted after ~30s, so any in-memory state is lost (README says last-active timestamps persist in `storage.local`); queued tabs have empty `tab.url` (address in `tab.pendingUrl`), and discarding them loses the URL.
