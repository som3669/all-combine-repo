# Changelog

## 0.2.0

- **Continue a conversation in Claude Code.** New `Continue Conversation in
  Claude Code` action (inline ▶ icon and right-click menu on any conversation)
  launches `claude --resume` in a terminal.
- Imported conversations can now be continued. `claude --resume` only sees
  transcripts stored under the project folder encoded from the current working
  directory, so an imported chat — which carries the source machine's paths —
  was unreachable. Continuing one now asks which folder to work in, writes a
  copy of the transcript into that folder's project directory with its recorded
  paths rewritten, then resumes it.
- The import notification offers **Continue a conversation** so you can pick up
  an imported chat right away.
- New `claudeChats.claudeCommand` setting for when the `claude` CLI is not on
  your `PATH`.

## 0.1.3

- Downloads now save straight to a known-good folder (`<Claude home>/downloads`
  or `claudeChats.downloadDir`) instead of opening a native folder browser, which
  on Windows could fail with "Location is not available" when the remembered
  folder was on a disconnected drive. A `Change folder…` prompt lets you pick and
  remember a different destination.

## 0.1.2

- Fixed file dialogs opening at a stale/unavailable location (e.g. a Downloads
  folder on a disconnected drive). Dialogs now default to the workspace or home
  folder. Affects download/export, import, restore, and set-home.

## 0.1.1

- Added a one-click **download** (export) icon inline on each conversation and
  project row in the sidebar.

## 0.1.0

Initial release.

- Activity Bar view listing Claude Code conversations grouped by project.
- Open any conversation as rendered Markdown (read-only preview).
- Full-text search across all conversations, with regex support.
- Export a conversation, a project, or all conversations as a portable
  `.claudechats.json` bundle and/or Markdown files.
- Import bundles from another computer (import new only or overwrite existing).
- One-click backup to a timestamped bundle, and restore from previous backups.
- Organize conversations: favorites, tags, notes, and custom titles, stored in a
  sidecar that travels with exports.
