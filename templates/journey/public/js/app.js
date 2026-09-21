import { now, fmt, onClockChange, rehearsing } from './clock.js';
import { loadTrip, trip, journey, stops, stopById, statusOf, nextStop, tzOf, distanceM } from './trip.js';
import { bindCopy } from './bind.js';
import { loadTheme, t, rise } from './copy.js';
import { setupDemo } from './demo.js';
import { projectStops, cityLabels } from './map.js';
import { state, load, save, markOpened, setAnswer, fetchRemote, resetAll } from './store.js';
import { initSky, enableTilt } from './sky.js';
import { setupEnvelope, showEnvelope, seekOpening } from './envelope.js';
import { setupStop, renderStop, finishPrinting } from './stop.js';
import { setupMemo, openMemo, closeMemo, memoOpen } from './memo.js';
import { setupMidnight, showMidnight } from './midnight.js';
import { setupBook, renderBook } from './book.js';
import { audio, sfx } from './audio.js';

const gsap = window.gsap;
gsap.registerPlugin(window.Physics2DPlugin);
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (params.get('embed')) document.body.classList.add('embed');
if (params.get('reset')) resetAll();

let sky = null;
const canvas = $('#sky');

/* ---------------- paper grain, drawn once ---------------- */
(function makeGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 220;
  const x = c.getContext('2d'); const img = x.createImageData(220, 220);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.random() * 55;
    img.data[i] = v; img.data[i + 1] = v * .97; img.data[i + 2] = v * .9; img.data[i + 3] = Math.random() < .5 ? 30 : 12;
  }
  x.putImageData(img, 0, 0);
  const url = c.toDataURL();
  document.querySelectorAll('[data-grain]').forEach((el) => { el.style.backgroundImage = `url(${url})`; });
})();

/* ---------------- words ---------------- */
const dayOf = (s) => `Day ${s.day}`;
function whenLabel(s) { return `${dayOf(s)} · ${fmt.time(s.at, tzOf(s))}`; }
function opensLine(s) {
  const time = fmt.time(s.at, tzOf(s));
  const sameDay = fmt.ymd(now(), tzOf(s)) === fmt.ymd(s.at, tzOf(s));
  const when = sameDay ? time : `${time} on ${fmt.day(s.at, tzOf(s))}`;
  if (s.kind === 'midnight') {
    const where = journey().tzCity ? ` in ${journey().tzCity}` : '';
    return sameDay || now() > s.at - 36e5 * 20 ? `Opens at midnight${where}.` : `Opens at midnight on ${fmt.day(s.at, tzOf(s))}.`;
  }
  if (s.kind === 'book') return `Opens on the way home, at ${when}.`;
  return s.geo ? `Opens when you get there, or at ${when}.` : `Opens at ${when}.`;
}
function tripDayLabel() {
  const at = now(), all = stops();
  const zone = journey().tz;
  // Count whole days in the journey's own zone. Doing it in milliseconds gets the answer wrong
  // by one whenever the traveller's phone is in a different zone from the journey.
  const midday = (ms) => Date.parse(`${fmt.ymd(ms, zone)}T12:00:00Z`);
  const d = Math.round((midday(at) - midday(all[0].at)) / 864e5) + 1;
  if (d < 1) return fmt.day(at, zone);
  if (d > all[all.length - 1].day) return 'Home';
  return `Day ${d} · ${fmt.day(at, zone)}`;
}

/* ---------------- scenes ---------------- */
let scene = '';
function show(id, { fade = true } = {}) {
  scene = id;
  document.querySelectorAll('.scene').forEach((s) => s.classList.toggle('on', s.id === id));
  const el = document.getElementById(id);
  gsap.killTweensOf(el, 'opacity');
  if (fade && !reduced) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: .45, ease: 'power1.out' }); else gsap.set(el, { opacity: 1 });
  gsap.to(canvas, { opacity: id === 'env' ? .35 : 1, duration: .6 });
  if (id === 'home') renderHome();
}

