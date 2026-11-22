/* Home page extras (works alongside home.js, which it does not change):
 *  - sky-coloured hero that follows the weather and time of day
 *  - sun arc (sunrise, sunset, where the sun is now) and a 24-hour hourly strip with rain chances
 *  - Sun & UV tile, 7-day outlook, and St. Petersburg tides (NOAA Tides & Currents)
 * Data: Open-Meteo (forecast) and NOAA CO-OPS (tides). Refreshes every 10 minutes. */
'use strict';
(() => {
  const HOME = { lat: 27.9506, lon: -82.4572 };
  const TZ = 'America/New_York';
  const $ = id => document.getElementById(id);
  const fmt = (t, o) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o }).format(t instanceof Date ? t : new Date(t));
  const hm = t => fmt(t, { hour: 'numeric', minute: '2-digit' });
  const safe = async (name, fn) => { try { await fn(); } catch (e) { console.warn('home-extra', name, e); } };
  const j = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); };
  const setTile = (big, detail, bigText, detailHtml, cls) => { const b = $(big); b.textContent = bigText; b.className = 'h-big' + (cls ? ' ' + cls : ''); $(detail).innerHTML = detailHtml; };

  // Open-Meteo returns local times without an offset ("2026-11-22T15:00"); with utc_offset_seconds we turn them into real instants.
  let OFF = -5 * 3600;
  const at = s => new Date(Date.parse(s + 'Z') - OFF * 1000);

  const wmo = (c, day = true) => c >= 95 ? '⛈️' : c >= 85 ? '🌨️' : c >= 80 ? '🌧️' : c >= 71 ? '🌨️' : c >= 61 ? '🌧️' : c >= 51 ? '🌦️'
    : c >= 45 ? '🌫️' : c === 3 ? '☁️' : c >= 1 ? (day ? '⛅' : '☁️') : (day ? '☀️' : '🌙');
  const skyFor = (c, day, desc) => {
    const d = (desc || '').toLowerCase();
    if (/thunder|t-storm/.test(d) || c >= 95) return 'sky-storm';
    if (/rain|shower|drizzle/.test(d) || (c >= 51 && c < 95)) return 'sky-rain';
    if (/fog|haze|mist|smoke/.test(d) || c === 45 || c === 48) return 'sky-fog';
    if (/overcast|mostly cloudy/.test(d) || c === 3) return day ? 'sky-cloud' : 'sky-night';
    return day ? 'sky-day' : 'sky-night';
  };
  const uvCat = v => v < 3 ? ['Low', 'good'] : v < 6 ? ['Moderate', ''] : v < 8 ? ['High', 'warn'] : v < 11 ? ['Very high', 'bad'] : ['Extreme', 'bad'];

  let wx = null;
  async function forecast() {
    wx = await j(`https://api.open-meteo.com/v1/forecast?latitude=${HOME.lat}&longitude=${HOME.lon}` +
      '&current=uv_index,is_day,weather_code' +
      '&hourly=temperature_2m,precipitation_probability,weather_code,is_day,uv_index&forecast_hours=25' +
      '&daily=sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=7' +
      '&timezone=America%2FNew_York&temperature_unit=fahrenheit');
    OFF = wx.utc_offset_seconds ?? OFF;
    paintSky(); hourly(); sun(); week();
  }

  function paintSky() {
    if (!wx) return;
    const hero = $('hHero'); if (!hero) return;
    hero.classList.remove('sky-day', 'sky-night', 'sky-cloud', 'sky-rain', 'sky-storm', 'sky-fog');
    hero.classList.add(skyFor(wx.current.weather_code, wx.current.is_day === 1, $('hNowDesc')?.textContent));
  }
  // home.js fills in the observed description; re-tint when it changes.
  const desc = $('hNowDesc');
  if (desc) new MutationObserver(paintSky).observe(desc, { childList: true, characterData: true, subtree: true });

  function hourly() {
    const h = wx.hourly, now = Date.now();
    const rows = h.time.map((t, i) => ({ t: at(t), temp: h.temperature_2m[i], p: h.precipitation_probability[i] ?? 0, c: h.weather_code[i], day: h.is_day[i] === 1 }))
      .filter(r => r.t.getTime() + 3600e3 > now).slice(0, 24);
    $('hHourly').innerHTML = rows.map((r, i) => `<div class="h-hr${i === 0 ? ' now' : ''}">
      <div class="t">${i === 0 ? 'Now' : fmt(r.t, { hour: 'numeric' })}</div><div class="e">${wmo(r.c, r.day)}</div>
      <div class="tp">${Math.round(r.temp)}°</div>
      <div class="bar" title="${r.p}% chance of rain"><i style="height:${Math.max(2, Math.round(r.p / 100 * 26))}px;opacity:${r.p < 10 ? .35 : .95}"></i></div>
      <div class="p">${r.p}%</div></div>`).join('');
  }

  function sun() {
    const d = wx.daily, now = new Date();
    const rise = at(d.sunrise[0]), set = at(d.sunset[0]), riseTom = at(d.sunrise[1]);
    const dayLen = (set - rise) / 60e3, hrs = Math.floor(dayLen / 60), mins = Math.round(dayLen % 60);
    const f = Math.max(0, Math.min(1, (now - rise) / (set - rise))), up = now >= rise && now <= set;
    // arc from (10,70) to (190,70), top at y=10
    const ang = Math.PI * (1 - f), cx = 100 + 90 * Math.cos(ang), cy = 70 - 60 * Math.sin(ang);
    const left = ms => { const m = Math.round(ms / 60e3); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
    const toGo = up ? `Sunset in ${left(set - now)}` : `Sunrise in ${left((now < rise ? rise : riseTom) - now)}`;
    $('hSun').innerHTML = `<svg viewBox="0 0 200 80" aria-hidden="true">
      <path d="M10 70 A90 60 0 0 1 190 70" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2" stroke-dasharray="3 5"/>
      ${up ? `<path d="M10 70 A90 60 0 0 1 ${cx.toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="#f0b429" stroke-width="2.5"/>` : ''}
      <line x1="0" y1="70" x2="200" y2="70" stroke="rgba(255,255,255,.3)"/>
      ${up ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="8" fill="#ffd34d" stroke="#fff3c4" stroke-width="2"/>`
           : '<text x="100" y="52" text-anchor="middle" font-size="22">🌙</text>'}
      </svg>
      <div class="lbl"><span>Sunrise<b>${hm(rise)}</b></span><span>Sunset<b>${hm(set)}</b></span></div><div>${toGo}</div>`;

    const uvNow = wx.current.uv_index ?? 0, uvMax = d.uv_index_max[0] ?? 0;
    const [cNow, clsNow] = uvCat(uvNow), [cMax] = uvCat(uvMax);
    const peakIdx = wx.hourly.uv_index.indexOf(Math.max(...wx.hourly.uv_index.slice(0, 24)));
    setTile('uBig', 'uDetail', up ? `UV ${uvNow.toFixed(0)} · ${cNow}` : 'Sun is down',
      `Today's max UV ${uvMax.toFixed(0)} (${cMax})${up && uvNow >= 3 ? ' · sunscreen advised' : ''}<br>` +
      `Sunrise ${hm(rise)} · sunset ${hm(set)} · ${hrs} h ${mins} m of daylight` +
      (!up && peakIdx >= 0 && wx.hourly.uv_index[peakIdx] >= 3 ? `<br>UV peaks near ${fmt(at(wx.hourly.time[peakIdx]), { hour: 'numeric' })} tomorrow` : ''),
      up ? clsNow : '');
  }

  function week() {
    const d = wx.daily, lo = Math.min(...d.temperature_2m_min), hi = Math.max(...d.temperature_2m_max), span = Math.max(1, hi - lo);
    $('hWeek').innerHTML = d.time.map((t, i) => {
      const a = (d.temperature_2m_min[i] - lo) / span * 100, b = (d.temperature_2m_max[i] - lo) / span * 100, p = d.precipitation_probability_max[i] ?? 0;
      return `<div class="h-day"><span class="d">${i === 0 ? 'Today' : fmt(at(t + 'T12:00'), { weekday: 'short' })}</span>
        <span class="e">${wmo(d.weather_code[i])}</span><span class="p">${p >= 10 ? p + '%' : ''}</span>
        <span class="lo">${Math.round(d.temperature_2m_min[i])}°</span>
        <span class="rng"><i style="left:${a.toFixed(0)}%;right:${(100 - b).toFixed(0)}%"></i></span>
        <span class="hi">${Math.round(d.temperature_2m_max[i])}°</span></div>`;
    }).join('');
  }

  // ---------- tides: St. Petersburg, Tampa Bay (NOAA station 8726520) ----------
  async function tides() {
    const ymd = fmt(Date.now() - 86400e3, { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/(\d+)\/(\d+)\/(\d+)/, '$3$1$2');
    const r = await j('https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&station=8726520&datum=MLLW' +
      `&interval=hilo&units=english&time_zone=lst_ldt&format=json&begin_date=${ymd}&range=72&application=weatherboy`);
    // times are local (Eastern); compare as Eastern wall-clock strings
    const nowLocal = fmt(Date.now(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+)/, '$3-$1-$2 $4:$5');
    const ev = r.predictions || [];
    const next = ev.filter(e => e.t > nowLocal).slice(0, 4);
    if (!next.length) throw new Error('no tide data');
    const label = e => { const [, hh, mm] = e.t.match(/ (\d+):(\d+)/); const h = +hh; return `${(h % 12) || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`; };
    const dayOf = e => e.t.slice(0, 10) === nowLocal.slice(0, 10) ? '' : ' tmrw';
    const rising = next[0].type === 'H';
    setTile('tdBig', 'tdDetail', `${rising ? 'Rising ↑' : 'Falling ↓'}`,
      `Next ${rising ? 'high' : 'low'} ${label(next[0])}${dayOf(next[0])} (${(+next[0].v).toFixed(1)} ft)<br>` +
      next.slice(1).map(e => `${e.type === 'H' ? 'High' : 'Low'} ${label(e)}${dayOf(e)} · ${(+e.v).toFixed(1)} ft`).join('<br>'), '');
  }

  // ---------- greeting under the site name: changes with the time of day in Tampa ----------
  function greet() {
    const el = $('hGreet'); if (!el) return;
    const h = +fmt(Date.now(), { hour: 'numeric', hourCycle: 'h23' });
    const [hello, icon] = h >= 5 && h < 12 ? ['Good morning', '🌅'] : h >= 12 && h < 17 ? ['Good afternoon', '☀️']
      : h >= 17 && h < 21 ? ['Good evening', '🌇'] : ['Good night', '🌙'];
    const t = $('hNowTemp')?.textContent, d = $('hNowDesc')?.textContent;
    const have = t && !/--/.test(t) && d && !/Loading/.test(d);
    el.innerHTML = `<span aria-hidden="true">${icon}</span> <b>${hello}</b>${have ? `<span class="h-greet-now"><span class="sep"> · </span>It's ${t} and ${d.toLowerCase()} in Tampa</span>` : ''}`;
  }
  greet();
  setInterval(greet, 60e3);
  ['hNowTemp', 'hNowDesc'].forEach(id => { const n = $(id); if (n) new MutationObserver(greet).observe(n, { childList: true, characterData: true, subtree: true }); });

  async function all() { await Promise.all([safe('forecast', forecast), safe('tides', tides)]); }
  all();
  setInterval(all, 10 * 60e3);
  setInterval(() => { if (wx) safe('sun', async () => sun()); }, 60e3);
})();
