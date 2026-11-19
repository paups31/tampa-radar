/* Add-on: button that opens the separate 24-hour forecast window (forecast.html).
 * Purely additive: one small panel section near the top. */
'use strict';
(() => {
  const sec = document.createElement('section');
  sec.id = 'forecastLink';
  sec.innerHTML = `
    <button type="button" class="fc-open" id="fcOpen">&#x1F4C5; 24-hour forecast for Tampa &#x2197;</button>
    <div class="muted small" style="margin-top:4px">Opens in its own window, separate from the live radar.
      <a href="#" id="fcOpenHere">Forecast for the map center instead</a></div>`;
  const search = document.getElementById('search');
  search.after(sec);
  function openFc(lat, lon, name) {
    const u = `forecast.html?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&name=${encodeURIComponent(name)}`;
    const w = window.open(u, 'tampaRadarForecast', 'popup,width=1180,height=900');
    if (w) w.focus(); else location.href = u;       // popup blocked (e.g. iPhone home-screen app): open in place
  }
  sec.querySelector('#fcOpen').addEventListener('click', () => openFc(HOME.lat, HOME.lon, HOME.name));
  sec.querySelector('#fcOpenHere').addEventListener('click', e => {
    e.preventDefault();
    const c = map.getCenter();
    openFc(c.lat, c.lng, `${c.lat.toFixed(2)}°, ${c.lng.toFixed(2)}°`);
  });
})();
