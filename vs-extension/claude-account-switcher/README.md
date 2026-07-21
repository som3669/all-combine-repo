# Claude Account Switcher

Switch between multiple **Claude Code** accounts in VS Code **without re-signing in**.

Claude Code stores its login in `~/.claude/.credentials.json` (access + refresh token) and
account identity in `~/.claude.json` (`oauthAccount`, `userID`). Signing into a second account
overwrites the first, forcing a re-login every time you switch back.

This extension snapshots each logged-in account as a named **profile** and swaps those files on
demand, so switching is one click and no browser sign-in.

## Usage

1. Sign into account A in Claude Code as normal.
2. Run **Claude Account: Capture Current As Profile** (or just activate — the current account is
   auto-captured on first run).
3. Sign into account B, then capture it too.
4. Click the account name in the status bar (or run **Claude Account: Switch**) → pick a profile.
   VS Code reloads and Claude Code comes up on the chosen account.

Commands:

| Command | What it does |
|---------|--------------|
| `Claude Account: Switch` | Pick a profile and switch (auto reloads window) |
| `Claude Account: Capture Current As Profile` | Save the currently signed-in account |
| `Claude Account: Manage Profiles` | Delete a saved profile |

## How switching stays valid

Claude Code **rotates** the refresh token when it refreshes. Before switching away from an
account, the extension re-snapshots the live credentials into that account's profile, so its
tokens stay current. A switch only fails if the target account's refresh token has fully
expired — then Claude Code prompts a normal sign-in for that account.

## Where profiles live

`~/.claude/account-switcher/<label>.json` — one file per account, containing that account's
credentials and identity. **Treat these as secrets** (they hold live refresh tokens). They never
leave your machine.

## Notes

- Windows / macOS / Linux — uses plain files under the home directory.
- Close in-flight Claude Code sessions before switching; the auto window-reload applies the new
  credentials to newly started sessions.
