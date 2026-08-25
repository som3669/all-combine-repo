// Popup: analyse whatever the active tab is showing, or anything pasted in.

const send = (action, payload = {}) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, payload }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!res) return reject(new Error('no response'));
      if (!res.ok) return reject(new Error(res.error));
      resolve(res.data);
    });
  });

const $ = (sel) => document.querySelector(sel);
const result = $('#result');

const fmt = {
  n(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return String(Math.round(v));
  },
  money(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  },
  range(r) {
    return r ? `${fmt.money(r.low)}–${fmt.money(r.high)}` : '—';
  },
};

function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) {
    if (kid) node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function cell(k, v) {
  return el('div', { class: 'cell' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })]);
}

function renderChannel(a) {
  const m = a.monetization;
  result.replaceChildren(
    el('div', { class: 'card' }, [
      el('h2', { text: a.title || a.channelId }),
      el('div', {}, [
        m
          ? el('span', {
              class: `chip ${m.monetized ? 'good' : 'bad'}`,
              text: m.monetized ? `monetized (${m.confidence})` : 'no ads seen',
              title: m.basis,
            })
          : null,
        a.country ? el('span', { class: 'chip', text: a.country }) : null,
        a.category ? el('span', { class: 'chip', text: a.category }) : null,
      ]),
      el('div', { class: 'grid' }, [
        cell('Subscribers', fmt.n(a.subscribers)),
        cell('Total views', fmt.n(a.totalViews)),
        cell('Avg / video', fmt.n(a.avgViews)),
        cell('Median', fmt.n(a.medianViews)),
        cell('Rev / month', fmt.range(a.revenue?.monthly)),
        cell('Rev / video', fmt.range(a.revenue?.perVideo)),
        cell('Uploads / mo', a.uploadsPerMonth ?? '—'),
        cell('Last upload', a.daysSinceUpload == null ? '—' : `${a.daysSinceUpload}d`),
      ]),
    ]),
    a.topOutliers?.length
      ? el('div', { class: 'card' }, [
          el('h2', { text: 'Top outliers' }),
          ...a.topOutliers.slice(0, 4).map((v) =>
            el('div', { class: 'row' }, [
              el('img', { src: v.thumbnail, alt: '' }),
              el('div', {}, [
                el('a', { href: `https://www.youtube.com/watch?v=${v.videoId}`, target: '_blank', text: v.title }),
                el('div', {
                  class: 'm',
                  text: `${fmt.n(v.views)} views · ${v.outlier ? `${v.outlier.multiplier}x median` : ''}`,
                }),
              ]),
            ])
          ),
        ])
      : null,
    el('div', { class: 'links' }, [
      el('button', { class: 'btn', text: 'Open channel' }),
    ])
  );

  result.querySelector('.links button').addEventListener('click', () => {
    chrome.tabs.create({ url: a.url });
  });
}

function renderVideo(v) {
  result.replaceChildren(
    el('div', { class: 'card' }, [
      el('h2', { text: v.title }),
      el('div', {}, [
        v.outlier ? el('span', { class: 'chip good', text: `${v.outlier.multiplier}x median` }) : null,
        el('span', { class: `chip ${v.hasAds ? 'good' : 'bad'}`, text: v.hasAds ? 'ads served' : 'no ads seen' }),
      ]),
      el('div', { class: 'grid' }, [
        cell('Views', fmt.n(v.views)),
        cell('Views / hr', fmt.n(v.viewsPerHour)),
        cell('Engagement', v.engagementRate == null ? '—' : `${v.engagementRate}%`),
        cell('Est. revenue', fmt.range(v.revenue)),
      ]),
    ])
  );
}

async function analyse(input) {
  result.replaceChildren(el('div', { class: 'loading', text: 'Working…' }));
  try {
    const videoMatch = String(input).match(/(?:v=|\/shorts\/|youtu\.be\/)([\w-]{11})/);
    if (videoMatch) {
      renderVideo(await send('video.stats', { videoId: videoMatch[1], withChannel: true }));
      return;
    }
    renderChannel(await send('channel.analytics', { channel: input, deep: true }));
  } catch (err) {
    result.replaceChildren(el('div', { class: 'err', text: err.message }));
  }
}

async function init() {
  const manifest = chrome.runtime.getManifest();
  $('#version').textContent = `v${manifest.version}`;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  if (/youtube\.com/.test(url)) {
    const videoId = (url.match(/[?&]v=([\w-]{11})/) || url.match(/\/shorts\/([\w-]{11})/) || [])[1];
    const channelRef = (url.match(/\/(channel\/UC[\w-]{22}|@[\w.-]+)/) || [])[1];

    if (videoId) {
      $('#context').textContent = 'watching a video';
      $('#query').value = url;
      analyse(url);
    } else if (channelRef) {
      $('#context').textContent = 'on a channel page';
      $('#query').value = channelRef;
      analyse(channelRef);
    } else {
      $('#context').textContent = 'on YouTube';
    }
  } else {
    $('#context').textContent = 'open YouTube for in-page tools';
  }

  $('#lookup').addEventListener('click', () => {
    const v = $('#query').value.trim();
    if (v) analyse(v);
  });
  $('#query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#lookup').click();
  });

  $('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('#swipe').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('src/swipe/swipe.html') })
  );
  $('#tracked').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('src/swipe/swipe.html#tracked') })
  );
  $('#clear').addEventListener('click', async () => {
    const { cleared } = await send('cache.clear');
    $('#context').textContent = `cache cleared (${cleared} entries)`;
  });
}

init();
