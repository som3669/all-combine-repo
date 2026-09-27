// Global git hook and terminal integration files. No VS Code imports, so tests can load it
// directly. The scripts themselves live in hooks/ and are copied as they are.
import * as cp from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';

export const HOOKS_DIR = path.join(os.homedir(), '.git-hooks');
export const CONFIG_DIR = path.join(os.homedir(), '.config', 'aigitpilot');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SHELL_ENV_FILE = path.join(CONFIG_DIR, 'shell.env');
const JQ_BUNDLED = path.join(HOOKS_DIR, 'jq.exe');
const JQ_URL = 'https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-windows-amd64.exe';

const MARKER = 'aigitpilot:managed';
const SCRIPTS = ['aigitpilot-message.sh', 'aigitpilot-shell.sh', 'prepare-commit-msg'];

/** Client-side hooks a repository may rely on; each gets a stub that runs the repo's own. */
const PASSTHROUGH_HOOKS = [
  'applypatch-msg', 'pre-applypatch', 'post-applypatch', 'pre-commit', 'pre-merge-commit',
  'commit-msg', 'post-commit', 'pre-rebase', 'post-checkout', 'post-merge', 'pre-push',
  'post-rewrite', 'pre-auto-gc',
];

const RC_LINE = '[ -f "$HOME/.git-hooks/aigitpilot-shell.sh" ] && . "$HOME/.git-hooks/aigitpilot-shell.sh"';

export interface ShellOptions { suggestOnAdd: boolean; shortcuts: boolean }

function readText(file: string): string | undefined {
  try { return fs.readFileSync(file, 'utf8'); } catch { return undefined; }
}

/** Writes only when the content differs, so re-running the installer is cheap and quiet. */
function writeIfChanged(file: string, content: string, mode: number): boolean {
  if (readText(file) === content) { return false; }
  fs.writeFileSync(file, content, { mode });
  try { fs.chmodSync(file, mode); } catch { /* not supported on this file system */ }
  return true;
}

/** True for files this extension wrote, including those from versions before the marker. */
function isOurs(file: string, name: string): boolean {
  const text = readText(file);
  if (text === undefined) { return false; }
  if (text.includes(MARKER)) { return true; }
  if (name.startsWith('aigitpilot-')) { return true; }
  if (name === 'prepare-commit-msg') { return text.includes('AI Git Pilot'); }
  if (name === 'prepare-commit-msg.bat') { return text.includes('%~dp0prepare-commit-msg'); }
  return false;
}

export function isInstalled(): boolean {
  return isOurs(path.join(HOOKS_DIR, 'aigitpilot-message.sh'), 'aigitpilot-message.sh');
}

export interface InstallResult {
  changed: string[];
  /** Hook files that exist but were not written by us, so they were left alone. */
  skipped: string[];
}

export function installHookFiles(assetDir: string): InstallResult {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  const asset = (name: string) => fs.readFileSync(path.join(assetDir, name), 'utf8').replace(/\r\n/g, '\n');
  const passthrough = asset('passthrough');
  const files: [string, string][] = [
    ...SCRIPTS.map((name): [string, string] => [name, asset(name)]),
    ...PASSTHROUGH_HOOKS.map((name): [string, string] => [name, passthrough]),
  ];
  const result: InstallResult = { changed: [], skipped: [] };
  for (const [name, content] of files) {
    const target = path.join(HOOKS_DIR, name);
    if (fs.existsSync(target) && !isOurs(target, name)) { result.skipped.push(name); continue; }
    if (writeIfChanged(target, content, 0o755)) { result.changed.push(name); }
  }
  // Older versions wrote a .bat wrapper; git never runs .bat hooks.
  const bat = path.join(HOOKS_DIR, 'prepare-commit-msg.bat');
  if (isOurs(bat, 'prepare-commit-msg.bat')) { fs.rmSync(bat, { force: true }); }
  return result;
}

/** Writes the settings the shell scripts read. Returns true when a file changed. */
export function writeHookConfig(config: Record<string, unknown>, shell: ShellOptions): boolean {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const json = writeIfChanged(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 0o600);
  const env = writeIfChanged(SHELL_ENV_FILE,
    `AIGITPILOT_SUGGEST_ON_ADD=${shell.suggestOnAdd ? 1 : 0}\nAIGITPILOT_SHORTCUTS=${shell.shortcuts ? 1 : 0}\n`, 0o644);
  return json || env;
}

function gitGlobal(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile('git', ['config', '--global', ...args], { windowsHide: true }, (err, stdout) => {
      if (err) { reject(err); return; }
      resolve(stdout.trim());
    });
  });
}

export async function getGlobalHooksPath(): Promise<string | undefined> {
  try { return (await gitGlobal(['--get', 'core.hooksPath'])) || undefined; }
  catch { return undefined; }   // exit code 1: not set
}

