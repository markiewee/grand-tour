// The sealed envelope: hold the wax seal until the gold ring closes, the seal cracks, the flap swings
// open on its lotus lining, and a letter folded in thirds comes out, unfolds and becomes the page.
import { sfx, audio } from './audio.js';
import { look } from './sky.js';

const gsap = window.gsap;
const $ = (s) => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const SEAL_SVG = (k) => `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <filter id="edge${k}" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="sheen${k}" x="-15%" y="-15%" width="130%" height="130%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.8" result="b"/>
      <feSpecularLighting in="b" surfaceScale="3.2" specularConstant=".85" specularExponent="18" lighting-color="color-mix(in srgb, var(--gold-soft) 40%, white)" result="s">
        <fePointLight x="26" y="18" z="70"/>
      </feSpecularLighting>
      <feComposite in="s" in2="SourceAlpha" operator="in" result="si"/>
      <feComposite in="SourceGraphic" in2="si" operator="arithmetic" k1="0" k2="1" k3=".6" k4="0"/>
    </filter>
    <radialGradient id="wax${k}" cx="40%" cy="36%" r="72%">
      <stop offset="0" stop-color="color-mix(in srgb, var(--red) 81%, white)"/><stop offset=".55" stop-color="var(--red)"/><stop offset="1" stop-color="color-mix(in srgb, var(--red) 59%, black)"/>
    </radialGradient>
    <linearGradient id="goldg${k}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="color-mix(in srgb, var(--gold-soft) 72%, white)"/><stop offset=".5" stop-color="var(--gold)"/><stop offset="1" stop-color="color-mix(in srgb, var(--gold) 70%, black)"/>
    </linearGradient>
  </defs>
  <g filter="url(#sheen${k})">
    <circle cx="50" cy="50" r="41" fill="url(#wax${k})" filter="url(#edge${k})"/>
    <circle cx="50" cy="50" r="29" fill="none" stroke="color-mix(in srgb, var(--red) 69%, black)" stroke-width="2.4" opacity=".75"/>
    <circle cx="50" cy="50" r="29" fill="none" stroke="color-mix(in srgb, var(--red) 74%, white)" stroke-width=".8" opacity=".5" transform="translate(-.6 -.6)"/>
    <path d="M55 32 A19 19 0 1 0 55 68 A24 24 0 0 1 55 32 Z" fill="url(#goldg${k})" stroke="color-mix(in srgb, var(--gold) 52%, black)" stroke-width=".6"/>
    <circle cx="62" cy="40" r="1.9" fill="url(#goldg${k})"/><circle cx="66" cy="50" r="1.3" fill="url(#goldg${k})"/><circle cx="61" cy="59" r="1.6" fill="url(#goldg${k})"/>
  </g>
</svg>`;

const C = 2 * Math.PI * 60;
const HOLD_SECONDS = 1.15;
const SEALED_CAP = .34;
let hold = { p: 0, down: false, done: false, raf: 0, last: 0, refused: false };
let current = null, ready = false, handlers = {}, openTl = null, openTl2 = null;
export let envTilt = true;

export function setupEnvelope(h) {
  handlers = h;
  $('#halfL').innerHTML = SEAL_SVG('a');
  $('#halfR').innerHTML = SEAL_SVG('b');
  $('#ringFill').style.strokeDasharray = C;
  const seal = $('#seal');
  seal.addEventListener('pointerdown', (e) => {
    if (hold.done) return; e.preventDefault(); try { seal.setPointerCapture(e.pointerId); } catch (err) {}
    audio(); hold.down = true; hold.refused = false;
    gsap.to('#hint', { opacity: .35, duration: .3 });
    if (!hold.raf) { hold.last = 0; hold.raf = requestAnimationFrame(loop); }
  });
  const release = () => { if (!hold.down) return; hold.down = false; gsap.to('#hint', { opacity: 1, duration: .3 }); };
  seal.addEventListener('pointerup', release); seal.addEventListener('pointercancel', release); seal.addEventListener('lostpointercapture', release);
  seal.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && ready && !hold.done) { e.preventDefault(); hold.done = true; setHold(1); crack(); } });
  // a tap while it opens hurries it along
  $('#env').addEventListener('click', (e) => {
    if (e.target.closest('#seal, .back')) return;
    if (openTl && openTl.isActive()) openTl.timeScale(3);
    if (openTl2 && openTl2.isActive()) openTl2.timeScale(3);
  });
  $('#envBack').addEventListener('click', () => { if (!hold.done) handlers.onBack(); });
  const tiltEl = $('#tilt');
  handlers.sky.frameHooks.push(() => {
    if (envTilt && $('#env').classList.contains('on')) tiltEl.style.transform = `rotateY(${(look.x * 7).toFixed(2)}deg) rotateX(${(-look.y * 5).toFixed(2)}deg)`;
  });
  reset();
}

