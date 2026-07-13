// SEO Inspector - paywall / license gate (FastSpring + Cloudflare Worker).
//
// Flow:
//   openUpgrade()  -> opens the FastSpring hosted storefront in a new tab
//   user buys      -> FastSpring emails a license key + webhook marks it valid
//   activateKey()  -> POSTs the key to your Worker /validate endpoint
//                     -> on success, stores { licensed:true, licenseKey } locally
//   isPaid()       -> reads that local flag; re-validates periodically

const Paywall = (() => {
  // ---- CONFIG: set these to your own URLs ----
  const STORE_URL = "https://YOUR-STORE.onfastspring.com/seo-inspector-pro";
  const VALIDATE_URL = "https://YOUR-WORKER.workers.dev/validate";
  // --------------------------------------------

  const FREE_DAILY_LIMIT = 15;
  const REVALIDATE_MS = 1000 * 60 * 60 * 24; // re-check key once a day

  async function isPaid() {
    const { licensed = false, licenseKey, licenseCheckedAt = 0 } =
      await chrome.storage.local.get(["licensed", "licenseKey", "licenseCheckedAt"]);
    if (!licensed || !licenseKey) return false;

    // Periodic silent re-validation (handles refunds/revocation).
    if (Date.now() - licenseCheckedAt > REVALIDATE_MS) {
      const res = await validate(licenseKey);
      if (!res.valid) {
        await chrome.storage.local.set({ licensed: false });
        return false;
      }
      await chrome.storage.local.set({ licenseCheckedAt: Date.now() });
    }
    return true;
  }

  // Call the Worker to check a key. Returns { valid:bool, message }.
  async function validate(key) {
    try {
      const r = await fetch(VALIDATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      if (!r.ok) return { valid: false, message: "Server error. Try again." };
      const data = await r.json();
      return { valid: !!data.valid, message: data.message || "" };
    } catch {
      return { valid: false, message: "Network error. Check connection." };
    }
  }

  // Activate a key entered by the user.
  async function activateKey(key) {
    if (!key || !key.trim()) return { ok: false, message: "Enter a license key." };
    const res = await validate(key);
    if (res.valid) {
      await chrome.storage.local.set({
        licensed: true,
        licenseKey: key.trim(),
        licenseCheckedAt: Date.now(),
      });
      return { ok: true, message: "Pro unlocked. Thank you!" };
    }
    return { ok: false, message: res.message || "Invalid or unrecognized key." };
  }

  async function deactivate() {
    await chrome.storage.local.set({ licensed: false, licenseKey: "" });
  }

  function openUpgrade() {
    chrome.tabs.create({ url: STORE_URL });
  }

  // ---- free-tier daily quota ----
  async function checkQuota() {
    if (await isPaid()) return { allowed: true, remaining: Infinity };
    const today = new Date().toISOString().slice(0, 10);
    const { usage = {} } = await chrome.storage.local.get("usage");
    const used = usage.date === today ? usage.count : 0;
    return { allowed: used < FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) };
  }

  async function recordUse() {
    if (await isPaid()) return;
    const today = new Date().toISOString().slice(0, 10);
    const { usage = {} } = await chrome.storage.local.get("usage");
    const count = usage.date === today ? usage.count + 1 : 1;
    await chrome.storage.local.set({ usage: { date: today, count } });
  }

  return { isPaid, activateKey, deactivate, openUpgrade, checkQuota, recordUse, FREE_DAILY_LIMIT };
})();

window.Paywall = Paywall;
