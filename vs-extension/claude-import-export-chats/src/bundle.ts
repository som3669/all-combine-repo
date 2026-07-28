import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChatStore } from './store';
import { sessionToMarkdown, optsFromConfig } from './render';
import {
  BUNDLE_FORMAT,
  BUNDLE_EXT,
  BundledSession,
  ChatBundle,
  Session,
} from './model';

/** Build a portable bundle from the given sessions. */
export function buildBundle(store: ChatStore, sessions: Session[]): ChatBundle {
  const bundled: BundledSession[] = sessions.map((s) => ({
    sessionId: s.sessionId,
    projectDir: s.projectDir,
    cwd: s.cwd,
    title: s.title,
    updatedAt: s.updatedAt,
    jsonl: store.readLines(s.file),
    meta: s.meta,
  }));
  return {
    format: BUNDLE_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceMachine: os.hostname(),
    sessions: bundled,
  };
}

function slug(s: string): string {
  return (
    s
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'chat'
  );
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Write a bundle and/or Markdown files to disk under `destDir`.
 * Returns the primary path written (for reveal).
 */
export function writeExport(
  store: ChatStore,
  sessions: Session[],
  destDir: string,
  format: 'bundle' | 'markdown' | 'both',
  baseName: string
): string {
  fs.mkdirSync(destDir, { recursive: true });
  let primary = destDir;

  if (format === 'bundle' || format === 'both') {
    const bundle = buildBundle(store, sessions);
    const file = path.join(destDir, `${baseName}${BUNDLE_EXT}`);
    fs.writeFileSync(file, JSON.stringify(bundle, null, 2), 'utf8');
    primary = file;
  }

  if (format === 'markdown' || format === 'both') {
    const opts = optsFromConfig();
    const mdDir =
      format === 'both' ? path.join(destDir, `${baseName}-markdown`) : destDir;
    fs.mkdirSync(mdDir, { recursive: true });
    const used = new Set<string>();
    for (const s of sessions) {
      let name = `${slug(s.title)}-${s.sessionId.slice(0, 8)}`;
      while (used.has(name)) name += '_';
      used.add(name);
      const md = sessionToMarkdown(store, s, opts);
      fs.writeFileSync(path.join(mdDir, `${name}.md`), md, 'utf8');
    }
    if (format === 'markdown') primary = mdDir;
  }
  return primary;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  overwritten: number;
}

/** Import a bundle into the Claude projects folder. */
export function importBundle(
  store: ChatStore,
  bundle: ChatBundle,
  overwrite: boolean
): ImportResult {
  const res: ImportResult = { imported: 0, skipped: 0, overwritten: 0 };
  const projectsDir = store.projectsDir;

  for (const s of bundle.sessions) {
    if (!s.sessionId || !s.projectDir || !Array.isArray(s.jsonl)) continue;
    // Guard against path traversal from an untrusted bundle.
    const safeDir = path.basename(s.projectDir);
    const safeId = path.basename(s.sessionId);
    const dir = path.join(projectsDir, safeDir);
    const file = path.join(dir, `${safeId}.jsonl`);
    const already = fs.existsSync(file);
    if (already && !overwrite) {
      res.skipped++;
    } else {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, s.jsonl.join('\n') + '\n', 'utf8');
      if (already) res.overwritten++;
      else res.imported++;
    }
    if (s.meta) store.meta.merge(safeId, s.meta);
  }
  return res;
}

export function parseBundle(raw: string): ChatBundle {
  const parsed = JSON.parse(raw);
  if (parsed?.format !== BUNDLE_FORMAT || !Array.isArray(parsed.sessions)) {
    throw new Error('Not a Claude Chats bundle file.');
  }
  return parsed as ChatBundle;
}

export function defaultBackupDir(store: ChatStore): string {
  const configured = vscode.workspace
    .getConfiguration('claudeChats')
    .get<string>('backupDir');
  if (configured && configured.trim()) return configured.trim();
  return path.join(store.claudeHome, 'backups', 'chat-exports');
}

export function backupBaseName(): string {
  return `claude-chats-backup-${timestamp()}`;
}

export { slug, timestamp };
