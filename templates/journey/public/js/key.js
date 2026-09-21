// The sender's key: every envelope, the letters, and a rehearsal of the whole journey.
import { fmt, setRehearsal, now, rehearsing, setHomeZone } from './clock.js';
import { parseJourney } from './trip.js';
import { bindCopy } from './bind.js';
import { loadTheme, t } from './copy.js';

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
let K = q.get('k');
try { if (K) localStorage.setItem('ga_key', K); else K = localStorage.getItem('ga_key'); } catch (e) {}
if (q.get('k')) history.replaceState(null, '', location.pathname);

let TRIP = null, J = null, DATA = null;
const api = async (path, body) => {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: K, ...body }) } : { headers: { 'X-Key': K || '' }, cache: 'no-store' });
  if (res.status === 403) throw new Error('denied');
  return res.json();
};
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const tz = (s) => s.tz || J.tz;

async function load() {
  TRIP = await (await fetch('data/trip.json', { cache: 'no-cache' })).json();
  J = parseJourney(TRIP);
  setHomeZone(J.tz);
  await loadTheme(document, J);
  bindCopy(document, J);
  for (const s of TRIP.stops) s.at = Date.parse(s.opensAt);
  try { DATA = await api(`api/key?k=${encodeURIComponent(K || '')}`); }
  catch (e) { $('#denied').hidden = false; return; }
  $('#wrap').hidden = false;
  $('#appUrl').textContent = new URL('./', location.href).href;
  $('#boxUrl').textContent = new URL('letterbox.html', location.href).href;
  renderLetters(); renderEnvelopes(); setupRehearsal();
}

/* ---------------- envelopes ---------------- */
function statusFor(s) {
  const ev = DATA.events.filter((e) => e.id === s.id);
  const opened = ev.find((e) => e.type === 'opened');
  const answered = ev.find((e) => e.type === 'answered');
  const o = DATA.overrides[s.id];
  if (opened) return { cls: 'opened', text: `Opened ${fmt.time(opened.at, tz(s))}${answered ? ' · answered' : ''}` };
  if (o === 'hold') return { cls: 'held', text: t('heldBack') };
  if (o === 'open') return { cls: 'ready', text: t('openedEarly') };
  if (s.n === 1 || Date.now() >= s.at) return { cls: 'ready', text: 'Ready' };
  return { cls: 'sealed', text: 'Sealed' };
}
function renderEnvelopes() {
  const box = $('#envs'); box.innerHTML = '';
  for (const s of TRIP.stops) {
    const row = el('div', 'env');
    const top = el('div', 'env-top');
    const img = el('img', 'thumb'); img.alt = ''; img.loading = 'lazy';
    if (s.poster) img.src = `img/thumbs/${s.poster}.jpg`; else img.style.visibility = 'hidden';
    img.onerror = () => { img.style.visibility = 'hidden'; };
    const mid = el('div');
    mid.append(el('div', 'name', `${s.n}. ${s.place}`), el('div', 'meta', `Day ${s.day} · ${fmt.day(s.at, tz(s))} · ${fmt.time(s.at, tz(s))}${s.question ? ' · question' : ''}`));
    const st = statusFor(s); const chip = el('span', `chip ${st.cls}`, st.text);
    top.append(img, mid, chip); row.appendChild(top);

    const body = el('div', 'env-body');
    const actions = el('div', 'row');
    const mk = (label, mode) => { const b = el('button', 'btn small ghost', label); b.addEventListener('click', async () => { await api('api/key/override', { id: s.id, mode }); DATA.overrides[s.id] = mode || undefined; if (!mode) delete DATA.overrides[s.id]; renderEnvelopes(); }); return b; };
    if (st.cls !== 'opened') {
      if (DATA.overrides[s.id]) actions.append(mk(t('backToTime'), null));
      else actions.append(mk(t('openNow'), 'open'), mk('Hold it back', 'hold'));
    }
    const peek = el('button', 'btn small ghost', 'See it');
    peek.addEventListener('click', () => previewAt(Math.max(s.at + 60e3, TRIP.stops[0].at), s.id));
    actions.append(peek);
    body.append(actions);
    row.appendChild(body);
    box.appendChild(row);
  }
}

