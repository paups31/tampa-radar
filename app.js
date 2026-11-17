/* Tampa Bay Radar — Leaflet app over NOAA/NWS live data. */
'use strict';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const OPENGEO = 'https://opengeo.ncep.noaa.gov/geoserver';
const HOME = { lat: 27.9506, lon: -82.4572, name: 'Tampa, FL' };
const TZ = 'America/New_York';
const REFRESH_MS = 2 * 60 * 1000;

// type 'nexrad' layers: sr_bref, sr_bvel, bdhc, bdsa. 'tdwr' layers: bref1, bvel.
const RADARS = [
  { id: 'ktbw', name: 'Tampa Bay', sub: 'KTBW · Ruskin', lat: 27.7055, lon: -82.4017, type: 'nexrad' },
  { id: 'kamx', name: 'Miami', sub: 'KAMX', lat: 25.6111, lon: -80.4128, type: 'nexrad' },
  { id: 'tfll', name: 'Palm Beach', sub: 'TFLL TDWR', lat: 26.1430, lon: -80.3440, type: 'tdwr', hcFrom: 'kamx',
    note: 'The West Palm Beach TDWR (TPBI) has no public feed, so the nearest TDWR (Ft. Lauderdale) is used. Precip type comes from KAMX.' },
  { id: 'kmlb', name: 'Orlando', sub: 'KMLB · Melbourne', lat: 28.1133, lon: -80.6542, type: 'nexrad' },
  { id: 'kjax', name: 'Jacksonville', sub: 'KJAX', lat: 30.4847, lon: -81.7019, type: 'nexrad' },
  { id: 'ktlh', name: 'Tallahassee', sub: 'KTLH', lat: 30.3975, lon: -84.3289, type: 'nexrad' },
];

const PRODUCTS = [
  { id: 'refl', name: 'Reflectivity', layer: r => r.type === 'tdwr' ? 'bref1' : 'sr_bref' },
  { id: 'vel', name: 'Velocity', layer: r => r.type === 'tdwr' ? 'bvel' : 'sr_bvel' },
  { id: 'hc', name: 'Hydrometeor', layer: r => r.type === 'tdwr' ? null : 'bdhc' },
  { id: 'stp', name: 'Storm total', layer: r => r.type === 'tdwr' ? null : 'bdsa' },
  { id: 'none', name: 'Off', layer: () => null },
];

// ---------------------------------------------------------------------------
// Color tables
// ---------------------------------------------------------------------------
// Velocity color anchors measured from the NWS opengeo velocity imagery.
// Values are approximate (≈1 m/s per palette step); negative = toward the radar.
const VEL_ANCHORS = [
  [-82, 75, 4, 153], [-80, 37, 2, 153], [-78, 29, 26, 161], [-76, 29, 64, 173], [-74, 31, 102, 185],
  [-70, 41, 175, 210], [-68, 45, 200, 219], [-67, 82, 227, 230], [-53, 178, 238, 241], [-52, 176, 239, 233],
  [-43, 57, 251, 68], [-42, 45, 251, 51], [-32, 4, 204, 4], [-31, 3, 199, 3], [-11, 9, 102, 6],
  [-10, 22, 104, 18], [-1, 138, 116, 124], [1, 136, 104, 118], [10, 111, 3, 4], [11, 114, 0, 0],
  [31, 227, 1, 2], [32, 230, 10, 14], [52, 255, 163, 201], [53, 255, 169, 196], [60, 255, 216, 166],
  [62, 255, 218, 150], [63, 255, 205, 138], [65, 255, 188, 121], [67, 253, 151, 91], [69, 232, 118, 68],
];
const RANGE_FOLDED = [254, 0, 254];

// NWS Level III hydrometeor classification colors.
const HC_CLASSES = [
  { key: 'BI', label: 'Biological', rgb: [156, 156, 156] },
  { key: 'GC', label: 'Clutter', rgb: [118, 118, 118] },
  { key: 'IC', label: 'Ice crystals', rgb: [255, 176, 176], group: 'snow', out: [205, 190, 255] },
  { key: 'DS', label: 'Dry snow', rgb: [0, 255, 255], group: 'snow', out: [120, 210, 255] },
  { key: 'WS', label: 'Wet snow', rgb: [0, 144, 255], group: 'snow', out: [30, 120, 255] },
  { key: 'RA', label: 'Light/mod rain', rgb: [0, 251, 144], group: 'rain', out: [60, 220, 120] },
  { key: 'HR', label: 'Heavy rain', rgb: [0, 187, 0], group: 'rain', out: [0, 150, 60] },
  { key: 'BD', label: 'Big drops', rgb: [208, 208, 96], group: 'rain', out: [230, 220, 40] },
  { key: 'GR', label: 'Graupel', rgb: [210, 132, 132], group: 'hail', out: [255, 140, 170] },
  { key: 'HA', label: 'Hail / rain', rgb: [255, 0, 0], group: 'hail', out: [255, 45, 85] },
  { key: 'LH', label: 'Large hail', rgb: [160, 0, 0], group: 'hail', out: [200, 0, 160] },
  { key: 'GH', label: 'Giant hail', rgb: [255, 255, 0], group: 'hail', out: [255, 255, 255] },
  { key: 'UK', label: 'Unknown', rgb: [231, 0, 255] },
  { key: 'RF', label: 'Range folded', rgb: [119, 0, 125] },
];

const REFL_LEGEND = [
  [5, '#04e9e7'], [10, '#019ff4'], [15, '#0300f4'], [20, '#02fd02'], [25, '#01c501'], [30, '#008e00'],
  [35, '#fdf802'], [40, '#e5bc00'], [45, '#fd9500'], [50, '#fd0000'], [55, '#d40000'], [60, '#bc0000'],
  [65, '#f800fd'], [70, '#9854c6'], [75, '#fdfdfd'],
];

