/* Add-on: app name "WeatherBoy Radar". The locked base page keeps its original markup; this renames the
 * tab title, the panel heading and the home-screen app name when the page loads. */
'use strict';
(() => {
  const NAME = 'WeatherBoy Radar';
  document.title = NAME;
  const h1 = document.querySelector('#panel .brand h1');
  if (h1) h1.textContent = NAME;
  const t = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (t) t.setAttribute('content', 'WeatherBoy');
})();
