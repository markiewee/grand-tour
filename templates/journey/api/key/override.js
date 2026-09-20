// Open an envelope before its hour, or hold one back after it. Anything else clears the override.
import { json, route, forbidden, hasKey, readBody, readOverrides, writeOverrides } from '../_lib.js';

export const POST = route(async (request) => {
  const p = await readBody(request);
  if (!hasKey(request, p)) return forbidden();
  const overrides = await readOverrides();
  if (p.mode === 'open' || p.mode === 'hold') overrides[p.id] = p.mode;
  else delete overrides[p.id];
  await writeOverrides(overrides);
  return json({ ok: true });
});
