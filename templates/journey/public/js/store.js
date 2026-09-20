// What lives on the traveller's phone (opened envelopes, their answers) and what comes from the
// server (envelopes the sender opened early or held back, the midnight letters).
import { now, rehearsing } from './clock.js';

// a rehearsal keeps its own saved state and never reports to the server, so it can't touch the real trip
export const LIVE_KEY = 'ga_state_v1', REHEARSAL_KEY = 'ga_state_rehearse_v1';
const KEY = rehearsing() ? REHEARSAL_KEY : LIVE_KEY;
export const state = { opened: {}, answers: {}, firstOpen: 0, geo: false, returned: false, overrides: {}, letters: [], near: {} };

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) Object.assign(state, { opened: s.opened || {}, answers: s.answers || {}, firstOpen: s.firstOpen || 0, geo: !!s.geo, returned: !!s.returned });
  } catch (e) { /* storage blocked: the trip still runs, it just forgets on reload */ }
  return state;
}
export function save(key = KEY) {
  try {
    localStorage.setItem(key, JSON.stringify({ opened: state.opened, answers: state.answers, firstOpen: state.firstOpen, geo: state.geo, returned: state.returned }));
  } catch (e) { /* see load() */ }
}
export function markOpened(id) {
  if (!state.opened[id]) { state.opened[id] = now(); save(); postEvent('opened', id); }
}
export function setAnswer(id, text) {
  state.answers[id] = { text, at: now() }; save(); postEvent('answered', id);
}
export function resetAll() {
  try { localStorage.removeItem(KEY); } catch (e) {}
  Object.assign(state, { opened: {}, answers: {}, firstOpen: 0, geo: false, returned: false });
}

// The server is optional: on a plain static host the app still runs on time alone.
export async function fetchRemote() {
  try {
    // The server only honours a rehearsal time from someone holding the key, so the key is passed
    // on when this phone has one. It can be in the address, or saved by the key page on the sender's
    // phone, which is how the rehearsal buttons move the whole journey. The traveller's phone has
    // neither, so the
    // server answers on real time and a ?t= does nothing, which keeps the letters shut.
    const q = `t=${Math.round(now())}` + (key() ? `&k=${encodeURIComponent(key())}` : '');
    const res = await fetch(`api/state?${q}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const r = await res.json();
    state.overrides = r.overrides || {}; state.letters = r.letters || [];
  } catch (e) { /* no server: the trip still runs on time alone */ }
  return state;
}

function key() {
  const q = new URLSearchParams(location.search).get('k');
  if (q) return q;
  try { return localStorage.getItem('ga_key') || ''; } catch (e) { return ''; }
}
export function postEvent(type, id) {
  if (rehearsing()) return;
  try {
    fetch('api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id, at: Math.round(now()) }), keepalive: true }).catch(() => {});
  } catch (e) {}
}
