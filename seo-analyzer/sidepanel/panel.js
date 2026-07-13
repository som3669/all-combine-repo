// SEO Inspector - side panel controller.

const $ = (id) => document.getElementById(id);
const analyzeBtn = $("analyzeBtn");

analyzeBtn.addEventListener("click", run);
$("upgradeBtn").addEventListener("click", () => Paywall.openUpgrade());

$("activateBtn").addEventListener("click", async () => {
  const btn = $("activateBtn");
  const msg = $("licenseMsg");
  btn.disabled = true;
  btn.textContent = "…";
  msg.className = "license-msg";
  msg.textContent = "Checking…";
  const res = await Paywall.activateKey($("licenseInput").value);
  msg.textContent = res.message;
  msg.className = "license-msg " + (res.ok ? "ok" : "err");
  btn.disabled = false;
  btn.textContent = "Activate";
  if (res.ok) {
    $("licenseInput").value = "";
    await syncPro();
  }
});

// ---------------------------------------------------------------------------
// This function is INJECTED into the page. It must be fully self-contained
// (no references to variables outside its own body) and return plain data.
// ---------------------------------------------------------------------------
function extractSeo() {
  const abs = (href) => {
    try { return new URL(href, location.href).href; } catch { return href; }
  };
  const meta = (sel) => {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };

  // Headings
  const headings = {};
  const headingList = {};
  for (let i = 1; i <= 6; i++) {
    const els = [...document.querySelectorAll("h" + i)];
    headings["h" + i] = els.length;
    headingList["h" + i] = els.slice(0, 20).map((e) => e.textContent.trim().slice(0, 90));
  }

  // Images
  const imgs = [...document.images];
  const missingAlt = imgs.filter((i) => !i.getAttribute("alt")).length;

  // Links
  const host = location.hostname;
  const anchors = [...document.querySelectorAll("a[href]")];
  let internal = 0, external = 0, nofollow = 0;
  for (const a of anchors) {
    const rel = (a.getAttribute("rel") || "").toLowerCase();
    if (rel.includes("nofollow")) nofollow++;
    try {
      const u = new URL(a.href, location.href);
      if (u.hostname === host) internal++;
      else if (u.protocol.startsWith("http")) external++;
    } catch {}
  }

  // Structured data (JSON-LD types)
  const schemaTypes = new Set();
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const data = JSON.parse(s.textContent);
      const walk = (o) => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (o && typeof o === "object" && o["@type"]) {
          [].concat(o["@type"]).forEach((t) => schemaTypes.add(t));
        }
      };
      walk(data);
    } catch {}
  });

  // Open Graph + Twitter
  const og = {};
  document.querySelectorAll('meta[property^="og:"]').forEach((m) => {
    og[m.getAttribute("property")] = m.getAttribute("content");
  });
  const tw = {};
  document.querySelectorAll('meta[name^="twitter:"]').forEach((m) => {
    tw[m.getAttribute("name")] = m.getAttribute("content");
  });

  // hreflang
  const hreflang = [...document.querySelectorAll('link[rel="alternate"][hreflang]')]
    .map((l) => l.getAttribute("hreflang"));

  // Word count (visible body text)
  const bodyText = (document.body ? document.body.innerText : "") || "";
  const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;

  const canonicalEl = document.querySelector('link[rel="canonical"]');

  return {
    url: location.href,
    protocol: location.protocol,
    title: (document.title || "").trim(),
    metaDescription: meta('meta[name="description"]'),
    metaKeywords: meta('meta[name="keywords"]'),
    robots: meta('meta[name="robots"]'),
    canonical: canonicalEl ? abs(canonicalEl.href) : "",
    viewport: meta('meta[name="viewport"]'),
    charset: document.characterSet || "",
    lang: document.documentElement.getAttribute("lang") || "",
    headings,
    headingList,
    images: { total: imgs.length, missingAlt },
    links: { total: anchors.length, internal, external, nofollow },
    schema: [...schemaTypes],
    og,
    tw,
    hreflang,
    wordCount,
    favicon: !!document.querySelector('link[rel~="icon"]'),
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function buildChecks(d) {
  const checks = [];
  const add = (group, key, status, value) =>
    checks.push({ group, key, status, value });

  // Title
  const tl = d.title.length;
  add("Meta", "Title",
    tl === 0 ? "bad" : tl < 30 || tl > 60 ? "warn" : "good",
    d.title ? `${d.title}  (${tl} chars)` : "Missing");

  // Description
  const dl = d.metaDescription.length;
  add("Meta", "Description",
    dl === 0 ? "bad" : dl < 70 || dl > 160 ? "warn" : "good",
    d.metaDescription ? `${d.metaDescription}  (${dl} chars)` : "Missing");

  // H1
  add("Headings", "H1",
    d.headings.h1 === 0 ? "bad" : d.headings.h1 > 1 ? "warn" : "good",
    d.headings.h1 === 0 ? "No H1" :
    d.headings.h1 > 1 ? `${d.headings.h1} H1s (use one)` :
    d.headingList.h1[0] || "1 H1");

  add("Headings", "Structure",
    d.headings.h2 + d.headings.h3 > 0 ? "good" : "warn",
    `H1:${d.headings.h1} H2:${d.headings.h2} H3:${d.headings.h3} H4:${d.headings.h4}`);

  // Canonical
  add("Meta", "Canonical", d.canonical ? "good" : "warn",
    d.canonical || "Not set");

  // Robots
  const noindex = /noindex/i.test(d.robots);
  add("Meta", "Robots", noindex ? "bad" : "good",
    d.robots ? d.robots + (noindex ? "  ⚠ noindex!" : "") : "Default (indexable)");

  // HTTPS
  add("Technical", "HTTPS", d.protocol === "https:" ? "good" : "bad",
    d.protocol === "https:" ? "Secure" : "Not secure (HTTP)");

  // Viewport
  add("Technical", "Mobile viewport", d.viewport ? "good" : "bad",
    d.viewport || "Missing");

  // Lang
  add("Technical", "Lang attribute", d.lang ? "good" : "warn",
    d.lang || "Not set");

  // Charset
  add("Technical", "Charset", d.charset ? "good" : "warn", d.charset || "Not set");

  // Favicon
  add("Technical", "Favicon", d.favicon ? "good" : "warn",
    d.favicon ? "Present" : "Missing");

  // Images
  add("Content", "Images",
    d.images.total === 0 ? "warn" : d.images.missingAlt > 0 ? "warn" : "good",
    `${d.images.total} images, ${d.images.missingAlt} missing alt`);

  // Links
  add("Content", "Links",
    d.links.total === 0 ? "warn" : "good",
    `${d.links.total} total · ${d.links.internal} internal · ${d.links.external} external · ${d.links.nofollow} nofollow`);

  // Word count
  add("Content", "Word count",
    d.wordCount < 300 ? "warn" : "good",
    `${d.wordCount} words` + (d.wordCount < 300 ? "  (thin content)" : ""));

  // Schema
  add("Social & Data", "Structured data",
    d.schema.length ? "good" : "warn",
    d.schema.length ? d.schema.join(", ") : "None found");

  // OG
  const ogOk = d.og["og:title"] && d.og["og:description"] && d.og["og:image"];
  add("Social & Data", "Open Graph", ogOk ? "good" : "warn",
    ogOk ? "Complete" : Object.keys(d.og).length ? "Partial" : "Missing");

  // Twitter
  add("Social & Data", "Twitter Card",
    d.tw["twitter:card"] ? "good" : "warn",
    d.tw["twitter:card"] ? d.tw["twitter:card"] : "Missing");

  // hreflang
  if (d.hreflang.length)
    add("Social & Data", "hreflang", "good", d.hreflang.join(", "));

  return checks;
}

function scoreOf(checks) {
  const w = { good: 1, warn: 0.5, bad: 0 };
  const total = checks.length;
  const sum = checks.reduce((a, c) => a + w[c.status], 0);
  return Math.round((sum / total) * 100);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const ICON = { good: "🟢", warn: "🟡", bad: "🔴" };

function render(d) {
  const checks = buildChecks(d);
  const score = scoreOf(checks);

  // Score ring
  const color = score >= 80 ? "var(--good)" : score >= 55 ? "var(--warn)" : "var(--bad)";
  const ring = $("scoreRing");
  ring.style.background = `conic-gradient(${color} ${score * 3.6}deg, var(--border) 0deg)`;
  $("scoreNum").textContent = score;
  $("scoreLabel").textContent =
    score >= 80 ? "Good" : score >= 55 ? "Needs work" : "Poor";
  const bad = checks.filter((c) => c.status === "bad").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  $("scoreSub").textContent = `${bad} errors · ${warn} warnings`;

  // Summary pills
  const good = checks.filter((c) => c.status === "good").length;
  $("summary").innerHTML = `
    <div class="pill good"><b>${good}</b>Passed</div>
    <div class="pill warn"><b>${warn}</b>Warnings</div>
    <div class="pill bad"><b>${bad}</b>Errors</div>`;

  // Groups
  const groups = {};
  for (const c of checks) (groups[c.group] ||= []).push(c);
  const order = ["Meta", "Headings", "Content", "Technical", "Social & Data"];
  const box = $("groups");
  box.innerHTML = "";
  for (const g of order) {
    if (!groups[g]) continue;
    const gbad = groups[g].some((c) => c.status === "bad");
    const el = document.createElement("section");
    el.className = "group" + (gbad ? " open" : "");
    el.innerHTML = `
      <div class="group-head">
        <span>${g}</span><span class="chev">›</span>
      </div>
      <div class="group-body">
        ${groups[g].map((c) => `
          <div class="row">
            <span class="ico">${ICON[c.status]}</span>
            <span class="k">${c.key}</span>
            <span class="v status-${c.status}">${escapeHtml(String(c.value))}</span>
          </div>`).join("")}
      </div>`;
    el.querySelector(".group-head").addEventListener("click", () =>
      el.classList.toggle("open"));
    box.appendChild(el);
  }

  $("empty").hidden = true;
  $("results").hidden = false;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function run() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) {
    $("empty").hidden = false;
    $("results").hidden = true;
    $("empty").innerHTML =
      "<p>Open a normal web page (http/https) and try again.</p>";
    return;
  }

  // Quota check (free tier)
  const quota = await Paywall.checkQuota();
  if (!quota.allowed) {
    $("empty").hidden = false;
    $("results").hidden = true;
    $("empty").innerHTML =
      `<p>Daily free limit reached (${Paywall.FREE_DAILY_LIMIT} analyses).<br>
       Upgrade to Pro for unlimited.</p>`;
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing…";
  $("urlBar").hidden = false;
  $("urlBar").textContent = tab.url;

  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractSeo,
    });
    await Paywall.recordUse();
    render(res.result);
    await syncPro();
  } catch (e) {
    $("empty").hidden = false;
    $("results").hidden = true;
    $("empty").innerHTML =
      "<p>Couldn't analyze this page. Chrome blocks extensions on some pages (store, settings).</p>";
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analyze page";
  }
}

async function syncPro() {
  const paid = await Paywall.isPaid();
  $("proBlock").classList.toggle("unlocked", paid);
}
