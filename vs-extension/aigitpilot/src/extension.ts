import * as vscode from 'vscode';
import * as path from 'path';
import {
  DEFAULT_EXCLUDES, DEFAULT_MODEL, KEY_SETTING, KeyedProvider, MODEL_SETTING, PROVIDERS,
  cfg, currentProvider, getApiKey, initSecrets, migrateKeysToSecrets, promptSettings, providerSettings, storeApiKey,
} from './config';
import { collectChanges, git, repoContext } from './diff';
import * as hook from './hook';
import { cleanMessage, systemPrompt, userPrompt } from './prompt';
import { PROVIDER_LABEL, ProviderError, ProviderId, ProviderSettings, complete, listModels } from './providers';

let ctx: vscode.ExtensionContext;
/** The last message put in each repository's commit box, so it is not mistaken for a draft. */
const lastGenerated = new Map<string, string>();
/** Set while installing or removing the hook, so the settings listener stays out of the way. */
let hookBusy = false;

const errText = (err: unknown) => err instanceof Error ? err.message : String(err);
const isCancel = (err: unknown) => err instanceof ProviderError && err.kind === 'cancelled';

// ── repository ────────────────────────────────────────────────────────────────

interface GitRepository { rootUri: vscode.Uri; inputBox: { value: string }; ui?: { selected: boolean } }
interface GitAPI { repositories: GitRepository[]; getRepository(uri: vscode.Uri): GitRepository | null }

async function gitApi(): Promise<GitAPI | undefined> {
  const ext = vscode.extensions.getExtension<{ getAPI(version: 1): GitAPI }>('vscode.git');
  if (!ext) { return undefined; }
  try { return (ext.isActive ? ext.exports : await ext.activate()).getAPI(1); }
  catch { return undefined; }   // the git extension is disabled
}

async function findRootFromWorkspace(): Promise<string | undefined> {
  const dirs: string[] = [];
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active?.scheme === 'file') { dirs.push(path.dirname(active.fsPath)); }
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    if (f.uri.scheme === 'file') { dirs.push(f.uri.fsPath); }
  }
  for (const dir of dirs) {
    try {
      const root = (await git(['rev-parse', '--show-toplevel'], dir)).trim();
      if (root) { return root; }
    } catch { /* not a git repo, try next */ }
  }
  return undefined;
}

interface Target { root: string; repo?: GitRepository }

/** The repository whose ✨ was clicked, else the active editor's, else the selected one, else ask. */
async function resolveTarget(arg?: unknown): Promise<Target | undefined> {
  const api = await gitApi();
  const clicked = (arg as { rootUri?: vscode.Uri } | undefined)?.rootUri;
  if (clicked && typeof clicked.fsPath === 'string') {
    const repo = api?.getRepository(clicked) ?? undefined;
    return { root: repo?.rootUri.fsPath ?? clicked.fsPath, repo };
  }
  const repos = api?.repositories ?? [];
  if (repos.length === 1) { return { root: repos[0].rootUri.fsPath, repo: repos[0] }; }
  if (api && repos.length > 1) {
    const active = vscode.window.activeTextEditor?.document.uri;
    const selected = repos.filter(r => r.ui?.selected);
    const repo = (active && api.getRepository(active))
      ?? (selected.length === 1 ? selected[0] : undefined)
      ?? (await vscode.window.showQuickPick(
        repos.map(r => ({ label: path.basename(r.rootUri.fsPath), description: r.rootUri.fsPath, repo: r })),
        { title: 'AI Git Pilot: Which repository?' }))?.repo;
    return repo && { root: repo.rootUri.fsPath, repo };
  }
  const root = await findRootFromWorkspace();
  return root ? { root } : undefined;
}

// ── main command ──────────────────────────────────────────────────────────────

