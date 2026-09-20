// A friend posting a letter into the letterbox. The voice note or video has already gone straight
// from their phone to Blob storage (a function can only take 4.5 MB of body, nowhere near a video),
// so all that arrives here is the name, the words, and the addresses of what they recorded.
import { head } from '@vercel/blob';
import { json, route, bad, readBody, writeLetter, mediaToken, HAS_LETTERBOX, DEMO, NO_STORE } from './_lib.js';

// Only an address in our own store, under media/, and only one that really exists. Otherwise a
// stranger could hand us any URL on the internet and have the traveller's phone load it.
async function checkMedia(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(String(value));
  } catch (e) {
    return false;
  }
  const host = url.hostname.endsWith('.public.blob.vercel-storage.com');
  if (url.protocol !== 'https:' || !host || !url.pathname.startsWith('/media/')) return false;
  try {
    await head(url.href, mediaToken());
  } catch (e) {
    return false;
  }
  return url.href;
}

export const POST = route(async (request) => {
  // A journey that named no midnight moment has nowhere for a letter to land, so the letterbox
  // is off rather than quietly collecting letters that never come down.
  if (!HAS_LETTERBOX) return json({ error: 'This journey has no letterbox.' }, 404);
  // A demo with no store has nowhere to put a letter, and saying so is kinder than
  // accepting one and dropping it.
  if (DEMO && NO_STORE) return json({ error: 'This is a demo, so letters are read but not kept.' }, 400);
  const p = await readBody(request);
  const from = String(p.from || '').trim().slice(0, 60);
  const text = String(p.text || '').trim().slice(0, 6000);
  if (!from) return bad('Add your name so they know who it is from.');

  const [audio, video] = await Promise.all([checkMedia(p.audio), checkMedia(p.video)]);
  if (audio === false || video === false) return bad('That recording did not arrive. Try sending it again.');
  if (!text && !audio && !video) return bad('Write something, or record a voice note or a video.');

  const letter = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 10),
    from,
    text,
    audio,
    video,
    last: false,
    hidden: false,
    at: Date.now(),
  };
  await writeLetter(letter);
  return json({ ok: true, id: letter.id });
});
