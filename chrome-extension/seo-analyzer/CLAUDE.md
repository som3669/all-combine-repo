# SEO Inspector (seo-analyzer)

MV3 Chrome extension: on-page SEO analyzer in the side panel (meta tags, headings, links, images, schema). Plain JS, no build step, no tests, no README. Version 1.0.0.

## Repo
- Tracked in the som-personal monorepo under `chrome-extension/seo-analyzer/`. No past Claude session history for this project.

## Key files
- `manifest.json` permissions: `activeTab`, `scripting`, `storage`, `sidePanel`, `tabs`; host permissions `http://*/*`, `https://*/*`.
- `background.js` opens the side panel on toolbar click (`openPanelOnActionClick`).
- `sidepanel/panel.html|js|css` the analyzer UI.
- `lib/paywall.js` license gate: free tier `FREE_DAILY_LIMIT = 15` analyses/day; paid unlock via FastSpring key validated by a Worker, re-checked daily; state in `chrome.storage.local`.
- `worker/` Cloudflare Worker license backend (`worker.js`, `wrangler.toml`, `README.md`): `POST /validate`, `POST /webhook` (FastSpring, HMAC), KV binding `LICENSES`.

## Commands (worker, from worker/README.md)
- `npm i -g wrangler` ; `wrangler login`
- `wrangler kv namespace create LICENSES` then paste id into `wrangler.toml`
- `wrangler secret put FS_WEBHOOK_SECRET`
- `wrangler deploy`
- Extension itself: load unpacked from this folder.

## Open items (placeholders still in code)
- `lib/paywall.js` `STORE_URL` / `VALIDATE_URL` are `YOUR-STORE` / `YOUR-WORKER` placeholders.
- `wrangler.toml` KV id is `PASTE_YOUR_KV_NAMESPACE_ID_HERE`.
- FastSpring product `seo-inspector-pro` ($9.99 one-time) per worker README; not confirmed set up.
- No privacy policy entry in som3669/privacy-policy for this extension; a paid license check is a network call and would need disclosure.