async function generateCommitMessage(arg?: unknown): Promise<void> {
  const target = await resolveTarget(arg);
  if (!target) {
    vscode.window.showErrorMessage('AI Git Pilot: No git repository found in this workspace.');
    return;
  }
  const settings = await providerSettings();
  const label = PROVIDER_LABEL[settings.provider];

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `AI Git Pilot: Writing a commit message with ${label}…`,
    cancellable: true,
  }, async (_progress, token) => {
    const abort = new AbortController();
    token.onCancellationRequested(() => abort.abort());
    try {
      const changes = await collectChanges(target.root, cfg<string[]>('excludeFiles', DEFAULT_EXCLUDES), cfg<number>('maxDiffSize', 8000));
      if (!changes) {
        vscode.window.showInformationMessage('AI Git Pilot: No changes to describe.');
        return;
      }
      const typed = target.repo?.inputBox.value.trim() ?? '';
      const draft = typed && typed !== lastGenerated.get(target.root) ? typed : undefined;
      const context = await repoContext(target.root, cfg<boolean>('matchRepoStyle', true));
      const prompts = promptSettings();
      const chat = { system: systemPrompt(prompts), user: userPrompt({ ...context, ...changes, draft }) };
      let raw: string;
      try {
        raw = await complete(settings, chat, abort.signal);
      } catch (err) {
        const replacement = await replacementModel(err, settings, abort.signal);
        if (!replacement) { throw err; }
        raw = await complete({ ...settings, model: replacement }, chat, abort.signal);
        await vscode.workspace.getConfiguration('aigitpilot')
          .update(MODEL_SETTING[settings.provider], replacement, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
          `AI Git Pilot: ${label} no longer offers "${settings.model}", so AI Git Pilot switched to "${replacement}".`, 'Choose Model')
          .then(action => { if (action) { void runSetup(settings.provider); } });
      }
      const message = cleanMessage(raw, prompts.style);
      if (!message) { throw new ProviderError(`${label} sent back an empty message.`, 'other'); }

      lastGenerated.set(target.root, message);
      if (target.repo) {
        target.repo.inputBox.value = message;
        if (changes.source === 'all') {
          vscode.window.setStatusBarMessage('$(sparkle) AI Git Pilot: nothing was staged, so the message covers all changes.', 6000);
        }
      } else {
        await vscode.env.clipboard.writeText(message);
        vscode.window.showInformationMessage('AI Git Pilot: Copied the message to the clipboard. Paste it into the commit box.');
      }
    } catch (err) {
      if (!isCancel(err)) { void showProblem(err, settings); }
    }
  });
}

/**
 * Cloud providers retire models often. When the saved one is gone, returns a model the
 * provider still offers (a recommended one first), or undefined to report the error.
 */
async function replacementModel(err: unknown, s: ProviderSettings, signal: AbortSignal): Promise<string | undefined> {
  if (!(err instanceof ProviderError) || err.kind !== 'model' || s.provider === 'ollama') { return undefined; }
  const available = await listModels(s, signal).catch(() => [] as string[]);
  const recommended = RECOMMENDED[s.provider].map(r => r.id).find(id => id !== s.model && available.includes(id));
  return recommended ?? available.find(id => id !== s.model);
}

function pullOllamaModel(model: string): void {
  if (!/^[\w.:/-]+$/.test(model)) {
    vscode.window.showErrorMessage(`AI Git Pilot: "${model}" does not look like an Ollama model name.`);
    return;
  }
  const terminal = vscode.window.createTerminal('Ollama');
  terminal.show();
  terminal.sendText(`ollama pull ${model}`);
}

