# Claude Code Token Meter — User Manual

## What It Does

Shows real-time Claude API token usage and cost in the VS Code status bar — tracks session usage, weekly totals, and estimated spend so you always know where you stand.

---

## Installation

1. Press `Ctrl+Shift+P` → **Extensions: Install from VSIX**
2. Select `claude-token-statusbar-x.x.x.vsix`
3. Reload VS Code when prompted

---

## Status Bar Display

After installing you will see two items in the status bar (bottom of VS Code):

| Item | Shows |
|------|-------|
| `⚡ Session: 12.3k` | Tokens used in the current session |
| `📅 Week: 87.4k` | Tokens used this calendar week |

Click either item to refresh the counts manually.

---

## How Tokens Are Counted

The extension reads Claude Code's local usage log files. No data is sent externally — everything is read from your machine.

Log location (auto-detected):
```
~/.config/claude/usage/
```

---

## Commands

`Ctrl+Shift+P` → **Claude Token Monitor: Refresh** — force-refresh both counters

---

## Cost Estimation

Approximate costs based on Claude Sonnet pricing:

| Tokens | Approx. cost |
|--------|-------------|
| 100k | ~$0.30 input / $1.50 output |
| 1M | ~$3.00 input / $15.00 output |

Actual cost depends on model and input/output ratio. Check [anthropic.com/pricing](https://www.anthropic.com/pricing) for current rates.

---

## Troubleshooting

**Status bar shows 0 or nothing**
- Make sure Claude Code is installed and has been used at least once
- Try `Ctrl+Shift+P` → **Claude Token Monitor: Refresh**
- Check that `~/.config/claude/` exists and contains usage data

**Counts seem wrong**
- Session counter resets when VS Code restarts
- Weekly counter resets every Monday

---

## Support

- Email: [somshrestha3669@gmail.com](mailto:somshrestha3669@gmail.com)
- License: MIT
