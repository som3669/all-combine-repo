# Claude Code Account Switcher

VS Code extension (plus a Node CLI) that captures each logged-in Claude Code account as a named profile and swaps credentials on demand, without re-signing in.

- Id `somshrestha.somshrestha-claude-account-switcher`, MIT. Own repo: https://github.com/som3669/claude-account-switcher
- Current: v0.1.5 (2026-09-28; built, Marketplace upload by user). 0.1.4 (2026-09-27) was README + packaging only. On the VS Code Marketplace as `somshrestha.somshrestha-claude-account-switcher` (0.1.2 published 2026-09-04T03:49Z, confirmed via the gallery API 2026-09-26); pushed to `main`. No git tags. No vsce login is stored on this machine and there is no publish workflow: publishing needs an Azure DevOps PAT (Marketplace > Manage scope) for publisher `somshrestha`. The Marketplace rejects re-publishing an existing version.
- The parent repo (som-personal / vs-code-extenstion-setup) also still has an older tracked copy of this folder from 2026-07; this folder's own repo is the source of truth.

## Stack
TypeScript, no runtime deps, no network requests. Single file `src/extension.ts` (~420 lines); `scripts/claude-switch.js` mirrors the same logic for terminal use. Both use Node `JSON.parse` because `~/.claude.json` can contain case-differing duplicate keys that PowerShell `ConvertFrom-Json` rejects.

## Files it touches
- `~/.claude/.credentials.json` (tokens, `claudeAiOauth`), `~/.claude.json` (`oauthAccount`, `userID`)
- Profiles: `~/.claude/account-switcher/<label>.json` (+ `.bak`). Live refresh tokens: treat as secrets, never commit or paste them.

## Commands
```
npm install
npm run compile      # tsc -p ./
npm run package      # vsce package (local node_modules has @vscode/vsce 2.32.0)
code --install-extension somshrestha-claude-account-switcher-<ver>.vsix --profile Som --force   # then reload window
node scripts/claude-switch.js [--list | --capture [name] | <name|email> | --force]
```
VS Code commands: `Claude Account: Switch` (also the status bar item), `Capture Current As Profile`, `Manage Profiles`. Output channel "Claude Account Switcher" logs snapshots/skips.

## History / decisions
- 0.1.0 initial; 0.1.1 (2026-07-23) added terminal switcher, new icon, renamed manifest `name` to `somshrestha-claude-account-switcher`, MIT license.
- 0.1.2 (2026-09-04) fix for "login screen on every switch". Two root causes in this code (not Claude Code):
  1. Claude Code rotates the refresh token on every refresh, so a profile snapshotted at capture time went stale. Now the active profile is re-snapshotted on every `.credentials.json` change (fs.watch, debounced 1.5s) and on shutdown.
  2. Snapshotting while signed out / mid-login wrote empty `accessToken`/`refreshToken` over a good profile. Every save and restore is now gated by `checkCredentials()`; each save keeps a `.bak`; broken profiles are flagged (warning icon, `[BROKEN: reason]` in `--list`) and need confirmation / `--force`.
  Also: reads of `.credentials.json` retry (mid-write reads), files written mode 0600, failed atomic write removes its `.tmp-*`.