/* ---------------- the sky: one light for every answer ---------------- */
function syncRisen() {
  const have = new Set(sky.risen.map((L) => L.key));
  // A light keeps its place in the sky for the whole journey, so the slot is fixed by where the
  // envelope sits among the ones that ask a question. Numbering by its place on the road counted to
  // 25, further than there are places in the sky, and the count wrapped.
  const asking = stops().filter((q) => q.question);
  for (const s of stops()) {
    if (!state.answers[s.id] || have.has(s.id)) continue;
    const i = asking.findIndex((q) => q.id === s.id);
    sky.addRise(s.id, i < 0 ? asking.length : i, ((s.n * 0.618) % 1));
  }
}
function riseContent(L) {
  const s = stopById(L.key); const a = state.answers[s.id];
  return { thumb: s.poster ? `img/thumbs/${s.poster}.jpg` : null, when: `${fmt.day(s.at, tzOf(s))} · ${fmt.time(a.at, tzOf(s))}`, title: s.place, q: s.question, a: a.text };
}

/* ---------------- the route ---------------- */
function spline(pts) {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]} ${pts[0][1]}` : '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}
const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
let pulseTween = null;

function renderRoute() {
  const all = stops();
  const pts = projectStops(all);
  $('#road').setAttribute('d', spline(pts));
  const openedN = all.filter((s) => state.opened[s.id]).map((s) => s.n);
  const lastN = openedN.length ? Math.max(...openedN) : 0;
  $('#roadDone').setAttribute('d', spline(pts.filter((_, i) => all[i].n <= lastN)));
  const g = $('#stops'); g.innerHTML = ''; const defs = $('#routeDefs'); defs.innerHTML = '';
  const nx = nextStop(state);
  const latest = all.filter((s) => state.opened[s.id]).sort((a, b) => state.opened[b.id] - state.opened[a.id])[0];
  for (const s of all) {
    const [x, y] = pts[all.indexOf(s)]; const st = statusOf(s, state);
    if (st === 'opened') {
      const r = latest && latest.id === s.id ? 15 : 11;
      if (s.poster) {
        const cp = svg('clipPath', { id: `cp-${s.id}` }); cp.appendChild(svg('circle', { cx: x, cy: y, r })); defs.appendChild(cp);
        g.appendChild(svg('image', { href: `img/thumbs/${s.poster}.jpg`, x: x - r, y: y - r * 1.34, width: r * 2, height: r * 2.68, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#cp-${s.id})` }));
      } else {
        g.appendChild(svg('circle', { cx: x, cy: y, r: r - 2, fill: s.kind === 'midnight' ? '#efe3c6' : '#2e6a5c' }));
      }
      g.appendChild(svg('circle', { class: 'ring', cx: x, cy: y, r: r + .5 }));
    } else if (nx && s.id === nx.id) {
      const pulse = svg('circle', { cx: x, cy: y, r: 11, fill: 'none', stroke: '#d6a13f', 'stroke-width': 1.6, id: 'pulse' });
      g.appendChild(pulse);
      g.appendChild(svg('circle', { cx: x, cy: y, r: 6.5, fill: st === 'ready' ? '#b3342b' : 'rgba(179,52,43,.35)', stroke: '#f0cf86', 'stroke-width': 1.6 }));
    } else {
      g.appendChild(svg('circle', { class: 'stop-dot', cx: x, cy: y, r: s.kind ? 3.4 : 2.6 }));
    }
    const hit = svg('circle', { class: 'stop-hit', cx: x, cy: y, r: 14, 'data-id': s.id, role: 'button', 'aria-label': st === 'opened' ? s.place : t('sealedLabel') });
    g.appendChild(hit);
  }
  if (pulseTween) pulseTween.kill();
  if (!reduced && $('#pulse')) pulseTween = gsap.fromTo('#pulse', { attr: { r: 11 }, opacity: 1 }, { attr: { r: 21 }, opacity: 0, duration: 2.2, repeat: -1, ease: 'power1.out' });

  // city labels with how far the journey has got
  const L = $('#routeLabels'); L.innerHTML = '';
  const cityCount = (c) => all.filter((s) => s.city === c && state.opened[s.id]).length;
  const label = (x, y, a, b, anchor = 'start') => { const t1 = svg('text', { x, y, 'text-anchor': anchor }); t1.textContent = a; L.appendChild(t1); if (b) { const t2 = svg('text', { x, y: y + 12, class: 'sub', 'text-anchor': anchor }); t2.textContent = b; L.appendChild(t2); } };
  for (const c of cityLabels(all, pts)) {
    const n = cityCount(c.city), f = all[c.first];
    label(c.x, c.y, c.city.toUpperCase(), n ? `${n} OPENED` : fmt.day(f.at, tzOf(f)).toUpperCase(), c.anchor);
  }
}

