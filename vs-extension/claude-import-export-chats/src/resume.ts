import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ChatStore } from './store';
import { Session, TranscriptEvent } from './model';

/**
 * Claude Code's encoding of a working directory into a folder name under
 * `~/.claude/projects` — every non-alphanumeric character becomes '-'.
 * e.g. `C:\Users\som` -> `C--Users-som`.
 */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

export interface RelocateResult {
  /** Session id to pass to `claude --resume`. */
  sessionId: string;
  /** Absolute path of the transcript Claude will resume from. */
  file: string;
  /** True when a copy was written into another project folder. */
  relocated: boolean;
}

/**
 * Make `session` resumable from `targetCwd`.
 *
 * A transcript is only visible to `claude --resume` when it lives in the
 * project folder encoded from the current working directory, and the events
 * inside it point at that same directory. Imported conversations carry the
 * source machine's paths, so they need a rewritten copy before they can be
 * continued here.
 *
 * Returns the id/file to resume. When the session already lives in the right
 * place, nothing is written.
 */
export function prepareResume(
  store: ChatStore,
  session: Session,
  targetCwd: string,
  opts: { newId: boolean } = { newId: false }
): RelocateResult {
  const targetDir = encodeProjectDir(targetCwd);
  const inPlace =
    !opts.newId &&
    targetDir === session.projectDir &&
    samePath(session.cwd, targetCwd);
  if (inPlace) {
    return { sessionId: session.sessionId, file: session.file, relocated: false };
  }

  const sessionId = opts.newId ? crypto.randomUUID() : session.sessionId;
  const dir = path.join(store.projectsDir, targetDir);
  const file = path.join(dir, `${sessionId}.jsonl`);
  const lines = store.readLines(session.file).map((line) => {
    let ev: TranscriptEvent;
    try {
      ev = JSON.parse(line);
    } catch {
      return line; // keep unparsable lines verbatim
    }
    if (!ev || typeof ev !== 'object') return line;
    if (typeof ev.cwd === 'string') ev.cwd = targetCwd;
    if (typeof ev.sessionId === 'string') ev.sessionId = sessionId;
    return JSON.stringify(ev);
  });

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  // Carry favorites/tags/title over to the copy.
  if (sessionId !== session.sessionId) store.meta.merge(sessionId, session.meta);
  return { sessionId, file, relocated: true };
}

/** True when the transcript for `sessionId` already exists under `cwd`. */
export function transcriptExistsFor(
  store: ChatStore,
  cwd: string,
  sessionId: string
): boolean {
  return fs.existsSync(
    path.join(store.projectsDir, encodeProjectDir(cwd), `${sessionId}.jsonl`)
  );
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string) =>
    path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
  try {
    return norm(a) === norm(b);
  } catch {
    return a === b;
  }
}
