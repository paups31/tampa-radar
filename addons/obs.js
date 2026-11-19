/* Shared helper for add-ons: live surface observations (ASOS/AWOS airports) from the Iowa Environmental
 * Mesonet for Florida and its neighbors. Cached for 5 minutes; every caller shares one download.
 * window.SurfaceObs.get() -> Promise<[{ id, name, lat, lon, t, td, rh, mslp, vis, wspd, wdir, gust, wx, sky, time }]>
 */
'use strict';
(() => {
  const NETS = ['FL_ASOS', 'GA_ASOS', 'AL_ASOS', 'FL_AWOS'];
  const TTL = 5 * 60 * 1000;
  let cache = null, at = 0, pending = null;

  async function load() {
    const lists = await Promise.all(NETS.map(n =>
      fetch(`https://mesonet.agron.iastate.edu/api/1/currents.json?network=${n}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))));
    const now = Date.now(), seen = new Set(), out = [];
    for (const l of lists) for (const s of l.data || []) {
      if (seen.has(s.station) || s.lat == null || s.lon == null) continue;
      const time = Date.parse(s.utc_valid);
      if (!(now - time < 3 * 3600 * 1000)) continue;               // ignore stations silent for 3+ hours
      if (s.lat < 23.5 || s.lat > 33 || s.lon < -89.5 || s.lon > -78.5) continue;
      seen.add(s.station);
      const mslp = s.mslp ?? (s.alti != null ? s.alti * 33.8639 : null);
      out.push({
        id: s.station, name: s.name, lat: s.lat, lon: s.lon, time,
        t: s.tmpf, td: s.dwpf, rh: s.relh, mslp, vis: s.vsby,
        wspd: s.sknt, wdir: s.drct, gust: s.gust, wx: s.wxcodes || '', sky: s.skyc1 || '', ceil: s.skyl1,
        feel: s.feel, pday: s.pday, phour: s.phour, hi: s.max_tmpf, lo: s.min_tmpf,
        skyAll: [s.skyc1, s.skyc2, s.skyc3, s.skyc4].filter(Boolean),
      });
    }
    return out;
  }

  window.SurfaceObs = {
    get() {
      if (cache && Date.now() - at < TTL) return Promise.resolve(cache);
      if (!pending) pending = load().then(d => { cache = d; at = Date.now(); return d; }).finally(() => { pending = null; });
      return pending;
    },
    // Inverse-distance-weighted field drawn onto a canvas covering bounds {s,n,w,e}; blank beyond `maxKm`.
    paintField(stations, value, colorAt, b, W, H, maxKm = 110) {
      const pts = stations.map(s => ({ s, v: value(s) })).filter(p => Number.isFinite(p.v));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); const img = g.createImageData(W, H); const d = img.data;
      const kx = 111.32 * Math.cos(((b.s + b.n) / 2) * Math.PI / 180), ky = 111.32;
      for (let y = 0; y < H; y++) {
        const lat = b.n - (y + 0.5) / H * (b.n - b.s);
        for (let x = 0; x < W; x++) {
          const lon = b.w + (x + 0.5) / W * (b.e - b.w);
          let num = 0, den = 0, near = Infinity;
          for (const p of pts) {
            const dx = (p.s.lon - lon) * kx, dy = (p.s.lat - lat) * ky, d2 = dx * dx + dy * dy + 1;
            if (d2 < near) near = d2;
            const w = 1 / (d2 * d2);
            num += w * p.v; den += w;
          }
          const dist = Math.sqrt(near);
          if (!den || dist > maxKm) continue;
          const col = colorAt(num / den);
          const fade = dist > maxKm * 0.7 ? 1 - (dist - maxKm * 0.7) / (maxKm * 0.3) : 1;
          const i = (y * W + x) * 4;
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round((col[3] ?? 255) * fade);
        }
      }
      g.putImageData(img, 0, 0);
      return c.toDataURL();
    },
    ramp(stops) {                     // stops: [[value, '#rrggbb'], ...] -> v => [r,g,b,a]
      const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const S = stops.map(([v, h]) => [v, rgb(h)]);
      return v => {
        if (v <= S[0][0]) return [...S[0][1], 255];
        for (let i = 1; i < S.length; i++) if (v <= S[i][0]) {
          const t = (v - S[i - 1][0]) / (S[i][0] - S[i - 1][0]);
          return S[i][1].map((c, k) => Math.round(S[i - 1][1][k] + (c - S[i - 1][1][k]) * t)).concat(255);
        }
        return [...S[S.length - 1][1], 255];
      };
    },
  };
})();
