// Inside the envelope: the poster prints plate by plate, then three lines on the place, the note
// (hold to read), and at about half the stops a question whose answer goes up into the sky.
import { sfx, audio } from './audio.js';
import { t } from './copy.js';

const gsap = window.gsap;
const $ = (s) => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PLATES = ['mist', 'jade', 'gold', 'red', 'ink'];
let current = null, handlers = {}, printTl = null;

export function setupStop(h) {
  handlers = h;
  $('#sendBtn').addEventListener('click', send);
  $('#doneBtn').addEventListener('click', () => handlers.onDone(current));
  $('#stopBack').addEventListener('click', () => handlers.onDone(current));
  $('#answer').addEventListener('input', () => { $('#answer').placeholder = 'Write it here…'; });
}

export function renderStop(stop, ctx) {
  current = stop;
  if (printTl) printTl.kill();
  const scene = $('#stop'); scene.scrollTop = 0;
  gsap.set(['#q', '#q > *', '#press', '#press img', '#chips .chip', '#stop .reveal', '#fly'], { clearProps: 'all' });
  $('#q').style.visibility = '';
  document.querySelectorAll('#press img[data-plate]').forEach((img, i) => { img.src = `img/plates/${stop.poster}_${PLATES[i]}.png`; });
  const fin = $('#finalPoster'); fin.alt = stop.alt || `Poster: ${stop.place}`;
  // a poster that is not ready yet shows the envelope's lotus lining instead of a broken frame
  fin.onerror = () => { fin.onerror = null; fin.src = 'img/art/liner.jpg'; document.querySelectorAll('#press img[data-plate]').forEach((im) => { im.style.visibility = 'hidden'; }); };
  document.querySelectorAll('#press img[data-plate]').forEach((im) => { im.style.visibility = ''; im.onerror = () => { im.style.visibility = 'hidden'; }; });
  fin.src = `img/posters/${stop.poster}.jpg`;
  $('#plateLbl').innerHTML = '&nbsp;';
  $('#stopLbl').textContent = ctx.when;
  $('#stopPlace').textContent = stop.place;
  $('#stopLede').textContent = stop.lede || '';
  $('#stopCaption').textContent = stop.caption || '';
  $('#stopCaption').hidden = !stop.caption;
  const answer = ctx.answer;
  $('#q').hidden = !stop.question;
  $('#qText').textContent = stop.question || '';
  $('#qAsk').hidden = !!answer; $('#qDone').hidden = !answer;
  $('#qAnswer').textContent = answer || '';
  $('#answer').value = '';
  const pending = stop.question && !answer;
  $('#doneBtn').textContent = pending ? t('answerLater') : t('back');
  $('#doneBtn').className = pending ? 'btn quiet' : 'btn';
  if (ctx.animate) printPoster(); else showPrinted();
}

function showPrinted() {
  $('#finalPoster').style.opacity = 1;
  document.querySelectorAll('#press img[data-plate]').forEach((im) => { im.style.opacity = 0; });
  document.querySelectorAll('#chips .chip').forEach((c) => { c.style.opacity = 1; c.style.transform = 'scale(1)'; });
  $('#plateLbl').textContent = 'Printed';
  document.querySelectorAll('#stop .reveal').forEach((r) => { r.style.opacity = 1; r.style.transform = 'none'; });
}

export function printPoster() {
  if (reduced) { showPrinted(); return; }
  const plates = [...document.querySelectorAll('#press img[data-plate]')]; const chips = [...document.querySelectorAll('#chips .chip')];
  const lbl = $('#plateLbl');
  const tl = gsap.timeline({ delay: .35 }); printTl = tl;
  plates.forEach((img, i) => {
    const at = i * .62;
    tl.add(() => { lbl.textContent = `Plate ${i + 1} of 5 · ${PLATES[i]}`; sfx.press(); }, at)
      .fromTo(img, { opacity: 0, x: (Math.random() - .5) * 14, y: (Math.random() - .5) * 10 }, { opacity: 1, duration: .16, ease: 'power1.out' }, at)
      .to(img, { x: 0, y: 0, duration: .55, ease: 'expo.out' }, at + .05)
      .fromTo('#press', { scaleY: .994 }, { scaleY: 1, duration: .25, ease: 'power2.out' }, at)
      .to(chips[i], { opacity: 1, scale: 1, duration: .3, ease: 'back.out(3)' }, at);
  });
  tl.to('#finalPoster', { opacity: 1, duration: .9, ease: 'power2.inOut' }, plates.length * .62 + .15)
    .add(() => { lbl.textContent = 'Printed'; }, plates.length * .62 + .15)
    .to('#stop .reveal', { opacity: 1, y: 0, duration: .7, stagger: .09, ease: 'power3.out' }, plates.length * .62 + .5);
}
export function finishPrinting() { if (printTl) printTl.progress(1); }

// the question card folds up and floats off into the sky
function send() {
  const text = $('#answer').value.trim();
  if (!text) {
    $('#answer').placeholder = 'Write a few words first';
    gsap.fromTo('#answer', { x: 0 }, { x: 6, duration: .06, yoyo: true, repeat: 5, onComplete: () => gsap.set('#answer', { x: 0 }) });
    return;
  }
  audio(); $('#answer').blur();
  const stop = current;
  handlers.onAnswer(stop, text);
  const q = $('#q'); const r = q.getBoundingClientRect(); const d = $('#device').getBoundingClientRect();
  const fly = $('#fly');
  const cx = r.left - d.left + r.width / 2, cy = r.top - d.top + r.height / 2;
  if (reduced) { handlers.onFlown(stop); return; }
  const tl = gsap.timeline();
  tl.to('#q > *', { opacity: 0, duration: .25 })
    .to(q, { width: 44, height: 56, x: (r.width - 44) / 2, borderRadius: '46% 46% 48% 48%', background: '#e98b3a', boxShadow: '0 0 40px 14px rgba(255,170,80,.6)', duration: .6, ease: 'power3.inOut' }, .15)
    .add(() => { gsap.set(fly, { left: cx, top: cy - r.height / 2 + 28, opacity: 1, x: 0, scale: 1 }); q.style.visibility = 'hidden'; sfx.chime(); }, .78)
    .add(() => handlers.onLeaving(stop), .8)
    .to(fly, { top: d.height * .2, left: d.width * .5, scale: .45, duration: 3.0, ease: 'power1.inOut' }, 1.3)
    .to(fly, { x: 10, duration: .8, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 1.3)
    .to(fly, { opacity: 0, duration: .6 }, 3.8)
    .add(() => handlers.onFlown(stop), 3.85);
}
