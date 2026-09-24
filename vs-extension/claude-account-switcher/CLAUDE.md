# Claude Code Account Switcher

VS Code extension (plus a Node CLI) that captures each logged-in Claude Code account as a named profile and swaps credentials on demand, without re-signing in.

- Id `somshrestha.somshrestha-claude-account-switcher`, MIT. Own repo: https://github.com/som3669/claude-account-switcher
- Current: v0.1.2 (2026-09-04), installed locally from the `.vsix`; pushed to `main`. Not published to the Marketplace (checked 2026-09-04: needs Azure DevOps PAT for publisher `somshrestha`). No git tags.
- The parent repo (som-personal / vs-code-extenstion-setup) also still has an older tracked copy of this folder from 2026-07; this folder's own repo is the source of truth.

## Stack
TypeScript, no runtime deps. Single file `src/extension.ts` (~385 lines); `scripts/claude-switch.js` mirrors the same logic for terminal use. Both use Node `JSON.parse` because `~/.claude.json` can contain case-differing duplicate keys that PowerShell `ConvertFrom-Json` rejects.

## Files it touches
- `~/.claude/.credentials.json` (tokens, `claudeAiOauth`), `~/.claude.json` (`oauthAccount`, `userID`)
- Profiles: `~/.claude/account-switcher/<label>.json` (+ `.bak`). Live refresh tokens: treat as secrets, never commit or paste them.

## Commands
```
npm install
npm run compile      # tsc -p ./
npm run package      # vsce package (local node_modules has @vscode/vsce 2.32.0)
code --install-extension somshrestha-claude-account-switcher-<ver>.vsix --force   # then reload window
node scripts/claude-switch.js [--list | --capture [name] | <name|email> | --force]
```
VS Code commands: `Claude Account: Switch` (also the status bar item), `Capture Current As Profile`, `Manage Profiles`. Output channel "Claude Account Switcher" logs snapshots/skips.

## History / decisions
- 0.1.0 initial; 0.1.1 (2026-07-23) added terminal switcher, new icon, renamed manifest `name` to `somshrestha-claude-account-switcher`, MIT license.
- 0.1.2 (2026-09-04) fix for "login screen on every switch". Two root causes in this code (not Claude Code):
  1. Claude Code rotates the refresh token on every refresh, so a profile snapshotted at capture time went stale. Now the active profile is re-snapshotted on every `.credentials.json` change (fs.watch, debounced 1.5s) and on shutdown.
  2. Snapshotting while signed out / mid-login wrote empty `accessToken`/`refreshToken` over a good profile. Every save and restore is now gated by `checkCredentials()`; each save keeps a `.bak`; broken profiles are flagged (warning icon, `[BROKEN: reason]` in `--list`) and need confirmation / `--force`.
  Also: reads of `.credentials.json` retry (mid-write reads), files written mode 0600, failed atomic write removes its `.tmp-*`.
- Fixes must be mirrored in both `src/extension.ts` and `scripts/claude-switch.js`.
- Restart running Claude Code sessions after a switch.

## Open items
- Marketplace publish not done (user decision; publishing is one-way public).
