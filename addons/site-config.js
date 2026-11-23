/* Add-on: applies the owner's admin settings (site-config.json, edited on admin.html) on top of the base site.
 * With no settings, nothing changes: the site looks exactly like base v2.
 * Settings: announcement banner, accent color, greeting and Storm Loop button, home-page section order /
 * visibility / headings, hidden home tiles, background photo (daily, pinned, custom, off) and its darkness.
 * The last settings are remembered on the device so pages open without a flash, then refreshed from the site.
 * An unsaved admin preview (localStorage 'wb.cfg.preview') takes priority on that device only. */
'use strict';
(() => {
  const CACHE_KEY = 'wb.cfg.cache', PREVIEW_KEY = 'wb.cfg.preview';
  const page = document.getElementById('home') ? 'home' : document.getElementById('fc') ? 'forecast'
    : document.getElementById('learn') ? 'learn' : document.getElementById('panel') ? 'radar' : 'other';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } } };
  const safeUrl = u => {   // only http(s) links or links inside the site
    const s = String(u || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s) || /^[\w./#?=&-]+$/.test(s)) return s.replace(/["'()\\\s<>]/g, encodeURIComponent);
    return '';
  };

  // ---------- one style sheet for everything this add-on sets ----------
  const css = document.createElement('style');
  css.id = 'wb-cfg-css';
  document.head.appendChild(css);
  const base = `
    .wb-ann { display:flex; gap:10px; align-items:flex-start; border-radius:12px; padding:10px 14px; margin:0 0 12px; font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;
      color:#e6edf3; border:1px solid #2f5b94; background:rgba(29,42,61,.94); }
    .wb-ann.warn { border-color:#9a7414; background:rgba(58,46,18,.94); }
    .wb-ann.danger { border-color:#a33a3f; background:rgba(61,29,32,.94); }
    .wb-ann-txt { flex:1; min-width:0; }
    .wb-ann a { color:#9cc9ff; font-weight:700; }
    .wb-ann-x { background:none; border:0; color:#8b949e; font-size:20px; line-height:1; cursor:pointer; padding:0 2px; }
    #panel .wb-ann { margin:10px 0 4px; }
    .wb-cfg-hidden { display:none !important; }
    .wb-prev { position:fixed; z-index:5000; left:50%; transform:translateX(-50%); bottom:calc(76px + env(safe-area-inset-bottom)); display:flex; gap:10px; align-items:center;
      background:#3b2f9e; color:#fff; border-radius:999px; padding:8px 8px 8px 14px; font:600 13px system-ui,-apple-system,sans-serif; box-shadow:0 6px 18px rgba(0,0,0,.5); }
    .wb-prev a, .wb-prev button { color:#fff; background:rgba(255,255,255,.18); border:0; border-radius:999px; padding:6px 10px; font:inherit; cursor:pointer; text-decoration:none; }`;

  let cfg = {};
  const preview = store.get(PREVIEW_KEY);
  const usingPreview = !!(preview && preview.cfg && Date.now() - (preview.at || 0) < 24 * 3600e3);
  if (preview && !usingPreview) store.del(PREVIEW_KEY);

  // ---------- apply ----------
  function apply(c) {
    cfg = c && typeof c === 'object' ? c : {};
    let rules = base;

    // accent color
    const accent = /^#[0-9a-f]{6}$/i.test(cfg.accent || '') ? cfg.accent : '';
    if (accent) rules += `
      .h-radar-btn, .wb-units button.on, .ln-cats button.on, .la-chips button.on, .la-play, .wb-btn { background:${accent} !important; border-color:${accent} !important; }
      .h-more, .wb-learn-go, .h-loop-btn span, .ln-body a, .ln-src a { color:${accent} !important; }
      a.card:hover, .h-chips a:hover, .wb-learn:hover { border-color:${accent} !important; }`;

    // background darkness (0 = photo fully visible, 100 = almost black); 50 = the base look
    const bg = cfg.background || {};
    if (Number.isFinite(bg.dim) && bg.dim !== 50) {
      const k = Math.max(0, Math.min(100, bg.dim)) / 50;
      const a = v => Math.max(0, Math.min(.97, v * k)).toFixed(2);
      rules += `.wb-bg::after { background: linear-gradient(180deg, rgba(13,17,23,${a(.22)}) 0%, rgba(13,17,23,${a(.5)}) 45%, rgba(13,17,23,${a(.78)}) 100%) !important; }`;
    }
    css.textContent = rules;

    announcement();
    if (page === 'home') home();
    background();
  }

  // ---------- announcement banner (every page) ----------
  function announcement() {
    document.querySelectorAll('.wb-ann').forEach(n => n.remove());
    const a = cfg.announcement;
    if (!a || !a.on || !String(a.text || '').trim()) return;
    const id = String(a.id || a.text).slice(0, 80);
    if (store.get('wb.ann.closed') === id) return;
    const el = document.createElement('div');
    el.className = 'wb-ann ' + (a.level === 'warn' || a.level === 'danger' ? a.level : '');
    el.setAttribute('role', a.level === 'danger' ? 'alert' : 'status');
    const link = safeUrl(a.link);
    el.innerHTML = `<div class="wb-ann-txt">${esc(String(a.text).slice(0, 300))}${link ? ` <a href="${esc(link)}">${esc(a.linkText || 'Read more')} &#x203A;</a>` : ''}</div>` +
      '<button type="button" class="wb-ann-x" aria-label="Hide this message">&times;</button>';
    el.querySelector('.wb-ann-x').addEventListener('click', () => { el.remove(); store.set('wb.ann.closed', id); });
    const spot = page === 'home' ? document.getElementById('hAlerts')
      : page === 'radar' ? document.querySelector('#panel .brand')
      : document.querySelector('#fc .fc-head, #learn .ln-head, main');
    if (!spot) return;
    if (page === 'radar') spot.after(el);
    else if (page === 'home') spot.before(el);
    else if (spot.tagName === 'MAIN') spot.prepend(el); else spot.after(el);
  }

  // ---------- home page layout ----------
  const SECTIONS = {   // key -> elements in that section
    learn: () => [document.querySelector('.wb-learn')],
    radar: () => { const m = document.querySelector('#home > .h-map'); return [m?.previousElementSibling?.classList.contains('h-sec') ? m.previousElementSibling : null, m]; },
    now: () => { const g = document.querySelector('#home > .h-grid'); return [g?.previousElementSibling?.classList.contains('h-sec') ? g.previousElementSibling : null, g]; },
    coming: () => { const g = document.querySelector('#home > .h-grid2'); return [g?.previousElementSibling?.classList.contains('h-sec') ? g.previousElementSibling : null, g]; },
    quick: () => [document.querySelector('#home > .h-quick')],
  };
  const TILES = ['tStorms', 'tLightning', 'tRain', 'tWind', 'tSunUv', 'tTides', 'tAir', 'tSky', 'tPhone', 'tForecast', 'hWeekBox'];
  const originalTitles = {};
  function home() {
    const h = cfg.home || {};
    document.querySelectorAll('#home .wb-cfg-hidden').forEach(n => n.classList.remove('wb-cfg-hidden'));
    const week = document.getElementById('hWeek')?.closest('.h-week');
    if (week && !week.id) week.id = 'hWeekBox';

    // order: sections listed first in the given order, then any not listed in their usual order
    const hero = document.getElementById('hHero');
    const order = Array.isArray(h.order) ? h.order.filter(k => SECTIONS[k]) : [];
    if (hero && order.length) {
      const all = [...order, ...Object.keys(SECTIONS).filter(k => !order.includes(k))];
      let at = hero;
      for (const k of all) for (const n of SECTIONS[k]()) if (n) { at.after(n); at = n; }
    }
    // hide sections and tiles
    const hidden = new Set(Array.isArray(h.hidden) ? h.hidden : []);
    for (const k of Object.keys(SECTIONS)) if (hidden.has(k)) SECTIONS[k]().forEach(n => n?.classList.add('wb-cfg-hidden'));
    const hideTiles = new Set(Array.isArray(h.hiddenTiles) ? h.hiddenTiles : []);
    for (const id of TILES) if (hideTiles.has(id)) document.getElementById(id)?.classList.add('wb-cfg-hidden');
    // headings
    const titles = h.titles || {};
    for (const k of ['radar', 'now', 'coming']) {
      const sec = SECTIONS[k]()[0]; if (!sec) continue;
      if (!(k in originalTitles)) originalTitles[k] = sec.textContent;
      const t = String(titles[k] || '').trim().slice(0, 60);
      sec.textContent = t || originalTitles[k];
    }
    // header bits
    if (h.greeting === false) document.getElementById('hGreet')?.classList.add('wb-cfg-hidden');
    if (h.loopButton === false) document.querySelector('.h-loop-btn')?.classList.add('wb-cfg-hidden');
  }

  // ---------- background photo ----------
  let lastBgKey = '';
  function background() {
    const bg = cfg.background || {}, mode = bg.mode || 'daily';
    const el = document.querySelector('.wb-bg'), credit = document.querySelector('.wb-bg-credit');
    if (!el) return;
    document.documentElement.classList.toggle('wb-has-bg', mode !== 'off');
    el.classList.toggle('wb-cfg-hidden', mode === 'off');
    credit?.classList.toggle('wb-cfg-hidden', mode === 'off');
    if (mode === 'off' || mode === 'daily') { lastBgKey = mode; return; }

    let src = '', creditHtml = '';
    if (mode === 'pinned') {
      const ph = (window.WB_BG_PHOTOS || []).find(p => p.f === bg.pinned);
      if (!ph) return;
      const file = ph.p.split('/').pop(), w = innerWidth > 760 ? 1920 : 1280;
      src = `https://upload.wikimedia.org/wikipedia/commons/thumb/${ph.p}/${w}px-${file}`;
      creditHtml = `<span aria-hidden="true">&#x1F4F7;</span> Background: <a href="${esc(ph.pg)}" target="_blank" rel="noopener">${esc(ph.f.replace(/\.(jpe?g)$/i, ''))}</a>` +
        ` by ${esc(ph.a.replace(/\s*\[\d+\]\s*$/, '').replace(/\.$/, ''))}, <a href="${esc(ph.lu)}" target="_blank" rel="noopener license">${esc(ph.l)}</a>, via Wikimedia Commons (cropped and dimmed).`;
    } else if (mode === 'custom') {
      const c = bg.custom || {};
      if (!/^https:\/\//i.test(c.url || '')) return;
      src = c.url;
      const pageUrl = safeUrl(c.page), lic = safeUrl(c.licenseUrl);
      creditHtml = `<span aria-hidden="true">&#x1F4F7;</span> Background: ${pageUrl ? `<a href="${esc(pageUrl)}" target="_blank" rel="noopener">${esc(c.title || 'Photo')}</a>` : esc(c.title || 'Photo')}` +
        `${c.author ? ` by ${esc(c.author)}` : ''}${c.license ? `, ${lic ? `<a href="${esc(lic)}" target="_blank" rel="noopener license">${esc(c.license)}</a>` : esc(c.license)}` : ''} (cropped and dimmed).`;
    }
    const key = mode + '|' + src;
    if (key === lastBgKey && el.style.backgroundImage.includes(encodeURI(src).slice(0, 40))) return;
    lastBgKey = key;
    const img = new Image();
    img.onload = () => { el.style.backgroundImage = `url("${src.replace(/["\\]/g, encodeURIComponent)}")`; el.classList.add('on'); if (credit) credit.innerHTML = creditHtml; };
    img.src = src;
  }
  // the daily photo add-on switches at midnight; keep a pinned/custom choice in place
  setInterval(() => { if ((cfg.background || {}).mode === 'pinned' || (cfg.background || {}).mode === 'custom') { lastBgKey = ''; background(); } }, 10 * 60e3);

  // ---------- load ----------
  if (usingPreview) {
    apply(preview.cfg);
    const bar = document.createElement('div');
    bar.className = 'wb-prev';
    bar.innerHTML = 'Admin preview (only on this device) <a href="admin.html">Back to admin</a><button type="button">Exit preview</button>';
    bar.querySelector('button').addEventListener('click', () => { store.del(PREVIEW_KEY); location.reload(); });
    document.body.appendChild(bar);
  } else {
    apply(store.get(CACHE_KEY) || {});
    fetch('site-config.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then(c => { if (JSON.stringify(c) !== JSON.stringify(cfg)) apply(c); store.set(CACHE_KEY, c); })
      .catch(() => { /* offline: keep the remembered settings */ });
  }
  window.WBSiteConfig = { get config() { return cfg; }, preview: usingPreview };
})();
