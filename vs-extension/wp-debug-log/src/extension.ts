import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface LogEntry {
  timestamp: string;
  type: 'fatal' | 'warning' | 'notice' | 'deprecated' | 'parse' | 'info';
  message: string;
  file: string;
  line: string;
  stack: string[];
  raw: string;
}

const LOG_HEADER = /^\[([^\]]+)\] PHP (Fatal error|Warning|Notice|Deprecated|Parse error|Strict Standards|Fatal):\s*/i;
const FILE_SUFFIX = /\s+in\s+((?:[A-Za-z]:[\\\/]|\.{0,2}\/)\S.*?)(?:\s+on\s+line\s+|:)(\d+)\s*$/i;
const BARE_RE = /^(Uncaught \S+|Fatal error|Warning|Notice|Deprecated|Parse error):\s*(.+?)\s+in\s+((?:[A-Za-z]:[\\\/]|\.{0,2}\/)\S.*?)(?:\s+on\s+line\s+|:)(\d+)\s*$/i;

function parseType(t: string): LogEntry['type'] {
  const l = t.toLowerCase();
  if (l.includes('fatal'))      { return 'fatal'; }
  if (l.includes('warning'))    { return 'warning'; }
  if (l.includes('notice'))     { return 'notice'; }
  if (l.includes('deprecated')) { return 'deprecated'; }
  if (l.includes('parse'))      { return 'parse'; }
  return 'info';
}

