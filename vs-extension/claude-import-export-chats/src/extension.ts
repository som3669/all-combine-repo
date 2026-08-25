import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChatStore } from './store';
import { ChatTreeProvider, Node, ProjectNode, SessionNode } from './tree';
import { sessionToMarkdown, optsFromConfig } from './render';
import { searchSessions, SearchHit } from './search';
import {
  writeExport,
  importBundle,
  parseBundle,
  defaultBackupDir,
  backupBaseName,
  slug,
} from './bundle';
import { encodeProjectDir, prepareResume, transcriptExistsFor } from './resume';
import { Session } from './model';

const PREVIEW_SCHEME = 'claude-chat';

export function activate(context: vscode.ExtensionContext) {
  const store = new ChatStore();
  const tree = new ChatTreeProvider(store);

  const treeView = vscode.window.createTreeView('claudeChatsExplorer', {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Read-only Markdown previews backed by transcripts.
  const previewProvider = new PreviewProvider(store);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      PREVIEW_SCHEME,
      previewProvider
    )
  );

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    50
  );
  status.command = 'claudeChatsExplorer.focus';
  context.subscriptions.push(status);
  const updateStatus = () => {
    if (!store.exists()) {
      status.hide();
      return;
    }
    const n = store.allSessions().length;
    status.text = `$(comment-discussion) ${n} chat${n === 1 ? '' : 's'}`;
    status.tooltip = 'Claude Chats — click to open the sidebar';
    status.show();
  };
  updateStatus();

  const refresh = () => {
    tree.refresh();
    updateStatus();
  };

  // React to configuration changes (home / backup dir / format).
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeChats')) {
        store.reload();
        refresh();
      }
    })
  );

  const reg = (id: string, fn: (...a: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg('claudeChats.refresh', refresh);

  // ---------- preview / copy ----------
  reg('claudeChats.preview', async (node?: Node) => {
    const s = await pickSessionArg(store, treeView, node);
    if (!s) return;
    const uri = previewUri(s);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.languages.setTextDocumentLanguage(doc, 'markdown');
    await vscode.window.showTextDocument(doc, { preview: true });
    await vscode.commands.executeCommand('markdown.showPreview', uri);
  });

  reg('claudeChats.copyAsMarkdown', async (node?: Node) => {
    const s = await pickSessionArg(store, treeView, node);
    if (!s) return;
    const md = sessionToMarkdown(store, s, optsFromConfig());
    await vscode.env.clipboard.writeText(md);
    vscode.window.showInformationMessage('Conversation copied as Markdown.');
  });

  // ---------- continue ----------
  reg('claudeChats.continueChat', async (node?: Node) => {
    const s = await pickSessionArg(store, treeView, node);
    if (!s) return;
    await continueFlow(store, s, refresh);
  });

  // ---------- export ----------
  reg('claudeChats.exportSession', (node?: Node) =>
    exportFlow(store, treeView, node, 'session', refresh)
  );
  reg('claudeChats.exportProject', (node?: Node) =>
    exportFlow(store, treeView, node, 'project', refresh)
  );
  reg('claudeChats.exportAll', () =>
    exportFlow(store, treeView, undefined, 'all', refresh)
  );

  // ---------- import / backup / restore ----------
  reg('claudeChats.import', async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Import',
      filters: { 'Claude Chats bundle': ['json'] },
      defaultUri: safeDefaultUri(),
    });
    if (picked && picked[0]) await doImport(store, picked[0].fsPath, refresh);
  });

  reg('claudeChats.backupAll', async () => {
    const sessions = store.allSessions();
    if (!sessions.length) {
      vscode.window.showInformationMessage('No conversations to back up.');
      return;
    }
    const dir = defaultBackupDir(store);
    try {
      const primary = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Backing up Claude conversations…' },
        async () => writeExport(store, sessions, dir, 'bundle', backupBaseName())
      );
      const open = 'Reveal';
      const choice = await vscode.window.showInformationMessage(
        `Backed up ${sessions.length} conversations.`,
        open
      );
      if (choice === open)
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(primary));
    } catch (err: any) {
      vscode.window.showErrorMessage(`Backup failed: ${err.message ?? err}`);
    }
  });

  reg('claudeChats.restoreBackup', async () => {
    const dir = defaultBackupDir(store);
    let files: string[] = [];
    try {
      files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(dir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    } catch {
      /* no backup dir yet */
    }
    let chosen: string | undefined;
    if (files.length) {
      const items = files.map((f) => ({
        label: path.basename(f),
        description: new Date(fs.statSync(f).mtimeMs).toLocaleString(),
        f,
      }));
      items.push({ label: '$(folder-opened) Browse…', description: '', f: '' });
      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Choose a backup to restore',
      });
      if (!pick) return;
      chosen = pick.f || undefined;
    }
    if (!chosen) {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Restore',
        filters: { 'Claude Chats bundle': ['json'] },
        defaultUri: files.length ? vscode.Uri.file(dir) : safeDefaultUri(),
      });
      chosen = picked?.[0]?.fsPath;
    }
    if (chosen) await doImport(store, chosen, refresh);
  });

  // ---------- search ----------
  reg('claudeChats.search', () => searchFlow(store, previewProvider));

  // ---------- organize ----------
  reg('claudeChats.toggleFavorite', async (node?: Node) => {
    const s = await pickSessionArg(store, treeView, node);
    if (!s) return;
    const cur = store.meta.get(s.sessionId);
    store.meta.update(s.sessionId, { favorite: !cur.favorite });
    refresh();
  });

  reg('claudeChats.rename', async (node?: Node) => {
    const s = await pickSessionArg(store, treeView, node);
    if (!s) return;
    const value = await vscode.window.showInputBox({
      prompt: 'Custom title for this conversation (leave empty to reset)',
      value: s.meta.customTitle ?? s.title,
    });
    if (value === undefined) return;
    store.meta.update(s.sessionId, { customTitle: value.trim() || undefined });
    refresh();
  });

  reg('claudeChats.editTags', async (node?: Node) => {
    const s = await pickSessionArg(store, treeView, node);
    if (!s) return;
    const value = await vscode.window.showInputBox({
      prompt: 'Comma-separated tags',
      value: (s.meta.tags ?? []).join(', '),
      placeHolder: 'e.g. bug, frontend, important',
    });
    if (value === undefined) return;
    const tags = value
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);
    store.meta.update(s.sessionId, { tags });
    refresh();
  });

  reg('claudeChats.revealTranscript', async (node?: Node) => {
    const s = await pickSessionArg(store, treeView, node);
    if (!s) return;
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(s.file));
  });

  reg('claudeChats.setClaudeHome', async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Use this .claude folder',
      defaultUri: safeDefaultUri(),
    });
    if (!picked || !picked[0]) return;
    await vscode.workspace
      .getConfiguration('claudeChats')
      .update('claudeHome', picked[0].fsPath, vscode.ConfigurationTarget.Global);
    // onDidChangeConfiguration handles reload+refresh.
  });
}

