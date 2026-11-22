/* Add-on: a light radar loop for phones.
 * The base loop adds 12 full tile layers at once. On an iPhone that runs Safari out of memory, the page crashes
 * and iOS shows "A problem repeatedly occurred". On phones this add-on takes over the Play button instead:
 * one screen-sized image per frame (8 frames), downloaded one after another, all shown in a single overlay.
 * Desktop keeps the base app's loop. Uses only the base app's public globals and UI. */
'use strict';
(() => {
  const isPhone = () => matchMedia('(max-width: 760px)').matches || /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
  const FRAMES = 8, STEP_MS = 650, HOLD = 3;
  const $ = s => document.querySelector(s);
  const btn = $('#playBtn'), slider = $('#frameSlider'), label = $('#frameTime');
  let loop = null;   // { frames:[{time,url}], idx, timer, overlay, token }

  function frameUrl(layer, time, b, w, h) {
    const sw = L.CRS.EPSG3857.project(b.getSouthWest()), ne = L.CRS.EPSG3857.project(b.getNorthEast());
    const p = new URLSearchParams({ service: 'WMS', version: '1.1.1', request: 'GetMap', layers: layer, styles: '',
      format: 'image/png', transparent: 'true', srs: 'EPSG:3857', bbox: [sw.x, sw.y, ne.x, ne.y].join(','),
      width: w, height: h, time });
    return `${wmsUrl(state.radar.id)}?${p}`;
  }
  const preload = url => new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = url; });

  function show(i) {
    const f = loop.frames[i];
    loop.idx = i;
    loop.overlay.setUrl(f.url);
    slider.value = i;
    label.textContent = fmtTime(new Date(f.time)) + (i === loop.frames.length - 1 ? ' · latest' : '');
  }

  function stop(keepLabel) {
    if (!loop) return;
    clearInterval(loop.timer);
    loop.overlay.remove();
    loop = null;
    if (baseLayer) baseLayer.setOpacity(state.opacity);
    btn.innerHTML = '&#x25B6;';
    slider.disabled = true; slider.value = 0;
    if (!keepLabel) { label.textContent = 'Latest scan'; loadTimes().catch(() => {}); }
  }

  async function start() {
    const layer = currentProductLayer();
    const times = (state.times[layer] || []).slice(-FRAMES);
    if (times.length < 2) { label.textContent = 'No loop frames yet'; return; }
    const b = map.getBounds(), size = map.getSize();
    const scale = Math.min(1, 900 / Math.max(size.x, size.y));          // cap image size: memory, not detail
    const w = Math.round(size.x * scale), h = Math.round(size.y * scale);
    const token = {};
    loop = { frames: times.map(t => ({ time: t, url: frameUrl(layer, t, b, w, h) })), idx: 0, timer: null, token,
      overlay: L.imageOverlay('data:image/gif;base64,R0lGODlhAQABAAAAACw=', b, { pane: 'radar', opacity: state.opacity, className: 'radar-tiles' }).addTo(map) };
    btn.innerHTML = '&#x23F8;';
    // Download one frame at a time so the phone never holds a burst of requests.
    for (let i = 0; i < loop.frames.length; i++) {
      label.textContent = `Loading loop ${i + 1}/${loop.frames.length}…`;
      await preload(loop.frames[i].url);
      if (!loop || loop.token !== token) return;   // stopped while loading
    }
    if (baseLayer) baseLayer.setOpacity(0);
    slider.max = loop.frames.length - 1; slider.disabled = false;
    slider.oninput = () => { if (!loop) return; clearInterval(loop.timer); loop.timer = null; btn.innerHTML = '&#x25B6;'; show(+slider.value); };
    show(0);
    run();
  }
  function run() {
    let hold = 0;
    btn.innerHTML = '&#x23F8;';
    loop.timer = setInterval(() => {
      if (loop.idx === loop.frames.length - 1 && hold++ < HOLD) return;   // pause on the newest scan
      hold = 0;
      show((loop.idx + 1) % loop.frames.length);
    }, STEP_MS);
  }

  // Take over Play on phones (capture phase, so the base loop never starts there).
  document.addEventListener('click', e => {
    if (!e.target.closest('#playBtn') || !isPhone()) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (!loop) start();
    else if (loop.timer) { stop(); }
    else run();   // paused by the slider: resume
  }, true);

  // The frames match the area on screen; after a pan or zoom, rebuild the loop for the new view.
  let moveT;
  map.on('movestart', () => { if (loop) loop.overlay.setOpacity(0); });
  map.on('moveend', () => {
    if (!loop) return;
    clearTimeout(moveT);
    moveT = setTimeout(() => { if (loop) { stop(true); start(); } }, 300);
  });
  // Switching radar or product, or the app going to the background: stop the loop.
  document.getElementById('productList')?.addEventListener('click', () => stop());
  document.getElementById('radarList')?.addEventListener('click', () => stop());
  document.addEventListener('visibilitychange', () => { if (document.hidden && loop) stop(true); });

  window.PhoneLoop = { get playing() { return !!(loop && loop.timer); }, restart() { if (loop) { stop(true); start(); } } };
})();
