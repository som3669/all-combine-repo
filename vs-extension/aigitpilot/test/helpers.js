// Shared test helpers: throwaway git repos, a fake HOME and a mock Ollama server.
const cp = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aigitpilot-${prefix}-`));
}

function run(cmd, args, opts = {}) {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts });
  if (r.error) { throw r.error; }
  return r;
}

/** Like run, but keeps the event loop free so an in-process mock server can answer. */
function runAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(cmd, args, { windowsHide: true, ...opts });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', d => { stdout += d; });
    child.stderr.setEncoding('utf8').on('data', d => { stderr += d; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

function gitIn(cwd, ...args) {
  const r = run('git', args, { cwd });
  if (r.status !== 0) { throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`); }
  return r.stdout;
}

/** A repo with one commit. Its local config keeps the tests away from the user's settings. */
function makeRepo() {
  const dir = tmpDir('repo');
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'user.email', 'test@example.com');
  gitIn(dir, 'config', 'user.name', 'Test');
  gitIn(dir, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), 'hello\n');
  gitIn(dir, 'add', '.');
  gitIn(dir, 'commit', '-q', '-m', 'feat(docs): add readme');
  return dir;
}

/** A mock Ollama server. `reply(req)` returns { status, body } for each request. */
async function mockOllama(reply) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const entry = { method: req.method, url: req.url, body: body ? JSON.parse(body) : undefined };
      requests.push(entry);
      const out = reply(entry);
      res.writeHead(out.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise(r => server.close(r)) };
}

const hasSh = run('sh', ['-c', 'command -v curl && command -v awk'], {}).status === 0;

module.exports = { tmpDir, run, runAsync, gitIn, makeRepo, mockOllama, hasSh };
