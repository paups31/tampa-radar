/* Add-on: Surface conditions - temperature, humidity and air pressure.
 * Live airport weather-station readings (IEM ASOS/AWOS, via addons/obs.js) blended into a colored map
 * layer, with optional station values. Refreshes every 10 minutes.
 * Purely additive: own panes, own panel section.
 */
'use strict';
(() => {
  const B = { s: 24.0, n: 31.6, w: -88.0, e: -79.2 };
  const R = SurfaceObs.ramp;
  const FIELDS = {
    temp: { label: 'Temperature', unit: '°F', value: s => s.t, fmt: v => `${Math.round(v)}°`,
      stops: [[32, '#6a3d9a'], [45, '#1f78b4'], [55, '#33a1c9'], [65, '#2fbf71'], [72, '#c7e95b'], [80, '#ffd23f'], [88, '#ff8c1a'], [95, '#e4572e'], [102, '#b2182b']] },
    rh: { label: 'Humidity', unit: '%', value: s => s.rh, fmt: v => `${Math.round(v)}%`,
      stops: [[20, '#a0522d'], [35, '#d9a35b'], [50, '#e9e29c'], [65, '#7fcdbb'], [80, '#2c7fb8'], [95, '#253494']] },
    pres: { label: 'Air pressure', unit: 'mb', value: s => s.mslp, fmt: v => v.toFixed(1),
      stops: [[996, '#7b3294'], [1004, '#c2a5cf'], [1010, '#e7e1ef'], [1016, '#a6dba0'], [1022, '#5aae61'], [1030, '#1b7837']] },
  };
  const KEY = 'surface.v1';
  let prefs = { field: '', labels: true, opacity: 60 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

  map.createPane('sfcField').style.zIndex = 336;
  map.createPane('sfcLabels').style.zIndex = 455;
  map.getPane('sfcField').style.pointerEvents = 'none';

  const sec = document.createElement('section');
  sec.id = 'surfaceSec';
  sec.innerHTML = `
    <h2>Surface conditions <span id="sfPill" class="pill">off</span></h2>
    <div class="checks">
      ${Object.entries(FIELDS).map(([k, f]) => `<label><input type="checkbox" data-sf="${k}"> <span class="sw" style="background:linear-gradient(90deg,${f.stops.map(s => s[1]).join(',')})"></span>${f.label} (${f.unit})</label>`).join('')}
      <label><input type="checkbox" id="sfLabels"> Show station readings</label>
    </div>
    <label class="slider">Opacity <input id="sfOpacity" type="range" min="20" max="90"></label>
    <div id="sfLegend"></div>
    <div id="sfTampa" class="sf-tampa small"></div>
    <div class="muted small">Live airport weather stations (ASOS/AWOS via Iowa Environmental Mesonet), blended between stations. Updates every 10 min.</div>`;
  const anchor = document.getElementById('rain3dSec') || document.getElementById('lightningSec') || document.querySelector('#panel footer');
  anchor.before(sec);
  const $ = q => sec.querySelector(q);
  $('#sfLabels').checked = prefs.labels;
  $('#sfOpacity').value = prefs.opacity;

  let overlay = null, labels = L.layerGroup().addTo(map), timer = null, stations = [];
  const tfmt = t => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(t));

  function legend(f) {
    const st = f.stops;
    return `<div class="legend-block"><div class="legend-title">${f.label} (${f.unit})</div>
      <div class="legend-bar" style="background:linear-gradient(90deg,${st.map(s => s[1]).join(',')})"></div>
      <div class="legend-ticks"><span>${st[0][0]}</span><span>${st[Math.floor(st.length / 2)][0]}</span><span>${st[st.length - 1][0]}</span></div></div>`;
  }

  function drawLabels() {
    labels.clearLayers();
    const f = FIELDS[prefs.field];
    if (!f || !prefs.labels || map.getZoom() < 7) return;
    const b = map.getBounds().pad(0.1);
    for (const s of stations) {
      const v = f.value(s);
      if (!Number.isFinite(v) || !b.contains([s.lat, s.lon])) continue;
      const col = R(f.stops)(v);
      L.marker([s.lat, s.lon], {
        pane: 'sfcLabels', interactive: true, keyboard: false,
        icon: L.divIcon({ className: 'sf-label', html: `<span style="border-color:rgb(${col[0]},${col[1]},${col[2]})">${f.fmt(v)}</span>`, iconSize: null }),
      }).bindTooltip(`<b>${s.id}</b> ${s.name}<br>${Math.round(s.t)}°F · dew pt ${Math.round(s.td)}°F · humidity ${Math.round(s.rh)}%<br>` +
        `${s.mslp ? s.mslp.toFixed(1) + ' mb · ' : ''}wind ${s.wdir ?? '--'}° ${Math.round(s.wspd ?? 0)} kt${s.gust ? ' G' + Math.round(s.gust) : ''} · vis ${s.vis ?? '--'} mi<br><span class="muted">${tfmt(s.time)}</span>`, { direction: 'top' })
        .addTo(labels);
    }
  }

  function tampa() {
    const k = stations.find(s => s.id === 'TPA') || stations.reduce((a, s) => {
      const d = Math.hypot(s.lat - HOME.lat, s.lon - HOME.lon); return !a || d < a.d ? { ...s, d } : a;
    }, null);
    if (!k) { $('#sfTampa').textContent = ''; return; }
    $('#sfTampa').innerHTML = `<b>Tampa (${k.id})</b> ${Math.round(k.t)}°F · humidity ${Math.round(k.rh)}% · ` +
      `${k.mslp ? k.mslp.toFixed(1) + ' mb' : ''} <span class="muted">${tfmt(k.time)}</span>`;
  }

  async function refresh() {
    const f = FIELDS[prefs.field];
    if (!f) return;
    $('#sfPill').textContent = 'loading';
    try { stations = await SurfaceObs.get(); } catch { $('#sfPill').textContent = 'offline'; return; }
    const url = SurfaceObs.paintField(stations, f.value, R(f.stops), B, 300, 260);
    if (overlay) overlay.setUrl(url);
    else overlay = L.imageOverlay(url, [[B.s, B.w], [B.n, B.e]], { pane: 'sfcField', opacity: prefs.opacity / 100 }).addTo(map);
    overlay.getElement() && (overlay.getElement().style.imageRendering = 'auto');
    drawLabels(); tampa();
    const newest = Math.max(...stations.map(s => s.time));
    $('#sfPill').textContent = `${f.label.split(' ')[0].toLowerCase()} ${tfmt(newest)}`;
  }

  function apply() {
    sec.querySelectorAll('[data-sf]').forEach(cb => { cb.checked = cb.dataset.sf === prefs.field; });
    clearInterval(timer); timer = null;
    const f = FIELDS[prefs.field];
    $('#sfLegend').innerHTML = f ? legend(f) : '';
    if (!f) {
      if (overlay) { map.removeLayer(overlay); overlay = null; }
      labels.clearLayers(); $('#sfPill').textContent = 'off'; $('#sfTampa').textContent = '';
      return;
    }
    refresh();
    timer = setInterval(refresh, 10 * 60 * 1000);
  }

  sec.querySelectorAll('[data-sf]').forEach(cb => cb.addEventListener('change', () => {
    prefs.field = cb.checked ? cb.dataset.sf : ''; save(); apply();
  }));
  $('#sfLabels').addEventListener('change', e => { prefs.labels = e.target.checked; save(); drawLabels(); });
  $('#sfOpacity').addEventListener('input', e => { prefs.opacity = +e.target.value; save(); overlay && overlay.setOpacity(prefs.opacity / 100); });
  map.on('zoomend moveend', drawLabels);
  apply();
})();
