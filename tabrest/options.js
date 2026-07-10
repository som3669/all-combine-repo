const $ = (id) => document.getElementById(id);

const DEFAULTS = { skipAudible: true, skipPinned: true, whitelist: [], rules: [] };

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $("skipAudible").checked = s.skipAudible;
  $("skipPinned").checked = s.skipPinned;
  $("whitelist").value = (s.whitelist || []).join("\n");
  $("rules").value = (s.rules || [])
    .map((r) => `${r.host} = ${r.minutes}`)
    .join("\n");
}

// Parse "host = minutes" lines into [{host, minutes}]. Skips bad lines.
function parseRules(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^(\S+)\s*=\s*(\d+)$/);
    if (!m) continue;
    const minutes = parseInt(m[2], 10);
    if (minutes < 1) continue;
    out.push({ host: m[1].toLowerCase(), minutes });
  }
  return out;
}

$("save").addEventListener("click", async () => {
  const whitelist = $("whitelist").value
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  const rules = parseRules($("rules").value);
  await chrome.storage.sync.set({
    skipAudible: $("skipAudible").checked,
    skipPinned: $("skipPinned").checked,
    whitelist,
    rules
  });
  $("status").textContent = "Saved ✓";
  setTimeout(() => ($("status").textContent = ""), 1500);
});

load();
