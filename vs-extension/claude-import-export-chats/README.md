# Claude Import Export Chats

Export, import, back up, search, and organize your **Claude Code** conversations — and move them between computers.

Claude Code stores every conversation as a transcript under your Claude home folder
(`~/.claude/projects/<project>/<session>.jsonl`). This extension reads those transcripts
and gives you a sidebar to browse them, plus one-click export/import so your history
follows you across machines.

## Features

- **Browse** — a *Claude Chats* view in the Activity Bar lists every conversation, grouped by project, with titles, timestamps, and message counts.
- **Open as Markdown** — render any conversation to clean, readable Markdown (optionally including thinking blocks and tool calls).
- **Search** — full-text search across every conversation; supports regex (`/pattern/`). Jump straight to the matching chat.
- **Export** — export a single conversation, a whole project, or everything, as:
  - a portable `.claudechats.json` **bundle** (lossless, re-importable), or
  - **Markdown** files, or both.
- **Import** — pull a bundle from another computer back into Claude Code. Import *new only* or *overwrite existing*.
- **Backup & Restore** — one-click `Back Up All Now` to a timestamped bundle, and restore from a list of previous backups.
- **Continue** — resume any conversation in Claude Code, including one imported from another computer, with `claude --resume` in a terminal.
- **Organize** — mark **favorites**, add **tags**, write a **note**, or give a conversation a **custom title**. Organizer data travels with your exports.

## Usage

Open the **Claude Chats** icon in the Activity Bar. Your conversations load automatically.

| Action | Where |
|--------|-------|
| Search all chats | View toolbar → 🔍, or `Claude Chats: Search Conversations` |
| Export everything | View toolbar → ⬇, or `Claude Chats: Export All Conversations` |
| Import a bundle | View toolbar → ⬆, or `Claude Chats: Import from Backup` |
| Back up / restore | View `⋯` menu |
| Continue a conversation | Conversation row → ▶, or right-click → *Continue Conversation in Claude Code* |
| Open / favorite / tag / rename | Right-click a conversation |

### Moving history between computers

1. On computer A: **Export All Conversations** (or **Back Up All Now**) → copy the `.claudechats.json` file.
2. On computer B: **Import from Backup** → pick the file → *Import new only* or *overwrite existing*.

Restart any running Claude Code session after importing so it picks up the new transcripts.

### Continuing an imported conversation

Claude Code's `--resume` only lists transcripts stored under the project folder
encoded from the *current working directory*. An imported conversation carries the
paths of the machine it came from, so Claude Code on this machine cannot see it.

**Continue Conversation in Claude Code** handles that:

1. You pick the folder to continue in — the original folder (if it exists here),
   an open workspace folder, or any folder you browse to.
2. If that folder differs from the recorded one, the transcript is copied into the
   matching project directory and every recorded path inside it is rewritten to the
   new folder. The original transcript is left untouched.
3. A terminal opens in that folder and runs `claude --resume <session-id>`.

Requires the `claude` CLI on your `PATH` — otherwise set `claudeChats.claudeCommand`
to its full path.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeChats.claudeHome` | *(auto)* | Path to the Claude home folder. Auto-detects `~/.claude` and honors `CLAUDE_CONFIG_DIR`. |
| `claudeChats.claudeCommand` | `claude` | Command used to launch Claude Code when continuing a conversation. |
| `claudeChats.exportFormat` | `bundle` | `bundle`, `markdown`, or `both`. |
| `claudeChats.includeThinking` | `false` | Include assistant thinking blocks in Markdown. |
| `claudeChats.includeToolCalls` | `true` | Include tool calls / results in Markdown. |
| `claudeChats.backupDir` | *(auto)* | Folder for `Back Up All Now`. Defaults to `<Claude home>/backups/chat-exports`. |

## Privacy

Everything runs locally. The extension only reads files under your Claude home folder and
writes exports/backups where you tell it to. Nothing is uploaded anywhere. Bundles contain
your full conversation text — treat exported files as private.

## License

MIT