/* ---------------- letters ---------------- */
function renderLetters() {
  const box = $('#letters'); box.innerHTML = '';
  const L = DATA.letters.slice().sort((a, b) => a.at - b.at);
  const shown = L.filter((l) => !l.hidden).length;
  const dayAgo = Date.now() - 864e5;
  const fresh = L.filter((l) => l.at > dayAgo).length;
  $('#lCount').textContent = L.length ? `${shown} waiting${fresh ? ` · ${fresh} new today` : ''}${L.length > shown ? ` · ${L.length - shown} hidden` : ''}` : 'None yet. Send friends the letterbox link.';
  for (const l of L) {
    const d = el('div', 'letter' + (l.hidden ? ' hidden' : ''));
    d.append(el('div', 'lbl', `From ${l.from}${l.last ? ' · last' : ''}`), el('div', 'meta', `Received ${fmt.day(l.at, 'Asia/Singapore')} ${fmt.time(l.at, 'Asia/Singapore')} Singapore time`));
    if (l.text) d.append(el('p', null, l.text));
    if (l.audio) { const a = el('audio'); a.controls = true; a.preload = 'none'; a.src = l.audio; d.append(a); }
    if (l.video) { const v = el('video'); v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.src = l.video; d.append(v); }
    const row = el('div', 'row');
    const b = (label, fn) => { const x = el('button', 'btn small ghost', label); x.addEventListener('click', fn); return x; };
    row.append(
      b(l.hidden ? 'Let it down' : 'Hold it back', async () => { await api('api/key/letter', { id: l.id, hidden: !l.hidden }); l.hidden = !l.hidden; renderLetters(); }),
      b(l.last ? 'Not last' : 'Make it the last', async () => { for (const x of DATA.letters) if (x.last && x.id !== l.id) { await api('api/key/letter', { id: x.id, last: false }); x.last = false; } await api('api/key/letter', { id: l.id, last: !l.last }); l.last = !l.last; renderLetters(); }),
    );
    const del = b('Delete', async () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; setTimeout(() => { del.dataset.armed = ''; del.textContent = 'Delete'; }, 3000); return; }
      await api('api/key/letter', { id: l.id, delete: true }); DATA.letters = DATA.letters.filter((x) => x.id !== l.id); renderLetters();
    });
    row.append(del);
    d.append(row); box.appendChild(d);
  }
}

/* ---------------- rehearsal ---------------- */
let T0 = 0, T1 = 0;
function setupRehearsal() {
  // The slider covers the journey itself, with an hour before the first envelope and a day
  // after the last, so the sender can sit at either end of it.
  const all = TRIP.stops;
  T0 = all[0].at - 36e5; T1 = all[all.length - 1].at + 864e5;
  const slider = $('#rSlider');
  const sync = () => {
    const r = rehearsing();
    const at = now();
    $('#rClock').textContent = r ? `${fmt.dayLong(at)}, ${fmt.time(at)}${J.tzCity ? ` in ${J.tzCity}` : ''}` : 'Real time';
    slider.value = String(Math.round(Math.max(0, Math.min(1, (at - T0) / (T1 - T0))) * 1000));
  };
  slider.addEventListener('input', () => { setRehearsal(T0 + (T1 - T0) * slider.value / 1000, 0); sync(); });
  slider.addEventListener('change', () => reloadFrame());
  $('#rStart').addEventListener('click', () => { clearRehearsalState(); setRehearsal(TRIP.stops[0].at + 5 * 60e3, 1); sync(); reloadFrame(); });
  $('#rNext').addEventListener('click', () => {
    const at = now(); const nx = TRIP.stops.find((s) => s.at > at + 30e3) || TRIP.stops[TRIP.stops.length - 1];
    setRehearsal(nx.at + 60e3, 1); sync(); reloadFrame();
  });
  $('#rMidnight').addEventListener('click', () => { setRehearsal(J.midnightAt + 30e3, 1); sync(); reloadFrame(); });
  $('#rBook').addEventListener('click', () => { setRehearsal(TRIP.stops[TRIP.stops.length - 1].at + 60e3, 1); sync(); reloadFrame(); });
  $('#rMoon').addEventListener('click', () => { setRehearsal(J.callbackAt + 60e3, 1); sync(); reloadFrame(); });
  hideMissingJumps();
  $('#rReal').addEventListener('click', () => { setRehearsal(null); sync(); reloadFrame(); });
  $('#pToggle').addEventListener('click', () => { const p = $('#preview'); p.classList.toggle('closed'); $('#pToggle').textContent = p.classList.contains('closed') ? 'Show' : 'Hide'; if (!p.classList.contains('closed')) reloadFrame(); });
  $('#pReset').addEventListener('click', () => { clearRehearsalState(); reloadFrame(); });
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#' + b.dataset.copy).textContent); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1600); } catch (e) { b.textContent = 'Select it'; }
  }));
  setInterval(sync, 5000); sync();
  if (matchMedia('(min-width: 980px)').matches) reloadFrame();
}
function clearRehearsalState() { try { localStorage.removeItem('ga_state_rehearse_v1'); } catch (e) {} }

// A journey with no midnight and no callback has no button to jump to them.
function hideMissingJumps() {
  if (!J.midnightAt) { const b = $('#rMidnight'); if (b) b.hidden = true; }
  if (!J.callbackAt) { const b = $('#rMoon'); if (b) b.hidden = true; }
}
function previewAt(at, id) {
  setRehearsal(at, 1);
  const p = $('#preview'); p.classList.remove('closed'); $('#pToggle').textContent = 'Hide';
  reloadFrame(id);
  p.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function reloadFrame(stopId) {
  const f = $('#frame');
  if ($('#preview').classList.contains('closed') && !matchMedia('(min-width: 980px)').matches) return;
  f.src = `index.html?embed=1${stopId ? `&jump=env&id=${stopId}` : ''}&r=${Date.now()}`;
}

load();
