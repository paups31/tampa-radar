/* Add-on: iPhone / phone behavior. Additive only — uses the base app's public UI elements. */
'use strict';
(() => {
  const phone = () => window.matchMedia('(max-width: 760px)').matches;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const app = document.getElementById('app');
  const collapse = () => document.getElementById('panelToggle')?.click();   // base app's own hide control

  // Tapping the map closes the full-screen panel on phones.
  document.getElementById('mapWrap').addEventListener('pointerdown', e => {
    if (phone() && !app.classList.contains('collapsed') && !e.target.closest('#panel')) collapse();
  }, true);

  // After picking a radar site, search result or alert on a phone, close the panel so you see the map.
  document.getElementById('panel').addEventListener('click', e => {
    if (!phone()) return;
    if (e.target.closest('.radar-btn, #searchResults li, #alertList li, #rotList li, #saThreats li')) setTimeout(collapse, 150);
  });

  // Keep Leaflet sized correctly through rotation and iOS toolbar show/hide.
  const fix = () => setTimeout(() => map.invalidateSize(), 250);
  window.addEventListener('orientationchange', fix);
  window.visualViewport?.addEventListener('resize', fix);

  // Coming back to the app (e.g. from the ntfy notification): refresh right away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      document.getElementById('refreshBtn')?.click();
      window.rapidMosaic?.on && window.rapidMosaic.refresh();
    }
  });

  // Quick map buttons: Reflectivity / Velocity / Rapid mosaic / Alerts.
  const quick = document.createElement('div');
  quick.className = 'ip-quick';
  quick.innerHTML = `
    <button type="button" data-prod="Reflectivity" title="Reflectivity">REF</button>
    <button type="button" data-prod="Velocity" title="Velocity">VEL</button>
    <button type="button" data-rapid title="60-second multi-radar mosaic">60s</button>
    <button type="button" data-loc title="My location">&#x25CE;</button>`;
  document.getElementById('mapWrap').appendChild(quick);
  L.DomEvent.disableClickPropagation(quick);
  const sync = () => {
    const active = document.querySelector('#productList button.active')?.textContent;
    quick.querySelectorAll('[data-prod]').forEach(b => b.classList.toggle('on', b.dataset.prod === active && !window.rapidMosaic?.on));
    quick.querySelector('[data-rapid]').classList.toggle('on', !!window.rapidMosaic?.on);
  };
  quick.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.prod) {
      const rm = document.getElementById('rmOn');
      if (rm?.checked) { rm.checked = false; rm.dispatchEvent(new Event('change')); }
      [...document.querySelectorAll('#productList button')].find(x => x.textContent === b.dataset.prod)?.click();
    } else if (b.hasAttribute('data-rapid')) {
      const rm = document.getElementById('rmOn');
      if (rm) { rm.checked = !rm.checked; rm.dispatchEvent(new Event('change')); }
    } else if (b.hasAttribute('data-loc')) {
      document.getElementById('locateBtn')?.click();
    }
    setTimeout(sync, 50);
  });
  document.getElementById('productList').addEventListener('click', () => setTimeout(sync, 50));
  document.getElementById('rmOn')?.addEventListener('change', () => setTimeout(sync, 50));
  sync();

  // One-time "Add to Home Screen" hint for iPhone Safari.
  let dismissed = false;
  try { dismissed = localStorage.getItem('iphone.installHint') === 'no'; } catch { /* ignore */ }
  if (isIOS && !standalone && !dismissed) {
    const hint = document.createElement('div');
    hint.className = 'ip-install';
    hint.innerHTML = `<button type="button" aria-label="Dismiss">&times;</button>
      <b>Install on your iPhone:</b> tap <b>Share</b> <span aria-hidden="true">&#x2191;</span> then <b>Add to Home Screen</b>. It opens full-screen like an app.`;
    hint.querySelector('button').onclick = () => { hint.remove(); try { localStorage.setItem('iphone.installHint', 'no'); } catch { /* ignore */ } };
    document.querySelector('#panel .brand').after(hint);
  }
})();
