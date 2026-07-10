# AI Git Pilot

AI-powered commit message generator for VS Code. Works with **free** AI models — no paid API required.

## Features

- **One click** — click ✨ in Source Control panel to auto-stage everything and generate a commit message you can edit before committing
- **Terminal integration** — `git add .` or `git commit` in any terminal shows the AI message pre-filled, editable at the prompt
- **100% free** — Ollama (local/private), Groq (1000 req/day), Gemini (1500 req/day), OpenRouter
- **Git shortcuts** — short commands like `add`, `push`, `pull`, `s`, `log`, `co` and more (see table below)
- **Conventional Commits** style by default (also short or detailed)
- **Smart diff handling** — strips lock files, truncates huge diffs automatically
- **Auto-installs** — downloads jq, sets global hook, sources shell integration into `.bashrc`/`.zshrc` automatically

## Quick Start

1. Install the extension
2. Open Command Palette → **AI Git Pilot: Setup / Change Provider**
3. Enter your API key (or use Ollama for fully local generation)
4. Click **✨** in the Source Control panel — or just `git add .` in terminal

## How It Works

### VS Code Button (✨)

1. Extension auto-stages all changes (`git add -A`)
2. Sends diff to AI → generates commit message
3. Opens an input box pre-filled with the message — edit if needed, press Enter to commit

### Terminal

After running `git add .` or `git commit` (without `-m`):

```
som@Som MINGW64 ~/projects/myapp (main)
$ git add .
som@Som MINGW64 ~/projects/myapp (main)
$ git commit -m "feat(auth): add JWT refresh token support"   ← editable
```

The prompt is pre-filled with the AI message. Edit it, then press Enter to commit — or Escape to cancel.

## AI Providers

| Provider | Free Tier | Privacy | Speed |
|----------|-----------|---------|-------|
| **Ollama** _(recommended)_ | Unlimited | 100% local | Fast |
| Groq | 1,000 req/day | Cloud | Very fast |
| Google Gemini | 1,500 req/day | Cloud | Fast |
| OpenRouter | Free models | Cloud | Varies |

### Ollama Setup

1. Download from [ollama.com](https://ollama.com)
2. Run: `ollama pull qwen2.5-coder:7b`
3. Select **Ollama** in AI Git Pilot setup

### Groq Setup

1. Get free key at [console.groq.com](https://console.groq.com)
2. Select **Groq** in setup → paste key

### Gemini Setup

1. Get free key at [aistudio.google.com](https://aistudio.google.com)
2. Select **Gemini** in setup → paste key

## Shell Shortcuts

All shortcuts are installed automatically with the global hook.

| Shortcut | Expands to |
|----------|------------|
| `add` | `git add .` (then shows AI commit suggestion) |
| `push` | `git push origin <current-branch>` |
| `pull` | `git pull origin <current-branch>` |
| `s` | `git status --short` |
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
| `aigitpilot.groqApiKey` | — | Groq API key |
| `aigitpilot.groqModel` | `llama-3.3-70b-versatile` | Groq model |
| `aigitpilot.geminiApiKey` | — | Gemini API key |
| `aigitpilot.openrouterApiKey` | — | OpenRouter API key |
| `aigitpilot.style` | `conventional` | `conventional` / `short` / `detailed` |
| `aigitpilot.language` | `english` | Language for commit messages |
| `aigitpilot.customInstructions` | — | Extra prompt instructions |
| `aigitpilot.maxDiffSize` | `8000` | Max diff chars sent to AI |
| `aigitpilot.excludeFiles` | lock files | Files excluded from diff |

## Commands

- **AI Git Pilot: Generate Commit Message** — stage all + generate + review in input box
- **AI Git Pilot: Setup / Change Provider** — interactive setup wizard
- **AI Git Pilot: Install Global Git Hook** — hook for all terminals and git clients

## Requirements

- Git
- `curl` (pre-installed on most systems)
- `jq` — **auto-downloaded** by the extension if not found

## License

MIT — [somshrestha3669@gmail.com](mailto:somshrestha3669@gmail.com)
