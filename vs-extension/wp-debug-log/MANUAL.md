# WP Debug Log Viewer — User Manual

## What It Does

Displays your WordPress `debug.log` file inside VS Code — auto-updates as new errors arrive, color-codes by severity, and lets you filter and clear the log without leaving the editor.

---

## Installation

1. Press `Ctrl+Shift+P` → **Extensions: Install from VSIX**
2. Select `wp-debug-log-viewer-x.x.x.vsix`
3. Reload VS Code when prompted

---

## Opening the Viewer

**Option 1 — Command Palette**
`Ctrl+Shift+P` → **WP Debug Log: Open Viewer**

**Option 2 — Status Bar**
Click the bug icon in the bottom status bar (appears when a `debug.log` is detected)

---

## Requirements

Your `wp-config.php` must have debug logging enabled:

```php
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', false );
```

Log file location: `wp-content/debug.log`

---

## Features

### Auto-Refresh
Log view updates automatically as new entries are written — no manual refresh needed.

### Color Coding
| Color | Severity |
|-------|----------|
| Red | Fatal errors / PHP Fatal |
| Orange | Warnings |
| Yellow | Notices / Deprecated |
| White | Info / other |

### Filtering
Type in the filter box to show only matching lines (file name, function, error message).

### Clear Log
Click **Clear** to empty `debug.log` — useful before reproducing a specific bug.

---

## Troubleshooting

**Viewer shows "No log file found"**
- Check `wp-content/debug.log` exists
- Make sure `WP_DEBUG_LOG` is `true` in `wp-config.php`
- Open a file inside your WordPress project so the extension can detect the repo root

**Log not updating**
- Check file permissions on `debug.log` — PHP must be able to write to it
- Try closing and reopening the viewer

---

## Support

- Email: [somshrestha3669@gmail.com](mailto:somshrestha3669@gmail.com)
- License: MIT
