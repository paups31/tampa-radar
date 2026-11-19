/* Add-on: Wind shear + 3D wind vectors.
 * Winds at the surface (10 m) and at 850, 700, 500 and 300 hPa (~1.5, 3, 5.6, 9 km) on a 1-degree grid
 * over Florida from Open-Meteo (current hour of the GFS/HRRR blend), cached 30 min to stay well under its
 * rate limit. 0-6 km bulk shear = difference between the ~500 hPa wind and the surface wind.
 *   Map: colored shear field + arrows pointing along the shear vector.
 *   3D : arrows at each height inside the 3D rainfall view, showing how the wind turns and speeds up with height.
 * Purely additive: own panes, own panel section; draws into the 3D view through window.Rain3D.
 */
'use strict';
(() => {
  const LEVELS = [
    { key: '10m', label: 'Surface', km: 0.3, color: [235, 245, 255] },
    { key: '850hPa', label: '850 mb (~1.5 km)', km: 1.5, color: [80, 220, 120] },
    { key: '700hPa', label: '700 mb (~3 km)', km: 3.0, color: [255, 225, 60] },
    { key: '500hPa', label: '500 mb (~5.6 km)', km: 5.6, color: [255, 140, 30] },
    { key: '300hPa', label: '300 mb (~9 km)', km: 9.2, color: [235, 70, 200] },
  ];
  const GRID = { lat0: 24.5, lat1: 31.0, lon0: -87.5, lon1: -79.5, step: 1.0 };
  const B = { s: 24.0, n: 31.5, w: -88.0, e: -79.0 };
  const VEX = 5;                 // vertical exaggeration of the 3D arrows
  const KM_PER_KT = 1.1;         // 3D arrow length per knot
  const CACHE_KEY = 'windshear.data.v1', KEY = 'windshear.v1';
  const SHEAR_STOPS = [[0, '#2b3a4a'], [10, '#3b6e8f'], [20, '#4fb3a0'], [30, '#f0d43a'], [40, '#ff8c1a'], [50, '#e5304a'], [65, '#b03bd6']];
  const shearColor = SurfaceObs.ramp(SHEAR_STOPS);

  let prefs = { map: false, vectors: false, opacity: 55 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

  map.createPane('wsField').style.zIndex = 337;
  map.getPane('wsField').style.pointerEvents = 'none';
  map.createPane('wsArrows').style.zIndex = 457;
  map.getPane('wsArrows').style.pointerEvents = 'none';

  const sec = document.createElement('section');
  sec.id = 'windShearSec';
  sec.innerHTML = `
    <h2>Wind shear <span id="wsPill" class="pill">off</span></h2>
    <div class="checks">
      <label><input type="checkbox" id="wsMap"> <span class="sw" style="background:linear-gradient(90deg,${SHEAR_STOPS.map(s => s[1]).join(',')})"></span>0–6 km wind shear map (kt)</label>
      <label><input type="checkbox" id="wsVec"> 3D wind vectors (opens the 3D view)</label>
    </div>
    <label class="slider">Opacity <input id="wsOpacity" type="range" min="20" max="90"></label>
    <div id="wsLegend"></div>
    <div id="wsTampa" class="ws-tampa small"></div>
    <div class="muted small">Model winds (Open-Meteo, current hour) at 5 heights on a 1° grid. Shear above ~35 kt supports organized
      and rotating storms; above ~50 kt supercells are possible when storms form.</div>`;
  const anchor = document.getElementById('satelliteSec') || document.getElementById('rain3dSec') || document.querySelector('#panel footer');
  anchor.before(sec);
  const $ = q => sec.querySelector(q);
  $('#wsMap').checked = prefs.map; $('#wsVec').checked = prefs.vectors; $('#wsOpacity').value = prefs.opacity;

  // ---------------- data ----------------
  let data = null, field = null, arrows = L.layerGroup().addTo(map), timer = null;
  const toUV = (spd, dir) => { const r = dir * Math.PI / 180; return [-spd * Math.sin(r), -spd * Math.cos(r)]; }; // wind blows FROM dir
  const compass = deg => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

  async function load() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.at < 30 * 60 * 1000) return c;
    } catch { /* ignore */ }
    const pts = [];
    for (let la = GRID.lat0; la <= GRID.lat1 + 1e-6; la += GRID.step) for (let lo = GRID.lon0; lo <= GRID.lon1 + 1e-6; lo += GRID.step) pts.push([+la.toFixed(2), +lo.toFixed(2)]);
    const vars = LEVELS.flatMap(l => [`wind_speed_${l.key}`, `wind_direction_${l.key}`]).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map(p => p[0]).join(',')}&longitude=${pts.map(p => p[1]).join(',')}` +
      `&hourly=${vars}&forecast_hours=2&wind_speed_unit=kn&timezone=GMT`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status === 429 ? 'Open-Meteo is busy (rate limit) - try again in a few minutes' : 'Open-Meteo ' + r.status);
    let arr = await r.json(); if (!Array.isArray(arr)) arr = [arr];
    const nowKey = new Date().toISOString().slice(0, 13) + ':00';
    const cells = arr.map((loc, i) => {
      const h = loc.hourly; let k = h.time.indexOf(nowKey); if (k < 0) k = 0;
      const lv = LEVELS.map(l => ({ spd: h[`wind_speed_${l.key}`][k], dir: h[`wind_direction_${l.key}`][k] }));
      const [u0, v0] = toUV(lv[0].spd, lv[0].dir), [u6, v6] = toUV(lv[3].spd, lv[3].dir);
      const su = u6 - u0, sv = v6 - v0;
      return { lat: pts[i][0], lon: pts[i][1], lv, shear: Math.hypot(su, sv), shearTo: (Math.atan2(su, sv) * 180 / Math.PI + 360) % 360 };
    });
    const out = { at: Date.now(), cells };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(out)); } catch { /* ignore */ }
    return out;
  }

  // ---------------- 2D map ----------------
  function drawMap() {
    if (field) { map.removeLayer(field); field = null; }
    arrows.clearLayers();
    if (!prefs.map || !data) return;
    const url = SurfaceObs.paintField(data.cells, c => c.shear, shearColor, B, 180, 150, 80);
    field = L.imageOverlay(url, [[B.s, B.w], [B.n, B.e]], { pane: 'wsField', opacity: prefs.opacity / 100 }).addTo(map);
    for (const c of data.cells) {
      const len = Math.max(14, Math.min(56, c.shear * 0.9));
      const svg = `<svg class="ws-arrow" width="70" height="70" viewBox="-35 -35 70 70" style="transform:translate(-35px,-35px) rotate(${c.shearTo}deg)">
        <line x1="0" y1="${len / 2}" x2="0" y2="${-len / 2}" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M-5 ${-len / 2 + 7} L0 ${-len / 2} L5 ${-len / 2 + 7}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="0" y="${len / 2 + 11}" text-anchor="middle" transform="rotate(${-c.shearTo} 0 ${len / 2 + 7})" fill="#fff" font-size="10" font-weight="700" style="paint-order:stroke" stroke="#0d1117" stroke-width="3">${Math.round(c.shear)}</text></svg>`;
      L.marker([c.lat, c.lon], { pane: 'wsArrows', interactive: false, icon: L.divIcon({ className: '', html: svg, iconSize: null }) }).addTo(arrows);
    }
  }

  function legend() {
    $('#wsLegend').innerHTML = prefs.map ? `<div class="legend-block"><div class="legend-title">0–6 km bulk shear (kt) · arrows point along the shear</div>
      <div class="legend-bar" style="background:linear-gradient(90deg,${SHEAR_STOPS.map(s => s[1]).join(',')})"></div>
      <div class="legend-ticks">${[0, 20, 35, 50, 65].map(v => `<span>${v}</span>`).join('')}</div></div>` : '';
  }

  function tampa() {
    if (!data) { $('#wsTampa').textContent = ''; return; }
    const c = data.cells.reduce((a, x) => (!a || Math.hypot(x.lat - HOME.lat, x.lon - HOME.lon) < Math.hypot(a.lat - HOME.lat, a.lon - HOME.lon) ? x : a), null);
    const cat = c.shear < 20 ? 'weak' : c.shear < 35 ? 'moderate' : c.shear < 50 ? 'strong' : 'very strong';
    $('#wsTampa').innerHTML = `<b>Tampa area:</b> ${Math.round(c.shear)} kt shear (${cat}) · surface ${compass(c.lv[0].dir)} ${Math.round(c.lv[0].spd)} kt → ` +
      `5.6 km ${compass(c.lv[3].dir)} ${Math.round(c.lv[3].spd)} kt`;
  }

  // ---------------- 3D vectors ----------------
  function vectorLayers() {
    if (!prefs.vectors || !data || !window.deck) return [];
    const shafts = [], heads = [], masts = [];
    for (const c of data.cells) {
      const kx = 111.32 * Math.cos(c.lat * Math.PI / 180);
      masts.push({ from: [c.lon, c.lat, 0], to: [c.lon, c.lat, LEVELS[LEVELS.length - 1].km * 1000 * VEX], color: [200, 210, 220, 90] });
      c.lv.forEach((w, i) => {
        const L0 = LEVELS[i], z = L0.km * 1000 * VEX;
        const [u, v] = toUV(w.spd, w.dir), lenKm = w.spd * KM_PER_KT;
        if (!(lenKm > 0.5)) return;
        const ux = u / w.spd, vy = v / w.spd;
        const half = [ux * lenKm / 2 / kx, vy * lenKm / 2 / 111.32];
        const a = [c.lon - half[0], c.lat - half[1], z], b = [c.lon + half[0], c.lat + half[1], z];
        const info = { level: L0.label, spd: w.spd, dir: w.dir, shear: c.shear, lat: c.lat, lon: c.lon };
        shafts.push({ from: a, to: b, color: [...L0.color, 255], info });
        const hk = Math.min(lenKm * 0.3, 18);
        for (const s of [1, -1]) {
          const ang = Math.atan2(vy, ux) + Math.PI + s * 0.45;
          heads.push({ from: b, to: [b[0] + Math.cos(ang) * hk / kx, b[1] + Math.sin(ang) * hk / 111.32, z], color: [...L0.color, 255] });
        }
      });
    }
    const line = (id, d, w, pick) => new deck.LineLayer({
      id, data: d, getSourcePosition: x => x.from, getTargetPosition: x => x.to, getColor: x => x.color,
      getWidth: w, widthUnits: 'pixels', pickable: pick, autoHighlight: pick, highlightColor: [255, 255, 255, 200],
    });
    return [line('wind-masts', masts, 1, false), line('wind-shafts', shafts, 3.5, true), line('wind-heads', heads, 3.5, false)];
  }
  Rain3D.extraLayers.push(vectorLayers);

  // Tooltip for wind arrows: augment the 3D view's tooltip by listening for hover via a title overlay.
  let windBox = null;
  function windLegend() {
    if (!windBox) {
      windBox = document.createElement('div');
      windBox.className = 'r3-wind';
      Rain3D.element.appendChild(windBox);
    }
    windBox.hidden = !prefs.vectors;
    if (!prefs.vectors) return;
    windBox.innerHTML = `<div class="r3-leg-title">Wind by height <span class="muted">(${VEX}× taller)</span></div>` +
      LEVELS.slice().reverse().map(l => `<div class="r3-wl"><i style="background:rgb(${l.color.join(',')})"></i>${l.label}</div>`).join('') +
      `<div class="muted">Arrows point downwind; longer = faster. A big turn or speed-up with height = strong shear.</div>` +
      (data ? '' : '<div class="muted">Loading winds…</div>');
  }

  // Toggle button inside the 3D view's top bar.
  const topBar = Rain3D.element.querySelector('.r3-top');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'r3WindBtn'; btn.textContent = 'Wind vectors'; btn.title = 'Show 3D wind arrows at 5 heights';
  topBar.insertBefore(btn, topBar.querySelector('#r3Here'));
  const syncBtn = () => btn.classList.toggle('on', prefs.vectors);

  async function refresh() {
    if (!prefs.map && !prefs.vectors) return;
    $('#wsPill').textContent = 'loading';
    try {
      data = await load();
      $('#wsPill').textContent = 'on';
    } catch (e) {
      $('#wsPill').textContent = 'error';
      $('#wsTampa').textContent = e.message;
      return;
    }
    drawMap(); tampa(); windLegend(); Rain3D.render();
  }

  function apply() {
    legend(); windLegend(); syncBtn();
    clearInterval(timer); timer = null;
    if (!prefs.map && !prefs.vectors) {
      drawMap(); Rain3D.render(); $('#wsPill').textContent = 'off'; $('#wsTampa').textContent = '';
      return;
    }
    drawMap(); Rain3D.render();
    refresh();
    timer = setInterval(refresh, 30 * 60 * 1000);
  }

  function setVectors(on) {
    prefs.vectors = on; save(); $('#wsVec').checked = on; apply();
    if (on && !Rain3D.isOpen()) Rain3D.open();
  }

  $('#wsMap').addEventListener('change', e => { prefs.map = e.target.checked; save(); apply(); });
  $('#wsVec').addEventListener('change', e => setVectors(e.target.checked));
  btn.addEventListener('click', () => setVectors(!prefs.vectors));
  $('#wsOpacity').addEventListener('input', e => { prefs.opacity = +e.target.value; save(); field && field.setOpacity(prefs.opacity / 100); });
  apply();
})();