export function deactivate() {}

// ---------------- helpers ----------------

/**
 * A guaranteed-existing folder to open file dialogs at, so they never land on
 * a stale/unavailable location (e.g. a Downloads folder redirected to a drive
 * that is no longer connected). Prefers the open workspace, then the home
 * directory, then the OS temp dir.
 */
function safeDefaultUri(): vscode.Uri | undefined {
  const candidates = [
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    os.homedir(),
    os.tmpdir(),
  ];
  for (const c of candidates) {
    try {
      if (c && fs.statSync(c).isDirectory()) return vscode.Uri.file(c);
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function previewUri(s: Session): vscode.Uri {
  return vscode.Uri.from({
    scheme: PREVIEW_SCHEME,
    path: `/${slug(s.title)}.md`,
    query: s.sessionId,
  });
}

class PreviewProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;
  constructor(private store: ChatStore) {}
  provideTextDocumentContent(uri: vscode.Uri): string {
    const s = this.store.findSession(uri.query);
    if (!s) return `# Conversation not found\n\n\`${uri.query}\``;
    return sessionToMarkdown(this.store, s, optsFromConfig());
  }
}

async function pickSessionArg(
  store: ChatStore,
  view: vscode.TreeView<Node>,
  node?: Node
): Promise<Session | undefined> {
  if (node instanceof SessionNode) return node.session;
  const sel = view.selection.find((n) => n instanceof SessionNode) as
    | SessionNode
    | undefined;
  if (sel) return sel.session;
  // Fall back to a picker (e.g. invoked from the command palette).
  return quickPickSession(store);
}

async function quickPickSession(store: ChatStore): Promise<Session | undefined> {
  const sessions = store.allSessions().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!sessions.length) {
    vscode.window.showInformationMessage('No Claude conversations found.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    sessions.map((s) => ({
      label: s.title,
      description: `${path.basename(s.cwd)} · ${s.messageCount} msg`,
      s,
    })),
    { placeHolder: 'Select a conversation', matchOnDescription: true }
  );
  return pick?.s;
}

