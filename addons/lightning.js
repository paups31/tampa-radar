/* Add-on: Lightning.
 * NOAA nowCOAST lightning strike density (NLDN + GLD360 networks, 15-minute windows, ~8 km grid,
 * new map about every 15 min). Shows the newest window on the map, can loop the past hour, and
 * measures how far the nearest lightning is from Tampa.
 * Purely additive: its own pane, panel section and timers.
 */
'use strict';
(() => {
  const NC = 'https://nowcoast.noaa.gov/geoserver/lightning_detection/ows';
  const LAYER = 'ldn_lightning_strike_density';
  const REFRESH_MS = 5 * 60 * 1000;
  const NEAR_MI = 150;                       // search radius for the "nearest lightning" readout
  const KEY = 'lightning.v1';

  let prefs = { on: false, loop: false, opacity: 90 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

  map.createPane('lightning').style.zIndex = 440;          // above radar/alerts, below place labels
  map.getPane('lightning').style.pointerEvents = 'none';

  // ---------------- panel ----------------
  const sec = document.createElement('section');
  sec.id = 'lightningSec';
  sec.innerHTML = `
    <h2>Lightning <span id="ltPill" class="pill">off</span></h2>
    <div class="checks">
      <label><input type="checkbox" id="ltOn"> <span class="sw lt-sw"></span>Lightning strikes (last 15 min)</label>
      <label><input type="checkbox" id="ltLoop"> Loop the past hour</label>
    </div>
    <label class="slider">Opacity <input id="ltOpacity" type="range" min="30" max="100"></label>
    <div id="ltNear" class="lt-near muted small"></div>
    <div id="ltLegend" class="lt-legend" hidden>
      <div class="muted small">Strike density (strikes per km² per min ×1000)</div>
      <img alt="Lightning strike density legend" src="${NC}?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&layer=${LAYER}&width=14&height=12&legend_options=fontColor:0xDDDDDD;fontSize:10;bgColor:0x161b22;dpi:91">
    </div>
    <div class="muted small">NOAA nowCOAST · U.S. National + Global Lightning Detection Networks. Updates about every 15 min.</div>`;
  const anchor = document.getElementById('rapidMosaic') || document.getElementById('stormAlerts') || document.querySelector('#panel footer');
  anchor.before(sec);
  const $ = s => sec.querySelector(s);
  $('#ltOn').checked = prefs.on;
  $('#ltLoop').checked = prefs.loop;
  $('#ltOpacity').value = prefs.opacity;

  const tfmt = t => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(t));

  // ---------------- data ----------------
  let times = [], layers = [], loopTimer = null, refreshTimer = null, loopIdx = 0, latestShown = '';

  async function loadTimes() {
    const url = `${NC}?service=WMS&version=1.3.0&request=GetCapabilities&_=${Math.floor(Date.now() / 60000)}`;
    const xml = new DOMParser().parseFromString(await (await fetch(url, { cache: 'no-store' })).text(), 'text/xml');
    for (const el of xml.getElementsByTagName('Layer')) {
      if (el.getElementsByTagName('Name')[0]?.textContent !== LAYER) continue;
      const dim = [...el.getElementsByTagName('Dimension')].find(d => d.getAttribute('name') === 'time');
      return (dim?.textContent || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  function makeLayer(time) {
    return L.tileLayer.wms(NC, {
      layers: LAYER, styles: '', format: 'image/png', transparent: true, version: '1.3.0',
      time, pane: 'lightning', opacity: 0, tileSize: 512, zIndex: 1,
      attribution: 'Lightning: NOAA nowCOAST',
    });
  }

  function clearLayers() {
    for (const l of layers) map.removeLayer(l.layer);
    layers = [];
  }

  function show(i) {
    layers.forEach((l, k) => l.layer.setOpacity(k === i ? prefs.opacity / 100 : 0));
    const l = layers[i];
    if (l) $('#ltPill').textContent = `${prefs.loop ? 'loop ' : ''}${tfmt(Date.parse(l.time))}–${tfmt(Date.parse(l.time) + 15 * 60000)}`;
  }

  function startLoop() {
    clearInterval(loopTimer); loopTimer = null;
    if (!prefs.loop || layers.length < 2) { show(layers.length - 1); return; }
    loopIdx = 0; show(0);
    loopTimer = setInterval(() => {
      loopIdx = (loopIdx + 1) % (layers.length + 1);       // one extra tick pauses on the newest frame
      show(Math.min(loopIdx, layers.length - 1));
    }, 900);
  }

  async function refresh() {
    if (!prefs.on) return;
    try {
      times = await loadTimes();
    } catch (e) {
      $('#ltPill').textContent = 'offline';
      $('#ltNear').textContent = 'Could not reach NOAA nowCOAST lightning service.';
      return;
    }
    if (!times.length) return;
    const want = prefs.loop ? times.slice(-4) : times.slice(-1);
    const key = want.join('|');
    if (key !== latestShown) {
      clearLayers();
      layers = want.map(t => ({ time: t, layer: makeLayer(t).addTo(map) }));
      latestShown = key;
    }
    startLoop();
    nearest(times[times.length - 1]);
  }

  // Nearest lightning to Tampa: read the newest density map around Tampa and find lit pixels.
  async function nearest(time) {
    const out = $('#ltNear');
    const dLat = NEAR_MI / 69, dLon = NEAR_MI / (69 * Math.cos(HOME.lat * Math.PI / 180));
    const s = HOME.lat - dLat, n = HOME.lat + dLat, w = HOME.lon - dLon, e = HOME.lon + dLon;
    const W = 300, H = 300;
    const url = `${NC}?service=WMS&version=1.3.0&request=GetMap&layers=${LAYER}&styles=&crs=EPSG:4326` +
      `&bbox=${s},${w},${n},${e}&width=${W}&height=${H}&format=image/png&transparent=true&time=${encodeURIComponent(time)}`;
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, W, H).data;
      let best = Infinity, bLat = 0, bLon = 0, lit25 = 0, lit50 = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] < 40) continue;
        const lat = n - (y + 0.5) / H * (n - s), lon = w + (x + 0.5) / W * (e - w);
        const mi = Math.hypot((lat - HOME.lat) * 69, (lon - HOME.lon) * 69 * Math.cos(HOME.lat * Math.PI / 180));
        if (mi < 25) lit25++;
        if (mi < 50) lit50++;
        if (mi < best) { best = mi; bLat = lat; bLon = lon; }
      }
      const when = `${tfmt(Date.parse(time))}–${tfmt(Date.parse(time) + 15 * 60000)}`;
      if (!isFinite(best) || best > NEAR_MI) {
        out.innerHTML = `No lightning within ${NEAR_MI} mi of Tampa <span class="muted">(${when})</span>`;
        out.className = 'lt-near small lt-clear';
        return;
      }
      const brg = (Math.atan2((bLon - HOME.lon) * Math.cos(HOME.lat * Math.PI / 180), bLat - HOME.lat) * 180 / Math.PI + 360) % 360;
      const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(brg / 45) % 8];
      const km2 = (2 * NEAR_MI * 1.609 / W) ** 2;           // ground area of one pixel
      out.innerHTML = best < 2
        ? `<b>Lightning over Tampa</b> <span class="muted">(${when})</span>`
        : `Nearest lightning: <b>${Math.round(best)} mi ${dir}</b> of Tampa <span class="muted">(${when})</span>`;
      if (lit50) out.innerHTML += `<br>Active area: ${Math.round(lit25 * km2 / 2.59)} sq mi within 25 mi · ${Math.round(lit50 * km2 / 2.59)} sq mi within 50 mi`;
      out.className = 'lt-near small ' + (best < 10 ? 'lt-danger' : best < 30 ? 'lt-warn' : '');
    } catch {
      out.textContent = '';
    }
  }

  function apply() {
    $('#ltLegend').hidden = !prefs.on;
    clearInterval(refreshTimer); refreshTimer = null;
    clearInterval(loopTimer); loopTimer = null;
    if (!prefs.on) {
      clearLayers(); latestShown = '';
      $('#ltPill').textContent = 'off';
      $('#ltNear').textContent = '';
      return;
    }
    $('#ltPill').textContent = 'loading';
    refresh();
    refreshTimer = setInterval(refresh, REFRESH_MS);
  }

  $('#ltOn').addEventListener('change', e => { prefs.on = e.target.checked; save(); apply(); });
  $('#ltLoop').addEventListener('change', e => {
    prefs.loop = e.target.checked; save();
    if (prefs.on) { latestShown = ''; refresh(); }
  });
  $('#ltOpacity').addEventListener('input', e => {
    prefs.opacity = +e.target.value; save();
    if (!loopTimer) show(layers.length - 1);
  });

  apply();
})();
