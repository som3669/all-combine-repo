import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---- Paths ----
const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const CREDENTIALS_FILE = path.join(CLAUDE_DIR, '.credentials.json');
const CONFIG_FILE = path.join(HOME, '.claude.json'); // holds oauthAccount + userID
const PROFILES_DIR = path.join(CLAUDE_DIR, 'account-switcher');

// A stored profile = full credentials + the account-identity slice of .claude.json.
interface Profile {
  label: string;          // human name, defaults to email
  email: string;          // for matching the live account
  accountUuid: string;    // stable id used to match live account
  credentials: any;       // full contents of .credentials.json
  oauthAccount: any;      // .claude.json -> oauthAccount block
  userID: string;         // .claude.json -> userID
  capturedAt: string;
}

let statusBar: vscode.StatusBarItem;

// ---- fs helpers (UTF-8, no BOM; atomic write) ----
function readJson(file: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file: string, data: any): void {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmp, file); // atomic replace on same volume
}

function ensureProfilesDir(): void {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

function profilePath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._@-]/g, '_');
  return path.join(PROFILES_DIR, safe + '.json');
}

function listProfiles(): Profile[] {
  ensureProfilesDir();
  const out: Profile[] = [];
  for (const f of fs.readdirSync(PROFILES_DIR)) {
    if (!f.endsWith('.json')) continue;
    const p = readJson(path.join(PROFILES_DIR, f)) as Profile | null;
    if (p && p.credentials) out.push(p);
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

function saveProfile(p: Profile): void {
  ensureProfilesDir();
  writeJsonAtomic(profilePath(p.label), p);
}

// ---- Live account read/apply ----
function readLiveAccount(): { email: string; accountUuid: string; oauthAccount: any; userID: string; credentials: any } | null {
  const creds = readJson(CREDENTIALS_FILE);
  const config = readJson(CONFIG_FILE);
  if (!creds || !config || !config.oauthAccount) return null;
  return {
    email: config.oauthAccount.emailAddress || 'unknown',
    accountUuid: config.oauthAccount.accountUuid || '',
    oauthAccount: config.oauthAccount,
    userID: config.userID || '',
    credentials: creds,
  };
}

function buildProfileFromLive(label?: string): Profile | null {
  const live = readLiveAccount();
  if (!live) return null;
  return {
    label: label || live.email,
    email: live.email,
    accountUuid: live.accountUuid,
    credentials: live.credentials,
    oauthAccount: live.oauthAccount,
    userID: live.userID,
    capturedAt: new Date().toISOString(),
  };
}

// Re-snapshot the currently-live account into its matching profile so the
// (rotated) refresh token stays fresh before we switch away from it.
function refreshCurrentProfileSnapshot(): void {
  const live = buildProfileFromLive();
  if (!live) return;
  const existing = listProfiles().find(
    (p) => (live.accountUuid && p.accountUuid === live.accountUuid) || p.email === live.email
  );
  if (existing) {
    existing.credentials = live.credentials;
    existing.oauthAccount = live.oauthAccount;
    existing.userID = live.userID;
    existing.capturedAt = live.capturedAt;
    saveProfile(existing);
  }
}

// Write a profile's credentials + identity into the live Claude Code files.
function applyProfile(p: Profile): void {
  // 1. credentials.json — full replace
  writeJsonAtomic(CREDENTIALS_FILE, p.credentials);

  // 2. .claude.json — surgical replace of account-identity fields, preserve rest
  const config = readJson(CONFIG_FILE) || {};
  config.oauthAccount = p.oauthAccount;
  config.userID = p.userID;
  writeJsonAtomic(CONFIG_FILE, config);
}

// ---- Status bar ----
function updateStatusBar(): void {
  const live = readLiveAccount();
  if (live) {
    statusBar.text = `$(account) ${live.email}`;
    statusBar.tooltip = `Claude account: ${live.email}\nClick to switch`;
  } else {
    statusBar.text = `$(account) Claude: not signed in`;
    statusBar.tooltip = 'No Claude Code credentials found';
  }
  statusBar.show();
}

// ---- Commands ----
async function cmdCapture(): Promise<void> {
  const live = readLiveAccount();
  if (!live) {
    vscode.window.showErrorMessage('No live Claude Code account found (~/.claude/.credentials.json missing). Sign in first.');
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: 'Profile name for the current account',
    value: live.email,
  });
  if (!name) return;
  const p = buildProfileFromLive(name);
  if (!p) return;
  saveProfile(p);
  updateStatusBar();
  vscode.window.showInformationMessage(`Captured current account as profile "${name}" (${live.email}).`);
}

async function cmdSwitch(): Promise<void> {
  const profiles = listProfiles();
  const live = readLiveAccount();

  if (profiles.length === 0) {
    const pick = await vscode.window.showInformationMessage(
      'No saved profiles yet. Capture the current account first, then sign in to the other account and capture it too.',
      'Capture Current'
    );
    if (pick === 'Capture Current') await cmdCapture();
    return;
  }

  const items: (vscode.QuickPickItem & { profile: Profile })[] = profiles.map((p) => {
    const isCurrent = !!live && ((live.accountUuid && p.accountUuid === live.accountUuid) || p.email === live.email);
    return {
      label: (isCurrent ? '$(check) ' : '') + p.label,
      description: p.email + (isCurrent ? '  (current)' : ''),
      detail: 'captured ' + p.capturedAt,
      profile: p,
    };
  });

  const chosen = await vscode.window.showQuickPick(items, { placeHolder: 'Switch Claude Code account' });
  if (!chosen) return;

  const target = chosen.profile;
  const alreadyCurrent = !!live && ((live.accountUuid && target.accountUuid === live.accountUuid) || target.email === live.email);
  if (alreadyCurrent) {
    vscode.window.showInformationMessage(`Already on ${target.email}.`);
    return;
  }

  try {
    refreshCurrentProfileSnapshot(); // keep outgoing account's tokens fresh
    applyProfile(target);
  } catch (e: any) {
    vscode.window.showErrorMessage('Switch failed: ' + (e?.message || String(e)));
    return;
  }

  updateStatusBar();
  // Auto reload so the Claude Code extension / CLI picks up new credentials.
  await vscode.commands.executeCommand('workbench.action.reloadWindow');
}

async function cmdManage(): Promise<void> {
  const profiles = listProfiles();
  if (profiles.length === 0) {
    vscode.window.showInformationMessage('No profiles saved.');
    return;
  }
  const items: (vscode.QuickPickItem & { profile: Profile })[] = profiles.map((p) => ({
    label: p.label,
    description: p.email,
    detail: 'captured ' + p.capturedAt,
    profile: p,
  }));
  const chosen = await vscode.window.showQuickPick(items, { placeHolder: 'Pick a profile to delete' });
  if (!chosen) return;
  const confirm = await vscode.window.showWarningMessage(
    `Delete profile "${chosen.profile.label}"? Stored credentials for ${chosen.profile.email} will be removed.`,
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') return;
  try {
    fs.unlinkSync(profilePath(chosen.profile.label));
  } catch {
    /* ignore */
  }
  vscode.window.showInformationMessage(`Deleted profile "${chosen.profile.label}".`);
}

export function activate(context: vscode.ExtensionContext): void {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBar.command = 'claude-account-switcher.switch';
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-account-switcher.switch', cmdSwitch),
    vscode.commands.registerCommand('claude-account-switcher.capture', cmdCapture),
    vscode.commands.registerCommand('claude-account-switcher.manage', cmdManage)
  );

  // Auto-capture the current account on first run so there's always a return path.
  try {
    const live = readLiveAccount();
    if (live) {
      const known = listProfiles().some(
        (p) => (live.accountUuid && p.accountUuid === live.accountUuid) || p.email === live.email
      );
      if (!known) {
        const p = buildProfileFromLive();
        if (p) saveProfile(p);
      }
    }
  } catch {
    /* non-fatal */
  }

  updateStatusBar();

  // Keep the bar in sync if credentials change under us.
  try {
    const watcher = fs.watch(CLAUDE_DIR, (_e, file) => {
      if (file === '.credentials.json') updateStatusBar();
    });
    context.subscriptions.push({ dispose: () => watcher.close() });
  } catch {
    /* watch is best-effort */
  }
}

export function deactivate(): void {
  // nothing
}
