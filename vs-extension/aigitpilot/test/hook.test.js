// The hook scripts, run for real with sh, git and jq against a fake HOME and a mock Ollama.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gitIn, makeRepo, mockOllama, run, runAsync, tmpDir, hasSh } = require('./helpers');

// Point HOME and git's global config at a temp folder before hook.js reads os.homedir().
const realHome = os.homedir();
const home = tmpDir('home');
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.GIT_CONFIG_GLOBAL = path.join(home, '.gitconfig');
const hook = require('../out/hook');
const { systemPrompt } = require('../out/prompt');

const ASSETS = path.join(__dirname, '..', 'hooks');
const skip = !hasSh && 'needs sh, curl and awk';

function installWithJq() {
  const result = hook.installHookFiles(ASSETS);
  if (run('sh', ['-c', 'command -v jq']).status !== 0) {
    const bundled = path.join(realHome, '.git-hooks', 'jq.exe');
    if (!fs.existsSync(bundled)) { return undefined; }
    fs.copyFileSync(bundled, path.join(hook.HOOKS_DIR, 'jq.exe'));
  }
  return result;
}

function writeConfig(ollamaUrl, extra = {}) {
  const prompts = { style: 'conventional', language: 'english', customInstructions: '' };
  hook.writeHookConfig({
    provider: 'ollama', ollamaUrl, ollamaModel: 'test-model', ...prompts,
    maxDiffSize: 8000, excludeFiles: ['package-lock.json'], matchRepoStyle: true,
    systemPrompt: systemPrompt(prompts), ...extra,
  }, { suggestOnAdd: true, shortcuts: true });
}

const sh = (args, cwd) => runAsync('sh', args, { cwd, env: { ...process.env } });

test('installHookFiles writes once, keeps foreign hooks and drops the old .bat', () => {
  fs.mkdirSync(hook.HOOKS_DIR, { recursive: true });
  fs.writeFileSync(path.join(hook.HOOKS_DIR, 'pre-push'), '#!/bin/sh\n# someone else\n');
  fs.writeFileSync(path.join(hook.HOOKS_DIR, 'prepare-commit-msg.bat'), '@echo off\r\n"sh.exe" "%~dp0prepare-commit-msg" %*\r\n');
  const first = hook.installHookFiles(ASSETS);
  assert.ok(first.changed.includes('prepare-commit-msg'));
  assert.ok(first.changed.includes('pre-commit'));
  assert.deepStrictEqual(first.skipped, ['pre-push']);
  assert.ok(!fs.existsSync(path.join(hook.HOOKS_DIR, 'prepare-commit-msg.bat')));
  assert.doesNotMatch(fs.readFileSync(path.join(hook.HOOKS_DIR, 'aigitpilot-message.sh'), 'utf8'), /\r/);
  assert.deepStrictEqual(hook.installHookFiles(ASSETS).changed, []);
  assert.ok(hook.isInstalled());
  fs.rmSync(path.join(hook.HOOKS_DIR, 'pre-push'));
});

test('isOurHooksPath accepts the spellings git config may hold', () => {
  assert.ok(hook.isOurHooksPath(hook.HOOKS_DIR));
  assert.ok(hook.isOurHooksPath(`${hook.HOOKS_DIR}/`));
  assert.ok(hook.isOurHooksPath('~/.git-hooks'));
  if (process.platform === 'win32') {
    const msys = hook.HOOKS_DIR.replace(/^([A-Za-z]):\\/, (_, d) => `/${d.toLowerCase()}/`).replace(/\\/g, '/');
    assert.ok(hook.isOurHooksPath(msys), msys);
    assert.ok(hook.isOurHooksPath(hook.HOOKS_DIR.toUpperCase()));
  }
  assert.ok(!hook.isOurHooksPath('/somewhere/else'));
  assert.ok(!hook.isOurHooksPath(undefined));
});

test('core.hooksPath can be set, read and unset in the global config', async () => {
  assert.strictEqual(await hook.getGlobalHooksPath(), undefined);
  await hook.setGlobalHooksPath(hook.HOOKS_DIR);
  assert.ok(hook.isOurHooksPath(await hook.getGlobalHooksPath()));
  await hook.setGlobalHooksPath(undefined);
  assert.strictEqual(await hook.getGlobalHooksPath(), undefined);
});

test('shell rc lines are added once and removed cleanly', () => {
  const rc = path.join(home, '.bashrc');
  fs.writeFileSync(rc, 'export A=1');
  assert.deepStrictEqual(hook.addShellSourceLines(), [rc]);
  assert.deepStrictEqual(hook.addShellSourceLines(), []);
  assert.match(fs.readFileSync(rc, 'utf8'), /^export A=1\n\n# AI Git Pilot\n\[ -f .*aigitpilot-shell\.sh" \]/);
  hook.removeShellSourceLines();
  assert.strictEqual(fs.readFileSync(rc, 'utf8').trim(), 'export A=1');
});

test('message script sends the staged diff and tidies the reply', { skip }, async t => {
  if (!installWithJq()) { t.skip('no jq available'); return; }
  const mock = await mockOllama(() => ({ body: { message: { content: '<think>hmm</think>\n```\n"feat(app): add greeting"\n```\n' } } }));
  try {
    writeConfig(mock.url);
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, 'app.js'), 'console.log("hi");\n');
    fs.writeFileSync(path.join(repo, 'package-lock.json'), '{"lockfileVersion": 3}\n');
    gitIn(repo, 'add', '.');
    const r = await sh([path.join(hook.HOOKS_DIR, 'aigitpilot-message.sh')], repo);
    assert.strictEqual(r.stdout, 'feat(app): add greeting', r.stderr);
    const body = mock.requests[0].body;
    assert.strictEqual(mock.requests[0].url, '/api/chat');
    assert.strictEqual(body.model, 'test-model');
    assert.match(body.messages[0].content, /Conventional Commits/);
    const user = body.messages[1].content;
    assert.match(user, /Branch: main/);
    assert.match(user, /- feat\(docs\): add readme/);
    assert.match(user, /A\tpackage-lock\.json/);
    assert.match(user, /console\.log\("hi"\)/);
    assert.doesNotMatch(user, /lockfileVersion/);
  } finally { await mock.close(); }
});