async function showProblem(err: unknown, s: ProviderSettings): Promise<void> {
  if (!(err instanceof ProviderError)) {
    vscode.window.showErrorMessage(`AI Git Pilot: ${errText(err)}`);
    return;
  }
  const label = PROVIDER_LABEL[s.provider];
  let text = err.message;
  const actions: string[] = [];
  switch (err.kind) {
    case 'unreachable':
      if (s.provider === 'ollama') { text = `Cannot reach Ollama at ${s.ollamaUrl}. Start the Ollama app or run "ollama serve".`; }
      actions.push('Setup Provider');
      break;
    case 'model':
      if (s.provider === 'ollama') {
        text = `Ollama does not have the model "${s.model}" yet.`;
        actions.push('Pull Model');
      }
      actions.push('Choose Model');
      break;
    case 'auth':
      actions.push('Set API Key');
      break;
    case 'rateLimit':
      text = `${err.message} Try again later, or switch provider.`;
      actions.push('Switch Provider');
      break;
    case 'timeout':
      text = `${label} did not answer within 2 minutes.`
        + (s.provider === 'ollama' ? ' The first run loads the model and can be slow; try again.' : '');
      break;
  }
  const action = await vscode.window.showErrorMessage(`AI Git Pilot: ${text}`, ...actions);
  if (action === 'Pull Model') { pullOllamaModel(s.model); }
  else if (action === 'Choose Model' || action === 'Set API Key') { void runSetup(s.provider); }
  else if (action) { void runSetup(); }
}

// ── setup wizard ──────────────────────────────────────────────────────────────

const PROVIDER_ITEMS: { label: string; description: string; value: ProviderId }[] = [
  { label: '$(vm) Ollama', description: 'Free, private, unlimited. Runs on your machine', value: 'ollama' },
  { label: '$(zap) Groq', description: 'Free cloud API with daily limits. Very fast', value: 'groq' },
  { label: '$(globe) Google Gemini', description: 'Free cloud API with daily limits', value: 'gemini' },
  { label: '$(link) OpenRouter', description: 'Free models from many labs', value: 'openrouter' },
];

const KEY_URL: Record<KeyedProvider, string> = {
  groq: 'https://console.groq.com/keys',
  gemini: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/keys',
};

const RECOMMENDED: Record<ProviderId, { id: string; note: string }[]> = {
  ollama: [
    { id: 'qwen2.5-coder:7b', note: 'Recommended: code-tuned, about 8 GB RAM' },
    { id: 'llama3.2:3b', note: 'Smallest: works with 4 GB RAM' },
    { id: 'llama3.1:8b', note: 'General purpose' },
    { id: 'codellama:7b', note: 'Meta code model' },
  ],
  groq: [
    { id: 'openai/gpt-oss-20b', note: 'Recommended: fast, clean output' },
    { id: 'openai/gpt-oss-120b', note: 'Larger, a little slower' },
    { id: 'qwen/qwen3.8-27b', note: 'Fastest' },
  ],
  gemini: [{ id: 'gemini-flash-latest', note: 'Recommended: always the newest Flash model' }],
  openrouter: [{ id: 'openrouter/free', note: 'Recommended: routes to a free model that is up' }],
};

/** Asks for a key unless the user keeps the saved one. Returns false when cancelled. */
async function askApiKey(p: KeyedProvider): Promise<boolean> {
  const label = PROVIDER_LABEL[p];
  const existing = await getApiKey(p);
  const host = new URL(KEY_URL[p]).host;
  const choice = await vscode.window.showQuickPick([
    ...(existing ? [{ label: '$(check) Keep the saved key', description: `ends in …${existing.slice(-4)}`, action: 'keep' }] : []),
    { label: '$(key) Paste a key', description: '', action: 'paste' },
    { label: `$(link-external) Get a free key at ${host}`, description: 'opens the browser, then asks for the key', action: 'open' },
  ], { title: `AI Git Pilot: ${label} API Key`, ignoreFocusOut: true });
  if (!choice) { return false; }
  if (choice.action === 'keep') { return true; }
  if (choice.action === 'open') { await vscode.env.openExternal(vscode.Uri.parse(KEY_URL[p])); }
  const key = await vscode.window.showInputBox({
    title: `AI Git Pilot: ${label} API Key`,
    prompt: `Paste your ${label} API key. It is kept in VS Code's secret storage.`,
    password: true,
    ignoreFocusOut: true,
    validateInput: v => v.trim() ? undefined : 'Paste a key, or press Escape to cancel.',
  });
  if (!key) { return false; }
  await storeApiKey(p, key.trim());
  return true;
}

interface ModelItem extends vscode.QuickPickItem { model?: string; custom?: boolean }

