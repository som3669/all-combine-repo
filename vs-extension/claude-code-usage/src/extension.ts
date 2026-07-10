import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const HOME = os.homedir();

// Config-dir file/dir names (relative to a given .claude* account dir)
const USAGE_NAME    = 'usage-current.json';
const PLAN_NAME     = 'plan-usage.json';
const HOOKS_NAME    = 'hooks';
const HOOK_NAME     = 'stop-usage.ps1';
const SETTINGS_NAME = 'settings.json';

// Matches ~/.claude, ~/.claude-account, ~/.claude-account1, etc.
const ACCOUNT_RE = /^\.claude(-.*)?$/;

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  updated_at?: string;
}

interface PlanUsage {
  session_used_pct: number;
  session_resets_at: number;
  weekly_used_pct: number;
  weekly_resets_at: number;
  spend_pct?: number;
  spend_used?: number;
  spend_limit?: number;
  spend_severity?: string;
  updated_at?: string;
}

interface Account {
  dir: string;          // absolute path to the .claude* dir
  name: string;         // short display name (e.g. "main", "account1")
  usageFile: string;
  planFile: string;
  hooksDir: string;
  hookScript: string;
  settingsFile: string;
}

// ── Hook script content ────────────────────────────────────────────────────
// Resolves its own config dir from $PSScriptRoot's parent, so a copy installed
// under any .claude* account reads/writes that account's files.
const HOOK_PS1 = `param()
try {
    $configDir = Split-Path $PSScriptRoot -Parent
    $stdin = [Console]::In.ReadToEnd()
    if ($stdin) {
        $data = $stdin | ConvertFrom-Json
        $transcriptPath = $data.transcript_path
        if ($transcriptPath -and (Test-Path $transcriptPath)) {
            $lines = Get-Content $transcriptPath -Tail 300 -Encoding utf8
            $lastUsage = $null
            foreach ($line in $lines) {
                if (-not $line -or $line.Trim() -eq '') { continue }
                try {
                    $obj = $line | ConvertFrom-Json
                    $usage = $null
                    if ($obj.message -and $obj.message.usage) { $usage = $obj.message.usage }
                    elseif ($obj.usage) { $usage = $obj.usage }
                    if ($usage -and ($usage.input_tokens -or $usage.output_tokens)) { $lastUsage = $usage }
                } catch {}
            }
            if ($lastUsage) {
                $inTok  = if ($null -ne $lastUsage.input_tokens)  { [int]$lastUsage.input_tokens }  else { 0 }
                $outTok = if ($null -ne $lastUsage.output_tokens) { [int]$lastUsage.output_tokens } else { 0 }
                $cacheR = if ($null -ne $lastUsage.cache_read_input_tokens)     { [int]$lastUsage.cache_read_input_tokens }     else { 0 }
                $cacheW = if ($null -ne $lastUsage.cache_creation_input_tokens) { [int]$lastUsage.cache_creation_input_tokens } else { 0 }
                $out = [ordered]@{ input_tokens=$inTok; output_tokens=$outTok; cache_read_tokens=$cacheR; cache_creation_tokens=$cacheW; updated_at=(Get-Date -Format 'o') }
                $p = Join-Path $configDir 'usage-current.json'
                [System.IO.File]::WriteAllText($p, ($out | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
            }
        }
    }
    $credPath = Join-Path $configDir '.credentials.json'
    if (Test-Path $credPath) {
        $creds = Get-Content $credPath -Raw | ConvertFrom-Json
        $token = $null
        if ($creds.claudeAiOauth -and $creds.claudeAiOauth.accessToken) { $token = $creds.claudeAiOauth.accessToken }
        elseif ($creds.access_token) { $token = $creds.access_token }
        elseif ($creds.accessToken)  { $token = $creds.accessToken }
        if ($token) {
            try {
                $r = Invoke-RestMethod -Uri 'https://api.anthropic.com/api/oauth/usage' -Headers @{ Authorization="Bearer $token"; 'Content-Type'='application/json' } -TimeoutSec 5
                function ConvertTo-Pct($v)  { if ($null -eq $v) { return 0 }; $d=[double]$v; if ($d -le 1.0) { return [int]([math]::Round($d*100)) }; return [int]([math]::Round($d)) }
                function ConvertTo-Unix($v) { if ($null -eq $v) { return 0 }; try { return [long]$v } catch {}; try { return [long][System.DateTimeOffset]::Parse($v).ToUnixTimeSeconds() } catch {}; return 0 }
                $spendPct = 0; $spendUsed = 0.0; $spendLimit = 0.0; $spendSev = 'normal'
                if ($r.spend -and $r.spend.enabled) {
                    $spendPct = if ($null -ne $r.spend.percent) { [int]$r.spend.percent } else { 0 }
                    $exp = if ($null -ne $r.spend.used.exponent) { [int]$r.spend.used.exponent } else { 2 }
                    $div = [math]::Pow(10, $exp)
                    $spendUsed  = if ($null -ne $r.spend.used.amount_minor)   { [math]::Round($r.spend.used.amount_minor / $div, 2) }   else { 0.0 }
                    $spendLimit = if ($null -ne $r.spend.limit.amount_minor)  { [math]::Round($r.spend.limit.amount_minor / $div, 2) }  else { 0.0 }
                    $spendSev   = if ($r.spend.severity) { [string]$r.spend.severity } else { 'normal' }
                }
                $plan = [ordered]@{ session_used_pct=(ConvertTo-Pct $r.five_hour.utilization); session_resets_at=(ConvertTo-Unix $r.five_hour.resets_at); weekly_used_pct=(ConvertTo-Pct $r.seven_day.utilization); weekly_resets_at=(ConvertTo-Unix $r.seven_day.resets_at); spend_pct=$spendPct; spend_used=$spendUsed; spend_limit=$spendLimit; spend_severity=$spendSev; updated_at=(Get-Date -Format 'o') }
                $pp = Join-Path $configDir 'plan-usage.json'
                [System.IO.File]::WriteAllText($pp, ($plan | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
            } catch {}
        }
    }
} catch {}
exit 0`;

