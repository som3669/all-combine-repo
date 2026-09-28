#!/usr/bin/env node
/*
 * Switch Claude Code account from the terminal.
 * Same logic and JSON semantics as the VS Code extension (Node JSON.parse,
 * so case-differing duplicate keys in ~/.claude.json are tolerated: last wins).
 *
 * Usage:
 *   node claude-switch.js                 interactive picker
 *   node claude-switch.js <name|email>    switch directly
 *   node claude-switch.js --list          list profiles + current account
 *   node claude-switch.js --capture [name]  save current account as a profile
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const CREDENTIALS_FILE = path.join(CLAUDE_DIR, '.credentials.json');
const CONFIG_FILE = path.join(HOME, '.claude.json');
const PROFILES_DIR = path.join(CLAUDE_DIR, 'account-switcher');

// Claude Code rewrites .credentials.json on every token refresh; a read landing
// mid-write yields a truncated file, so retry before giving up.
function readJson(file, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* retry */ }
  }
  return null;
}
function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

// A profile is only useful if restoring it avoids a re-login, which holds only
// while the stored refresh token is present and unexpired. Gate every save and
// every restore on this.
function checkCredentials(creds) {
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
  if (rExp && rExp <= Date.now()) return { ok: false, reason: 'refresh token expired ' + new Date(rExp).toLocaleString() };
  return { ok: true };
}
// A saved login that Claude Code already failed to renew is dead even though its
// fields look fine; restoring it again only brings the login screen back.
function checkProfile(p) {
  if (p.signInNeeded) {
    return { ok: false, reason: 'needs one sign-in: Claude Code could not renew this saved login (' + new Date(p.signInNeeded).toLocaleString() + ')' };
  }
  return checkCredentials(p.credentials);
}
// After Anthropic rejects a refresh token (and on /logout), Claude Code rewrites
// .credentials.json with empty tokens and expiresAt 0, keeping the other fields.
function isRejectedLogin(creds) {
  const o = creds && creds.claudeAiOauth;
  return !!o && typeof o === 'object' && !o.accessToken && !o.refreshToken;
}
function refreshTokenOf(creds) {
  const r = creds && creds.claudeAiOauth && creds.claudeAiOauth.refreshToken;
  return typeof r === 'string' ? r : '';
}
function ensureProfilesDir() {
  if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
}
function profilePath(name) {
  return path.join(PROFILES_DIR, name.replace(/[^a-zA-Z0-9._@-]/g, '_') + '.json');
}
function listProfiles() {
  ensureProfilesDir();
  const out = [];
  for (const f of fs.readdirSync(PROFILES_DIR)) {
    if (!f.endsWith('.json')) continue;
    const p = readJson(path.join(PROFILES_DIR, f));
    if (p && p.credentials) out.push(p);
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
function saveProfile(p) {
  ensureProfilesDir();
  const file = profilePath(p.label);
  try { if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak'); } catch { /* best effort */ }
  writeJsonAtomic(file, p);
}

function readLiveAccount() {
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
function buildProfileFromLive(label) {
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
function sameAccount(live, p) {
  return !!live && ((live.accountUuid && p.accountUuid === live.accountUuid) || p.email === live.email);
}
function storeSnapshot(existing, live) {
  // Re-applying the login Claude Code failed to renew must not clear the mark;
  // only a new login (a different refresh token) does.
  if (existing.signInNeeded) {
    if (refreshTokenOf(existing.credentials) === refreshTokenOf(live.credentials)) return;
  } else if (JSON.stringify(existing.credentials) === JSON.stringify(live.credentials)) {
    return;
  }
  existing.credentials = live.credentials;
  existing.oauthAccount = live.oauthAccount;
  existing.userID = live.userID;
  existing.capturedAt = live.capturedAt;
  delete existing.signInNeeded;
  saveProfile(existing);
}
function refreshCurrentProfileSnapshot() {
  const live = buildProfileFromLive();
  if (!live) return;
  const check = checkCredentials(live.credentials);
  if (!check.ok) {
    // Never overwrite a good profile with signed-out / half-written credentials.
    console.error('Warning: not snapshotting ' + live.email + ' (' + check.reason + '); keeping the stored copy.');
    // Claude Code blanked the login: the stored copy is the one it failed to renew.
    const p = isRejectedLogin(live.credentials) && listProfiles().find((x) => sameAccount(live, x));
    if (p && !p.signInNeeded && checkCredentials(p.credentials).ok) {
      p.signInNeeded = new Date().toISOString();
      saveProfile(p);
      console.error('Marked "' + p.label + '" as needing one sign-in.');
    }
    return;
  }
  const existing = listProfiles().find((p) => sameAccount(live, p));
  if (existing) storeSnapshot(existing, live);
}
function applyProfile(p) {
  writeJsonAtomic(CREDENTIALS_FILE, p.credentials);
  const config = readJson(CONFIG_FILE) || {};
  config.oauthAccount = p.oauthAccount;
  config.userID = p.userID;
  writeJsonAtomic(CONFIG_FILE, config);
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}

(async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const live = readLiveAccount();

  if (flag('--capture')) {
    if (!live) { console.error('No live Claude Code account (~/.claude/.credentials.json missing). Sign in first.'); process.exit(1); }
    const liveCheck = checkCredentials(live.credentials);
    if (!liveCheck.ok) {
      console.error('Cannot capture ' + live.email + ': ' + liveCheck.reason + '.');
      console.error('Sign in fully first — capturing now would store credentials that force a re-login.');
      process.exit(1);
    }
    const name = args.find((a) => !a.startsWith('--')) || live.email;
    saveProfile(buildProfileFromLive(name));
    console.log(`Captured current account as profile "${name}" (${live.email}).`);
    return;
  }

  const profiles = listProfiles();

  if (flag('--list')) {
    console.log('Current: ' + (live ? live.email : 'not signed in'));
    console.log('Profiles:');
    for (const p of profiles) {
      const c = checkProfile(p);
      const note = c.ok ? '' : p.signInNeeded
        ? '  [NEEDS SIGN-IN since ' + new Date(p.signInNeeded).toLocaleString() + ']'
        : '  [BROKEN: ' + c.reason + ']';
      console.log(`  ${sameAccount(live, p) ? '*' : ' '} ${p.label.padEnd(30)} ${p.email}${note}`);
    }
    return;
  }

  if (profiles.length === 0) {
    console.error('No saved profiles. Run: node claude-switch.js --capture  (then sign into the other account and capture it too).');
    process.exit(1);
  }

  let target;
  const nameArg = args.find((a) => !a.startsWith('--'));
  if (nameArg) {
    target = profiles.find((p) => p.label === nameArg || p.email === nameArg);
    if (!target) { console.error(`No profile matching "${nameArg}".`); process.exit(1); }
  } else {
    console.log('Current: ' + (live ? live.email : 'not signed in') + '\n');
    profiles.forEach((p, i) => console.log(`  [${i + 1}] ${p.label}  <${p.email}>${sameAccount(live, p) ? '  (current)' : ''}${checkProfile(p).ok ? '' : '  (needs sign-in)'}`));
    const sel = parseInt(await ask('\nSwitch to # '), 10);
    if (!(sel >= 1 && sel <= profiles.length)) { console.error('Invalid selection.'); process.exit(1); }
    target = profiles[sel - 1];
  }

  if (sameAccount(live, target)) { console.log(`Already on ${target.email}.`); return; }

  // Applying unusable credentials is exactly what produces the login screen.
  const targetCheck = checkProfile(target);
  if (!targetCheck.ok) {
    console.error(`Profile "${target.label}" ${target.signInNeeded ? targetCheck.reason : 'cannot sign in: ' + targetCheck.reason}.`);
    if (!flag('--force')) {
      console.error(target.signInNeeded
        ? `Re-run with --force to switch, then sign in as ${target.email}; the switcher saves the new login.`
        : 'Switching would show the login screen. Re-run with --force to switch anyway.');
      process.exit(1);
    }
  }

  try {
    refreshCurrentProfileSnapshot();
    // Re-read: the profile on disk is the newest copy of the target.
    applyProfile(readJson(profilePath(target.label)) || target);
  } catch (e) {
    console.error('Switch failed: ' + (e && e.message ? e.message : String(e)));
    process.exit(1);
  }
  console.log(`Switched to ${target.email}.`);
  console.log('Restart every running Claude Code session (all windows and terminals). One left running as the');
  console.log('old account will refresh its token and revoke the copy saved in that profile.');
})();
