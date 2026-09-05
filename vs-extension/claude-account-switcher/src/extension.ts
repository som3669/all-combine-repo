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
let log: vscode.OutputChannel;

// ---- fs helpers (UTF-8, no BOM; atomic write; 0600) ----

// Claude Code rewrites .credentials.json on every token refresh. A read that
// lands mid-write yields a truncated file, so retry before giving up.
function readJson(file: string, attempts = 3): any | null {
  for (let i = 0; i < attempts; i++) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      /* retry */
    }
  }
  return null;
}

function writeJsonAtomic(file: string, data: any): void {
  const tmp = file + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file); // atomic replace on same volume
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
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

// ---- Credential validation ----
// The point of a profile is that restoring it does NOT trigger a re-login. That
// only holds while the stored refresh token is present and unexpired, so every
// save and every restore is gated on this check.
type CredCheck = { ok: boolean; reason?: string; expired?: boolean };

function checkCredentials(creds: any): CredCheck {
  if (!creds || typeof creds !== 'object') return { ok: false, reason: 'credentials file unreadable' };
  const o = creds.claudeAiOauth;
  // Non-OAuth shapes (API key, Bedrock/Vertex) carry no refresh token to validate.
  if (!o || typeof o !== 'object') {
    return Object.keys(creds).length > 0
      ? { ok: true }
      : { ok: false, reason: 'credentials file is empty' };
  }
  const access = typeof o.accessToken === 'string' ? o.accessToken.trim() : '';
  const refresh = typeof o.refreshToken === 'string' ? o.refreshToken.trim() : '';
  if (!refresh) return { ok: false, reason: 'no refresh token (signed out or mid-login)' };
  if (!access) return { ok: false, reason: 'no access token (signed out or mid-login)' };
  const rExp = typeof o.refreshTokenExpiresAt === 'number' ? o.refreshTokenExpiresAt : 0;
  if (rExp && rExp <= Date.now()) {
    return { ok: false, expired: true, reason: 'refresh token expired ' + new Date(rExp).toLocaleString() };
  }
  return { ok: true };
}

function saveProfile(p: Profile): void {
  ensureProfilesDir();
  const file = profilePath(p.label);
  // Keep one generation back: a bad save used to be unrecoverable.
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  } catch { /* best effort */ }
  writeJsonAtomic(file, p);
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

function findMatching(profiles: Profile[], email: string, accountUuid: string): Profile | undefined {
  return profiles.find((p) => (accountUuid && p.accountUuid === accountUuid) || p.email === email);
}

