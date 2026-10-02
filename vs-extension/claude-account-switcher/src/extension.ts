import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Pre-0.1.1 manifest id. Installed side by side it registers the same command
// ids, wins the race, and runs its ungated snapshot logic instead of ours.
const LEGACY_EXTENSION_ID = 'somshrestha.claude-account-switcher';

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
  signInNeeded?: string;  // ISO time Claude Code failed to renew this saved login
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
  // Without claudeAiOauth there is no Claude login in the file (it may still hold
  // mcpOAuth entries). Saving that would overwrite a good profile.
  if (!o || typeof o !== 'object') return { ok: false, reason: 'no Claude login in the credentials file' };
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

// A saved login that Claude Code already failed to renew is dead even though its
// fields look fine; restoring it again only brings the login screen back.
function checkProfile(p: Profile): CredCheck {
  if (p.signInNeeded) {
    return {
      ok: false,
      reason: 'needs one sign-in: Claude Code could not renew this saved login (' +
        new Date(p.signInNeeded).toLocaleString() + ')',
    };
  }
  return checkCredentials(p.credentials);
}

// After Anthropic rejects a refresh token (and on /logout), Claude Code rewrites
// .credentials.json with empty tokens and expiresAt 0, keeping the other fields.
function isRejectedLogin(creds: any): boolean {
  const o = creds?.claudeAiOauth;
  return !!o && typeof o === 'object' && !o.accessToken && !o.refreshToken;
}

