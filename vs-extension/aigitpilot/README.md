# AI Git Pilot

AI-powered commit message generator for VS Code. Works with **free** AI models — no paid API required.

## Features

- **One click** — click ✨ in the Source Control panel and the message lands in that repository's commit box, ready to edit
- **Nothing staged? Still works** — the message then covers all uncommitted changes, new files included
- **Uses what you typed** — a note already in the commit box is passed to the AI as the intent of the change
- **Matches your repo** — the last 10 commit subjects are sent along, so scopes, ticket references and wording fit in
- **Terminal integration** — `git add` or `git commit` in bash or zsh offers the AI message, editable before it commits
- **Works in other git clients** — a global `prepare-commit-msg` hook fills the editor when git opens it for a new commit
- **Keeps your repositories' own hooks running** — pre-commit linters, commitlint and Git LFS still run under the global hook
- **100% free** — Ollama (local/private), Groq, Gemini, OpenRouter
- **Keys stay private** — API keys live in VS Code's secret storage, not in `settings.json`
- **Retired models handled** — when a cloud provider drops your model, AI Git Pilot switches to one it still offers and tells you
- **Git shortcuts** — short commands like `add`, `push`, `pull`, `s`, `log`, `co` and more (see table below)
- **Conventional Commits** style by default (also short or detailed)
- **Smart diff handling** — leaves lock files out, and cuts huge diffs so every file still gets a share

## Quick Start

1. Install the extension
2. Open Command Palette → **AI Git Pilot: Setup / Change Provider**
3. Pick a provider, paste a free API key (or use Ollama for fully local generation), pick a model. The wizard sends a tiny test request so a bad key shows up right away
4. Click **✨** in the Source Control panel — or just `git add .` in a terminal

## How It Works

### VS Code Button (✨)

1. Reads the staged changes of the repository whose ✨ you clicked (from the Command Palette: the repository of the open file, else the selected one, else it asks). If nothing is staged it reads all uncommitted changes instead
2. Sends the diff to your provider and writes the message into the commit box
3. Edit it if you like, then commit as usual. If nothing was staged, VS Code offers to stage everything when you commit

A notification shows progress and has a **Cancel** button. Click ✨ again for a different message.

### Terminal

After `git add` (or `git commit` without `-m`) in an interactive bash or zsh:

```
$ git add .
$ git commit -m feat(auth): add JWT refresh token support   ← editable
```

The message is pre-filled. Edit it and press Enter to commit; clear the line or press Ctrl+C to cancel. Multi-line messages are shown in full with **[Y]es / [e]dit / [n]o** (`e` opens your editor).

### Other git clients

The global `prepare-commit-msg` hook runs when git opens the editor for a new commit (plain `git commit`, many GUI clients). It puts the AI message above git's comment lines. It stays out of the way for `-m`, `-F`, `--amend`, merges, squashes and templates. Set `AIGITPILOT_SKIP=1` to turn it off for one command.

## AI Providers

| Provider | Free Tier | Privacy | Speed |
|----------|-----------|---------|-------|
| **Ollama** _(recommended)_ | Unlimited | 100% local | Fast |
| Groq | Free, daily limits | Cloud | Very fast |
| Google Gemini | Free, daily limits | Cloud | Fast |
| OpenRouter | Free models | Cloud | Varies |

The setup wizard lists the models each provider offers right now (for Ollama, the ones you have pulled).

### Ollama Setup

