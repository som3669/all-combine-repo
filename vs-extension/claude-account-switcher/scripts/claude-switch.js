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

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmp, file);
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
function saveProfile(p) { ensureProfilesDir(); writeJsonAtomic(profilePath(p.label), p); }

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
function refreshCurrentProfileSnapshot() {
  const live = buildProfileFromLive();
  if (!live) return;
  const existing = listProfiles().find((p) => sameAccount(live, p));
  if (existing) {
    existing.credentials = live.credentials;
    existing.oauthAccount = live.oauthAccount;
    existing.userID = live.userID;
    existing.capturedAt = live.capturedAt;
    saveProfile(existing);
  }
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
    const name = args.find((a) => !a.startsWith('--')) || live.email;
    saveProfile(buildProfileFromLive(name));
    console.log(`Captured current account as profile "${name}" (${live.email}).`);
    return;
  }

  const profiles = listProfiles();

  if (flag('--list')) {
    console.log('Current: ' + (live ? live.email : 'not signed in'));
    console.log('Profiles:');
    for (const p of profiles) console.log(`  ${sameAccount(live, p) ? '*' : ' '} ${p.label.padEnd(30)} ${p.email}`);
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
    profiles.forEach((p, i) => console.log(`  [${i + 1}] ${p.label}  <${p.email}>${sameAccount(live, p) ? '  (current)' : ''}`));
    const sel = parseInt(await ask('\nSwitch to # '), 10);
    if (!(sel >= 1 && sel <= profiles.length)) { console.error('Invalid selection.'); process.exit(1); }
    target = profiles[sel - 1];
  }

  if (sameAccount(live, target)) { console.log(`Already on ${target.email}.`); return; }

  try {
    refreshCurrentProfileSnapshot();
    applyProfile(target);
  } catch (e) {
    console.error('Switch failed: ' + (e && e.message ? e.message : String(e)));
    process.exit(1);
  }
  console.log(`Switched to ${target.email}.`);
  console.log('Restart any running Claude Code sessions to pick up the new credentials.');
})();
