# AI Git Pilot — User Manual

## Installation

1. Open VS Code
2. Press `Ctrl+Shift+P` → **Extensions: Install from VSIX**
3. Select `aigitpilot-0.0.2.vsix`
4. Reload VS Code when prompted

---

## First-Time Setup

Press `Ctrl+Shift+P` → type **AI Git Pilot: Setup** → Enter

You will be asked:
1. **Choose a provider** (Groq recommended for beginners)
2. **Paste your API key**
3. **Choose commit style** (conventional / short / detailed)

The extension automatically:
- Downloads `jq` if not installed
- Installs a global git hook (`~/.git-hooks/prepare-commit-msg`)
- Adds shell integration to `.bashrc` / `.zshrc`

---

## Getting API Keys (Free)

### Groq (fastest, 1000 req/day free)
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up → **API Keys** → **Create API Key**
3. Copy the key (starts with `gsk_...`)

### Google Gemini (1500 req/day free)
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in → **Get API Key** → **Create API key**
3. Copy the key (starts with `AIza...`)

### OpenRouter (free models available)
1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up → **Keys** → **Create Key**
3. Copy the key

### Ollama (fully local, unlimited, private)
1. Download from [ollama.com](https://ollama.com)
2. Open terminal: `ollama pull qwen2.5-coder:7b`
3. Select **Ollama** in setup — no key needed

---

## Adding / Changing API Key

**Method 1 — Setup wizard (easiest)**
`Ctrl+Shift+P` → **AI Git Pilot: Setup** → pick provider → paste key

**Method 2 — VS Code Settings**
`Ctrl+,` → search `aigitpilot` → fill in the field for your provider

| Field | Description |
|-------|-------------|
| `aigitpilot.provider` | Active provider: `groq` / `gemini` / `openrouter` / `ollama` |
| `aigitpilot.groqApiKey` | Your Groq key |
| `aigitpilot.geminiApiKey` | Your Gemini key |
| `aigitpilot.openrouterApiKey` | Your OpenRouter key |

---

## Using in VS Code

1. Make changes to your code
2. Open **Source Control** panel (`Ctrl+Shift+G`)
3. Click **✨** (sparkle) in the panel title bar
4. Extension auto-stages all changes and generates a message
5. An input box opens — edit the message if needed
6. Press **Enter** to commit, **Escape** to cancel

---

## Using in Terminal

Open a Git Bash terminal inside VS Code (`Ctrl+`` `).

**Flow after `git add`:**
```bash
$ git add .
# AI generates message, shows editable prompt:
som@PC MINGW64 ~/myproject (main)
$ git commit -m "feat(api): add pagination to user list"   ← edit here
```
Edit the message, press Enter to commit.

**Flow with `git commit` (no `-m`):**
```bash
$ git commit
# AI generates message, shows editable prompt
```

---

## Shell Shortcuts

These work in any Git Bash terminal after restarting it.

| Command | Does |
|---------|------|
| `add` | `git add .` then shows AI commit suggestion |
| `push` | `git push origin <current-branch>` |
| `pull` | `git pull origin <current-branch>` |
| `mas` | `git pull origin master` |
| `mn` | `git pull origin main` |
| `d` | `git pull origin develop` |
| `s` | `git status --short` |
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

> **Note:** Shortcuts activate after opening a new terminal (or running `source ~/.bashrc`).

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
Open a file inside a git repository, then click ✨ again.

**"No staged changes"**
Run `git add .` first (or let the ✨ button do it automatically).

**"Cannot reach groq / ollama"**
- Groq: check API key is correct in settings
- Ollama: make sure Ollama app is running (`ollama serve`)

**Shortcuts not working in terminal**
Open a **new** terminal — existing terminals need `source ~/.bashrc` to pick up the shell integration.

**AI returns empty response**
- Check API key is valid
- Check you have remaining quota (Groq: console.groq.com → Usage)
- Try switching provider via setup wizard

---

## Reinstalling the Hook Manually

`Ctrl+Shift+P` → **AI Git Pilot: Install Global Git Hook**

This re-installs the git hook, shell integration, and downloads jq if missing.

---

## Uninstalling

1. Remove the extension from VS Code Extensions panel
2. To remove shell integration: delete the source line from `~/.bashrc`:
   ```
   # AI Git Pilot
   [ -f "$HOME/.git-hooks/aigitpilot-shell.sh" ] && . "$HOME/.git-hooks/aigitpilot-shell.sh"
   ```
3. To remove global hook: `git config --global --unset core.hooksPath`
4. Optionally delete `~/.git-hooks/` folder

---

## Support

- Email: [somshrestha3669@gmail.com](mailto:somshrestha3669@gmail.com)
- License: MIT
