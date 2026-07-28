// Shared types for the Claude Import Export Chats extension.

/** A single parsed line from a Claude Code transcript (.jsonl). */
export interface TranscriptEvent {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  aiTitle?: string;
  message?: {
    role?: string;
    content?: unknown; // string | ContentBlock[]
  };
  [k: string]: unknown;
}

/** User-managed metadata stored alongside the transcripts (organizer sidecar). */
export interface SessionMeta {
  favorite?: boolean;
  tags?: string[];
  customTitle?: string;
  note?: string;
}

/** A conversation (one .jsonl transcript file). */
export interface Session {
  sessionId: string;
  projectDir: string; // encoded folder name under projects/
  cwd: string; // decoded working directory the chat ran in
  file: string; // absolute path to the .jsonl file
  title: string; // resolved display title
  aiTitle?: string;
  firstPrompt?: string;
  messageCount: number;
  createdAt?: number; // epoch ms
  updatedAt: number; // epoch ms (file mtime)
  sizeBytes: number;
  gitBranch?: string;
  meta: SessionMeta;
}

/** A project groups sessions that ran in the same working directory. */
export interface Project {
  projectDir: string;
  cwd: string;
  label: string;
  sessions: Session[];
}

/** Portable export/backup bundle. */
export interface ChatBundle {
  format: 'claude-import-export-chats';
  version: 1;
  exportedAt: string;
  sourceMachine: string;
  sessions: BundledSession[];
}

export interface BundledSession {
  sessionId: string;
  projectDir: string;
  cwd: string;
  title: string;
  updatedAt: number;
  jsonl: string[]; // raw transcript lines, lossless
  meta: SessionMeta;
}

export const BUNDLE_FORMAT = 'claude-import-export-chats';
export const BUNDLE_EXT = '.claudechats.json';
