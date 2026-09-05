# Changelog

## 0.1.2

- **Fixed:** switching back to an account showed the login screen. A profile stored the
  refresh token from the moment it was captured, but Claude Code rotates that token on
  every refresh, so the stored copy was dead by the time it was restored. The active
  profile is now re-snapshotted whenever `~/.claude/.credentials.json` changes (debounced),
  and again on shutdown, so it always holds a live token.
- **Fixed:** a profile could be overwritten with empty tokens. Capturing or snapshotting
  while Claude Code was signed out or mid-login wrote `accessToken: ""` / `refreshToken: ""`
  over a good profile, permanently destroying it. Every save is now gated on a credential
  check, and each save keeps a `.bak` of the previous version.
- **New:** profiles with unusable credentials are flagged (warning icon in the picker,
  `[BROKEN: reason]` in `claude-switch.js --list`), and switching to one asks for
  confirmation instead of silently landing on the login screen (`--force` in the CLI).
- Reads of `.credentials.json` retry, so a read landing mid-write no longer looks like a
  signed-out account.
- Credential and profile files are written with mode `0600`; a failed write no longer
  leaves a `.tmp-*` file behind.
- Added a **Claude Account Switcher** output channel logging every snapshot and skip.

## 0.1.1

- **New:** terminal switcher — `scripts/claude-switch.js` swaps accounts from the
  command line with the same logic as the extension (`--list`, `--capture`, direct
  switch by name/email, interactive picker).
- Uses Node's JSON parser, which tolerates the case-differing duplicate keys that can
  appear in `~/.claude.json` (PowerShell's `ConvertFrom-Json` rejects these).
- New account-switcher icon (two profiles + swap arrows) replacing the placeholder.
- Renamed marketplace `name` to `somshrestha-claude-account-switcher`; display name is
  now **Claude Code Account Switcher**.
- Added MIT LICENSE.

## 0.1.0

- Initial release: capture, switch, and manage Claude Code account profiles from the
  VS Code status bar and command palette.
