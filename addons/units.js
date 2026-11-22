/* Add-on: Imperial / Metric switch for the whole site.
 * The weather sources and the base app write US units. In Metric mode this add-on rewrites every unit it sees
 * on the page as it appears (temperatures, wind, rain, distance, heights, pressure) and puts the original back
 * when you switch to Imperial. The choice is remembered on this device and shared by every page.
 *   window.WBUnits.metric      -> true / false
 *   window.WBUnits.set('metric' | 'imperial')
 *   window.WBUnits.raw(el)     -> the element's original (imperial) text
 *   'wb-units' event on window -> fired after a switch (pages with charts redraw)
 * Uses only the DOM; does not change the base app. */
'use strict';
(() => {
  const KEY = 'wb.units';
  let metric = false;
  try { metric = localStorage.getItem(KEY) === 'metric'; } catch { /* ignore */ }

  // ---------- conversions ----------
  const N = '(-?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?)';
  const num = s => parseFloat(s.replace(/,/g, ''));
  const places = s => (s.split('.')[1] || '').length;
  const out = (v, d) => {
    let s = d ? v.toFixed(d) : String(Math.round(v));
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return Math.abs(v) >= 10000 ? Number(s).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : s;
  };
  const conv = {
    temp: s => out((num(s) - 32) * 5 / 9, Math.min(places(s), 1)),
    speed: s => out(num(s) * 1.609344, 0),
    knots: s => out(num(s) * 1.852, 0),
    rain: s => { const v = num(s) * 25.4; return out(v, v < 10 && v !== 0 ? 1 : 0); },
    dist: s => { const v = num(s) * 1.609344; return out(v, places(s) || v < 1 ? 1 : 0); },
    height: s => { const v = num(s) * 0.3048; return out(v, Math.abs(v) < 10 ? 1 : 0); },
    same: s => s,
  };
  // "A unit", or a range "A to B unit" / "A–B unit".
  const unitRule = (unitRe, fn, unit) => [
    new RegExp(`${N}(\\s?(?:to|–|-)\\s?)${N}(\\s?)${unitRe}`, 'g'),
    (m, a, sep, b, sp) => `${fn(a)}${sep}${fn(b)}${sp}${unit}`,
    new RegExp(`${N}(\\s?)${unitRe}`, 'g'),
    (m, a, sp) => `${fn(a)}${sp}${unit}`,
  ];
  const DIRECTIONAL = /(from|wind|toward|towards|heading|bearing|direction|dir|moving|azimuth|tilt|elevation|elev|angle)\s*$/i;
  const RULES = [
    unitRule('°F', conv.temp, '°C'),
    unitRule('mph\\b', conv.speed, 'km/h'),
    unitRule('(?:kts?|knots)\\b', conv.knots, 'km/h'),
    unitRule('in\\/hr\\b', conv.rain, 'mm/h'),
    unitRule('(?:in|inch|inches)\\b(?!\\s+(?:a|an|the)\\b)', conv.rain, 'mm'),
    unitRule('"', conv.rain, ' mm'),
    unitRule('(?:mi|miles?)\\b', conv.dist, 'km'),
    unitRule('(?:ft|feet)\\b', conv.height, 'm'),
    unitRule('mb\\b', conv.same, 'hPa'),
  ];
  function convert(s) {
    if (!/\d|°F|mph|\bmb\b|in\/hr|\bkt\b/.test(s)) return s;
    // "WNW 14 mph, gusts 21": the gust number has no unit of its own
    if (/mph/.test(s)) s = s.replace(new RegExp(`(gusts?(?: up)?(?: to)?\\s+)${N}(?!\\s*(?:mph|kts?|km|%|\\d))`, 'gi'), (m, pre, a) => pre + conv.speed(a));
    for (const [rangeRe, rangeFn, oneRe, oneFn] of RULES) s = s.replace(rangeRe, rangeFn).replace(oneRe, oneFn);
    // bare "75°" is a temperature unless it is a compass direction ("wind from 270°") or an angle ("1° grid")
    s = s.replace(new RegExp(`${N}°(?![A-Za-z])`, 'g'), (m, a, i, str) => {
      if (DIRECTIONAL.test(str.slice(Math.max(0, i - 16), i)) || /^°\s*(grid|beam|tilt|elev)/i.test(str.slice(i + a.length))) return m;
      return `${conv.temp(a)}°`;
    });
    // NWS written forecasts give temperatures with no unit: "High near 76", "falling to around 72", "Lows in the mid 60s"
    if (/\b(highs?|lows?|temperatures?)\b/i.test(s)) {
      s = s.replace(/\b(in the\s+)(upper|lower|mid)?\s?(\d{2,3})s\b/gi, (m, pre, q, d) => {
        const f = +d + (q === 'upper' || q === 'Upper' ? 8 : q === 'lower' || q === 'Lower' ? 2 : 5);
        return `around ${conv.temp(String(f))}°`;
      });
      s = s.replace(new RegExp(`(\\b(?:near|around|of|to|as (?:high|low) as)\\s+)${N}\\b(?!\\s*(?:°|mph|km|mm|m\\b|%|percent|am\\b|pm\\b|[.,]\\d))`, 'gi'),
        (m, pre, a) => `${pre}${conv.temp(a)}°`);
    }
    s = s.replace(/\(kts?\)/g, '(km/h)').replace(/\(in\)/g, '(mm)').replace(/\(mi\)/g, '(km)');   // units named in titles
    return s.replace(/°F\b/g, '°C').replace(/\bmph\b/g, 'km/h').replace(/\bin\/hr\b/g, 'mm/h').replace(/\bmb\b/g, 'hPa');
  }

  // ---------- rewrite text on the page ----------
  const memo = new WeakMap();   // text node -> { src, out }
  const touched = new Set();
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);   // dropdown labels convert; their values do not
  const skip = n => { const p = n.parentElement; return !p || SKIP.has(p.tagName) || !!p.closest('[data-units-skip]'); };
  function fix(node) {
    const d = node.data, rec = memo.get(node);
    if (rec && d === rec.out) return;          // our own writing
    if (rec) memo.delete(node);                  // the page changed this text since
    if (!metric || skip(node)) return;
    const tick = node.parentElement.closest('.legend-ticks');
    const o = tick ? legendTick(tick, d) : convert(d);
    if (o !== d) { memo.set(node, { src: d, out: o }); touched.add(node); node.data = o; }
  }
  // Colour-bar ticks are bare numbers; the unit is in the bar's title, e.g. "Temperature (°F)", "24-h change (°F)", "(kt)".
  function rawText(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let s = '';
    for (let n = w.nextNode(); n; n = w.nextNode()) { const r = memo.get(n); s += r && n.data === r.out ? r.src : n.data; }
    return s;
  }
  function legendTick(tick, d) {
    const m = d.match(/^(\s*)([+-]?)(\d+(?:\.\d+)?)(\+?)(\s*)$/);
    const title = tick.parentElement?.querySelector('.legend-title');
    if (!m || !title) return d;
    const t = rawText(title), [, a, sign, v, plus, b] = m, val = (sign === '-' ? -1 : 1) * +v;
    let o;
    if (/\(°F\)/.test(t)) o = /chang/i.test(t) ? Math.round(val * 5 / 9) : Math.round((val - 32) * 5 / 9);
    else if (/\(kts?\)/.test(t)) o = Math.round(val * 1.852);
    else if (/\(mph\)/.test(t)) o = Math.round(val * 1.609344);
    else if (/\(in\)/.test(t)) { o = val * 25.4; o = o < 10 && o ? +o.toFixed(1) : Math.round(o); }
    else if (/\(mi\)/.test(t)) o = Math.round(val * 1.609344);
    else return d;
    return `${a}${sign === '+' && o > 0 ? '+' : ''}${o}${plus}${b}`;
  }
  function walk(root) {
    if (root.nodeType === 3) { fix(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) fix(n);
  }
  function restore() {
    for (const n of touched) { const r = memo.get(n); if (r && n.data === r.out) n.data = r.src; memo.delete(n); }
    touched.clear();
  }
  new MutationObserver(list => {
    if (!metric) return;
    for (const m of list) {
      if (m.type === 'characterData') fix(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // ---------- the switch ----------
  const switches = [];
  function makeSwitch(cls) {
    const el = document.createElement('div');
    el.className = 'wb-units ' + (cls || '');
    el.setAttribute('data-units-skip', '');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Units');
    el.innerHTML = '<span class="wb-units-lbl">Units</span>' +
      '<button type="button" data-u="imperial" title="Fahrenheit, miles per hour, inches, miles, feet">°F · mph · in</button>' +
      '<button type="button" data-u="metric" title="Celsius, kilometres per hour, millimetres, kilometres, metres">°C · km/h · mm</button>';
    el.addEventListener('click', e => { const b = e.target.closest('button[data-u]'); if (b) set(b.dataset.u); });
    switches.push(el);
    paint();
    return el;
  }
  function paint() {
    for (const el of switches) el.querySelectorAll('button').forEach(b => {
      const on = (b.dataset.u === 'metric') === metric;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
    document.documentElement.classList.toggle('wb-metric', metric);
  }
  function set(mode) {
    const m = mode === 'metric';
    if (m === metric) return;
    metric = m;
    try { localStorage.setItem(KEY, m ? 'metric' : 'imperial'); } catch { /* ignore */ }
    if (metric) walk(document.body); else restore();
    paint();
    dispatchEvent(new Event('wb-units'));
  }
  // another tab or page of the app switched
  addEventListener('storage', e => { if (e.key === KEY) set(e.newValue === 'metric' ? 'metric' : 'imperial'); });

  window.WBUnits = {
    get metric() { return metric; },
    set,
    raw: el => el ? rawText(el) : '',
    temp: f => metric ? (f - 32) * 5 / 9 : f,
    speed: mph => metric ? mph * 1.609344 : mph,
    tempUnit: () => metric ? '°C' : '°F',
    speedUnit: () => metric ? 'km/h' : 'mph',
  };

  // ---------- styles + placement ----------
  const css = document.createElement('style');
  css.textContent = `
    .wb-units { display:flex; align-items:center; gap:0; flex-wrap:nowrap; font:600 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif; color:#e6edf3; }
    .wb-units-lbl { color:#b8c2cc; font-weight:600; margin-right:8px; }
    .wb-units button { min-height:38px; padding:0 12px; border:1px solid #30363d; background:rgba(28,33,40,.92); color:#c9d1d9; font:inherit; cursor:pointer; white-space:nowrap; }
    .wb-units button:first-of-type { border-radius:10px 0 0 10px; }
    .wb-units button:last-of-type { border-radius:0 10px 10px 0; border-left:0; }
    .wb-units button.on { background:#1f6feb; border-color:#1f6feb; color:#fff; }
    .wb-units-bar { display:flex; justify-content:flex-end; margin:0 0 10px; }
    .wb-units-bar .wb-units-lbl { text-shadow:0 1px 3px rgba(0,0,0,.8); }
    .fc-actions .wb-units { margin-left:auto; }
    .wb-units-panel { margin:10px 0 4px; }    @media (max-width:760px) { .wb-units-bar { justify-content:stretch; } .wb-units-bar .wb-units { width:100%; }
      .wb-units-bar .wb-units button { flex:1; } }`;
  document.head.appendChild(css);

  function place() {
    const head = document.querySelector('#home > .h-head');
    if (head) {   // home page: a bar right under the heading, just above the "Get WeatherBoy as an app" banner
      const bar = document.createElement('div');
      bar.className = 'wb-units-bar';
      bar.appendChild(makeSwitch());
      head.after(bar);
    }
    const fcActions = document.querySelector('#fc .fc-actions');
    if (fcActions) fcActions.appendChild(makeSwitch());
    const panel = document.getElementById('panel');
    if (panel && !head && !fcActions) {   // radar page: in the side panel
      const box = makeSwitch('wb-units-panel');
      const brand = panel.querySelector('.brand');
      if (brand) brand.after(box); else panel.prepend(box);
    }
    if (metric) walk(document.body);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place); else place();
})();
