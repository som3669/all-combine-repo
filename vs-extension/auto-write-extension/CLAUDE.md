# Auto Write Loop

VS Code extension that types a code snippet into the active editor character by character, erases it, and repeats until stopped (demo / screen-activity tool).

- Id `somshrestha.auto-write`, version 0.1.1 (`auto-write-0.1.1.vsix` in folder). No LICENSE, README or CHANGELOG.
- No own repo: lives in the parent repo `som-personal` (remote `som3669/vs-code-extenstion-setup`); added 2026-07-10 (`feat: initial project setup`), last touched in commit `2026-08-25`.

## Stack / key files
- Plain JavaScript, single file `extension.js` (~180 lines), no build step, no runtime deps.
- `BUILT_IN_SNIPPETS` array (fibonacci, Stack class, fetch wrapper, ...) cycles when no custom snippet is set.
- Commands: `autoWrite.start`, `autoWrite.stop`, `autoWrite.setSnippet`.
- Settings `autoWrite.*`: `typeDelayMs` 40, `eraseDelayMs` 15, `pauseBetweenLoopsMs` 800, `snippet` (empty = built-ins).
- `activationEvents` is empty (activates on its commands).

## Commands
No `scripts` in `package.json` and no local vsce. Package with:
```
npx @vscode/vsce@2.32.0 package      # vsce 2.32.0 because newer needs Node 22+ (see ../CLAUDE.md)
code --install-extension auto-write-<ver>.vsix --force   # then reload window
```
vsce may warn about the missing `repository`/LICENSE fields.
