// Midnight. One comes down for every letter in the letterbox, and the sender's comes last.
// The traveller taps one to read it, hear it or watch it.
//
// However many letters arrive, they all have to land on one phone screen. The grid used to be four
// across and simply added rows below the screen: at fifty letters, thirty five of them were out of
// reach and the last one landed fifty seconds in. layout() below fits the count to the space.
import { openMemo } from './memo.js';
import { journey } from './trip.js';
import { rise, t } from './copy.js';
import { sfx } from './audio.js';

const gsap = window.gsap;
const $ = (s) => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function setupMidnight(h) {
  $('#midDone').addEventListener('click', () => h.onDone());
}

// Fit however many there are into the band under the words, above the button. Returns the
// grid, how far to shrink each one, whether their names still fit, and how fast to drop them.
function layout(others, d) {
  const TOP = .575, BOT = .78;                  // the first and last row of everybody else
  const LAST = .745;                            // where the sender's own hangs when there is room
  if (!others) return { cols: 1, rows: 0, pitch: 0, top: TOP, left: .16, right: .84, scale: 1, names: true, step: .9, lastY: LAST };

  let best = null;
  for (let cols = Math.min(others, 4); cols <= Math.min(others, 14); cols++) {
    const rows = Math.ceil(others / cols);
    const pitch = rows > 1 ? Math.min(.095, (BOT - TOP) / (rows - 1)) : .095;
    // wider margins once it is crowded, since there is no room left to waste at the edges
    const left = cols > 6 ? .10 : .16, right = cols > 6 ? .90 : .84;
    const gapX = ((right - left) / Math.max(cols - 1, 1)) * d.width;
    const gapY = pitch * d.height;
    const scale = Math.min(1, gapX / 62, rows > 1 ? gapY / 66 : 1);
    if (!best || scale > best.scale) best = { cols, rows, pitch, left, right, scale };
  }

  const scale = Math.max(best.scale, .42);
  const bottomRow = TOP + (best.rows - 1) * best.pitch;
  return {
    ...best, top: TOP, scale,
    names: ((best.right - best.left) / Math.max(best.cols - 1, 1)) * d.width >= 66 && scale >= .8,
    // the sender's hangs alone under everyone else, never among them
    lastY: Math.min(.87, Math.max(LAST, bottomRow + .075)),
    // every one of them is down inside about eight seconds, however many there are
    step: others > 1 ? Math.min(.9, 7.5 / (others - 1)) : .9,
  };
}

export function showMidnight(letters, j) {
  const falls = $('#falls'); falls.innerHTML = '';
  if (j && j.midnight && j.midnight.title) $('#midTitle').textContent = j.midnight.title;
  $('#midSub').textContent = letters.length
    ? `${letters.length === 1 ? 'One letter' : `${letters.length} letters`} came down with the moon. Tap ${rise().a} to open it.`
    : 'The letters are still on their way. Come back to this envelope in a little while.';
  sfx.bell();
  const d = $('#device').getBoundingClientRect();
  const n = letters.length;
  const marks = letters.filter((l) => l.last).length;
  const others = n - marks;
  const plan = layout(others, d);
  let k = 0;
  letters.forEach((l, i) => {
    const el = document.createElement('button'); el.className = 'fall' + (l.last ? ' mark' : '');
    el.innerHTML = `<div class="lamp"></div><div class="who"></div>`;
    el.querySelector('.who').textContent = l.last ? `${l.from} · last` : l.from;
    el.setAttribute('aria-label', `Letter from ${l.from}`);
    // Once they are small the names would sit on top of each other, so the name is read by tapping.
    // The sender's own keeps its name whatever happens, because it is the one being looked for.
    if (!plan.names && !l.last) el.classList.add('nameless');
    el.style.setProperty('--s', l.last ? Math.max(plan.scale, .6) : plan.scale);
    falls.appendChild(el);
    let x, y;
    if (l.last) { x = .5; y = plan.lastY; }
    else {
      const row = Math.floor(k / plan.cols), idx = k % plan.cols;
      const inRow = Math.min(plan.cols, others - row * plan.cols);
      // Every row uses the same spacing and a short last row is centred. Stretching three of them
      // across the width of four put the last one of each row in the same column, so they landed
      // on top of each other at the right hand edge.
      const step = plan.cols > 1 ? (plan.right - plan.left) / (plan.cols - 1) : 0;
      x = plan.cols === 1 ? (plan.left + plan.right) / 2
        : plan.left + (plan.cols - inRow) * step / 2 + idx * step;
      const f = plan.right > plan.left ? (x - plan.left) / (plan.right - plan.left) : .5;
      y = plan.top + row * plan.pitch + Math.sin(f * Math.PI) * .03 * plan.scale;
      if (row % 2 && inRow === plan.cols) x = Math.min(plan.right + .02, x + step / 2);
      k++;
    }
    const restX = x * d.width, restY = y * d.height;
    gsap.set(el, { left: restX, top: -90, opacity: 0 });
    const delay = reduced ? 0 : (l.last ? n * plan.step + 1.2 : k * plan.step + .6);
    gsap.to(el, { top: restY, opacity: 1, duration: reduced ? .01 : 4.2, delay, ease: 'power2.out' });
    if (!reduced) gsap.to(el, { x: 9 * plan.scale, duration: 2.2 + (i % 3) * .4, yoyo: true, repeat: -1, ease: 'sine.inOut', delay });
    el.addEventListener('click', () => {
      el.classList.add('read');
      const r = el.getBoundingClientRect();
      openMemo({
        // The label and the title must not both be the name, which read as "From Sam / Sam".
        // The last letter's title is the journey's own, because not every journey has a birthday
        // in it and the engine has no business assuming one.
        when: l.last ? `From ${l.from}` : t('aLetter'),
        title: l.last ? ((journey().midnight || {}).letterTitle || t('lastLetter')) : l.from,
        a: l.text, audio: l.audio, video: l.video, hint: t('putItBack'),
      }, { x: r.left - d.left + r.width / 2, y: r.top - d.top + 28 });
    });
  });
}
