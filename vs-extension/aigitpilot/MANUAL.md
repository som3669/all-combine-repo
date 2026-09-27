# AI Git Pilot — User Manual

## Installation

1. Open VS Code
2. Press `Ctrl+Shift+P` → **Extensions: Install from VSIX**
3. Select the `aigitpilot-<version>.vsix` file
4. Reload VS Code when prompted

---

## First-Time Setup

Press `Ctrl+Shift+P` → type **AI Git Pilot: Setup** → Enter

You will be asked to:
1. **Choose a provider** (Groq is the quickest start; Ollama is fully local)
2. **Keep, paste or get an API key** (not for Ollama). "Get a free key" opens the provider's key page, then asks for the key
3. **Choose a model** from the provider's current list. For Ollama, models you have pulled are listed first
4. **Choose a commit style** (conventional / short / detailed)

Setup then sends a tiny test request and tells you how fast the provider answered, so a wrong key or model shows up now instead of at your first commit.

The extension also, on startup:
- Downloads `jq` on Windows if it is missing
- Installs a global git hook in `~/.git-hooks/`
- Adds shell integration to `.bashrc` / `.zshrc`

---

## Getting API Keys (Free)

### Groq (fastest)
1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Sign up → **Create API Key**
3. Copy the key (starts with `gsk_...`)

### Google Gemini
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in → **Create API key**
3. Copy the key (starts with `AIza...`)

### OpenRouter (free models available)
1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Sign up → **Create Key**
3. Copy the key