async function exportFlow(
  store: ChatStore,
  view: vscode.TreeView<Node>,
  node: Node | undefined,
  scope: 'session' | 'project' | 'all',
  refresh: () => void
): Promise<void> {
  let sessions: Session[] = [];
  let baseName = 'claude-chats';

  if (scope === 'all') {
    sessions = store.allSessions();
    baseName = 'claude-chats-all';
  } else if (scope === 'project') {
    const p =
      node instanceof ProjectNode
        ? node.project
        : undefined;
    if (!p) {
      vscode.window.showInformationMessage('Select a project to export.');
      return;
    }
    sessions = p.sessions;
    baseName = `claude-chats-${slug(p.label)}`;
  } else {
    const s = await pickSessionArg(store, view, node);
    if (!s) return;
    sessions = [s];
    baseName = `claude-chat-${slug(s.title)}`;
  }

  if (!sessions.length) {
    vscode.window.showInformationMessage('Nothing to export.');
    return;
  }

  const format = vscode.workspace
    .getConfiguration('claudeChats')
    .get<'bundle' | 'markdown' | 'both'>('exportFormat', 'bundle');

  // Download straight to a known-good folder — no native folder browser, which
  // on Windows can fail if the remembered location (e.g. Downloads) points at a
  // disconnected drive. The user can still choose another folder afterwards.
  const destDir = resolveDownloadDir(store);
  try {
    const primary = writeExport(store, sessions, destDir, format, baseName);
    const count = sessions.length;
    const reveal = 'Reveal';
    const change = 'Change folder…';
    const choice = await vscode.window.showInformationMessage(
      `Downloaded ${count} conversation${count === 1 ? '' : 's'} to ${destDir}`,
      reveal,
      change
    );
    if (choice === reveal) {
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(primary));
    } else if (choice === change) {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Download here',
        defaultUri: vscode.Uri.file(destDir),
      });
      if (picked && picked[0]) {
        const p2 = writeExport(store, sessions, picked[0].fsPath, format, baseName);
        await vscode.workspace
          .getConfiguration('claudeChats')
          .update('downloadDir', picked[0].fsPath, vscode.ConfigurationTarget.Global);
        const c2 = await vscode.window.showInformationMessage(
          `Downloaded to ${picked[0].fsPath}`,
          reveal
        );
        if (c2 === reveal)
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(p2));
      }
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Download failed: ${err.message ?? err}`);
  }
  refresh();
}

/**
 * Folder that downloads/exports are written to. Uses the configured
 * `claudeChats.downloadDir` when set and valid, otherwise a guaranteed-existing
 * `<Claude home>/downloads` folder. Never returns an unavailable path.
 */
function resolveDownloadDir(store: ChatStore): string {
  const configured = vscode.workspace
    .getConfiguration('claudeChats')
    .get<string>('downloadDir');
  if (configured && configured.trim()) {
    try {
      fs.mkdirSync(configured.trim(), { recursive: true });
      return configured.trim();
    } catch {
      /* fall through to default */
    }
  }
  const fallback = path.join(store.claudeHome, 'downloads');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

/**
 * Continue an existing conversation in Claude Code.
 *
 * `claude --resume <id>` only sees transcripts stored under the project folder
 * encoded from the current working directory, so an imported conversation
 * (whose paths come from another machine) is copied and rewritten for the
 * folder chosen here before the CLI is launched.
 */
async function continueFlow(
  store: ChatStore,
  session: Session,
  refresh: () => void
): Promise<void> {
  const targetCwd = await pickWorkingFolder(session);
  if (!targetCwd) return;

  const willCopy = encodeProjectDir(targetCwd) !== session.projectDir;
  let newId = false;
  if (willCopy && transcriptExistsFor(store, targetCwd, session.sessionId)) {
    const reuse = 'Continue that copy';
    const fresh = 'Make a separate copy';
    const choice = await vscode.window.showQuickPick([reuse, fresh], {
      placeHolder: 'This conversation was already prepared for that folder',
    });
    if (!choice) return;
    newId = choice === fresh;
  }

  let prepared;
  try {
    prepared = prepareResume(store, session, targetCwd, { newId });
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `Could not prepare the conversation: ${err.message ?? err}`
    );
    return;
  }

  const cli =
    vscode.workspace
      .getConfiguration('claudeChats')
      .get<string>('claudeCommand', 'claude')
      ?.trim() || 'claude';

  const term = vscode.window.createTerminal({
    name: `Claude — ${session.title.slice(0, 40)}`,
    cwd: targetCwd,
  });
  term.show();
  term.sendText(`${cli} --resume ${prepared.sessionId}`);

  if (prepared.relocated) {
    vscode.window.showInformationMessage(
      `Conversation prepared for ${targetCwd} and resumed in the terminal.`
    );
    refresh();
  }
}

/** Choose the folder the conversation should continue in. */
async function pickWorkingFolder(session: Session): Promise<string | undefined> {
  interface Item extends vscode.QuickPickItem {
    dir?: string;
    browse?: boolean;
  }
  const items: Item[] = [];
  const seen = new Set<string>();
  const add = (dir: string, label: string, description: string) => {
    const key = path.resolve(dir).toLowerCase();
    if (seen.has(key)) return;
    try {
      if (!fs.statSync(dir).isDirectory()) return;
    } catch {
      return;
    }
    seen.add(key);
    items.push({ label, description, detail: dir, dir });
  };

  add(session.cwd, '$(history) Original folder', 'where the chat was recorded');
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    add(f.uri.fsPath, `$(root-folder) ${f.name}`, 'open workspace folder');
  }
  items.push({ label: '$(folder-opened) Browse…', description: 'pick another folder', browse: true });

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Continue this conversation in which folder?',
    matchOnDetail: true,
  });
  if (!pick) return undefined;
  if (!pick.browse) return pick.dir;

  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Continue here',
    defaultUri: safeDefaultUri(),
  });
  return picked?.[0]?.fsPath;
}

async function doImport(
  store: ChatStore,
  file: string,
  refresh: () => void
): Promise<void> {
  let bundle;
  try {
    bundle = parseBundle(fs.readFileSync(file, 'utf8'));
  } catch (err: any) {
    vscode.window.showErrorMessage(`Import failed: ${err.message ?? err}`);
    return;
  }
  const count = bundle.sessions.length;
  const overwriteLabel = 'Import & overwrite existing';
  const keepLabel = 'Import new only';
  const choice = await vscode.window.showWarningMessage(
    `Import ${count} conversation${count === 1 ? '' : 's'} from "${path.basename(file)}"? ` +
      `Source machine: ${bundle.sourceMachine}.`,
    { modal: true },
    keepLabel,
    overwriteLabel
  );
  if (choice !== keepLabel && choice !== overwriteLabel) return;

  let res;
  try {
    res = importBundle(store, bundle, choice === overwriteLabel);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Import failed: ${err.message ?? err}`);
    refresh();
    return;
  }
  refresh();

  const ids = bundle.sessions.map((s) => s.sessionId);
  const continueLabel = 'Continue a conversation';
  const picked = await vscode.window.showInformationMessage(
    `Imported ${res.imported} new, overwrote ${res.overwritten}, skipped ${res.skipped}.`,
    continueLabel
  );
  if (picked !== continueLabel) return;

  const imported = ids
    .map((id) => store.findSession(id))
    .filter((s): s is Session => !!s)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!imported.length) return;

  const sel =
    imported.length === 1
      ? imported[0]
      : (
          await vscode.window.showQuickPick(
            imported.map((s) => ({
              label: s.title,
              description: `${path.basename(s.cwd)} · ${s.messageCount} msg`,
              s,
            })),
            { placeHolder: 'Select an imported conversation to continue', matchOnDescription: true }
          )
        )?.s;
  if (sel) await continueFlow(store, sel, refresh);
}

