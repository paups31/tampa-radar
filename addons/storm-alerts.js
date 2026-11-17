/* Add-on: Storm approach alerts pushed to your phone (via ntfy).
 * Purely additive — reads the base app's globals (map, state, HOME, TZ) but never changes them.
 *
 * Data: NEXRAD storm-cell attributes (motion, max dBZ, VIL, echo top, hail, meso/TVS) from the
 * Iowa Environmental Mesonet, plus NWS reflectivity imagery for storm area.
 * Delivery: https://ntfy.sh (free phone app for iOS/Android; subscribe to your topic).
 */
'use strict';
(() => {
  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------
  const KEY = 'stormAlerts.settings.v1';
  const TRACK_KEY = 'stormAlerts.tracks.v1';
  const SENT_KEY = 'stormAlerts.sent.v1';
  const FL_RADARS = ['TBW', 'AMX', 'MLB', 'JAX', 'TLH', 'BYX', 'EVX'];
  const CELLS_URL = 'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson';
  const POLL_MS = 2 * 60 * 1000;

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

  const defaults = {
    enabled: false,
    server: 'https://ntfy.sh',
    topic: 'tampa-radar-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 10),
    home: { lat: HOME.lat, lon: HOME.lon, name: HOME.name },
    radiusMi: 15,        // alert when the storm's edge will come within this distance of home
    leadMin: 60,         // ...within this many minutes
    minLevel: 'moderate',
    showCells: true,
    browserNotify: true,
  };
  const S = Object.assign({}, defaults, load(KEY, {}));
  S.home = Object.assign({}, defaults.home, S.home);
  save(KEY, S);

  let tracks = load(TRACK_KEY, []);      // [{tid, samples:[{t,lat,lon,dbz,vil,top,areaSqMi,...}]}]
  let sent = load(SENT_KEY, {});         // tid -> {at, level, trend}
  let lastCells = [];
  let nextTid = tracks.reduce((m, t) => Math.max(m, t.tid), 0) + 1;

  // -------------------------------------------------------------------------
  // Geo + meteorology helpers
  // -------------------------------------------------------------------------
  const KM_PER_MI = 1.609344;
  const toXY = (lat, lon, lat0, lon0) => ({ x: (lon - lon0) * 111.32 * Math.cos(lat0 * Math.PI / 180), y: (lat - lat0) * 110.57 });
  const distKm = (a, b) => { const p = toXY(b.lat, b.lon, a.lat, a.lon); return Math.hypot(p.x, p.y); };
  const bearing = (from, to) => { const p = toXY(to.lat, to.lon, from.lat, from.lon); return (Math.atan2(p.x, p.y) * 180 / Math.PI + 360) % 360; };
  const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const card = d => POINTS[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
  const fmt = (d) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Marshall–Palmer Z = 200 R^1.6 → rain rate (in/hr). Cap at 53 dBZ so hail doesn't inflate it.
  const rainRateIn = dbz => (Math.pow(Math.pow(10, Math.min(dbz, 53) / 10) / 200, 1 / 1.6)) / 25.4;
  // Stewart (1991) wind gust potential from VIL (kg/m²) and echo top (m) → mph.
  const gustMph = (vil, topKft) => {
    const v = 20.628 * vil - 3.125e-6 * Math.pow(topKft * 304.8, 2);
    return v > 0 ? Math.sqrt(v) * 2.23694 : 0;
  };

  // -------------------------------------------------------------------------
  // Storm area from reflectivity imagery (flood fill of ~30+ dBZ around the cell)
  // -------------------------------------------------------------------------
  function isStormPixel(r, g, b, a) { return a >= 128 && ((b < 30 && (g > 80 || r > 120)) || (r > 180 && g < 80)); }

  async function stormArea(cell) {
    const ws = 'k' + cell.radar.toLowerCase();
    const halfKm = 45, N = 450;                                   // 200 m pixels
    const P = L.Projection.SphericalMercator.project(L.latLng(cell.lat, cell.lon));
    const half = halfKm * 1000 / Math.cos(cell.lat * Math.PI / 180);
    const bbox = [P.x - half, P.y - half, P.x + half, P.y + half];
    const q = new URLSearchParams({ service: 'WMS', version: '1.1.1', request: 'GetMap', layers: `${ws}_sr_bref`, styles: '',
      format: 'image/png', transparent: 'true', srs: 'EPSG:3857', bbox: bbox.join(','), width: N, height: N, _ts: Math.floor(Date.now() / 60000) });
    const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = `https://opengeo.ncep.noaa.gov/geoserver/${ws}/ows?${q}`; });
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, N, N).data;
    const mask = new Uint8Array(N * N);
    for (let p = 0, i = 0; p < N * N; p++, i += 4) mask[p] = isStormPixel(d[i], d[i + 1], d[i + 2], d[i + 3]) ? 1 : 0;
    // Seed: nearest storm pixel within 4 km of the cell centroid.
    const cx = N / 2, cy = N / 2, pxKm = (2 * halfKm) / N;
    let seed = -1, best = Infinity, reach = Math.round(4 / pxKm);
    for (let y = cy - reach; y <= cy + reach; y++) for (let x = cx - reach; x <= cx + reach; x++) {
      if (mask[y * N + x]) { const dd = (x - cx) ** 2 + (y - cy) ** 2; if (dd < best) { best = dd; seed = y * N + x; } }
    }
    if (seed < 0) return { sqMi: 0, clipped: false };
    let count = 0, clipped = false;
    const stack = [seed]; mask[seed] = 2;
    while (stack.length) {
      const p = stack.pop(); count++;
      const x = p % N, y = (p / N) | 0;
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) { clipped = true; continue; }
      for (const n of [p - 1, p + 1, p - N, p + N]) if (mask[n] === 1) { mask[n] = 2; stack.push(n); }
    }
    return { sqMi: count * pxKm * pxKm / (KM_PER_MI * KM_PER_MI), clipped };
  }

  // -------------------------------------------------------------------------
  // Cells → de-duplicated storms → tracks
  // -------------------------------------------------------------------------
  async function fetchCells() {
    const r = await fetch(CELLS_URL + '?_=' + Math.floor(Date.now() / 60000));
    if (!r.ok) throw new Error('cells ' + r.status);
    const j = await r.json();
    const now = Date.now();
    const cells = j.features
      .filter(f => FL_RADARS.includes(f.properties.nexrad) && now - Date.parse(f.properties.valid) < 20 * 60 * 1000)
      .map(f => {
        const p = f.properties;
        return {
          radar: p.nexrad, sid: p.storm_id, t: Date.parse(p.valid),
          lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
          rangeNm: p.range, dbz: p.max_dbz, vil: p.vil, top: p.top,
          fromDeg: p.drct, kt: p.sknt,               // NEXRAD reports the direction the storm moves FROM
          poh: p.poh, posh: p.posh, hailIn: p.max_size,
          // meso is the MDA strength rank (1–25); rank 5+ is a mesocyclone, lower is a weak circulation.
          mesoRank: parseInt(p.meso, 10) || 0, meso: (parseInt(p.meso, 10) || 0) >= 5, tvs: !!p.tvs && p.tvs !== 'NONE',
        };
      });
    // The same storm is often seen by 2–3 radars: keep the closest radar's view (best resolution).
    cells.sort((a, b) => a.rangeNm - b.rangeNm);
    const out = [];
    for (const c of cells) if (!out.some(o => distKm(o, c) < 8)) out.push(c);
    return out;
  }

  function motion(c) {                       // km/min, toward heading
    const toDeg = (c.fromDeg + 180) % 360, kmMin = c.kt * 1.852 / 60;
    return { toDeg, vx: kmMin * Math.sin(toDeg * Math.PI / 180), vy: kmMin * Math.cos(toDeg * Math.PI / 180), mph: c.kt * 1.15078 };
  }

  function updateTracks(cells) {
    const now = Date.now();
    tracks = tracks.filter(t => now - t.samples.at(-1).t < 40 * 60 * 1000);
    const used = new Set();
    for (const c of cells) {
      let best = null, bd = 12;
      for (const t of tracks) {
        if (used.has(t.tid)) continue;
        const last = t.samples.at(-1), dtMin = (c.t - last.t) / 60000;
        if (dtMin < -1) continue;
        const m = motion(last), lat0 = last.lat, lon0 = last.lon;
        const pred = { lat: lat0 + m.vy * dtMin / 110.57, lon: lon0 + m.vx * dtMin / (111.32 * Math.cos(lat0 * Math.PI / 180)) };
        const d = distKm(pred, c);
        if (d < bd) { bd = d; best = t; }
      }
      if (!best) { best = { tid: nextTid++, samples: [] }; tracks.push(best); }
      used.add(best.tid);
      const last = best.samples.at(-1);
      if (last && last.t === c.t) Object.assign(last, c, { areaSqMi: last.areaSqMi });
      else best.samples.push({ ...c });
      best.samples = best.samples.filter(s => now - s.t < 45 * 60 * 1000);
      c.tid = best.tid;
    }
  }

  function trackOf(tid) { return tracks.find(t => t.tid === tid); }

  function trend(track) {
    const s = track.samples, last = s.at(-1);
    const old = s.find(x => last.t - x.t >= 8 * 60000 && last.t - x.t <= 30 * 60000);
    if (!old) return { word: 'Establishing', arrow: '•', detail: 'not enough scans yet to judge (needs ~10 min of tracking)' };
    let score = 0;
    const parts = [];
    const dd = last.dbz - old.dbz, dv = last.vil - old.vil;
    if (Math.abs(dd) >= 3) { score += Math.sign(dd); parts.push(`core ${old.dbz}→${last.dbz} dBZ`); }
    if (Math.abs(dv) >= 3) { score += Math.sign(dv); parts.push(`VIL ${old.vil}→${last.vil}`); }
    if (old.areaSqMi > 0 && last.areaSqMi > 0) {
      const r = last.areaSqMi / old.areaSqMi;
      if (r >= 1.2 || r <= 0.8) { score += r > 1 ? 1 : -1; parts.push(`area ${Math.round(old.areaSqMi)}→${Math.round(last.areaSqMi)} sq mi`); }
    }
    if (Math.abs(last.top - old.top) >= 4) { score += Math.sign(last.top - old.top); parts.push(`tops ${old.top}→${last.top} kft`); }
    const mins = Math.round((last.t - old.t) / 60000);
    if (score > 0) return { word: 'Intensifying', arrow: '▲', detail: `${parts.join(', ')} over ${mins} min` };
    if (score < 0) return { word: 'Weakening', arrow: '▼', detail: `${parts.join(', ')} over ${mins} min` };
    return { word: 'Steady', arrow: '▶', detail: `little change over ${mins} min` };
  }

  // -------------------------------------------------------------------------
  // Threat assessment for home
  // -------------------------------------------------------------------------
  const LEVELS = ['moderate', 'strong', 'severe'];

  function assess(c, area) {
    const m = motion(c);
    const home = S.home;
    const p = toXY(home.lat, home.lon, c.lat, c.lon);           // home relative to storm, km
    const stormRadKm = area > 0 ? Math.sqrt(area * KM_PER_MI * KM_PER_MI / Math.PI) : 3;
    const R = S.radiusMi * KM_PER_MI + stormRadKm;
    const distNow = Math.hypot(p.x, p.y);
    const vv = m.vx * m.vx + m.vy * m.vy;
    let eta = null, cpaKm = distNow, cpaMin = 0;
    if (distNow <= R) eta = 0;
    else if (vv > 1e-4) {
      const dv = p.x * m.vx + p.y * m.vy;
      cpaMin = Math.max(0, dv / vv);
      cpaKm = Math.hypot(p.x - m.vx * cpaMin, p.y - m.vy * cpaMin);
      const b = -2 * dv, cc = distNow * distNow - R * R, disc = b * b - 4 * vv * cc;
      if (disc >= 0) { const t1 = (-b - Math.sqrt(disc)) / (2 * vv); if (t1 >= 0) eta = t1; }
    }
    const coreRate = rainRateIn(c.dbz);
    const crossKm = 2 * stormRadKm;
    const hours = m.mph > 3 ? crossKm / (m.mph * KM_PER_MI) : 1;  // stationary storm: assume ~1 hr
    const rainIn = coreRate * 0.45 * Math.min(hours, 3);          // average rate across the storm ≈ 45% of core
    const gust = gustMph(c.vil, c.top);
    let level = 'moderate';
    if (gust >= 40 || c.dbz >= 55 || c.poh >= 30 || c.meso) level = 'strong';
    if (gust >= 58 || c.hailIn >= 1 || c.posh >= 50 || c.tvs) level = 'severe';
    return {
      m, eta, cpaMi: Math.max(0, cpaKm - stormRadKm) / KM_PER_MI, cpaMin,
      distMi: distNow / KM_PER_MI, fromHomeDeg: bearing(home, c),
      coreRate, rainIn, gust, level, area,
    };
  }

  function buildMessage(c, a, tr, track) {
    const L1 = a.level.toUpperCase();
    const etaTxt = a.eta === 0 ? 'NOW over/near you' : `ETA ~${Math.round(a.eta)} min (${fmt(new Date(Date.now() + a.eta * 60000))})`;
    const title = `${a.level === 'severe' ? '⚠️ SEVERE' : a.level === 'strong' ? '⛈️ Strong' : '🌧️'} storm approaching ${S.home.name} — ${a.eta === 0 ? 'arriving now' : `~${Math.round(a.eta)} min`}`;
    const lines = [
      `Storm ${Math.round(a.distMi)} mi ${card(a.fromHomeDeg)} of ${S.home.name}`,
      `Speed: ${Math.round(a.m.mph)} mph · Heading: ${card(a.m.toDeg)} (${Math.round(a.m.toDeg)}°)`,
      `${etaTxt} · closest pass ${a.cpaMi < 1 ? 'directly overhead' : `${a.cpaMi.toFixed(1)} mi`}`,
      '',
      `Severity: ${L1}`,
      `• Rain: ~${a.rainIn.toFixed(2)} in expected (core rate ${a.coreRate.toFixed(1)} in/hr)`,
      `• Wind: ${a.gust >= 20 ? `gusts to ~${Math.round(a.gust)} mph possible` : 'gusts under 20 mph (no strong wind signal)'}`,
      `• Area: ${a.area == null ? 'not measured' : a.area >= 1 ? `${Math.round(a.area)} sq mi` : 'under 1 sq mi'}`,
    ];
    if (c.poh > 0 || c.hailIn > 0) lines.push(`• Hail: ${c.poh}% chance${c.hailIn > 0 ? `, up to ${c.hailIn.toFixed(2)} in` : ''}`);
    if (c.tvs) lines.push('• TORNADO VORTEX SIGNATURE detected');
    else if (c.meso) lines.push('• Rotation: mesocyclone detected');
    lines.push('', `Trend: ${tr.word.toUpperCase()} ${tr.arrow} — ${tr.detail}`);
    lines.push(`Radar ${c.radar} · scan ${fmt(new Date(c.t))} · track #${track.tid}`);
    return { title, message: lines.join('\n') };
  }

  // -------------------------------------------------------------------------
  // Delivery
  // -------------------------------------------------------------------------
  async function push({ title, message }, level) {
    const priority = level === 'severe' ? 5 : level === 'strong' ? 4 : 3;
    const tags = level === 'severe' ? ['warning', 'cloud_with_lightning_and_rain'] : ['cloud_with_rain'];
    const r = await fetch(S.server.replace(/\/+$/, '') + '/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: S.topic, title, message, priority, tags }),
    });
    if (!r.ok) throw new Error('ntfy ' + r.status);
    if (S.browserNotify && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body: message.split('\n').slice(0, 3).join('\n') }); } catch { /* ignore */ }
    }
  }

  function shouldSend(tid, level, tr) {
    const prev = sent[tid];
    if (!prev) return true;
    if (LEVELS.indexOf(level) > LEVELS.indexOf(prev.level)) return true;          // upgraded
    if (tr.word === 'Intensifying' && prev.trend !== 'Intensifying') return true;  // started intensifying
    return Date.now() - prev.at > 30 * 60 * 1000;                                  // reminder every 30 min
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------
  let busy = false;
  async function cycle() {
    if (busy) return;
    busy = true;
    try {
      const cells = await fetchCells();
      updateTracks(cells);
      // Measure area for storms near home (closest first) so the trend can use it.
      const near = cells.filter(c => c.dbz >= 40 && distKm(S.home, c) < 200).sort((a, b) => distKm(S.home, a) - distKm(S.home, b)).slice(0, 8);
      await Promise.all(near.map(async c => {
        try { const a = await stormArea(c); c.areaSqMi = a.sqMi; const s = trackOf(c.tid)?.samples.at(-1); if (s) s.areaSqMi = a.sqMi; } catch { /* imagery unavailable */ }
      }));
      save(TRACK_KEY, tracks);
      lastCells = cells.map(c => ({ c, a: assess(c, c.areaSqMi ?? null), tr: trend(trackOf(c.tid)) }));
      const threats = lastCells.filter(x => x.c.dbz >= 40 && x.a.eta !== null && x.a.eta <= S.leadMin &&
        LEVELS.indexOf(x.a.level) >= LEVELS.indexOf(S.minLevel)).sort((a, b) => a.a.eta - b.a.eta);
      renderThreats(threats);
      drawCells();
      // When the background monitor is running it sends the alerts, so the page doesn't double up.
      if (S.enabled && !window.bgMonitorActive) {
        for (const x of threats) {
          if (!shouldSend(x.c.tid, x.a.level, x.tr)) continue;
          await push(buildMessage(x.c, x.a, x.tr, trackOf(x.c.tid)), x.a.level);
          sent[x.c.tid] = { at: Date.now(), level: x.a.level, trend: x.tr.word };
          save(SENT_KEY, sent);
          logLine(`Sent: track #${x.c.tid} (${x.a.level}, ETA ${Math.round(x.a.eta)} min)`);
        }
      }
      for (const k of Object.keys(sent)) if (Date.now() - sent[k].at > 3 * 3600 * 1000) delete sent[k];
      setStatus(`Checked ${fmt(new Date())} · ${cells.length} FL cells · ${threats.length} approaching`);
    } catch (e) {
      console.error(e);
      setStatus('Storm check failed — retrying in 2 min');
    } finally { busy = false; }
  }

  // -------------------------------------------------------------------------
  // Map layer: storm cells with motion arrows
  // -------------------------------------------------------------------------
  map.createPane('stormCells').style.zIndex = 600;
  const cellLayer = L.layerGroup().addTo(map);
  let homeMarker = null;

  function drawCells() {
    cellLayer.clearLayers();
    if (homeMarker) homeMarker.remove();
    homeMarker = L.circle([S.home.lat, S.home.lon], { radius: S.radiusMi * KM_PER_MI * 1000, pane: 'stormCells', interactive: false,
      color: '#ffd166', weight: 1.5, dashArray: '3 5', fill: false }).addTo(map);
    if (!S.showCells) return;
    for (const { c, a, tr } of lastCells) {
      if (c.dbz < 35) continue;
      const col = a.level === 'severe' ? '#ff2d55' : a.level === 'strong' ? '#ff9f1c' : '#ffd166';
      const lenKm = a.m.vx || a.m.vy ? Math.min(40, a.m.mph * KM_PER_MI * 0.5) : 0;    // 30-min projection
      const end = { lat: c.lat + (lenKm * Math.cos(a.m.toDeg * Math.PI / 180)) / 110.57,
        lon: c.lon + (lenKm * Math.sin(a.m.toDeg * Math.PI / 180)) / (111.32 * Math.cos(c.lat * Math.PI / 180)) };
      if (lenKm > 0) L.polyline([[c.lat, c.lon], [end.lat, end.lon]], { pane: 'stormCells', color: col, weight: 2, dashArray: '5 4', interactive: false }).addTo(cellLayer);
      L.circleMarker([c.lat, c.lon], { pane: 'stormCells', radius: 6, color: '#111', weight: 1.5, fillColor: col, fillOpacity: 1 })
        .bindPopup(`<h3>Storm #${c.tid} · ${a.level}</h3>
          ${Math.round(a.m.mph)} mph toward ${card(a.m.toDeg)} · ${c.dbz} dBZ · VIL ${c.vil} · tops ${c.top} kft<br>
          Rain ~${a.rainIn.toFixed(2)} in · gusts ${a.gust >= 20 ? '~' + Math.round(a.gust) + ' mph' : '<20 mph'} · ${a.area != null ? Math.round(a.area) + ' sq mi' : 'area n/a'}<br>
          Trend: ${tr.word} ${tr.arrow} <span class="muted">${esc(tr.detail)}</span><br>
          <span class="muted">${a.eta !== null ? `Reaches ${esc(S.home.name)} zone in ~${Math.round(a.eta)} min` : `Not heading toward ${esc(S.home.name)}`} · ${c.radar}</span>`)
        .addTo(cellLayer);
    }
  }

  // -------------------------------------------------------------------------
  // Panel UI (appended as a new section)
  // -------------------------------------------------------------------------
  const sec = document.createElement('section');
  sec.id = 'stormAlerts';
  sec.innerHTML = `
    <h2>Phone storm alerts <span id="saPill" class="pill">${S.enabled ? 'on' : 'off'}</span></h2>
    <div class="checks">
      <label><input type="checkbox" id="saEnabled" ${S.enabled ? 'checked' : ''}> Send alerts to my phone</label>
      <label><input type="checkbox" id="saShow" ${S.showCells ? 'checked' : ''}> Show storm tracks on map</label>
    </div>
    <div class="sa-grid">
      <label>Home <span id="saHome" class="muted">${esc(S.home.name)}</span></label>
      <button type="button" id="saSetHome" class="sa-btn" title="Use the last point you clicked or searched">Use selected point</button>
      <label for="saRadius">Alert radius</label>
      <select id="saRadius">${[5, 10, 15, 25, 40].map(v => `<option value="${v}" ${v === S.radiusMi ? 'selected' : ''}>${v} mi</option>`).join('')}</select>
      <label for="saLead">Warn me up to</label>
      <select id="saLead">${[30, 45, 60, 90, 120].map(v => `<option value="${v}" ${v === S.leadMin ? 'selected' : ''}>${v} min ahead</option>`).join('')}</select>
      <label for="saLevel">Minimum severity</label>
      <select id="saLevel">${[['moderate', 'Any storm'], ['strong', 'Strong+'], ['severe', 'Severe only']].map(([v, t]) => `<option value="${v}" ${v === S.minLevel ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label for="saTopic">ntfy topic</label>
      <input id="saTopic" value="${esc(S.topic)}" spellcheck="false">
    </div>
    <details class="sa-help"><summary>Set up your phone (1 minute)</summary>
      <ol>
        <li>Install the free <b>ntfy</b> app (App Store / Google Play).</li>
        <li>Tap <b>+</b> and subscribe to topic <code id="saTopicShow">${esc(S.topic)}</code> on server <code>ntfy.sh</code>.</li>
        <li>Tap <b>Send test</b> below — it should buzz your phone.</li>
        <li>Keep this radar page open (a browser tab is fine) — it checks for storms every 2 minutes.</li>
      </ol>
      <p class="muted small">Anyone who knows a topic name can read it, so keep the random name.</p>
    </details>
    <div class="sa-actions">
      <button type="button" id="saTest" class="sa-btn">Send test</button>
      <button type="button" id="saPreview" class="sa-btn">Preview nearest storm</button>
      <button type="button" id="saCheck" class="sa-btn">Check now</button>
    </div>
    <div id="saStatus" class="muted small"></div>
    <ul id="saThreats" class="list"></ul>
    <ul id="saLog" class="list muted small"></ul>`;
  document.querySelector('#panel footer').before(sec);

  const $ = s => sec.querySelector(s);
  const setStatus = t => { $('#saStatus').textContent = t; };
  const logLine = t => { const li = document.createElement('li'); li.style.cursor = 'default'; li.textContent = `${fmt(new Date())} ${t}`; $('#saLog').prepend(li); while ($('#saLog').children.length > 6) $('#saLog').lastChild.remove(); };
  const persist = () => { save(KEY, S); $('#saPill').textContent = S.enabled ? 'on' : 'off'; $('#saPill').className = S.enabled ? 'pill sa-on' : 'pill'; };
  persist();

  function renderThreats(threats) {
    const ul = $('#saThreats');
    ul.innerHTML = '';
    if (!threats.length) { ul.innerHTML = `<li class="muted" style="cursor:default">No storms heading for ${esc(S.home.name)} in the next ${S.leadMin} min.</li>`; return; }
    for (const x of threats) {
      const li = document.createElement('li');
      li.style.borderLeftColor = x.a.level === 'severe' ? '#ff2d55' : x.a.level === 'strong' ? '#ff9f1c' : '#ffd166';
      li.innerHTML = `<b>${x.a.eta === 0 ? 'Arriving now' : `~${Math.round(x.a.eta)} min`} · ${x.a.level} · ${x.tr.word} ${x.tr.arrow}</b>
        ${Math.round(x.a.m.mph)} mph ${card(x.a.m.toDeg)} · ~${x.a.rainIn.toFixed(2)} in · gusts ${x.a.gust >= 20 ? Math.round(x.a.gust) + ' mph' : '<20 mph'} · ${x.a.area == null ? 'area n/a' : Math.round(x.a.area) + ' sq mi'}`;
      li.onclick = () => map.setView([x.c.lat, x.c.lon], Math.max(map.getZoom(), 9));
      ul.appendChild(li);
    }
  }

  $('#saEnabled').onchange = async e => {
    S.enabled = e.target.checked; persist();
    if (S.enabled && S.browserNotify && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
    if (S.enabled) cycle();
  };
  $('#saShow').onchange = e => { S.showCells = e.target.checked; persist(); drawCells(); };
  $('#saRadius').onchange = e => { S.radiusMi = +e.target.value; persist(); cycle(); };
  $('#saLead').onchange = e => { S.leadMin = +e.target.value; persist(); cycle(); };
  $('#saLevel').onchange = e => { S.minLevel = e.target.value; persist(); cycle(); };
  $('#saTopic').onchange = e => {
    const v = e.target.value.trim().replace(/[^A-Za-z0-9_-]/g, '');
    if (v.length >= 6) { S.topic = v; persist(); }
    e.target.value = S.topic; $('#saTopicShow').textContent = S.topic;
  };
  $('#saSetHome').onclick = () => {
    const p = state.point;                                // read-only use of the base app's selected point
    S.home = { lat: p.lat, lon: p.lon, name: p.name === HOME.name ? HOME.name : (p.name.length > 28 ? p.name.slice(0, 28) + '…' : p.name) };
    $('#saHome').textContent = S.home.name; persist(); cycle();
  };
  $('#saTest').onclick = async () => {
    try {
      await push({ title: '✅ Tampa Bay Radar test', message: `Phone alerts are working.\nHome: ${S.home.name} · radius ${S.radiusMi} mi · ${S.leadMin} min lead.` }, 'moderate');
      logLine('Test notification sent');
    } catch (e) { logLine('Test failed: ' + e.message); }
  };
  $('#saPreview').onclick = async () => {
    const pool = lastCells.filter(x => x.c.dbz >= 40).sort((a, b) => a.a.distMi - b.a.distMi);
    if (!pool.length) { logLine('No storms (40+ dBZ) on Florida radars right now'); return; }
    const x = pool[0];
    if (x.a.area == null) { try { x.a = assess(x.c, (await stormArea(x.c)).sqMi); } catch { /* ignore */ } }
    const msg = buildMessage(x.c, x.a, x.tr, trackOf(x.c.tid));
    if (x.a.eta === null) msg.title = `[Preview — not heading your way] ${msg.title.replace(/ — .*$/, '')}`;
    msg.message = msg.message.replace(/^ETA.*$/m, x.a.eta === null ? 'Not on a path toward you (preview only)' : '$&');
    L.popup({ maxWidth: 380 }).setLatLng([x.c.lat, x.c.lon])
      .setContent(`<h3>${esc(msg.title)}</h3><div class="small" style="white-space:pre-wrap">${esc(msg.message)}</div>
        <button type="button" class="sa-btn" id="saSendPreview" style="margin-top:8px">Send this to my phone</button>`)
      .openOn(map);
    setTimeout(() => {
      const b = document.getElementById('saSendPreview');
      if (b) b.onclick = async () => { try { await push(msg, x.a.level); logLine('Preview sent to phone'); b.disabled = true; b.textContent = 'Sent'; } catch (e) { logLine('Send failed: ' + e.message); } };
    }, 0);
  };
  $('#saCheck').onclick = () => cycle();

  // Expose read-only helpers for debugging in the console.
  window.stormAlerts = { cycle, get tracks() { return tracks; }, get cells() { return lastCells; }, settings: S };

  cycle();
  setInterval(cycle, POLL_MS);
})();
