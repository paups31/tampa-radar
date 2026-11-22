/* Add-on: keeps the radar live on phones (and everywhere else).
 *  - LIVE badge on the map: age of the newest radar scan and a countdown to the next check; tap it to refresh now
 *  - checks for a new radar scan every 60 s and pulls it in as soon as it lands (and refreshes the loop if playing)
 *  - when the app comes back to the screen (unlocked, switched back, signal returns) it catches up straight away
 *  - "Reload app" for when a phone has been asleep for a long time, and an optional "keep screen on" while watching
 * Home and forecast pages: catch up when reopened. Uses only the base app's public UI and globals. */
'use strict';
(() => {
  const page = document.getElementById('home') ? 'home' : document.getElementById('fc') ? 'forecast' : 'radar';
  let hiddenAt = 0;

  // ---------- home + forecast: catch up when the app is reopened ----------
  if (page !== 'radar') {
    const resume = () => {
      if (!hiddenAt) return;
      const away = Date.now() - hiddenAt; hiddenAt = 0;
      if (page === 'home' && away > 60e3) location.reload();
      if (page === 'forecast' && away > 10 * 60e3) document.getElementById('fcRefresh')?.click();
    };
    document.addEventListener('visibilitychange', () => document.hidden ? (hiddenAt = Date.now()) : resume());
    addEventListener('pageshow', e => { if (e.persisted) { hiddenAt = hiddenAt || 1; resume(); } });
    return;
  }

  // ---------- radar page ----------
  const CHECK_MS = 60e3;
  const $ = s => document.querySelector(s);
  const wrap = document.getElementById('mapWrap');
  const badge = document.createElement('div');
  badge.className = 'lv-badge';
  badge.innerHTML = `
    <button type="button" class="lv-main" title="Refresh the radar now">
      <span class="lv-dot"></span><b class="lv-word">LIVE</b>
      <span class="lv-age">checking…</span><span class="lv-next"></span>
    </button>
    <button type="button" class="lv-reload" title="Reload the whole app" hidden>Reload app</button>
    <button type="button" class="lv-wake" title="Keep the screen on while you watch" hidden aria-pressed="false">&#x2600;</button>`;
  wrap.appendChild(badge);
  L.DomEvent.disableClickPropagation(badge);
  const ui = { main: badge.querySelector('.lv-main'), age: badge.querySelector('.lv-age'), next: badge.querySelector('.lv-next'),
    word: badge.querySelector('.lv-word'), reload: badge.querySelector('.lv-reload'), wake: badge.querySelector('.lv-wake') };

  let newest = null;        // Date of the newest radar scan we know about
  let lastCheck = 0, nextAt = Date.now() + CHECK_MS, busy = false, failures = 0;

  const layerName = () => { try { return currentProductLayer(); } catch { return null; } };
  const latestTime = () => {
    const t = layerName() && state.times[layerName()];
    return t?.length ? new Date(t[t.length - 1]) : null;
  };

  function restartLoopIfPlaying() {
    if (!state.playing || !state.playTimer) return;
    const b = document.getElementById('playBtn');
    b.click();                       // stop
    setTimeout(() => b.click(), 50); // start again with the newest frames
  }

  // Full refresh: base app's own refresh button, plus the 60-second mosaic and the 3D view if they are on.
  function fullRefresh() {
    document.getElementById('refreshBtn')?.click();
    if (window.rapidMosaic?.on) window.rapidMosaic.refresh();
    if (window.Rain3D?.isOpen?.()) window.Rain3D.render();
  }

  async function check(force) {
    if (busy) return;
    busy = true; badge.classList.add('lv-busy');
    const before = latestTime();
    try {
      if (force) fullRefresh();
      await loadTimes();               // base app: reads the radar's newest scan times (small request)
      failures = 0;
      const now = latestTime();
      if (!force && now && (!before || now > before)) { fullRefresh(); restartLoopIfPlaying(); }
      else if (force) restartLoopIfPlaying();
      newest = now || newest;
    } catch {
      failures++;
    } finally {
      lastCheck = Date.now(); nextAt = lastCheck + CHECK_MS;
      busy = false; badge.classList.remove('lv-busy');
      paint();
    }
  }

  const fmtAgo = ms => {
    const m = Math.floor(ms / 60e3);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
  };
  function paint() {
    const offline = navigator.onLine === false || failures >= 2;
    const age = newest ? Date.now() - newest : null;
    const stale = age != null && age > 15 * 60e3;
    badge.classList.toggle('lv-off', offline);
    badge.classList.toggle('lv-stale', !offline && stale);
    ui.word.textContent = offline ? 'OFFLINE' : stale ? 'DELAYED' : 'LIVE';
    ui.age.textContent = busy ? 'updating…' : offline ? 'no connection · tap to retry'
      : newest ? `scan ${fmtAgo(age)}` : 'checking…';
    const s = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
    ui.next.textContent = busy || offline ? '' : `· ${s}s`;
    ui.reload.hidden = !(offline || stale);
  }

  ui.main.addEventListener('click', () => check(true));
  ui.reload.addEventListener('click', () => location.reload());

  // Keep the screen on while watching (phones that support it). Off by default; remembered per device.
  let lock = null, wantWake = false;
  try { wantWake = localStorage.getItem('live.wake') === '1'; } catch { /* ignore */ }
  async function applyWake() {
    ui.wake.setAttribute('aria-pressed', String(wantWake));
    ui.wake.classList.toggle('on', wantWake);
    try {
      if (wantWake && !lock && !document.hidden) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      if (!wantWake && lock) { await lock.release(); lock = null; }
    } catch { /* not allowed right now */ }
  }
  if ('wakeLock' in navigator) {
    ui.wake.hidden = false;
    ui.wake.addEventListener('click', () => {
      wantWake = !wantWake;
      try { localStorage.setItem('live.wake', wantWake ? '1' : '0'); } catch { /* ignore */ }
      applyWake();
    });
    applyWake();
  }

  // Catch up the moment the app is back on screen (phone unlocked, switched back, from a notification).
  let lastFull = 0;   // the phone add-on also presses Refresh on return; don't do it twice
  document.getElementById('refreshBtn')?.addEventListener('click', () => { lastFull = Date.now(); });
  function resume() {
    const away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
    if (away > 20 * 60e3) { location.reload(); return; }   // asleep a long time: start fresh
    if (Date.now() - lastCheck > 15e3) check(Date.now() - lastFull > 3000);
    if (wantWake) applyWake();
    setTimeout(() => map.invalidateSize(), 200);
  }
  document.addEventListener('visibilitychange', () => document.hidden ? (hiddenAt = Date.now()) : resume());
  addEventListener('pageshow', e => { if (e.persisted) resume(); });
  addEventListener('online', () => check(true));
  addEventListener('offline', paint);

  // Phones throttle timers, so check by the clock rather than trusting one long interval.
  setInterval(() => {
    if (document.hidden) return;
    if (!busy && Date.now() >= nextAt) check(false);
    else paint();
  }, 1000);

  setTimeout(() => { newest = latestTime(); lastCheck = Date.now(); paint(); }, 2500);
  paint();
})();
