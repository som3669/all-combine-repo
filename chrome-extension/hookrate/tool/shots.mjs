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

// The channel the shots are taken on. Its identity is blurred before capture
// (see redactIdentity), so this only decides how big the numbers are, not whose
// brand appears in the listing.
//   node tool/shots.mjs --channel @SomeoneElse
const argChannel = process.argv.indexOf('--channel');
const HANDLE = argChannel > -1 ? process.argv[argChannel + 1] : '@LIVCrime';
const CHANNEL = `https://www.youtube.com/${HANDLE}/videos?hl=en&gl=US`;

// Pass --no-redact to photograph a channel as-is.
const REDACT = !process.argv.includes('--no-redact');

// Skip the first screenshot, for when it has been produced by hand and only
// the remaining ones need regenerating.
const SKIP_HERO = process.argv.includes('--skip-hero');

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

/**
 * Blur the identity of whichever channel the shots happen to be taken on.
 *
 * A store listing that features a real creator's name, avatar and branding
 * implies an endorsement that does not exist. The numbers stay real and legible
 * — that is what the screenshot is selling — while whose numbers they are does
 * not appear. Hookrate's own panel is explicitly excluded so nothing it renders
 * is ever obscured.
 */
async function redactIdentity(page) {
  if (!REDACT) return;
  await page.addStyleTag({
    content: `
      /* Blur by CONTAINER, not by identity element.

         Two earlier attempts chased individual class names — the avatar, the
         title, the handle row — and both failed silently: once because the
         guessed wiz-style names matched nothing, once because a stray comment
         terminator killed the rule block. Meanwhile the watch page leaked the
         description, the hashtags, the "subscribe to" line and the entire
         related column, none of which were on the list at all.

         Naming every element that can identify a channel is a losing game
         against a DOM that changes monthly. Blurring the containers that hold
         YouTube's own content, and leaving only our panel sharp, cannot miss
         one: anything new YouTube adds inside them arrives blurred.

         Our panel is a sibling of these containers, never a descendant, so it
         is unaffected — a CSS filter on an ancestor would blur it too, which is
         why this works at all. */

      /* the masthead on every page: YouTube's own logo and wordmark, the
         search box and the signed-in account avatar. YouTube's branding in a
         store listing reads as an affiliation that does not exist, and the
         avatar identifies whoever took the shots. */
      ytd-masthead, #masthead-container,

      /* channel page: header block and the video grid below our panel */
      ytd-browse[page-subtype="channels"] #page-header,
      ytd-browse[page-subtype="channels"] ytd-rich-grid-renderer,

      /* watch page: the whole primary column (player, title, description,
         hashtags, uploader) and everything in the secondary column except us */
      ytd-watch-flexy #primary,
      #secondary-inner > *:not(#hr-watch-panel) {
        filter: blur(10px) !important;
      }

      /* never blur our own panel, whatever it sits inside */
      #hr-channel-panel, #hr-channel-panel *,
      #hr-watch-panel, #hr-watch-panel *,
      .hr-modal-backdrop, .hr-modal-backdrop * {
        filter: none !important;
      }

      /* ...except the parts of it that name the channel back at you. Video
         titles and thumbnails identify a channel as surely as its avatar does.
         Listed after the rule above so it wins on order at equal specificity.

         Anchors only. A video title is rendered as <a class="hr-row-title">
         while an advice heading is a <div> of the same class, and blurring the
         div hid the recommendation headings — the most important text in that
         screenshot. The numbers, chips and recommendations stay sharp, which is
         what the screenshot is actually selling. */
      #hr-channel-panel a.hr-row-title, #hr-channel-panel a.hr-row-sub,
      #hr-channel-panel .hr-row-thumb,
      #hr-watch-panel a.hr-row-title, #hr-watch-panel .hr-row-thumb,
      .hr-modal-backdrop a.hr-row-title, .hr-modal-backdrop a.hr-row-sub,
      .hr-modal-backdrop .hr-row-thumb,

      /* the monetization modal lists sampled videos as bare ids; a video id
         resolves to its channel in one request, so it identifies as plainly as
         a title does. The "ad slots present" chip beside it stays sharp. */
      .hr-modal-backdrop .hr-link-row a {
        filter: blur(6px) !important;
      }
    `,
  });
  await sleep(400);

  // Assert the blur actually landed. A redaction that silently fails is worse
  // than none: it ships an unredacted screenshot while looking handled. This
  // has already happened twice — once from guessed class names, once from a
  // stray comment terminator that broke the whole rule block.
  const applied = await page.evaluate(() => {
    const probes = [
      'ytd-masthead',
      'ytd-browse[page-subtype="channels"] #page-header',
      'ytd-browse[page-subtype="channels"] ytd-rich-grid-renderer',
      'ytd-watch-flexy #primary',
    ];
    return probes.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, found: false, blurred: false };
      return { sel, found: true, blurred: /blur/.test(getComputedStyle(el).filter || '') };
    });
  });

  const missed = applied.filter((p) => p.found && !p.blurred);
  if (missed.length) {
    throw new Error(
      `redaction did not apply to: ${missed.map((m) => m.sel).join(', ')} — refusing to capture`
    );
  }
  if (!applied.some((p) => p.found)) {
    console.log('  ! none of the identity elements were found; page markup may have changed');
  }
}

