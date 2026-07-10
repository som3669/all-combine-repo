# WP Debug Log Viewer

Real-time WordPress `debug.log` viewer built into VS Code — color-coded by severity, filterable by type, searchable, with clickable file links that jump to the exact line.

## Features

- **Real-time updates** — watches `debug.log` for changes, refreshes instantly
- **Color-coded severity** — Fatal (red), Warning (orange), Notice (blue), Deprecated (purple), Info (gray)
- **Filter buttons with counts** — filter by Fatal, Warning, Notice, Deprecated, or Info; each button shows a live count badge
- **Search** — type to filter entries live; press `Ctrl+F` to focus the search box
- **Clickable file links** — click any path to open the file at the exact line in the editor
- **Copy All** — copy all log entries to clipboard in one click
- **Per-row copy** — hover any entry and click **Copy** to copy just that entry
- **Stack traces** — inline stack trace display per entry
- **Clear Log** — wipe `debug.log` from within the viewer
- **Auto-scroll** — toggle auto-scroll to bottom on new entries
- **Status bar badge** — shows error/warning count at a glance with color indicators
- **Auto-detect** — finds `wp-content/debug.log` automatically in your workspace
- **wp-config.php check** — prompts to enable `WP_DEBUG` and `WP_DEBUG_LOG` if not set
- **Move anywhere** — drag the panel to Primary Side Bar, Secondary Side Bar, or the bottom Panel

## Usage

1. Open a WordPress project in VS Code
2. Click the **bug icon** in the Activity Bar, or press `Ctrl+Shift+L` (`Cmd+Shift+L` on Mac)
3. The viewer loads your `wp-content/debug.log` automatically
4. Click any file path link to jump to that file and line

If no `debug.log` is found, a file picker opens so you can select one manually.

## Filters & Search

| Control | Action |
|---|---|
| **All** | Show all entries |
| **Fatal** | Show Fatal errors and Parse errors |
| **Warning** | Show PHP Warnings |
| **Notice** | Show PHP Notices |
| **Deprecated** | Show deprecation notices |
| **Info** | Show unclassified entries |
| **Search box** | Filter by any text (live); `Ctrl+F` to focus |

## Copying Entries

- **Copy All** — copies every visible log entry to clipboard
- **Row copy** — hover a row and click the **Copy** button on the right to copy that single entry

## Moving the Panel

Right-click the **WP DEBUG LOG** title bar → **Move To** → choose:

| Destination | Description |
|---|---|
| Primary Side Bar | Left sidebar (default) |
| Secondary Side Bar | Right sidebar |
| Panel | Bottom bar (same area as Terminal) |

## Status Bar

The `$(bug) WP Log` button in the status bar shows live counts:

| State | Indicator |
|---|---|
| No errors | `$(bug) WP Log` |
| Warnings present | `$(bug) WP Log ⚠ N` (yellow) |
| Fatal errors present | `$(bug) WP Log ✕ N` (red) |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `wpDebugLog.statusBarSide` | `left` | Move the status bar button to `left` or `right` side |

## Log Formats Supported

- `[date] PHP Fatal error: ... in file on line N`
- `[date] PHP Warning: ... in file on line N`
- `[date] PHP Notice: ... in file on line N`
- `[date] PHP Deprecated: ... in file on line N`
- `[date] PHP Parse error: ... in file on line N`
- `[date] PHP Strict Standards: ... in file on line N`
- `Uncaught Error: ... in file:N` (bare format, no timestamp)

## Requirements

- VS Code `1.80.0` or higher
- A WordPress project with `wp-content/debug.log` (or any `.log` file)

## License

Copyright © 2026 Som Shrestha. All rights reserved.  
Contact: somshrestha3669@gmail.com