function setHold(p) {
  hold.p = p; $('#ringFill').style.strokeDashoffset = C * (1 - p);
  const shake = p > .55 && !reduced ? (p - .55) * 3.2 : 0;
  gsap.set('#halfL, #halfR', { x: (Math.random() - .5) * shake, y: (Math.random() - .5) * shake, scale: hold.down ? .955 + p * .02 : 1 });
  gsap.set('#aura', { opacity: p * .9, scale: .9 + p * .25 });
}
function loop(ts) {
  const dt = hold.last ? (ts - hold.last) / 1000 : 0; hold.last = ts;
  if (hold.done) return;
  let p = hold.p + (hold.down ? dt / HOLD_SECONDS : -dt / .35);
  p = Math.max(0, Math.min(1, p));
  if (!ready && p >= SEALED_CAP) { p = SEALED_CAP; if (!hold.refused) refuse(); }
  setHold(p);
  if (p >= 1) { hold.done = true; crack(); return; }
  if (hold.down || p > 0) hold.raf = requestAnimationFrame(loop); else { hold.raf = 0; hold.last = 0; gsap.set('#halfL, #halfR', { x: 0, y: 0, scale: 1 }); }
}
// before its time the seal will not give: a small shake and a line that says when
function refuse() {
  hold.refused = true; hold.down = false; sfx.nope();
  gsap.fromTo('#seal', { x: 0 }, { x: 7, duration: .06, yoyo: true, repeat: 5, ease: 'sine.inOut', onComplete: () => gsap.set('#seal', { x: 0 }) });
  $('#hintLbl').textContent = 'Not yet';
  gsap.fromTo('#hint', { opacity: .4 }, { opacity: 1, duration: .3 });
}

function crumbs() {
  const stage = $('#envelope'); const r = $('#seal').getBoundingClientRect(); const s = stage.getBoundingClientRect();
  for (let i = 0; i < 16; i++) {
    const d = document.createElement('div'); d.className = 'crumb'; stage.appendChild(d);
    gsap.set(d, { left: r.left - s.left + r.width / 2, top: r.top - s.top + r.height / 2, scale: .5 + Math.random() * .9, rotation: Math.random() * 360 });
    gsap.to(d, { duration: 1.1 + Math.random() * .5, physics2D: { velocity: 120 + Math.random() * 160, angle: -150 + Math.random() * 120, gravity: 620 }, opacity: 0, ease: 'none', onComplete: () => d.remove() });
  }
}

function liftLetter() {
  const L = $('#letter'); const r = L.getBoundingClientRect(); const d = $('#device').getBoundingClientRect();
  $('#letterStage').appendChild(L);
  gsap.set(L, { left: r.left - d.left, top: r.top - d.top, width: r.width, height: r.height, x: 0, y: 0, z: 0, rotation: 0 });
  return { w: r.width, h: r.height, x: r.left - d.left, y: r.top - d.top, dw: d.width, dh: d.height };
}
function foldShade(tl, panel, at, dur) {
  const sh = panel.querySelectorAll('.shade');
  tl.to(sh, { opacity: .34, duration: dur / 2, ease: 'sine.in' }, at).to(sh, { opacity: 0, duration: dur / 2, ease: 'sine.out' }, at + dur / 2);
}
function bringLetter() {
  const g = liftLetter();
  const s1 = g.dw * .84 / g.w;
  const s2 = Math.max(g.dw / g.w, g.dh / (3 * g.h)) * 1.01;
  const cx = (g.dw - g.w) / 2 - g.x, cy = (g.dh - g.h) / 2 - g.y;
  const tl = gsap.timeline(); openTl2 = tl;
  tl.to('#stage', { y: '+=70', scale: .9, opacity: 0, duration: .75, ease: 'power2.in' }, 0)
    .fromTo('#letter', { rotationX: 0 }, { rotationX: 10, duration: .4, ease: 'sine.out', yoyo: true, repeat: 1 }, 0)
    .to('#letter', { x: cx, y: cy, scale: s1, duration: .85, ease: 'power3.inOut' }, 0)
    .add(() => sfx.fold(), .8)
    .to('#lpTop', { rotationX: 0, z: 0, duration: .75, ease: 'power2.inOut' }, .8);
  foldShade(tl, $('#lpTop'), .8, .75);
  tl.add(() => sfx.fold(), 1.38)
    .to('#lpBot', { rotationX: 0, z: 0, duration: .75, ease: 'power2.inOut' }, 1.38);
  foldShade(tl, $('#lpBot'), 1.38, .75);
  tl.to('#letter', { scale: s2, duration: .7, ease: 'power2.inOut' }, 2.2)
    // the page is already underneath; the letter lifts away to show it
    .add(() => handlers.onReveal(current), 2.85)
    .to('#letterStage', { opacity: 0, duration: .45, ease: 'power1.inOut' }, 2.9)
    .add(() => handlers.onDone(current), 3.4);
  return tl;
}