const ALERT_COLORS = {
  'Tornado Warning': '#ff0000', 'Severe Thunderstorm Warning': '#ffa500', 'Flash Flood Warning': '#8b0000',
  'Tornado Watch': '#ffff00', 'Severe Thunderstorm Watch': '#db7093', 'Flood Warning': '#00ff00',
  'Flood Watch': '#2e8b57', 'Flood Advisory': '#00ff7f', 'Flash Flood Watch': '#2e8b57',
  'Special Marine Warning': '#ffa500', 'Hurricane Warning': '#dc143c', 'Hurricane Watch': '#ff00ff',
  'Tropical Storm Warning': '#b22222', 'Tropical Storm Watch': '#f08080', 'Storm Surge Warning': '#b524f7',
  'Storm Surge Watch': '#db7ff7', 'Special Weather Statement': '#ffe4b5', 'Rip Current Statement': '#40e0d0',
  'High Surf Advisory': '#ba55d3', 'Coastal Flood Advisory': '#7cfc00', 'Coastal Flood Warning': '#228b22',
  'Small Craft Advisory': '#d8bfd8', 'Gale Warning': '#dda0dd', 'Gale Watch': '#ffc0cb', 'Dense Fog Advisory': '#708090',
  'Heat Advisory': '#ff7f50', 'Excessive Heat Warning': '#c71585', 'Freeze Warning': '#483d8b', 'Freeze Watch': '#00ffff',
  'Frost Advisory': '#6495ed', 'Wind Advisory': '#d2b48c', 'High Wind Warning': '#daa520', 'Red Flag Warning': '#ff1493',
  'Fire Weather Watch': '#ffdead', 'Marine Weather Statement': '#ffdab9', 'Hazardous Seas Warning': '#d8bfd8',
};
const ALERT_RANK = ['Tornado Warning', 'Severe Thunderstorm Warning', 'Flash Flood Warning', 'Hurricane Warning',
  'Storm Surge Warning', 'Tropical Storm Warning', 'Tornado Watch', 'Severe Thunderstorm Watch', 'Special Marine Warning'];

// Continuous ramps for model fields: [value, r, g, b, a]
const RAMPS = {
  dewpoint: { unit: '°F', stops: [[30, 120, 70, 30, .75], [45, 170, 120, 60, .75], [55, 150, 170, 80, .75],
    [60, 60, 180, 70, .78], [65, 20, 150, 60, .8], [70, 15, 120, 120, .82], [75, 20, 90, 190, .85], [80, 110, 40, 170, .88]] },
  cape: { unit: 'J/kg', stops: [[0, 0, 0, 0, 0], [100, 120, 210, 140, .35], [500, 120, 211, 137, .6],
    [1000, 255, 210, 63, .7], [2000, 240, 140, 40, .78], [3000, 228, 87, 46, .85], [4000, 197, 27, 138, .9]] },
  rain24: { unit: 'in', stops: [[0, 0, 0, 0, 0], [0.01, 155, 231, 168, .45], [0.25, 80, 200, 140, .65],
    [0.5, 31, 158, 137, .75], [1, 40, 110, 170, .82], [2, 59, 47, 158, .88], [4, 160, 30, 160, .92]] },
  tchg24: { unit: '°F', stops: [[-20, 43, 108, 176, .85], [-8, 120, 160, 220, .7], [-2, 220, 225, 235, .35],
    [2, 235, 220, 220, .35], [8, 230, 120, 110, .7], [20, 197, 48, 48, .85]] },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  radar: RADARS[0],
  product: 'refl',
  opacity: 0.8,
  overlays: new Set(['alerts']),
  point: { ...HOME },
  times: {},           // layerName -> [iso times]
  frames: [], frameIdx: 0, playing: false, playTimer: null,
  alerts: [],
  grid: null, gridAt: 0,
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const $ = s => document.querySelector(s);
const fmtTime = (d, opts = {}) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', ...opts }).format(d);
const status = msg => { $('#status').textContent = msg; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layerName(radar, suffix) { return `${radar.id}_${suffix}`; }

function wmsUrl(ws) { return `${OPENGEO}/${ws}/ows`; }

function getMapUrl(ws, layer, bbox3857, size, time) {
  const p = new URLSearchParams({ service: 'WMS', version: '1.1.1', request: 'GetMap', layers: layer, styles: '',
    format: 'image/png', transparent: 'true', srs: 'EPSG:3857', bbox: bbox3857.join(','), width: size, height: size,
    _ts: Math.floor(Date.now() / 60000) });
  if (time) p.set('time', time);
  return `${wmsUrl(ws)}?${p}`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed: ' + url));
    img.src = url;
  });
}

function imageData(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

// Square box around a radar in Web Mercator meters; returns bbox + Leaflet bounds.
function radarBox(radar, groundKm) {
  const p = L.Projection.SphericalMercator.project(L.latLng(radar.lat, radar.lon));
  const half = (groundKm * 1000) / Math.cos(radar.lat * Math.PI / 180);
  const bbox = [p.x - half, p.y - half, p.x + half, p.y + half];
  const sw = L.Projection.SphericalMercator.unproject(L.point(bbox[0], bbox[1]));
  const ne = L.Projection.SphericalMercator.unproject(L.point(bbox[2], bbox[3]));
  return { bbox, bounds: L.latLngBounds(sw, ne), half };
}

function rampColor(stops, v) {
  if (v == null || Number.isNaN(v)) return null;
  if (v <= stops[0][0]) return stops[0].slice(1);
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i], t = (v - a[0]) / (b[0] - a[0]);
      return [1, 2, 3, 4].map(k => a[k] + (b[k] - a[k]) * t);
    }
  }
  return stops[stops.length - 1].slice(1);
}

function cssRamp(stops) {
  const lo = stops[0][0], hi = stops[stops.length - 1][0];
  return 'linear-gradient(90deg,' + stops.map(s => `rgba(${s[1]},${s[2]},${s[3]},${Math.max(s[4], .5)}) ${((s[0] - lo) / (hi - lo) * 100).toFixed(1)}%`).join(',') + ')';
}

async function fetchJSON(url, opts, tries = 3) {
  for (let k = 1; ; k++) {
    const r = await fetch(url, opts);
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && k < tries) { await new Promise(res => setTimeout(res, 4000 * k)); continue; }
    throw new Error(`${r.status} ${url.slice(0, 120)}`);
  }
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------
const map = L.map('map', { zoomControl: false, preferCanvas: false, minZoom: 5, maxZoom: 15 })
  .setView([HOME.lat, HOME.lon], 8);
L.control.zoom({ position: 'topright' }).addTo(map);
L.control.scale({ position: 'bottomright', imperial: true, metric: false }).addTo(map);

for (const [name, z] of [['fields', 330], ['radar', 350], ['derived', 370], ['alerts', 420], ['labels', 450], ['markers', 620]]) {
  map.createPane(name).style.zIndex = z;
}
map.getPane('labels').style.pointerEvents = 'none';

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
}).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
  pane: 'labels', maxZoom: 19, opacity: 0.55,
}).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  pane: 'labels', maxZoom: 19, attribution: 'Labels &copy; Esri',
}).addTo(map);