// Re-snapshot the live account into its matching profile. Claude Code rotates the
// refresh token on every refresh, so a profile captured once goes stale within
// hours; restoring that dead token is what forces the login screen.
// Returns true when the profile was updated.
function snapshotLiveIntoProfile(reason: string): boolean {
  const live = buildProfileFromLive();
  if (!live) return false;
  const check = checkCredentials(live.credentials);
  if (!check.ok) {
    // Never overwrite a good profile with signed-out / half-written credentials.
    log.appendLine('[' + new Date().toISOString() + '] snapshot skipped (' + reason + '): ' + check.reason);
    return false;
  }
  const existing = findMatching(listProfiles(), live.email, live.accountUuid);
  if (!existing) return false;
  if (JSON.stringify(existing.credentials) === JSON.stringify(live.credentials)) return false;
  existing.credentials = live.credentials;
  existing.oauthAccount = live.oauthAccount;
  existing.userID = live.userID;
  existing.capturedAt = live.capturedAt;
  saveProfile(existing);
  log.appendLine('[' + new Date().toISOString() + '] snapshot saved (' + reason + '): ' + existing.label);
  return true;
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
    const check = checkCredentials(live.credentials);
    statusBar.text = (check.ok ? '$(account) ' : '$(warning) ') + live.email;
    statusBar.tooltip = check.ok
      ? 'Claude account: ' + live.email + '\nClick to switch'
      : 'Claude account: ' + live.email + '\n' + check.reason + '\nClick to switch';
  } else {
    statusBar.text = '$(account) Claude: not signed in';
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
  const check = checkCredentials(live.credentials);
  if (!check.ok) {
    vscode.window.showErrorMessage(
      'Cannot capture ' + live.email + ': ' + check.reason +
      '. Sign in fully, then capture — saving now would store credentials that force a re-login.'
    );
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
  vscode.window.showInformationMessage('Captured current account as profile "' + name + '" (' + live.email + ').');
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
    const check = checkCredentials(p.credentials);
    return {
      label: (isCurrent ? '$(check) ' : check.ok ? '' : '$(warning) ') + p.label,
      description: p.email + (isCurrent ? '  (current)' : '') + (check.ok ? '' : '  — ' + check.reason),
      detail: 'captured ' + p.capturedAt,
      profile: p,
    };
  });

  const chosen = await vscode.window.showQuickPick(items, { placeHolder: 'Switch Claude Code account' });
  if (!chosen) return;

  const target = chosen.profile;
  const alreadyCurrent = !!live && ((live.accountUuid && target.accountUuid === live.accountUuid) || target.email === live.email);
  if (alreadyCurrent) {
    vscode.window.showInformationMessage('Already on ' + target.email + '.');
    return;
  }

  // Applying unusable credentials is exactly what produces the login screen.
  // Say so up front instead of switching into a broken state.
  const targetCheck = checkCredentials(target.credentials);
  if (!targetCheck.ok) {
    const pick = await vscode.window.showWarningMessage(
      'Profile "' + target.label + '" cannot sign in: ' + targetCheck.reason + '. Switching will show the login screen.',
      'Switch Anyway',
      'Cancel'
    );
    if (pick !== 'Switch Anyway') return;
  }

  try {
    snapshotLiveIntoProfile('switching away'); // keep outgoing account's tokens fresh
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
  const items: (vscode.QuickPickItem & { profile: Profile })[] = profiles.map((p) => {
    const check = checkCredentials(p.credentials);
    return {
      label: (check.ok ? '' : '$(warning) ') + p.label,
      description: p.email + (check.ok ? '' : '  — ' + check.reason),
      detail: 'captured ' + p.capturedAt,
      profile: p,
    };
  });
  const chosen = await vscode.window.showQuickPick(items, { placeHolder: 'Pick a profile to delete' });
  if (!chosen) return;
  const confirm = await vscode.window.showWarningMessage(
    'Delete profile "' + chosen.profile.label + '"? Stored credentials for ' + chosen.profile.email + ' will be removed.',
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') return;
  try {
    fs.unlinkSync(profilePath(chosen.profile.label));
  } catch {
    /* ignore */
  }
  vscode.window.showInformationMessage('Deleted profile "' + chosen.profile.label + '".');
}

export function activate(context: vscode.ExtensionContext): void {
  log = vscode.window.createOutputChannel('Claude Account Switcher');
  context.subscriptions.push(log);

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
    if (live && checkCredentials(live.credentials).ok) {
      const known = !!findMatching(listProfiles(), live.email, live.accountUuid);
      if (!known) {
        const p = buildProfileFromLive();
        if (p) saveProfile(p);
      }
    }
  } catch {
    /* non-fatal */
  }

  updateStatusBar();

  // Keep the bar in sync AND mirror rotated tokens back into the active profile.
  // Without this a profile only ever holds the token from the last switch, which
  // Claude Code has since rotated away — dead on restore.
  try {
    let timer: NodeJS.Timeout | undefined;
    const watcher = fs.watch(CLAUDE_DIR, (_e, file) => {
      if (file !== '.credentials.json') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          snapshotLiveIntoProfile('token rotated');
        } catch (e: any) {
          log.appendLine('snapshot failed: ' + (e?.message || String(e)));
        }
        updateStatusBar();
      }, 1500); // let Claude Code finish writing
    });
    context.subscriptions.push({
      dispose: () => {
        if (timer) clearTimeout(timer);
        watcher.close();
      },
    });
  } catch {
    /* watch is best-effort */
  }

  // Safety net: snapshot on window close, in case the watcher missed a write.
  context.subscriptions.push({
    dispose: () => {
      try { snapshotLiveIntoProfile('shutdown'); } catch { /* ignore */ }
    },
  });
}

export function deactivate(): void {
  try {
    snapshotLiveIntoProfile('deactivate');
  } catch {
    /* ignore */
  }
}