- 0.1.3 (2026-09-26), login screen still appeared after 0.1.2:
  1. The old 0.1.0 build (id `somshrestha.claude-account-switcher`) was still installed next to 0.1.2 with the same command ids. Exthost logs showed only 0.1.0 activating, so none of the 0.1.2 fixes ran. The extension now warns and offers to uninstall it (0.1.0 was removed from this machine on 2026-09-26).
  2. `.claude.json` is not proof of who owns `.credentials.json`: a Claude Code process still running as the old account refreshes and writes its tokens after a switch. Ownership is now checked via `GET https://api.anthropic.com/api/oauth/profile` (Bearer access token, `anthropic-beta: oauth-2025-04-20`, returns `account.uuid`), cached per refresh token (sha256). Foreign tokens are rerouted to their real profile. The shutdown/deactivate snapshot only saves tokens whose owner is already cached, because it can't await.
  3. Snapshot on startup; after the switch-away snapshot, re-read the target profile from disk (the snapshot can reroute fresher tokens into it; a test caught the stale in-memory copy being applied).
  4. (2026-09-27) Point 1 was only half true. The user's windows run the custom VS Code profile `Som`, and every install/uninstall above had gone to the Default profile. The `Som` profile kept 0.1.0 until 2026-09-27, so neither 0.1.2 nor 0.1.3 had ever run there. The 0.1.0 switch snapshot then saved Claude Code's blanked login over the `som` profile. Install with `--profile Som`; see ../CLAUDE.md.
  How a dead token looks: after a rejected refresh, Claude Code rewrites `.credentials.json` with `accessToken: ""`, `refreshToken: ""`, `expiresAt: 0`, keeping `refreshTokenExpiresAt`/`scopes`, then shows the login screen. `checkCredentials()` already rejects this shape.
  An accepted access token does not prove the refresh token still works: refreshing revokes the old refresh token, but the old access token stays valid until it expires.
  Test safely with a fake home: copy `~/.claude/.credentials.json`, `~/.claude/account-switcher/`, `~/.claude.json` to a scratch dir and run the CLI with `USERPROFILE=<dir> HOME=<dir>`. Compare sha1 prefixes of refresh tokens, never print them.
- 0.1.5 (2026-09-28), "sign-in again and again" on Ashesh:
  1. Evidence first: switching works when a saved login is intact. On 2026-09-28 01:53Z a switch back to jenisha renewed a 14-hour-old saved login with no sign-in (no `"type":"login"` webview request in `Claude VSCode.log`). Every sign-in screen since 09-27 was the same dead Ashesh login re-applied: Claude Code logged `OAuth refresh failed ... 400` then `OAuth refresh token is no longer valid` at ~12:00Z, 14:28Z, 16:23Z (09-27) and 01:52Z (09-28). Nothing on this PC had used that token after it was saved, so Anthropic ended it (cause unknown from here: likely a login shared with another machine, or a sign-out elsewhere).
  2. Added `signInNeeded` (ISO time) on a profile when Claude Code blanks the live login for it. `checkProfile()` reports it; switching asks first. Only a different refresh token clears it, so re-applying the same dead login (even with other fields changed) keeps the mark.
  3. Removed the 0.1.3 ownership check. Anthropic's legal/compliance page (code.claude.com/docs/en/legal-and-compliance) says developers may not "collect, store, or intermediate Claude.ai credentials or session tokens" and sign-in must complete through Anthropic's own flow. Calling Anthropic APIs with the user's token from a third-party tool is out. That also rules out having the switcher renew tokens itself. **Don't call Anthropic endpoints with these tokens in diagnostics either**; check sha1 prefixes and expiry fields locally, and read Claude Code's own log for what Anthropic answered. Note that storing token copies in profiles (the extension's core) arguably falls under the same wording; the user was told on 2026-09-28. `CLAUDE_CONFIG_DIR` per account would avoid storing tokens, but the VS Code extension reads it from the extension host's own environment only, so switching would need a full VS Code restart. Untested.
  4. A credentials file with no `claudeAiOauth` (only `mcpOAuth`) used to count as valid and could overwrite a good profile; it is now "no Claude login".
  5. claude.ai requires a *recent* sign-in to authorize Claude Code: the authorize page flashes, then `claude.ai/login?reauth=1&from=logout&returnTo=...`. That's claude.ai, not Claude Code (its binary opens `https://claude.com/cai/oauth/authorize` with no reauth parameter). Known loop bug when `state` is dropped: anthropics/claude-code#77966.
  6. Claude Code's VS Code extension notices account changes made in other windows ("The signed-in account changed outside this window ... refreshing every webview"), and uses a refresh lock across processes ("another Claude Code process is holding the refresh lock").
  Tests: a Node harness that copies the real files into a scratch fake home and drives the CLI with `USERPROFILE`/`HOME` (12 checks: mark, keep mark on re-apply, clear on new login, no-login file not saved).
- Fixes must be mirrored in both `src/extension.ts` and `scripts/claude-switch.js`.
- Restart running Claude Code sessions after a switch.

## Open items
- Confirm 0.1.5 is live on the Marketplace after the user uploads it. `CLAUDE.md` and `*.vsix` are excluded from the package (`.vscodeignore`) since 0.1.4.
