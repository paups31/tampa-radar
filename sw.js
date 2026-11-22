/* WeatherBoy Radar service worker - makes the site an installable app.
 * App files are network-first (you always get the newest version when online) with a cached copy as a
 * fallback, so the app still opens without signal. Live weather data (other sites) is never cached.
 */
const CACHE = 'weatherboy-v2';
const SHELL = [
  'home.html', 'index.html', 'forecast.html', 'app.js', 'styles.css',
  'addons/manifest.webmanifest', 'addons/icons/icon-180.png', 'addons/icons/icon-192.png', 'addons/icons/icon-512.png',
  'addons/home.css', 'addons/home.js', 'addons/obs.js', 'addons/forecast.css', 'addons/forecast.js',
  'addons/branding.js', 'addons/app-install.js', 'addons/live.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // weather data, maps, CDNs: straight to the network
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('home.html')) || Response.error();
      return Response.error();
    }
  })());
});