// ── Account discovery ──────────────────────────────────────────────────────
function accountName(dirName: string): string {
  if (dirName === '.claude') { return 'main'; }
  return dirName.replace(/^\.claude-/, '') || dirName;
}

function makeAccount(dir: string): Account {
  return {
    dir,
    name: accountName(path.basename(dir)),
    usageFile: path.join(dir, USAGE_NAME),
    planFile: path.join(dir, PLAN_NAME),
    hooksDir: path.join(dir, HOOKS_NAME),
    hookScript: path.join(dir, HOOKS_NAME, HOOK_NAME),
    settingsFile: path.join(dir, SETTINGS_NAME),
  };
}

// A .claude* dir counts as a Claude Code config dir if it looks like one.
function looksLikeConfigDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.credentials.json')) ||
         fs.existsSync(path.join(dir, SETTINGS_NAME)) ||
         fs.existsSync(path.join(dir, 'projects'));
}

function discoverAccounts(): Account[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(HOME, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(e => e.isDirectory() && ACCOUNT_RE.test(e.name))
    .map(e => path.join(HOME, e.name))
    .filter(looksLikeConfigDir)
    .map(makeAccount);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function makeBar(pct: number, blocks = 8): string {
  const filled = Math.round((Math.min(pct, 100) / 100) * blocks);
  return '█'.repeat(filled) + '░'.repeat(blocks - filled);
}

function timeUntil(unixSec: number): string {
  const ms = unixSec * 1000 - Date.now();
  if (ms <= 0) { return 'now'; }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function resetDay(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function resetTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) { return null; }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch { return null; }
}

function toMs(iso?: string): number {
  if (!iso) { return 0; }
  const t = Date.parse(iso);
  return isNaN(t) ? 0 : t;
}

// ── Burn rate tracking (per account) ───────────────────────────────────────
interface UsagePoint { t: number; pct: number; resetAt: number; }
const usageHistory = new Map<string, UsagePoint[]>();
const HISTORY_MAX = 12; // ~1 hour at 5-min intervals

function recordUsage(dir: string, pct: number, resetAt: number): void {
  const now = Date.now();
  let hist = usageHistory.get(dir);
  if (!hist) { hist = []; usageHistory.set(dir, hist); }
  // Discard history when session resets (new window)
  if (hist.length && hist[0].resetAt !== resetAt) { hist.length = 0; }
  // Only push if pct changed or first entry
  if (!hist.length || hist[hist.length - 1].pct !== pct) {
    hist.push({ t: now, pct, resetAt });
    if (hist.length > HISTORY_MAX) { hist.shift(); }
  }
}

function burnPrediction(dir: string): string | null {
  const hist = usageHistory.get(dir);
  if (!hist || hist.length < 2) { return null; }
  const oldest = hist[0];
  const latest = hist[hist.length - 1];
  const deltaPct = latest.pct - oldest.pct;
  const deltaMs  = latest.t  - oldest.t;
  if (deltaPct <= 0 || deltaMs <= 0) { return null; }
  const msPerPct = deltaMs / deltaPct;
  const pctLeft  = 100 - latest.pct;
  const msLeft   = pctLeft * msPerPct;
  const h = Math.floor(msLeft / 3_600_000);
  const m = Math.floor((msLeft % 3_600_000) / 60_000);
  return h > 0 ? `~${h}h ${m}m` : `~${m}m`;
}

// ── Status bar update ──────────────────────────────────────────────────────
let lastNotifiedResetAt = 0;

function barColor(pct: number): vscode.ThemeColor | undefined {
  if (pct >= 95) { return new vscode.ThemeColor('statusBarItem.errorBackground'); }
  if (pct >= 80) { return new vscode.ThemeColor('statusBarItem.warningBackground'); }
  return undefined;
}

interface Snapshot { account: Account; tokens: TokenUsage | null; plan: PlanUsage | null; ts: number; }

// Pick the most-recently-active account across all discovered config dirs.
function activeSnapshot(accounts: Account[]): Snapshot | null {
  let best: Snapshot | null = null;
  for (const account of accounts) {
    const tokens = readJson<TokenUsage>(account.usageFile);
    const plan   = readJson<PlanUsage>(account.planFile);
    if (!tokens && !plan) { continue; }
    const ts = Math.max(toMs(plan?.updated_at), toMs(tokens?.updated_at));
    if (!best || ts > best.ts) { best = { account, tokens, plan, ts }; }
  }
  return best;
}

function updateStatus(barSession: vscode.StatusBarItem, barWeekly: vscode.StatusBarItem): void {
  const accounts = discoverAccounts();
  const snap = activeSnapshot(accounts);

  if (!snap) {
    barSession.text = '$(pulse) Claude: waiting';
    barSession.tooltip = 'No data yet — send a message to Claude Code.';
    barWeekly.hide();
    return;
  }

  const { account, tokens, plan } = snap;
  // Only tag the account when more than one is in play.
  const tag = accounts.length > 1 ? `${account.name} ` : '';

  if (plan) { recordUsage(account.dir, plan.session_used_pct, plan.session_resets_at); }

  if (plan) {
    barSession.text = `$(pulse) ${tag}[ ${makeBar(plan.session_used_pct)} ${plan.session_used_pct}% (CUR: ↺${resetTime(plan.session_resets_at)})`;
    barSession.backgroundColor = barColor(plan.session_used_pct);
    barWeekly.text  = `${makeBar(plan.weekly_used_pct)} ${plan.weekly_used_pct}% (wk) ]`;
    barWeekly.backgroundColor = barColor(plan.weekly_used_pct);
    barWeekly.show();
  } else if (tokens) {
    barSession.text = `$(pulse) ${tag}in:${fmt(tokens.input_tokens)} out:${fmt(tokens.output_tokens)}`;
    barSession.backgroundColor = undefined;
    barWeekly.hide();
  }

  // Near-limit notification: once per session window at 90%
  if (plan && plan.session_used_pct >= 90 && plan.session_resets_at !== lastNotifiedResetAt) {
    lastNotifiedResetAt = plan.session_resets_at;
    vscode.window.showWarningMessage(
      `Claude session (${account.name}) ${plan.session_used_pct}% used — resets in ${timeUntil(plan.session_resets_at)}.`
    );
  }

  const prediction = burnPrediction(account.dir);

  // Shared tooltip on both bars
  const tip: string[] = [];
  if (accounts.length > 1) { tip.push(`**Account:** ${account.name}  \`${account.dir}\``); tip.push(''); }
  if (plan) {
    tip.push(`**Current session:** ${plan.session_used_pct}% used`);
    tip.push(`Resets at ${resetTime(plan.session_resets_at)} (in ${timeUntil(plan.session_resets_at)})`);
    if (prediction) { tip.push(`At current rate, runs out in ${prediction}`); }
    tip.push('');
    tip.push(`**Weekly (all models):** ${plan.weekly_used_pct}% used`);
    tip.push(`Resets ${resetDay(plan.weekly_resets_at)} (in ${timeUntil(plan.weekly_resets_at)})`);
    if (plan.spend_pct !== undefined && plan.spend_limit && plan.spend_limit > 0) {
      tip.push('');
      const used  = plan.spend_used  !== undefined ? `$${plan.spend_used.toFixed(2)}`  : '';
      const limit = `$${plan.spend_limit.toFixed(2)}`;
      tip.push(`**Extra usage credit:** ${plan.spend_pct}% (${used} / ${limit})`);
    }
  }
  if (tokens) {
    if (tip.length) { tip.push(''); }
    tip.push(`Input: ${tokens.input_tokens.toLocaleString()} tokens`);
    tip.push(`Output: ${tokens.output_tokens.toLocaleString()} tokens`);
    tip.push(`Cache read: ${tokens.cache_read_tokens.toLocaleString()} tokens`);
  }
  const md = new vscode.MarkdownString(tip.join('\n\n'));
  md.isTrusted = true;
  barSession.tooltip = md;
  barWeekly.tooltip  = md;
}

// ── Auto-setup ─────────────────────────────────────────────────────────────
function isHookConfigured(account: Account): boolean {
  if (!fs.existsSync(account.hookScript)) { return false; }
  try {
    const settings = JSON.parse(fs.readFileSync(account.settingsFile, 'utf8'));
    const stopHooks = settings?.hooks?.Stop;
    if (!Array.isArray(stopHooks)) { return false; }
    return stopHooks.some((entry: { hooks?: Array<{ command?: string }> }) =>
      entry.hooks?.some(h => h.command?.includes(HOOK_NAME))
    );
  } catch { return false; }
}

function writeHookScript(account: Account): void {
  fs.mkdirSync(account.hooksDir, { recursive: true });
  fs.writeFileSync(account.hookScript, HOOK_PS1, 'utf8');
}

function addHookToSettings(account: Account): void {
  let settings: Record<string, unknown> = {};
  try {
    if (fs.existsSync(account.settingsFile)) {
      settings = JSON.parse(fs.readFileSync(account.settingsFile, 'utf8'));
    }
  } catch { /* start fresh */ }

  const hookCmd = `powershell -ExecutionPolicy Bypass -File "${account.hookScript.replace(/\\/g, '\\\\')}"`;
  const hookEntry = { matcher: '', hooks: [{ type: 'command', command: hookCmd }] };

  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;
  if (!Array.isArray(hooks.Stop)) {
    hooks.Stop = [];
  }
  hooks.Stop.push(hookEntry);

  fs.writeFileSync(account.settingsFile, JSON.stringify(settings, null, 2), 'utf8');
}

// Idempotent: upgrades the hook script in every account, and registers it where missing.
function runSetup(): void {
  const accounts = discoverAccounts();
  for (const account of accounts) {
    try {
      writeHookScript(account);            // always overwrite -> upgrades old installs
      if (!isHookConfigured(account)) {
        addHookToSettings(account);
      }
    } catch { /* skip this account */ }
  }
}

// ── Activate ───────────────────────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
  const barSession = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
  const barWeekly  = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  barSession.command = 'claude-token-monitor.refresh';
  barWeekly.command  = 'claude-token-monitor.refresh';
  barSession.show();
  updateStatus(barSession, barWeekly);

  // Watch every .claude* dir's usage/plan files.
  const watchers: vscode.FileSystemWatcher[] = [];
  for (const account of discoverAccounts()) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(account.dir), '{usage-current,plan-usage}.json')
    );
    watcher.onDidChange(() => updateStatus(barSession, barWeekly));
    watcher.onDidCreate(() => updateStatus(barSession, barWeekly));
    watchers.push(watcher);
  }

  // Refresh plan usage for every account (re-runs each account's own hook).
  const fetchAll = (done?: () => void) => {
    const { exec } = require('child_process') as typeof import('child_process');
    const accounts = discoverAccounts();
    if (!accounts.length) { if (done) { done(); } return; }
    let pending = accounts.length;
    for (const account of accounts) {
      exec(
        `echo {} | powershell -NoProfile -ExecutionPolicy Bypass -File "${account.hookScript}"`,
        { shell: 'cmd.exe' },
        () => { if (--pending === 0 && done) { done(); } }
      );
    }
  };

  const refreshCmd = vscode.commands.registerCommand('claude-token-monitor.refresh', () => {
    fetchAll(() => updateStatus(barSession, barWeekly));
  });

  const manualCmd = vscode.commands.registerCommand('claude-token-monitor.openManual', () => {
    const uri = vscode.Uri.joinPath(context.extensionUri, 'MANUAL.md');
    vscode.commands.executeCommand('markdown.showPreview', uri);
  });

  const autoRefresh  = setInterval(fetchAll, 5 * 60 * 1000);
  const clockRefresh = setInterval(() => updateStatus(barSession, barWeekly), 60 * 1000);

  context.subscriptions.push(barSession, barWeekly, refreshCmd, manualCmd, ...watchers, {
    dispose: () => { clearInterval(autoRefresh); clearInterval(clockRefresh); }
  });

  // Run setup check after short delay (avoid blocking startup)
  setTimeout(() => runSetup(), 3000);
}

export function deactivate(): void { /* nothing */ }
