# Claude Import Export Chats

VS Code extension to browse, search, export, import, back up and organize Claude Code conversations (`~/.claude/projects` transcripts) across computers, and continue an imported chat with `claude --resume`.

- Id `somshrestha.somshrestha-claude-import-export-chats`, MIT. Own repo: https://github.com/som3669/claude-import-export-chats
- Git state (2026-09-24): only one commit, `feat: Claude Import Export Chats v0.0.1` (2026-07-28), pushed. Versions 0.1.0-0.2.0 exist only as uncommitted changes (`CHANGELOG.md`, `README.md`, `package.json`, `src/extension.ts` modified; `src/resume.ts` untracked). `package.json` is at 0.2.0 and `somshrestha-claude-import-export-chats-0.2.0.vsix` is built. Nothing released/tagged. Ask before committing or bumping.
- The parent repo (som-personal / vs-code-extenstion-setup) also still tracks an older copy of this folder; this folder's own repo is the source of truth.

## Stack / key files
TypeScript, no runtime deps. Activity-bar view `claudeChats` / `claudeChatsExplorer`, commands prefixed `claudeChats.*`.
- `src/extension.ts` entry, command registration
- `src/store.ts` transcript discovery; `src/model.ts` shared types; `src/tree.ts` tree view
- `src/bundle.ts` `.claudechats.json` export/import bundles; `src/render.ts` Markdown rendering
- `src/search.ts` full-text/regex search; `src/metadata.ts` favorites/tags/notes/titles sidecar (travels with exports)
- `src/resume.ts` continue-in-Claude-Code (0.2.0)
- `media/sidebar.svg` view icon; `media/icon.html` icon source (excluded from package)
- Settings: `claudeHome` (auto, honors `CLAUDE_CONFIG_DIR`), `claudeCommand`, `exportFormat` (bundle|markdown|both), `includeThinking`, `includeToolCalls`, `backupDir`, `downloadDir`

## Commands
```
npm install
npm run compile      # tsc; also runs via vscode:prepublish
npm run package      # vsce package (devDep ^2.24.0; local node_modules has 2.32.0)
code --install-extension somshrestha-claude-import-export-chats-<ver>.vsix --force   # then reload window
```

## History / decisions (from CHANGELOG)
- 0.1.0 initial: grouped list, Markdown preview, search, export/import/backup/restore, metadata sidecar.
- 0.1.1 inline download icon on rows.
- 0.1.2 / 0.1.3 Windows file dialogs failed with "Location is not available" when the remembered folder was on a disconnected drive. Dialogs now default to workspace/home, and downloads save straight to `<Claude home>/downloads` (or `downloadDir`) with a "Change folder..." prompt.
- 0.2.0 Continue Conversation: `claude --resume` only sees transcripts under the project dir encoded from the cwd, so imported chats (source-machine paths) were unreachable. It now asks for a folder, copies the transcript into that folder's project dir with recorded paths rewritten (original untouched), then runs `claude --resume <session-id>` in a terminal.
- Exported bundles contain full conversation text; treat as private.

## Open items
- Commit/tag/release 0.1.x-0.2.0 work (pending user decision).
- `downloadDir` setting is not in the README settings table.
