// What the sender can do with a letter once it has arrived: hold it back, make it the last one down,
// or throw it away.
import { json, route, bad, forbidden, hasKey, readBody, readLetters, writeLetter, removeLetter } from '../_lib.js';

export const POST = route(async (request) => {
  const p = await readBody(request);
  if (!hasKey(request, p)) return forbidden();

  const id = String(p.id || '');
  if (!/^[A-Za-z0-9]{1,32}$/.test(id)) return bad('No such letter.');

  if (p.delete) {
    await removeLetter(id);
    return json({ ok: true });
  }

  const letter = (await readLetters()).find((l) => l.id === id);
  if (!letter) return bad('No such letter.');
  if ('hidden' in p) letter.hidden = !!p.hidden;
  if ('last' in p) letter.last = !!p.last;
  await writeLetter(letter);
  return json({ ok: true });
});