function refreshTokenOf(creds: any): string {
  const r = creds?.claudeAiOauth?.refreshToken;
  return typeof r === 'string' ? r : '';
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

function storeSnapshot(existing: Profile, live: Profile, reason: string): boolean {
  // Re-applying the login Claude Code failed to renew must not clear the mark;
  // only a new login (a different refresh token) does.
  if (existing.signInNeeded) {
    if (refreshTokenOf(existing.credentials) === refreshTokenOf(live.credentials)) return false;
  } else if (JSON.stringify(existing.credentials) === JSON.stringify(live.credentials)) {
    return false;
  }
  existing.credentials = live.credentials;
  existing.oauthAccount = live.oauthAccount;
  existing.userID = live.userID;
  existing.capturedAt = live.capturedAt;
  delete existing.signInNeeded;
  saveProfile(existing);
  log.appendLine('[' + new Date().toISOString() + '] snapshot saved (' + reason + '): ' + existing.label);
  return true;
}

// Claude Code has blanked the live login, so the matching profile holds the copy
// it just failed to renew. Flag it: the next switch warns instead of silently
// landing on the login screen again, and the next good login clears the flag.
function markSignInNeeded(live: Profile, reason: string): void {
  const p = findMatching(listProfiles(), live.email, live.accountUuid);
  if (!p || p.signInNeeded || !checkCredentials(p.credentials).ok) return;
  p.signInNeeded = new Date().toISOString();
  saveProfile(p);
  log.appendLine('[' + new Date().toISOString() + '] marked needs sign-in (' + reason + '): ' + p.label);
  vscode.window.showWarningMessage(
    'Claude Code could not renew the saved login for ' + p.email + ', so it is asking you to sign in. ' +
    'Sign in as ' + p.email + ' once and the switcher saves the new login.'
  );
}

// Re-snapshot the live account into its matching profile. Claude Code rotates the
// refresh token on every refresh, so a profile captured once goes stale within
// hours; restoring that dead token is what forces the login screen.
// Returns true when a profile was updated.
function snapshotLiveIntoProfile(reason: string): boolean {
  const live = buildProfileFromLive();
  if (!live) return false;
  const check = checkCredentials(live.credentials);
  if (!check.ok) {
    // Never overwrite a good profile with signed-out / half-written credentials.
    log.appendLine('[' + new Date().toISOString() + '] snapshot skipped (' + reason + '): ' + check.reason);
    if (isRejectedLogin(live.credentials)) markSignInNeeded(live, reason);
    return false;
  }
  const existing = findMatching(listProfiles(), live.email, live.accountUuid);
  if (!existing) return false;
  return storeSnapshot(existing, live, reason);
}

// ---- Claude Code's refresh locks ----
// Claude Code renews a login while holding these lock directories (proper-lockfile,
// stale after 60s): the current one first, then the legacy `<claude dir>.lock`.
// Switching without them races a renewal in flight: the switch-away snapshot saves
// the refresh token Anthropic is about to retire, and the renewed one never
// reaches the profile, so that account's next restore is rejected.
const LOCK_STALE_MS = 60000;

function refreshLockDirs(): string[] {
  let real = CLAUDE_DIR;
  try { real = fs.realpathSync(CLAUDE_DIR); } catch { /* use as is */ }
  return [path.join(CLAUDE_DIR, '.oauth_refresh.lock'), real + '.lock'];
}

function tryLock(dir: string): boolean {
  try {
    fs.mkdirSync(dir);
    return true;
  } catch (e: any) {
    if (e?.code !== 'EEXIST') throw e;
  }
  try {
    // Same rule Claude Code applies: a lock not touched for 60s has a dead holder.
    if (Date.now() - fs.statSync(dir).mtimeMs > LOCK_STALE_MS) {
      fs.rmdirSync(dir);
      fs.mkdirSync(dir);
      return true;
    }
  } catch { /* raced with its holder: still busy */ }
  return false;
}

async function withRefreshLocks<T>(fn: () => T, timeoutMs = 20000): Promise<T> {
  const held: string[] = [];
  const deadline = Date.now() + timeoutMs;
  try {
    for (const dir of refreshLockDirs()) {
      while (!tryLock(dir)) {
        if (Date.now() > deadline) {
          throw new Error('Claude Code is renewing a login right now. Try the switch again in a moment.');
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      held.push(dir);
    }
    return fn();
  } finally {
    for (const dir of held.reverse()) {
      try { fs.rmdirSync(dir); } catch { /* ignore */ }
    }
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
    const check = checkCredentials(live.credentials);
    const problem = isRejectedLogin(live.credentials)
      ? 'Signed out: sign in as ' + live.email + ' once and the switcher saves it'
      : check.reason;
    statusBar.text = (check.ok ? '$(account) ' : '$(warning) ') + live.email;
    statusBar.tooltip = check.ok
      ? 'Claude account: ' + live.email + '\nClick to switch'
      : 'Claude account: ' + live.email + '\n' + problem + '\nClick to switch';
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
    const check = checkProfile(p);
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
  const targetCheck = checkProfile(target);
  if (!targetCheck.ok) {
    const pick = target.signInNeeded
      ? await vscode.window.showWarningMessage(
          'Profile "' + target.label + '" needs one sign-in: Claude Code could not renew its saved login on ' +
          new Date(target.signInNeeded).toLocaleString() + '. Switch, then sign in as ' + target.email +
          ' in the login screen; the switcher saves the new login.',
          'Switch and Sign In',
          'Cancel'
        )
      : await vscode.window.showWarningMessage(
          'Profile "' + target.label + '" cannot sign in: ' + targetCheck.reason + '. Switching will show the login screen.',
          'Switch Anyway',
          'Cancel'
        );
    if (pick !== 'Switch Anyway' && pick !== 'Switch and Sign In') return;
  }

  try {
    await withRefreshLocks(() => {
      snapshotLiveIntoProfile('switching away'); // keep outgoing account's tokens fresh
      // Re-read: the profile on disk is the newest copy of the target.
      applyProfile((readJson(profilePath(target.label)) as Profile | null) || target);
    });
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
    const check = checkProfile(p);
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

function snapshotSafely(reason: string): void {
  try {
    snapshotLiveIntoProfile(reason);
  } catch (e: any) {
    try { log.appendLine('snapshot failed (' + reason + '): ' + (e?.message || String(e))); } catch { /* channel closed at shutdown */ }
  }
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

  warnLegacyInstall();

  // Tokens rotated while VS Code was closed (terminal sessions) would otherwise
  // stay out of the profile until the next rotation seen by the watcher.
  snapshotSafely('startup');
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
        snapshotSafely('token rotated');
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
  context.subscriptions.push({ dispose: () => snapshotSafely('shutdown') });
}

function warnLegacyInstall(): void {
  if (!vscode.extensions.getExtension(LEGACY_EXTENSION_ID)) return;
  vscode.window
    .showWarningMessage(
      'An old Claude Account Switcher build (0.1.0) is also installed. It takes over the switch commands and ' +
      'saves stale tokens, which causes the login screen after switching. Uninstall it?',
      'Uninstall'
    )
    .then(async (pick) => {
      if (pick !== 'Uninstall') return;
      await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', LEGACY_EXTENSION_ID);
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    });
}

export function deactivate(): void {
  snapshotSafely('deactivate');
}