function parseLog(content: string): LogEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: LogEntry[] = [];
  let current: LogEntry | null = null;

  for (const line of lines) {
    if (!line.trim()) { continue; }
    const h = LOG_HEADER.exec(line);
    if (h) {
      if (current) { entries.push(current); }
      const rest = line.slice(h[0].length);
      const fm = FILE_SUFFIX.exec(rest);
      const msgBody = fm ? rest.slice(0, fm.index).trim() : rest.trim();
      current = {
        timestamp: h[1],
        type: parseType(h[2]),
        message: `PHP ${h[2]}: ${msgBody}`,
        file: fm ? fm[1] : '',
        line: fm ? fm[2] : '',
        stack: [],
        raw: line,
      };
    } else {
      const b = BARE_RE.exec(line);
      if (b) {
        if (current) { entries.push(current); }
        current = { timestamp: '', type: parseType(b[1]), message: b[2], file: b[3] || '', line: b[4] || '', stack: [], raw: line };
      } else if (current && (line.startsWith('Stack trace:') || line.match(/^#\d+/) || line.startsWith('  thrown'))) {
        current.stack.push(line);
      } else if (line.startsWith('[')) {
        if (current) { entries.push(current); }
        current = { timestamp: '', type: 'info', message: line, file: '', line: '', stack: [], raw: line };
      }
    }
  }
  if (current) { entries.push(current); }

  const TYPE_RE = /PHP (Fatal error|Warning|Notice|Deprecated|Parse error|Strict Standards|Fatal):/i;
  for (const e of entries) {
    if (e.type === 'info') {
      const tm = TYPE_RE.exec(e.raw);
      if (tm) { e.type = parseType(tm[1]); }
    }
  }

  return entries;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  const idx = parts.lastIndexOf('wp-content');
  return idx >= 0 ? parts.slice(idx).join('/') : parts.slice(-3).join('/');
}

function getPlaceholderHtml(): string {
  return `<!DOCTYPE html><html><body style="padding:20px;color:var(--vscode-descriptionForeground);font-family:var(--vscode-editor-font-family,sans-serif)">
    <p>No debug.log found. Open a WordPress project or use <b>WP Debug Log: Open Viewer</b> to select a file.</p>
  </body></html>`;
}

function getWebviewContent(entries: LogEntry[], logPath: string, mode: 'sidebar' | 'panel' = 'sidebar'): string {
  const rows = entries.map((e) => {
    const fileLink = e.file
      ? ` <a class="filelink" data-file="${e.file}" data-line="${e.line}">${shortPath(e.file)}:${e.line}</a>`
      : '';
    const stack = e.stack.length
      ? `<div class="stack">${e.stack.map(s => escHtml(s)).join('<br>')}</div>`
      : '';
    const rawText = escHtml([e.timestamp, e.type.toUpperCase(), e.message, e.file ? `${e.file}:${e.line}` : '', ...e.stack].filter(Boolean).join(' | '));
    return `<tr class="entry ${e.type}" data-type="${e.type}" data-raw="${rawText}">
      <td class="ts">${escHtml(e.timestamp)}</td>
      <td><span class="badge ${e.type}">${e.type.toUpperCase()}</span></td>
      <td class="msg">${escHtml(e.message)}${fileLink}${stack}</td>
      <td class="copy-cell"><button class="row-copy-btn" title="Copy entry">Copy</button></td>
    </tr>`;
  }).join('');

  const count = (t: string) => entries.filter(e => e.type === t).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WP Debug Log</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  #toolbar { padding: 8px 12px; background: var(--vscode-sideBar-background); border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
  #logpath { color: var(--vscode-descriptionForeground); font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { padding: 3px 10px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; cursor: pointer; font-size: 11px; }
  .filter-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .filter-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .filter-btn[data-filter="fatal"]      { border-color: #c0392b; }
  .filter-btn[data-filter="warning"]    { border-color: #e67e22; }
  .filter-btn[data-filter="notice"]     { border-color: #2980b9; }
  .filter-btn[data-filter="deprecated"] { border-color: #8e44ad; }
  .cnt-badge { display:inline-block; padding:0 5px; border-radius:8px; font-size:10px; font-weight:bold; margin-left:4px; background:rgba(255,255,255,0.15); }
  #clearBtn { background: #c0392b; color: #fff; border-color: #922b21; }
  #popOutBtn, #popInBtn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  #scrollBtn, #copyBtn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  #searchBox { padding: 3px 8px; border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-size: 11px; width: 160px; }
  #table-wrap { flex: 1; overflow-y: auto; }
  table { width: 100%; border-collapse: collapse; }
  tr.entry { border-bottom: 1px solid var(--vscode-panel-border); }
  tr.entry:hover { background: var(--vscode-list-hoverBackground); }
  tr.entry.hidden { display: none; }
  td { padding: 5px 8px; vertical-align: top; }
  .ts { white-space: nowrap; color: var(--vscode-descriptionForeground); width: 180px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; white-space: nowrap; }
  .badge.fatal, .badge.parse { background: #c0392b; color: #fff; }
  .badge.warning { background: #e67e22; color: #fff; }
  .badge.notice { background: #2980b9; color: #fff; }
  .badge.deprecated { background: #8e44ad; color: #fff; }
  .badge.info { background: #555; color: #fff; }
  .msg { word-break: break-word; max-width: 600px; }
  .stack { margin-top: 4px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  a.filelink { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: underline; font-size: 11px; }
  .copy-cell { width: 44px; padding: 0 4px; vertical-align: middle; text-align: center; }
  .row-copy-btn { padding: 2px 6px; font-size: 10px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; cursor: pointer; line-height: 1; visibility: hidden; }
  tr.entry:hover .row-copy-btn { visibility: visible; }
  #empty { padding: 40px; text-align: center; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<div id="toolbar">
  <span id="logpath">${escHtml(logPath)}</span>
  <button class="filter-btn active" data-filter="all">All <span class="cnt-badge">${entries.length}</span></button>
  <button class="filter-btn" data-filter="fatal">Fatal <span class="cnt-badge">${count('fatal') + count('parse')}</span></button>
  <button class="filter-btn" data-filter="warning">Warning <span class="cnt-badge">${count('warning')}</span></button>
  <button class="filter-btn" data-filter="notice">Notice <span class="cnt-badge">${count('notice')}</span></button>
  <button class="filter-btn" data-filter="deprecated">Deprecated <span class="cnt-badge">${count('deprecated')}</span></button>
  <button class="filter-btn" data-filter="info">Info <span class="cnt-badge">${count('info')}</span></button>
  ${mode === 'sidebar' ? '<button id="popOutBtn" title="Open in separate window">&#x2197; Pop Out</button>' : '<button id="popInBtn" title="Move back to sidebar">&#x2199; Pop In</button>'}
  <button id="scrollBtn">Auto-scroll</button>
  <button id="copyBtn">Copy All</button>
  <button id="clearBtn">Clear Log</button>
  <input id="searchBox" type="text" placeholder="Search logs…">
</div>
<div id="table-wrap">
  ${entries.length === 0
    ? '<div id="empty">No entries in debug.log</div>'
    : `<table><tbody id="tbody">${rows}</tbody></table>`}
</div>
<script>
  const vscode = acquireVsCodeApi();
  let autoScroll = true;

  const wrap = document.getElementById('table-wrap');
  if (wrap) { wrap.scrollTop = wrap.scrollHeight; }

  var currentFilter = 'all';
  var currentSearch = '';

  function applyFilters() {
    document.querySelectorAll('tr.entry').forEach(function(row) {
      var t = row.getAttribute('data-type');
      var text = row.textContent.toLowerCase();
      var filterMatch = (currentFilter === 'all' || t === currentFilter || (currentFilter === 'fatal' && t === 'parse'));
      var searchMatch = (currentSearch === '' || text.indexOf(currentSearch) !== -1);
      row.style.display = (filterMatch && searchMatch) ? '' : 'none';
    });
  }

  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var filter = btn.getAttribute('data-filter');
      if (!filter) { return; }
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      applyFilters();
    });
  });

  var searchBox = document.getElementById('searchBox');
  if (searchBox) { searchBox.addEventListener('input', function() {
    currentSearch = searchBox.value.toLowerCase();
    applyFilters();
  }); }

var clearBtn = document.getElementById('clearBtn');
  if (clearBtn) { clearBtn.addEventListener('click', function() {
    clearBtn.textContent = 'Clearing...';
    clearBtn.disabled = true;
    vscode.postMessage({ command: 'clear' });
  }); }

  var scrollBtn = document.getElementById('scrollBtn');
  if (scrollBtn) { scrollBtn.addEventListener('click', function() {
    autoScroll = !autoScroll;
    scrollBtn.textContent = autoScroll ? 'Auto-scroll' : 'Auto-scroll (off)';
    scrollBtn.style.opacity = autoScroll ? '1' : '0.5';
  }); }

  var copyBtn = document.getElementById('copyBtn');
  if (copyBtn) { copyBtn.addEventListener('click', function() {
    var allRows = document.querySelectorAll('tr.entry');
    var lines = [];
    for (var i = 0; i < allRows.length; i++) {
      var cells = allRows[i].querySelectorAll('td');
      var parts = [];
      for (var j = 0; j < cells.length; j++) { parts.push(cells[j].textContent.trim()); }
      lines.push(parts.join(' | '));
    }
    vscode.postMessage({ command: 'copy', text: lines.join('\\n') });
    copyBtn.textContent = 'Copied!';
    setTimeout(function() { copyBtn.textContent = 'Copy All'; }, 1500);
  }); }

  var popOutBtn = document.getElementById('popOutBtn');
  if (popOutBtn) { popOutBtn.addEventListener('click', function() {
    vscode.postMessage({ command: 'popOut' });
  }); }

  var popInBtn = document.getElementById('popInBtn');
  if (popInBtn) { popInBtn.addEventListener('click', function() {
    vscode.postMessage({ command: 'popIn' });
  }); }

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      var sb = document.getElementById('searchBox');
      if (sb) { sb.focus(); sb.select(); }
    }
  });

  document.addEventListener('click', function(e) {
    var copyRowBtn = e.target.closest('.row-copy-btn');
    if (copyRowBtn) {
      var row = copyRowBtn.closest('tr.entry');
      if (row) {
        vscode.postMessage({ command: 'copy', text: row.getAttribute('data-raw') || '' });
        copyRowBtn.textContent = '✓';
        setTimeout(function() { copyRowBtn.textContent = 'Copy'; }, 1500);
      }
      return;
    }
    var el = e.target.closest('.filelink');
    if (el) {
      e.preventDefault();
      vscode.postMessage({ command: 'openFile', file: el.dataset.file, line: el.dataset.line });
    }
  });
</script>
</body>
</html>`;
}

class WpDebugLogProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'wpDebugLog.view';

  private _view?: vscode.WebviewView;
  private _entries: LogEntry[] = [];
  private _logPath = '';
  private _context: vscode.ExtensionContext;

  constructor(ctx: vscode.ExtensionContext) {
    this._context = ctx;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _resolveContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._logPath
      ? getWebviewContent(this._entries, this._logPath, 'sidebar')
      : getPlaceholderHtml();

    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg.command === 'clear' && this._logPath) {
        fs.writeFileSync(this._logPath, '');
        this._entries = [];
        webviewView.webview.html = getWebviewContent([], this._logPath, 'sidebar');
      }
      if (msg.command === 'copy') {
        vscode.env.clipboard.writeText(msg.text);
      }
      if (msg.command === 'openFile') {
        const lineNum = parseInt(msg.line || '1', 10) - 1;
        const uri = vscode.Uri.file(msg.file);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.One,
          selection: new vscode.Range(lineNum, 0, lineNum, 0),
        });
      }
      if (msg.command === 'popOut') {
        vscode.commands.executeCommand('wpDebugLog.popOut');
      }
    }, undefined, this._context.subscriptions);
  }

  update(entries: LogEntry[], logPath: string): void {
    this._entries = entries;
    this._logPath = logPath;
    if (this._view) {
      this._view.webview.html = getWebviewContent(entries, logPath, 'sidebar');
    }
  }

  focus(): void {
    if (this._view) {
      this._view.show(true);
    }
  }
}

async function findDebugLog(): Promise<string | undefined> {
  const uris = await vscode.workspace.findFiles('**/wp-content/debug.log', '**/node_modules/**', 1);
  return uris.length ? uris[0].fsPath : undefined;
}

const DEBUG_BLOCK = `
define( 'WP_DEBUG', true );

define( 'WP_DEBUG_LOG', true );

// Disable display of errors and warnings
define( 'WP_DEBUG_DISPLAY', false );
@ini_set( 'display_errors', 0 );
`;

async function checkWpConfig(): Promise<void> {
  const uris = await vscode.workspace.findFiles('**/wp-config.php', '**/node_modules/**', 1);
  if (!uris.length) { return; }

  const configPath = uris[0].fsPath;
  const content = fs.readFileSync(configPath, 'utf8');

  const hasDebug    = /define\s*\(\s*['"]WP_DEBUG['"]\s*,\s*true\s*\)/i.test(content);
  const hasDebugLog = /define\s*\(\s*['"]WP_DEBUG_LOG['"]\s*,\s*true\s*\)/i.test(content);

  if (hasDebug && hasDebugLog) { return; }

  const action = await vscode.window.showInformationMessage(
    'WP debug logging is not enabled. Enable it in wp-config.php?',
    'Enable', 'Ignore'
  );

  if (action !== 'Enable') { return; }

  let updated = content;
  const marker = "/* That's all, stop editing!";
  if (updated.includes(marker)) {
    updated = updated.replace(marker, `${DEBUG_BLOCK}\n${marker}`);
  } else {
    updated += `\n${DEBUG_BLOCK}`;
  }

  fs.writeFileSync(configPath, updated, 'utf8');
  vscode.window.showInformationMessage('WP debug logging enabled in wp-config.php.');
}

export function activate(context: vscode.ExtensionContext): void {
  let watcher: fs.FSWatcher | undefined;
  let logPath: string | undefined;
  let currentEntries: LogEntry[] = [];
  let popOutPanel: vscode.WebviewPanel | undefined;

  // Status bar
  const cfg = vscode.workspace.getConfiguration('wpDebugLog');
  const side = cfg.get<string>('statusBarSide', 'left');
  const alignment = side === 'right' ? vscode.StatusBarAlignment.Right : vscode.StatusBarAlignment.Left;
  const priority = side === 'right' ? 1000 : 50;

  const statusBar = vscode.window.createStatusBarItem(alignment, priority);
  statusBar.command = 'wpDebugLog.open';
  statusBar.text = '$(bug) WP Log';
  statusBar.tooltip = 'Open WP Debug Log Viewer';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // View provider
  const provider = new WpDebugLogProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WpDebugLogProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  const updateStatusBar = (entries: LogEntry[]) => {
    const fatals   = entries.filter(e => e.type === 'fatal' || e.type === 'parse').length;
    const warnings = entries.filter(e => e.type === 'warning').length;
    if (fatals > 0) {
      statusBar.text = `$(bug) WP Log $(error) ${fatals}`;
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (warnings > 0) {
      statusBar.text = `$(bug) WP Log $(warning) ${warnings}`;
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusBar.text = '$(bug) WP Log';
      statusBar.backgroundColor = undefined;
    }
  };

  const refreshPanel = (entries: LogEntry[], p: string) => {
    if (popOutPanel) {
      popOutPanel.webview.html = getWebviewContent(entries, p, 'panel');
    }
  };

  const refresh = (targetPath?: string) => {
    const p = targetPath || logPath;
    if (!p || !fs.existsSync(p)) { return; }
    const content = fs.readFileSync(p, 'utf8');
    const entries = parseLog(content);
    currentEntries = entries;
    updateStatusBar(entries);
    provider.update(entries, p);
    refreshPanel(entries, p);
  };

  const open = async (overridePath?: string) => {
    if (overridePath && overridePath !== logPath) {
      logPath = overridePath;
      watcher?.close();
      watcher = fs.watch(logPath, () => refresh());
      refresh();
    } else if (!logPath) {
      let found = await findDebugLog();
      if (!found) {
        const picked = await vscode.window.showOpenDialog({
          filters: { 'Log files': ['log', 'txt'], 'All': ['*'] },
          canSelectMany: false,
          openLabel: 'Open debug.log',
        });
        if (!picked || !picked.length) { return; }
        found = picked[0].fsPath;
      }
      logPath = found;
      watcher?.close();
      watcher = fs.watch(logPath, () => refresh());
      refresh();
    }

    // Focus the view
    vscode.commands.executeCommand(`${WpDebugLogProvider.viewId}.focus`);
  };

  const makePanelMessageHandler = (panel: vscode.WebviewPanel) => async (msg: { command: string; text?: string; file?: string; line?: string }) => {
    if (msg.command === 'clear' && logPath) {
      fs.writeFileSync(logPath, '');
      currentEntries = [];
      panel.webview.html = getWebviewContent([], logPath, 'panel');
      provider.update([], logPath);
    }
    if (msg.command === 'copy') {
      vscode.env.clipboard.writeText(msg.text || '');
    }
    if (msg.command === 'openFile') {
      const lineNum = parseInt(msg.line || '1', 10) - 1;
      const uri = vscode.Uri.file(msg.file || '');
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        selection: new vscode.Range(lineNum, 0, lineNum, 0),
      });
    }
    if (msg.command === 'popIn') {
      panel.dispose();
      vscode.commands.executeCommand(`${WpDebugLogProvider.viewId}.focus`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('wpDebugLog.open', () => open()),
    vscode.commands.registerCommand('wpDebugLog.openManual', () => {
      const uri = vscode.Uri.joinPath(context.extensionUri, 'MANUAL.md');
      vscode.commands.executeCommand('markdown.showPreview', uri);
    }),
    vscode.commands.registerCommand('wpDebugLog.popOut', () => {
      if (popOutPanel) {
        popOutPanel.reveal();
        return;
      }
      popOutPanel = vscode.window.createWebviewPanel(
        'wpDebugLogPanel',
        'WP Debug Log',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      popOutPanel.webview.html = logPath
        ? getWebviewContent(currentEntries, logPath, 'panel')
        : getPlaceholderHtml();
      popOutPanel.webview.onDidReceiveMessage(makePanelMessageHandler(popOutPanel), undefined, context.subscriptions);
      popOutPanel.onDidDispose(() => { popOutPanel = undefined; }, undefined, context.subscriptions);
    }),
  );

  // Auto-load on startup for status bar
  findDebugLog().then(p => {
    if (p) {
      logPath = p;
      watcher?.close();
      watcher = fs.watch(logPath, () => refresh());
      refresh();
    }
  });

  checkWpConfig();

  // Auto-open if debug.log opened in editor
  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor && path.basename(editor.document.uri.fsPath) === 'debug.log') {
      open(editor.document.uri.fsPath);
    }
  }, null, context.subscriptions);
}

export function deactivate(): void { /* nothing */ }
