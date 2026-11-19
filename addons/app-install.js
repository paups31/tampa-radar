/* WeatherBoy Radar as a phone app.
 *  - registers the service worker (sw.js) so the site installs as a real app and opens without signal
 *  - on the home page, shows how to install it (iPhone steps, Android "Install" button, or a QR code on a computer)
 *  - inside the installed app on a phone, adds a bottom tab bar (Home / Radar / Forecast) since there is no browser bar
 * Loaded by home.html, forecast.html and (as an add-on) index.html. */
'use strict';
(() => {
  const PUBLIC_URL = 'https://paups31.github.io/tampa-radar/home.html';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isPhone = matchMedia('(max-width: 760px)').matches || /Android|iPhone/.test(ua);
  const page = document.getElementById('home') ? 'home' : document.getElementById('fc') ? 'forecast' : 'radar';
  document.documentElement.classList.toggle('wb-app', standalone);
  window.WeatherBoyApp = { standalone };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  const css = document.createElement('style');
  css.textContent = `
    .wb-install { background:#161b22; border:1px solid #1f6feb; border-radius:14px; padding:14px 16px; margin-bottom:12px;
      display:flex; gap:16px; align-items:center; flex-wrap:wrap; color:#e6edf3; }
    .wb-install h2 { margin:0 0 4px; font-size:16px; }
    .wb-install p, .wb-install ol { margin:4px 0; color:#b8c2cc; font-size:14px; }
    .wb-install ol { padding-left:20px; }
    .wb-install .wb-qr { background:#fff; padding:8px; border-radius:10px; line-height:0; }
    .wb-install .wb-x { margin-left:auto; align-self:flex-start; background:none; border:0; color:#8b949e; font-size:22px; cursor:pointer; }
    .wb-install .wb-btn { background:#1f6feb; color:#fff; border:0; border-radius:10px; padding:11px 18px; font:inherit; font-weight:700; cursor:pointer; min-height:44px; }
    .wb-share { display:inline-block; width:16px; height:18px; vertical-align:-3px; }
    .wb-tabs { position:fixed; left:0; right:0; bottom:0; z-index:3000; display:flex; background:rgba(13,17,23,.97);
      border-top:1px solid #30363d; padding-bottom:env(safe-area-inset-bottom); backdrop-filter:blur(8px); }
    .wb-tabs a { flex:1; text-align:center; color:#8b949e; text-decoration:none; font:600 11px/1.2 system-ui,sans-serif; padding:7px 0 6px; }
    .wb-tabs a span { display:block; font-size:21px; line-height:1.15; }
    .wb-tabs a.on { color:#58a6ff; }
    html.wb-tabbed body { padding-bottom:calc(64px + env(safe-area-inset-bottom)); }
    .wb-home-fab { position:absolute; z-index:1001; left:10px; top:calc(58px + env(safe-area-inset-top)); width:44px; height:44px; border-radius:12px;
      background:rgba(13,17,23,.9); border:1px solid #30363d; color:#e6edf3; display:flex; align-items:center; justify-content:center;
      font-size:22px; text-decoration:none; box-shadow:0 4px 12px rgba(0,0,0,.4); }`;
  document.head.appendChild(css);

  // ---------- bottom tab bar (phones, home + forecast pages) ----------
  if (isPhone && page !== 'radar') {
    const nav = document.createElement('nav');
    nav.className = 'wb-tabs';
    nav.innerHTML = [['home.html', '⌂', 'Home', 'home'], ['index.html', '\u{1F4E1}', 'Radar', 'radar'],
      ['index.html?show=lightning', '⚡', 'Lightning', 'x'], ['forecast.html', '\u{1F4C5}', 'Forecast', 'forecast']]
      .map(([h, i, t, k]) => `<a href="${h}" class="${k === page ? 'on' : ''}"><span>${i}</span>${t}</a>`).join('');
    document.body.appendChild(nav);
    document.documentElement.classList.add('wb-tabbed');
  }
  // ---------- radar page on a phone: a Home button floating on the map ----------
  if (page === 'radar' && isPhone) {
    const wrap = document.getElementById('mapWrap');
    if (wrap) {
      const a = document.createElement('a');
      a.href = 'home.html'; a.className = 'wb-home-fab'; a.title = 'Home'; a.innerHTML = '&#x2302;';
      wrap.appendChild(a);
    }
  }

  // ---------- install card (home page, only when not already installed) ----------
  if (page !== 'home' || standalone) return;
  let dismissed = false;
  try { dismissed = localStorage.getItem('wb.install.dismissed') === '1'; } catch { /* ignore */ }
  if (dismissed) return;
  const card = document.createElement('section');
  card.className = 'wb-install';
  const close = '<button class="wb-x" title="Hide" aria-label="Hide">&times;</button>';
  const share = '<svg class="wb-share" viewBox="0 0 16 20" fill="none" stroke="#58a6ff" stroke-width="1.6"><path d="M8 13V2M4.5 5.5 8 2l3.5 3.5"/><path d="M5 8H2.5v10.5h11V8H11"/></svg>';
  if (isIOS) {
    card.innerHTML = `<div><h2>&#x1F4F2; Get WeatherBoy as an app</h2><ol>
      <li>Open this page in <b>Safari</b>.</li>
      <li>Tap the <b>Share</b> button ${share} at the bottom of the screen.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
      <p>WeatherBoy then opens full-screen from its own icon, like any other app.</p></div>${close}`;
  } else if (isPhone) {
    card.innerHTML = `<div><h2>&#x1F4F2; Get WeatherBoy as an app</h2>
      <p>Install it to your home screen. It opens full-screen from its own icon, like any other app.</p>
      <button class="wb-btn" id="wbInstall" hidden>Install app</button>
      <p id="wbManual">In Chrome: tap <b>&#x22EE;</b> (top right) &rarr; <b>Install app</b> or <b>Add to Home screen</b>.</p></div>${close}`;
  } else {
    card.innerHTML = `<div class="wb-qr" id="wbQr"></div><div><h2>&#x1F4F2; Put WeatherBoy on your phone</h2>
      <p>Point your phone's camera at this code and open the link.</p>
      <p><b>iPhone:</b> in Safari tap Share ${share} &rarr; <b>Add to Home Screen</b>.<br><b>Android:</b> in Chrome tap <b>&#x22EE;</b> &rarr; <b>Install app</b>.</p>
      <p class="small" style="color:#8b949e">${PUBLIC_URL}</p></div>${close}`;
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => new QRCode(card.querySelector('#wbQr'), { text: PUBLIC_URL, width: 132, height: 132, correctLevel: QRCode.CorrectLevel.M });
    document.head.appendChild(s);
  }
  const anchor = document.querySelector('.h-head');
  anchor.after(card);
  card.querySelector('.wb-x').addEventListener('click', () => { card.remove(); try { localStorage.setItem('wb.install.dismissed', '1'); } catch { /* ignore */ } });

  // Android / Chrome: real one-tap install prompt
  let deferred = null;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    const b = card.querySelector('#wbInstall'); if (!b) return;
    b.hidden = false; card.querySelector('#wbManual').hidden = true;
    b.onclick = async () => { deferred.prompt(); const r = await deferred.userChoice; if (r.outcome === 'accepted') card.remove(); };
  });
  addEventListener('appinstalled', () => card.remove());
})();
