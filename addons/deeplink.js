/* Add-on: links from the home page (home.html) into the radar with a view already switched on,
 * e.g. index.html?show=lightning, plus a "Home" button at the top of the panel.
 * Purely additive: only ticks the add-ons' own checkboxes, exactly as if the user had clicked them. */
'use strict';
(() => {
  const VIEWS = {
    lightning: '#ltOn', rain3d: '#r3On', wind3d: '#wsVec', shear: '#wsMap',
    clouds: '[data-sv="clouds"]', fog: '[data-sv="fog"]', smog: '[data-sv="smog"]', haze: '[data-sv="haze"]',
    temp: '[data-sf="temp"]', humidity: '[data-sf="rh"]', pressure: '[data-sf="pres"]',
    storms: '#stormAlerts',
  };
  const home = document.createElement('a');
  home.href = 'home.html'; home.className = 'home-link'; home.innerHTML = '&#x2302; Home';
  (document.getElementById('forecastLink') || document.getElementById('search')).before(home);

  const show = new URLSearchParams(location.search).get('show');
  const sel = show && VIEWS[show];
  if (!sel) return;
  setTimeout(() => {
    const el = document.querySelector(sel);
    if (!el) return;
    if (el.type === 'checkbox' && !el.checked) el.click();
    (el.closest('section') || el).scrollIntoView({ block: 'center', behavior: 'smooth' });
    history.replaceState(null, '', location.pathname);       // a reload returns to the normal radar
  }, 400);
})();
