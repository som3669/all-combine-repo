# Claude Code Token Meter — Project Context

## What this is
VS Code extension that shows live Claude Code usage in the status bar.
- **Publisher:** `somshrestha` on VS Code Marketplace
- **Extension ID:** `somshrestha.claude-token-statusbar`
- **GitHub:** https://github.com/som3669/Claude-Code-Token-Meter
- **License:** Proprietary, all rights reserved. Copyright Som Shrestha (somshrestha3669@gmail.com)

## Current version
0.2.6 — published to marketplace. Last marketplace release was 0.2.4; 0.2.5–0.2.6 built locally but pending manual-release workflow run.

## Key files

| File | Purpose |
|------|---------|
| `src/extension.ts` | Main extension — status bar, file watcher, auto-setup, refresh command |
| `package.json` | Extension manifest — bump `version` here for releases |
| `hooks/stop-usage.ps1` | Reference copy of Stop hook (auto-installed to `~/.claude/hooks/`) |
| `.github/workflows/manual-release.yml` | Workflow dispatch release — use this to publish |
| `.github/workflows/release.yml` | Tag-triggered release |

## Architecture

**Flow:** Claude responds → Stop hook fires → PowerShell reads transcript + calls API → writes JSON files → file watcher triggers → status bar updates.

**Hook script** lives at `~/.claude/hooks/stop-usage.ps1` (auto-installed by extension on first activate).
Hook does two things:
1. Reads transcript JSONL (`-Tail 300`) → extracts last token usage → writes `~/.claude/usage-current.json`
2. Reads `~/.claude/.credentials.json` → `claudeAiOauth.accessToken` → calls `https://api.anthropic.com/api/oauth/usage` → writes `~/.claude/plan-usage.json`

**Status bar** watches `~/.claude/{usage-current,plan-usage}.json` via `FileSystemWatcher`.

**Clicking the status bar** runs the hook with `echo {} |` piped stdin — skips token part (no transcript), still hits API for fresh plan %. File watcher auto-updates bar.

## Key constants in extension.ts
```
CLAUDE_DIR   = ~/.claude
USAGE_FILE   = ~/.claude/usage-current.json
PLAN_FILE    = ~/.claude/plan-usage.json
HOOKS_DIR    = ~/.claude/hooks
HOOK_SCRIPT  = ~/.claude/hooks/stop-usage.ps1
SETTINGS_FILE = ~/.claude/settings.json
```

## API details
- **Endpoint:** `https://api.anthropic.com/api/oauth/usage`
- **Auth:** `Bearer <token>` from `~/.claude/.credentials.json` → `claudeAiOauth.accessToken`
- **Response fields used:** `five_hour.utilization`, `five_hour.resets_at`, `seven_day.utilization`, `seven_day.resets_at`
- `utilization` can be 0–1 or 0–100 — `ConvertTo-Pct` handles both
- `resets_at` can be Unix int or ISO string — `ConvertTo-Unix` handles both

## PowerShell constraints (Windows PS 5.1)
- No `??` operator — use `if ($null -ne $x) { $x } else { 0 }`
- No arrow unicode (`↑↓`) in scripts — encoding breaks. Use ASCII labels (`in:` `out:`)
- BOM issue: never use `Set-Content -Encoding utf8` for JSON — use `[System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($false))`

## Releasing
No `gh` CLI installed. Use GitHub Actions UI:
1. Go to Actions → Manual Release → Run workflow
2. Enter `version` (e.g. `0.2.7`) and check `publish`
3. Needs `VSCE_PAT` secret set in repo settings

## Rules
- License email MUST be `somshrestha3669@gmail.com` (not work email)
- No Co-Authored-By in git commits
- Proprietary license — do not open source
