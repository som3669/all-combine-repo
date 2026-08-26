// Build the Chrome Web Store upload package.
//
// Ships only what the extension needs at runtime. Everything else in the repo —
// the store copy, the privacy policy source, screenshots, this tooling — stays
// out, because reviewers read what you upload and every extra file is either
// noise or a question to answer.
//
//   node tool/build.mjs           build dist/hookrate-<version>.zip
//   node tool/build.mjs --check   validate only, write nothing

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CHECK_ONLY = process.argv.includes('--check');

// Only these paths go into the package.
const INCLUDE = ['manifest.json', 'src', 'assets/icons'];

// Never ship these, wherever they appear.
const DENY = [
  /(^|[\\/])\.git/,
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])dist([\\/]|$)/,
  /(^|[\\/])tool([\\/]|$)/,
  /(^|[\\/])assets[\\/]store([\\/]|$)/,
  /\.(md|zip|log|map)$/i,
  /(^|[\\/])\.DS_Store$/,
  /(^|[\\/])Thumbs\.db$/,
];

const problems = [];
const warnings = [];

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (DENY.some((re) => re.test(rel))) return [];
    return entry.isDirectory() ? walk(full, base) : [full];
  });
}

function collect() {
  const files = [];
  for (const item of INCLUDE) {
    const full = path.join(ROOT, item);
    if (!fs.existsSync(full)) {
      problems.push(`missing from the repo: ${item}`);
      continue;
    }
    if (fs.statSync(full).isDirectory()) files.push(...walk(full, ROOT));
    else files.push(full);
  }
  return files.map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
}

// ---- validation ---------------------------------------------------------

function validate(files) {
  const manifestPath = path.join(ROOT, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    problems.push(`manifest.json is not valid JSON: ${err.message}`);
    return null;
  }

  // Every path the manifest points at must be in the package. A missing file
  // here is the single most common rejection.
  const referenced = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
  ].filter(Boolean);

  for (const cs of manifest.content_scripts || []) {
    referenced.push(...(cs.js || []), ...(cs.css || []));
  }

  for (const ref of [...new Set(referenced)]) {
    if (!files.includes(ref)) problems.push(`manifest references a file not in the package: ${ref}`);
  }

  // Every relative import inside the background modules must resolve.
  for (const file of files.filter((f) => f.startsWith('src/background') && f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of source.matchAll(/from '(\.[^']+)'/g)) {
      const target = path
        .relative(ROOT, path.resolve(path.dirname(path.join(ROOT, file)), m[1]))
        .split(path.sep)
        .join('/');
      if (!files.includes(target)) problems.push(`${file} imports ${m[1]}, which is not in the package`);
    }
  }

  // Things that pass review but should not be shipped by accident.
  for (const file of files.filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/\beval\s*\(|new Function\s*\(/.test(source)) {
      problems.push(`${file} uses eval or new Function — remote code execution is prohibited`);
    }
    if (/\.innerHTML\s*=/.test(source)) {
      problems.push(`${file} assigns innerHTML`);
    }
    if (/\bdebugger\b/.test(source)) problems.push(`${file} contains a debugger statement`);
    const logs = (source.match(/console\.log\(/g) || []).length;
    if (logs) warnings.push(`${file} has ${logs} console.log call${logs === 1 ? '' : 's'}`);
  }

  // Hosts contacted in code must be declared, in either required or optional
  // host permissions.
  const declared = [
    ...(manifest.host_permissions || []),
    ...(manifest.optional_host_permissions || []),
  ].map((h) => h.replace('https://', '').replace('/*', ''));

  const contacted = new Set();
  for (const file of files.filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of source.matchAll(/https:\/\/([a-z0-9.-]+)/g)) contacted.add(m[1]);
  }
  for (const host of contacted) {
    if (!declared.includes(host)) {
      problems.push(`code contacts ${host}, which is not in host_permissions`);
    }
  }

  if (!manifest.name || manifest.name.length > 45) {
    problems.push(`name must be 1–45 characters (currently ${manifest.name?.length})`);
  }
  if (!manifest.description || manifest.description.length > 132) {
    problems.push(
      `description must be 1–132 characters (currently ${manifest.description?.length})`
    );
  }
  if (/youtube/i.test(manifest.name)) {
    warnings.push('name contains "YouTube" — a trademark in the product name invites a complaint');
  }

  return manifest;
}

// ---- build --------------------------------------------------------------

const files = collect();
const manifest = validate(files);

const totalBytes = files.reduce((sum, f) => sum + fs.statSync(path.join(ROOT, f)).size, 0);

console.log(`files:       ${files.length}`);
console.log(`unpacked:    ${(totalBytes / 1024).toFixed(0)} KB`);
if (manifest) {
  console.log(`name:        ${manifest.name}`);
  console.log(`version:     ${manifest.version}`);
  console.log(`permissions: ${(manifest.permissions || []).join(', ')}`);
  console.log(`hosts:       ${(manifest.host_permissions || []).length} required, ${(manifest.optional_host_permissions || []).length} optional`);
}

if (warnings.length) {
  console.log('\nwarnings:');
  for (const w of warnings) console.log(`  - ${w}`);
}

if (problems.length) {
  console.log('\nPROBLEMS:');
  for (const p of problems) console.log(`  ! ${p}`);
  console.log('\nnot packaged.');
  process.exit(1);
}

console.log('\nvalidation passed.');
if (CHECK_ONLY) process.exit(0);

// Stage, so the zip contains exactly the audited file list and nothing else.
const stage = path.join(DIST, 'package');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

for (const file of files) {
  const dest = path.join(stage, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, file), dest);
}

const zipName = `hookrate-${manifest.version}.zip`;
const zipPath = path.join(DIST, zipName);
fs.rmSync(zipPath, { force: true });

// Node has no zip writer, so this goes through .NET — but NOT through
// Compress-Archive. Windows PowerShell 5.1 writes entry names with backslashes,
// which violates the ZIP spec (4.4.17.1: forward slashes only) and can leave
// Chrome extracting a single file literally named "src\background\...". Writing
// the entries by hand keeps the separators correct.
const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stage = '${stage.replace(/'/g, "''")}'
$zip   = '${zipPath.replace(/'/g, "''")}'
$fs = [System.IO.File]::Open($zip, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($file in Get-ChildItem -Path $stage -Recurse -File) {
  $name = $file.FullName.Substring($stage.Length + 1).Replace('\\', '/')
  $entry = $archive.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
  $in = [System.IO.File]::OpenRead($file.FullName)
  $out = $entry.Open()
  $in.CopyTo($out)
  $out.Dispose(); $in.Dispose()
}
$archive.Dispose(); $fs.Dispose()
`;
execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });

// Verify the separators actually came out right rather than trusting it.
const verify = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `Add-Type -A System.IO.Compression.FileSystem; ([IO.Compression.ZipFile]::OpenRead('${zipPath.replace(
      /'/g,
      "''"
    )}').Entries | Where-Object { $_.FullName -like '*\\*' }).Count`,
  ],
  { encoding: 'utf8' }
).trim();

if (verify !== '0') {
  console.log(`\n! ${verify} zip entries still contain backslashes — the archive is malformed`);
  process.exit(1);
}

const zipBytes = fs.statSync(zipPath).size;
console.log(`\npackaged:    dist/${zipName}  (${(zipBytes / 1024).toFixed(0)} KB)`);
console.log(`staged at:   dist/package  — load this unpacked to test the exact contents`);
