// Smoke test: load the built package in Chrome and exercise it against live
// YouTube.
//
// Runs against dist/package — the exact files that go into the zip — so this
// tests what ships, not what is lying around the repo.
//
// Chrome 137 and later refuse --load-extension, and the flag that re-enabled it
// is gone by 151, so ordinary Chrome cannot host this. Chrome for Testing keeps
// the automation switches on:
//
//   npx @puppeteer/browsers install chrome@stable
//   node tool/smoke.mjs --chrome "<path to chrome.exe>"

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'dist', process.env.HR_TEST_DIR || 'package');

const argChrome = process.argv.indexOf('--chrome');
const CHROME =
  argChrome > -1 ? process.argv[argChrome + 1] : process.env.CHROME_FOR_TESTING;

const CHANNEL = 'https://www.youtube.com/@LIVCrime/videos?hl=en&gl=US';
const VIDEO = 'https://www.youtube.com/watch?v=KdrG-qR6-co&hl=en&gl=US';
const SEARCH = 'https://www.youtube.com/results?search_query=cid+full+episode&hl=en&gl=US';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err) {
    record(name, false, err.message);
  }
}

if (!fs.existsSync(EXT)) {
  console.error('dist/package not found — run: node tool/build.mjs');
  process.exit(1);
}
if (!CHROME || !fs.existsSync(CHROME)) {
  console.error('Chrome for Testing not found. Pass --chrome <path> or set CHROME_FOR_TESTING.');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--lang=en-US',
    '--window-size=1300,900',
    '--window-position=-2400,-2400',
    '--mute-audio',
  ],
  defaultViewport: { width: 1280, height: 800 },
});

