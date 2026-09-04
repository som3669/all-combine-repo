// Capture the Chrome Web Store screenshots.
//
// Runs the built package against live YouTube and photographs what it actually
// renders. Store screenshots must show real functionality — a mocked-up image
// misrepresents the product, which is what the "Be Honest" policy removes items
// for — so these are captures, never compositions.
//
//   node tool/build.mjs
//   node tool/shots.mjs --chrome "<path to Chrome for Testing>"
//
// Re-run after any UI change, so the listing never advertises something the
// extension no longer does.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'dist', 'package');
const OUT = path.join(ROOT, 'assets', 'store', 'screenshots');

const argChrome = process.argv.indexOf('--chrome');
const CHROME = argChrome > -1 ? process.argv[argChrome + 1] : process.env.CHROME_FOR_TESTING;

// The hero channel. Big, well-known numbers read better at thumbnail size than
// a small channel's do, and the panel is the same either way.
//   node tool/shots.mjs --channel @SomeoneElse
const argChannel = process.argv.indexOf('--channel');
const HANDLE = argChannel > -1 ? process.argv[argChannel + 1] : '@MrBeast';
const CHANNEL = `https://www.youtube.com/${HANDLE}/videos?hl=en&gl=US`;

const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  defaultViewport: VIEWPORT,
  // A fixed profile directory. Puppeteer deletes its temp profile on close, and
  // Chrome on Windows still holds a lock on first_party_sets.db when it does,
  // which throws EBUSY and masks whatever the run actually reported.
  userDataDir: path.join(ROOT, 'dist', 'chrome-profile'),
  // Screenshotting a page that is still doing layout work can outrun the
  // default 30s CDP timeout on a slow lookup.
  protocolTimeout: 180000,
});

const shots = [];

async function shoot(page, name, note) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  const kb = Math.round(fs.statSync(file).size / 1024);
  shots.push(name);
  console.log(`  ${name}.png  ${kb} KB — ${note}`);
}

/** YouTube renders light by default for a signed-out visitor. */
async function forceDark(page) {
  await page.evaluate(() => document.documentElement.setAttribute('dark', ''));
}

async function panelReady(page, id) {
  await page.waitForSelector(id, { timeout: 90000 });
  await page.waitForFunction(
    (sel) => {
      const p = document.querySelector(sel);
      return p && p.querySelector('.hr-stat-value') && !p.querySelector('.hr-skeleton');
    },
    { timeout: 150000, polling: 1000 },
    id
  );
}

/** The channel panel ships collapsed, so open it before photographing it. */
async function expandPanel(page, id) {
  await page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    if (panel && panel.classList.contains('hr-collapsed')) {
      const caret = panel.querySelector('.hr-caret');
      if (caret) caret.click();
    }
  }, id);
  await sleep(700);
}

async function openModal(page, labelPattern) {
  await page.evaluate((l) => {
    const btn = [...document.querySelectorAll('#hr-channel-panel .hr-btn')].find((b) =>
      new RegExp(l).test(b.textContent)
    );
    if (btn) btn.click();
  }, labelPattern);
  await page.waitForFunction(
    () => {
      const m = document.querySelector('.hr-modal-backdrop');
      return m && !m.querySelector('.hr-skeleton');
    },
    { timeout: 180000, polling: 1000 }
  );
  await sleep(1200);
}

const closeModal = (page) =>
  page.evaluate(() => document.querySelector('.hr-modal-backdrop')?.remove());

try {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  console.log('channel page');
  await page.goto(CHANNEL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await forceDark(page);
  await panelReady(page, '#hr-channel-panel');
  await expandPanel(page, '#hr-channel-panel');
  await page.evaluate(() =>
    document.querySelector('#hr-channel-panel')?.scrollIntoView({ block: 'center' })
  );
  await sleep(800);
  await shoot(page, 'hookrate-1-channel-analytics', 'channel analytics with live numbers');

  await openModal(page, 'Formats');
  await shoot(page, 'hookrate-2-formats', 'format clustering, lift vs channel median');
  await closeModal(page);

  await openModal(page, 'Earn more|Get monetized|Monetization plan');
  await shoot(page, 'hookrate-3-revenue-advice', 'ranked revenue recommendations');
  await closeModal(page);

  // Take the watch-page shot on a video from the same channel, picked off the
  // page itself. A hardcoded id rots the moment that video is unlisted.
  console.log('watch page');
  const videoUrl = await page.evaluate(() => {
    const a = document.querySelector('ytd-rich-item-renderer a[href*="/watch?v="]');
    return a ? new URL(a.getAttribute('href'), location.origin).href : null;
  });
  if (!videoUrl) throw new Error('could not find a video link on the channel page');
  await page.goto(`${videoUrl}&hl=en&gl=US`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await forceDark(page);
  await panelReady(page, '#hr-watch-panel');
  await sleep(1200);
  await shoot(page, 'hookrate-4-watch-panel', 'watch stats with the outlier multiplier');

  console.log(`\ncaptured ${shots.length} screenshots to assets/store/screenshots/`);
  console.log('note: the store wants 24-bit PNG with no alpha; these are already RGB.');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