async function pickModel(p: ProviderId): Promise<{ model: string; installed: boolean } | undefined> {
  const s = await providerSettings(p);
  const label = PROVIDER_LABEL[p];
  let available: string[] | undefined;

  const items = (async (): Promise<ModelItem[]> => {
    let failure = '';
    try { available = await listModels(s); } catch (err) { failure = errText(err); }
    const out: ModelItem[] = [];
    const seen = new Set<string>();
    const add = (id: string, note: string) => {
      if (seen.has(id)) { return; }
      seen.add(id);
      out.push({ label: id === s.model ? `$(check) ${id}` : id, description: note, model: id });
    };
    const separator = (text: string) => out.push({ label: text, kind: vscode.QuickPickItemKind.Separator });
    const noteFor = (id: string) => RECOMMENDED[p].find(r => r.id === id)?.note ?? '';

    if (failure) { separator(`Could not load the ${label} model list: ${failure}`); }
    if (p === 'ollama' && available) {
      if (available.length) { separator('Installed'); }
      available.forEach(id => add(id, noteFor(id)));
      const missing = RECOMMENDED.ollama.filter(r => !available!.includes(r.id));
      if (missing.length) { separator('Not pulled yet'); }
      missing.forEach(r => add(r.id, `${r.note} (needs ollama pull)`));
    } else {
      RECOMMENDED[p].forEach(r => add(r.id, r.note));
      if (available?.length) { separator('All models'); }
      available?.forEach(id => add(id, ''));
    }
    if (!seen.has(s.model)) { out.unshift({ label: `$(check) ${s.model}`, description: 'current', model: s.model }); }
    separator('');
    out.push({ label: '$(edit) Enter a model id…', custom: true });
    return out;
  })();

  const choice = await vscode.window.showQuickPick(items, {
    title: `AI Git Pilot: ${label} Model`,
    placeHolder: `Current: ${s.model}`,
    matchOnDescription: true,
    ignoreFocusOut: true,
  });
  if (!choice) { return undefined; }
  let model = choice.model;
  if (choice.custom) {
    model = (await vscode.window.showInputBox({
      title: `AI Git Pilot: ${label} Model`,
      prompt: 'Model id, exactly as the provider names it',
      value: s.model,
      ignoreFocusOut: true,
    }))?.trim();
  }
  if (!model) { return undefined; }
  return { model, installed: p !== 'ollama' || !available || available.includes(model) };
}

async function pickStyle(): Promise<string | undefined> {
  const current = cfg<string>('style', 'conventional');
  const choice = await vscode.window.showQuickPick([
    { label: 'conventional', description: 'feat(scope): description. The Conventional Commits standard' },
    { label: 'short', description: 'One short line, no prefix' },
    { label: 'detailed', description: 'Summary line plus a body explaining why' },
  ].map(i => ({ ...i, description: i.label === current ? `${i.description} (current)` : i.description })),
  { title: 'AI Git Pilot: Commit Message Style', ignoreFocusOut: true });
  return choice?.label;
}

/** Full wizard, or from `startAt` (error buttons): key and model only. */
async function runSetup(startAt?: ProviderId): Promise<void> {
  const conf = vscode.workspace.getConfiguration('aigitpilot');
  let provider = startAt;
  if (!provider) {
    const current = currentProvider();
    const choice = await vscode.window.showQuickPick(
      PROVIDER_ITEMS.map(i => ({ ...i, description: i.value === current ? `${i.description} (current)` : i.description })),
      { title: 'AI Git Pilot: Choose AI Provider', placeHolder: 'Select provider', ignoreFocusOut: true });
    if (!choice) { return; }
    provider = choice.value;
  }
  if (provider !== 'ollama' && !(await askApiKey(provider))) { return; }
  const picked = await pickModel(provider);
  if (!picked) { return; }
  const style = startAt ? undefined : await pickStyle();
  if (!startAt && !style) { return; }

  await conf.update('provider', provider, vscode.ConfigurationTarget.Global);
  await conf.update(MODEL_SETTING[provider], picked.model, vscode.ConfigurationTarget.Global);
  if (style) { await conf.update('style', style, vscode.ConfigurationTarget.Global); }
  await ctx.globalState.update('setupDone', true);

  if (!picked.installed) {
    const action = await vscode.window.showInformationMessage(
      `AI Git Pilot: Saved. Ollama still needs to download "${picked.model}".`, 'Pull Model');
    if (action) { pullOllamaModel(picked.model); }
    return;
  }
  await testProvider();
}

