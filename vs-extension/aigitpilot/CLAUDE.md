# AI Git Pilot

VS Code extension that generates commit messages from the staged diff using free AI providers (Ollama local, Groq, Google Gemini, OpenRouter), plus an optional global git hook and shell shortcuts so it also works from any terminal.

- Id `somshrestha.aigitpilot`, MIT (LICENSE). Version 0.0.4 (vsix 0.0.1-0.0.4 and an older `gitpilot-0.0.1.vsix` in the folder).
- No own repo: lives in the parent repo `som-personal` (remote `som3669/vs-code-extenstion-setup`), added in commit `feat: initial project setup` (2026-07-10). `package.json` `repository` points to `github.com/som3669/aigitpilot`, which is not this folder's remote.

## Stack / key files
- TypeScript, single file `src/extension.ts` (~650 lines), no runtime deps; HTTP via Node.
- `README.md` (user docs), `MANUAL.md` (opened by `aigitpilot.openManual`).
- Commands: `aigitpilot.generate` (sparkle button in SCM title bar: `git add -A`, generate, edit in input box, commit), `aigitpilot.setup` (provider wizard), `aigitpilot.installHook`, `aigitpilot.openManual`.
- Settings `aigitpilot.*`: provider (default `ollama`), ollamaModel `qwen2.5-coder:7b`, ollamaUrl `http://localhost:11434`, groqApiKey/groqModel `llama-3.3-70b-versatile`, geminiApiKey (uses `gemini-1.5-flash`), openrouterApiKey, style, language, customInstructions, maxDiffSize 8000, excludeFiles.

## Global hook (what `installHook` changes on the user's machine)
- Writes `~/.git-hooks/prepare-commit-msg` (+ `.bat`), `aigitpilot-message.sh`, `aigitpilot-shell.sh`.
- Writes provider config (incl. API keys) to `~/.config/aigitpilot/config.json` for the hook.
- Runs `git config --global core.hooksPath ~/.git-hooks` (overrides per-repo hooks globally).
- Appends a source line to `~/.bashrc` and `~/.zshrc` for shortcuts (`add`, `push`, `pull`, `s`, `log`, `co`, `cb`, ...).
- Hook uses `curl` + `jq` (jq auto-downloaded if missing).

## Commands
```
npm install
npm run compile      # tsc -p ./
npm run package      # vsce package --no-dependencies --allow-star-activation (local vsce 2.32.0)
code --install-extension aigitpilot-<ver>.vsix --force   # then reload window
```

## Open items / notes
- No CHANGELOG and no git tags; version history only visible from the `.vsix` files.
- Release/marketplace status not recorded in any session notes.
