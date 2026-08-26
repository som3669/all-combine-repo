// Render PRIVACY.md to a hostable HTML page.
//
// The policy has exactly one source of truth. The store's enforcement note is
// blunt about this: "Inconsistencies between your privacy policy, dashboard
// disclosures, and actual behavior violate policies and can result in
// suspension." Keeping a hand-written HTML copy alongside the markdown is how
// that inconsistency happens six months later, so the page is generated.
//
//   node tool/privacy.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'PRIVACY.md');
const OUT_DIR = path.join(ROOT, 'docs');
const OUT = path.join(OUT_DIR, 'index.html');

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline markdown: code, bold, italics, links. Applied after escaping. */
function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * A deliberately small markdown subset — headings, paragraphs, lists, tables,
 * rules. Enough for this document, and small enough to read in one sitting
 * rather than pulling in a dependency to render one file.
 */
function render(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let i = 0;

  const flushParagraph = (buffer) => {
    if (buffer.length) out.push(`<p>${inline(buffer.join(' '))}</p>`);
    buffer.length = 0;
  };
  const paragraph = [];

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      flushParagraph(paragraph);
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph(paragraph);
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      flushParagraph(paragraph);
      out.push('<hr />');
      i++;
      continue;
    }

    // Table: header row, separator, then body until a blank line.
    if (/^\|/.test(line) && /^\|[\s:|-]+\|/.test(lines[i + 1] || '')) {
      flushParagraph(paragraph);
      const cells = (row) =>
        row
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());

      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        body.push(cells(lines[i]));
        i++;
      }
      out.push(
        '<table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          body
            .map((row) => '<tr>' + row.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
            .join('') +
          '</tbody></table>'
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph(paragraph);
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    paragraph.push(line.trim());
    i++;
  }
  flushParagraph(paragraph);
  return out.join('\n');
}

const markdown = fs.readFileSync(SRC, 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const body = render(markdown);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Privacy Policy — Hookrate</title>
<meta name="description" content="Privacy policy for the Hookrate browser extension. No server, no account, no telemetry." />
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0 auto; padding: 40px 22px 96px; max-width: 760px;
    font: 16px/1.65 -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
    color: #16161a; background: #fff;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #e9e9ec; background: #121214; }
    td, th { border-color: #2e2e33 !important; }
    hr { border-color: #2e2e33 !important; }
    code { background: #1e1e22 !important; }
    .mark { background: #1e1e22 !important; border-color: #2e2e33 !important; }
  }
  h1 { font-size: 30px; line-height: 1.2; margin: 0 0 6px; }
  h2 { font-size: 21px; margin: 38px 0 10px; }
  h3 { font-size: 17px; margin: 26px 0 8px; }
  p, li { font-size: 16px; }
  ul { padding-left: 22px; }
  a { color: #d63b2b; }
  code {
    font: 14px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
    background: #f2f2f4; padding: 1px 5px; border-radius: 4px;
  }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 15px; }
  th, td { border: 1px solid #e2e2e5; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { font-weight: 600; }
  hr { border: 0; border-top: 1px solid #e2e2e5; margin: 34px 0; }
  .mark {
    display: flex; align-items: center; gap: 10px;
    border: 1px solid #e2e2e5; background: #f8f8f9;
    border-radius: 10px; padding: 10px 14px; margin-bottom: 28px; font-size: 14px;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #ff4d3d; flex: none; }
</style>
</head>
<body>
<div class="mark"><span class="dot"></span><span>Hookrate extension · version ${manifest.version}</span></div>
${body}
</body>
</html>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);

console.log(`rendered PRIVACY.md -> docs/index.html  (${(html.length / 1024).toFixed(1)} KB)`);
console.log('\nOnce GitHub Pages is enabled for the repository, this is served at:');
console.log('  https://som3669.github.io/all-combine-repo/chrome-extension/hookrate/docs/');
