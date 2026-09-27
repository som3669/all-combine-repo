# Changelog

## 0.0.3

### Fixed
- Groq: the default model `llama-3.3-70b-versatile` is no longer offered, so every generation failed. The default is now `openai/gpt-oss-20b`.
- Gemini: `gemini-1.5-flash` was shut down. The model is now a setting (`aigitpilot.geminiModel`, default `gemini-flash-latest`) and the key goes in a header instead of the URL.
- OpenRouter: the hard-coded free model was gone. The model is now a setting (`aigitpilot.openrouterModel`, default `openrouter/free`), and the terminal hook supports OpenRouter too.
- Multi-root workspaces: ✨ now writes into the repository whose button you clicked, not always the first one.
- Provider errors (bad key, rate limit, missing model) are shown as such, instead of "AI returned an empty response". Requests time out after 2 minutes and can be cancelled.
- Non-English replies no longer get garbled characters when a response arrives in several chunks.
- Terminal: AI messages containing backticks, `$` or quotes were run through `eval`; now they are passed to git as plain text.
- Terminal: `git commit -a`, `git commit <paths>` and similar kept only `-m`, dropping the other arguments. Such commands now go straight to git.
- Terminal: the git wrapper and shortcuts were defined in non-interactive shells too, so scripts and tools that source `~/.bashrc` got the AI prompt on `git add` and `git diff` instead of `diff`. They now load only in interactive shells.
- Terminal: zsh had no `read -e -i`; it now uses `vared`. The prompt no longer prints a fake `MINGW64` line on macOS/Linux.
- Hook: `git commit --amend` (and the `amend` shortcut) replaced the existing message with an AI one. The hook now only fills the editor for new commits.
- Hook: the global `core.hooksPath` silently disabled every repository's own `.git/hooks` (pre-commit linters, commitlint, Git LFS). Stubs now run them.
- Hook: installing no longer overwrites an existing, different `core.hooksPath` without asking, and does not re-set it after you unset it.
- The "Global hook installed" message no longer pops up on every window start.
- A failed jq download no longer leaves a broken `jq.exe` behind.

### Changed
- API keys are kept in VS Code's secret storage. Keys found in `settings.json` are moved there automatically.
- Nothing staged: the message now covers all uncommitted changes, untracked files included, instead of asking you to stage first.
- Text already in the commit box is passed to the AI as the intent of the change.
- The last 10 commit subjects are sent so messages match the repository's scopes and wording (`aigitpilot.matchRepoStyle`).
- Large diffs are cut per file, so every file is represented, instead of keeping only the start of the diff.
- `excludeFiles` are real glob patterns (git pathspecs); excluded files are still listed by name.
- The terminal hook sends the actual diff (not just file names) and uses the same prompt as VS Code, including custom instructions and the detailed style.
- Replies are cleaned of reasoning blocks, code fences, preambles and wrapping quotes.
- Setup lists the models each provider offers right now, offers to open the key page, and sends a test request at the end.
- A retired cloud model is replaced by one the provider still offers, and you are told which.
- The shell scripts ship as plain files in `hooks/` instead of a base64 blob.

### Added
- **AI Git Pilot: Uninstall Global Git Hook** command.
- Settings `aigitpilot.globalHook`, `aigitpilot.terminalSuggestOnAdd` and `aigitpilot.shellShortcuts`.
- `npm test`: unit tests plus end-to-end runs of the hook scripts against a mock Ollama.

## 0.0.2 and earlier

No changelog was kept. 0.0.1 and 0.0.2 are on the Marketplace; the local `aigitpilot-0.0.3-july-build.vsix` and `aigitpilot-0.0.4.vsix` were July builds that were never published.
