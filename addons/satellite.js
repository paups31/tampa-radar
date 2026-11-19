/* Add-on: Satellite views - cloud cover, fog, smog and haze/smoke.
 *   Cloud cover  : GOES-East GeoColor (true color by day, infrared clouds + city lights by night) - NASA GIBS
 *   Clouds (IR)  : GOES-East longwave infrared, fastest updating - NOAA nowCOAST
 *   Fog          : GOES-East GeoColor (fog/low cloud shows as smooth white by day, light blue at night)
 *                  + airport stations reporting fog or poor visibility
 *   Smog         : NASA TEMPO tropospheric NO2 (hourly, daytime only) + air quality index for Florida cities
 *   Haze / smoke : MODIS Terra+Aqua value-added aerosol optical depth, latest complete day
 * One view at a time. Purely additive: own pane (under the radar), own panel section.
 */
'use strict';
(() => {
  const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';
  const NC = 'https://nowcoast.noaa.gov/geoserver/satellite/ows';
  const VIEWS = {
    clouds: { label: 'Cloud cover', layers: [{ url: GIBS, layer: 'GOES-East_ABI_GeoColor', fmt: 'image/png' }],
      note: 'GOES-East GeoColor: true color by day, infrared clouds at night. New image every 10 min, about 30-60 min behind.' },
    cloudsir: { label: 'Clouds (infrared)', layers: [{ url: NC, layer: 'goes_longwave_imagery', fmt: 'image/png', wms13: true }],
      note: 'GOES-East infrared: brighter / colder = higher cloud tops. Works day and night; updates every 5-15 min.' },
    fog: { label: 'Fog & low clouds', layers: [{ url: GIBS, layer: 'GOES-East_ABI_GeoColor', fmt: 'image/png' }], fogObs: true,
      note: 'Fog and low clouds look smooth and flat (white by day, pale blue at night). Dots mark airports reporting fog or low visibility.' },
    smog: { label: 'Smog (NO₂)', layers: [{ url: GIBS, layer: 'TEMPO_L3_NO2_Vertical_Column_Troposphere', fmt: 'image/png' }], aqi: true,
      legend: 'https://gibs.earthdata.nasa.gov/legends/TEMPO_NO2_Vertical_Column_Troposphere_H.png',
      note: 'NASA TEMPO nitrogen dioxide, the main smog ingredient from traffic and industry. Hourly in daylight only; the latest daytime scan is shown at night.' },
    haze: { label: 'Haze & smoke', layers: [{ url: GIBS, layer: 'MODIS_Combined_Value_Added_AOD', fmt: 'image/png' }], aqi: true,
      legend: 'https://gibs.earthdata.nasa.gov/legends/MODIS_Combined_Value_Added_AOD_H.png',
      note: 'Aerosol optical depth from NASA Terra + Aqua (latest complete day, gaps filled): higher = more haze, smoke or dust in the air.' },
  };
  const CITIES = [['Tampa', 27.95, -82.46], ['St. Petersburg', 27.77, -82.64], ['Orlando', 28.54, -81.38], ['Miami', 25.76, -80.19],
    ['Jacksonville', 30.33, -81.66], ['Tallahassee', 30.44, -84.28], ['Fort Myers', 26.64, -81.87]];
  const KEY = 'satellite.v1';
  let prefs = { view: '', opacity: 85 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

  map.createPane('satView').style.zIndex = 320;          // above the base imagery, below radar & fields
  map.getPane('satView').style.pointerEvents = 'none';
  map.createPane('satMarks').style.zIndex = 456;

  const sec = document.createElement('section');
  sec.id = 'satelliteSec';
  sec.innerHTML = `
    <h2>Satellite views <span id="stPill" class="pill">off</span></h2>
    <div class="checks">
      ${Object.entries(VIEWS).map(([k, v]) => `<label><input type="checkbox" data-sv="${k}"> ${v.label}</label>`).join('')}
    </div>
    <label class="slider">Opacity <input id="stOpacity" type="range" min="30" max="100"></label>
    <div id="stNote" class="muted small"></div>
    <img id="stLegend" class="st-legend" alt="Satellite layer legend" hidden>
    <div id="stInfo" class="st-info small"></div>
    <div class="muted small">Satellite: NOAA GOES-East, NASA TEMPO &amp; VIIRS via NASA GIBS and NOAA nowCOAST. Air quality: Open-Meteo (CAMS).</div>`;
  const anchor = document.getElementById('rain3dSec') || document.getElementById('surfaceSec') || document.querySelector('#panel footer');
  anchor.before(sec);
  const $ = q => sec.querySelector(q);
  $('#stOpacity').value = prefs.opacity;

  let layers = [], marks = L.layerGroup().addTo(map), timer = null, aqiCache = null, aqiAt = 0;

  function addLayers(v) {
    for (const l of layers) map.removeLayer(l);
    const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    layers = v.layers.map(d => L.tileLayer.wms(d.url, {
      layers: d.layer, styles: '', format: d.fmt, transparent: true, version: d.wms13 ? '1.3.0' : '1.1.1',
      pane: 'satView', opacity: prefs.opacity / 100, tileSize: 512, cb: bucket,
      attribution: d.url === GIBS ? 'NASA GIBS' : 'NOAA nowCOAST',
    }).addTo(map));
  }

  async function fogMarks() {
    marks.clearLayers();
    let st; try { st = await SurfaceObs.get(); } catch { return []; }
    const foggy = st.filter(s => (s.vis != null && s.vis <= 3) || /FG|BR|HZ|FU/.test(s.wx));
    for (const s of foggy) {
      const sev = s.vis != null && s.vis < 0.5 ? 'dense' : s.vis != null && s.vis < 1 ? 'fog' : 'mist';
      const what = /FU/.test(s.wx) ? 'smoke' : /HZ/.test(s.wx) ? 'haze' : sev === 'mist' ? 'mist / low visibility' : sev === 'dense' ? 'dense fog' : 'fog';
      L.marker([s.lat, s.lon], { pane: 'satMarks', icon: L.divIcon({ className: `st-fog st-${sev}`, html: `<span>${s.vis ?? '?'} mi</span>`, iconSize: null }) })
        .bindTooltip(`<b>${s.id}</b> ${s.name}<br>${what}: visibility ${s.vis ?? '?'} mi${s.wx ? ' (' + s.wx + ')' : ''}`, { direction: 'top' })
        .addTo(marks);
    }
    return foggy;
  }

  async function aqi() {
    if (!aqiCache || Date.now() - aqiAt > 30 * 60 * 1000) {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${CITIES.map(c => c[1]).join(',')}` +
        `&longitude=${CITIES.map(c => c[2]).join(',')}&current=us_aqi,pm2_5,ozone,nitrogen_dioxide`;
      const r = await fetch(url); if (!r.ok) throw new Error(r.status);
      aqiCache = await r.json(); aqiAt = Date.now();
    }
    return aqiCache;
  }
  const aqiCat = v => v <= 50 ? ['Good', '#3fb950'] : v <= 100 ? ['Moderate', '#f0b429'] : v <= 150 ? ['Unhealthy for sensitive groups', '#ff8c1a']
    : v <= 200 ? ['Unhealthy', '#e5534b'] : v <= 300 ? ['Very unhealthy', '#a371f7'] : ['Hazardous', '#8b1a1a'];

  async function info(v) {
    const out = $('#stInfo');
    out.innerHTML = '';
    if (v.fogObs) {
      const f = await fogMarks();
      const near = f.filter(s => Math.hypot((s.lat - HOME.lat) * 69, (s.lon - HOME.lon) * 60) < 40);
      out.innerHTML = f.length
        ? `<b>${f.length}</b> airport${f.length > 1 ? 's' : ''} reporting fog/haze or visibility of 3 mi or less${near.length ? ` — <b>${near.length} near Tampa</b> (${near.map(s => `${s.id} ${s.vis} mi`).join(', ')})` : ' — none near Tampa'}.`
        : 'No airports reporting fog or low visibility right now.';
    } else marks.clearLayers();
    if (v.aqi) {
      try {
        const a = await aqi();
        out.innerHTML += `<div class="st-aqi-title">Air quality index (US AQI)</div><ul class="st-aqi">${a.map((r, i) => {
          const c = r.current, [cat, col] = aqiCat(c.us_aqi);
          return `<li><span>${CITIES[i][0]}</span><span title="PM2.5 ${c.pm2_5} µg/m³ · ozone ${c.ozone} µg/m³ · NO₂ ${c.nitrogen_dioxide} µg/m³"><b style="color:${col}">${c.us_aqi}</b> ${cat}</span></li>`;
        }).join('')}</ul>`;
      } catch { out.innerHTML += '<div class="muted">Air quality index unavailable right now.</div>'; }
    }
  }

  function apply() {
    sec.querySelectorAll('[data-sv]').forEach(cb => { cb.checked = cb.dataset.sv === prefs.view; });
    clearInterval(timer); timer = null;
    const v = VIEWS[prefs.view];
    $('#stNote').textContent = v ? v.note : '';
    $('#stLegend').hidden = !v?.legend;
    if (v?.legend) $('#stLegend').src = v.legend;
    if (!v) {
      for (const l of layers) map.removeLayer(l);
      layers = []; marks.clearLayers(); $('#stInfo').innerHTML = ''; $('#stPill').textContent = 'off';
      return;
    }
    $('#stPill').textContent = v.label.toLowerCase();
    addLayers(v); info(v);
    timer = setInterval(() => { addLayers(v); info(v); }, 10 * 60 * 1000);
  }

  sec.querySelectorAll('[data-sv]').forEach(cb => cb.addEventListener('change', () => {
    prefs.view = cb.checked ? cb.dataset.sv : ''; save(); apply();
  }));
  $('#stOpacity').addEventListener('input', e => { prefs.opacity = +e.target.value; save(); layers.forEach(l => l.setOpacity(prefs.opacity / 100)); });
  apply();
})();