/**
 * Our own modal titles read "How to earn more — <channel>", which names the
 * channel in the one element the blur deliberately leaves sharp.
 */
async function anonymiseTitles(page) {
  if (!REDACT) return;
  await page.evaluate(() => {
    for (const t of document.querySelectorAll('.hr-modal-title')) {
      // Our own titles use an em dash, but match the other dashes too: a title
      // that keeps its channel name defeats the whole redaction, and nothing we
      // render puts a spaced dash anywhere but in front of the channel name.
      t.textContent = t.textContent.split(/\s+[—–-]\s+/)[0];
    }
  });
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
  await anonymiseTitles(page);
  await sleep(400);
}

/**
 * The monetization verdict has no panel button — it opens by clicking the badge
 * injected next to the channel title. That badge sits inside #page-header, so
 * it is blurred by the time we click it; the blur is paint-only and the click
 * lands regardless.
 */
async function openBadgeModal(page) {
  const clicked = await page.evaluate(() => {
    const badge = document.querySelector('#hr-monetized-badge');
    if (!badge) return false;
    badge.click();
    return true;
  });
  if (!clicked) throw new Error('monetization badge was not injected next to the channel title');
  await page.waitForFunction(
    () => {
      const m = document.querySelector('.hr-modal-backdrop');
      return m && !m.querySelector('.hr-skeleton');
    },
    { timeout: 180000, polling: 1000 }
  );
  await anonymiseTitles(page);
  await sleep(400);
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
  await redactIdentity(page);
  await expandPanel(page, '#hr-channel-panel');
  await page.evaluate(() =>
    document.querySelector('#hr-channel-panel')?.scrollIntoView({ block: 'center' })
  );
  await sleep(800);
  if (SKIP_HERO) console.log('  (skipping hookrate-1, kept as-is)');
  else await shoot(page, 'hookrate-1-channel-analytics', 'channel analytics with live numbers');

  await openModal(page, 'Formats');
  await shoot(page, 'hookrate-2-formats', 'format clustering, lift vs channel median');
  await closeModal(page);

  await openModal(page, 'Earn more|Get monetized|Monetization plan');
  await shoot(page, 'hookrate-3-revenue-advice', 'ranked revenue recommendations');
  await closeModal(page);

  // Shot 5 is taken here, out of numeric order: it is a channel-page modal, and
  // the watch-page shot below navigates away for good.
  await openBadgeModal(page);
  await shoot(page, 'hookrate-5-monetization', 'monetization verdict and the evidence behind it');
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
  await redactIdentity(page);
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
