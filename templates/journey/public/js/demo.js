// A bar across the top of a demo journey, and nothing at all on a real one.
//
// A visitor who lands on someone's journey can only ever open the first envelope, because the rest
// are sealed until dates months away. That is correct for the person travelling and useless for
// anybody being shown the thing. So a journey marked `"demo": true` gets a row of buttons that
// move its clock, and fills in the envelopes before that point so the road is not nine blank dots.
//
// The server honours a moved clock only when the same flag is set in the generated config, which
// `adventure journey build` writes from the journey file and `adventure journey check` warns
// about. A journey somebody is actually travelling never has it.
import { setRehearsal } from './clock.js';
import { REHEARSAL_KEY, LIVE_KEY } from './store.js';

const ANSWERS = [
  'Somewhere I have not been before.',
  'That the quiet parts are the ones I remember.',
  'A morning with nothing booked in it.',
  'The long way round, every time.',
  'How far you can get on a slow train.',
];

export function setupDemo(journey, stops, state, save) {
  if (!journey.demo) return;
  const bar = document.getElementById('demoBar');
  if (!bar) return;
  bar.hidden = false;

  const marks = [];
  const days = [...new Set(stops.filter((s) => !s.kind).map((s) => s.day))].sort((a, b) => a - b);
  for (const day of days) {
    const first = stops.find((s) => s.day === day && !s.kind);
    marks.push({ label: `Day ${day}`, at: first.at + 60e3, upto: stops.indexOf(first) });
  }
  const midnight = stops.find((s) => s.kind === 'midnight');
  if (midnight) marks.push({ label: 'Midnight', at: midnight.at + 60e3, upto: stops.indexOf(midnight) });
  const book = stops.find((s) => s.kind === 'book');
  if (book) marks.push({ label: 'The book', at: book.at + 60e3, upto: stops.length });

  for (const m of marks) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = m.label;
    b.addEventListener('click', () => {
      // Everything before this point is treated as already lived through, so the road is filled in
      // and the sky has lanterns in it. Reloading is the honest way to restart every animation.
      const opened = {}, answers = {};
      stops.slice(0, m.upto).forEach((s, i) => {
        opened[s.id] = s.at + 30e3;
        if (s.question) answers[s.id] = { text: ANSWERS[i % ANSWERS.length], at: s.at + 60e3 };
      });
      Object.assign(state, { opened, answers, firstOpen: stops[0].at, returned: false });
      // Moving the clock puts the page into a rehearsal, and a rehearsal keeps its state under a
      // different key. Saving under the key this page started with would write it where the next
      // load is not going to look.
      save(REHEARSAL_KEY);
      setRehearsal(m.at, 1);
      location.replace(location.pathname);
    });
    bar.appendChild(b);
  }

  const reset = document.createElement('button');
  reset.type = 'button'; reset.className = 'demo-reset'; reset.textContent = 'Start over';
  reset.addEventListener('click', () => {
    Object.assign(state, { opened: {}, answers: {}, firstOpen: 0, returned: false });
    save(REHEARSAL_KEY); save(LIVE_KEY);
    setRehearsal(null);
    location.replace(location.pathname);
  });
  bar.appendChild(reset);
}
