# Changelog

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