/** Compares a core.hooksPath value (maybe `~/...` or Git Bash `/c/...`) with ours. */
export function isOurHooksPath(value: string | undefined): boolean {
  if (!value) { return false; }
  let p = value.trim().replace(/^~(?=[\\/]|$)/, os.homedir());
  if (process.platform === 'win32') { p = p.replace(/^\/([a-zA-Z])\//, '$1:/'); }
  const norm = (s: string) => {
    const r = path.resolve(s).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return norm(p) === norm(HOOKS_DIR);
}

export async function setGlobalHooksPath(value: string | undefined): Promise<void> {
  if (value) { await gitGlobal(['core.hooksPath', value]); return; }
  await gitGlobal(['--unset', 'core.hooksPath']).catch(() => { /* already unset */ });
}

/** Adds the source line to the shell rc files. Returns the files it changed. */
export function addShellSourceLines(): string[] {
  const home = os.homedir();
  let rcFiles = ['.bashrc', '.zshrc'].map(f => path.join(home, f)).filter(f => fs.existsSync(f));
  if (!rcFiles.length) { rcFiles = [path.join(home, process.platform === 'darwin' ? '.zshrc' : '.bashrc')]; }
  const changed: string[] = [];
  for (const rc of rcFiles) {
    const text = readText(rc) ?? '';
    if (text.includes('aigitpilot-shell.sh')) { continue; }
    fs.appendFileSync(rc, `${text && !text.endsWith('\n') ? '\n' : ''}\n# AI Git Pilot\n${RC_LINE}\n`, 'utf8');
    changed.push(rc);
  }
  return changed;
}

export function removeShellSourceLines(): string[] {
  const changed: string[] = [];
  for (const rc of ['.bashrc', '.zshrc'].map(f => path.join(os.homedir(), f))) {
    const text = readText(rc);
    if (!text?.includes('aigitpilot-shell.sh')) { continue; }
    const lines = text.split('\n');
    const kept = lines.filter((line, i) => !line.includes('aigitpilot-shell.sh')
      && !(line.trim() === '# AI Git Pilot' && lines[i + 1]?.includes('aigitpilot-shell.sh')));
    fs.writeFileSync(rc, kept.join('\n'), 'utf8');
    changed.push(rc);
  }
  return changed;
}

export interface UninstallResult { removed: string[]; kept: string[] }

/** Removes our files and rc lines. The caller restores core.hooksPath. */
export function removeHookFiles(): UninstallResult {
  const result: UninstallResult = { removed: [], kept: [] };
  for (const name of [...SCRIPTS, ...PASSTHROUGH_HOOKS, 'prepare-commit-msg.bat', 'jq.exe']) {
    const file = path.join(HOOKS_DIR, name);
    if (!fs.existsSync(file)) { continue; }
    if (name === 'jq.exe' || isOurs(file, name)) { fs.rmSync(file, { force: true }); result.removed.push(file); }
    else { result.kept.push(file); }
  }
  for (const file of [CONFIG_FILE, SHELL_ENV_FILE]) {
    if (fs.existsSync(file)) { fs.rmSync(file, { force: true }); result.removed.push(file); }
  }
  for (const dir of [HOOKS_DIR, CONFIG_DIR]) {
    try { if (!fs.readdirSync(dir).length) { fs.rmdirSync(dir); } } catch { /* missing or not empty */ }
  }
  result.removed.push(...removeShellSourceLines());
  return result;
}

export async function hasJq(): Promise<boolean> {
  const onPath = await new Promise<boolean>(resolve =>
    cp.execFile('jq', ['--version'], { windowsHide: true }, err => resolve(!err)));
  if (onPath) { return true; }
  try { return fs.statSync(JQ_BUNDLED).size > 0; } catch { return false; }
}

/** Downloads jq for Windows next to the hooks. Writes to a temp file first, so a failed
 *  download never leaves a broken jq.exe behind. */
export function downloadJq(): Promise<void> {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  const partial = `${JQ_BUNDLED}.download`;
  return new Promise((resolve, reject) => {
    const fail = (err: Error) => { fs.rmSync(partial, { force: true }); reject(err); };
    const get = (url: string, redirects: number) => {
      https.get(url, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          get(new URL(res.headers.location, url).toString(), redirects - 1);
          return;
        }
        if (res.statusCode !== 200) { res.resume(); fail(new Error(`HTTP ${res.statusCode}`)); return; }
        const file = fs.createWriteStream(partial);
        res.pipe(file);
        file.on('error', fail);
        file.on('finish', () => file.close(err => {
          if (err) { fail(err); return; }
          fs.renameSync(partial, JQ_BUNDLED);
          resolve();
        }));
      }).on('error', fail);
    };
    get(JQ_URL, 5);
  });
}
