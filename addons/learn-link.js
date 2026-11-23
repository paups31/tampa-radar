/* Home page: a small "Be safe and educated" box linking to the weather guides (learn.html).
 * Added under the current-conditions panel. Add-on only; home.html just loads this file. */
'use strict';
(() => {
  const hero = document.getElementById('hHero');
  if (!hero) return;
  const box = document.createElement('section');
  box.className = 'card wb-learn';
  box.setAttribute('aria-label', 'Be safe and educated');
  box.innerHTML = `
    <a class="wb-learn-main" href="learn.html">
      <span class="wb-learn-ico" aria-hidden="true">&#x1F6DF;</span>
      <span class="wb-learn-txt"><b>Be safe and educated</b>
        <span>Plain-language guides with official sources: alerts, radar colors, CAPE, lightning, hurricanes and more.</span></span>
      <span class="wb-learn-go" aria-hidden="true">&#x203A;</span>
    </a>
    <div class="wb-learn-chips">
      <a href="learn.html#watch-warning">Watch vs. warning</a>
      <a href="learn.html#lightning">Lightning safety</a>
      <a href="learn.html#cape">What is CAPE?</a>
      <a href="learn.html#hurricanes">Hurricanes</a>
    </div>`;
  hero.after(box);

  const css = document.createElement('style');
  css.textContent = `
    .wb-learn { margin:12px 0 0; padding:12px 14px; border-color:#2f5b94 !important; }
    .wb-learn-main { display:flex; align-items:center; gap:12px; color:inherit; text-decoration:none; }
    .wb-learn-ico { font-size:28px; flex:none; }
    .wb-learn-txt { flex:1; min-width:0; display:flex; flex-direction:column; }
    .wb-learn-txt b { font-size:17px; }
    .wb-learn-txt span { color:#b8c2cc; font-size:13px; }
    .wb-learn-go { color:#58a6ff; font-size:26px; flex:none; }
    .wb-learn-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; padding-left:40px; }
    .wb-learn-chips a { font-size:13px; color:#e6edf3; text-decoration:none; background:rgba(28,33,40,.92); border:1px solid #30363d;
      border-radius:999px; padding:6px 11px; min-height:34px; display:inline-flex; align-items:center; }
    .wb-learn-chips a:hover, .wb-learn:hover { border-color:#58a6ff; }
    @media (max-width:760px) { .wb-learn-chips { padding-left:0; } }`;
  document.head.appendChild(css);
})();
