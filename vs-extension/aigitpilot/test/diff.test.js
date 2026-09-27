const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { collectChanges, excludePathspecs, fitDiff, isExcluded, repoContext } = require('../out/diff');
const { gitIn, makeRepo, tmpDir } = require('./helpers');

const EXCLUDES = ['package-lock.json', '*.min.js', 'dist/**'];

test('excludePathspecs and isExcluded agree on glob patterns', () => {
  assert.deepStrictEqual(excludePathspecs(['a.lock', 'dist/**', '']), [':(exclude,glob)**/a.lock', ':(exclude,glob)dist/**']);
  assert.ok(isExcluded('package-lock.json', EXCLUDES));
  assert.ok(isExcluded('web/package-lock.json', EXCLUDES));
  assert.ok(isExcluded('js/app.min.js', EXCLUDES));
  assert.ok(isExcluded('dist/a/b.js', EXCLUDES));
  assert.ok(!isExcluded('src/dist/b.js', EXCLUDES));
  assert.ok(!isExcluded('app.js', EXCLUDES));
  assert.ok(!isExcluded('package-lock.json.bak', EXCLUDES));
});

test('fitDiff keeps every file and stays near the budget', () => {
  const file = (name, lines) => `diff --git a/${name} b/${name}\n` + Array.from({ length: lines }, (_, i) => `+line ${i}\n`).join('');
  const diff = file('small.txt', 3) + file('huge.txt', 2000) + file('other.txt', 5);
  const { diff: out, truncated } = fitDiff(diff, 1000);
  assert.ok(truncated);
  for (const name of ['small.txt', 'huge.txt', 'other.txt']) { assert.match(out, new RegExp(`diff --git a/${name}`)); }
  assert.match(out, /\+line 2\n/, 'small file kept whole');
  assert.match(out, /more characters of this file left out/);
  assert.ok(out.length < 1200, `length ${out.length}`);
  assert.deepStrictEqual(fitDiff('short', 100), { diff: 'short', truncated: false });
});

test('collectChanges uses the staged diff and leaves excluded files out of it', async () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'app.js'), 'console.log(1);\n');
  fs.writeFileSync(path.join(repo, 'package-lock.json'), '{"lockfileVersion": 3}\n');
  fs.writeFileSync(path.join(repo, 'notes.txt'), 'not staged\n');
  gitIn(repo, 'add', 'app.js', 'package-lock.json');
  const c = await collectChanges(repo, EXCLUDES, 8000);
  assert.strictEqual(c.source, 'staged');
  assert.match(c.files, /A\tapp\.js/);
  assert.match(c.files, /A\tpackage-lock\.json/, 'excluded files are still listed');
  assert.match(c.diff, /console\.log/);
  assert.doesNotMatch(c.diff, /lockfileVersion/);
  assert.doesNotMatch(c.diff, /not staged/);
});

test('collectChanges describes all changes, untracked included, when nothing is staged', async () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'README.md'), 'hello world\n');
  fs.writeFileSync(path.join(repo, 'new.ts'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(repo, 'lib.min.js'), 'minified();\n');
  const c = await collectChanges(repo, EXCLUDES, 8000);
  assert.strictEqual(c.source, 'all');
  assert.match(c.files, /M\tREADME\.md/);
  assert.match(c.files, /A\tnew\.ts \(untracked\)/);
  assert.match(c.diff, /\+hello world/);
  assert.match(c.diff, /\+export const x = 1;/);
  assert.doesNotMatch(c.diff, /minified/);
});

test('collectChanges works before the first commit and returns nothing for a clean tree', async () => {
  const fresh = tmpDir('fresh');
  gitIn(fresh, 'init', '-q');
  assert.strictEqual(await collectChanges(fresh, [], 8000), undefined);
  fs.writeFileSync(path.join(fresh, 'a.txt'), 'first\n');
  assert.strictEqual((await collectChanges(fresh, [], 8000)).source, 'all');
  gitIn(fresh, 'add', 'a.txt');
  assert.strictEqual((await collectChanges(fresh, [], 8000)).source, 'staged');
  assert.strictEqual(await collectChanges(makeRepo(), [], 8000), undefined);
});

test('repoContext reads the branch and recent subjects', async () => {
  const ctx = await repoContext(makeRepo(), true);
  assert.strictEqual(ctx.branch, 'main');
  assert.deepStrictEqual(ctx.recentSubjects, ['feat(docs): add readme']);
  assert.deepStrictEqual((await repoContext(makeRepo(), false)).recentSubjects, []);
});
