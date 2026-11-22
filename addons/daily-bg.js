/* Daily background photo (home and forecast pages).
 * Picks one photo per day (Tampa date) from addons/bg-photos.js, all free-licensed Wikimedia Commons featured
 * pictures, shows it dimmed behind the page, and adds the required credit: title, author, license and links. */
'use strict';
(() => {
  const list = window.WB_BG_PHOTOS;
  if (!Array.isArray(list) || !list.length) return;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());   // 2026-11-22
  const pickFor = ymd => list[Math.floor(Date.parse(ymd + 'T00:00:00Z') / 86400e3) % list.length];

  const bg = document.createElement('div');
  bg.className = 'wb-bg';
  bg.setAttribute('aria-hidden', 'true');
  document.body.prepend(bg);
  document.documentElement.classList.add('wb-has-bg');

  const credit = document.createElement('div');
  credit.className = 'wb-bg-credit';
  (document.querySelector('#home > footer') || document.getElementById('fc') || document.body).appendChild(credit);

  let shown = '';
  function show() {
    const day = today();
    if (day === shown) return;
    shown = day;
    const start = list.indexOf(pickFor(day));
    const big = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) > 1600 && innerWidth > 760;
    // Try today's photo (both sizes), then the next ones, so a busy image server never leaves the page bare.
    const tries = [];
    for (let k = 0; k < 3; k++) for (const w of big ? [1920, 1280] : [1280, 1920]) tries.push([list[(start + k) % list.length], w]);
    const attempt = n => {
      if (n >= tries.length) return;
      const [ph, w] = tries[n], file = ph.p.split('/').pop();
      const src = `https://upload.wikimedia.org/wikipedia/commons/thumb/${ph.p}/${w}px-${file}`;
      const img = new Image();
      img.onload = () => { bg.style.backgroundImage = `url("${src}")`; bg.classList.add('on'); writeCredit(ph); };
      img.onerror = () => attempt(n + 1);
      img.src = src;
    };
    writeCredit(list[start]);
    attempt(0);
  }
  function writeCredit(ph) {
    const title = ph.f.replace(/\.(jpe?g)$/i, '');
    const author = ph.a.replace(/\s*\[\d+\]\s*$/, '').replace(/\.$/, '');
    credit.innerHTML = `<span aria-hidden="true">&#x1F4F7;</span> Today's background: <a href="${esc(ph.pg)}" target="_blank" rel="noopener">${esc(title)}</a>` +
      ` by ${esc(author)}, <a href="${esc(ph.lu)}" target="_blank" rel="noopener license">${esc(ph.l)}</a>, via Wikimedia Commons (cropped and dimmed). A new photo every day.`;
  }
  show();
  setInterval(show, 30 * 60e3);   // switch over after midnight if the page stays open
})();
