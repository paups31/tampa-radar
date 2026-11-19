/* Add-on: 3D rainfall bars.
 * Opens a tilted 3D satellite map over the current view and raises a bar for every grid cell,
 * like a 3D histogram: the taller (and warmer-colored) the bar, the more rain.
 *   - "Rain rate now": NEXRAD national mosaic (IEM n0q, 0.5 dBZ steps, new every 5 min) converted to
 *     inches per hour with the Marshall-Palmer Z-R relation, averaged over each cell.
 *   - "Past 24 hours": NOAA MRMS radar-estimated rainfall totals (inches, ~1 km grid), averaged per cell.
 * Libraries (MapLibre + deck.gl) load only the first time the 3D view is opened.
 * Purely additive: its own panel section and its own overlay on top of the map.
 */
'use strict';
(() => {
  const LIBS = {
    css: 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.css',
    maplibre: 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js',
    deck: 'https://unpkg.com/deck.gl@9.0.38/dist.min.js',
  };
  const N0Q = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi';
  // IEM n0q palette: index i -> dBZ = i * 0.5 - 32 (index 0 = no echo).
  const PAL = ('000000,85718f,85728f,86738d,87758b,87768b,887789,897987,897a87,8a7b85,8b7d84,8b7e84,8c7f82,8d8180,8d8280,8e837e,8f847c,8f857c,90877b,918879,918979,928b77,938d75,969153,989457,9b975b,9d9a60,a09d64,a3a068,a5a36d,a8a671,aaa976,adac7a,b0af7e,b2b283,b7b88c,babb90,bdbe94,bfc199,c2c49d,c4c7a2,c7caa6,cacdaa,ccd0af,d2d4b4,cfd2b4,c9ccb4,c6c9b4,c3c7b4,c0c4b4,bdc1b4,b9beb4,b6bbb4,b3b9b4,b0b6b4,adb3b4,aab0b4,a4abb4,a0a8b4,9da5b4,9aa2b4,97a0b4,949db4,919ab4,949bb5,9098b4,8c95b3,8892b2,808cb0,7c89af,7886ae,7483ac,7080ab,6c7daa,6779a9,6376a8,5f73a7,5b70a6,576da4,4f67a2,4b64a1,4761a0,435e9f,415b9e,4361a2,4568a6,486faa,4a76ae,4d7db2,4f84b6,518bbb,5699c3,599fc7,5ba6cb,5eadcf,60b4d4,62bbd8,65c2dc,67c9e0,6ad0e4,6fd6e8,68d6d7,59d6b3,52d6a2,4bd690,43d67e,3cd66d,35d65b,11d518,11d117,10cd17,10c816,10c416,0fbc15,0fb714,0eb314,0eaf13,0eab13,0da612,0da212,0d9e11,0c9911,0c9510,0c9110,0b880f,0b840e,0a800e,0a7c0d,0a770d,09730c,096f0c,096b0b,08660b,08620a,095e09,327308,467d08,5b8807,6f9207,849d06,98a806,adb205,c1bd05,d6c704,ead204,ffe200,ffd800,ffd300,ffce00,ffc900,ffc400,ffc000,ffbb00,ffb600,ffb100,ffac00,ffa700,ffa200,ff9900,ff9400,ff8f00,ff8a00,ff8500,ff8000,ff0000,f80000,f10000,ea0000,e30000,d50000,cd0000,c60000,bf0000,b80000,b10000,aa0000,a30000,9b0000,940000,8d0000,7f0000,780000,710000,ffffff,fff5ff,ffeaff,ffdfff,ffd4ff,ffc9ff,ffbeff,ffb3ff,ff9dff,ff92ff,ff75ff,fc6bfd,f960fa,f656f7,f34bf4,f040f1,ed36ef,ea2bec,e720e9,e10be3,b200ff,ac00fc,a400f7,9b00f4,9300ef,8800ea,8300e8,7900e2,7200dd,6900db').split(',');
  const COLOR_DBZ = new Map();
  PAL.forEach((hex, i) => { if (i > 0 && !COLOR_DBZ.has(hex)) COLOR_DBZ.set(hex, i * 0.5 - 32); });

  const MODES = {
    rate: { label: 'Rain rate now', unit: 'in/hr', metersPerUnit: 40000, bars: 56,
      stops: [[0.01, '#9be7a8'], [0.1, '#2fbf71'], [0.3, '#ffe84d'], [0.75, '#ff8c1a'], [1.5, '#e8213a'], [3, '#d63bff']] },
    day: { label: 'Past 24 hours', unit: 'in', metersPerUnit: 20000, bars: 48,
      stops: [[0.01, '#9be7a8'], [0.25, '#2fbf71'], [0.75, '#1f9e89'], [1.5, '#2b7bba'], [3, '#5b2fb8'], [5, '#d63bff']] },
  };
  const KEY = 'rain3d.v1';
  let prefs = { mode: 'rate', height: 1 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

  // ---------------- panel ----------------
  const sec = document.createElement('section');
  sec.id = 'rain3dSec';
  sec.innerHTML = `
    <h2>3D rainfall <span id="r3Pill" class="pill">off</span></h2>
    <div class="checks"><label><input type="checkbox" id="r3On"> <span class="sw r3-sw"></span>3D rainfall bars over the map</label></div>
    <div class="muted small">Tilts the satellite map and raises a bar for each area — taller bars mean more rain.
      Right-drag (or Ctrl + drag) to tilt and turn; hover a bar for its amount.</div>`;
  const anchor = document.getElementById('lightningSec') || document.getElementById('rapidMosaic') || document.querySelector('#panel footer');
  anchor.before(sec);
  const $s = q => sec.querySelector(q);

  // ---------------- overlay ----------------
  const wrap = document.getElementById('mapWrap');
  const ov = document.createElement('div');
  ov.id = 'r3d';
  ov.hidden = true;
  ov.innerHTML = `
    <div id="r3dMap"></div>
    <div class="r3-top">
      <div class="r3-title">3D rainfall <span id="r3Time" class="muted"></span></div>
      <div class="r3-seg" role="group">
        <button type="button" data-mode="rate">Rain rate now</button>
        <button type="button" data-mode="day">Past 24 hours</button>
      </div>
      <label class="r3-h">Bar height <input id="r3Height" type="range" min="0.25" max="4" step="0.25"></label>
      <button type="button" id="r3Here" title="Load bars for the area now on screen">Load this area</button>
      <button type="button" id="r3Reset" title="Reset tilt and direction">Reset view</button>
      <button type="button" id="r3Close" class="r3-close" title="Close 3D view (Esc)">&times;</button>
    </div>
    <div class="r3-bottom">
      <div id="r3Legend" class="r3-legend"></div>
      <div id="r3Stats" class="r3-stats"></div>
    </div>
    <div id="r3Busy" class="r3-busy" hidden>Loading rainfall…</div>`;
  wrap.appendChild(ov);
  const $ = q => ov.querySelector(q);
  $('#r3Height').value = prefs.height;

  // ---------------- helpers ----------------
  const tfmt = t => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(t));
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  const loadCss = href => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); };
  const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function colorFor(v, stops) {
    if (v <= stops[0][0]) return [...hexRgb(stops[0][1]), 235];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        const a = hexRgb(stops[i - 1][1]), b = hexRgb(stops[i][1]);
        return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t)).concat(235);
      }
    }
    return [...hexRgb(stops[stops.length - 1][1]), 235];
  }
  const COS = lat => Math.cos(lat * Math.PI / 180);
  function fromTampa(lat, lon) {
    const mi = Math.hypot((lat - HOME.lat) * 69, (lon - HOME.lon) * 69 * COS(HOME.lat));
    if (mi < 3) return 'over Tampa';
    const brg = (Math.atan2((lon - HOME.lon) * COS(HOME.lat), lat - HOME.lat) * 180 / Math.PI + 360) % 360;
    return `${Math.round(mi)} mi ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(brg / 45) % 8]} of Tampa`;
  }
  // Marshall-Palmer Z = 200 R^1.6 ; dBZ capped at 55 so hail does not inflate the rain rate.
  const rateInHr = dbz => dbz < 15 ? 0 : Math.pow(Math.pow(10, Math.min(dbz, 55) / 10) / 200, 1 / 1.6) / 25.4;

  // Grid of square cells covering bounds [w,s,e,n] with `bars` cells across the longer side.
  function makeGrid(b, bars) {
    const latC = (b.s + b.n) / 2;
    const wKm = (b.e - b.w) * 111.32 * COS(latC), hKm = (b.n - b.s) * 111.32;
    const cellKm = Math.max(wKm, hKm) / bars;
    const dLat = cellKm / 111.32, dLon = cellKm / (111.32 * COS(latC));
    const nx = Math.max(1, Math.round((b.e - b.w) / dLon)), ny = Math.max(1, Math.round((b.n - b.s) / dLat));
    return { ...b, nx, ny, dLat: (b.n - b.s) / ny, dLon: (b.e - b.w) / nx, cellKm };
  }

  // ---------------- data ----------------
  async function radarBars(b) {
    const grid = makeGrid(b, MODES.rate.bars);
    const px = 6;                                               // image pixels per cell side
    const W = grid.nx * px, H = grid.ny * px;
    const url = `${N0Q}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nexrad-n0q-900913&STYLES=&SRS=EPSG:4326` +
      `&BBOX=${grid.w},${grid.s},${grid.e},${grid.n}&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/png&TRANSPARENT=true&_=${Math.floor(Date.now() / 120000)}`;
    const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('radar mosaic unavailable')); i.src = url; });
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const hex = (r, gg, bb) => ((1 << 24) | (r << 16) | (gg << 8) | bb).toString(16).slice(1);
    const out = [];
    for (let cy = 0; cy < grid.ny; cy++) for (let cx = 0; cx < grid.nx; cx++) {
      let sum = 0, peak = 0, maxDbz = -99;
      for (let y = cy * px; y < (cy + 1) * px; y++) for (let x = cx * px; x < (cx + 1) * px; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] < 128) continue;
        const dbz = COLOR_DBZ.get(hex(d[i], d[i + 1], d[i + 2]));
        if (dbz === undefined) continue;
        const r = rateInHr(dbz);
        sum += r; if (r > peak) peak = r; if (dbz > maxDbz) maxDbz = dbz;
      }
      const v = sum / (px * px);
      if (v < 0.005) continue;
      out.push({ lat: grid.n - (cy + 0.5) * grid.dLat, lon: grid.w + (cx + 0.5) * grid.dLon, v, peak, maxDbz });
    }
    return { grid, bars: out, at: Date.now() };
  }

  // 24-hour totals: NOAA MRMS radar-only QPE via IEM (mrms_p24h). The image is drawn with the palette of
  // IEM's p24h.png, whose palette index encodes millimetres:
  //   i < 100: 0.25*i  ·  100-179: 25 + 1.25*(i-100)  ·  180-254: 125 + 5*(i-180)  ·  255 = no coverage.
  const MRMS_WMS = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/us/mrms.cgi';
  const MRMS_PNG = 'https://mesonet.agron.iastate.edu/data/gis/images/4326/mrms/p24h.png';
  const mmFromIndex = i => i < 100 ? 0.25 * i : i < 180 ? 25 + 1.25 * (i - 100) : 125 + 5 * (i - 180);
  let qpeColors = null, qpeMeta = null;
  async function qpePalette() {
    if (qpeColors) return qpeColors;
    const buf = new Uint8Array(await (await fetch(MRMS_PNG, { headers: { Range: 'bytes=0-2047' } })).arrayBuffer());
    for (let p = 8; p + 8 < buf.length;) {
      const len = (buf[p] << 24 | buf[p + 1] << 16 | buf[p + 2] << 8 | buf[p + 3]) >>> 0;
      const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
      if (type === 'PLTE') {
        qpeColors = new Map();
        for (let i = 1; i < 255 && i * 3 + 2 < len; i++) {
          const o = p + 8 + i * 3, key = (buf[o] << 16) | (buf[o + 1] << 8) | buf[o + 2];
          if (!qpeColors.has(key)) qpeColors.set(key, i);
        }
        return qpeColors;
      }
      if (type === 'IDAT') break;
      p += 12 + len;
    }
    throw new Error('rainfall color table unavailable');
  }

  async function dayBars(b) {
    const grid = makeGrid(b, MODES.day.bars);
    const colors = await qpePalette();
    try { qpeMeta = await (await fetch(MRMS_PNG.replace('.png', '.json'), { cache: 'no-store' })).json(); } catch { qpeMeta = null; }
    const px = 6, W = grid.nx * px, H = grid.ny * px;
    const url = `${MRMS_WMS}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=mrms_p24h&STYLES=&SRS=EPSG:4326` +
      `&BBOX=${grid.w},${grid.s},${grid.e},${grid.n}&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/png&TRANSPARENT=true&_=${Math.floor(Date.now() / 600000)}`;
    const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('24-hour rainfall map unavailable')); i.src = url; });
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const out = [];
    for (let cy = 0; cy < grid.ny; cy++) for (let cx = 0; cx < grid.nx; cx++) {
      let sum = 0, peak = 0, n = 0;
      for (let y = cy * px; y < (cy + 1) * px; y++) for (let x = cx * px; x < (cx + 1) * px; x++) {
        const i = (y * W + x) * 4;
        n++;
        if (d[i + 3] < 128) continue;                              // transparent = no rain
        const idx = colors.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        if (idx === undefined) continue;
        const inch = mmFromIndex(idx) / 25.4;
        sum += inch; if (inch > peak) peak = inch;
      }
      const v = sum / n;
      if (v < 0.01) continue;
      out.push({ lat: grid.n - (cy + 0.5) * grid.dLat, lon: grid.w + (cx + 0.5) * grid.dLon, v, peak });
    }
    const end = qpeMeta?.meta?.end_valid ? Date.parse(qpeMeta.meta.end_valid) : Date.now();
    return { grid, bars: out, at: end };
  }

  // ---------------- 3D view ----------------
  let m3 = null, overlay = null, data = null, region = null, timer = null, loading = false, rise = 0;

  async function ensureLibs() {
    if (window.maplibregl && window.deck) return;
    loadCss(LIBS.css);
    await loadScript(LIBS.maplibre);
    await loadScript(LIBS.deck);
  }

  function regionFromLeaflet() {
    const b = map.getBounds();
    return clampRegion({ w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() });
  }
  function regionFrom3D() {
    // Ground area under the camera: unproject the screen corners and center (works while tilted).
    const c = m3.getCanvas(), W = c.clientWidth, H = c.clientHeight;
    const pts = [[0, H * 0.35], [W, H * 0.35], [0, H], [W, H], [W / 2, H / 2]].map(p => m3.unproject(p));
    const lats = pts.map(p => p.lat), lons = pts.map(p => p.lng);
    return clampRegion({ w: Math.min(...lons), s: Math.min(...lats), e: Math.max(...lons), n: Math.max(...lats) });
  }
  function clampRegion(r) {
    const cLat = (r.s + r.n) / 2, cLon = (r.w + r.e) / 2;
    const hLat = Math.min(Math.max((r.n - r.s) / 2, 0.4), 4), hLon = Math.min(Math.max((r.e - r.w) / 2, 0.4 / COS(cLat)), 4.5);
    return { w: cLon - hLon, e: cLon + hLon, s: cLat - hLat, n: cLat + hLat };
  }

  function render() {
    if (!overlay) return;
    const mode = MODES[prefs.mode];
    const L2 = [];
    if (data) {
      const side = data.grid.cellKm * 1000 * 0.86;
      L2.push(new deck.ColumnLayer({
        id: 'rain-bars', data: data.bars, diskResolution: 4, angle: 45, radius: side / Math.SQRT2,
        extruded: true, pickable: true, autoHighlight: true, highlightColor: [255, 255, 255, 110],
        getPosition: d => [d.lon, d.lat],
        getElevation: d => d.v * mode.metersPerUnit,
        elevationScale: prefs.height * rise,
        getFillColor: d => colorFor(d.v, mode.stops),
        material: { ambient: 0.55, diffuse: 0.6, shininess: 24, specularColor: [60, 64, 70] },
        transitions: { elevationScale: { duration: 1100, easing: t => 1 - Math.pow(1 - t, 3) } },
        updateTriggers: { getFillColor: prefs.mode, getElevation: prefs.mode },
      }));
    }
    L2.push(new deck.ScatterplotLayer({
      id: 'home', data: [HOME], getPosition: d => [d.lon, d.lat], getRadius: 1600, radiusMinPixels: 5,
      getFillColor: [255, 255, 255, 230], getLineColor: [13, 17, 23, 255], stroked: true, lineWidthMinPixels: 2,
    }));
    L2.push(new deck.TextLayer({
      id: 'home-label', data: [HOME], getPosition: d => [d.lon, d.lat], getText: () => 'Tampa',
      getSize: 14, getColor: [255, 255, 255, 255], getPixelOffset: [0, -16], fontWeight: 700,
      outlineWidth: 3, outlineColor: [13, 17, 23, 255], fontSettings: { sdf: true },
    }));
    for (const f of window.Rain3D.extraLayers) { try { L2.push(...f()); } catch (e) { console.warn(e); } }
    overlay.setProps({ layers: L2 });
  }

  function renderInfo() {
    const mode = MODES[prefs.mode];
    const st = mode.stops;
    $('#r3Legend').innerHTML = `<div class="r3-leg-title">${mode.label} (${mode.unit})</div>
      <div class="r3-leg-bar" style="background:linear-gradient(90deg,${st.map(s => s[1]).join(',')})"></div>
      <div class="r3-leg-ticks">${st.map(s => `<span>${s[0]}${s === st[st.length - 1] ? '+' : ''}</span>`).join('')}</div>`;
    ov.querySelectorAll('.r3-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === prefs.mode));
    if (!data) { $('#r3Stats').textContent = ''; return; }
    const top = data.bars.reduce((a, b) => (b.v > (a?.v ?? -1) ? b : a), null);
    const src = prefs.mode === 'rate' ? 'NEXRAD mosaic (IEM)' : 'NOAA MRMS radar estimate (IEM)';
    $('#r3Time').textContent = `· ${prefs.mode === 'rate' ? 'radar' : '24 h ending'} ${tfmt(data.at)}`;
    if (!top) { $('#r3Stats').innerHTML = `No rain in this area right now. <span class="muted">${src}</span>`; return; }
    const area = data.bars.length * data.grid.cellKm ** 2 / 2.59;
    $('#r3Stats').innerHTML = prefs.mode === 'rate'
      ? `Heaviest: <b>${top.v.toFixed(2)} in/hr</b> avg (peaks ${top.peak.toFixed(1)}) ${fromTampa(top.lat, top.lon)} · raining over ~${Math.round(area).toLocaleString()} sq mi <span class="muted">· ${src}</span>`
      : `Wettest: <b>${top.v.toFixed(2)} in</b> ${fromTampa(top.lat, top.lon)} · rain fell over ~${Math.round(area).toLocaleString()} sq mi <span class="muted">· ${src}</span>`;
  }

  async function loadData(r) {
    if (loading) return;
    loading = true;
    region = r || region;
    $('#r3Busy').hidden = false;
    $('#r3Busy').textContent = prefs.mode === 'rate' ? 'Loading radar rainfall…' : 'Loading 24-hour totals…';
    try {
      data = prefs.mode === 'rate' ? await radarBars(region) : await dayBars(region);
      rise = 0; render();                                   // bars start flat…
      requestAnimationFrame(() => { rise = 1; render(); }); // …then rise
      renderInfo();
      $s('#r3Pill').textContent = prefs.mode === 'rate' ? 'rate' : '24 h';
    } catch (e) {
      $('#r3Stats').textContent = 'Could not load rainfall: ' + e.message;
    } finally {
      loading = false;
      $('#r3Busy').hidden = true;
    }
  }

  // Keep the 3D scene framed in the space between the options bar and the legend, so the camera
  // centers below the controls and tall bars do not crowd them.
  function fitPadding() {
    if (!m3) return;
    const top = $('.r3-top').offsetTop + $('.r3-top').offsetHeight + 12;
    const bottom = $('.r3-bottom').offsetHeight + 36;
    m3.setPadding({ top, bottom, left: 0, right: 0 });
  }

  async function open() {
    ov.hidden = false;
    $s('#r3Pill').textContent = 'loading';
    $('#r3Busy').hidden = false; $('#r3Busy').textContent = 'Loading 3D map…';
    try { await ensureLibs(); } catch (e) {
      $('#r3Busy').textContent = 'Could not load the 3D map libraries (check internet connection).';
      return;
    }
    const c = map.getCenter();
    if (!m3) {
      m3 = new maplibregl.Map({
        container: $('#r3dMap'),
        style: {
          version: 8,
          sources: {
            sat: { type: 'raster', tileSize: 256, maxzoom: 18, attribution: 'Imagery &copy; Esri',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] },
            ref: { type: 'raster', tileSize: 256, maxzoom: 18,
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'] },
          },
          layers: [{ id: 'sat', type: 'raster', source: 'sat' }, { id: 'ref', type: 'raster', source: 'ref', paint: { 'raster-opacity': 0.8 } }],
        },
        center: [c.lng, c.lat], zoom: map.getZoom() - 1, pitch: 55, bearing: -18, maxPitch: 75, antialias: true,
      });
      m3.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      overlay = new deck.MapboxOverlay({
        interleaved: false, layers: [],
        getTooltip: ({ object }) => object?.info ? {
          html: `<b>${object.info.level}</b><br>wind from ${Math.round(object.info.dir)}° at <b>${Math.round(object.info.spd)} kt</b><br>0-6 km shear here: ${Math.round(object.info.shear)} kt<br>${fromTampa(object.info.lat, object.info.lon)}`,
          style: { background: 'rgba(13,17,23,.92)', color: '#e6edf3', fontSize: '12px', borderRadius: '6px', padding: '6px 8px', border: '1px solid #30363d' },
        } : object && object.v !== undefined && {
          html: prefs.mode === 'rate'
            ? `<b>${object.v.toFixed(2)} in/hr</b> average<br>peak ${object.peak.toFixed(2)} in/hr · ${object.maxDbz.toFixed(0)} dBZ<br>${fromTampa(object.lat, object.lon)}`
            : `<b>${object.v.toFixed(2)} in</b> in 24 h<br>wettest spot ${object.peak.toFixed(2)} in<br>${fromTampa(object.lat, object.lon)}`,
          style: { background: 'rgba(13,17,23,.92)', color: '#e6edf3', fontSize: '12px', borderRadius: '6px', padding: '6px 8px', border: '1px solid #30363d' },
        },
      });
      m3.addControl(overlay);
      fitPadding();
      new ResizeObserver(fitPadding).observe($('.r3-top'));
      new ResizeObserver(fitPadding).observe($('.r3-bottom'));
      await new Promise(res => m3.loaded() ? res() : m3.once('load', res));
    } else {
      m3.jumpTo({ center: [c.lng, c.lat], zoom: map.getZoom() - 1 });
      m3.resize();
      fitPadding();
    }
    renderInfo();
    await loadData(regionFromLeaflet());
    clearInterval(timer);
    timer = setInterval(() => { if (!ov.hidden && prefs.mode === 'rate') loadData(); }, 5 * 60 * 1000);
  }

  function close() {
    ov.hidden = true;
    clearInterval(timer); timer = null;
    $s('#r3On').checked = false;
    $s('#r3Pill').textContent = 'off';
  }

  // Hook for other add-ons (e.g. 3D wind vectors): extra deck.gl layers, and a way to open the view.
  window.Rain3D = {
    extraLayers: [],
    render: () => render(),
    isOpen: () => !ov.hidden,
    open: () => { if (ov.hidden) { $s('#r3On').checked = true; return open(); } render(); },
    element: ov,
  };
  $s('#r3On').addEventListener('change', e => (e.target.checked ? open() : close()));
  $('#r3Close').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) close(); });
  ov.querySelectorAll('.r3-seg button').forEach(b => b.addEventListener('click', () => {
    if (prefs.mode === b.dataset.mode) return;
    prefs.mode = b.dataset.mode; save(); data = null; render(); renderInfo(); loadData();
  }));
  $('#r3Height').addEventListener('input', e => { prefs.height = +e.target.value; save(); render(); });
  $('#r3Here').addEventListener('click', () => m3 && loadData(regionFrom3D()));
  $('#r3Reset').addEventListener('click', () => m3 && m3.easeTo({ pitch: 55, bearing: -18, duration: 800 }));
})();
