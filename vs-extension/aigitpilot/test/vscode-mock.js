// A small in-memory stand-in for the `vscode` module, enough to drive the extension.
const Module = require('module');
const path = require('path');

class EventEmitter {
  constructor() { this.listeners = []; this.event = fn => { this.listeners.push(fn); return { dispose() {} }; }; }
  fire(e) { this.listeners.forEach(fn => fn(e)); }
}

class Uri {
  constructor(fsPath) { this.fsPath = fsPath; this.scheme = 'file'; }
  static file(p) { return new Uri(p); }
  static parse(s) { return new Uri(s); }
  static joinPath(base, ...parts) { return new Uri(path.join(base.fsPath, ...parts)); }
}

function createMock() {
  const settings = {};        // global settings: key -> value
  const defaults = {};
  const configEvents = new EventEmitter();
  const secretEvents = new EventEmitter();
  const secretStore = new Map();
  const commands = new Map();
  const messages = [];         // every message shown: { level, text, items }
  const answers = [];          // queued answers for the next message boxes / pickers
  const opened = [];

  const answer = (text, items) => {
    const i = answers.findIndex(a => a.match.test(text));
    if (i < 0) { return undefined; }
    const [a] = answers.splice(i, 1);
    return typeof a.value === 'function' ? a.value(items) : a.value;
  };
  const show = level => (text, ...rest) => {
    const items = rest.filter(r => typeof r === 'string');
    messages.push({ level, text, items });
    return Promise.resolve(answer(text, items));
  };

  const vscode = {
    Uri,
    EventEmitter,
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
    QuickPickItemKind: { Separator: -1, Default: 0 },
    workspace: {
      workspaceFolders: [],
      getConfiguration: () => ({
        get: (key, fallback) => (key in settings ? settings[key] : key in defaults ? defaults[key] : fallback),
        inspect: key => ({ globalValue: settings[key], defaultValue: defaults[key] }),
        update: async (key, value) => {
          if (value === undefined) { delete settings[key]; } else { settings[key] = value; }
          configEvents.fire({ affectsConfiguration: s => s === 'aigitpilot' || s === `aigitpilot.${key}` });
        },
      }),
      onDidChangeConfiguration: configEvents.event,
    },
    window: {
      activeTextEditor: undefined,
      showInformationMessage: show('info'),
      showWarningMessage: show('warning'),
      showErrorMessage: show('error'),
      setStatusBarMessage: text => { messages.push({ level: 'status', text, items: [] }); return { dispose() {} }; },
      showQuickPick: async (items, options) => answer(options?.title ?? '', await items),
      showInputBox: async options => answer(options?.title ?? '', []),
      withProgress: (_options, task) => task({ report() {} }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) }),
      createTerminal: () => ({ show() {}, sendText() {} }),
    },
    commands: {
      registerCommand: (id, fn) => { commands.set(id, fn); return { dispose() {} }; },
      executeCommand: async (id, ...args) => { opened.push([id, ...args]); },
    },
    env: {
      clipboard: { text: '', async writeText(t) { this.text = t; } },
      openExternal: async uri => { opened.push(['openExternal', uri.fsPath]); return true; },
    },
    extensions: { getExtension: () => undefined },
  };

  const pkg = require('../package.json');
  for (const [key, spec] of Object.entries(pkg.contributes.configuration.properties)) {
    defaults[key.replace(/^aigitpilot\./, '')] = spec.default;
  }

  const state = new Map();
  const context = {
    subscriptions: [],
    extensionPath: path.join(__dirname, '..'),
    extensionUri: Uri.file(path.join(__dirname, '..')),
    globalState: { get: k => state.get(k), update: async (k, v) => { if (v === undefined) { state.delete(k); } else { state.set(k, v); } } },
    secrets: {
      get: async k => secretStore.get(k),
      store: async (k, v) => { secretStore.set(k, v); secretEvents.fire({ key: k }); },
      delete: async k => { secretStore.delete(k); secretEvents.fire({ key: k }); },
      onDidChange: secretEvents.event,
    },
  };

  const original = Module._load;
  Module._load = function (request, ...rest) {
    return request === 'vscode' ? vscode : original.call(this, request, ...rest);
  };

  return { vscode, context, settings, secretStore, commands, messages, answers, opened, state };
}

module.exports = { createMock };