export function crack() {
  handlers.onCrack && handlers.onCrack(current);
  if (reduced) {
    sfx.crack();
    handlers.onReveal(current);
    gsap.to('#env', { opacity: 0, duration: .3, onComplete: () => handlers.onDone(current) });
    return;
  }
  sfx.crack(); envTilt = false; gsap.to('#tilt', { rotationX: 0, rotationY: 0, duration: .4 });
  const envH = $('#envelope').getBoundingClientRect().height;
  const tl = gsap.timeline(); openTl = tl;
  tl.set('#crack', { opacity: 1 })
    .to('#crack', { opacity: 0, duration: .5, ease: 'power2.in' }, .08)
    .to('#ringFill, .ring .track', { opacity: 0, duration: .25 }, 0)
    .add(crumbs, .02)
    .to('#halfL', { x: -30, y: 70, rotation: -28, opacity: 0, duration: 1.0, ease: 'power2.in' }, .12)
    .to('#halfR', { x: 34, y: 64, rotation: 24, opacity: 0, duration: 1.0, ease: 'power2.in' }, .12)
    .to('#aura', { opacity: 0, duration: .6 }, .1)
    .to('#hint, #envHead, #envBack', { opacity: 0, duration: .4 }, .2)
    .add(() => sfx.paper(), .42)
    .to('#flapShadow', { opacity: 0, duration: .3 }, .42)
    .to('#flap', { rotationX: 180, duration: 1.0, ease: 'power3.inOut' }, .42)
    .set('#flap', { z: -2 }, .95)
    .to('#glowIn', { opacity: 1, duration: .9, ease: 'power2.out' }, .95)
    .add(() => sfx.slide(), 1.3)
    .to('#stage', { y: envH * .34, duration: 1.1, ease: 'power2.inOut' }, 1.25)
    .fromTo('#letterWrap', { yPercent: 0 }, { yPercent: -114, duration: 1.1, ease: 'power2.inOut' }, 1.3)
    .fromTo('#letterWrap', { rotation: 0 }, { rotation: -1.4, duration: .55, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 1.3)
    .add(() => { bringLetter(); }, 2.42);
  return tl;
}

// put everything back so the same envelope can carry the next letter
export function reset() {
  if (openTl) openTl.kill(); if (openTl2) openTl2.kill(); openTl = openTl2 = null;
  const L = $('#letter'); $('#letterWrap').appendChild(L);
  gsap.set([L, '#letterWrap', '#stage', '#flap', '#flapShadow', '#glowIn', '#halfL', '#halfR', '#aura', '#crack', '#seal', '#hint', '#envHead', '#envBack', '#letterStage', '#env', '#tilt', '#ringFill', '.ring .track', '#lpTop', '#lpBot'], { clearProps: 'all' });
  document.querySelectorAll('#letter .shade').forEach((s) => gsap.set(s, { clearProps: 'all' }));
  document.querySelectorAll('.crumb').forEach((c) => c.remove());
  gsap.set('#lpTop', { rotationX: -180, z: 2 });
  gsap.set('#lpBot', { rotationX: 180, z: 1 });
  gsap.set('#flap', { z: .5 });
  $('#ringFill').style.strokeDasharray = C; $('#ringFill').style.strokeDashoffset = C;
  cancelAnimationFrame(hold.raf);
  hold = { p: 0, down: false, done: false, raf: 0, last: 0, refused: false };
  envTilt = true;
}

export function showEnvelope(stop, isReady, labels) {
  reset();
  current = stop; ready = isReady;
  $('#envLbl').textContent = labels.when;
  $('#envPlace').textContent = labels.place;
  $('#hintLbl').textContent = isReady ? 'Press and hold the seal' : 'Sealed';
  $('#hintSub').textContent = labels.hint;
  $('#seal').setAttribute('aria-label', isReady ? 'Press and hold to open' : 'Sealed until its time');
  document.getElementById('device').style.setProperty('--letter-in', stop.kind === 'midnight' ? 'var(--night)' : stop.kind === 'book' ? 'color-mix(in srgb, var(--paper) 90%, black)' : 'var(--paper)');
}

// QA: jump straight into the middle of the opening
export function seekOpening(t) {
  hold.done = true; setHold(1);
  const a = crack(); if (!a) return;
  a.pause(); a.time(Math.min(t, 2.42) + (t >= 2.42 ? .001 : 0));
  if (t >= 2.42 && openTl2) { openTl2.pause(); openTl2.time(t - 2.42); }
}
