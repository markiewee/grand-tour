// Shared bits for the journey API: where things are kept, who is allowed to change them,
// and how a reply is shaped. server.py is the same API against the local disk; this one keeps
// everything in Vercel Blob so it survives between invocations.
//
// A blob store is public or private for its whole life, so there are two. Everything the traveller
// must not see early (the letters, and which envelopes the sender is holding back) lives in the
// private store and is read with useCache:false, so a change on the key page shows on their phone
// on the next load rather than a minute later. Only what friends record sits in the public store,
// because a phone has to stream a video straight from a URL. Letters are one blob each, so two
// friends posting in the same second can never overwrite each other.
//
// Both stores are addressed by their own token. The SDK checks an explicit token before anything in
// the environment, so there is no way for one store's credentials to reach the other.
import { get, put, del, list } from '@vercel/blob';

const stateToken = () => ({ token: process.env.BLOB_STATE_TOKEN });
export const mediaToken = () => ({ token: process.env.BLOB_MEDIA_TOKEN });

export { MIDNIGHT_MS, LETTERS_CLOSE_MS, HAS_LETTERBOX, DEMO, DEMO_LETTERS } from './_journey.js';

// A demo can be deployed with no file store at all, in which case it shows the letters written
// into the journey file. A real journey always has a store, and this is never true for it.
export const NO_STORE = !process.env.BLOB_STATE_TOKEN;

const OVERRIDES = 'state/overrides.json';
const LETTERS = 'letters/';
const EVENTS = 'events/';

export function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const bad = (message) => json({ error: message }, 400);
export const forbidden = () => json({ error: 'This page needs the key link.' }, 403);

// Any thrown error becomes a 500 with a plain message. The journey treats a failed /api/state as
// "no server" and carries on running the trip on time alone, which is the behaviour we want.
export function route(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (e) {
      console.error(e);
      return json({ error: 'Something went wrong here. Try again in a moment.' }, 500);
    }
  };
}

/* ---------------- the key ---------------- */

// Constant-time so a wrong token tells an attacker nothing about how wrong it was.
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// No KEY_TOKEN set means no key, not a key that opens everything.
export function hasKey(request, payload) {
  const wanted = process.env.KEY_TOKEN;
  if (!wanted) return false;
  const url = new URL(request.url);
  const given = (payload && payload.k) || url.searchParams.get('k') || request.headers.get('x-key');
  return sameToken(given || '', wanted);
}

export async function readBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw Object.assign(new Error('Send that as JSON.'), { badRequest: true });
  }
}

/* ---------------- blobs ---------------- */

async function readBlob(pathname, fallback) {
  const r = await get(pathname, { access: 'private', useCache: false, ...stateToken() });
  if (!r || !r.stream) return fallback;
  const text = await new Response(r.stream).text();
  return text ? JSON.parse(text) : fallback;
}

async function writeBlob(pathname, value) {
  await put(pathname, JSON.stringify(value, null, 1), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    ...stateToken(),
  });
}

const listState = (prefix) => list({ prefix, limit: 1000, ...stateToken() });

export const readOverrides = () => readBlob(OVERRIDES, {});
export const writeOverrides = (v) => writeBlob(OVERRIDES, v);

export async function readLetters() {
  const { blobs } = await listState(LETTERS);
  const letters = await Promise.all(blobs.map((b) => readBlob(b.pathname, null)));
  return letters.filter(Boolean).sort((a, b) => (a.at || 0) - (b.at || 0));
}

export const writeLetter = (letter) => writeBlob(LETTERS + letter.id + '.json', letter);
export const removeLetter = (id) => del(LETTERS + id + '.json', stateToken());

// One blob per event, so a phone firing two at once never loses one. Everything we need is in
// the name, so listing them is enough and we never have to open 50 files.
export async function addEvent(id, type, at) {
  await writeBlob(`${EVENTS}${at}-${type}-${id}.json`, { id, type, at });
}

export async function readEvents() {
  const { blobs } = await listState(EVENTS);
  return blobs
    .map((b) => {
      const m = /^events\/(\d+)-(opened|answered)-([a-z0-9]+)\.json$/.exec(b.pathname);
      return m ? { id: m[3], type: m[2], at: Number(m[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at);
}

// What the traveller is allowed to see: never the hidden ones, and the one marked last comes last.
export function publicLetter(l) {
  return { id: l.id, from: l.from, text: l.text, audio: l.audio, video: l.video, last: l.last, at: l.at };
}