/** Sends a tiny request so a bad key or model shows up now, not at the first commit. */
async function testProvider(): Promise<void> {
  const s = await providerSettings();
  const label = PROVIDER_LABEL[s.provider];
  const started = Date.now();
  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `AI Git Pilot: Checking ${label} (${s.model})…`,
      cancellable: true,
    }, (_progress, token) => {
      const abort = new AbortController();
      token.onCancellationRequested(() => abort.abort());
      return complete(s, { system: 'Reply with the single word OK.', user: 'ping' }, abort.signal);
    });
  } catch (err) {
    if (!isCancel(err)) { void showProblem(err, s); }
    return;
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const actions = cfg<boolean>('globalHook', true) && hook.isInstalled() ? [] : ['Install Global Hook'];
  const action = await vscode.window.showInformationMessage(
    `AI Git Pilot: ${label} (${s.model}) answered in ${seconds} s. Click ✨ in Source Control to write a commit message.`, ...actions);
  if (action) { void installHook(true); }
}

// ── global hook ───────────────────────────────────────────────────────────────

/** Writes the settings the hook scripts read, API keys included. */
async function syncHookConfig(): Promise<void> {
  const keyed = Object.keys(KEY_SETTING) as KeyedProvider[];
  const keys = await Promise.all(keyed.map(async p => [KEY_SETTING[p], await getApiKey(p)] as const));
  const prompts = promptSettings();
  hook.writeHookConfig({
    provider: currentProvider(),
    ollamaUrl: cfg<string>('ollamaUrl', 'http://localhost:11434'),
    ...Object.fromEntries(PROVIDERS.map(p => [MODEL_SETTING[p], cfg<string>(MODEL_SETTING[p], DEFAULT_MODEL[p])])),
    ...Object.fromEntries(keys),
    ...prompts,
    maxDiffSize: cfg<number>('maxDiffSize', 8000),
    excludeFiles: cfg<string[]>('excludeFiles', DEFAULT_EXCLUDES),
    matchRepoStyle: cfg<boolean>('matchRepoStyle', true),
    systemPrompt: systemPrompt(prompts),
  }, {
    suggestOnAdd: cfg<boolean>('terminalSuggestOnAdd', true),
    shortcuts: cfg<boolean>('shellShortcuts', true),
  });
}

async function ensureJq(manual: boolean): Promise<boolean> {
  if (await hook.hasJq()) { return true; }
  const warnOnce = async (text: string) => {
    if (!manual && ctx.globalState.get('jqWarned')) { return; }
    await ctx.globalState.update('jqWarned', true);
    vscode.window.showWarningMessage(text);
  };
  if (process.platform !== 'win32') {
    await warnOnce('AI Git Pilot: The terminal hook needs jq. Install it with "brew install jq" or "sudo apt install jq".');
    return false;
  }
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'AI Git Pilot: Downloading jq for the terminal hook…' },
      () => hook.downloadJq());
    return true;
  } catch (err) {
    await warnOnce(`AI Git Pilot: Could not download jq (${errText(err)}). The terminal hook stays off until jq is installed.`);
    return false;
  }
}

