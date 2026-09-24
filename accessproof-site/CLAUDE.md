# AccessProof site pages

Marketing pages for the AccessProof WooCommerce accessibility plugin, written as native
Gutenberg block markup. There are two pages: free at `/accessproof/`, and Pro at
`/accessproof/pro/` as a child of free. The target site is `https://rcube.thulo.eu.org`.
The plugin code itself is not here; it lives in `C:\laragon\www\mas\wp-content\plugins\accessproof` and `accessproof-pro`.
Moved from `C:\tmp\accessproof-site` on 2026-09-24. It now sits inside the `som-personal` git repo.
`3-notes.md` is the human-facing guide. Read it before changing copy or markup.

## Files
- `src/pages.js`: all page content, the only place to edit copy.
- `src/blocks.js`: block helper functions, plus every colour and font value.
- `src/wxr.js`: writes the WXR importer file. `src/preview.js`: builds the standalone preview (strips block comments, adds a small structural CSS shim).
- `build-pages.js`: the entry point. It generates `1-accessproof-free-page.html`, `2-accessproof-pro-page.html`, `accessproof-import.xml` and `site-preview.html`, so never hand-edit those.
- `src/screenshot-1..5.png`, `icon-256x256.png`, `banner-772x250.png`: plugin assets.
- `src/normalised-free.html` and `normalised-pro.html`: `build-pages.js` does not read these.
- `helper/accessproof-page-images/`: a throwaway WP plugin. Activating it copies the 5 screenshots into the uploads **root** and registers them in the media library. Delete it afterwards.

## Build / import
- Build with `node build-pages.js`. To build against a test host, run `SITE=http://mas.test node build-pages.js` (the default is rcube.thulo.eu.org).
- To import: Tools -> Import -> WordPress -> `accessproof-import.xml`. This creates page IDs 4001 (free) and 4002 (Pro, parent 4001).
- After importing, you **must** go to Settings -> Permalinks -> Save. Until then, imported pages 404.
- Images: install or activate the helper plugin, or upload `accessproof-screenshot-N.png` to the uploads root yourself.
- Use a full-width template, and hide the theme's page title. Each page already has its own h1.
- Alternative: paste the `1-`/`2-` html files into the Code editor.

## Decisions / gotchas
- Pages are core blocks only, with zero `core/html` blocks. An earlier Custom HTML / `wp:html` version rendered but could not be edited. Styling lives in block attributes, with no stylesheet.
- Checked on WordPress 7.0: pages mount in the editor with no invalid-content warnings (per `3-notes.md`, Aug 2026). The block counts in the notes (free 102 vs "105 mounted", Pro 85) may drift.
- Screenshots are referenced by URL, not base64. They go in the uploads root, not `/YYYY/MM/`, so the URL is the same on every site.
- The WXR importer cannot import these images because they have no public URL. That is why the helper plugin exists.
- Block validation traps: quotes in style attributes must be `&quot;`. Buttons need longhand `padding-top/right/bottom/left` plus the `has-custom-font-size` class when a size is set.
- Palette and type were taken from `rcube.thulo.eu.org/unishop6/`: tint `#edfbe2`, ink `rgb(47,59,64)`, headings `#16232a`, eyebrow `#377a00`, buttons `#0f172a` (uppercase, 4px radius), IBM Plex Serif over Inter.
- Every number in the copy was measured (the store scan, the accessiBe test, the FTC $1M fine from Jan 2025, the EAA applying since 2025-06-28). If a re-scan changes a figure, update the copy and the table in `3-notes.md`.

## Open items
- There are 3 `TODO`s in `src/pages.js`, all on the Pro page: the single-site price, the 25-site agency price, and the refund policy. For reference, a comparable plugin charges $190 / $750 (5 sites) / $2,250 (25 sites).