// Radar site markers + range ring
const siteLayer = L.layerGroup().addTo(map);
let rangeRing = null;
function drawSites() {
  siteLayer.clearLayers();
  for (const r of RADARS) {
    const m = L.marker([r.lat, r.lon], {
      pane: 'markers',
      icon: L.divIcon({ className: '', html: `<div class="radar-label" style="${r === state.radar ? 'background:#1f6feb' : ''}">${r.sub.split(' ')[0]}</div>`, iconSize: null }),
    }).on('click', () => selectRadar(r));
    siteLayer.addLayer(m);
  }
  if (rangeRing) rangeRing.remove();
  rangeRing = L.circle([state.radar.lat, state.radar.lon], {
    radius: (state.radar.type === 'tdwr' ? 90 : 230) * 1000, pane: 'derived', interactive: false,
    color: '#3fa7ff', weight: 1, opacity: .45, fill: false, dashArray: '4 6',
  }).addTo(map);
}

// ---------------------------------------------------------------------------
// Base radar product (WMS tiles) + animation
// ---------------------------------------------------------------------------
let baseLayer = null;

function currentProductLayer() {
  const prod = PRODUCTS.find(p => p.id === state.product);
  const suffix = prod.layer(state.radar);
  return suffix ? layerName(state.radar, suffix) : null;
}

function makeWms(layer, time, opacity) {
  const opts = { layers: layer, format: 'image/png', transparent: true, version: '1.1.1', pane: 'radar',
    opacity, tileSize: 512, zoomOffset: 0, _ts: Math.floor(Date.now() / 60000), className: 'radar-tiles' };
  if (time) opts.time = time;
  return L.tileLayer.wms(wmsUrl(state.radar.id), opts);
}

function showBase() {
  stopAnimation();
  if (baseLayer) { baseLayer.remove(); baseLayer = null; }
  const layer = currentProductLayer();
  if (layer) baseLayer = makeWms(layer, null, state.opacity).addTo(map);
  renderLegend();
  loadTimes().catch(() => {});
}

async function loadTimes() {
  const layer = currentProductLayer();
  if (!layer) { $('#frameTime').textContent = 'Radar off'; return; }
  const url = `${wmsUrl(state.radar.id)}?service=WMS&version=1.3.0&request=GetCapabilities&_ts=${Date.now()}`;
  const xml = new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/xml');
  for (const el of xml.getElementsByTagName('Layer')) {
    const name = el.getElementsByTagName('Name')[0]?.textContent;
    const dim = [...el.getElementsByTagName('Dimension')].find(d => d.getAttribute('name') === 'time');
    if (name && dim) state.times[name] = dim.textContent.trim().split(',').map(s => s.trim()).filter(Boolean);
  }
  const t = state.times[layer];
  if (t?.length) {
    const last = new Date(t[t.length - 1]);
    if (!state.playing) $('#frameTime').textContent = `${fmtTime(last)} · latest`;
    const ago = Math.round((Date.now() - last) / 60000);
    status(`${state.radar.sub.split(' ')[0]} scan ${ago} min ago`);
  }
}

function stopAnimation() {
  state.playing = false;
  clearInterval(state.playTimer);
  state.frames.forEach(f => f.remove());
  state.frames = [];
  $('#playBtn').innerHTML = '&#x25B6;';
  $('#frameSlider').disabled = true;
  if (baseLayer) baseLayer.setOpacity(state.opacity);
}

function startAnimation() {
  const layer = currentProductLayer();
  const times = (state.times[layer] || []).slice(-12);
  if (times.length < 2) { status('No animation frames yet'); return; }
  state.playing = true;
  $('#playBtn').innerHTML = '&#x23F8;';
  if (baseLayer) baseLayer.setOpacity(0);
  state.frames = times.map(t => {
    const l = makeWms(layer, t, 0).addTo(map);
    l._time = t;
    return l;
  });
  const slider = $('#frameSlider');
  slider.max = times.length - 1; slider.disabled = false;
  state.frameIdx = 0;
  const show = i => {
    state.frames.forEach((f, k) => f.setOpacity(k === i ? state.opacity : 0));
    slider.value = i;
    $('#frameTime').textContent = fmtTime(new Date(state.frames[i]._time)) + (i === times.length - 1 ? ' · latest' : '');
  };
  show(0);
  let hold = 0;
  state.playTimer = setInterval(() => {
    if (state.frameIdx === times.length - 1 && hold++ < 3) return; // pause on latest frame
    hold = 0;
    state.frameIdx = (state.frameIdx + 1) % times.length;
    show(state.frameIdx);
  }, 550);
  slider.oninput = () => { clearInterval(state.playTimer); state.frameIdx = +slider.value; show(state.frameIdx); $('#playBtn').innerHTML = '&#x25B6;'; state.playTimer = null; };
}

// ---------------------------------------------------------------------------
// Precipitation type (rain / snow / hail) from hydrometeor classification
// ---------------------------------------------------------------------------
const derived = { hcOverlay: null, nrotOverlay: null, rotMarkers: L.layerGroup().addTo(map) };

function nearest(table, r, g, b, maxDist) {
  let best = null, bd = Infinity;
  for (const t of table) {
    const d = (t.rgb[0] - r) ** 2 + (t.rgb[1] - g) ** 2 + (t.rgb[2] - b) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  return bd <= maxDist * maxDist ? best : null;
}

async function updatePrecipType() {
  const groups = ['rain', 'snow', 'hail'].filter(g => state.overlays.has(g));
  if (derived.hcOverlay) { derived.hcOverlay.remove(); derived.hcOverlay = null; }
  if (!groups.length) return;
  const src = state.radar.hcFrom ? RADARS.find(r => r.id === state.radar.hcFrom) : state.radar;
  const box = radarBox(src, 240);
  const size = 1200;
  status('Loading precip type…');
  const img = await loadImage(getMapUrl(src.id, layerName(src, 'bdhc'), box.bbox, size));
  const id = imageData(img), d = id.data;
  const cache = new Map();
  let hits = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 20) { d[i + 3] = 0; continue; }
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let cls = cache.get(key);
    if (cls === undefined) { cls = nearest(HC_CLASSES, d[i], d[i + 1], d[i + 2], 45); cache.set(key, cls); }
    if (cls && cls.group && groups.includes(cls.group)) {
      d[i] = cls.out[0]; d[i + 1] = cls.out[1]; d[i + 2] = cls.out[2]; d[i + 3] = 235; hits++;
    } else d[i + 3] = 0;
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').putImageData(id, 0, 0);
  if (derived.hcOverlay) derived.hcOverlay.remove();
  derived.hcOverlay = L.imageOverlay(c.toDataURL(), box.bounds, { pane: 'derived', opacity: state.opacity, interactive: false }).addTo(map);
  status(hits ? `Precip type: ${src.sub.split(' ')[0]}` : 'No matching precip type right now');
}

