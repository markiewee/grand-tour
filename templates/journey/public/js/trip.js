// The journey: one file, read from data/trip.json. It holds the framing copy, up to three named
// moments, and a stop per envelope. Every moment is optional, because a journey that is not built
// around a birthday has no midnight, no letterbox and no date to bring the first answer back on.
import { now, setHomeZone } from './clock.js';

let TRIP = null;

// Pure, so it can be tested without a browser. See qa/journey.test.mjs.
export function parseJourney(raw) {
  const j = { ...(raw.journey || {}) };
  const at = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
  const midnightAt = j.midnight ? at(j.midnight.at) : null;
  return {
    ...j,
    midnightAt,
    callbackAt: j.callback ? at(j.callback.at) : null,
    lettersCloseAt: j.midnight && j.midnight.closes ? at(j.midnight.closes) : midnightAt,
    hasLetterbox: Boolean(midnightAt && j.letterbox),
    tz: j.tz || 'UTC',
    tzCity: j.tzCity || '',
  };
}

export async function loadTrip() {
  const res = await fetch('data/trip.json', { cache: 'no-cache' });
  TRIP = await res.json();
  TRIP.stops = (TRIP.stops || []).map((s, i) => ({ ...s, n: s.n || i + 1 }));
  TRIP.stops.sort((a, b) => a.n - b.n);
  for (const s of TRIP.stops) s.at = Date.parse(s.opensAt);
  TRIP.j = parseJourney(TRIP);
  setHomeZone(TRIP.j.tz);
  return TRIP;
}
export const trip = () => TRIP;
export const journey = () => TRIP.j;
export const stops = () => TRIP.stops;
export const stopById = (id) => TRIP.stops.find((s) => s.id === id);
export const tzOf = (s) => s.tz || TRIP.j.tz;

// opened: it has been cracked. ready: its time has come, the traveller is there, or the sender
// opened it early. sealed: not yet. The sender can also hold one back.
export function statusOf(s, st) {
  if (st.opened[s.id]) return 'opened';
  const o = st.overrides[s.id];
  if (o === 'hold') return 'sealed';
  if (o === 'open') return 'ready';
  if (s.n === 1) return 'ready';                       // the first one opens straight away
  if (now() >= s.at) return 'ready';
  // being there opens it, but only near its time: several envelopes can share one front door
  if (st.near[s.id] && now() >= s.at - 90 * 60e3) return 'ready';
  return 'sealed';
}

export function nextStop(st) {
  return TRIP.stops.find((s) => !st.opened[s.id]) || null;
}

export function distanceM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
