import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as crypto from 'crypto';

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

// ---- Token ownership ----
// .claude.json says which account is active, but .credentials.json can be
// rewritten by any Claude Code process still running as the previous account
// (another window, a terminal). Trusting .claude.json filed that account's
// tokens under the new one, corrupting both profiles. So each token is checked
// against Anthropic once, and the answer is cached for the token's lifetime.
const tokenOwners = new Map<string, string>(); // sha256(refreshToken) -> accountUuid
const foreignWarned = new Set<string>();

function tokenKey(creds: any): string {
  const r = creds?.claudeAiOauth?.refreshToken;
  return typeof r === 'string' && r ? crypto.createHash('sha256').update(r).digest('hex') : '';
}

// Resolves the owning accountUuid, or null when it can't tell (offline,
// expired access token, non-OAuth credentials).
function fetchTokenOwner(creds: any): Promise<string | null> {
  const access = creds?.claudeAiOauth?.accessToken;
  if (typeof access !== 'string' || !access) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = https.get(
      'https://api.anthropic.com/api/oauth/profile',
      { headers: { Authorization: 'Bearer ' + access, 'anthropic-beta': 'oauth-2025-04-20' }, timeout: 8000 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const uuid = res.statusCode === 200 ? JSON.parse(body)?.account?.uuid : null;
            resolve(typeof uuid === 'string' && uuid ? uuid : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

async function resolveTokenOwner(creds: any): Promise<string | null> {
  const key = tokenKey(creds);
  if (!key) return null;
  const cached = tokenOwners.get(key);
  if (cached) return cached;
  const owner = await fetchTokenOwner(creds);
  if (owner) tokenOwners.set(key, owner);
  return owner;
}

function storeSnapshot(existing: Profile, live: Profile, reason: string): boolean {
  if (JSON.stringify(existing.credentials) === JSON.stringify(live.credentials)) return false;
  existing.credentials = live.credentials;
  if (existing.accountUuid === live.accountUuid) {
    existing.oauthAccount = live.oauthAccount;
    existing.userID = live.userID;
  }
  existing.capturedAt = live.capturedAt;
  saveProfile(existing);
  log.appendLine('[' + new Date().toISOString() + '] snapshot saved (' + reason + '): ' + existing.label);
  return true;
}

// Re-snapshot the live account into its matching profile. Claude Code rotates the
// refresh token on every refresh, so a profile captured once goes stale within
// hours; restoring that dead token is what forces the login screen.
// `offline` (shutdown paths, which cannot await) saves only tokens whose owner is
// already cached. Returns true when a profile was updated.
async function snapshotLiveIntoProfile(reason: string, offline = false): Promise<boolean> {
  const live = buildProfileFromLive();
  if (!live) return false;
  const check = checkCredentials(live.credentials);
  if (!check.ok) {
    // Never overwrite a good profile with signed-out / half-written credentials.
    log.appendLine('[' + new Date().toISOString() + '] snapshot skipped (' + reason + '): ' + check.reason);
    return false;
  }
  const profiles = listProfiles();
  const owner = offline ? tokenOwners.get(tokenKey(live.credentials)) || null : await resolveTokenOwner(live.credentials);
  if (offline && !owner) return false;

  if (owner && live.accountUuid && owner !== live.accountUuid) {
    // A session still signed in as another account refreshed and wrote its
    // tokens. They are that account's newest (its older ones are now revoked),
    // so file them there instead of dropping or misfiling them.
    const real = profiles.find((p) => p.accountUuid === owner);
    log.appendLine(
      '[' + new Date().toISOString() + '] credentials belong to ' + (real ? real.email : owner) +
      ', not the active ' + live.email + ' (' + reason + ')'
    );
    if (real) storeSnapshot(real, live, reason + ', rerouted');
    warnForeignCredentials(live, real);
    return !!real;
  }

  const existing = findMatching(profiles, live.email, live.accountUuid);
  if (!existing) return false;
  return storeSnapshot(existing, live, reason);
}

function warnForeignCredentials(live: Profile, real: Profile | undefined): void {
  const key = tokenKey(live.credentials);
  if (foreignWarned.has(key)) return;
  foreignWarned.add(key);
  const intended = findMatching(listProfiles(), live.email, live.accountUuid);
  const who = real ? real.email : 'another account';
  const action = intended ? 'Re-apply ' + live.email : undefined;
  const msg =
    'A Claude Code session still signed in as ' + who + ' overwrote the credentials for ' + live.email +
    '. Close other Claude Code windows and terminals' + (action ? ', then re-apply.' : '.');
  const pending = action ? vscode.window.showWarningMessage(msg, action) : vscode.window.showWarningMessage(msg);
  pending.then(async (pick) => {
    if (!intended || pick !== action) return;
    applyProfile(intended);
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  });
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
    await snapshotLiveIntoProfile('switching away'); // keep outgoing account's tokens fresh
    // The snapshot may have just filed fresher tokens under the target itself.
    applyProfile((readJson(profilePath(target.label)) as Profile | null) || target);
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

  warnLegacyInstall();
  updateStatusBar();

  // Tokens rotated while VS Code was closed (terminal sessions) would otherwise
  // stay out of the profile until the next rotation seen by the watcher.
  snapshotLiveIntoProfile('startup').then(updateStatusBar, (e) =>
    log.appendLine('startup snapshot failed: ' + (e?.message || String(e)))
  );

  // Keep the bar in sync AND mirror rotated tokens back into the active profile.
  // Without this a profile only ever holds the token from the last switch, which
  // Claude Code has since rotated away — dead on restore.
  try {
    let timer: NodeJS.Timeout | undefined;
    const watcher = fs.watch(CLAUDE_DIR, (_e, file) => {
      if (file !== '.credentials.json') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        snapshotLiveIntoProfile('token rotated')
          .catch((e: any) => log.appendLine('snapshot failed: ' + (e?.message || String(e))))
          .then(updateStatusBar);
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
      snapshotLiveIntoProfile('shutdown', true).catch(() => { /* ignore */ });
    },
  });
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
  // Offline: the extension host will not wait for a network check here.
  snapshotLiveIntoProfile('deactivate', true).catch(() => { /* ignore */ });
}
