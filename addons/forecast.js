/* 24-hour forecast window. NWS hourly forecast + gridded data (gusts, cloud cover, rain amounts) for one
 * point (Tampa by default, or ?lat=&lon=&name=), plus sea-level pressure from Open-Meteo.
 * Completely separate from the live radar page: its own window, its own data, refreshed every 30 min.
 */
'use strict';
(() => {
  const TZ = 'America/New_York';
  const q = new URLSearchParams(location.search);
  const LAT = +(q.get('lat') || 27.9506), LON = +(q.get('lon') || -82.4572);
  const NAME = q.get('name') || 'Tampa, FL';
  const UA = { headers: { Accept: 'application/geo+json' } };
  const $ = s => document.querySelector(s);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const C = { s1: css('--s1'), s2: css('--s2'), seq: css('--seq'), grid: css('--grid'), muted: css('--muted'), text: css('--text'), card: css('--card') };
  const fmt = (t, o) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o }).format(new Date(t));
  const hr = t => fmt(t, { hour: 'numeric' });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  document.title = `24-Hour Forecast · ${NAME} · WeatherBoy Radar`;
  $('#fcPlace').textContent = '· ' + NAME;

  async function j(url, opt) {
    const r = await fetch(url, opt);
    if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]}`);
    return r.json();
  }

  // ISO-8601 "start/PT6H" interval -> [startMs, endMs]
  function span(validTime) {
    const [s, d] = validTime.split('/'); const t0 = Date.parse(s);
    const m = /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(d) || [];
    return [t0, t0 + ((+m[1] || 0) * 24 + (+m[2] || 0)) * 3600e3 + (+m[3] || 0) * 60e3];
  }
  const valueAt = (prop, t) => { for (const v of prop?.values || []) { const [a, b] = span(v.validTime); if (t >= a && t < b) return v.value; } return null; };
  const mph = s => { const n = String(s || '').match(/\d+/g); return n ? Math.max(...n.map(Number)) : null; };
  const DIRS = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
  function emoji(text, isDay) {
    const t = text.toLowerCase();
    if (/thunder|t-storm/.test(t)) return '⛈️';
    if (/snow|flurr|sleet|ice/.test(t)) return '🌨️';
    if (/heavy rain|rain showers|showers/.test(t)) return '🌧️';
    if (/rain|drizzle/.test(t)) return '🌦️';
    if (/fog|haze|smoke|mist/.test(t)) return '🌫️';
    if (/mostly cloudy|cloudy|overcast/.test(t)) return '☁️';
    if (/partly|mostly sunny|mostly clear/.test(t)) return isDay ? '⛅' : '☁️';
    return isDay ? '☀️' : '🌙';
  }

  // ---------------- charts (one y-axis each, thin marks, hover crosshair) ----------------
  const tip = $('#fcTip');
  function showTip(ev, html) {
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY - h - 10;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y < 8) y = ev.clientY + 16;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  function niceRange(lo, hi, minSpan) {
    if (hi - lo < minSpan) { const m = (hi + lo) / 2; lo = m - minSpan / 2; hi = m + minSpan / 2; }
    const step = [1, 2, 5, 10, 20, 25, 50, 100].find(s => (hi - lo) / s <= 5) || 100;
    return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
  }

  /* series: [{ name, color, values[], fmt, dash, label }] ; kind: 'line' | 'bar' */
  function chart(el, hours, series, o = {}) {
    const W = Math.max(300, Math.round(el.clientWidth || 560)), H = o.h || 200, ml = 36, mr = o.mr ?? 50, mt = 12, mb = 24;
    const all = series.flatMap(s => s.values).filter(Number.isFinite);
    const r = o.fixed ? { lo: o.fixed[0], hi: o.fixed[1], step: o.fixed[2] } : niceRange(Math.min(...all), Math.max(...all), o.minSpan || 10);
    const n = hours.length, pw = W - ml - mr, ph = H - mt - mb;
    const x = i => ml + (o.kind === 'bar' ? (i + 0.5) * pw / n : i * pw / (n - 1));
    const y = v => mt + ph - (v - r.lo) / (r.hi - r.lo) * ph;
    let g = '';
    for (let v = r.lo; v <= r.hi + 1e-9; v += r.step) {
      g += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}" stroke-width="1"/>` +
        `<text x="${ml - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="${C.muted}">${v}</text>`;
    }
    const every = W < 420 ? 4 : 3;
    for (let i = 0; i < n; i += every) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${C.muted}">${hr(hours[i])}</text>`;
    let marks = '';
    if (o.kind === 'bar') {
      const s = series[0], bw = Math.max(2, pw / n - 2);
      s.values.forEach((v, i) => {
        if (!Number.isFinite(v) || v <= 0) return;
        const top = y(v), h = y(r.lo) - top, rr = Math.min(4, h / 2, bw / 2);
        marks += `<path d="M${x(i) - bw / 2},${y(r.lo)} V${top + rr} Q${x(i) - bw / 2},${top} ${x(i) - bw / 2 + rr},${top} H${x(i) + bw / 2 - rr} Q${x(i) + bw / 2},${top} ${x(i) + bw / 2},${top + rr} V${y(r.lo)} Z" fill="${s.color}"/>`;
      });
    } else {
      for (const s of series) {
        let d = '', pen = false;
        s.values.forEach((v, i) => { if (Number.isFinite(v)) { d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; } else pen = false; });
        marks += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="5 4"' : ''}/>`;
        // direct label at the line end + selective max/min labels
        const lastI = s.values.map(Number.isFinite).lastIndexOf(true);
        if (lastI >= 0 && series.length > 1) marks += `<text x="${x(lastI) + 6}" y="${y(s.values[lastI]) + 4}" font-size="11" fill="${C.text}">${esc(s.label || s.name)}</text>`;
        if (o.extremes) {
          const vals = s.values.map((v, i) => [v, i]).filter(p => Number.isFinite(p[0]));
          const mx = vals.reduce((a, b) => (b[0] > a[0] ? b : a)), mn = vals.reduce((a, b) => (b[0] < a[0] ? b : a));
          for (const [v, i, above] of [[...mx, true], [...mn, false]]) {
            marks += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.color}" stroke="${C.card}" stroke-width="2"/>` +
              `<text x="${x(i)}" y="${y(v) + (above ? -9 : 16)}" text-anchor="middle" font-size="11" font-weight="600" fill="${C.text}">${s.fmt(v)}</text>`;
          }
        }
      }
    }
    if (o.arrows) {                      // wind direction arrows along the bottom, pointing downwind
      o.arrows.forEach((deg, i) => {
        if (i % 2 || deg == null) return;
        marks += `<g transform="translate(${x(i)},${mt + 8}) rotate(${deg + 180})"><path d="M0,-6 L0,6 M-3.5,2.5 L0,6 L3.5,2.5" stroke="${C.muted}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      });
    }
    const legend = series.length > 1
      ? `<div class="fc-legend">${series.map(s => `<span style="color:${s.color}"><i class="${s.dash ? 'dash' : ''}" style="background:${s.color}"></i><span style="color:${C.text}">${esc(s.name)}</span></span>`).join('')}</div>` : '';
    el.innerHTML = `${legend}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.name).join(' and '))} over the next 24 hours">${g}${marks}
      <line class="xh" x1="0" x2="0" y1="${mt}" y2="${mt + ph}" stroke="${C.muted}" stroke-width="1" visibility="hidden"/>
      <g class="dots"></g><rect x="${ml}" y="0" width="${pw}" height="${H}" fill="transparent"/></svg>`;
    const svg = el.querySelector('svg'), xh = svg.querySelector('.xh'), dots = svg.querySelector('.dots');
    svg.querySelector('rect').addEventListener('mousemove', ev => {
      const b = svg.getBoundingClientRect(), px = (ev.clientX - b.left) / b.width * W;
      const i = Math.max(0, Math.min(n - 1, o.kind === 'bar' ? Math.floor((px - ml) / (pw / n)) : Math.round((px - ml) / (pw / (n - 1)))));
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
      dots.innerHTML = o.kind === 'bar' ? '' : series.filter(s => Number.isFinite(s.values[i]))
        .map(s => `<circle cx="${x(i)}" cy="${y(s.values[i])}" r="4" fill="${s.color}" stroke="${C.card}" stroke-width="2"/>`).join('');
      showTip(ev, `<div class="h">${fmt(hours[i], { weekday: 'short', hour: 'numeric' })}</div>` +
        series.map(s => `<div class="r"><span><i style="background:${s.color}"></i>${esc(s.name)}</span><b>${Number.isFinite(s.values[i]) ? s.fmt(s.values[i]) : '–'}</b></div>`).join('') +
        (o.extra ? o.extra(i) : ''));
    });
    svg.querySelector('rect').addEventListener('mouseleave', () => { xh.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; hideTip(); });
  }

  // ---------------- load & render ----------------
  let last = null;
  async function load() {
    const pt = await j(`https://api.weather.gov/points/${LAT.toFixed(4)},${LON.toFixed(4)}`, UA);
    const p = pt.properties;
    const [hourly, grid, text] = await Promise.all([j(p.forecastHourly, UA), j(p.forecastGridData, UA), j(p.forecast, UA)]);
    let pres = null;
    try {
      const om = await j(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=pressure_msl&forecast_hours=26&timezone=GMT`);
      pres = om.hourly;
    } catch { /* optional */ }
    return { p, hourly: hourly.properties, grid: grid.properties, text: text.properties, pres };
  }

  function render(d) {
    const now = Date.now();
    const per = d.hourly.periods.filter(x => Date.parse(x.endTime) > now).slice(0, 24);
    const hours = per.map(x => Date.parse(x.startTime));
    const temp = per.map(x => x.temperature);
    const dew = per.map(x => x.dewpoint?.value == null ? null : Math.round(x.dewpoint.value * 9 / 5 + 32));
    const rh = per.map(x => x.relativeHumidity?.value ?? null);
    const pop = per.map(x => x.probabilityOfPrecipitation?.value ?? 0);
    const wind = per.map(x => mph(x.windSpeed));
    const wdir = per.map(x => DIRS[x.windDirection] ?? null);
    const gust = hours.map(t => { const v = valueAt(d.grid.windGust, t); return v == null ? null : Math.round(v * 0.621371); });
    const sky = hours.map(t => valueAt(d.grid.skyCover, t));
    const pres = hours.map(t => {
      if (!d.pres) return null;
      const k = d.pres.time.indexOf(new Date(t).toISOString().slice(0, 13) + ':00');
      return k < 0 ? null : d.pres.pressure_msl[k];
    });
    // rain amount over the 24 h window (NWS QPF, mm per interval, prorated)
    const end = hours[hours.length - 1] + 3600e3;
    let qpf = 0;
    for (const v of d.grid.quantitativePrecipitation?.values || []) {
      const [a, b] = span(v.validTime); const o = Math.max(0, Math.min(b, end) - Math.max(a, hours[0]));
      if (o > 0 && v.value) qpf += v.value * o / (b - a);
    }
    qpf /= 25.4;

    $('#fcIssued').textContent = `NWS ${d.p.gridId} · updated ${fmt(Date.parse(d.hourly.updateTime || d.hourly.generatedAt), { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;

    // tiles
    const iMax = temp.indexOf(Math.max(...temp)), iMin = temp.indexOf(Math.min(...temp)), iPop = pop.indexOf(Math.max(...pop));
    const gMax = Math.max(...gust.filter(Number.isFinite), ...wind.filter(Number.isFinite));
    const iG = gust.indexOf(gMax) >= 0 ? gust.indexOf(gMax) : wind.indexOf(gMax);
    $('#fcTiles').innerHTML = [
      ['High', `${temp[iMax]}°`, `around ${fmt(hours[iMax], { weekday: 'short', hour: 'numeric' })}`],
      ['Low', `${temp[iMin]}°`, `around ${fmt(hours[iMin], { weekday: 'short', hour: 'numeric' })}`],
      ['Highest rain chance', `${pop[iPop]}%`, pop[iPop] ? `${fmt(hours[iPop], { weekday: 'short', hour: 'numeric' })} · ${per[iPop].shortForecast}` : 'dry'],
      ['Expected rain', `${qpf < 0.01 ? '0' : qpf.toFixed(2)}"`, 'total over the next 24 hours'],
      ['Strongest wind', `${Number.isFinite(gMax) ? gMax : '–'} mph`, iG >= 0 ? `${gust[iG] === gMax ? 'gust' : 'sustained'} · ${fmt(hours[iG], { weekday: 'short', hour: 'numeric' })}` : ''],
    ].map(([k, v, s]) => `<div class="fc-tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${esc(s)}</div></div>`).join('');

    // strip
    $('#fcStrip').innerHTML = per.map((x, i) => `<div class="fc-hr${i === 0 ? ' now' : ''}" title="${esc(x.shortForecast)}">
      <div class="t">${i === 0 ? 'Now' : hr(hours[i])}</div><div class="e">${emoji(x.shortForecast, x.isDaytime)}</div>
      <div class="tp">${x.temperature}°</div><div class="p">💧${pop[i]}%</div></div>`).join('');

    chart($('#chTemp'), hours, [
      { name: 'Temperature', label: 'Temp', color: C.s2, values: temp, fmt: v => `${Math.round(v)}°F` },
      { name: 'Dew point', label: 'Dew pt', color: C.s1, values: dew, fmt: v => `${Math.round(v)}°F` },
    ], { extremes: false, minSpan: 15, extra: i => `<div class="muted" style="margin-top:3px">${esc(per[i].shortForecast)}</div>` });
    chart($('#chRain'), hours, [{ name: 'Chance of rain', color: C.seq, values: pop, fmt: v => `${Math.round(v)}%` }],
      { kind: 'bar', fixed: [0, 100, 25], mr: 12, extra: i => `<div class="muted" style="margin-top:3px">${esc(per[i].shortForecast)}</div>` });
    $('#fcQpf').textContent = qpf >= 0.01 ? `Expected rain over 24 hours: about ${qpf.toFixed(2)} in.` : 'No measurable rain expected in the next 24 hours.';
    chart($('#chWind'), hours, [
      { name: 'Gusts', color: C.s2, values: gust, fmt: v => `${Math.round(v)} mph`, dash: true },
      { name: 'Wind', color: C.s1, values: wind, fmt: v => `${Math.round(v)} mph` },
    ], { minSpan: 15, arrows: wdir, extra: i => `<div class="muted" style="margin-top:3px">from the ${per[i].windDirection}</div>` });
    chart($('#chRh'), hours, [{ name: 'Humidity', color: C.seq, values: rh, fmt: v => `${Math.round(v)}%` }], { fixed: [0, 100, 25], mr: 12, extremes: true });
    chart($('#chSky'), hours, [{ name: 'Cloud cover', color: C.seq, values: sky, fmt: v => `${Math.round(v)}%` }], { kind: 'bar', fixed: [0, 100, 25], mr: 12 });
    if (pres.some(Number.isFinite)) {
      chart($('#chPres'), hours, [{ name: 'Sea-level pressure', color: C.seq, values: pres, fmt: v => `${v.toFixed(1)} mb` }], { minSpan: 6, mr: 12, extremes: true });
      const f = pres.filter(Number.isFinite), ch = f[f.length - 1] - f[0];
      $('#chPres').insertAdjacentHTML('beforeend', `<div class="fc-note">${Math.abs(ch) < 1 ? 'Steady' : ch > 0 ? 'Rising' : 'Falling'} pressure (${ch > 0 ? '+' : ''}${ch.toFixed(1)} mb over 24 h)${ch <= -3 ? ' — falling pressure often means unsettled weather.' : ch >= 3 ? ' — rising pressure usually means improving weather.' : '.'}</div>`);
    } else $('#chPres').innerHTML = '<div class="fc-note">Pressure forecast unavailable right now.</div>';

    $('#fcText').innerHTML = d.text.periods.slice(0, 3).map(x => `<div><b>${emoji(x.shortForecast, x.isDaytime)} ${esc(x.name)}</b><p>${esc(x.detailedForecast)}</p></div>`).join('');

    $('#fcTable').innerHTML = `<table><thead><tr><th>Time</th><th>Temp °F</th><th>Dew pt °F</th><th>Humidity %</th><th>Rain %</th><th>Wind mph</th><th>Gust mph</th><th>Clouds %</th><th>Pressure mb</th><th>Forecast</th></tr></thead><tbody>` +
      per.map((x, i) => `<tr><td>${fmt(hours[i], { weekday: 'short', hour: 'numeric' })}</td><td>${temp[i]}</td><td>${dew[i] ?? ''}</td><td>${rh[i] ?? ''}</td><td>${pop[i]}</td>` +
        `<td>${x.windDirection} ${wind[i] ?? ''}</td><td>${gust[i] ?? ''}</td><td>${sky[i] ?? ''}</td><td>${pres[i] != null ? pres[i].toFixed(1) : ''}</td><td>${esc(x.shortForecast)}</td></tr>`).join('') + '</tbody></table>';
  }

  async function refresh() {
    $('#fcRefresh').disabled = true;
    document.querySelector('.fc-error')?.remove();
    try { last = await load(); render(last); }
    catch (e) {
      $('#fcTiles').insertAdjacentHTML('beforebegin', `<div class="fc-error">Could not load the forecast (${esc(e.message)}). It will retry automatically.</div>`);
    } finally { $('#fcRefresh').disabled = false; }
  }
  $('#fcRefresh').addEventListener('click', refresh);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => last && render(last), 200); });
  refresh();
  setInterval(refresh, 30 * 60 * 1000);
})();