// ---------------------------------------------------------------------------
// Normalized rotation (estimated from velocity imagery)
// ---------------------------------------------------------------------------
const VEL_TABLE = (() => {
  const t = [];
  for (let i = 1; i < VEL_ANCHORS.length; i++) {
    const a = VEL_ANCHORS[i - 1], b = VEL_ANCHORS[i];
    const steps = Math.max(1, Math.round((b[0] - a[0]) * 2));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      t.push({ v: a[0] + (b[0] - a[0]) * f, rgb: [1, 2, 3].map(k => a[k] + (b[k] - a[k]) * f) });
    }
  }
  const z = VEL_ANCHORS[VEL_ANCHORS.length - 1];
  t.push({ v: z[0], rgb: z.slice(1) });
  return t;
})();

function decodeVelocity(id) {
  const d = id.data, n = id.width * id.height;
  const out = new Float32Array(n).fill(NaN);
  const cache = new Map();
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (Math.abs(r - RANGE_FOLDED[0]) + g + Math.abs(b - RANGE_FOLDED[2]) < 20) continue;
    const key = (r << 16) | (g << 8) | b;
    let v = cache.get(key);
    if (v === undefined) { const m = nearest(VEL_TABLE, r, g, b, 30); v = m ? m.v : NaN; cache.set(key, v); }
    out[p] = v;
  }
  return out;
}

// Pixels with roughly 30+ dBZ in the NWS reflectivity palette (greens through reds/magentas),
// dilated by `grow` pixels. Clear air and light rain (blues, greys, tans, light greens) are excluded.
function stormMask(id, grow) {
  const d = id.data, W = id.width, H = id.height;
  const m = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if ((b < 30 && (g > 80 || r > 120)) || (r > 180 && g < 80)) m[p] = 1;
  }
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    for (let j = -grow; j <= grow; j++) for (let i = -grow; i <= grow; i++) {
      const yy = y + j, xx = x + i;
      if (yy >= 0 && xx >= 0 && yy < H && xx < W) out[yy * W + xx] = 1;
    }
  }
  return out;
}

function nrotColor(n) {
  // 0.5 yellow → 0.8 orange → 1.0 red → 1.5 magenta → 2+ white
  const stops = [[0.5, 255, 235, 59, 120], [0.8, 255, 152, 0, 190], [1.0, 244, 47, 47, 235], [1.5, 233, 30, 160, 250], [2.2, 255, 255, 255, 255]];
  return rampColor(stops.map(s => [s[0], s[1], s[2], s[3], s[4]]), n);
}

async function updateRotation() {
  derived.rotMarkers.clearLayers();
  if (derived.nrotOverlay) { derived.nrotOverlay.remove(); derived.nrotOverlay = null; }
  if (!state.overlays.has('nrot')) { $('#rotCount').textContent = 'off'; $('#rotCount').className = 'pill'; return; }
  const radar = state.radar;
  const rangeKm = radar.type === 'tdwr' ? 90 : 200;
  const size = radar.type === 'tdwr' ? 900 : 1200;
  const box = radarBox(radar, rangeKm);
  const velLayer = layerName(radar, radar.type === 'tdwr' ? 'bvel' : 'sr_bvel');
  const refLayer = layerName(radar, radar.type === 'tdwr' ? 'bref1' : 'sr_bref');
  status('Scanning for rotation…');
  const [img, refImg] = await Promise.all([
    loadImage(getMapUrl(radar.id, velLayer, box.bbox, size)),
    loadImage(getMapUrl(radar.id, refLayer, box.bbox, size)),
  ]);
  const id = imageData(img);
  const V = decodeVelocity(id);
  const W = size, H = size, cx = W / 2, cy = H / 2;
  const storm = stormMask(imageData(refImg), 3);
  const groundPx = (2 * rangeKm * 1000) / W;          // meters per pixel (ground)
  const N = new Float32Array(W * H);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? NaN : V[(y | 0) * W + (x | 0)];

  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (!storm[y * W + x]) continue;                 // only look inside real storms (~30+ dBZ)
      const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
      if (r < 6) continue;
      const km = r * groundPx / 1000;
      if (km > rangeKm || km < 20) continue;           // skip ground clutter near the radar
      const tx = -dy / r, ty = dx / r;                // clockwise (increasing azimuth) unit vector
      const ux = dx / r, uy = dy / r;                 // radial unit vector
      // Mean of 3 gates along the radial, so single noisy gates can't fake a couplet.
      const mean = (px, py) => {
        let s = 0;
        for (const k of [-1.5, 0, 1.5]) { const v = at(px + ux * k + .5, py + uy * k + .5); if (Number.isNaN(v)) return NaN; s += v; }
        return s / 3;
      };
      // Compare gates at least one beam width apart (0.5° beam widens with range).
      const beamPx = (km * 1000 * 0.0087) / groundPx;
      const s1 = Math.min(8, Math.max(2, Math.round(beamPx))), s2 = Math.min(10, Math.max(3, Math.round(beamPx * 1.6)));
      let shear = Infinity;
      for (const s of [s1, s2]) {
        const a = mean(x + tx * s, y + ty * s), b = mean(x - tx * s, y - ty * s);
        if (Number.isNaN(a) || Number.isNaN(b)) { shear = 0; break; }
        const dv = a - b;                              // cyclonic: outbound clockwise of inbound
        if (dv < 20 || dv > 90) { shear = 0; break; }  // too weak (<~40 kt), or likely a dealiasing error
        shear = Math.min(shear, dv / (2 * s * groundPx));
      }
      if (!Number.isFinite(shear) || shear <= 0) continue;
      const thr = 0.010 - 0.004 * Math.min(km, 150) / 150; // s^-1, eased for beam spreading at range
      N[y * W + x] = shear / thr;
    }
  }

  // Dilate by 1px so small couplets are visible, then render.
  const out = new ImageData(W, H);
  const o = out.data;
  const peaks = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      let m = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) m = Math.max(m, N[(y + j) * W + x + i]);
      if (m < 0.5) continue;
      const c = nrotColor(m), k = (y * W + x) * 4;
      o[k] = c[0]; o[k + 1] = c[1]; o[k + 2] = c[2]; o[k + 3] = c[3];
      const raw = N[y * W + x];
      if (raw >= 1.0) peaks.push({ x, y, n: raw });
    }
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').putImageData(out, 0, 0);
  derived.nrotOverlay = L.imageOverlay(c.toDataURL(), box.bounds, { pane: 'derived', interactive: false }).addTo(map);

  // Cluster peaks within ~8 km into detections.
  peaks.sort((a, b) => b.n - a.n);
  const clusters = [];
  const sep = 8000 / groundPx;
  for (const p of peaks) {
    const hit = clusters.find(c => Math.hypot(c.x - p.x, c.y - p.y) < sep);
    if (hit) hit.count++; else clusters.push({ ...p, count: 1 });
  }
  const strong = clusters.filter(c => c.count >= 6).slice(0, 12);
  const toLatLng = (x, y) => L.Projection.SphericalMercator.unproject(L.point(
    box.bbox[0] + (x / W) * (box.bbox[2] - box.bbox[0]),
    box.bbox[3] - (y / H) * (box.bbox[3] - box.bbox[1])));
  const list = $('#rotList');
  list.innerHTML = '';
  list.classList.toggle('muted', !strong.length);
  if (!strong.length) list.innerHTML = '<li>No significant rotation in the latest scan.</li>';
  for (const s of strong) {
    const ll = toLatLng(s.x, s.y);
    const km = Math.hypot(s.x - cx, s.y - cy) * groundPx / 1000;
    const az = (Math.atan2(s.x - cx, -(s.y - cy)) * 180 / Math.PI + 360) % 360;
    const label = `NROT ${s.n.toFixed(2)}`;
    const where = `${Math.round(km * 0.621)} mi ${compass(az)} of ${radar.sub.split(' ')[0]}`;
    L.marker(ll, { pane: 'markers', icon: L.divIcon({ className: '', html: '<div class="rot-marker"></div>', iconSize: [18, 18] }) })
      .bindPopup(`<h3>${label}</h3>${where}<br><span class="muted">Estimated from velocity imagery. Check official warnings.</span>`)
      .addTo(derived.rotMarkers);
    const li = document.createElement('li');
    li.style.borderLeftColor = s.n >= 1.5 ? '#e91e63' : '#f44336';
    li.innerHTML = `<b>${label}</b>${where}`;
    li.onclick = () => map.setView(ll, Math.max(map.getZoom(), 10));
    list.appendChild(li);
  }
  $('#rotCount').textContent = String(strong.length);
  $('#rotCount').className = strong.length ? 'pill hot' : 'pill';
  status(`Rotation scan: ${radar.sub.split(' ')[0]}`);
}

