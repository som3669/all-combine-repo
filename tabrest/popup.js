const $ = (id) => document.getElementById(id);
const status = (t) => { $("status").textContent = t; };

const DEFAULTS = { enabled: true, idleMinutes: 30 };

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $("enabled").checked = s.enabled;
  $("idle").value = s.idleMinutes;
}

$("enabled").addEventListener("change", async () => {
  await chrome.storage.sync.set({ enabled: $("enabled").checked });
  status($("enabled").checked ? "Auto-suspend on" : "Auto-suspend off");
});

$("idle").addEventListener("change", async () => {
  const v = Math.max(1, Math.min(720, parseInt($("idle").value, 10) || 30));
  $("idle").value = v;
  await chrome.storage.sync.set({ idleMinutes: v });
  status(`Idle set to ${v} min`);
});

function fmtMB(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : Math.round(mb) + " MB";
}

function renderStats() {
  chrome.runtime.sendMessage({ type: "stats" }, (r) => {
    if (!r) return;
    $("stN").textContent = r.current;
    $("stMB").textContent = fmtMB(r.currentBytes);
    $("stLife").textContent = r.lifetimeCount;
    $("undo").hidden = !r.canUndo;
  });
}

async function currentHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return "";
  try { return new URL(tab.url).hostname; } catch { return ""; }
}

$("whitelistSite").addEventListener("click", async () => {
  const host = await currentHost();
  if (!host) { status("Can't whitelist this page"); return; }
  chrome.runtime.sendMessage({ type: "whitelistCurrent", host }, () => {
    status(`Added ${host} to whitelist`);
  });
});

$("undo").addEventListener("click", () => {
  status("Restoring…");
  chrome.runtime.sendMessage({ type: "undoLast" }, (r) => {
    status(`Restored ${r?.restored ?? 0} tabs`);
    renderList(); renderStats();
  });
});

function faviconEl(t) {
  if (t.favicon) {
    const img = document.createElement("img");
    img.className = "fav";
    img.src = t.favicon;
    img.onerror = () => { img.replaceWith(placeholderFav(t)); };
    return img;
  }
  return placeholderFav(t);
}

function placeholderFav(t) {
  const d = document.createElement("div");
  d.className = "fav ph";
  d.textContent = (t.host || t.title || "?").charAt(0).toUpperCase();
  return d;
}

function renderList() {
  chrome.runtime.sendMessage({ type: "listSuspended" }, (r) => {
    const ul = $("list");
    ul.innerHTML = "";
    const tabs = r?.tabs ?? [];
    if (!tabs.length) {
      ul.innerHTML = '<li class="empty">No suspended tabs yet</li>';
      return;
    }
    for (const t of tabs) {
      const li = document.createElement("li");

      const meta = document.createElement("div");
      meta.className = "meta";
      const title = document.createElement("div");
      title.className = "t";
      title.textContent = t.title;
      const host = document.createElement("div");
      host.className = "h";
      host.textContent = t.host;
      meta.append(title, host);

      const btn = document.createElement("button");
      btn.textContent = "Restore";
      btn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "restoreTab", tabId: t.id }, () => { renderList(); renderStats(); });
      });

      li.append(faviconEl(t), meta, btn);
      ul.appendChild(li);
    }
  });
}

$("suspendAll").addEventListener("click", () => {
  status("Suspending…");
  chrome.runtime.sendMessage({ type: "suspendAll" }, (r) => {
    status(`Suspended ${r?.suspended ?? 0} tabs`);
    renderList(); renderStats();
  });
});

$("scanNow").addEventListener("click", () => {
  status("Scanning…");
  chrome.runtime.sendMessage({ type: "scanNow" }, () => { status("Scan done"); renderList(); renderStats(); });
});

load();
renderList();
renderStats();
