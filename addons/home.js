/* Home page: a live summary of Tampa weather, with taps into the full radar (index.html?show=...)
 * and the 24-hour forecast window. Refreshes every 2 minutes. Standalone page; does not touch the radar app.
 */
'use strict';
(() => {
  const HOME = { lat: 27.9506, lon: -82.4572, name: 'Tampa, FL' };
  const TZ = 'America/New_York';
  const NWS = { headers: { Accept: 'application/geo+json' } };
  const $ = s => document.getElementById(s);
  const fmt = (t, o) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o }).format(new Date(t));
  const time = t => fmt(t, { hour: 'numeric', minute: '2-digit' });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COS = Math.cos(HOME.lat * Math.PI / 180);
  const miFrom = (lat, lon) => Math.hypot((lat - HOME.lat) * 69, (lon - HOME.lon) * 69 * COS);
  const bearing = (lat, lon) => (Math.atan2((lon - HOME.lon) * COS, lat - HOME.lat) * 180 / Math.PI + 360) % 360;
  const dir8 = d => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((d % 360) + 360) % 360 / 45) % 8];
  const dir16 = d => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
  const kt2mph = k => Math.round(k * 1.15078);
  async function j(url, opt) { const r = await fetch(url, opt); if (!r.ok) throw new Error(r.status); return r.json(); }
  const set = (big, detail, bigText, detailHtml, cls) => { const b = $(big); b.textContent = bigText; b.className = 'h-big' + (cls ? ' ' + cls : ''); $(detail).innerHTML = detailHtml; };
  const safe = async (name, fn) => { try { await fn(); } catch (e) { console.warn(name, e); } };

  function emoji(text, isDay = true) {
    const t = (text || '').toLowerCase();
    if (/thunder|t-storm|ts/.test(t)) return '⛈️';
    if (/snow|sleet|ice/.test(t)) return '🌨️';
    if (/heavy rain|showers/.test(t)) return '🌧️';
    if (/rain|drizzle/.test(t)) return '🌦️';
    if (/fog|haze|smoke|mist/.test(t)) return '🌫️';
    if (/overcast|mostly cloudy|cloudy/.test(t)) return '☁️';
    if (/partly|few|scattered/.test(t)) return isDay ? '⛅' : '☁️';
    return isDay ? '☀️' : '🌙';
  }
  const isDayNow = () => { const h = +fmt(Date.now(), { hour: 'numeric', hourCycle: 'h23' }); return h >= 7 && h < 19; };

  // ---------------- clock ----------------
  const tick = () => { $('hClock').textContent = fmt(Date.now(), { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  tick(); setInterval(tick, 15000);

  // ---------------- radar preview map ----------------
  const map = L.map('hMap', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false, touchZoom: false, tap: false }).setView([HOME.lat, HOME.lon], 8);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 15 }).addTo(map);
  let radar = null;
  function radarLayer() {
    const b = Math.floor(Date.now() / 120000);
    const l = L.tileLayer(`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?_=${b}`, { opacity: 0.8 }).addTo(map);
    if (radar) l.once('load', () => { map.removeLayer(radar); radar = l; }); else radar = l;
    $('hMapTime').textContent = `Radar · ${time(Date.now())}`;
  }
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 15, pane: 'markerPane' }).addTo(map);
  L.circle([HOME.lat, HOME.lon], { radius: 25 * 1609, color: '#58a6ff', weight: 1.5, fill: false, dashArray: '6 6' }).addTo(map);
  L.circleMarker([HOME.lat, HOME.lon], { radius: 6, color: '#0d1117', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(map);
  let stormMarks = L.layerGroup().addTo(map);

  // ---------------- current conditions ----------------
  let stations = [];
  async function now() {
    stations = await SurfaceObs.get();
    const s = stations.find(x => x.id === 'TPA') || stations.reduce((a, x) => (!a || miFrom(x.lat, x.lon) < miFrom(a.lat, a.lon) ? x : a), null);
    let desc = '';
    try { desc = (await j('https://api.weather.gov/stations/KTPA/observations/latest', NWS)).properties.textDescription; } catch { /* optional */ }
    if (!desc) desc = /RA/.test(s.wx) ? 'Rain' : s.sky === 'OVC' ? 'Overcast' : s.sky === 'BKN' ? 'Mostly cloudy' : /SCT|FEW/.test(s.sky) ? 'Partly cloudy' : 'Clear';
    $('hNowIcon').textContent = emoji(desc + ' ' + s.wx, isDayNow());
    $('hNowTemp').textContent = `${Math.round(s.t)}°`;
    $('hNowDesc').textContent = desc;
    $('hNowHiLo').textContent = `Today so far: high ${Math.round(s.hi)}° · low ${Math.round(s.lo)}° · ${s.id} at ${time(s.time)}`;
    const stats = [
      ['Feels like', s.feel != null ? `${Math.round(s.feel)}°` : '--'],
      ['Humidity', `${Math.round(s.rh)}%`],
      ['Dew point', `${Math.round(s.td)}°`],
      ['Wind', s.wspd ? `${dir16(s.wdir)} ${kt2mph(s.wspd)} mph${s.gust ? `, gusts ${kt2mph(s.gust)}` : ''}` : 'Calm'],
      ['Pressure', s.mslp ? `${s.mslp.toFixed(1)} mb` : '--'],
      ['Visibility', s.vis != null ? `${s.vis} mi` : '--'],
    ];
    $('hNowStats').innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    // sky & visibility tile
    const cover = { CLR: 'Clear', SKC: 'Clear', FEW: 'A few clouds', SCT: 'Partly cloudy', BKN: 'Mostly cloudy', OVC: 'Overcast', VV: 'Sky obscured' };
    const top = s.skyAll.includes('OVC') ? 'OVC' : s.skyAll.includes('BKN') ? 'BKN' : s.skyAll.includes('SCT') ? 'SCT' : s.skyAll.includes('FEW') ? 'FEW' : 'CLR';
    const foggy = stations.filter(x => (x.vis != null && x.vis <= 3) || /FG|BR/.test(x.wx));
    const nearFog = foggy.filter(x => miFrom(x.lat, x.lon) < 40);
    set('kBig', 'kDetail', cover[top] || top, `Visibility ${s.vis ?? '--'} mi${s.ceil && (top === 'BKN' || top === 'OVC') ? ` · cloud base ${Number(s.ceil).toLocaleString()} ft` : ''}<br>` +
      (nearFog.length ? `Fog / low visibility near Tampa: ${nearFog.map(x => `${x.id} ${x.vis} mi`).join(', ')}` : `No fog near Tampa · ${foggy.length} low-visibility airport${foggy.length === 1 ? '' : 's'} statewide`),
    s.vis != null && s.vis < 1 ? 'bad' : s.vis != null && s.vis <= 3 ? 'warn' : '');

    // rain tile (part 1: observed)
    rainObs = { raining: /RA|DZ|TS|SH/.test(s.wx), wx: s.wx, today: s.pday, hour: s.phour, id: s.id };
    $('hUpdated').textContent = `updated ${time(Date.now())}`;
  }

  // ---------------- alerts ----------------
  async function alerts() {
    const a = await j(`https://api.weather.gov/alerts/active?point=${HOME.lat},${HOME.lon}`, NWS);
    const list = a.features.map(f => f.properties).filter(p => p.status === 'Actual');
    const cls = p => (/Extreme|Severe/.test(p.severity) ? 'sev' : p.severity === 'Moderate' ? 'mod' : 'min');
    $('hAlerts').innerHTML = list.map(p => `<a class="h-alert ${cls(p)}" href="index.html"><b>⚠️ ${esc(p.event)}</b>` +
      `<span class="small">${esc(p.headline || '')}${p.ends || p.expires ? ` · until ${fmt(p.ends || p.expires, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</span></a>`).join('');
  }

  // ---------------- storms (NEXRAD storm cells) + rain ----------------
  let rainObs = null;
  async function storms() {
    const g = await j('https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson', { cache: 'no-store' });
    const cells = [];
    for (const f of g.features) {
      const p = f.properties, [lon, lat] = f.geometry.coordinates, mi = miFrom(lat, lon);
      if (mi > 120) continue;
      const dup = cells.find(c => Math.hypot((c.lat - lat) * 69, (c.lon - lon) * 69 * COS) < 4);   // same cell seen by two radars
      if (dup) { if (Date.parse(p.valid) > dup.t) Object.assign(dup, { dbz: p.max_dbz, t: Date.parse(p.valid) }); continue; }
      const toward = (p.drct + 180) % 360, toHome = (bearing(lat, lon) + 180) % 360;
      const off = Math.abs(((toward - toHome + 540) % 360) - 180);
      const mph = kt2mph(p.sknt);
      cells.push({ lat, lon, mi, dbz: p.max_dbz, toward, mph, hail: p.max_size, meso: p.meso !== 'NONE', tvs: p.tvs !== 'NONE', t: Date.parse(p.valid),
        approaching: mph >= 5 && off < 35, eta: mph >= 5 && off < 35 ? Math.round(mi / mph * 60) : null });
    }
    cells.sort((a, b) => a.mi - b.mi);
    stormMarks.clearLayers();
    for (const c of cells.filter(c => c.mi < 90)) {
      L.circleMarker([c.lat, c.lon], { radius: 5, color: '#0d1117', weight: 1.5, fillColor: c.dbz >= 55 ? '#ff3b3b' : c.dbz >= 45 ? '#ffb000' : '#ffe84d', fillOpacity: 0.95 }).addTo(stormMarks);
    }
    const near = cells.filter(c => c.mi <= 25), n = cells[0];
    const coming = cells.filter(c => c.approaching && c.mi <= 60).sort((a, b) => a.eta - b.eta)[0];
    const severe = cells.filter(c => c.mi <= 60 && (c.tvs || c.meso || c.hail >= 1));
    let big, cls, detail;
    if (near.length) { big = `${near.length} storm${near.length > 1 ? 's' : ''} within 25 mi`; cls = near.some(c => c.dbz >= 50) ? 'bad' : 'warn'; }
    else if (n && n.mi <= 60) { big = `Nearest ${Math.round(n.mi)} mi ${dir8(bearing(n.lat, n.lon))}`; cls = ''; }
    else { big = 'None nearby'; cls = 'good'; }
    detail = n ? `Closest: ${Math.round(n.mi)} mi ${dir8(bearing(n.lat, n.lon))}, ${n.dbz} dBZ, moving ${dir8(n.toward)} at ${n.mph} mph` : 'No storm cells within 120 mi.';
    if (coming) detail += `<br><b>Heading toward Tampa:</b> ${Math.round(coming.mi)} mi ${dir8(bearing(coming.lat, coming.lon))}, arriving in ~${coming.eta < 60 ? coming.eta + ' min' : Math.round(coming.eta / 6) / 10 + ' h'}`;
    if (severe.length) detail += `<br>⚠️ ${severe.length} cell${severe.length > 1 ? 's' : ''} within 60 mi showing ${[...new Set(severe.flatMap(c => [c.tvs && 'tornado signature', c.meso && 'rotation', c.hail >= 1 && 'hail']).filter(Boolean))].join(', ')}`;
    set('sBig', 'sDetail', big, detail, cls);

    // rain tile (part 2)
    const r = rainObs || {};
    const heavy = cells.filter(c => c.mi <= 40).sort((a, b) => b.dbz - a.dbz)[0];
    const rate = dbz => Math.pow(Math.pow(10, Math.min(dbz, 55) / 10) / 200, 1 / 1.6) / 25.4;
    set('rBig', 'rDetail', r.raining ? 'Raining now' : 'Not raining',
      `${r.id || 'TPA'}: ${r.today != null ? (r.today < 0.01 ? (r.today > 0 ? 'a trace' : 'no rain') : r.today.toFixed(2) + ' in') : '--'} today` +
      `${r.hour ? `, ${r.hour.toFixed(2)} in this hour` : ''}` +
      (heavy ? `<br>Heaviest cell within 40 mi: ${heavy.dbz} dBZ (~${rate(heavy.dbz).toFixed(1)} in/hr), ${Math.round(heavy.mi)} mi ${dir8(bearing(heavy.lat, heavy.lon))}` : '<br>No storm cells within 40 mi'),
      r.raining ? 'warn' : '');
  }

  // ---------------- lightning ----------------
  async function lightning() {
    const NC = 'https://nowcoast.noaa.gov/geoserver/lightning_detection/ows', LAYER = 'ldn_lightning_strike_density', R = 150;
    const dLat = R / 69, dLon = R / (69 * COS), s = HOME.lat - dLat, n = HOME.lat + dLat, w = HOME.lon - dLon, e = HOME.lon + dLon, W = 300;
    const url = `${NC}?service=WMS&version=1.3.0&request=GetMap&layers=${LAYER}&styles=&crs=EPSG:4326&bbox=${s},${w},${n},${e}&width=${W}&height=${W}&format=image/png&transparent=true&_=${Math.floor(Date.now() / 120000)}`;
    const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = c.height = W;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, W).data;
    let best = Infinity, bl = 0, bo = 0, n25 = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] < 40) continue;
      const lat = n - (y + 0.5) / W * (n - s), lon = w + (x + 0.5) / W * (e - w), mi = miFrom(lat, lon);
      if (mi < 25) n25++;
      if (mi < best) { best = mi; bl = lat; bo = lon; }
    }
    if (!isFinite(best) || best > R) set('lBig', 'lDetail', 'None nearby', `No lightning within ${R} mi in the last 15 minutes.`, 'good');
    else set('lBig', 'lDetail', best < 3 ? 'Over Tampa' : `${Math.round(best)} mi ${dir8(bearing(bl, bo))}`,
      `Nearest lightning in the last 15 minutes${n25 ? ` · active within 25 mi` : ''}.${best < 10 ? '<br><b>Stay indoors.</b>' : ''}`,
      best < 10 ? 'bad' : best < 30 ? 'warn' : '');
  }

  // ---------------- forecast (next 12 h) ----------------
  let pointsCache = null;
  async function forecast() {
    if (!pointsCache) pointsCache = (await j(`https://api.weather.gov/points/${HOME.lat},${HOME.lon}`, NWS)).properties;
    const h = (await j(pointsCache.forecastHourly, NWS)).properties.periods.filter(p => Date.parse(p.endTime) > Date.now()).slice(0, 24);
    const twelve = h.slice(0, 12);
    $('fStrip').innerHTML = twelve.filter((_, i) => i % 2 === 0).map(p => `<div><div class="muted">${fmt(p.startTime, { hour: 'numeric' })}</div>` +
      `<div class="e">${emoji(p.shortForecast, p.isDaytime)}</div><b>${p.temperature}°</b><div class="muted">${p.probabilityOfPrecipitation?.value ?? 0}%</div></div>`).join('');
    const temps = h.map(p => p.temperature), pops = twelve.map(p => p.probabilityOfPrecipitation?.value ?? 0);
    const iPop = pops.indexOf(Math.max(...pops));
    $('fDetail').innerHTML = `Next 24 h: high ${Math.max(...temps)}° · low ${Math.min(...temps)}°<br>` +
      (pops[iPop] >= 20 ? `Best rain chance ${pops[iPop]}% around ${fmt(twelve[iPop].startTime, { hour: 'numeric' })} — ${esc(twelve[iPop].shortForecast.toLowerCase())}` : 'Little chance of rain in the next 12 hours');
  }

  // ---------------- wind & shear ----------------
  let lastShear = null;
  async function wind() {
    const s = stations.find(x => x.id === 'TPA') || stations[0];
    let shear = null;
    try {
      const c = JSON.parse(localStorage.getItem('windshear.data.v1') || 'null');
      if (c && Date.now() - c.at < 60 * 60 * 1000) shear = c.cells.reduce((a, x) => (!a || miFrom(x.lat, x.lon) < miFrom(a.lat, a.lon) ? x : a), null).shear;
    } catch { /* ignore */ }
    if (shear == null && lastShear && Date.now() - lastShear.at < 30 * 60 * 1000) shear = lastShear.v;
    if (shear == null) {
      const r = await j(`https://api.open-meteo.com/v1/forecast?latitude=${HOME.lat}&longitude=${HOME.lon}&hourly=wind_speed_10m,wind_direction_10m,wind_speed_500hPa,wind_direction_500hPa&forecast_hours=1&wind_speed_unit=kn&timezone=GMT`);
      const hh = r.hourly, uv = (sp, d) => [-sp * Math.sin(d * Math.PI / 180), -sp * Math.cos(d * Math.PI / 180)];
      const a = uv(hh.wind_speed_10m[0], hh.wind_direction_10m[0]), b = uv(hh.wind_speed_500hPa[0], hh.wind_direction_500hPa[0]);
      shear = Math.hypot(b[0] - a[0], b[1] - a[1]);
      lastShear = { at: Date.now(), v: shear };
    }
    const cat = shear < 20 ? 'weak' : shear < 35 ? 'moderate' : shear < 50 ? 'strong' : 'very strong';
    set('wBig', 'wDetail', s?.wspd ? `${dir16(s.wdir)} ${kt2mph(s.wspd)} mph` : 'Calm',
      `${s?.gust ? `Gusts ${kt2mph(s.gust)} mph · ` : ''}0–6 km shear ${Math.round(shear)} kt (${cat})` +
      `${shear >= 35 ? '<br>Enough shear for organized or rotating storms if storms form.' : ''}`, shear >= 50 ? 'bad' : shear >= 35 ? 'warn' : '');
  }

  // ---------------- air quality ----------------
  async function air() {
    const r = await j(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${HOME.lat}&longitude=${HOME.lon}&current=us_aqi,pm2_5,ozone,nitrogen_dioxide`);
    const c = r.current, v = c.us_aqi;
    const [cat, cls] = v <= 50 ? ['Good', 'good'] : v <= 100 ? ['Moderate', 'warn'] : v <= 150 ? ['Unhealthy for sensitive groups', 'warn'] : ['Unhealthy', 'bad'];
    set('aBig', 'aDetail', `${v} · ${cat}`, `US AQI · PM2.5 ${c.pm2_5} µg/m³ · ozone ${Math.round(c.ozone)} µg/m³ · NO₂ ${c.nitrogen_dioxide} µg/m³`, cls);
  }

  // ---------------- background monitor (only reachable on the PC running it) ----------------
  async function phone() {
    try {
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 3000);
      const s = await (await fetch('http://localhost:8766/status', { signal: ctl.signal, cache: 'no-store' })).json();
      const age = (Date.now() - Date.parse(s.lastCheck)) / 60000;
      const ok = s.running && age < 6;
      set('pBig', 'pDetail', ok ? 'Watching' : 'Stalled', `Background monitor ${ok ? 'checked' : 'last checked'} at ${time(s.lastCheck)} · ${s.cells} storm cells in Florida<br>` +
        (s.threats?.length ? `<b>${s.threats.length} storm${s.threats.length > 1 ? 's' : ''} approaching Tampa</b>` : 'No storms heading for Tampa') +
        (s.lastSent ? ` · last alert ${time(s.lastSent.at)}` : ''), ok ? 'good' : 'warn');
    } catch {
      set('pBig', 'pDetail', 'On your PC', 'Phone alerts are sent by the background monitor on your PC. Its status is only visible on that computer.', '');
    }
  }

  // ---------------- refresh loop ----------------
  async function refreshAll() {
    radarLayer();
    await safe('now', now);
    await Promise.all([safe('alerts', alerts), safe('storms', storms), safe('lightning', lightning), safe('forecast', forecast),
      safe('wind', wind), safe('air', air), safe('phone', phone)]);
  }
  refreshAll();
  setInterval(refreshAll, 2 * 60 * 1000);
})();
