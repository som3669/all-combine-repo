// Shared content-script helpers. Classic script — everything hangs off window.HR.
// (MV3 content scripts are not ES modules, so a namespace object is the
// simplest thing that works across the file list in the manifest.)

(() => {
  const HR = (window.HR = window.HR || {});

  // ---- formatting --------------------------------------------------------

  HR.fmt = {
    /** 1234567 -> "1.23M" */
    n(v) {
      if (v == null || !Number.isFinite(v)) return '—';
      const abs = Math.abs(v);
      if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
      if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
      return String(Math.round(v));
    },

    /** Exact, with thousands separators. */
    full(v) {
      return v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US');
    },

    money(v) {
      if (v == null || !Number.isFinite(v)) return '—';
      if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
      if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
      if (v >= 10) return `$${Math.round(v)}`;
      return `$${v.toFixed(2)}`;
    },

    /** Revenue range object -> "$1.2K – $2.8K" */
    range(r) {
      if (!r) return '—';
      return `${HR.fmt.money(r.low)} – ${HR.fmt.money(r.high)}`;
    },

    duration(sec) {
      if (!Number.isFinite(sec) || sec <= 0) return '—';
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.round(sec % 60);
      const pad = (n) => String(n).padStart(2, '0');
      return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    },

    ago(ts) {
      if (!ts) return '—';
      const d = Date.now() - ts;
      const units = [
        [31536e6, 'y'],
        [2592e6, 'mo'],
        [6048e5, 'w'],
        [864e5, 'd'],
        [3600e3, 'h'],
        [60e3, 'm'],
      ];
      for (const [ms, label] of units) {
        if (d >= ms) return `${Math.floor(d / ms)}${label} ago`;
      }
      return 'just now';
    },

    pct(v) {
      return v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
    },

    multiplier(v) {
      return v == null ? '—' : `${v >= 10 ? Math.round(v) : v.toFixed(1)}x`;
    },
  };

  // ---- DOM ---------------------------------------------------------------

  /** el('div.foo', {title:'x'}, [child, 'text']) */
  HR.el = function el(spec, attrs = {}, children = []) {
    const [tagPart, ...classes] = String(spec).split('.');
    const node = document.createElement(tagPart || 'div');
    if (classes.length) node.className = classes.join(' ');

    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      // No `html` escape hatch on purpose. Everything this builds goes into a
      // page alongside untrusted text — video titles, comments, channel names —
      // so there is no innerHTML anywhere in the extension and no way for a
      // caller to reintroduce one by accident.
      if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else node.setAttribute(k, v === true ? '' : v);
    }

    for (const child of [].concat(children)) {
      if (child == null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  HR.qs = (sel, root = document) => root.querySelector(sel);
  HR.qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

  /** Resolve once a selector appears, or null after `timeout`. */
  HR.waitFor = (sel, { timeout = 10000, root = document } = {}) =>
    new Promise((resolve) => {
      const hit = root.querySelector(sel);
      if (hit) return resolve(hit);

      const obs = new MutationObserver(() => {
        const found = root.querySelector(sel);
        if (found) {
          obs.disconnect();
          resolve(found);
        }
      });
      obs.observe(root === document ? document.documentElement : root, {
        childList: true,
        subtree: true,
      });
      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeout);
    });

  /** Debounced MutationObserver on a subtree. Returns a disconnect fn. */
  HR.observe = function observe(target, callback, { wait = 250 } = {}) {
    let timer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(callback, wait);
    });
    obs.observe(target, { childList: true, subtree: true });
    return () => {
      clearTimeout(timer);
      obs.disconnect();
    };
  };

  HR.debounce = (fn, wait = 200) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  // ---- page identity -----------------------------------------------------

  HR.page = {
    videoId(url = location.href) {
      const u = new URL(url, location.origin);
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const short = u.pathname.match(/^\/shorts\/([\w-]{11})/);
      return short ? short[1] : null;
    },

    /** Channel id from the URL, when the URL carries one. */
    channelId(url = location.href) {
      const m = String(url).match(/\/channel\/(UC[\w-]{22})/);
      return m ? m[1] : null;
    },

    /** Handle or vanity path — needs a server resolve to become an id. */
    channelRef(url = location.href) {
      const u = new URL(url, location.origin);
      const m = u.pathname.match(/^\/(@[\w.-]+|c\/[\w.-]+|user\/[\w.-]+|channel\/UC[\w-]{22})/);
      return m ? m[1] : null;
    },

    type(url = location.href) {
      const u = new URL(url, location.origin);
      const p = u.pathname;
      if (p === '/watch') return 'watch';
      if (p.startsWith('/shorts/')) return 'shorts';
      if (p === '/results') return 'search';
      if (p === '/' || p === '/feed/subscriptions' || p === '/feed/trending') return 'home';
      if (/^\/(@|c\/|user\/|channel\/)/.test(p)) return 'channel';
      if (p.startsWith('/playlist')) return 'playlist';
      return 'other';
    },
  };

  /** Extract the 11-char video id from any thumbnail/anchor inside a card. */
  HR.videoIdFromCard = (card) => {
    const a = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    if (!a) return null;
    const href = a.getAttribute('href') || '';
    const watch = href.match(/[?&]v=([\w-]{11})/);
    if (watch) return watch[1];
    const short = href.match(/\/shorts\/([\w-]{11})/);
    return short ? short[1] : null;
  };

  /** Parse "1.2M views" style text already rendered on the page. */
  HR.parseCount = (str) => {
    const s = String(str || '').toLowerCase().replace(/,/g, '');
    const m = s.match(/([\d.]+)\s*([kmb])?/);
    if (!m) return null;
    const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? Math.round(n * mult) : null;
  };

  /** "3 years ago" -> ms since epoch, for client-side age filters. */
  HR.parseAge = (str) => {
    const m = String(str || '')
      .toLowerCase()
      .match(/(\d+)\s*(second|minute|hour|day|week|month|year)/);
    if (!m) return null;
    const unit = {
      second: 1e3, minute: 60e3, hour: 3600e3,
      day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6,
    }[m[2]];
    return Date.now() - Number(m[1]) * unit;
  };

  HR.log = (...args) => console.debug('%c[hookrate]', 'color:#ff4d3d', ...args);
})();
