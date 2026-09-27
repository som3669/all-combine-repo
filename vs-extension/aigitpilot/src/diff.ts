// Reads what is about to be committed. No VS Code imports, so tests can load it directly.
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface Changes {
  source: 'staged' | 'all';
  /** `git diff --name-status` lines plus a short stat. Lists every file, excluded ones too. */
  files: string;
  diff: string;
  truncated: boolean;
}

export function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile('git', ['-c', 'core.quotePath=false', ...args],
      { cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) { reject(new Error((stderr || err.message).trim())); return; }
        resolve(stdout);
      });
  });
}

/** `excludeFiles` globs as git pathspecs. A pattern without a slash matches in any folder. */
export function excludePathspecs(patterns: string[]): string[] {
  return patterns
    .filter(p => typeof p === 'string' && p.trim())
    .map(p => `:(exclude,glob)${p.includes('/') ? p : `**/${p}`}`);
}

function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (ch === '*') { re += '[^/]*'; }
    else if (ch === '?') { re += '[^/]'; }
    else { re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&'); }
  }
  return new RegExp(`^${re}$`);
}

/** Same matching as `excludePathspecs`, for untracked files that git diff never sees. */
export function isExcluded(file: string, patterns: string[]): boolean {
  return patterns.some(p => typeof p === 'string' && p.trim()
    && globToRegExp(p.includes('/') ? p : `**/${p}`).test(file));
}

/**
 * Cuts a diff down to `max` characters without dropping files: small files stay whole and
 * the big ones share what is left, each cut at a line end.
 */
export function fitDiff(diff: string, max: number): { diff: string; truncated: boolean } {
  if (diff.length <= max) { return { diff, truncated: false }; }
  const chunks = diff.split(/(?=^diff --git )/m);
  const budget = new Array<number>(chunks.length).fill(0);
  const bySize = chunks.map((_, i) => i).sort((a, b) => chunks[a].length - chunks[b].length);
  let left = max;
  bySize.forEach((i, k) => {
    budget[i] = Math.min(chunks[i].length, Math.floor(left / (bySize.length - k)));
    left -= budget[i];
  });
  const out = chunks.map((chunk, i) => {
    if (chunk.length <= budget[i]) { return chunk; }
    const header = chunk.slice(0, chunk.indexOf('\n') + 1) || chunk;
    const cut = chunk.lastIndexOf('\n', budget[i] - 1);
    const kept = cut + 1 > header.length ? chunk.slice(0, cut + 1) : header;
    return `${kept}[... ${chunk.length - kept.length} more characters of this file left out]\n`;
  });
  return { diff: out.join(''), truncated: true };
}

const MAX_UNTRACKED_FILES = 50;
const MAX_UNTRACKED_BYTES = 256 * 1024;

/** Untracked files as new-file diffs, skipping excluded, binary and very large files. */
function untrackedDiff(root: string, files: string[], excludes: string[]): string {
  let out = '';
  for (const file of files.slice(0, MAX_UNTRACKED_FILES)) {
    if (isExcluded(file, excludes)) { continue; }
    let body = '';
    try {
      const full = path.join(root, file);
      const size = fs.statSync(full).size;
      if (size > MAX_UNTRACKED_BYTES) {
        body = `(large file, ${size} bytes, not shown)\n`;
      } else {
        const buf = fs.readFileSync(full);
        body = buf.subarray(0, 8000).includes(0)
          ? 'Binary file\n'
          : buf.toString('utf8').split('\n').map(line => `+${line}`).join('\n') + '\n';
      }
    } catch { continue; }
    out += `diff --git a/${file} b/${file}\nnew file (untracked)\n--- /dev/null\n+++ b/${file}\n${body}`;
  }
  return out;
}

/**
 * The staged changes, or when nothing is staged, every uncommitted change including
 * untracked files (what VS Code commits when you let it stage everything).
 */
export async function collectChanges(root: string, excludes: string[], maxSize: number): Promise<Changes | undefined> {
  const specs = excludePathspecs(excludes);
  const diffArgs = ['--no-color', '--no-ext-diff', '-M'];

  const staged = (await git(['diff', '--cached', '--name-status', '-M'], root)).trim();
  if (staged) {
    const stat = (await git(['diff', '--cached', '--shortstat'], root).catch(() => '')).trim();
    const diff = await git(['diff', '--cached', ...diffArgs, '--', ...specs], root);
    return { source: 'staged', files: [staged, stat].filter(Boolean).join('\n'), ...fitDiff(diff, maxSize) };
  }

  const hasHead = await git(['rev-parse', '--verify', '-q', 'HEAD'], root).then(() => true, () => false);
  const tracked = hasHead ? (await git(['diff', 'HEAD', '--name-status', '-M'], root)).trim() : '';
  const untracked = (await git(['ls-files', '--others', '--exclude-standard', '-z'], root))
    .split('\0').filter(Boolean);
  if (!tracked && !untracked.length) { return undefined; }

  const stat = hasHead ? (await git(['diff', 'HEAD', '--shortstat'], root).catch(() => '')).trim() : '';
  let diff = hasHead ? await git(['diff', 'HEAD', ...diffArgs, '--', ...specs], root) : '';
  diff += untrackedDiff(root, untracked, excludes);
  const files = [tracked, ...untracked.map(f => `A\t${f} (untracked)`), stat].filter(Boolean).join('\n');
  return { source: 'all', files, ...fitDiff(diff, maxSize) };
}

export async function repoContext(root: string, withRecent: boolean): Promise<{ branch?: string; recentSubjects: string[] }> {
  const branch = (await git(['symbolic-ref', '--short', '-q', 'HEAD'], root).catch(() => '')).trim();
  const recent = withRecent
    ? await git(['log', '-n', '10', '--no-merges', '--pretty=format:%s'], root).catch(() => '')
    : '';
  return { branch: branch || undefined, recentSubjects: recent.split('\n').map(s => s.trim()).filter(Boolean) };
}
