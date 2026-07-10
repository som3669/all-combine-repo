const vscode = require('vscode');

const BUILT_IN_SNIPPETS = [
  `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55`,

  `class Stack {
  constructor() {
    this.items = [];
  }
  push(item) { this.items.push(item); }
  pop() { return this.items.pop(); }
  peek() { return this.items[this.items.length - 1]; }
  isEmpty() { return this.items.length === 0; }
}`,

  `async function fetchData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(\`HTTP \${response.status}\`);
    }
    return await response.json();
  } catch (err) {
    console.error('Fetch failed:', err);
    return null;
  }
}`,

  `const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};`,
];

let loopActive = false;
let stopRequested = false;
let snippetIndex = 0;
let statusBar;
let customSnippet = '';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cfg(key) {
  return vscode.workspace.getConfiguration('autoWrite').get(key);
}

async function typeText(editor, text) {
  const delay = cfg('typeDelayMs');
  for (const char of text) {
    if (stopRequested) return;
    const pos = editor.selection.active;
    await editor.edit(eb => eb.insert(pos, char), { undoStopBefore: false, undoStopAfter: false });
    await sleep(delay);
  }
}

async function eraseAll(editor) {
  const delay = cfg('eraseDelayMs');
  while (true) {
    if (stopRequested) return;
    const doc = editor.document;
    const fullText = doc.getText();
    if (fullText.length === 0) break;
    const end = doc.positionAt(fullText.length);
    const start = doc.positionAt(fullText.length - 1);
    await editor.edit(eb => eb.delete(new vscode.Range(start, end)), { undoStopBefore: false, undoStopAfter: false });
    await sleep(delay);
  }
}

async function runLoop(editor) {
  loopActive = true;
  stopRequested = false;
  statusBar.text = '$(sync~spin) Auto Write: Running';
  statusBar.show();

  while (!stopRequested) {
    const snippet = customSnippet || BUILT_IN_SNIPPETS[snippetIndex % BUILT_IN_SNIPPETS.length];
    if (!customSnippet) snippetIndex++;

    // Move cursor to doc end before typing
    const doc = editor.document;
    const end = doc.positionAt(doc.getText().length);
    editor.selection = new vscode.Selection(end, end);

    await typeText(editor, snippet);
    if (stopRequested) break;

    await sleep(cfg('pauseBetweenLoopsMs'));
    if (stopRequested) break;

    await eraseAll(editor);
    if (stopRequested) break;

    await sleep(cfg('pauseBetweenLoopsMs'));
  }

  // Final cleanup: erase whatever is left
  if (!editor.document.isClosed) {
    const text = editor.document.getText();
    if (text.length > 0) {
      await editor.edit(eb => {
        const all = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(text.length)
        );
        eb.delete(all);
      });
    }
  }

  loopActive = false;
  statusBar.text = '$(circle-slash) Auto Write: Stopped';
  setTimeout(() => statusBar.hide(), 2000);
  vscode.window.showInformationMessage('Auto Write loop stopped.');
}

function activate(context) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'autoWrite.stop';
  statusBar.tooltip = 'Click to stop Auto Write loop';
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('autoWrite.start', async () => {
      if (loopActive) {
        vscode.window.showWarningMessage('Auto Write already running. Use "Auto Write: Stop Loop" to stop.');
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Open a file first.');
        return;
      }

      runLoop(editor);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autoWrite.stop', () => {
      if (!loopActive) {
        vscode.window.showInformationMessage('Auto Write not running.');
        return;
      }
      stopRequested = true;
      statusBar.text = '$(clock) Auto Write: Stopping...';
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autoWrite.setSnippet', async () => {
      const input = await vscode.window.showInputBox({
        prompt: 'Enter code snippet (use \\n for newlines). Empty = use built-in snippets.',
        value: customSnippet,
        placeHolder: 'console.log("hello");',
      });
      if (input === undefined) return;
      customSnippet = input.replace(/\\n/g, '\n');
      vscode.window.showInformationMessage(
        customSnippet ? 'Custom snippet set.' : 'Cleared — using built-in snippets.'
      );
    })
  );
}

function deactivate() {
  stopRequested = true;
}

module.exports = { activate, deactivate };