1. Download from [ollama.com](https://ollama.com)
2. Run: `ollama pull qwen2.5-coder:7b` (or pick a model in setup and click **Pull Model**)
3. Select **Ollama** in AI Git Pilot setup

### Groq Setup

1. Get a free key at [console.groq.com/keys](https://console.groq.com/keys)
2. Select **Groq** in setup → paste key

### Gemini Setup

1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Select **Gemini** in setup → paste key

### OpenRouter Setup

1. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Select **OpenRouter** in setup → paste key. `openrouter/free` routes to a free model that is up

## What is sent

To the provider you chose: the diff (lock files and other `excludeFiles` left out), the list of changed files, the branch name, your last 10 commit subjects (turn off with `aigitpilot.matchRepoStyle`) and any note you typed in the commit box. Nothing else leaves your machine, and nothing at all with Ollama.

## Shell Shortcuts

Installed with the global hook, for interactive bash and zsh only. Scripts and tools that source your rc file keep the real commands, and your own aliases of the same name win. Turn them off with `aigitpilot.shellShortcuts`.

| Shortcut | Expands to |
|----------|------------|
| `add` | `git add .` (then shows AI commit suggestion); `add <files>` adds just those |
| `push` | `git push origin <current-branch>` |
| `pull` | `git pull origin <current-branch>` |
| `s` / `status` | `git status --short` |
| `log` | `git log --oneline --graph --decorate -15` |
| `co <branch>` | `git checkout <branch>` |
| `cb <name>` | `git checkout -b <name>` |
| `br` | `git branch` |
| `fetch` | `git fetch` |
| `stash` | `git stash` |
| `pop` | `git stash pop` |
| `diff` | `git diff` |
| `staged` | `git diff --cached` |
| `undo` | `git reset --soft HEAD~1` |
| `amend` | `git commit --amend --no-edit` |
| `merge <branch>` | `git merge <branch>` |
| `rebase <branch>` | `git rebase <branch>` |
| `abort` | `git merge --abort` |
| `tag <name>` | `git tag <name>` |
| `clone <url>` | `git clone <url>` |
| `mas` | `git pull origin master` |
| `mn` | `git pull origin main` |
| `d` | `git pull origin develop` |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `aigitpilot.provider` | `ollama` | AI provider |
| `aigitpilot.ollamaModel` | `qwen2.5-coder:7b` | Ollama model |
| `aigitpilot.ollamaUrl` | `http://localhost:11434` | Ollama server URL |
| `aigitpilot.groqModel` | `openai/gpt-oss-20b` | Groq model |
| `aigitpilot.geminiModel` | `gemini-flash-latest` | Gemini model (the alias always points to the newest Flash) |
| `aigitpilot.openrouterModel` | `openrouter/free` | OpenRouter model |
| `aigitpilot.style` | `conventional` | `conventional` / `short` / `detailed` |
| `aigitpilot.language` | `english` | Language for commit messages |
| `aigitpilot.customInstructions` | — | Extra prompt instructions |
| `aigitpilot.maxDiffSize` | `8000` | Max diff characters sent to AI |
| `aigitpilot.excludeFiles` | lock files, minified files | Glob patterns whose diff is not sent (a pattern without `/` matches in any folder) |
| `aigitpilot.matchRepoStyle` | `true` | Send the last 10 commit subjects so messages match the repo |
| `aigitpilot.globalHook` | `true` | Keep the global hook and terminal integration installed and up to date |
| `aigitpilot.terminalSuggestOnAdd` | `true` | Offer a message right after `git add` (off: only on `git commit`) |
| `aigitpilot.shellShortcuts` | `true` | Define the terminal shortcuts |
| `aigitpilot.groqApiKey` / `geminiApiKey` / `openrouterApiKey` | — | Plain-text fallback only; keys set here move to secret storage automatically |

## Commands

- **AI Git Pilot: Generate Commit Message** — write a message into the commit box
- **AI Git Pilot: Setup / Change Provider** — provider, key, model and style, with a test request at the end
- **AI Git Pilot: Install Global Git Hook** — hook for all terminals and git clients
- **AI Git Pilot: Uninstall Global Git Hook** — removes the hook, the shortcuts and the rc line, and restores git's `core.hooksPath`
- **AI Git Pilot: Open Manual**

## Global hook: what it changes

The hook is installed on startup while `aigitpilot.globalHook` is on:

- Writes its scripts to `~/.git-hooks/`, plus small stubs that run each repository's own `.git/hooks`, which a global hooks path would otherwise skip
- Writes the provider settings (including API keys, since the scripts need them) to `~/.config/aigitpilot/config.json`
- Sets `git config --global core.hooksPath ~/.git-hooks`. If it already points somewhere else, AI Git Pilot asks first
- Adds one line to `~/.bashrc` / `~/.zshrc` that loads the shell integration

**AI Git Pilot: Uninstall Global Git Hook** undoes all of it.

## Requirements

- Git
- `curl` (pre-installed on most systems)
- `jq` for the terminal hook — **auto-downloaded** on Windows; on macOS/Linux install it with `brew install jq` or `sudo apt install jq`
- bash or zsh for the terminal integration

## License

MIT — [somshrestha3669@gmail.com](mailto:somshrestha3669@gmail.com)
