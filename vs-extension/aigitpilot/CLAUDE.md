# AI Git Pilot

VS Code extension that generates commit messages from the staged diff using free AI providers (Ollama local, Groq, Google Gemini, OpenRouter), plus an optional global git hook and shell shortcuts so it also works from any terminal.

- Id `somshrestha.aigitpilot`, MIT (LICENSE). Version 0.0.3 (set 2026-09-27; see `CHANGELOG.md`). Marketplace has 0.0.1 and 0.0.2. The folder also has `aigitpilot-0.0.3-july-build.vsix` and `aigitpilot-0.0.4.vsix`: July builds that were never published (the version went back to 0.0.3 for the first release after 0.0.2), plus an older `gitpilot-0.0.1.vsix`.
- No own repo: lives in the parent repo `som-personal` (remote `som3669/vs-code-extenstion-setup`), added in commit `feat: initial project setup` (2026-07-10). `package.json` `repository` points to `github.com/som3669/aigitpilot`, which is not this folder's remote.
- Som's `Som` profile had 0.0.2 installed plus the old `somshrestha.gitpilot` 0.0.1 (a second ✨ button; it does not auto-install hooks) as of 2026-09-27.

## Stack / key files
- TypeScript, no runtime deps; HTTP via Node. Modules without `vscode` imports are unit-testable:
  - `src/extension.ts`: commands, setup wizard, repository choice, hook install/uninstall, settings listener.
  - `src/config.ts`: settings and API keys (secret storage; plain-text settings are migrated there).
  - `src/providers.ts`: `complete()` / `listModels()` for the four providers, `ProviderError` kinds.
  - `src/diff.ts`: staged (or, if nothing staged, all) changes, exclude pathspecs, per-file diff budget.
  - `src/prompt.ts`: system/user prompt and `cleanMessage()`.
  - `src/hook.ts`: writes `hooks/*` into `~/.git-hooks`, config.json, rc lines, core.hooksPath, jq download.
- `hooks/`: the shell scripts, copied verbatim (LF enforced by `.gitattributes`; installer also strips CR).
  `aigitpilot-message.sh` builds the same user prompt as `src/prompt.ts`: change both together.
- `README.md` (user docs), `MANUAL.md` (opened by `aigitpilot.openManual`), `CHANGELOG.md`.
- Commands: `generate` (✨ in SCM title bar; writes the message into that repo's commit box), `setup`, `installHook`, `uninstallHook`, `openManual`.

## Global hook (what it changes on the user's machine)
- Installed on every startup while `aigitpilot.globalHook` is true (default); files are only rewritten when content changed, and the notice shows once.
- Writes `~/.git-hooks/prepare-commit-msg`, `aigitpilot-message.sh`, `aigitpilot-shell.sh` and passthrough stubs (pre-commit, commit-msg, pre-push, post-checkout, …) that run the repo's own `.git/hooks`. Files without the `aigitpilot:managed` marker are never overwritten.
- Writes provider config (incl. API keys) to `~/.config/aigitpilot/config.json` (0600) and `shell.env`.
- Sets `git config --global core.hooksPath ~/.git-hooks` only if unset (asks if it points elsewhere; remembers the old value for uninstall; does not re-set it after the user unsets it).
- Appends a source line to existing `~/.bashrc` / `~/.zshrc`.
- Hook uses `curl` + `jq` (jq auto-downloaded to `~/.git-hooks/jq.exe` on Windows).

## Commands
```
npm install
npm test             # tsc + node --test test/ (29 tests; hook tests need sh, curl, awk, jq)
npm run package      # vsce package --no-dependencies --allow-star-activation (local vsce 2.32.0)
code --install-extension aigitpilot-<ver>.vsix --profile Som --force   # then reload window
```

## Lessons
- Provider model ids go stale fast. As of 2026-09-27: Groq no longer serves `llama-3.3-70b-versatile` to Som's key (its docs still list it; current: `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `allam-2-7b`); Gemini 1.5/2.0 are shut down (use the `gemini-flash-latest` alias); OpenRouter free ids rotate (`openrouter/free` routes to one). Check with the live `listModels()` rather than docs. `replacementModel()` switches automatically on a "model not found" error.
- The shell file is sourced by tools too: Claude Code's Bash tool (non-interactive, flags `hmtBc`) had `git`/`diff` as AI Git Pilot functions until the interactive guard was added. Everything in `aigitpilot-shell.sh` must check `_aigitpilot_on` / `_aigitpilot_tty`.
- Git Bash rewrites arguments that look like POSIX paths before native exes see them, so the hook never passes free text to `jq.exe` as an argument; the body is built inside jq from `--slurpfile cfg`.
- Tests that spawn processes talking to an in-process mock server must use async `spawn` (`runAsync`), not `spawnSync`, or the server cannot answer.
- `hook.ts` reads `os.homedir()` at load: tests set `HOME`, `USERPROFILE` and `GIT_CONFIG_GLOBAL` to a temp dir before requiring it.

## Open items / notes
- No git tags. 0.0.3 is built but not yet published to the Marketplace (needs the `somshrestha` Azure DevOps PAT).
- Release/marketplace status not recorded in any session notes.
- Not tested by automation: the interactive terminal prompt (needs a tty) and zsh (not installed on this machine).
