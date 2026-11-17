/* Add-on: Rapid multi-radar mosaic (60-second updates).
 * Each radar scans on its own schedule (TDWR ~1 min, NEXRAD 2–7 min). Every 60 s this checks the
 * latest scan time of every Florida radar in view and composites their lowest-tilt reflectivity so
 * that, everywhere, you see the NEWEST scan available from any radar covering that spot.
 * Purely additive: while on, it hides the base radar pane and restores it when turned off.
 */
'use strict';
(() => {
  const OG = 'https://opengeo.ncep.noaa.gov/geoserver';
  const PERIOD_MS = 60 * 1000;
  const STALE_MS = 15 * 60 * 1000;
  // [workspace, layer, lat, lon, coverage km, label]
  const SITES = [
    ['ttpa', 'ttpa_bref1', 27.8597, -82.5181, 90, 'TTPA Tampa TDWR'],
    ['ktbw', 'ktbw_sr_bref', 27.7055, -82.4017, 230, 'KTBW Tampa Bay'],
    ['tmco', 'tmco_bref1', 28.3439, -81.3259, 90, 'TMCO Orlando TDWR'],
    ['kmlb', 'kmlb_sr_bref', 28.1133, -80.6542, 230, 'KMLB Melbourne'],
    ['tfll', 'tfll_bref1', 26.1430, -80.3440, 90, 'TFLL Ft. Lauderdale TDWR'],
    ['tmia', 'tmia_bref1', 25.7576, -80.4910, 90, 'TMIA Miami TDWR'],
    ['kamx', 'kamx_sr_bref', 25.6111, -80.4128, 230, 'KAMX Miami'],
    ['kjax', 'kjax_sr_bref', 30.4847, -81.7019, 230, 'KJAX Jacksonville'],
    ['ktlh', 'ktlh_sr_bref', 30.3975, -84.3289, 230, 'KTLH Tallahassee'],
  ].map(([ws, layer, lat, lon, km, label]) => ({ ws, layer, lat, lon, km, label, latest: null, img: null, imgKey: '' }));

  const KEY = 'rapidMosaic.on.v1';
  let on = false, timer = null, countdown = null, nextAt = 0, overlay = null, busy = false, pending = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch { /* ignore */ }

  map.createPane('rapid').style.zIndex = 352;           // just above the base radar pane
  map.getPane('rapid').style.pointerEvents = 'none';

  // ---------------- panel ----------------
  const sec = document.createElement('section');
  sec.id = 'rapidMosaic';
  sec.innerHTML = `
    <h2>Rapid update <span id="rmPill" class="pill">off</span></h2>
    <div class="checks"><label><input type="checkbox" id="rmOn"> Multi-radar mosaic · refresh every 60 s</label></div>
    <div id="rmInfo" class="muted small">Combines every Florida radar in view (including the 1-minute airport TDWRs) and always shows the newest scan at each spot. Reflectivity only.</div>
    <ul id="rmSites" class="rm-sites"></ul>`;
  const anchor = document.getElementById('stormAlerts') || document.querySelector('#panel footer');
  anchor.before(sec);
  const $ = s => sec.querySelector(s);
  $('#rmOn').checked = on;

  const tfmt = t => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(t));
  const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 90 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };

  // ---------------- data ----------------
  async function latestTime(site) {
    const url = `${OG}/${site.ws}/ows?service=WMS&version=1.3.0&request=GetCapabilities&_=${Date.now()}`;
    const xml = new DOMParser().parseFromString(await (await fetch(url, { cache: 'no-store' })).text(), 'text/xml');
    for (const el of xml.getElementsByTagName('Layer')) {
      if (el.getElementsByTagName('Name')[0]?.textContent !== site.layer) continue;
      const dim = [...el.getElementsByTagName('Dimension')].find(d => d.getAttribute('name') === 'time');
      const list = dim?.textContent.trim().split(',').map(s => s.trim()).filter(Boolean) || [];
      return list.length ? list[list.length - 1] : null;
    }
    return null;
  }

  function inView(site, b) {
    const pad = site.km / 111;
    return site.lat + pad > b.getSouth() && site.lat - pad < b.getNorth() && site.lon + pad / Math.cos(site.lat * Math.PI / 180) > b.getWest() && site.lon - pad / Math.cos(site.lat * Math.PI / 180) < b.getEast();
  }

  function loadImg(url) {
    return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
  }

  async function refresh() {
    if (!on) return;
    if (busy) { pending = true; return; }
    busy = true;
    try {
      const bounds = map.getBounds();
      const size = map.getSize();
      const scale = Math.min(1, 1600 / Math.max(size.x, size.y));
      const W = Math.round(size.x * scale), H = Math.round(size.y * scale);
      const sw = L.Projection.SphericalMercator.project(bounds.getSouthWest());
      const ne = L.Projection.SphericalMercator.project(bounds.getNorthEast());
      const bbox = [sw.x, sw.y, ne.x, ne.y];
      const viewKey = `${bbox.map(v => Math.round(v)).join(',')}|${W}x${H}`;
      const sites = SITES.filter(s => inView(s, bounds));

      await Promise.all(sites.map(async s => { try { s.latest = await latestTime(s); } catch { /* keep previous */ } }));
      const live = sites.filter(s => s.latest && Date.now() - Date.parse(s.latest) < STALE_MS);

      await Promise.all(live.map(async s => {
        const key = `${s.latest}|${viewKey}`;
        if (s.imgKey === key && s.img) return;
        const q = new URLSearchParams({ service: 'WMS', version: '1.1.1', request: 'GetMap', layers: s.layer, styles: '', format: 'image/png',
          transparent: 'true', srs: 'EPSG:3857', bbox: bbox.join(','), width: W, height: H, time: s.latest });
        try { s.img = await loadImg(`${OG}/${s.ws}/ows?${q}`); s.imgKey = key; } catch { s.img = null; }
      }));

      // Composite oldest → newest; each radar replaces everything inside its coverage circle.
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const toPx = (lat, lon) => {
        const p = L.Projection.SphericalMercator.project(L.latLng(lat, lon));
        return { x: (p.x - bbox[0]) / (bbox[2] - bbox[0]) * W, y: (bbox[3] - p.y) / (bbox[3] - bbox[1]) * H };
      };
      const ordered = live.filter(s => s.img).sort((a, b) => Date.parse(a.latest) - Date.parse(b.latest));
      for (const s of ordered) {
        const ctr = toPx(s.lat, s.lon);
        const edge = toPx(s.lat + s.km / 110.57, s.lon);
        const r = Math.abs(ctr.y - edge.y);
        g.save();
        g.beginPath(); g.arc(ctr.x, ctr.y, r, 0, Math.PI * 2); g.clip();
        g.clearRect(0, 0, W, H);
        g.drawImage(s.img, 0, 0, W, H);
        g.restore();
      }
      if (!on) return;
      const url = c.toDataURL();
      if (overlay) overlay.setUrl(url).setBounds(bounds);
      else overlay = L.imageOverlay(url, bounds, { pane: 'rapid', opacity: state.opacity, interactive: false }).addTo(map);
      overlay.setOpacity(state.opacity);
      renderSites(sites);
    } catch (e) {
      console.error(e);
      $('#rmInfo').textContent = 'Rapid mosaic update failed — retrying in 60 s.';
    } finally {
      busy = false;
      if (pending) { pending = false; refresh(); }
    }
  }

  function renderSites(sites) {
    const sorted = [...sites].filter(s => s.latest).sort((a, b) => Date.parse(b.latest) - Date.parse(a.latest));
    const newest = sorted[0];
    $('#rmInfo').innerHTML = newest
      ? `Newest scan <b>${tfmt(newest.latest)}</b> from ${newest.label} (${ago(Date.parse(newest.latest))}) · next refresh <span id="rmNext">60</span>s`
      : 'No recent scans from radars in view.';
    $('#rmSites').innerHTML = sorted.map(s => {
      const stale = Date.now() - Date.parse(s.latest) >= STALE_MS;
      return `<li class="${stale ? 'stale' : ''}"><span>${s.label}</span><span>${stale ? 'offline' : ago(Date.parse(s.latest))}</span></li>`;
    }).join('');
  }

  // ---------------- on / off ----------------
  function setOn(v) {
    on = v;
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ }
    $('#rmPill').textContent = v ? '60 s' : 'off';
    $('#rmPill').className = v ? 'pill sa-on' : 'pill';
    map.getPane('radar').style.visibility = v ? 'hidden' : '';   // base radar layer comes back when off
    clearInterval(timer); clearInterval(countdown);
    if (v) {
      refresh();
      nextAt = Date.now() + PERIOD_MS;
      timer = setInterval(() => { nextAt = Date.now() + PERIOD_MS; refresh(); }, PERIOD_MS);
      countdown = setInterval(() => { const el = document.getElementById('rmNext'); if (el) el.textContent = Math.max(0, Math.round((nextAt - Date.now()) / 1000)); }, 1000);
    } else {
      if (overlay) { overlay.remove(); overlay = null; }
      $('#rmSites').innerHTML = '';
      $('#rmInfo').textContent = 'Combines every Florida radar in view (including the 1-minute airport TDWRs) and always shows the newest scan at each spot. Reflectivity only.';
    }
  }

  $('#rmOn').onchange = e => setOn(e.target.checked);
  let moveT = null;
  map.on('moveend', () => { if (!on) return; clearTimeout(moveT); moveT = setTimeout(refresh, 400); });
  document.getElementById('opacity')?.addEventListener('input', () => overlay?.setOpacity(state.opacity));

  window.rapidMosaic = { refresh, get sites() { return SITES; }, get on() { return on; } };
  if (on) setOn(true);
})();
