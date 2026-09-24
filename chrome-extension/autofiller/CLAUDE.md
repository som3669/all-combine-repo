# AutoFiller

MV3 Chrome extension that fills web forms in one click with realistic fake data (dev/QA) or a saved profile. Plain JS, no build step, no tests. Version 1.0.0.

## Repo
- Tracked in the som-personal monorepo under `chrome-extension/autofiller/`. No past Claude session history for this project.

## Key files
- `manifest.json` permissions: `storage`, `activeTab`, `scripting`, `contextMenus` (no host permissions; fills only on user action).
- `sw.js` service worker: toolbar click, commands, context menus, injects the fill script.
- `options.html/js` settings tabs (profiles, custom field rules, shortcuts, backup/restore, Fake Filler import). Profiles and rules saved in `chrome.storage.sync`.
- `popup.html/js`. `icons/` (16/32/48/128).
- `MANUAL.md` full user guide. `README.md` feature list.
- `store/` `description.txt`, `permission-justifications.txt` (single purpose, per-permission text, remote code: none, data disclosures), promo tiles, screenshot.
- `autofiller-v1.0.0.zip` packaged build (built ad hoc; no packaging script).

## Commands
- None. Load unpacked from this folder via `chrome://extensions` (Developer mode).

## Shortcuts (manifest `commands`)
- `Alt+Shift+F` fill all inputs with fake data; `Alt+Shift+D` fill with my profile; `fill-form`, `fill-input` unbound by default.

## Constraints
- Passwords are never stored; fake mode fills a dummy value only.
- Keep permissions narrow (`activeTab` + `scripting`, no broad host access); privacy claim and store justifications depend on it.

## Store
- Privacy policy: https://som3669.github.io/privacy-policy/autofiller/ (source in som3669/privacy-policy).