/** Points git's global core.hooksPath at our folder, asking first if it points elsewhere. */
async function ensureHooksPath(manual: boolean): Promise<boolean> {
  const current = await hook.getGlobalHooksPath();
  if (hook.isOurHooksPath(current)) {
    await ctx.globalState.update('hooksPathSet', true);
    return true;
  }
  if (!current) {
    // We set it before and it is gone now: the user unset it, so only a manual install sets it again.
    if (!manual && ctx.globalState.get('hooksPathSet')) { return false; }
    await hook.setGlobalHooksPath(hook.HOOKS_DIR);
    await ctx.globalState.update('hooksPathSet', true);
    return true;
  }
  const use = 'Use AI Git Pilot Hooks';
  const takeOver = async () => {
    await ctx.globalState.update('previousHooksPath', current);
    await hook.setGlobalHooksPath(hook.HOOKS_DIR);
    await ctx.globalState.update('hooksPathSet', true);
  };
  if (!manual) {
    // Not awaited: a notification can sit unanswered for the whole session.
    if (ctx.globalState.get('hooksPathConflict') !== current) {
      await ctx.globalState.update('hooksPathConflict', current);
      vscode.window.showWarningMessage(
        `AI Git Pilot: git's global core.hooksPath already points to ${current}, so the AI hook is not active outside VS Code.`, use)
        .then(choice => { if (choice === use) { void takeOver(); } });
    }
    return false;
  }
  const choice = await vscode.window.showWarningMessage(`git's global core.hooksPath already points to ${current}. Point it to ${hook.HOOKS_DIR} instead?`, {
    modal: true,
    detail: `Hooks in ${current} stop running. Each repository's own .git/hooks keep running. Uninstalling AI Git Pilot's hook restores ${current}.`,
  }, use);
  if (choice !== use) { return false; }
  await takeOver();
  return true;
}

/**
 * Installs or refreshes the hook scripts, their config, the shell source line and
 * core.hooksPath. Quiet when run at startup (`manual` false); files are only rewritten
 * when their content changed.
 */
async function installHook(manual: boolean): Promise<void> {
  if (hookBusy) { return; }
  hookBusy = true;
  try {
    if (manual && !cfg<boolean>('globalHook', true)) {
      await vscode.workspace.getConfiguration('aigitpilot').update('globalHook', true, vscode.ConfigurationTarget.Global);
    }
    const jq = await ensureJq(manual);
    const files = hook.installHookFiles(path.join(ctx.extensionPath, 'hooks'));
    await syncHookConfig();
    const rcFiles = hook.addShellSourceLines();
    const active = await ensureHooksPath(manual);

    if (files.skipped.includes('prepare-commit-msg') && (manual || !ctx.globalState.get('foreignHookWarned'))) {
      await ctx.globalState.update('foreignHookWarned', true);
      vscode.window.showWarningMessage(`AI Git Pilot: ${path.join(hook.HOOKS_DIR, 'prepare-commit-msg')} was not written by AI Git Pilot, so it was left alone. The terminal shortcuts still work.`);
    }
    if (manual) {
      if (active) {
        vscode.window.showInformationMessage(`AI Git Pilot: Global hook installed in ${hook.HOOKS_DIR}. Open a new terminal to use the shortcuts.`
          + (jq ? '' : ' The hook needs jq before it can write messages.'));
      }
    } else if ((files.changed.length || rcFiles.length) && !ctx.globalState.get('hookNoticeShown')) {
      await ctx.globalState.update('hookNoticeShown', true);
      vscode.window.showInformationMessage(
        `AI Git Pilot: Installed its git hook and terminal shortcuts in ${hook.HOOKS_DIR}. Your repositories' own hooks keep running.`,
        'Open Manual', 'Uninstall')
        .then(action => {
          if (action === 'Open Manual') { openManual(); }
          else if (action === 'Uninstall') { void uninstallHook(); }
        });
    }
  } catch (err) {
    if (manual) { vscode.window.showErrorMessage(`AI Git Pilot: Could not install the hook: ${errText(err)}`); }
  } finally {
    hookBusy = false;
  }
}

