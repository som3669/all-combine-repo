const test = require('node:test');
const assert = require('node:assert');
const { cleanMessage, systemPrompt, userPrompt } = require('../out/prompt');

test('cleanMessage strips what models wrap around the message', () => {
  const cases = [
    ['feat: add login', 'feat: add login'],
    ['"feat: add login"', 'feat: add login'],
    ['`fix: guard null user`', 'fix: guard null user'],
    ['```\nfeat(api): add pagination\n```', 'feat(api): add pagination'],
    ['```text\nfix: typo\n\nBody line\n```', 'fix: typo\n\nBody line'],
    ['<think>\nThe user wants...\n</think>\n\nchore: bump deps', 'chore: bump deps'],
    ['Here is the commit message:\nfeat: add search', 'feat: add search'],
    ['Commit message: fix: crash on start', 'fix: crash on start'],
    ['**feat: bold subject**\n\nbody', 'feat: bold subject\n\nbody'],
    ['fix: a   \n\n\n\nbody  ', 'fix: a\n\nbody'],
    ['feat: keep `code` inside', 'feat: keep `code` inside'],
    ['\r\nfeat: windows\r\n', 'feat: windows'],
  ];
  for (const [raw, want] of cases) {
    assert.strictEqual(cleanMessage(raw, 'conventional'), want, JSON.stringify(raw));
  }
});

test('cleanMessage keeps only the first line for the short style', () => {
  assert.strictEqual(cleanMessage('Add login\n\nWith a body', 'short'), 'Add login');
});

test('systemPrompt carries style, language and custom instructions', () => {
  const p = systemPrompt({ style: 'detailed', language: 'nepali', customInstructions: 'Mention the ticket.' });
  assert.match(p, /in nepali/);
  assert.match(p, /detailed commit message/);
  assert.match(p, /Mention the ticket/);
  assert.match(systemPrompt({ style: 'unknown', language: '', customInstructions: '' }), /Conventional Commits/);
});

test('userPrompt lists context, draft and the diff source', () => {
  const p = userPrompt({
    branch: 'feature/ABC-12', recentSubjects: ['feat(ui): add button'], draft: 'fixes the login race',
    source: 'all', files: 'M\tsrc/a.ts', diff: 'diff --git a/src/a.ts b/src/a.ts', truncated: true,
  });
  assert.match(p, /Branch: feature\/ABC-12/);
  assert.match(p, /- feat\(ui\): add button/);
  assert.match(p, /fixes the login race/);
  assert.match(p, /nothing is staged/);
  assert.match(p, /cut short/);
  assert.match(userPrompt({ source: 'staged', files: 'M\tx', diff: '', truncated: false }), /no text diff/);
});
