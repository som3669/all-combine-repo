const test = require('node:test');
const assert = require('node:assert');
const { ProviderError, complete, listModels } = require('../out/providers');
const { mockOllama } = require('./helpers');

const settings = url => ({ provider: 'ollama', model: 'qwen2.5-coder:7b', apiKey: '', ollamaUrl: `${url}/` });
const prompt = { system: 'SYSTEM', user: 'USER' };

test('Ollama chat sends system and user messages and reads the reply', async () => {
  const mock = await mockOllama(() => ({ body: { message: { role: 'assistant', content: 'feat: añadir ✨' } } }));
  try {
    assert.strictEqual(await complete(settings(mock.url), prompt), 'feat: añadir ✨');
    const req = mock.requests[0];
    assert.strictEqual(req.url, '/api/chat');
    assert.strictEqual(req.body.model, 'qwen2.5-coder:7b');
    assert.strictEqual(req.body.stream, false);
    assert.deepStrictEqual(req.body.messages.map(m => m.role), ['system', 'user']);
  } finally { await mock.close(); }
});

test('errors are classified so the UI can offer the right fix', async () => {
  const replies = [
    { status: 404, body: { error: 'model "qwen2.5-coder:7b" not found, try pulling it first' } },
    { status: 401, body: { error: { message: 'Invalid API Key' } } },
    { status: 429, body: { error: { message: 'Rate limit reached' } } },
    { status: 500, body: 'oops' },
  ];
  const mock = await mockOllama(() => replies.shift());
  try {
    for (const kind of ['model', 'auth', 'rateLimit', 'other']) {
      await assert.rejects(complete(settings(mock.url), prompt), err => err instanceof ProviderError && err.kind === kind);
    }
  } finally { await mock.close(); }
  await assert.rejects(complete(settings('http://127.0.0.1:9'), prompt), err => err.kind === 'unreachable');
  await assert.rejects(complete({ ...settings('http://x'), provider: 'groq' }, prompt), err => err.kind === 'auth');
});

test('a cancelled request stops with kind "cancelled"', async () => {
  const mock = await mockOllama(() => ({ body: { message: { content: 'late' } } }));
  try {
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(complete(settings(mock.url), prompt, abort.signal), err => err.kind === 'cancelled');
  } finally { await mock.close(); }
});

test('listModels returns the pulled Ollama models', async () => {
  const mock = await mockOllama(() => ({ body: { models: [{ name: 'llama3.2:3b' }, { name: 'codellama:7b' }] } }));
  try {
    assert.deepStrictEqual(await listModels(settings(mock.url)), ['codellama:7b', 'llama3.2:3b']);
    assert.strictEqual(mock.requests[0].url, '/api/tags');
  } finally { await mock.close(); }
});
