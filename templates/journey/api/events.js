// When an envelope was opened and whether its question was answered. Never the answer itself:
// those words stay on the traveller's phone. This is only so the sender can see the journey being
// walked, not read over their shoulder.
import { json, route, bad, readBody, addEvent } from './_lib.js';

export const POST = route(async (request) => {
  const e = await readBody(request);
  if (!/^[a-z0-9]{1,24}$/.test(String(e.id || '')) || !['opened', 'answered'].includes(e.type)) {
    return bad('Bad event');
  }
  const at = Number(e.at);
  await addEvent(e.id, e.type, Math.round(Number.isFinite(at) && at > 0 ? at : Date.now()));
  return json({ ok: true });
});
