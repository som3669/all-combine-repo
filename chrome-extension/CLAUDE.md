# chrome-extension

Personal MV3 Chrome extensions (moved from `C:\tmp\chrome-extension`; old paths in history say `c:\tmp`). Each folder has its own CLAUDE.md.

- [adwipe](adwipe/CLAUDE.md) - ad/tracker blocker (DNR, ~29.5k rules), formerly AdBlock Guard; own private repo som3669/adwipe.
- [autofiller](autofiller/CLAUDE.md) - one-click form filler with fake data or saved profile.
- [hookrate](hookrate/CLAUDE.md) - YouTube creator analytics; npm build/smoke tooling; hosts shared puppeteer + Chrome for Testing.
- [seo-analyzer](seo-analyzer/CLAUDE.md) - SEO Inspector side panel with FastSpring/Cloudflare Worker paywall (unconfigured).
- [tablite](tablite/CLAUDE.md) - minimal tab-suspender MVP, overlaps TabRest.
- [tabrest](tabrest/CLAUDE.md) - published tab suspender, 1.1.0; mirrored to som3669/tabrest; CI in ../.github.

Shared facts:
- Monorepo root is `C:\laragon\www\som-personal` (git `origin` som3669/vs-code-extenstion-setup, redirects to som3669/all-combine-repo). adwipe is a separate git repo, not tracked by it.
- Privacy policies live in som3669/privacy-policy (`../privacy-policy`), served at `https://som3669.github.io/privacy-policy/<slug>/` (adwipe, autofiller, hookrate, tabrest).
- Real-browser tests need Chrome for Testing; installed stable Chrome ignores `--load-extension`. adwipe/tabrest tests reuse `hookrate/node_modules` and `hookrate/chrome/`.
- Chrome Web Store: new developer account was capped at 3 published extensions (2026-08-26).
