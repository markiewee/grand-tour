// The pages carry the shape. The journey file carries the words.
//
// Anything with a data-j attribute gets filled from the journey, and anything the journey does
// not name is hidden rather than left showing the example's copy. That way a journey with no
// letterbox and no callback loses those lines instead of promising something that never arrives.
import { t } from './copy.js';

export function pick(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function bindCopy(root, journey) {
  for (const el of root.querySelectorAll('[data-j]')) {
    const v = pick(journey, el.dataset.j);
    const attr = el.dataset.jAttr;
    if (v == null || v === '') {
      // An element whose words are missing has nothing to say and is hidden. An element that was
      // only going to take an attribute, such as an input and its placeholder, is left alone: the
      // field still has to be there for somebody to type into.
      if (!attr) { el.hidden = true; el.setAttribute('aria-hidden', 'true'); }
      continue;
    }
    el.hidden = false; el.removeAttribute('aria-hidden');
    if (attr) el.setAttribute(attr, v);
    else el.textContent = v;
  }
  // The document title is not an element anyone sees, so it is set rather than hidden.
  if (typeof document !== 'undefined' && journey && journey.title) document.title = journey.title;
}

// data-j is a word from this journey. data-t is a word from this theme. A journey that sets a
// line in its own copy block has already won by the time t() is asked, so the two never fight.
export function bindTheme(root) {
  for (const el of root.querySelectorAll('[data-t]')) {
    const v = t(el.dataset.t);
    const attr = el.dataset.tAttr;
    if (attr) el.setAttribute(attr, v);
    else el.textContent = v;
  }
}
