// What the checks need to know about whatever journey is sitting in this directory.
//
// These scripts used to name real stops and real dates from the one trip they were written for,
// which meant they only ever tested that trip. They now read the journey file and pick their own
// stops, so a forker can run them against their own journey on the first day.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const raw = JSON.parse(fs.readFileSync(new URL('../public/data/trip.json', import.meta.url), 'utf8'));
export const j = raw.journey || {};
export const stops = [...(raw.stops || [])].sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt));

const at = (v) => (v ? Date.parse(v) : null);
export const midnightAt = j.midnight ? at(j.midnight.at) : null;
export const callbackAt = j.callback ? at(j.callback.at) : null;

export const placed = stops.filter((s) => !s.kind);            // envelopes that belong to a place
export const withPoster = placed.filter((s) => s.poster);
export const withQuestion = placed.filter((s) => s.question);

// The one to try the sender's switches on: far enough in that earlier envelopes can be seeded as
// opened, and never the first, which is always ready anyway.
export const overridable = placed[Math.min(4, placed.length - 1)] || placed[placed.length - 1];
export const before = placed.slice(0, placed.indexOf(overridable));

// A moment on the same day as a stop, in that stop's own zone, offset by some minutes.
export function moment(stop, minutes = 0) {
  return new Date(Date.parse(stop.opensAt) + minutes * 60e3).toISOString();
}

// Playwright is not bundled with the engine, because most people running a journey never open it.
// Point GA_PLAYWRIGHT at an installation, or run `npm install --no-save playwright-core` here.
export async function chromium() {
  const hint = 'Install it with: npm install --no-save playwright-core';
  const path = process.env.GA_PLAYWRIGHT;
  if (path) return (await import(path)).chromium;
  try {
    return require('playwright-core').chromium;
  } catch (e) {
    throw new Error(`The checks need playwright-core and it is not installed. ${hint}`);
  }
}

export const CHROME = process.env.GA_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
