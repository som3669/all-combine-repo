# vs-extension

VS Code extensions by Som Shrestha (publisher `somshrestha`). Moved here from `C:\tmp\vs-extension` on 2026-09-24. This folder is inside the parent repo `C:\laragon\www\som-personal` (remote `som3669/vs-code-extenstion-setup`). Each project has its own CLAUDE.md.

## Projects
| Folder | What | Repo |
|---|---|---|
| `Claude-Code-Token-Meter/` | Claude Code session/weekly usage + tokens in the status bar (Marketplace: `somshrestha.claude-token-statusbar`) | own: som3669/Claude-Code-Token-Meter (gitlink in parent) |
| `claude-prompt-monitor/` | Tracks Claude Code prompts: progress, ETA, notifications, desktop widget (v0.1.2, GitHub releases) | own: som3669/claude-prompt-monitor |
| `claude-account-switcher/` | Swap between Claude Code accounts via saved credential profiles (v0.1.2) | own: som3669/claude-account-switcher |
| `claude-import-export-chats/` | Browse/search/export/import/back up Claude Code chats (0.2.0 uncommitted) | own: som3669/claude-import-export-chats |
| `aigitpilot/` | AI commit messages via Ollama/Groq/Gemini/OpenRouter + global git hook | parent repo |
| `wp-debug-log/` | WordPress `debug.log` viewer webview | parent repo |
| `bagchal-extension/` | Nepali Tiger & Goat board game + WebSocket server | parent repo |
| `auto-write-extension/` | Types/erases a snippet in a loop | parent repo |

Check with `git -C <dir> remote get-url origin`. The account-switcher and import-export-chats folders are also still tracked (older copies) in the parent repo.

## Shared constraints
- Machine Node is v20.12.2. Use `@vscode/vsce@2.32.0` (local installs already are 2.32.0); newer vsce needs Node 22+ and crashes with `TypeError [ERR_INVALID_ARG_VALUE]` from `styleText`.
- `.vsix`, `out/`, `node_modules/` are gitignored everywhere.
- Never bump a version without asking the user; releasing/publishing is a user decision.
- Marketplace publishing needs an Azure DevOps PAT for publisher `somshrestha` (only Token Meter is on the Marketplace, via its GitHub Actions workflow).

## VS Code extension testing gotchas (learned on claude-prompt-monitor, 2026-09)
- **A window runs the build it started with.** `code --install-extension ... --force` replaces files on disk but an open window keeps running the JS it loaded at startup, silently. Always tell the user to reload the window after installing. Check: extension host start time in `%APPDATA%\Code\logs\<stamp>\window*\exthost\exthost.log` vs the installed `out/*.js` mtime.
- **`detached: true` kills GUI child processes on Windows.** Node maps it to DETACHED_PROCESS; `powershell.exe` gets no console and exits 0 immediately. Spawn with `windowsHide: true`, `stdio: 'ignore'`, no `detached`; the child still outlives the parent.
- **Process-list checks that grep command lines count themselves.** `CommandLine -like '*overlay.ps1*'` matches the querying PowerShell (and `Stop-Process` then kills the checker). Exclude `$PID`; prefer verifying the real window (EnumWindows + GetWindowRect).
- **Escapes collapse through Python heredocs.** `\n` and `\\` broke regexes/strings/JSON when writing PS or JS that way. Use the Edit tool for anything with escapes, and parse-check (`[System.Management.Automation.Language.Parser]::ParseFile`, `json.load`) before building.
- Windows PowerShell 5.1: no `??`; `Set-Content -Encoding utf8` writes a BOM (use `[IO.File]::WriteAllText` with UTF8Encoding($false)); avoid non-ASCII in scripts.