function renderSheet() {
  const nx = nextStop(state);
  const btn = $('#openBtn');
  if (!nx) {
    $('#sheetLbl').textContent = t('allOpenLabel');
    $('#sheetPlace').textContent = `All ${stops().length} are open`;
    $('#sheetSub').textContent = t('allOpenSub');
    btn.textContent = t('readBook'); btn.className = 'btn'; btn.dataset.action = 'book';
    $('#sheetEnv').className = 'mini-env';
    return;
  }
  const st = statusOf(nx, state);
  const time = fmt.time(nx.at, tzOf(nx));
  $('#sheetLbl').textContent = nx.kind === 'midnight' ? `${t('nextEnvelope')} · 00:00` : `${t('nextEnvelope')} · ${time}`;
  $('#sheetPlace').textContent = nx.place;
  $('#sheetSub').textContent = st === 'ready' ? (nx.n === 1 ? t('firstReady') : t('ready')) : opensLine(nx);
  btn.textContent = st === 'ready' ? t('open') : t('seeEnvelope');
  btn.className = st === 'ready' ? 'btn' : 'btn sealed';
  btn.dataset.action = 'next';
  $('#sheetEnv').className = 'mini-env' + (nx.kind === 'midnight' ? ' moon' : '');
}

function renderHome() {
  $('#homeWhen').textContent = tripDayLabel();
  const n = Object.keys(state.answers).length;
  $('#count').textContent = n ? `${n} ${n === 1 ? rise().one : rise().many} · ${t('countLine')}` : t('emptySky');
  syncRisen();
  renderRoute();
  renderSheet();
  maybeReturnFirstRise();
}

/* ---------------- opening an envelope ---------------- */
let opening = null;
function goEnvelope(s, force = false) {
  const st = force ? 'ready' : statusOf(s, state);
  if (st === 'opened') return reopen(s);
  opening = s;
  showEnvelope(s, st === 'ready', {
    when: s.kind === 'midnight' ? `${dayOf(s)} · 00:00` : whenLabel(s),
    place: s.place,
    hint: st === 'ready' ? (s.kind === 'midnight' ? (journey().midnight?.hint || t('hintHold')) : s.kind === 'book' ? t('hintLast') : t('hintHold')) : opensLine(s),
  });
  gsap.to('#sheet', { yPercent: 130, duration: .45, ease: 'power3.in' });
  gsap.to('#route, #home .top, #count', { opacity: 0, duration: .35 });
  setTimeout(() => {
    show('env');
    gsap.set('#route, #home .top, #count, #sheet', { clearProps: 'opacity,transform' });
    if (!reduced) gsap.from('#stage', { y: 60, rotationX: 18, opacity: 0, duration: 1, ease: 'expo.out' });
  }, 380);
}
function reopen(s) {
  if (s.kind === 'midnight') { show('midnight'); sky.setFull(1); sky.moonTo(true); showMidnight(state.letters, journey()); return; }
  if (s.kind === 'book') { renderBook({ trip: trip(), state, tzOf }); show('book'); return; }
  renderStop(s, { when: whenLabel(s), answer: state.answers[s.id] && state.answers[s.id].text, animate: false });
  show('stop');
}
function revealTarget(s) {
  // the page goes underneath the letter; the letter lifts away to show it
  const id = s.kind === 'midnight' ? 'midnight' : s.kind === 'book' ? 'book' : 'stop';
  if (id === 'stop') renderStop(s, { when: whenLabel(s), answer: null, animate: true });
  if (id === 'book') renderBook({ trip: trip(), state, tzOf });
  const el = document.getElementById(id); el.classList.add('on'); gsap.set(el, { opacity: 1 });
  if (id === 'midnight') { gsap.to(canvas, { opacity: 1, duration: .6 }); sky.setFull(1); sky.moonTo(true); showMidnight(state.letters, journey()); }
}
function afterOpen(s) {
  const id = s.kind === 'midnight' ? 'midnight' : s.kind === 'book' ? 'book' : 'stop';
  scene = id;
  document.querySelectorAll('.scene').forEach((x) => x.classList.toggle('on', x.id === id));
  gsap.to(canvas, { opacity: 1, duration: .6 });
  opening = null;
}