function compass(deg) {
  return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(deg / 22.5) % 16];
}

// ---------------------------------------------------------------------------
// Warnings & watches (NWS API)
// ---------------------------------------------------------------------------
const alertLayer = L.layerGroup().addTo(map);
const zoneCache = new Map();

async function zoneGeometry(url) {
  if (!zoneCache.has(url)) {
    zoneCache.set(url, fetchJSON(url, { headers: { Accept: 'application/geo+json' } })
      .then(j => j.geometry).catch(() => null));
  }
  return zoneCache.get(url);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

async function updateAlerts() {
  if (!state.overlays.has('alerts')) { alertLayer.clearLayers(); return; }
  const j = await fetchJSON('https://api.weather.gov/alerts/active?area=FL,GM,AM&status=actual', { headers: { Accept: 'application/geo+json' } });
  const feats = j.features || [];
  // Fill in zone-based alerts (most watches/advisories) with zone polygons.
  const needZones = [...new Set(feats.filter(f => !f.geometry).flatMap(f => f.properties.affectedZones || []))].slice(0, 220);
  const geoms = await mapLimit(needZones, 6, zoneGeometry);
  const zoneGeom = new Map(needZones.map((z, k) => [z, geoms[k]]));
  state.alerts = feats.map(f => {
    const geom = f.geometry || mergeGeoms((f.properties.affectedZones || []).map(z => zoneGeom.get(z)).filter(Boolean));
    return { id: f.id, p: f.properties, geom, color: ALERT_COLORS[f.properties.event] || '#9aa3ad' };
  });
  const rank = a => { const r = ALERT_RANK.indexOf(a.p.event); return r < 0 ? 99 : r; };
  state.alerts.sort((a, b) => rank(a) - rank(b) || new Date(b.p.sent) - new Date(a.p.sent));

  alertLayer.clearLayers();
  // Draw lowest priority first so warnings sit on top.
  for (const a of [...state.alerts].reverse()) {
    if (!a.geom) continue;
    const isWarn = /Warning/.test(a.p.event);
    a.layer = L.geoJSON(a.geom, {
      pane: 'alerts',
      style: { color: a.color, weight: isWarn ? 3 : 2, opacity: 0.95, fillColor: a.color, fillOpacity: isWarn ? 0.18 : 0.08, dashArray: /Watch/.test(a.p.event) ? '6 4' : null },
    }).bindPopup(alertPopup(a), { maxWidth: 360 }).addTo(alertLayer);
  }
  renderAlertList();
}

function mergeGeoms(gs) {
  if (!gs.length) return null;
  const polys = [];
  for (const g of gs) {
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
  }
  return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
}

function alertPopup(a) {
  const p = a.p;
  const ends = p.ends || p.expires;
  return `<h3 style="color:${a.color}">${esc(p.event)}</h3>
    <div class="small muted">${esc(p.senderName)} · until ${ends ? fmtTime(new Date(ends), { weekday: 'short' }) : '—'}</div>
    <p style="margin:6px 0">${esc(p.headline || '')}</p>
    <div class="small" style="max-height:160px;overflow:auto;white-space:pre-wrap">${esc((p.description || '').slice(0, 1200))}</div>`;
}

function renderAlertList() {
  const list = $('#alertList');
  list.innerHTML = '';
  const n = state.alerts.length;
  $('#alertCount').textContent = String(n);
  $('#alertCount').className = state.alerts.some(a => /Tornado Warning|Severe Thunderstorm Warning|Flash Flood Warning/.test(a.p.event)) ? 'pill hot' : 'pill';
  if (!n) { list.innerHTML = '<li class="muted" style="cursor:default">No active alerts for Florida or its coastal waters.</li>'; return; }
  for (const a of state.alerts.slice(0, 60)) {
    const li = document.createElement('li');
    li.style.borderLeftColor = a.color;
    const area = (a.p.areaDesc || '').split(';').slice(0, 3).join(', ');
    li.innerHTML = `<b>${esc(a.p.event)}</b>${esc(area)}${(a.p.areaDesc || '').split(';').length > 3 ? '…' : ''}`;
    li.onclick = () => {
      if (a.layer) { map.fitBounds(a.layer.getBounds(), { maxZoom: 10, padding: [30, 30] }); a.layer.openPopup(); }
      else L.popup().setLatLng(map.getCenter()).setContent(alertPopup(a)).openOn(map);
    };
    list.appendChild(li);
  }
}

function pointInGeom(lat, lon, g) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some(rings => {
    let inside = false;
    const ring = rings[0];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

// ---------------------------------------------------------------------------
// Model fields: dew point, CAPE, 24-hr rainfall, 24-hr temperature change
// ---------------------------------------------------------------------------
// 10 x 12 points (Open-Meteo bills each location as a call, so keep this modest).
const GRID = { lat0: 24.3, lat1: 31.05, lon0: -87.8, lon1: -79.55, step: 0.75 };
const fieldOverlays = {};

async function loadGrid() {
  if (state.grid && Date.now() - state.gridAt < 30 * 60 * 1000) return state.grid;
  const lats = [], lons = [];
  const ny = Math.round((GRID.lat1 - GRID.lat0) / GRID.step) + 1;
  const nx = Math.round((GRID.lon1 - GRID.lon0) / GRID.step) + 1;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    lats.push((GRID.lat0 + j * GRID.step).toFixed(2)); lons.push((GRID.lon0 + i * GRID.step).toFixed(2));
  }
  status('Loading model fields…');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
    '&hourly=temperature_2m,dew_point_2m,cape,precipitation&past_hours=24&forecast_hours=1' +
    '&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=GMT';
  const arr = await fetchJSON(url);
  const nowKey = new Date().toISOString().slice(0, 13) + ':00';
  const fields = { dewpoint: [], cape: [], rain24: [], tchg24: [] };
  for (const loc of arr) {
    const h = loc.hourly;
    let k = h.time.indexOf(nowKey);
    if (k < 0) k = h.time.length - 1;
    fields.dewpoint.push(h.dew_point_2m[k]);
    fields.cape.push(h.cape[k]);
    let sum = 0;
    for (let q = Math.max(0, k - 23); q <= k; q++) sum += h.precipitation[q] || 0;
    fields.rain24.push(sum);
    fields.tchg24.push(k >= 24 ? h.temperature_2m[k] - h.temperature_2m[k - 24] : NaN);
  }
  state.grid = { nx, ny, fields };
  state.gridAt = Date.now();
  return state.grid;
}

function sampleGrid(grid, field, lat, lon) {
  const fx = (lon - GRID.lon0) / GRID.step, fy = (lat - GRID.lat0) / GRID.step;
  if (fx < 0 || fy < 0 || fx > grid.nx - 1 || fy > grid.ny - 1) return NaN;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, grid.nx - 1), y1 = Math.min(y0 + 1, grid.ny - 1);
  const tx = fx - x0, ty = fy - y0, F = grid.fields[field], at = (x, y) => F[y * grid.nx + x];
  return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
}

async function updateFields() {
  const active = Object.keys(RAMPS).filter(k => state.overlays.has(k));
  for (const k of Object.keys(fieldOverlays)) if (!active.includes(k)) { fieldOverlays[k].remove(); delete fieldOverlays[k]; }
  if (!active.length) return;
  const grid = await loadGrid();
  const sw = L.Projection.SphericalMercator.project(L.latLng(GRID.lat0, GRID.lon0));
  const ne = L.Projection.SphericalMercator.project(L.latLng(GRID.lat1, GRID.lon1));
  const W = 360, H = Math.round(W * (ne.y - sw.y) / (ne.x - sw.x));
  for (const k of active) {
    const img = new ImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      const ll = L.Projection.SphericalMercator.unproject(L.point(sw.x, ne.y - (y + .5) / H * (ne.y - sw.y)));
      for (let x = 0; x < W; x++) {
        const lon = GRID.lon0 + (x + .5) / W * (GRID.lon1 - GRID.lon0);
        const c = rampColor(RAMPS[k].stops, sampleGrid(grid, k, ll.lat, lon));
        if (!c) continue;
        const i = (y * W + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] * 255;
      }
    }
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').putImageData(img, 0, 0);
    if (fieldOverlays[k]) fieldOverlays[k].remove();
    fieldOverlays[k] = L.imageOverlay(cv.toDataURL(), [[GRID.lat0, GRID.lon0], [GRID.lat1, GRID.lon1]],
      { pane: 'fields', opacity: 0.75, interactive: false }).addTo(map);
  }
  status('Model fields updated');
}

