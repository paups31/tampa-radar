/* WeatherBoy Storm Loop (loop.html): an iPhone-first radar loop that shows storms moving.
 * Each frame is one screen-sized NOAA radar image for one scan time (not a stack of map tiles), so a phone
 * only ever holds a handful of pictures and two on-screen images. Frames are spread across the chosen span
 * (30 min / 1 h / 2 h), download one at a time, and play as soon as they are ready. New scans are pulled
 * in automatically every minute and when the app comes back to the screen. Standalone page: it does not
 * load or change the main radar app. */
'use strict';
(() => {
  const OPENGEO = 'https://opengeo.ncep.noaa.gov/geoserver';
  const TZ = 'America/New_York';
  const RADARS = [
    { id: 'ktbw', name: 'Tampa Bay', sub: 'KTBW · Ruskin', lat: 27.7055, lon: -82.4017, type: 'nexrad' },
    { id: 'kmlb', name: 'Orlando', sub: 'KMLB · Melbourne', lat: 28.1133, lon: -80.6542, type: 'nexrad' },
    { id: 'kamx', name: 'Miami', sub: 'KAMX', lat: 25.6111, lon: -80.4128, type: 'nexrad' },
    { id: 'tfll', name: 'Palm Beach', sub: 'TFLL TDWR', lat: 26.1430, lon: -80.3440, type: 'tdwr' },
    { id: 'kjax', name: 'Jacksonville', sub: 'KJAX', lat: 30.4847, lon: -81.7019, type: 'nexrad' },
    { id: 'ktlh', name: 'Tallahassee', sub: 'KTLH', lat: 30.3975, lon: -84.3289, type: 'nexrad' },
  ];
  const LAYER = { refl: r => r.type === 'tdwr' ? 'bref1' : 'sr_bref', vel: r => r.type === 'tdwr' ? 'bvel' : 'sr_bvel' };
  const MAX_FRAMES = 15, STEP_MS = 550, HOLD_STEPS = 3, OPACITY = 0.82, CHECK_MS = 60e3;
  const $ = s => document.querySelector(s);

  // ---------- settings (remembered on this phone) ----------
  const saved = (() => { try { return JSON.parse(localStorage.getItem('loopApp') || '{}'); } catch { return {}; } })();
  const st = {
    radar: RADARS.find(r => r.id === saved.radar) || RADARS[0],
    product: saved.product === 'vel' ? 'vel' : 'refl',
    span: [30, 60, 120].includes(saved.span) ? saved.span : 60,
    speed: [0.5, 1, 2].includes(saved.speed) ? saved.speed : 1,
  };
  const save = () => { try { localStorage.setItem('loopApp', JSON.stringify({ radar: st.radar.id, product: st.product, span: st.span, speed: st.speed })); } catch { /* ignore */ } };

  // ---------- map ----------
  const map = L.map('lmap', { zoomControl: false, attributionControl: true, center: [27.95, -82.46], zoom: 8, minZoom: 5, maxZoom: 12 });
  map.createPane('radar').style.zIndex = 350;
  map.createPane('labels').style.zIndex = 450;
  map.getPane('labels').style.pointerEvents = 'none';
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Imagery &copy; Esri · Radar NOAA/NWS' }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { pane: 'labels', maxZoom: 19 }).addTo(map);
  const siteDot = L.circleMarker([0, 0], { radius: 5, color: '#fff', weight: 2, fillColor: '#f0883e', fillOpacity: 1 }).addTo(map);

  // Two images on screen, swapped each step, so a frame change never flashes blank.
  const blank = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const mk = () => L.imageOverlay(blank, [[0, 0], [1, 1]], { pane: 'radar', opacity: 0, className: 'la-frame' }).addTo(map);
  let front = mk(), back = mk();

  // ---------- loop state ----------
  let frames = [];          // [{ time, url, ok, img }]
  let swapping = false;
  let idx = -1, timer = null, playing = true, hold = 0, token = 0, lastCheck = 0, newest = null;
  const ui = { play: $('#laPlay'), clock: $('#laClock'), ago: $('#laAgo'), track: $('#laTrack'), status: $('#laStatus'), site: $('#laSite') };

  const fmt = t => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(t));
  const status = (msg, err) => { ui.status.textContent = msg; ui.status.classList.toggle('err', !!err); };
  const layerName = () => `${st.radar.id}_${LAYER[st.product](st.radar)}`;

  async function fetchTimes() {
    const url = `${OPENGEO}/${st.radar.id}/ows?service=WMS&version=1.3.0&request=GetCapabilities&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
    const want = layerName();
    for (const el of xml.getElementsByTagName('Layer')) {
      if (el.getElementsByTagName('Name')[0]?.textContent !== want) continue;
      const dim = [...el.getElementsByTagName('Dimension')].find(d => d.getAttribute('name') === 'time');
      return dim ? dim.textContent.trim().split(',').map(s => s.trim()).filter(Boolean).sort() : [];
    }
    return [];
  }

  // Scans inside the span, thinned evenly to at most MAX_FRAMES (always keeping the newest).
  function pick(all) {
    if (!all.length) return [];
    const end = Date.parse(all[all.length - 1]), inSpan = all.filter(t => Date.parse(t) >= end - st.span * 60e3);
    if (inSpan.length <= MAX_FRAMES) return inSpan;
    const out = [];
    for (let k = 0; k < MAX_FRAMES; k++) {
      const t = inSpan[Math.round(k * (inSpan.length - 1) / (MAX_FRAMES - 1))];
      if (out[out.length - 1] !== t) out.push(t);
    }
    return out;
  }

  function view() {
    const b = map.getBounds().pad(0.15), size = map.getSize().multiplyBy(1.3);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(dpr, 1100 / Math.max(size.x, size.y));
    const sw = L.CRS.EPSG3857.project(b.getSouthWest()), ne = L.CRS.EPSG3857.project(b.getNorthEast());
    return { b, w: Math.round(size.x * scale), h: Math.round(size.y * scale), bbox: [sw.x, sw.y, ne.x, ne.y].join(',') };
  }
  const frameUrl = (t, v) => `${OPENGEO}/${st.radar.id}/ows?` + new URLSearchParams({ service: 'WMS', version: '1.1.1', request: 'GetMap',
    layers: layerName(), styles: '', format: 'image/png', transparent: 'true', srs: 'EPSG:3857', bbox: v.bbox, width: v.w, height: v.h, time: t });
  const load = f => new Promise(res => {
    const img = new Image();
    img.onload = () => { f.ok = true; f.img = img; (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => res(true)); };
    img.onerror = () => { f.ok = false; res(false); };
    img.src = f.url;
  });

  function drawTrack() {
    ui.track.innerHTML = frames.map((f, i) => `<i class="${f.ok ? 'ok' : ''}${i === idx ? ' cur' : ''}${i === frames.length - 1 ? ' last' : ''}"></i>`).join('');
  }
  function show(i, bounds) {
    const f = frames[i];
    if (!f?.ok) return;
    idx = i;
    if (bounds) { back.setBounds(bounds); }
    // Swap only once the new picture has loaded into the hidden image, so the screen never goes blank.
    const incoming = back, outgoing = front;
    [front, back] = [back, front];
    swapping = true;
    const done = () => { incoming.setOpacity(OPACITY); outgoing.setOpacity(0); if (bounds) outgoing.setBounds(bounds); swapping = false; };
    const el = incoming.getElement();
    if (el && el.src === f.url && el.complete) done();
    else { incoming.once('load error', done); incoming.setUrl(f.url); }
    ui.clock.textContent = fmt(f.time);
    const mins = Math.round((Date.parse(frames[frames.length - 1].time) - Date.parse(f.time)) / 60e3);
    ui.ago.textContent = i === frames.length - 1 ? 'LATEST' : `−${mins} min`;
    ui.ago.classList.toggle('latest', i === frames.length - 1);
    [...ui.track.children].forEach((el, k) => el.classList.toggle('cur', k === i));
  }

  function step() {
    if (!frames.length || swapping) return;
    if (idx === frames.length - 1 && hold++ < HOLD_STEPS) return;   // linger on the newest scan
    hold = 0;
    for (let n = 1; n <= frames.length; n++) {
      const j = (idx + n) % frames.length;
      if (frames[j].ok) { show(j); return; }
    }
  }
  function setPlaying(on) {
    playing = on;
    clearInterval(timer); timer = null;
    if (on && frames.filter(f => f.ok).length > 1) timer = setInterval(step, STEP_MS / st.speed);
    ui.play.innerHTML = on ? '&#x23F8;' : '&#x25B6;';
    ui.play.setAttribute('aria-label', on ? 'Pause loop' : 'Play loop');
  }

  // Build (or rebuild) the loop for the current radar, product, span and map view.
  async function build(reason) {
    const my = ++token;
    status(reason || 'Checking for radar scans…');
    let all;
    try { all = await fetchTimes(); } catch { if (my === token) status('No connection to the radar. Retrying in a minute.', true); return; }
    if (my !== token) return;
    lastCheck = Date.now();
    const times = pick(all);
    if (times.length < 2) { status('This radar has no recent scans right now.', true); return; }
    newest = times[times.length - 1];
    const v = view();
    const next = times.map(t => ({ time: t, url: frameUrl(t, v), ok: false }));
    // Newest scan first, so the map is current straight away; then the rest, oldest to newest.
    if (!(await load(next[next.length - 1]))) { if (my === token) status('Radar image failed to load. Retrying in a minute.', true); return; }
    if (my !== token) return;
    clearInterval(timer); timer = null;
    frames = next; idx = -1; hold = 0;
    drawTrack();
    show(frames.length - 1, v.b);
    for (let i = 0; i < frames.length - 1; i++) {
      status(`Loading loop ${i + 2}/${frames.length}…`);
      await load(frames[i]);
      if (my !== token) return;
      ui.track.children[i]?.classList.toggle('ok', frames[i].ok);
    }
    const good = frames.filter(f => f.ok).length;
    status(`${good} scans over ${st.span < 60 ? st.span + ' min' : st.span / 60 + ' h'} · ${st.radar.sub} · updates every minute`);
    ui.play.disabled = good < 2;
    if (playing) { idx = frames.length - 1; hold = HOLD_STEPS; setPlaying(true); }
  }

  async function checkNew() {
    if (document.hidden || !frames.length) return;
    lastCheck = Date.now();
    try {
      const all = await fetchTimes();
      if (all.length && all[all.length - 1] > newest) build('New radar scan, updating the loop…');
    } catch { /* try again next minute */ }
  }

  // ---------- controls ----------
  const radarBox = $('#laRadars');
  radarBox.innerHTML = RADARS.map(r => `<button type="button" data-id="${r.id}">${r.name}</button>`).join('');
  function paintChoices() {
    radarBox.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.id === st.radar.id));
    document.querySelectorAll('#laProduct button').forEach(b => b.classList.toggle('on', b.dataset.v === st.product));
    document.querySelectorAll('#laSpan button').forEach(b => b.classList.toggle('on', +b.dataset.v === st.span));
    $('#laSpeed').innerHTML = `${st.speed === 0.5 ? '½' : st.speed}&times;`;
    ui.site.textContent = `${st.radar.sub} · ${st.product === 'vel' ? 'Wind (velocity)' : 'Rain (reflectivity)'}`;
    siteDot.setLatLng([st.radar.lat, st.radar.lon]);
  }
  radarBox.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    st.radar = RADARS.find(r => r.id === b.dataset.id); save(); paintChoices();
    map.setView([st.radar.lat, st.radar.lon], 8);   // moveend rebuilds
  });
  $('#laProduct').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.product = b.dataset.v; save(); paintChoices(); build(); });
  $('#laSpan').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.span = +b.dataset.v; save(); paintChoices(); build(); });
  $('#laSpeed').addEventListener('click', () => { st.speed = st.speed === 1 ? 2 : st.speed === 2 ? 0.5 : 1; save(); paintChoices(); if (playing) setPlaying(true); });
  ui.play.addEventListener('click', () => { if (!playing && idx === frames.length - 1) hold = HOLD_STEPS; setPlaying(!playing); });

  // Drag along the frame bar to scrub through the loop.
  const scrub = e => {
    const r = ui.track.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const i = Math.max(0, Math.min(frames.length - 1, Math.floor(x / r.width * frames.length)));
    if (frames[i]?.ok && i !== idx) show(i);
  };
  ui.track.addEventListener('pointerdown', e => { if (!frames.length) return; setPlaying(false); ui.track.setPointerCapture(e.pointerId); scrub(e); });
  ui.track.addEventListener('pointermove', e => { if (ui.track.hasPointerCapture?.(e.pointerId)) scrub(e); });

  // My location
  let me = null;
  $('#laLocate').addEventListener('click', () => {
    if (!navigator.geolocation) return status('Location is not available on this device.', true);
    navigator.geolocation.getCurrentPosition(p => {
      const ll = [p.coords.latitude, p.coords.longitude];
      me = me || L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="la-me"></div>', iconSize: [16, 16] }), interactive: false }).addTo(map);
      me.setLatLng(ll); map.setView(ll, Math.max(map.getZoom(), 9));
    }, () => status('Allow location for WeatherBoy in Settings to show where you are.', true), { enableHighAccuracy: true, timeout: 10000 });
  });

  // Pan or zoom: fetch frames for the new area (the current pictures stay up meanwhile).
  let moveT;
  map.on('moveend', () => { clearTimeout(moveT); moveT = setTimeout(() => build('Loading the loop for this area…'), 500); });

  // Stay current: check for new scans every minute, and right away when the app is back on screen.
  setInterval(() => { if (Date.now() - lastCheck >= CHECK_MS) checkNew(); }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInterval(timer); timer = null; return; }
    if (Date.now() - lastCheck > 20e3) checkNew();
    if (playing) setPlaying(true);
    setTimeout(() => map.invalidateSize(), 200);
  });
  addEventListener('online', () => build());

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  paintChoices();
  map.setView([st.radar.lat + 0.25, st.radar.lon - 0.05], 8, { animate: false });
  build();
  window.StormLoop = { get frames() { return frames; }, get idx() { return idx; }, get playing() { return playing && !!timer; } };
})();
