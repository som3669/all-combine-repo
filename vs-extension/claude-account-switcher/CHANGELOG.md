# Changelog

## 0.1.6

- **Fixed:** switching while Claude Code was renewing a login lost that account's login. The
  switch saved the refresh token Anthropic was about to retire, and the renewed one never reached
  the profile, so switching back later showed the sign-in screen. The switcher (extension and
  terminal script) now holds Claude Code's own renewal locks (`~/.claude/.oauth_refresh.lock` and
  `~/.claude.lock`) while it saves and swaps. If a renewal is in progress, it waits for it to
  finish, up to 20 seconds, then saves the renewed login. A lock untouched for 60 seconds is treated
  as abandoned, the same rule Claude Code uses.

## 0.1.5

- **New:** when Claude Code fails to renew a restored login (Anthropic has ended it), the profile
  is marked **needs sign-in**. Switching to it says so up front instead of silently landing on the
  login screen every time, and the mark clears as soon as that account signs in again.
- **Removed:** the account-ownership check added in 0.1.3. It sent the login's access token to
  Anthropic's API from the extension, and Anthropic's terms don't allow third-party tools to use
  Claude.ai credentials. The switcher now makes no network requests; renewed logins are filed
  under the account `~/.claude.json` names, as before 0.1.3. Every save is now synchronous, so the
  snapshot on window close always runs.
- **Fixed:** a credentials file with no Claude login in it (only MCP entries) counted as valid and
  could be saved over a good profile. It now counts as signed out.
- **README:** explains claude.ai's "sign in again" step before Authorize.

## 0.1.4

No code changes; documentation and packaging only.

- **README:** now explains how saved logins stay valid, what still causes a sign-in prompt and how
  to avoid it, and why to add accounts with `/login` (not `/logout`).
- **README:** now discloses the one network request, which checks a login's owner with Anthropic's
  API (added in 0.1.3). It also corrects platform support: Windows and Linux. On macOS, Claude Code
  keeps the login in the Keychain.
- **Packaging:** internal development notes (`CLAUDE.md`) are no longer included in the extension.

## 0.1.3

- **Fixed:** the login screen still appeared after switching. Two more causes:
  - A Claude Code session left running as the previous account (another window, a
    terminal) refreshes its token after the switch. That revokes the copy saved in the
    profile, and its write to `.credentials.json` was then filed under the *new* account,
    corrupting both profiles. Each token is now checked once against Anthropic's OAuth
    profile endpoint, and the result is cached. Tokens that belong to another account are
    filed under that account, and a warning offers to re-apply the intended one.
  - Rotations made while VS Code was closed stayed out of the profile. The active account
    is now re-snapshotted on startup, and a switch applies the target as re-read from disk.
- **New:** warns about and offers to uninstall the old 0.1.0 build
  (`somshrestha.claude-account-switcher`). Installed alongside, it took over the switch
  commands and silently ran the old, ungated logic.

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