// ---------------------------------------------------------------------------
// 24-hour climate for a point
// ---------------------------------------------------------------------------
async function updateClimate() {
  const { lat, lon, name } = state.point;
  $('#climateWhere').textContent = `· ${name}`;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    '&hourly=temperature_2m,dew_point_2m,relative_humidity_2m,precipitation,wind_gusts_10m,pressure_msl,cape' +
    '&daily=sunrise,sunset&past_hours=24&forecast_hours=1&forecast_days=1' +
    '&temperature_unit=fahrenheit&precipitation_unit=inch&wind_speed_unit=mph&timezone=America%2FNew_York';
  const j = await fetchJSON(url);
  const h = j.hourly;
  const nowKey = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .format(new Date()).replace(' ', 'T').slice(0, 13) + ':00';
  let k = h.time.indexOf(nowKey);
  if (k < 0) k = h.time.length - 1;
  const lo = Math.max(0, k - 24);
  const sl = a => a.slice(lo, k + 1);
  const T = sl(h.temperature_2m), Td = sl(h.dew_point_2m), P = sl(h.precipitation), G = sl(h.wind_gusts_10m), MSL = sl(h.pressure_msl);
  const max = Math.max(...T), min = Math.min(...T);
  const rain = P.slice(1).reduce((s, v) => s + (v || 0), 0);
  const dp = MSL[MSL.length - 1] - MSL[0];
  const stat = (k2, v) => `<div class="stat"><div class="k">${k2}</div><div class="v">${v}</div></div>`;
  $('#climate').classList.remove('muted');
  $('#climate').innerHTML = `
    <div class="climate-grid">
      ${stat('Now', `${Math.round(T[T.length - 1])}°F`)}
      ${stat('Dew point', `${Math.round(Td[Td.length - 1])}°F`)}
      ${stat('24-hr high / low', `${Math.round(max)}° / ${Math.round(min)}°`)}
      ${stat('24-hr rain', `${rain.toFixed(2)} in`)}
      ${stat('Peak gust', `${Math.round(Math.max(...G))} mph`)}
      ${stat('Pressure 24 hr', `${dp >= 0 ? '+' : ''}${dp.toFixed(1)} hPa`)}
      ${stat('Humidity', `${Math.round(sl(h.relative_humidity_2m).at(-1))}%`)}
      ${stat('CAPE', `${Math.round(sl(h.cape).at(-1))} J/kg`)}
    </div>
    ${climateChart(sl(h.time), T, Td, P)}
    <div class="small muted">Sunrise ${j.daily.sunrise[0].slice(11)} · Sunset ${j.daily.sunset[0].slice(11)} · Open-Meteo model data</div>`;
}