/* ---------------- home: taps on the sky and on the stops ---------------- */
let tapStart = null;
function setupHomeTaps() {
  const home = $('#home');
  home.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#sheet, button, .stop-hit')) return;
    const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    tapStart = { x, y, t: performance.now(), L: sky.riseAt(x, y) };
    if (tapStart.L) sky.grow(tapStart.L, 1.18, .12, 'power2.out');
  });
  home.addEventListener('pointerup', (e) => {
    if (!tapStart) return; const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    const L = tapStart.L; const moved = Math.hypot(x - tapStart.x, y - tapStart.y); const quick = performance.now() - tapStart.t < 700; tapStart = null;
    if (!L) return;
    if (moved < 12 && quick) {
      sky.grow(L, 1.7);
      openMemo(riseContent(L), sky.screenPos(L), () => sky.grow(L, 1, .6, 'power3.out'));
    } else sky.grow(L, 1, .3, 'power2.out');
  });
  $('#stops').addEventListener('click', (e) => {
    const hit = e.target.closest('.stop-hit'); if (!hit) return;
    const s = stopById(hit.dataset.id); const st = statusOf(s, state); const nx = nextStop(state);
    if (st === 'opened') return reopen(s);
    if (nx && s.id === nx.id) return goEnvelope(s);
    if (st === 'ready') return goEnvelope(s);
    peek(`Sealed until ${fmt.day(s.at, tzOf(s))}, ${fmt.time(s.at, tzOf(s))}`);
  });
  $('#openBtn').addEventListener('click', () => {
    audio(); enableTilt();
    if ($('#openBtn').dataset.action === 'book') { renderBook({ trip: trip(), state, tzOf }); show('book'); return; }
    const nx = nextStop(state); if (nx) goEnvelope(nx);
  });
}
function peek(text) {
  const p = $('#peek'); p.textContent = text;
  gsap.killTweensOf(p);
  gsap.fromTo(p, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .25 });
  gsap.to(p, { opacity: 0, duration: .4, delay: 2.2 });
}

/* ---------------- the callback: the first answer comes back ---------------- */
function maybeReturnFirstRise() {
  const first = stops()[0];
  const cb = journey().callback;
  if (!cb || !journey().callbackAt) return;
  if (state.returned || !state.answers[first.id] || now() < journey().callbackAt || memoOpen() || scene !== 'home') return;
  setTimeout(() => {
    openMemo({ thumb: `img/thumbs/${first.poster}.jpg`, when: cb.label || '', title: cb.title || t('firstBack'),
      q: first.question, a: state.answers[first.id].text, hint: t('memoHintAgain') }, { x: 120, y: 120 },
      () => { state.returned = true; save(); });
  }, 1200);
}

/* ---------------- where the traveller is ---------------- */
function watchPlace() {
  if (!state.geo || !navigator.geolocation) return;
  navigator.geolocation.watchPosition((pos) => {
    const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    let changed = false;
    for (const s of stops()) {
      if (!s.geo || state.near[s.id]) continue;
      if (distanceM(here, s.geo) <= (s.geo.r || 250) + Math.min(pos.coords.accuracy || 0, 150)) { state.near[s.id] = true; changed = true; }
    }
    if (changed && scene === 'home') renderHome();
  }, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 });
}