async function searchFlow(
  store: ChatStore,
  previewProvider: PreviewProvider
): Promise<void> {
  const term = await vscode.window.showInputBox({
    prompt: 'Search across all Claude conversations',
    placeHolder: 'Text to find (prefix with /re/ for regex)',
  });
  if (!term) return;

  let regex = false;
  let text = term;
  const m = /^\/(.*)\/$/.exec(term);
  if (m) {
    regex = true;
    text = m[1];
  }

  const hits = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Searching conversations…' },
    async () => searchSessions(store, { text, regex, caseSensitive: false })
  );

  if (!hits.length) {
    vscode.window.showInformationMessage(`No matches for "${term}".`);
    return;
  }

  const items = hits.map((h: SearchHit) => ({
    label: `$(${h.role === 'user' ? 'account' : 'hubot'}) ${h.snippet}`,
    description: h.session.title,
    detail: `${path.basename(h.session.cwd)} · ${h.timestamp ? new Date(h.timestamp).toLocaleString() : ''}`,
    h,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `${hits.length} match${hits.length === 1 ? '' : 'es'} — select to open`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!pick) return;

  const uri = previewUri(pick.h.session);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.languages.setTextDocumentLanguage(doc, 'markdown');
  await vscode.commands.executeCommand('markdown.showPreview', uri);
}