try {
  await sleep(3000);

  // ---- the extension itself --------------------------------------------
  console.log('\nextension');
  const targets = await browser.targets();
  const sw = targets.find((t) => t.type() === 'service_worker');
  await check('service worker starts', async () => {
    if (!sw) throw new Error('no service worker target — the package failed to load');
    return sw.url().split('/').slice(-1)[0];
  });

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));

  // ---- channel page -----------------------------------------------------
  console.log('\nchannel page');
  await page.goto(CHANNEL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await check('panel mounts', async () => {
    await page.waitForSelector('#hr-channel-panel', { timeout: 60000 });
    return 'present';
  });

  await check('analytics resolve', async () => {
    await page.waitForFunction(
      () => {
        const p = document.querySelector('#hr-channel-panel');
        return p && p.querySelector('.hr-stat-value') && !p.querySelector('.hr-skeleton');
      },
      { timeout: 120000, polling: 1000 }
    );
    const stats = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#hr-channel-panel .hr-stat')];
      const out = {};
      for (const c of cells) {
        // Labels are uppercased in CSS, so read them case-insensitively rather
        // than assuming how they render.
        const key = c.querySelector('.hr-stat-label').textContent.trim().toLowerCase();
        out[key] = c.querySelector('.hr-stat-value').textContent.trim();
      }
      return out;
    });
    const filled = Object.values(stats).filter((v) => v && v !== '—').length;
    if (filled < 6) throw new Error(`only ${filled} stats populated: ${JSON.stringify(stats)}`);
    return `${filled} stats populated, subscribers ${stats.subscribers || '?'}`;
  });

  await check('no "null" text rendered', async () => {
    const bad = await page.evaluate(() => {
      const panel = document.querySelector('#hr-channel-panel');
      return panel ? (panel.textContent.match(/\bnull\b|\bundefined\b|\bNaN\b/g) || []).length : 0;
    });
    if (bad) throw new Error(`${bad} occurrence(s) of null/undefined/NaN in the panel`);
    return 'clean';
  });

  await check('monetization badge on the title', async () => {
    const badge = await page.evaluate(() => {
      const b = document.getElementById('hr-monetized-badge');
      return b ? { glyph: b.textContent, cls: b.className, title: b.title.slice(0, 80) } : null;
    });
    if (!badge) throw new Error('badge not injected');
    return `${badge.glyph} (${badge.cls.replace('hr-badge ', '')})`;
  });

  await check('Analysis tab injected', async () => {
    const tab = await page.$('#hr-analysis-tab');
    if (!tab) throw new Error('tab not added to the strip');
    return 'present';
  });

  // ---- modals -----------------------------------------------------------
  const openModal = async (label) => {
    await page.evaluate((l) => {
      const btn = [...document.querySelectorAll('#hr-channel-panel .hr-btn')].find((b) =>
        new RegExp(l).test(b.textContent)
      );
      if (!btn) throw new Error(`button ${l} not found`);
      btn.click();
    }, label);
    await page.waitForFunction(
      () => {
        const m = document.querySelector('.hr-modal-backdrop');
        return m && !m.querySelector('.hr-skeleton');
      },
      { timeout: 180000, polling: 1000 }
    );
    const text = await page.evaluate(() => document.querySelector('.hr-modal-backdrop').textContent);
    await page.evaluate(() => document.querySelector('.hr-modal-backdrop')?.remove());
    return text;
  };

  console.log('\nmodals');
  for (const [label, name] of [
    ['Outliers', 'outliers'],
    ['Formats', 'formats'],
    ['Earn more|Get monetized|Monetization plan', 'revenue advice'],
  ]) {
    await check(`${name} modal`, async () => {
      const text = await openModal(label);
      if (/\bnull\b|\bundefined\b|\bNaN\b/.test(text)) {
        throw new Error('rendered null/undefined/NaN');
      }
      if (text.length < 80) throw new Error('modal was effectively empty');
      return `${text.length} chars`;
    });
  }

  // ---- watch page -------------------------------------------------------
  console.log('\nwatch page');
  await page.goto(VIDEO, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await check('watch panel resolves', async () => {
    await page.waitForSelector('#hr-watch-panel', { timeout: 60000 });
    await page.waitForFunction(
      () => {
        const p = document.querySelector('#hr-watch-panel');
        return p && p.querySelector('.hr-stat-value') && !p.querySelector('.hr-skeleton');
      },
      { timeout: 120000, polling: 1000 }
    );
    return page.evaluate(() => {
      const c = document.querySelector('#hr-watch-panel .hr-stat-value');
      return `views ${c ? c.textContent : '?'}`;
    });
  });

  // ---- search page ------------------------------------------------------
  console.log('\nsearch page');
  await page.goto(SEARCH, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await check('search bar injects without breaking layout', async () => {
    await page.waitForSelector('#hr-search-bar', { timeout: 60000 });
    // The layout bug this guards against squeezed results off the right edge.
    const ok = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('ytd-video-renderer')];
      if (!rows.length) return { rows: 0 };
      const r = rows[0].getBoundingClientRect();
      return { rows: rows.length, width: Math.round(r.width), left: Math.round(r.left) };
    });
    if (!ok.rows) throw new Error('no result rows rendered');
    if (ok.width < 400) throw new Error(`result rows squeezed to ${ok.width}px`);
    return `${ok.rows} rows, first row ${ok.width}px wide`;
  });

  // ---- extension pages --------------------------------------------------
  console.log('\nextension pages');
  const base = sw ? sw.url().replace('/src/background/service-worker.js', '') : null;
  for (const [file, name] of [
    ['/src/popup/popup.html', 'popup'],
    ['/src/options/options.html', 'options'],
    ['/src/swipe/swipe.html', 'swipe file'],
  ]) {
    await check(`${name} page renders`, async () => {
      const p = await browser.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
      await p.goto(base + file, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2500);
      const body = await p.evaluate(() => document.body.innerText.trim().length);
      await p.close();
      if (errs.length) throw new Error(errs[0]);
      if (body < 20) throw new Error('page rendered empty');
      return `${body} chars of content`;
    });
  }

  await check('no uncaught page errors on youtube.com', async () => {
    if (pageErrors.length) throw new Error(pageErrors[0]);
    return 'none';
  });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('failures:');
  for (const f of failed) console.log(`  ! ${f.name}: ${f.detail}`);
  process.exit(1);
}