async function uninstallHook(): Promise<void> {
  const choice = await vscode.window.showWarningMessage('Remove AI Git Pilot\'s global git hook and terminal shortcuts?', {
    modal: true,
    detail: `Deletes AI Git Pilot's files in ${hook.HOOKS_DIR} and ${hook.CONFIG_DIR}, removes its line from your shell rc files and restores git's core.hooksPath. Your VS Code settings and saved API keys stay.`,
  }, 'Remove');
  if (choice !== 'Remove') { return; }
  hookBusy = true;
  try {
    await vscode.workspace.getConfiguration('aigitpilot').update('globalHook', false, vscode.ConfigurationTarget.Global);
    if (hook.isOurHooksPath(await hook.getGlobalHooksPath())) {
      await hook.setGlobalHooksPath(ctx.globalState.get<string>('previousHooksPath'));
    }
    const result = hook.removeHookFiles();
    for (const key of ['hooksPathSet', 'previousHooksPath', 'hooksPathConflict', 'hookNoticeShown']) {
      await ctx.globalState.update(key, undefined);
    }
    vscode.window.showInformationMessage('AI Git Pilot: Removed the global hook. Terminals that are already open keep the shortcuts until you close them.'
      + (result.kept.length ? ` Left alone (not written by AI Git Pilot): ${result.kept.join(', ')}.` : ''));
  } catch (err) {
    vscode.window.showErrorMessage(`AI Git Pilot: Could not remove the hook: ${errText(err)}`);
  } finally {
    hookBusy = false;
  }
}

async function onSettingsChanged(e: vscode.ConfigurationChangeEvent): Promise<void> {
  if (!e.affectsConfiguration('aigitpilot')) { return; }
  if (Object.values(KEY_SETTING).some(k => e.affectsConfiguration(`aigitpilot.${k}`))) {
    await migrateKeysToSecrets();
  }
  if (hookBusy) { return; }
  if (e.affectsConfiguration('aigitpilot.globalHook')) {
    if (cfg<boolean>('globalHook', true)) { await installHook(true); return; }
    if (hook.isInstalled()) {
      const action = await vscode.window.showInformationMessage('AI Git Pilot: The global hook will no longer be kept up to date. Remove it now?', 'Uninstall');
      if (action) { await uninstallHook(); }
    }
    return;
  }
  if (cfg<boolean>('globalHook', true) && hook.isInstalled()) { await syncHookConfig(); }
}

// ── activate ──────────────────────────────────────────────────────────────────

function openManual(): void {
  vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.joinPath(ctx.extensionUri, 'MANUAL.md'));
}

async function isConfigured(): Promise<boolean> {
  if (vscode.workspace.getConfiguration('aigitpilot').inspect('provider')?.globalValue !== undefined) { return true; }
  for (const p of Object.keys(KEY_SETTING) as KeyedProvider[]) {
    if (await getApiKey(p)) { return true; }
  }
  return false;
}

async function startup(): Promise<void> {
  const moved = await migrateKeysToSecrets().catch(() => 0);
  if (moved) {
    vscode.window.showInformationMessage(`AI Git Pilot: Moved ${moved === 1 ? 'your API key' : `${moved} API keys`} into VS Code's secret storage, out of plain-text settings.`);
  }
  if (!ctx.globalState.get('setupDone') && !(await isConfigured())) {
    vscode.window.showInformationMessage('AI Git Pilot: Write commit messages with free AI models. Set up a provider?', 'Setup Now', 'Later')
      .then(action => { if (action === 'Setup Now') { void runSetup(); } });
  }
  if (cfg<boolean>('globalHook', true)) { await installHook(false); }
}

export function activate(context: vscode.ExtensionContext): void {
  ctx = context;
  initSecrets(context.secrets);
  context.subscriptions.push(
    vscode.commands.registerCommand('aigitpilot.generate', generateCommitMessage),
    vscode.commands.registerCommand('aigitpilot.setup', () => runSetup()),
    vscode.commands.registerCommand('aigitpilot.installHook', () => installHook(true)),
    vscode.commands.registerCommand('aigitpilot.uninstallHook', uninstallHook),
    vscode.commands.registerCommand('aigitpilot.openManual', openManual),
    vscode.workspace.onDidChangeConfiguration(e => { void onSettingsChanged(e); }),
    context.secrets.onDidChange(e => {
      if (e.key.startsWith('aigitpilot.') && !hookBusy && cfg<boolean>('globalHook', true) && hook.isInstalled()) {
        void syncHookConfig();
      }
    }),
  );
  void startup();
}

export function deactivate(): void { /* nothing */ }
