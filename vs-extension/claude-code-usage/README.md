# Claude Code Token Meter

> Live Claude Code usage in your VS Code status bar — session limits, weekly limits, and token counts, updated after every response.

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-pink?logo=github)](https://github.com/sponsors/som3669)

---

## Features

- **Current session bar** — 5-hour usage limit with percentage
- **Weekly bar** — all-models weekly usage with percentage
- **Color warnings** — bar turns yellow at ≥80%, red at ≥95% (session and weekly tracked independently)
- **90% alert** — popup notification when session approaches limit
- **Burn rate prediction** — hover tooltip shows estimated time until session runs out
- **Auto-refresh** — fetches fresh data every 5 minutes, plus live countdown updates every minute
- **Click to refresh** — click the bar to instantly fetch latest usage from the API
- **Hover tooltip** — reset times, burn rate prediction, token counts, extra credit usage
- **Auto-setup** — configures itself on first install, no manual steps needed

**Status bar preview:**

| State | Bar |
|-------|-----|
| Normal | `⚡ [ ████░░░░░░ 35% (cur)   ██░░░░░░░░ 17% (wk) ]` |
| Warning (≥80%) | `⚡ [ 🟡 ████████░░ 82% (cur)   ██░░░░░░░░ 17% (wk) ]` |
| Critical (≥95%) | `⚡ [ 🔴 ██████████ 98% (cur)   ██░░░░░░░░ 17% (wk) ]` |

**Tooltip preview:**
```
Current session: 35% used
Resets in 3h 12m
At current rate, runs out in ~4h 30m

Weekly (all models): 17% used
Resets Wed 10:45 PM

Extra usage credit: 45% ($0.90 / $2.00)
```

---

## Installation

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=somshrestha.claude-token-statusbar)
2. A prompt appears: **"Set up automatically"** — click it
3. Done. Send a message to Claude Code and the status bar updates

---

## Requirements

- [Claude Code](https://claude.ai/code) v2.1.178+
- Windows (PowerShell hooks)
- Claude AI subscription (OAuth login)

---

## How it works

On first activation, the extension:
1. Writes a Stop hook script to `~/.claude/hooks/stop-usage.ps1`
2. Registers it in `~/.claude/settings.json`

After each Claude response, the hook:
1. Reads the session transcript to extract token counts
2. Calls `https://api.anthropic.com/api/oauth/usage` using your local Claude credentials
3. Writes results to `~/.claude/usage-current.json` and `~/.claude/plan-usage.json`

The extension watches these files and updates the status bar instantly.

---

## Manual setup (optional)

If you prefer to set up manually, copy [`hooks/stop-usage.ps1`](hooks/stop-usage.ps1) to `~/.claude/hooks/` and add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\YOUR_USERNAME\\.claude\\hooks\\stop-usage.ps1\""
          }
        ]
      }
    ]
  }
}
```

---

## Repository

[github.com/som3669/Claude-Code-Token-Meter](https://github.com/som3669/Claude-Code-Token-Meter)

---

## License

Proprietary — All rights reserved. See [LICENSE](LICENSE).
