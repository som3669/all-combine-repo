# WP Debug Log Viewer

VS Code extension: real-time WordPress `debug.log` viewer with severity colors (Fatal/Warning/Notice/Deprecated/Info), filter buttons with counts, search, clickable `file:line` links, stack traces, copy/clear, and a status-bar error badge.

- Id `somshrestha.wp-debug-log-viewer`. Version 0.0.5 (vsix 0.0.1-0.0.5 in folder). LICENSE is proprietary ("All rights reserved", Som Shrestha, somshrestha3669@gmail.com).
- No own repo: lives in the parent repo `som-personal` (remote `som3669/vs-code-extenstion-setup`), commit `feat: initial project setup` (2026-07-10). `package.json` `repository` points to `github.com/som3669/wp-debug-log-viewer`, which is not this folder's remote.

## Stack / key files
- TypeScript, single file `src/extension.ts` (~550 lines) with inline webview HTML/JS; no runtime deps.
- `bug-icon.svg` activity-bar icon; `icon.png` extension icon; `README.md`; `MANUAL.md` (opened by `wpDebugLog.openManual`).
- Commands: `wpDebugLog.open` (`Ctrl+Shift+L` / `Cmd+Shift+L`, also editor title button when `debug.log` is open), `wpDebugLog.popOut` (webview view -> separate panel; Pop In returns it), `wpDebugLog.openManual`.
- Webview view `wpDebugLog.view` in container `wpDebugLogContainer`; can be dragged to either sidebar or the bottom panel.
- Setting: `wpDebugLog.statusBarSide` (`left`|`right`).
- Auto-detects `wp-content/debug.log`; falls back to a file picker. Checks `wp-config.php` and offers to add `WP_DEBUG`, `WP_DEBUG_LOG` true, `WP_DEBUG_DISPLAY` false.
- Parses `[date] PHP Fatal error|Warning|Notice|Deprecated|Parse error|Strict Standards: ... in file on line N` and bare `Uncaught Error: ... in file:N`.

## Commands
```
npm install
npm run compile      # tsc -p ./
npm run package      # vsce package --no-dependencies --allow-star-activation (local vsce 2.32.0)
code --install-extension wp-debug-log-viewer-<ver>.vsix --force   # then reload window
```

## Open items / notes
- No CHANGELOG and no git tags; release/marketplace status not recorded in session notes.
