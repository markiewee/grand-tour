// The paper card that opens out of a lantern: one of the answers, or a midnight letter.
import { sfx, audio } from './audio.js';

const gsap = window.gsap;
const $ = (s) => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let onClose = null, open = false;

export function setupMemo() {
  $('#memo').addEventListener('click', (e) => { if (e.target.closest('audio, video')) return; closeMemo(); });
}

// origin: where on screen the card grows from (the lantern it came out of)
export function openMemo(c, origin, closeFn) {
  audio(); sfx.chime(); open = true; onClose = closeFn || null;
  const thumb = $('#memoThumb'); thumb.hidden = !c.thumb; if (c.thumb) thumb.src = c.thumb;
  $('#memoWhen').textContent = c.when || '';
  $('#memoPlace').textContent = c.title || '';
  $('#memoQ').textContent = c.q || ''; $('#memoQ').hidden = !c.q;
  const A = $('#memoA'); A.textContent = c.a || c.empty || ''; A.classList.toggle('empty', !c.a); A.hidden = !(c.a || c.empty);
  const media = $('#memoMedia'); media.innerHTML = '';
  if (c.audio) { const el = document.createElement('audio'); el.controls = true; el.preload = 'metadata'; el.src = c.audio; media.appendChild(el); }
  if (c.video) { const el = document.createElement('video'); el.controls = true; el.playsInline = true; el.preload = 'metadata'; el.src = c.video; media.appendChild(el); }
  $('#memoHint').textContent = c.hint || 'Tap anywhere to let it go';
  const card = $('#memoCard');
  gsap.set('#memo', { visibility: 'visible' });
  const cr = card.getBoundingClientRect(); const dr = $('#device').getBoundingClientRect();
  if (origin) card.style.transformOrigin = `${origin.x - (cr.left - dr.left)}px ${origin.y - (cr.top - dr.top)}px`;
  gsap.to('#memoScrim', { opacity: 1, duration: .45 });
  gsap.fromTo(card, { scale: .08, opacity: 0 }, { scale: 1, opacity: 1, duration: reduced ? .01 : .6, ease: 'expo.out' });
}

export function closeMemo() {
  if (!open) return; open = false;
  document.querySelectorAll('#memoMedia audio, #memoMedia video').forEach((m) => m.pause());
  gsap.to('#memoCard', { scale: .08, opacity: 0, duration: reduced ? .01 : .4, ease: 'power3.in' });
  gsap.to('#memoScrim', { opacity: 0, duration: .4, onComplete: () => gsap.set('#memo', { visibility: 'hidden' }) });
  if (onClose) { const f = onClose; onClose = null; f(); }
}
export const memoOpen = () => open;