### Ollama (fully local, unlimited, private)
1. Download from [ollama.com](https://ollama.com)
2. Open terminal: `ollama pull qwen2.5-coder:7b`
3. Select **Ollama** in setup — no key needed

---

## Adding / Changing API Key

**Setup wizard (recommended)**
`Ctrl+Shift+P` → **AI Git Pilot: Setup** → pick provider → **Paste a key**

Keys are kept in VS Code's secret storage (your OS keychain), not in `settings.json`, so Settings Sync never uploads them. The terminal hook needs the key too, so it is also written to `~/.config/aigitpilot/config.json` while the global hook is installed.

**VS Code Settings (fallback)**
A key typed into `aigitpilot.groqApiKey`, `aigitpilot.geminiApiKey` or `aigitpilot.openrouterApiKey` still works: AI Git Pilot moves it into secret storage and clears the setting.

| Field | Description |
|-------|-------------|
| `aigitpilot.provider` | Active provider: `groq` / `gemini` / `openrouter` / `ollama` |
| `aigitpilot.groqModel`, `geminiModel`, `openrouterModel`, `ollamaModel` | Model for each provider |

---

## Using in VS Code

1. Make changes to your code (stage them if you want the message to cover only part)
2. Open **Source Control** panel (`Ctrl+Shift+G`)
3. Click **✨** (sparkle) in the panel title bar of the repository you want
4. The message appears in that repository's commit box. Edit it if needed
5. Commit as usual (`Ctrl+Enter`)

Tips:
- Type a short note in the commit box first ("fixes the login race") and ✨ turns it into a proper message
- If nothing is staged, the message covers all changes; VS Code offers to stage them when you commit
- Click ✨ again for another message; **Cancel** in the notification stops a slow request

---

## Using in Terminal

Open a bash or zsh terminal (Git Bash on Windows) — a new one after installing.

**Flow after `git add`:**
```bash
$ git add .
$ git commit -m feat(api): add pagination to user list   ← edit here
```
Edit the message and press Enter to commit. Clear the line or press Ctrl+C to cancel.

**Flow with `git commit` (no `-m`):** the same prompt appears. Extra flags such as `-s`, `-S` or `--no-verify` are kept; other flags go straight to git.

**Multi-line messages** (detailed style) are shown in full with `Commit with this message? [Y]es / [e]dit / [n]o`. `e` opens your editor with the message filled in.

Turn off the offer after `git add` with `aigitpilot.terminalSuggestOnAdd`; `git commit` still offers one.

---

## Shell Shortcuts

These work in interactive bash and zsh after opening a new terminal. Your own aliases of the same name take priority, and scripts keep the real commands.

| Command | Does |
|---------|------|
| `add` | `git add .` then shows AI commit suggestion (`add <files>` adds just those) |
| `push` | `git push origin <current-branch>` |
| `pull` | `git pull origin <current-branch>` |
| `mas` | `git pull origin master` |
| `mn` | `git pull origin main` |
| `d` | `git pull origin develop` |
| `s` / `status` | `git status --short` |
| `log` | `git log --oneline --graph --decorate -15` |
| `co <branch>` | `git checkout <branch>` |
| `cb <name>` | `git checkout -b <name>` (new branch) |
| `br` | `git branch` (list branches) |
| `fetch` | `git fetch` |
| `stash` | `git stash` |
| `pop` | `git stash pop` |
| `diff` | `git diff` |
| `staged` | `git diff --cached` (show staged changes) |
| `undo` | `git reset --soft HEAD~1` (undo last commit, keep changes) |
| `amend` | `git commit --amend --no-edit` |
| `merge <branch>` | `git merge <branch>` |
| `rebase <branch>` | `git rebase <branch>` |
| `abort` | `git merge --abort` |
| `tag <name>` | `git tag <name>` |
| `clone <url>` | `git clone <url>` |

> **Note:** Shortcuts activate after opening a new terminal (or running `source ~/.bashrc`). Turn them off with `aigitpilot.shellShortcuts`.

---

## Commit Styles

| Style | Example output |
|-------|---------------|
| `conventional` | `feat(auth): add JWT refresh token support` |
| `short` | `Add JWT refresh token support` |
| `detailed` | Summary line + blank line + body explaining WHY |

Change via `Ctrl+,` → search `aigitpilot.style`

---

## Troubleshooting

**"No git repository found"**
Open a folder or file inside a git repository, then click ✨ again.

**"No changes to describe"**
The working tree is clean; there is nothing to commit.

**"Cannot reach Ollama"**
Start the Ollama app or run `ollama serve`. Check `aigitpilot.ollamaUrl`.

**"Ollama does not have the model"**
Click **Pull Model** (runs `ollama pull <model>` in a terminal) or **Choose Model**.

**"… no longer offers …, so AI Git Pilot switched to …"**
The cloud provider retired your model. The message was still written with the replacement, which is now saved. Click **Choose Model** to pick another.

**"rejected the API key" / answered 401**
Click **Set API Key** and paste a new key.

**Rate limit reached (429)**
Wait a bit, or switch provider in setup.

**Shortcuts not working in terminal**
Open a **new** terminal — existing terminals need `source ~/.bashrc` to pick up the shell integration.

**Terminal offers no message**
Check that `jq` and `curl` are installed, and that `~/.config/aigitpilot/config.json` exists (run **AI Git Pilot: Install Global Git Hook**).

**A repository's own hooks stopped running**
Run **AI Git Pilot: Install Global Git Hook** again: it adds stubs that run each repository's `.git/hooks`.

---

## Reinstalling the Hook Manually

`Ctrl+Shift+P` → **AI Git Pilot: Install Global Git Hook**

This re-installs the git hook, shell integration, and downloads jq if missing. If git's `core.hooksPath` already points to another folder, you are asked before it changes.

---

## Uninstalling

1. `Ctrl+Shift+P` → **AI Git Pilot: Uninstall Global Git Hook**. This deletes AI Git Pilot's files in `~/.git-hooks/` and `~/.config/aigitpilot/`, removes its line from `~/.bashrc` / `~/.zshrc`, and restores `core.hooksPath` to what it was before (or unsets it)
2. Remove the extension from the VS Code Extensions panel

Open terminals keep the shortcuts until you close them.

---

## Support

- Email: [somshrestha3669@gmail.com](mailto:somshrestha3669@gmail.com)
- License: MIT
