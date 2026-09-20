// What the traveller's phone asks for on every load: the envelopes the sender opened early or held
// back, and, once the journey's midnight moment has passed, the letters.
import { json, route, hasKey, readOverrides, readLetters, publicLetter, MIDNIGHT_MS, DEMO, DEMO_LETTERS, NO_STORE } from './_lib.js';

export const GET = route(async (request) => {
  const url = new URL(request.url);

  // Only the key may move the clock. Without it a ?t= in the address is ignored and the server uses
  // real time, so the traveller cannot reach the letters early by typing a date into the address.
  // A journey marked as a demo is the exception, and it is the whole point of one: there is nobody
  // to spoil the surprise for, and a visitor who cannot skip ahead sees one envelope out of ten.
  const asked = Number(url.searchParams.get('t'));
  const mayMoveTheClock = DEMO || hasKey(request);
  const now = mayMoveTheClock && Number.isFinite(asked) && asked > 0 ? asked : Date.now();

  const demoOnly = DEMO && NO_STORE;
  const overrides = demoOnly ? {} : await readOverrides();

  let letters = [];
  if (MIDNIGHT_MS && now >= MIDNIGHT_MS) {
    letters = demoOnly ? DEMO_LETTERS.slice()
      : (await readLetters()).filter((l) => !l.hidden).map(publicLetter);
    letters.sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0) || (a.at || 0) - (b.at || 0));
  }

  return json({ overrides, letters });
});
