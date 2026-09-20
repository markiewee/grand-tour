// Everything, for the sender only: the open-now and hold-back switches, every letter including
// the ones being held back, and when each envelope was opened.
import { json, route, forbidden, hasKey, readOverrides, readLetters, readEvents } from './_lib.js';

export const GET = route(async (request) => {
  if (!hasKey(request)) return forbidden();
  const [overrides, letters, events] = await Promise.all([
    readOverrides(),
    readLetters(),
    readEvents(),
  ]);
  return json({ overrides, letters, events });
});
