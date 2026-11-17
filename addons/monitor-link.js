/* Add-on: links the radar page to the background storm monitor (monitor/storm-monitor.ps1).
 * When the monitor is running it is the one that sends phone alerts (even with this page closed);
 * the page shows its status and edits its settings. The monitor's settings win on first connect so
 * every browser uses the same ntfy topic your phone is subscribed to.
 */
'use strict';
(() => {
  const API = 'http://localhost:8766';
  const sa = window.stormAlerts;
  const sec = document.getElementById('stormAlerts');
  if (!sa || !sec) return;
  const S = sa.settings;
  const q = s => sec.querySelector(s);

  const box = document.createElement('div');
  box.className = 'bg-mon';
  box.innerHTML = `<div class="bg-row"><span class="bg-dot" id="bgDot"></span><b>Background monitor</b>
    <span id="bgState" class="muted">checking…</span></div><div id="bgInfo" class="muted small"></div>`;
  q('.sa-actions').before(box);

  let linked = false;
  window.bgMonitorActive = false;

  const fmt = iso => iso ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '—';
  const pick = () => ({ enabled: S.enabled, topic: S.topic, home: S.home, radiusMi: S.radiusMi, leadMin: S.leadMin, minLevel: S.minLevel });

  function setSelect(sel, v, label) {
    const el = q(sel);
    if (![...el.options].some(o => +o.value === +v || o.value === String(v))) el.add(new Option(label(v), v));
    el.value = String(v);
  }

  // Adopt the monitor's settings into the page (first connect only).
  function adopt(c) {
    Object.assign(S, { enabled: !!c.enabled, topic: c.topic, home: c.home, radiusMi: +c.radiusMi, leadMin: +c.leadMin, minLevel: c.minLevel });
    try { localStorage.setItem('stormAlerts.settings.v1', JSON.stringify(S)); } catch { /* ignore */ }
    q('#saEnabled').checked = S.enabled;
    q('#saTopic').value = S.topic;
    q('#saTopicShow').textContent = S.topic;
    q('#saHome').textContent = S.home.name;
    setSelect('#saRadius', S.radiusMi, v => `${v} mi`);
    setSelect('#saLead', S.leadMin, v => `${v} min ahead`);
    q('#saLevel').value = S.minLevel;
    q('#saPill').textContent = S.enabled ? 'on' : 'off';
    q('#saPill').className = S.enabled ? 'pill sa-on' : 'pill';
    sa.cycle();
  }

  function render(s) {
    const dot = q('#bgDot'), st = q('#bgState'), info = q('#bgInfo');
    if (!s && !['localhost', '127.0.0.1'].includes(location.hostname)) {
      // Opened from another device (e.g. an iPhone): the monitor lives on the PC and can't be seen from here.
      dot.className = 'bg-dot';
      st.textContent = 'runs on your PC';
      info.textContent = 'Its status and settings are only visible on the PC. Phone alerts still arrive through the ntfy app. Leave "Send alerts to my phone" off here to avoid duplicates.';
      return;
    }
    if (!s) {
      dot.className = 'bg-dot';
      st.textContent = 'not running';
      info.innerHTML = 'Alerts only go out while this page is open. Start it with <code>monitor\\start-monitor.ps1</code>.';
      return;
    }
    const age = s.lastCheck ? (Date.now() - Date.parse(s.lastCheck)) / 60000 : Infinity;
    const healthy = age < 10 && !s.lastError;
    dot.className = 'bg-dot ' + (healthy ? 'ok' : 'warn');
    st.textContent = healthy ? (s.config.enabled ? 'running · sending alerts' : 'running · alerts off') : 'running · check delayed';
    const n = (s.threats || []).length;
    info.innerHTML = `Last check ${fmt(s.lastCheck)} · ${s.cells} FL cells · ${n} approaching` +
      (s.lastSent ? `<br>Last alert ${fmt(s.lastSent.at)}: ${s.lastSent.title.replace(/[<>&]/g, '')}` : '') +
      (s.lastError ? `<br>Last error: ${String(s.lastError).replace(/[<>&]/g, '').slice(0, 120)}` : '') +
      '<br>Works with this page closed (PC must be on and awake).';
  }

  async function poll() {
    try {
      const r = await fetch(API + '/status', { cache: 'no-store' });
      const s = await r.json();
      window.bgMonitorActive = true;
      if (!linked) { linked = true; adopt(s.config); }
      render(s);
    } catch {
      window.bgMonitorActive = false;
      linked = false;
      render(null);
    }
  }

  async function pushSettings() {
    if (!window.bgMonitorActive) return;
    try {
      await fetch(API + '/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pick()) });
      poll();
    } catch { /* monitor went away; next poll will show it */ }
  }

  // Forward the user's changes (after the storm-alerts handlers have updated S).
  for (const sel of ['#saEnabled', '#saRadius', '#saLead', '#saLevel', '#saTopic']) q(sel).addEventListener('change', () => setTimeout(pushSettings, 0));
  q('#saSetHome').addEventListener('click', () => setTimeout(pushSettings, 0));

  // Extra button: test through the monitor itself.
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'sa-btn'; btn.textContent = 'Test background monitor';
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const r = await fetch(API + '/test', { method: 'POST' });
      const j = await r.json();
      btn.textContent = j.ok ? 'Sent from monitor ✓' : 'Monitor send failed';
    } catch { btn.textContent = 'Monitor not running'; }
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Test background monitor'; }, 4000);
  };
  q('.sa-actions').appendChild(btn);

  poll();
  setInterval(poll, 30 * 1000);
})();