function climateChart(times, T, Td, P) {
  const W = 300, H = 110, pad = { l: 26, r: 6, t: 8, b: 18 };
  const lo = Math.floor(Math.min(...Td, ...T) / 5) * 5, hi = Math.ceil(Math.max(...T, ...Td) / 5) * 5 || lo + 5;
  const x = i => pad.l + i / (T.length - 1) * (W - pad.l - pad.r);
  const y = v => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const line = a => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const pMax = Math.max(0.1, ...P);
  const bars = P.map((v, i) => v > 0 ? `<rect x="${(x(i) - 3).toFixed(1)}" y="${(H - pad.b - v / pMax * 30).toFixed(1)}" width="6" height="${(v / pMax * 30).toFixed(1)}" fill="#3fa7ff" opacity=".7"/>` : '').join('');
  const ticks = [0, 6, 12, 18, 24].filter(i => i < times.length).map(i => `<text x="${x(i)}" y="${H - 4}" fill="#8b9bb0" font-size="9" text-anchor="middle">${new Date(times[i]).toLocaleTimeString('en-US', { hour: 'numeric' })}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Temperature and dew point over the last 24 hours">
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(hi)}" y2="${y(hi)}" stroke="#263243"/>
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(lo)}" y2="${y(lo)}" stroke="#263243"/>
    <text x="2" y="${y(hi) + 3}" fill="#8b9bb0" font-size="9">${hi}°</text>
    <text x="2" y="${y(lo) + 3}" fill="#8b9bb0" font-size="9">${lo}°</text>
    ${bars}
    <path d="${line(T)}" fill="none" stroke="#ff7a59" stroke-width="2"/>
    <path d="${line(Td)}" fill="none" stroke="#36c98e" stroke-width="2"/>
    ${ticks}
    <text x="${W - pad.r}" y="10" fill="#ff7a59" font-size="9" text-anchor="end">Temp</text>
    <text x="${W - pad.r - 30}" y="10" fill="#36c98e" font-size="9" text-anchor="end">Dew pt</text>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------
function renderLegend() {
  const blocks = [];
  const prod = state.product;
  if (prod === 'refl') {
    blocks.push(`<div class="legend-block"><div class="legend-title">Reflectivity (dBZ)</div>
      <div class="legend-bar" style="background:linear-gradient(90deg,${REFL_LEGEND.map(s => s[1]).join(',')})"></div>
      <div class="legend-ticks">${[5, 20, 35, 50, 65, 75].map(v => `<span>${v}</span>`).join('')}</div></div>`);
  } else if (prod === 'vel') {
    const pick = VEL_ANCHORS.filter((_, i) => i % 2 === 0);
    blocks.push(`<div class="legend-block"><div class="legend-title">Velocity (approx. m/s · green = toward radar, red = away)</div>
      <div class="legend-bar" style="background:linear-gradient(90deg,${pick.map(a => `rgb(${a[1]},${a[2]},${a[3]})`).join(',')})"></div>
      <div class="legend-ticks"><span>-80</span><span>-40</span><span>0</span><span>+40</span><span>+70</span></div></div>`);
  } else if (prod === 'hc') {
    blocks.push(`<div class="legend-block"><div class="legend-title">Hydrometeor classification</div><div class="legend-cats">
      ${HC_CLASSES.map(c => `<span><i style="background:rgb(${c.rgb})"></i>${c.label}</span>`).join('')}</div></div>`);
  } else if (prod === 'stp') {
    blocks.push(`<div class="legend-block"><div class="legend-title">Storm total precipitation (radar estimate)</div>
      <div class="legend-cats"><span class="muted">Colors follow NWS storm-total scale; light blues are under 0.5 in, reds and purples several inches.</span></div></div>`);
  }
  const pt = ['rain', 'snow', 'hail'].filter(g => state.overlays.has(g));
  if (pt.length) {
    blocks.push(`<div class="legend-block"><div class="legend-title">Precip type</div><div class="legend-cats">
      ${HC_CLASSES.filter(c => pt.includes(c.group)).map(c => `<span><i style="background:rgb(${c.out})"></i>${c.label}</span>`).join('')}</div>
      <div class="small muted" style="margin-top:4px">Classified at beam height: snow/ice far from the radar is usually aloft and melts before reaching the ground in Florida.</div></div>`);
  }
  if (state.overlays.has('nrot')) {
    blocks.push(`<div class="legend-block"><div class="legend-title">Normalized rotation (estimated)</div>
      <div class="legend-bar" style="background:linear-gradient(90deg,#ffeb3b,#ff9800,#f42f2f,#e91ea0,#fff)"></div>
      <div class="legend-ticks"><span>0.5</span><span>0.8</span><span>1.0</span><span>1.5</span><span>2+</span></div></div>`);
  }
  const fieldMeta = { dewpoint: 'Dew point', cape: 'CAPE', rain24: '24-hr rainfall', tchg24: '24-hr temperature change' };
  for (const k of Object.keys(RAMPS)) {
    if (!state.overlays.has(k)) continue;
    const s = RAMPS[k].stops;
    blocks.push(`<div class="legend-block"><div class="legend-title">${fieldMeta[k]} (${RAMPS[k].unit})</div>
      <div class="legend-bar" style="background:${cssRamp(s)}"></div>
      <div class="legend-ticks"><span>${s[0][0]}</span><span>${s[Math.floor(s.length / 2)][0]}</span><span>${s[s.length - 1][0]}+</span></div></div>`);
  }
  if (state.radar.note) blocks.push(`<div class="small muted">${esc(state.radar.note)}</div>`);
  $('#legend').innerHTML = blocks.join('') || '<span class="muted small">Nothing selected.</span>';
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
function renderRadarList() {
  const el = $('#radarList');
  el.innerHTML = '';
  for (const r of RADARS) {
    const b = document.createElement('button');
    b.className = 'radar-btn' + (r === state.radar ? ' active' : '');
    b.innerHTML = `<b>${r.name}</b><span>${r.sub}</span>`;
    b.onclick = () => selectRadar(r);
    el.appendChild(b);
  }
}

function renderProducts() {
  const el = $('#productList');
  el.innerHTML = '';
  for (const p of PRODUCTS) {
    const ok = p.layer(state.radar) !== null || p.id === 'none';
    const b = document.createElement('button');
    b.textContent = p.name;
    b.className = p.id === state.product ? 'active' : '';
    b.disabled = !ok;
    b.title = ok ? '' : 'Not available from TDWR';
    if (!ok) b.style.opacity = .4;
    b.onclick = () => { state.product = p.id; renderProducts(); showBase(); };
    el.appendChild(b);
  }
}

function selectRadar(r) {
  state.radar = r;
  const prod = PRODUCTS.find(p => p.id === state.product);
  if (!prod.layer(r) && prod.id !== 'none') state.product = 'refl';
  renderRadarList(); renderProducts(); drawSites(); showBase();
  map.flyTo([r.lat, r.lon], Math.max(map.getZoom(), 8), { duration: 0.8 });
  safe(updatePrecipType); safe(updateRotation);
}

async function safe(fn) {
  try { await fn(); } catch (e) { console.error(e); status('Data error — retrying next cycle'); }
}

document.querySelectorAll('[data-overlay]').forEach(cb => {
  cb.checked = state.overlays.has(cb.dataset.overlay);
  cb.addEventListener('change', () => {
    const k = cb.dataset.overlay;
    cb.checked ? state.overlays.add(k) : state.overlays.delete(k);
    renderLegend();
    if (['rain', 'snow', 'hail'].includes(k)) safe(updatePrecipType);
    else if (k === 'nrot') safe(updateRotation);
    else if (k === 'alerts') safe(updateAlerts);
    else safe(updateFields);
  });
});

$('#opacity').addEventListener('input', e => {
  state.opacity = e.target.value / 100;
  if (baseLayer && !state.playing) baseLayer.setOpacity(state.opacity);
  if (state.playing) state.frames[state.frameIdx]?.setOpacity(state.opacity);
  derived.hcOverlay?.setOpacity(state.opacity);
});

$('#playBtn').onclick = () => {
  if (state.playing && state.playTimer) { stopAnimation(); $('#frameTime').textContent = 'Latest scan'; loadTimes().catch(() => {}); }
  else if (state.playing) { stopAnimation(); startAnimation(); }
  else startAnimation();
};
$('#refreshBtn').onclick = () => refreshAll(true);

const setCollapsed = c => { $('#app').classList.toggle('collapsed', c); $('#panelOpen').hidden = !c; setTimeout(() => map.invalidateSize(), 220); };
$('#panelToggle').onclick = () => setCollapsed(true);
$('#panelOpen').onclick = () => setCollapsed(false);
if (window.innerWidth < 760) setCollapsed(true);

// Click on the map: point conditions + alerts, and move the 24-hr climate there.
let pointMarker = null;
map.on('click', async e => {
  const { lat, lng } = e.latlng;
  state.point = { lat, lon: lng, name: `${lat.toFixed(2)}, ${lng.toFixed(2)}` };
  if (pointMarker) pointMarker.remove();
  pointMarker = L.circleMarker(e.latlng, { radius: 6, color: '#fff', weight: 2, fillColor: '#3fa7ff', fillOpacity: 1, pane: 'markers' }).addTo(map);
  const here = state.alerts.filter(a => pointInGeom(lat, lng, a.geom));
  const popup = L.popup().setLatLng(e.latlng).setContent('<span class="muted">Loading…</span>').openOn(map);
  safe(updateClimate);
  try {
    const j = await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      '&current=temperature_2m,dew_point_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cape,precipitation' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch');
    const c = j.current;
    popup.setContent(`<h3>${lat.toFixed(3)}, ${lng.toFixed(3)}</h3>
      ${Math.round(c.temperature_2m)}°F · dew point ${Math.round(c.dew_point_2m)}°F · RH ${c.relative_humidity_2m}%<br>
      Wind ${compass(c.wind_direction_10m)} ${Math.round(c.wind_speed_10m)} mph, gusts ${Math.round(c.wind_gusts_10m)} · CAPE ${Math.round(c.cape)} J/kg
      ${here.length ? '<hr style="border-color:#263243">' + here.map(a => `<div style="color:${a.color};font-weight:600">${esc(a.p.event)}</div>`).join('') : '<div class="small muted" style="margin-top:6px">No alerts at this point.</div>'}`);
  } catch { popup.setContent('Could not load conditions here.'); }
});

// Search (OpenStreetMap Nominatim) and geolocation
$('#search').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#searchInput').value.trim();
  const ul = $('#searchResults');
  if (!q) { ul.hidden = true; return; }
  try {
    const res = await fetchJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&q=${encodeURIComponent(q)}`);
    ul.innerHTML = '';
    if (!res.length) ul.innerHTML = '<li class="muted">No results</li>';
    for (const r of res) {
      const li = document.createElement('li');
      li.textContent = r.display_name;
      li.onclick = () => goTo(+r.lat, +r.lon, r.display_name.split(',').slice(0, 2).join(','));
      ul.appendChild(li);
    }
    ul.hidden = false;
  } catch { ul.innerHTML = '<li class="muted">Search failed</li>'; ul.hidden = false; }
});
$('#locateBtn').onclick = () => navigator.geolocation?.getCurrentPosition(
  p => goTo(p.coords.latitude, p.coords.longitude, 'My location'),
  () => status('Location unavailable'));

function goTo(lat, lon, name) {
  $('#searchResults').hidden = true;
  state.point = { lat, lon, name };
  map.flyTo([lat, lon], 10);
  if (pointMarker) pointMarker.remove();
  pointMarker = L.circleMarker([lat, lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#3fa7ff', fillOpacity: 1, pane: 'markers' }).addTo(map);
  safe(updateClimate);
}

setInterval(() => { $('#clock').textContent = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date()); }, 1000);

// ---------------------------------------------------------------------------
// Boot + refresh loop
// ---------------------------------------------------------------------------
async function refreshAll(manual) {
  if (manual) status('Refreshing…');
  if (baseLayer && !state.playing) baseLayer.setParams({ _ts: Date.now() });
  await Promise.all([safe(loadTimes), safe(updateAlerts), safe(updatePrecipType), safe(updateRotation), safe(updateFields)]);
  if (manual) safe(updateClimate);
}

renderRadarList();
renderProducts();
drawSites();
showBase();
safe(updateAlerts);
safe(updateClimate);
setInterval(() => refreshAll(false), REFRESH_MS);
setInterval(() => safe(updateClimate), 15 * 60 * 1000);
