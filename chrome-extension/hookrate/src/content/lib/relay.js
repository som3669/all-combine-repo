// InnerTube relay.
//
// Why this file exists: the service worker cannot call /youtubei/v1/* itself.
// An extension fetch carries `Origin: chrome-extension://<id>`, YouTube answers
// 403, and `Origin` is a forbidden header name so it cannot be rewritten.
//
// A content script's fetch, by contrast, goes out with the page's own origin.
// So the worker hands the request here and this performs it. `credentials:
// 'omit'` still strips cookies, so the relay does not attach the user's session
// or let Premium suppress the ad-slot fields monetization detection reads.

(() => {
  const ORIGIN = 'https://www.youtube.com';

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.action !== 'relay.innertube') return false;

    const { endpoint, key, clientVersion, body } = msg.payload || {};
    if (!endpoint || !key) {
      respond({ ok: false, error: 'relay called without endpoint or key' });
      return false;
    }

    fetch(`${ORIGIN}/youtubei/v1/${endpoint}?key=${key}&prettyPrint=false`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'content-type': 'application/json',
        'x-youtube-client-name': '1',
        'x-youtube-client-version': clientVersion || '2.20240101.00',
      },
      body: JSON.stringify(body || {}),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`relay ${endpoint} -> ${res.status}`);
        return res.json();
      })
      .then((data) => respond({ ok: true, data }))
      .catch((err) => respond({ ok: false, error: String(err.message || err) }));

    return true; // async response
  });
})();
