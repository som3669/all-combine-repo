// Drives the whole extension against a mock vscode, a fake HOME and a mock Ollama.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gitIn, makeRepo, mockOllama, tmpDir } = require('./helpers');
const { createMock } = require('./vscode-mock');

const realHome = os.homedir();
const home = tmpDir('ext-home');
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.GIT_CONFIG_GLOBAL = path.join(home, '.gitconfig');

const mock = createMock();
const ext = require('../out/extension');
const hook = require('../out/hook');

async function waitFor(check, what, ms = 20000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) { throw new Error(`timed out waiting for ${what}`); }
    await new Promise(r => setTimeout(r, 50));
  }
}

const readConfig = () => JSON.parse(fs.readFileSync(hook.CONFIG_FILE, 'utf8'));

function fakeGit(...roots) {
  const repos = roots.map(root => ({ rootUri: mock.vscode.Uri.file(root), inputBox: { value: '' }, ui: { selected: false } }));
  const api = {
    repositories: repos,
    getRepository: uri => repos.find(r => uri.fsPath.startsWith(r.rootUri.fsPath)) ?? null,
  };
  mock.vscode.extensions.getExtension = id => (id === 'vscode.git' ? { isActive: true, exports: { getAPI: () => api } } : undefined);
  return repos;
}

test('activation moves keys to secret storage and installs the hook once, quietly', async () => {
  // Pre-place jq so the Windows path does not download it.
  fs.mkdirSync(hook.HOOKS_DIR, { recursive: true });
  const bundled = path.join(realHome, '.git-hooks', 'jq.exe');
  if (process.platform === 'win32' && fs.existsSync(bundled)) { fs.copyFileSync(bundled, path.join(hook.HOOKS_DIR, 'jq.exe')); }
  fs.writeFileSync(path.join(home, '.bashrc'), '# mine\n');
  mock.settings.groqApiKey = 'gsk_test_1234';
  mock.settings.provider = 'groq';

  ext.activate(mock.context);
  await waitFor(() => mock.state.get('hooksPathSet'), 'the hook install');

  assert.strictEqual(mock.secretStore.get('aigitpilot.groqApiKey'), 'gsk_test_1234');
  assert.ok(!('groqApiKey' in mock.settings), 'plain-text key removed from settings');
  assert.ok(hook.isInstalled());
  assert.ok(hook.isOurHooksPath(await hook.getGlobalHooksPath()));
  assert.match(fs.readFileSync(path.join(home, '.bashrc'), 'utf8'), /aigitpilot-shell\.sh/);
  const config = readConfig();
  assert.strictEqual(config.groqApiKey, 'gsk_test_1234');
  assert.strictEqual(config.groqModel, 'openai/gpt-oss-20b');
  assert.match(config.systemPrompt, /Conventional Commits/);
  assert.ok(mock.messages.some(m => /Moved your API key/.test(m.text)));
  assert.strictEqual(mock.messages.filter(m => /Installed its git hook/.test(m.text)).length, 1);
  assert.ok(!mock.messages.some(m => /Set up a provider/.test(m.text)), 'no first-run prompt when a key exists');
  assert.ok(!mock.messages.some(m => m.level === 'error'), JSON.stringify(mock.messages));
});

test('settings changes reach the hook config', async () => {
  await mock.vscode.workspace.getConfiguration('aigitpilot').update('style', 'short');
  await waitFor(() => readConfig().style === 'short', 'the config sync');
  assert.match(readConfig().systemPrompt, /single line/);
  await mock.vscode.workspace.getConfiguration('aigitpilot').update('style', undefined);
});

test('generate fills the clicked repository and uses a typed draft once', async () => {
  const replies = ['feat(b): add notes', 'feat(b): add notes again'];
  const ollama = await mockOllama(() => ({ body: { message: { content: replies.shift() ?? 'x' } } }));
  try {
    const config = mock.vscode.workspace.getConfiguration('aigitpilot');
    await config.update('provider', 'ollama');
    await config.update('ollamaUrl', ollama.url);
    const repoA = makeRepo();
    const repoB = makeRepo();
    fs.writeFileSync(path.join(repoA, 'a.txt'), 'a\n');
    gitIn(repoA, 'add', '.');
    fs.writeFileSync(path.join(repoB, 'notes.md'), 'b\n');
    const [a, b] = fakeGit(repoA, repoB);
    const generate = mock.commands.get('aigitpilot.generate');

    b.inputBox.value = 'keep a changelog of notes';
    await generate({ rootUri: mock.vscode.Uri.file(repoB) });
    assert.strictEqual(b.inputBox.value, 'feat(b): add notes');
    assert.strictEqual(a.inputBox.value, '', 'the other repository is untouched');
    const user = ollama.requests[0].body.messages[1].content;
    assert.match(user, /keep a changelog of notes/);
    assert.match(user, /notes\.md \(untracked\)/);
    assert.match(user, /nothing is staged/);
    assert.ok(mock.messages.some(m => m.level === 'status' && /nothing was staged/.test(m.text)));

    await generate({ rootUri: mock.vscode.Uri.file(repoB) });
    assert.strictEqual(b.inputBox.value, 'feat(b): add notes again');
    assert.doesNotMatch(ollama.requests[1].body.messages[1].content, /author's own note/, 'our own message is not a draft');
  } finally { await ollama.close(); }
});

test('a missing Ollama model offers to pull it', async () => {
  const ollama = await mockOllama(() => ({ status: 404, body: { error: 'model "qwen2.5-coder:7b" not found, try pulling it first' } }));
  try {
    await mock.vscode.workspace.getConfiguration('aigitpilot').update('ollamaUrl', ollama.url);
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, 'x.txt'), 'x\n');
    fakeGit(repo);
    await mock.commands.get('aigitpilot.generate')();
    await waitFor(() => mock.messages.some(m => m.level === 'error' && /does not have the model/.test(m.text)), 'the error');
    const shown = mock.messages.find(m => /does not have the model/.test(m.text));
    assert.deepStrictEqual(shown.items, ['Pull Model', 'Choose Model']);
  } finally { await ollama.close(); }
});

test('uninstall removes the files and restores core.hooksPath', async () => {
  mock.answers.push({ match: /Remove AI Git Pilot/, value: 'Remove' });
  await mock.commands.get('aigitpilot.uninstallHook')();
  assert.ok(!hook.isInstalled());
  assert.strictEqual(await hook.getGlobalHooksPath(), undefined);
  assert.ok(!fs.existsSync(hook.CONFIG_FILE));
  assert.strictEqual(fs.readFileSync(path.join(home, '.bashrc'), 'utf8').trim(), '# mine');
  assert.strictEqual(mock.settings.globalHook, false);
  await new Promise(r => setTimeout(r, 100));
  assert.ok(!mock.messages.some(m => /no longer be kept up to date/.test(m.text)));
});
