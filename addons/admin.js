/* WeatherBoy admin page (admin.html).
 * Edits site-config.json in the GitHub repository paups31/tampa-radar through the GitHub REST API, using a
 * fine-grained access key the owner pastes in. The key stays in this browser (sessionStorage, or localStorage
 * if "remember" is ticked) and is sent only to api.github.com. Preview works without a key: it stores the draft
 * on this device only, where addons/site-config.js picks it up. */
'use strict';
(() => {
  const OWNER = 'paups31', REPO = 'tampa-radar', BRANCH = 'main', PATH = 'site-config.json';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const TOKEN_KEY = 'wb.admin.token', PREVIEW_KEY = 'wb.cfg.preview';
  const $ = id => document.getElementById(id);
  const form = $('adForm');
  const F = name => form.elements[name];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SECTIONS = [
    ['learn', 'Be safe and educated box', null],
    ['radar', 'Live radar', 'Live radar'],
    ['now', 'Right now around Tampa (tiles)', 'Right now around Tampa'],
    ['coming', 'Coming up (forecast)', 'Coming up'],
    ['quick', 'Jump straight to (links)', null],
  ];
  const TILES = [['tStorms', 'Storms near Tampa'], ['tLightning', 'Lightning'], ['tRain', 'Rain'], ['tWind', 'Wind & shear'],
    ['tSunUv', 'Sun & UV'], ['tTides', 'Tides'], ['tAir', 'Air quality'], ['tSky', 'Sky & visibility'], ['tPhone', 'Phone alerts'],
    ['tForecast', 'Next 12 hours'], ['hWeekBox', '7-day outlook']];

  // ---------- key storage ----------
  const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  const setToken = (t, remember) => { try { sessionStorage.setItem(TOKEN_KEY, t); if (remember) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };
  const clearToken = () => { try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

  async function gh(path, opt = {}) {
    const token = getToken();
    const r = await fetch(path.startsWith('http') ? path : API + path, {
      ...opt, cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opt.headers || {}) },
    });
    if (!r.ok) {
      let msg = `GitHub said ${r.status}`;
      try { const j = await r.json(); if (j.message) msg += `: ${j.message}`; } catch { /* ignore */ }
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return r.status === 204 ? null : r.json();
  }
  const b64 = s => { const bytes = new TextEncoder().encode(s); let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin); };
  const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));

  // ---------- sign in ----------
  let user = null;
  const authMsg = (t, cls) => { $('adAuthMsg').textContent = t; $('adAuthMsg').className = 'ad-msg ' + (cls || ''); };
  async function checkAuth() {
    if (!getToken()) { showSignedIn(false); return false; }
    try {
      const repo = await gh('');
      if (!repo.permissions?.push) { authMsg('This key can read the site but not publish. Give it Contents: Read and write.', 'err'); showSignedIn(false); return false; }
      try { user = (await gh('https://api.github.com/user')).login; } catch { user = OWNER; }
      showSignedIn(true); authMsg('');
      loadHistory();
      return true;
    } catch (e) {
      authMsg(e.status === 401 ? 'That key was not accepted. It may have expired or been mistyped.' : e.status === 404 ? 'That key cannot see paups31/tampa-radar. Check its repository access.' : e.message, 'err');
      showSignedIn(false); return false;
    }
  }
  function showSignedIn(on) {
    $('adSignedOut').hidden = on; $('adSignedIn').hidden = !on;
    if (on) $('adUser').textContent = user || OWNER;
    $('adPublish').disabled = !on;
    $('adReset').disabled = !on;
  }
  $('adLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const t = $('adToken').value.trim();
    if (!t) return;
    setToken(t, $('adRemember').checked);
    $('adToken').value = '';
    authMsg('Checking…');
    if (!(await checkAuth())) clearToken();
  });
  $('adLogout').addEventListener('click', () => { clearToken(); user = null; showSignedIn(false); authMsg('Signed out. The key was removed from this device.', 'ok'); $('adHistory').innerHTML = '<p class="ad-note">Sign in to see the history.</p>'; });

  // ---------- form <-> settings ----------
  let current = { v: 1 }, sectionOrder = SECTIONS.map(s => s[0]), sectionShown = {}, pinned = '';
  function buildSections() {
    const ol = $('adSections');
    const titles = (current.home && current.home.titles) || {};
    ol.innerHTML = sectionOrder.map((k, i) => {
      const s = SECTIONS.find(x => x[0] === k);
      return `<li data-k="${k}" class="${sectionShown[k] === false ? 'off' : ''}">
        <input type="checkbox" ${sectionShown[k] === false ? '' : 'checked'} aria-label="Show ${esc(s[1])}">
        <span class="nm">${esc(s[1])}</span>
        <span class="mv"><button type="button" data-mv="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&#x2191;</button><button type="button" data-mv="1" ${i === sectionOrder.length - 1 ? 'disabled' : ''} aria-label="Move down">&#x2193;</button></span>
        ${s[2] ? `<input type="text" data-title="${k}" maxlength="60" placeholder="Heading: ${esc(s[2])}" value="${esc(titles[k] || '')}">` : ''}
      </li>`;
    }).join('');
  }
  $('adSections').addEventListener('click', e => {
    const b = e.target.closest('button[data-mv]'); if (!b) return;
    const k = b.closest('li').dataset.k, i = sectionOrder.indexOf(k), j = i + +b.dataset.mv;
    if (j < 0 || j >= sectionOrder.length) return;
    readTitles();
    [sectionOrder[i], sectionOrder[j]] = [sectionOrder[j], sectionOrder[i]];
    buildSections(); markDirty();
  });
  $('adSections').addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    const li = e.target.closest('li'); sectionShown[li.dataset.k] = e.target.checked; li.classList.toggle('off', !e.target.checked); markDirty();
  });
  let draftTitles = {};
  function readTitles() { $('adSections').querySelectorAll('input[data-title]').forEach(i => { draftTitles[i.dataset.title] = i.value.trim(); }); current.home = { ...(current.home || {}), titles: { ...draftTitles } }; }

  $('adTiles').innerHTML = TILES.map(([id, name]) => `<label class="ad-check"><input type="checkbox" data-tile="${id}"> ${esc(name)}</label>`).join('');

  const photos = window.WB_BG_PHOTOS || [];
  $('adPhotos').innerHTML = photos.map(p => `<button type="button" data-f="${esc(p.f)}" title="${esc(p.f.replace(/\.(jpe?g)$/i, ''))} — ${esc(p.a)}" style="background-image:url('https://upload.wikimedia.org/wikipedia/commons/thumb/${p.p.replace(/'/g, '%27')}/330px-${p.p.split('/').pop().replace(/'/g, '%27')}')"></button>`).join('');
  $('adPhotos').addEventListener('click', e => {
    const b = e.target.closest('button[data-f]'); if (!b) return;
    pinned = b.dataset.f; $('adPhotos').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); markDirty();
  });

  function fill(c) {
    current = JSON.parse(JSON.stringify(c || { v: 1 }));
    const a = current.announcement || {}, h = current.home || {}, bg = current.background || {}, cu = bg.custom || {};
    F('annOn').checked = !!a.on; F('annText').value = a.text || ''; F('annLink').value = a.link || ''; F('annLinkText').value = a.linkText || ''; F('annLevel').value = a.level || 'info';
    const order = Array.isArray(h.order) ? h.order.filter(k => SECTIONS.some(s => s[0] === k)) : [];
    sectionOrder = [...order, ...SECTIONS.map(s => s[0]).filter(k => !order.includes(k))];
    sectionShown = {}; (h.hidden || []).forEach(k => { sectionShown[k] = false; });
    draftTitles = { ...(h.titles || {}) };
    buildSections();
    F('greeting').checked = h.greeting !== false; F('loopButton').checked = h.loopButton !== false;
    const hiddenTiles = new Set(h.hiddenTiles || []);
    $('adTiles').querySelectorAll('input').forEach(i => { i.checked = !hiddenTiles.has(i.dataset.tile); });
    const acc = /^#[0-9a-f]{6}$/i.test(current.accent || '') ? current.accent : '';
    F('accentDefault').checked = !acc; F('accent').value = acc || '#1f6feb';
    form.querySelectorAll('input[name=bgMode]').forEach(r => { r.checked = r.value === (bg.mode || 'daily'); });
    pinned = bg.pinned || '';
    $('adPhotos').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.f === pinned));
    F('cUrl').value = cu.url || ''; F('cTitle').value = cu.title || ''; F('cAuthor').value = cu.author || ''; F('cLicense').value = cu.license || '';
    F('cLicenseUrl').value = cu.licenseUrl || ''; F('cPage').value = cu.page || ''; F('cConfirm').checked = !!cu.url;
    F('dim').value = Number.isFinite(bg.dim) ? bg.dim : 50; $('adDimVal').textContent = F('dim').value;
    showBgParts(); markDirty(false);
  }

  function collect() {
    readTitles();
    const c = { v: 1 };
    const annText = F('annText').value.trim();
    if (F('annOn').checked || annText) {
      c.announcement = { on: F('annOn').checked, text: annText, level: F('annLevel').value };
      if (F('annLink').value.trim()) c.announcement.link = F('annLink').value.trim();
      if (F('annLinkText').value.trim()) c.announcement.linkText = F('annLinkText').value.trim();
      const prev = current.announcement || {};
      // a new message gets a new id, so it shows again even to people who closed the old one
      const id = prev.text === annText ? prev.id : String(Date.now());
      if (id) c.announcement.id = id;
    }
    const h = {};
    const def = SECTIONS.map(s => s[0]);
    if (sectionOrder.join() !== def.join()) h.order = [...sectionOrder];
    const hidden = sectionOrder.filter(k => sectionShown[k] === false); if (hidden.length) h.hidden = hidden;
    const titles = {}; for (const [k, v] of Object.entries(draftTitles)) if (v) titles[k] = v; if (Object.keys(titles).length) h.titles = titles;
    const ht = [...$('adTiles').querySelectorAll('input')].filter(i => !i.checked).map(i => i.dataset.tile); if (ht.length) h.hiddenTiles = ht;
    if (!F('greeting').checked) h.greeting = false;
    if (!F('loopButton').checked) h.loopButton = false;
    if (Object.keys(h).length) c.home = h;
    if (!F('accentDefault').checked) c.accent = F('accent').value;
    const mode = form.querySelector('input[name=bgMode]:checked')?.value || 'daily', dim = +F('dim').value;
    const bg = {};
    if (mode !== 'daily') bg.mode = mode;
    if (mode === 'pinned') bg.pinned = pinned;
    if (mode === 'custom') bg.custom = { url: F('cUrl').value.trim(), title: F('cTitle').value.trim(), author: F('cAuthor').value.trim(),
      license: F('cLicense').value.trim(), licenseUrl: F('cLicenseUrl').value.trim(), page: F('cPage').value.trim() };
    if (dim !== 50) bg.dim = dim;
    if (Object.keys(bg).length) c.background = bg;
    return c;
  }
  function problems(c) {
    const p = [];
    const bg = c.background || {};
    if (bg.mode === 'pinned' && !bg.pinned) p.push('Pick a photo for “Always use one photo”.');
    if (bg.mode === 'custom') {
      const cu = bg.custom;
      if (!/^https:\/\/\S+$/i.test(cu.url)) p.push('Your own photo needs an address starting with https://.');
      if (!cu.author || !cu.license) p.push('Add the photographer and license for your own photo, so it is credited.');
      if (!F('cConfirm').checked) p.push('Tick the box confirming the photo is free to use.');
    }
    const link = c.announcement?.link;
    if (link && !(/^https?:\/\//i.test(link) || /^[\w./#?=&-]+$/.test(link))) p.push('The banner link must be a web address or a page on this site (like learn.html).');
    if (c.announcement?.on && !c.announcement.text) p.push('Write a message for the banner, or untick “Show the banner”.');
    return p;
  }

  function showBgParts() {
    const mode = form.querySelector('input[name=bgMode]:checked')?.value || 'daily';
    $('adPinned').hidden = mode !== 'pinned'; $('adCustom').hidden = mode !== 'custom';
  }
  let saved = '{}';
  function markDirty(force) {
    const now = JSON.stringify(collect());
    const dirty = force === false ? false : now !== saved;
    if (force === false) saved = now;
    $('adDirty').textContent = dirty ? 'Unsaved changes' : 'No unsaved changes';
    $('adDirty').classList.toggle('on', dirty);
  }
  form.addEventListener('input', e => { if (e.target.name === 'dim') $('adDimVal').textContent = e.target.value; if (e.target.name === 'bgMode') showBgParts(); markDirty(); });
  form.addEventListener('change', () => { showBgParts(); markDirty(); });
  addEventListener('beforeunload', e => { if ($('adDirty').classList.contains('on')) { e.preventDefault(); e.returnValue = ''; } });

  const msg = (t, cls) => { $('adMsg').textContent = t; $('adMsg').className = 'ad-msg ' + (cls || ''); };

  // ---------- preview (this device only) ----------
  $('adPreview').addEventListener('click', () => {
    const c = collect(), p = problems(c);
    if (p.length) { msg(p.join(' '), 'err'); return; }
    try { localStorage.setItem(PREVIEW_KEY, JSON.stringify({ at: Date.now(), cfg: c })); } catch { msg('This browser blocked saving the preview.', 'err'); return; }
    msg('Preview saved on this device. Opening the home page… Use “Exit preview” there to go back to the live settings.', 'ok');
    window.open('home.html', '_blank', 'noopener');
  });

  // ---------- publish ----------
  async function readRemote(ref) {
    try {
      const f = await gh(`/contents/${PATH}?ref=${encodeURIComponent(ref || BRANCH)}`);
      return { sha: f.sha, cfg: JSON.parse(unb64(f.content)) };
    } catch (e) { if (e.status === 404) return { sha: null, cfg: { v: 1 } }; throw e; }
  }
  function summary(c) {
    const bits = [];
    if (c.announcement?.on) bits.push('banner on'); else if (current.announcement?.on) bits.push('banner off');
    if (c.home) bits.push('home layout');
    if (c.accent) bits.push('accent ' + c.accent);
    if (c.background) bits.push('background ' + (c.background.mode || 'daily'));
    return bits.length ? bits.join(', ') : 'standard settings';
  }
  async function publish(c, message) {
    const remote = await readRemote();
    const body = { message, content: b64(JSON.stringify(c, null, 2) + '\n'), branch: BRANCH };
    if (remote.sha) body.sha = remote.sha;
    await gh(`/contents/${PATH}`, { method: 'PUT', body: JSON.stringify(body) });
  }
  $('adPublish').addEventListener('click', async () => {
    const c = collect(), p = problems(c);
    if (p.length) { msg(p.join(' '), 'err'); return; }
    if (!confirm('Publish these changes to the live WeatherBoy site?')) return;
    $('adPublish').disabled = true; msg('Publishing…');
    try {
      await publish(c, `Admin: ${summary(c)}`);
      fill(c);
      try { localStorage.removeItem(PREVIEW_KEY); localStorage.setItem('wb.cfg.cache', JSON.stringify(c)); } catch { /* ignore */ }
      msg('Published. The live site updates in about a minute; reopen the app to see it.', 'ok');
      loadHistory();
    } catch (e) {
      msg(e.status === 409 ? 'Someone changed the settings at the same time. Reload this page and try again.' : `Could not publish: ${e.message}`, 'err');
    } finally { $('adPublish').disabled = !getToken(); }
  });

  // ---------- history ----------
  async function loadHistory() {
    const box = $('adHistory');
    box.innerHTML = '<p class="ad-note">Loading…</p>';
    try {
      const list = await gh(`/commits?path=${PATH}&sha=${BRANCH}&per_page=15`);
      if (!list.length) { box.innerHTML = '<p class="ad-note">No changes published yet.</p>'; return; }
      box.innerHTML = list.map((c, i) => `<div class="it"><div class="t">${esc(c.commit.message.split('\n')[0])}
        <small>${new Date(c.commit.author.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}${i === 0 ? ' · live now' : ''}</small></div>
        ${i === 0 ? '' : `<button type="button" class="ad-btn small" data-sha="${esc(c.sha)}">Restore</button>`}</div>`).join('');
    } catch (e) { box.innerHTML = `<p class="ad-note">Could not load history (${esc(e.message)}).</p>`; }
  }
  $('adHistory').addEventListener('click', async e => {
    const b = e.target.closest('button[data-sha]'); if (!b) return;
    if (!confirm('Restore this earlier version to the live site?')) return;
    b.disabled = true; msg('Restoring…');
    try {
      const old = await readRemote(b.dataset.sha);
      await publish(old.cfg, `Admin: restored version from ${b.dataset.sha.slice(0, 7)}`);
      fill(old.cfg); msg('Restored. The live site updates in about a minute.', 'ok'); loadHistory();
    } catch (err) { msg(`Could not restore: ${err.message}`, 'err'); b.disabled = false; }
  });
  $('adReset').addEventListener('click', async () => {
    if (!confirm('Reset the live site to the standard WeatherBoy look? (You can undo this from the history.)')) return;
    msg('Resetting…');
    try { await publish({ v: 1 }, 'Admin: reset to standard settings'); fill({ v: 1 }); msg('Reset. The live site updates in about a minute.', 'ok'); loadHistory(); }
    catch (e) { msg(`Could not reset: ${e.message}`, 'err'); }
  });

  // ---------- start: load the live settings (from GitHub when signed in, so the newest version is used) ----------
  (async () => {
    showSignedIn(false);
    let c = null;
    if (getToken() && await checkAuth()) { try { c = (await readRemote()).cfg; } catch { /* fall back */ } }
    if (!c) { try { c = await (await fetch('site-config.json', { cache: 'no-store' })).json(); } catch { c = { v: 1 }; } }
    fill(c);
  })();
})();