/* ---------------- boot ---------------- */
async function boot() {
  await loadTrip();
  await loadTheme(document, journey());
  bindCopy(document, journey());
  load();
  setupDemo(journey(), stops(), state, save);
  await fetchRemote();
  sky = initSky(canvas, $('#device'));
  setupMemo();
  setupEnvelope({
    sky,
    onBack: () => { show('home'); },
    onCrack: (s) => { markOpened(s.id); },
    onReveal: revealTarget,
    onDone: afterOpen,
  });
  setupStop({
    onDone: () => { finishPrinting(); show('home'); },
    onAnswer: (s, text) => { setAnswer(s.id, text); },
    onLeaving: () => {
      $('#home').classList.add('on'); gsap.set('#home', { opacity: 1 }); renderHome();
      gsap.set('#sheet', { yPercent: 130 });
      gsap.to('#stop', { opacity: 0, duration: .7, ease: 'power2.inOut', onComplete: () => { $('#stop').classList.remove('on'); scene = 'home'; } });
    },
    onFlown: (s) => {
      scene = 'home'; document.querySelectorAll('.scene').forEach((x) => x.classList.toggle('on', x.id === 'home')); gsap.set('#home', { opacity: 1 });
      const L = sky.risen.find((x) => x.key === s.id);
      if (L) gsap.fromTo(L.g.scale, { x: .2, y: .2 }, { x: 1, y: 1, duration: 1.2, ease: 'expo.out' });
      gsap.fromTo('#toast', { opacity: 0 }, { opacity: 1, duration: .6 }); gsap.to('#toast', { opacity: 0, duration: .8, delay: 3.2 });
      gsap.to('#sheet', { yPercent: 0, duration: .9, ease: 'expo.out', delay: 2.8 });
    },
  });
  setupMidnight({ onDone: () => { sky.setFull(0); sky.moonTo(false); show('home'); } });
  setupBook({ onDone: () => show('home') });

  $('#startBtn').addEventListener('click', () => {
    audio(); enableTilt();
    if (!state.firstOpen) { state.firstOpen = now(); save(); }
    goEnvelope(stops()[0]);
  });
  $('#geoBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(() => { state.geo = true; save(); $('#geoBtn').setAttribute('aria-pressed', 'true'); $('#geoBtn').textContent = t('geoOn'); watchPlace(); },
      () => { $('#geoBtn').textContent = t('geoOff'); }, { timeout: 20000 });
  });
  document.getElementById('device').addEventListener('click', enableTilt);
  setupHomeTaps();
  watchPlace();

  // time moves on: envelopes come ready while the sky is open on screen
  setInterval(() => { if (scene === 'home' && !memoOpen()) { renderSheet(); renderRoute(); } }, 30000);
  setInterval(async () => { await fetchRemote(); if (scene === 'home' && !memoOpen()) renderHome(); }, 60000);
  onClockChange(async () => { await fetchRemote(); if (scene === 'home' || scene === 'welcome') route(); });
  document.addEventListener('visibilitychange', async () => { if (!document.hidden) { await fetchRemote(); if (scene === 'home') renderHome(); } });

  route();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !rehearsing()) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function route() {
  const jump = params.get('jump');
  if (jump) return qaJump(jump);
  if (!state.firstOpen) show('welcome', { fade: false }); else show('home', { fade: false });
  if (scene === 'home' && !reduced) {
    gsap.fromTo('#route', { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power2.out' });
    gsap.from('#sheet', { yPercent: 120, duration: .9, ease: 'expo.out', delay: .4 });
  }
}

// QA: ?jump=welcome|home|env|open&t=2.5|stop&id=post|midnight|book|memo
function qaJump(jump) {
  const id = params.get('id');
  const s = id ? stopById(id) : nextStop(state) || stops()[0];
  if (jump === 'welcome') return show('welcome', { fade: false });
  if (jump === 'home') return show('home', { fade: false });
  if (jump === 'env') { goEnvelope(s, params.get('sealed') ? false : true); return; }
  if (jump === 'open') { goEnvelope(s, true); setTimeout(() => seekOpening(parseFloat(params.get('at') || '2')), 700); return; }
  if (jump === 'stop') { renderStop(s, { when: whenLabel(s), answer: state.answers[s.id] && state.answers[s.id].text, animate: false }); show('stop', { fade: false }); return; }
  if (jump === 'midnight') { show('midnight', { fade: false }); sky.setFull(1); sky.moonTo(true); showMidnight(state.letters, journey()); return; }
  if (jump === 'book') { renderBook({ trip: trip(), state, tzOf }); show('book', { fade: false }); return; }
  if (jump === 'memo') { show('home', { fade: false }); setTimeout(() => { const L = sky.risen[0]; if (L) openMemo(riseContent(L), sky.screenPos(L)); }, 900); }
}

boot();
