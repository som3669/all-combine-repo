# Claude Account Switcher

Switch between multiple **Claude Code** accounts in VS Code **without signing in again**.

Claude Code keeps one login at a time: the tokens in `~/.claude/.credentials.json` and the account
identity in `~/.claude.json` (`oauthAccount`, `userID`). Signing in to a second account replaces the
first, so switching back normally means signing in again.

This extension saves each signed-in account as a named **profile** and swaps those files on demand.
Switching is one click, with no browser sign-in.

## Usage

1. Sign in to your first account in Claude Code as normal. The switcher saves it as a profile the
   first time it starts (or run **Claude Account: Capture Current As Profile**).
2. To add another account, run `/login` in Claude Code and sign in as that account, then run
   **Claude Account: Capture Current As Profile**.
   - Use `/login`, **not `/logout`**. Logging out ends the current account's login, which also
     makes its saved profile useless.
   - The browser sign-in authorizes whichever claude.ai account the browser is signed in to. Check
     it first, or use a private window.
3. Click the account name in the status bar (or run **Claude Account: Switch**) and pick a profile.
   VS Code reloads and Claude Code comes up on the chosen account.

| Command | What it does |
|---------|--------------|
| `Claude Account: Switch` | Pick a profile and switch (reloads the window) |
| `Claude Account: Capture Current As Profile` | Save the currently signed-in account |
| `Claude Account: Manage Profiles` | Delete a saved profile |

## Terminal switcher (no VS Code needed)

`scripts/claude-switch.js` does the same swap from the command line, for Claude Code in a terminal:

```
node claude-switch.js                    # interactive picker
node claude-switch.js <name|email>       # switch directly
node claude-switch.js --list             # profiles + current account
node claude-switch.js --capture [name]   # save the current account as a profile
```

After switching, restart every running Claude Code session so it picks up the new account.

## How saved logins stay valid

Claude Code replaces its refresh token every time it renews a login, and the old one stops working.
A saved copy is only useful if it is kept current, so the switcher:

- saves each renewed login into the profile of the account Claude Code says is signed in
  (`~/.claude.json`): whenever `~/.claude/.credentials.json` changes, when VS Code starts, just
  before switching away from an account, and when VS Code closes;
- never saves an empty or half-written login (for example while Claude Code is signed out or
  mid-login), and keeps the previous version of each profile as `<label>.json.bak`;
- switches only while holding Claude Code's own login-renewal lock. If Claude Code is renewing a
  login at that moment, the switch waits for it to finish and saves the renewed login. (Saving the
  login it was replacing would leave that account with a login Anthropic has already retired.);
- remembers when Claude Code fails to renew a saved login because Anthropic has ended it. The
  profile is marked **needs sign-in**, so the next switch tells you instead of quietly showing the
  login screen again. The mark clears as soon as you sign in to that account;
- marks profiles that can no longer sign in (a warning icon in the picker, `[NEEDS SIGN-IN]` or
  `[BROKEN: …]` in `--list`) and asks before switching to one.

A Claude Code session still running as the account you switched away from can write that
account's renewed login after the switch, so close or restart other Claude Code sessions,
especially ones in terminals, when you switch.

## When you will still be asked to sign in

| Cause | How to avoid it |
|---|---|
| You ran `/logout` for that account | Add and change accounts with `/login` and the switcher |
| Another Claude Code window or terminal kept running as the old account after a switch | Close other Claude Code sessions before switching |
| The account was not used on this computer for about 30 days | Switch to each account at least once a month |
| Profile files or `.credentials.json` were copied to another computer | Sign in separately on each computer; separate sign-ins don't affect each other |
| The login was ended on Anthropic's side (for example "Log out of all devices" on claude.ai) | Avoid this for accounts you keep in the switcher |

In each case, sign in once and the switcher keeps that account's profile current again.

**Signing in asks you to sign in to claude.ai again, even though you are signed in there.** To
connect Claude Code, claude.ai requires a *recent* sign-in, so it may show the Authorize page
briefly and then its sign-in page. Sign in there with the same account, then click **Authorize**.
To go straight to Authorize, sign out of claude.ai and back in just before you start the sign-in.

## Privacy

Profiles live in `~/.claude/account-switcher/<label>.json`, one file per account, holding that
account's tokens and identity. **Treat them as secrets.** Don't commit or share them.

The switcher makes no network requests. It only reads and writes files in your home directory;
Claude Code itself does all signing in and renewing.

## Requirements and notes

- Windows and Linux, where Claude Code keeps its login in `~/.claude/.credentials.json`. On macOS
  Claude Code normally keeps the login in the Keychain, which this extension does not read.
- If you use VS Code profiles, install the extension in the profile your windows actually use. For a
  `.vsix`: `code --install-extension <file>.vsix --profile "<profile name>"`.
- Remove the old 0.1.0 build (`somshrestha.claude-account-switcher`) if you have it. It takes over
  the same commands without these protections; the switcher offers to uninstall it.