test('message script prints nothing when a cloud key is missing or nothing is staged', { skip }, async t => {
  if (!installWithJq()) { t.skip('no jq available'); return; }
  writeConfig('http://127.0.0.1:9', { provider: 'groq', groqApiKey: '' });
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  gitIn(repo, 'add', '.');
  const script = path.join(hook.HOOKS_DIR, 'aigitpilot-message.sh');
  const r = await sh([script], repo);
  assert.deepStrictEqual([r.status, r.stdout], [0, '']);
  writeConfig('http://127.0.0.1:9');
  assert.strictEqual((await sh([script], makeRepo())).stdout, '');
});

test('git commit gets the AI message in the editor flow only, and repo hooks still run', { skip }, async t => {
  if (!installWithJq()) { t.skip('no jq available'); return; }
  const mock = await mockOllama(() => ({ body: { message: { content: 'feat: add b\n\nExplain why.' } } }));
  try {
    writeConfig(mock.url);
    await hook.setGlobalHooksPath(hook.HOOKS_DIR);
    const repo = makeRepo();
    const commit = (...args) => runAsync('git', ['commit', '-q', ...args], { cwd: repo, env: { ...process.env, GIT_EDITOR: 'true' } });
    const lastMessage = () => gitIn(repo, 'log', '-1', '--format=%B').trim();

    fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n');
    gitIn(repo, 'add', '.');
    assert.strictEqual((await commit()).status, 0);
    assert.strictEqual(lastMessage(), 'feat: add b\n\nExplain why.');

    fs.writeFileSync(path.join(repo, 'b.txt'), 'bb\n');
    gitIn(repo, 'add', '.');
    assert.strictEqual((await commit('--amend')).status, 0);
    assert.strictEqual(lastMessage(), 'feat: add b\n\nExplain why.', 'amend keeps the message');

    fs.writeFileSync(path.join(repo, 'c.txt'), 'c\n');
    gitIn(repo, 'add', '.');
    assert.strictEqual((await commit('-m', 'mine')).status, 0);
    assert.strictEqual(lastMessage(), 'mine');
    assert.strictEqual(mock.requests.length, 1, 'only the editor flow asked the AI');

    // The repository's own hooks keep running despite the global core.hooksPath.
    const local = path.join(repo, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(local, '#!/bin/sh\necho ran > "$(git rev-parse --git-dir)/pre-commit-ran"\nexit 1\n', { mode: 0o755 });
    fs.writeFileSync(path.join(repo, 'd.txt'), 'd\n');
    gitIn(repo, 'add', '.');
    assert.notStrictEqual((await commit('-m', 'blocked')).status, 0, 'a failing repo hook blocks the commit');
    assert.ok(fs.existsSync(path.join(repo, '.git', 'pre-commit-ran')));
  } finally {
    await mock.close();
    await hook.setGlobalHooksPath(undefined);
  }
});

test('shell integration stays out of non-interactive shells', { skip: (!hasSh || run('bash', ['--version']).status !== 0) && 'needs bash' }, () => {
  installWithJq();
  const file = path.join(hook.HOOKS_DIR, 'aigitpilot-shell.sh');
  const bash = (flags, script, cwd) => run('bash', ['--norc', '--noprofile', ...flags, '-c', script, 'x', file], { cwd, env: { ...process.env } });

  assert.strictEqual(bash([], '. "$1"; type -t git').stdout.trim(), 'file');
  assert.strictEqual(bash(['-i'], '. "$1"; type -t git; type -t s').stdout.trim(), 'function\nfunction');

  // Functions a tool copied out of an interactive shell fall back to the real commands.
  const dir = tmpDir('fallback');
  fs.writeFileSync(path.join(dir, 'a'), 'one\n');
  fs.writeFileSync(path.join(dir, 'b'), 'two\n');
  const funcs = bash(['-i'], '. "$1"; declare -f _aigitpilot_on diff').stdout;
  fs.writeFileSync(path.join(dir, 'funcs.sh'), funcs);
  const real = run('bash', ['--norc', '--noprofile', '-c', '. ./funcs.sh; diff a b'], { cwd: dir });
  assert.match(real.stdout, /^1c1/);

  // Without a terminal, `git add` just stages; no prompt, no AI call.
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'e.txt'), 'e\n');
  const r = bash(['-i'], '. "$1"; git add e.txt; s', repo);
  assert.doesNotMatch(r.stdout, /writing a commit message/);
  assert.match(r.stdout, /A {2}e\.txt/);
});
