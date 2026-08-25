// Swipe file + tracked channels page.

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

const $ = (s) => document.querySelector(s);

function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2), v);
    } else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of [].concat(kids)) {
    if (kid) node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

const fmt = {
  n(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return String(Math.round(v));
  },
  signed(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    return `${v > 0 ? '+' : ''}${fmt.n(v)}`;
  },
  date(ts) {
    return ts ? new Date(ts).toLocaleString() : '—';
  },
};

// ---- swipe items --------------------------------------------------------

let state = { folders: [], items: [], total: 0 };

function itemCard(item) {
  const thumb = item.thumbnail
    ? el('img', { src: item.thumbnail, alt: '', loading: 'lazy' })
    : null;

  const note = el('textarea', {
    class: 'note',
    placeholder: 'Note — why did you save this?',
    onchange: async (e) => {
      await send('swipe.update', { itemId: item.id, patch: { note: e.target.value } });
    },
  });
  note.value = item.note || '';

  const metaBits = [
    item.type,
    item.meta?.views != null ? `${fmt.n(item.meta.views)} views` : null,
    item.meta?.outlier ? `${item.meta.outlier}x median` : null,
    item.meta?.subscribers != null ? `${fmt.n(item.meta.subscribers)} subs` : null,
    item.meta?.channelTitle,
    new Date(item.savedAt).toLocaleDateString(),
  ].filter(Boolean);

  return el('div', { class: `card ${item.type}` }, [
    thumb,
    el('div', { class: 'card-body' }, [
      el('a', { href: item.url || '#', target: '_blank', rel: 'noopener', text: item.title || item.ref }),
      el('div', { class: 'meta', text: metaBits.join(' · ') }),
      (item.tags || []).length
        ? el('div', {}, item.tags.map((t) => el('span', { class: 'tag', text: t })))
        : null,
      note,
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: 'btn',
          text: 'Remove',
          onclick: async () => {
            await send('swipe.remove', { itemId: item.id });
            load();
          },
        }),
        item.type === 'channel'
          ? el('button', {
              class: 'btn',
              text: 'Track',
              onclick: async () => {
                await send('tracker.add', { channel: item.ref });
                alert('Tracking started.');
              },
            })
          : el('button', {
              class: 'btn',
              text: 'Thumbnail',
              onclick: () =>
                send('download.thumbnail', { videoId: item.ref }).catch((e) => alert(e.message)),
            }),
      ]),
    ]),
  ]);
}

async function load() {
  const query = $('#search').value.trim();
  const type = $('#type').value;
  const folderId = $('#folder').value;

  try {
    state = await send('swipe.list', { query, type, folderId: folderId || undefined });
  } catch (err) {
    $('#items').replaceChildren(el('div', { class: 'empty err', text: err.message }));
    return;
  }

  const folderSelect = $('#folder');
  if (folderSelect.options.length !== state.folders.length + 1) {
    folderSelect.replaceChildren(
      el('option', { value: '', text: 'All folders' }),
      ...state.folders.map((f) => el('option', { value: f.id, text: f.name }))
    );
    folderSelect.value = folderId;
  }

  $('#count').textContent = `${state.items.length} shown · ${state.total} saved`;
  $('#items').replaceChildren(
    ...(state.items.length
      ? state.items.map(itemCard)
      : [
          el('div', {
            class: 'empty',
            text: 'Nothing saved yet. Use the ＋ buttons on YouTube to fill this up.',
          }),
        ])
  );
}

// ---- tracked channels ---------------------------------------------------

function deltaCell(label, d, field = 'change') {
  const value = d ? d[field] : null;
  const cls = value > 0 ? 'v up' : value < 0 ? 'v down' : 'v';
  return el('div', { class: 'delta' }, [
    el('div', { class: 'k', text: label }),
    el('div', { class: cls, text: fmt.signed(value) }),
  ]);
}

async function loadTracked() {
  const host = $('#tracked');
  host.replaceChildren(el('div', { class: 'empty', text: 'Loading…' }));

  try {
    const rows = await send('tracker.list');
    if (!rows.length) {
      host.replaceChildren(
        el('div', {
          class: 'empty',
          text: 'No channels tracked. Hit Track on any channel page to start collecting snapshots.',
        })
      );
      return;
    }

    host.replaceChildren(
      ...rows.map((r) =>
        el('div', { class: 'track' }, [
          r.avatar ? el('img', { src: r.avatar, alt: '' }) : el('div', { class: 'delta' }),
          el('div', {}, [
            el('a', {
              class: 'name',
              href: `https://www.youtube.com/channel/${r.channelId}`,
              target: '_blank',
              rel: 'noopener',
              text: r.title,
            }),
            el('div', { class: 'muted', text: `${fmt.n(r.current?.subscribers)} subs · ${r.points} snapshots · last poll ${fmt.date(r.polledAt)}` }),
            r.lastError ? el('div', { class: 'muted err', text: r.lastError }) : null,
          ]),
          el('div', { class: 'deltas' }, [
            deltaCell('Subs 24h', r.subs24h),
            deltaCell('Subs 7d', r.subs7d),
            deltaCell('Subs 30d', r.subs30d),
            deltaCell('Views 24h', r.views24h),
            deltaCell('Views 7d', r.views7d),
            el('button', {
              class: 'btn',
              text: 'Stop',
              onclick: async () => {
                await send('tracker.remove', { channelId: r.channelId });
                loadTracked();
              },
            }),
          ]),
        ])
      )
    );
  } catch (err) {
    host.replaceChildren(el('div', { class: 'empty err', text: err.message }));
  }
}

// ---- wiring -------------------------------------------------------------

function showTab(name) {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
  }
  $('#tab-items').hidden = name !== 'items';
  $('#tab-tracked').hidden = name !== 'tracked';
  if (name === 'tracked') loadTracked();
  else load();
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
}

$('#search').addEventListener('input', () => {
  clearTimeout(window.__t);
  window.__t = setTimeout(load, 220);
});
$('#type').addEventListener('change', load);
$('#folder').addEventListener('change', load);
$('#poll').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Polling…';
  try {
    await send('tracker.pollAll');
    await loadTracked();
  } finally {
    e.target.disabled = false;
    e.target.textContent = 'Poll now';
  }
});

$('#export').addEventListener('click', async () => {
  const data = await send('swipe.export');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', {
    href: URL.createObjectURL(blob),
    download: `hookrate-swipe-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.append(a);
  a.click();
  a.remove();
});

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const res = await send('swipe.import', { payload, merge: true });
    alert(`Imported ${res.imported} items (${res.mode}).`);
    load();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  } finally {
    e.target.value = '';
  }
});

$('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());

showTab(location.hash === '#tracked' ? 'tracked' : 'items');
