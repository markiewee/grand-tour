// The words. Three layers, lowest first: the base copy file, the theme's own lines, and the
// journey file, which always wins. Only the third is loaded here as a separate thing: the first
// two were merged into public/data/theme.json when the theme was applied.
import { bindTheme } from './bind.js';

let WORDS = {};
let RISE = { a: 'a lantern', one: 'lantern', many: 'lanterns' };

export function setCopy(theme, journey) {
  WORDS = { ...(theme && theme.copy), ...((journey && journey.copy) || {}) };
  if (theme && theme.rise) RISE = theme.rise;
}

export const rise = () => RISE;

// A missing key shows itself rather than printing nothing, because an empty button is harder to
// spot in a rehearsal than a visible key name.
export function t(key, vars) {
  let line = WORDS[key];
  if (line == null) return `[${key}]`;
  if (vars) for (const [k, v] of Object.entries(vars)) line = line.split(`{${k}}`).join(v);
  return line;
}

export async function loadTheme(root, journey) {
  let theme = null;
  try {
    theme = await (await fetch('data/theme.json', { cache: 'no-cache' })).json();
  } catch (e) {
    // No theme file. Every word then prints as its own key, which is not a degraded app so much
    // as a visibly broken one, and it is meant to look broken: `journey check` calls a missing
    // theme an error, and the alternative is a blank screen nobody can diagnose from a photo.
  }
  setCopy(theme, journey);
  if (root) bindTheme(root);
  return theme;
}
