# som-personal

Som's personal projects. Moved here from `C:\tmp` on 2026-09-24; `C:\tmp` is now scratch only
(one-off scripts, logs, zips). Older notes, scripts and session history still say `c:\tmp\<project>`
— read that as `C:\laragon\www\som-personal\<project>`.

This folder is itself a git repo: `som3669/vs-code-extenstion-setup` (GitHub redirects it to
`som3669/all-combine-repo`). Most projects below are **their own nested repos** — commit and push
from inside the project, not from here. Each project has its own `CLAUDE.md`; read that one, not
this whole tree.

| Folder | What | Repo |
|---|---|---|
| `ai_patro/` | Nepali calendar Flutter app on Play (`com.aipatro.ai_patro`) | som3669/ai-patro |
| `AutoEdit/` | Auto video editor (Vite + React + Tauri), split out of OpenCut | som3669/autoedit |
| `OpenCut/` | Upstream OpenCut clone with local Tauri shell + installer | OpenCut-app/OpenCut (upstream, don't push) |
| `Open-Higgsfield-AI/` | Upstream AI studio clone, run locally | Autom8AI/Open-Higgsfield-AI (upstream, don't push) |
| `tortoise-tts/` | Tortoise TTS studio (FastAPI web UI + desktop GUI) | som3669/tortoise-studio |
| `chrome-extension/` | Chrome extensions: adwipe, autofiller, hookrate, seo-analyzer, tablite, tabrest | this repo (adwipe has its own) |
| `vs-extension/` | VS Code extensions (token meter, prompt monitor, account switcher, …) | mixed — see its CLAUDE.md |
| `theme-review-kit/` | Claude Code plugin for WordPress.org theme review | som3669/theme-review-kit |
| `deepa-portfolio/` | Next.js portfolio site on Vercel | deepa688/portfolio (SSH alias `github-deepa`) |
| `privacy-policy/` | GitHub Pages privacy policies for the apps/extensions | som3669/privacy-policy |
| `accessproof-site/` | Gutenberg marketing pages for the AccessProof plugin | this repo |

## Rules that apply everywhere

- Never change a version number without asking — it is a release decision.
- Don't put loose files in this root; scratch work goes in `C:\tmp`.
- Secrets (keystores, API keys, service accounts) are never committed; each project's CLAUDE.md
  says where its backups live.
- Record durable lessons in the project's CLAUDE.md so they travel with the clone.
