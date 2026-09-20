// Journey time. Real time by default. The key page's rehearsal slider (shared through
// localStorage) or a ?t= in the address moves it, so the whole journey can be played through
// before anyone sets off.
//
// Every date on screen is shown in the place's own time, whatever the phone is set to, so the
// formatters take a zone. HOME is only the fallback for a caller that has none to hand, and the
// journey file overwrites it on load.
export let HOME = 'UTC';
export const setHomeZone = (tz) => { if (tz) HOME = tz; };
const REHEARSE = 'ga_rehearse';

function readRehearsal() {
  try { return JSON.parse(localStorage.getItem(REHEARSE) || 'null'); } catch (e) { return null; }
}

export function now() {
  const q = new URLSearchParams(location.search).get('t');
  if (q) { const t = Date.parse(q); if (!Number.isNaN(t)) return t; }
  const r = readRehearsal();
  if (r && typeof r.at === 'number') return r.at + (Date.now() - r.set) * (r.speed || 1);
  return Date.now();
}

export function rehearsing() {
  return !!new URLSearchParams(location.search).get('t') || !!readRehearsal();
}

export function setRehearsal(at, speed = 1) {
  try {
    if (at == null) localStorage.removeItem(REHEARSE);
    else localStorage.setItem(REHEARSE, JSON.stringify({ at, set: Date.now(), speed }));
  } catch (e) { /* private mode: rehearsal only lasts this page */ }
}

export function onClockChange(fn) {
  addEventListener('storage', (e) => { if (e.key === REHEARSE) fn(); });
}

const cache = {};
function parts(ms, tz, opts) {
  const k = tz + JSON.stringify(opts);
  const f = cache[k] || (cache[k] = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }));
  const o = {}; for (const p of f.formatToParts(ms)) o[p.type] = p.value; return o;
}
export const fmt = {
  time: (ms, tz = HOME) => { const p = parts(ms, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return `${p.hour}:${p.minute}`; },
  day: (ms, tz = HOME) => { const p = parts(ms, tz, { weekday: 'short', day: 'numeric', month: 'short' }); return `${p.weekday} ${p.day} ${p.month}`; },
  dayLong: (ms, tz = HOME) => { const p = parts(ms, tz, { weekday: 'long', day: 'numeric', month: 'long' }); return `${p.weekday} ${p.day} ${p.month}`; },
  ymd: (ms, tz = HOME) => { const p = parts(ms, tz, { year: 'numeric', month: '2-digit', day: '2-digit' }); return `${p.year}-${p.month}-${p.day}`; },
};
