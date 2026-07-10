# TabLite — Smart Tab Memory Optimizer

A minimal Manifest V3 Chrome extension that automatically **suspends inactive tabs**
to free up RAM, with a popup dashboard that shows your estimated memory savings.

Suspended tabs are discarded via `chrome.tabs.discard`, which keeps the title,
favicon, and scroll position, so tabs reload cleanly the moment you click them.

## Features

- ⏱️ Auto-suspends tabs idle longer than a configurable threshold (default **10 min**), checked every minute.
- 🛡️ **Never suspends**: the active tab, pinned tabs, tabs playing audio, already-discarded tabs, browser-internal pages (`chrome://`, extension, devtools, new-tab), or tabs you whitelist.
- 🎚️ Popup dashboard: per-tab **Active / Suspended / Excluded** status, per-tab whitelist toggle, a "Suspend All Inactive Tabs Now" button, an idle-threshold slider, and a master on/off switch.
- 💾 Estimated memory-savings figure using `chrome.system.memory` plus a per-tab heuristic.
- 🌙 Clean UI with automatic dark-mode support.
- 🔒 Settings (threshold, whitelist, enabled) persist via `chrome.storage.local`.

## Load it for testing (Developer Mode)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this `tablite/` folder.
4. Pin TabLite from the extensions menu and click its icon to open the dashboard.

To test suspension quickly, set the slider to **1 minute**, open a few tabs,
switch away from them, and wait ~1–2 minutes — inactive tabs will show as
**Suspended**. Click one to restore it.

## File structure

```
tablite/
├── manifest.json     # MV3 manifest, permissions, action + icons
├── background.js     # service worker: tracking + sweep logic
├── popup.html        # dashboard markup
├── popup.css         # styling (light + dark)
├── popup.js          # dashboard logic
├── icons/            # 16 / 48 / 128 px placeholder icons
└── README.md
```

## Permissions

| Permission       | Why it's needed                                             |
| ---------------- | ----------------------------------------------------------- |
| `tabs`           | Read tab metadata and call `chrome.tabs.discard`.           |
| `storage`        | Persist settings and per-tab last-active timestamps.        |
| `alarms`         | Run the 1-minute background sweep reliably in MV3.          |
| `system.memory`  | Show available system memory in the savings estimate.       |

## Known limitations

- **Unsaved form input** cannot be detected from the service worker without the
  `scripting` permission (intentionally omitted from this MVP). To protect a tab
  with in-progress input, toggle it to **Excluded** in the popup. This is the
  documented best-effort gap noted in `background.js`.
- The memory-savings number is an **estimate** (`ESTIMATED_MB_PER_TAB` in
  `background.js`), since Chrome does not expose true per-tab RAM to extensions.

## Extending it later

The code is structured for growth — e.g. a stats/history page could subscribe to
sweep events, or `ESTIMATED_MB_PER_TAB` could be replaced with per-process data
from the `processes` API (Dev channel). Message passing between the popup and the
worker already goes through a single `onMessage` switch in `background.js`.
