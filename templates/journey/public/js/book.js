// The Book: the last envelope collects every poster, every answer sent up, every note and every
// letter into one book that can be printed. Voice notes and videos go in as QR codes.
import { fmt } from './clock.js';
import { t, rise } from './copy.js';

const $ = (s) => document.querySelector(s);

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function qrSvg(url) {
  if (!window.qrcode) return null;
  const q = window.qrcode(0, 'M'); q.addData(url); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  const box = document.createElement('div'); box.className = 'qr';
  box.innerHTML = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="var(--paper)"/><path d="${d}" fill="var(--ink)"/></svg>`;
  return box;
}

export function setupBook(h) {
  $('#bookBack').addEventListener('click', () => h.onDone());
  $('#printBtn').addEventListener('click', () => window.print());
}

export function renderBook({ trip, state, tzOf }) {
  const pages = $('#pages'); pages.innerHTML = '';
  const posters = trip.stops.filter((s) => s.poster);
  const cover = el('div', 'page cover');
  const j = trip.j;
  cover.append(el('div', 'lbl gold', j.bookLabel || j.subtitle || ''), el('h2', null, `${j.for}'s Book`),
    el('p', null, `${posters.length} posters · every ${rise().one} · every letter`));
  pages.appendChild(cover);

  for (const s of posters) {
    const p = el('div', 'page');
    const row = el('div', 'pn');
    const img = el('img'); img.src = `img/thumbs/${s.poster}.jpg`; img.alt = ''; img.loading = 'lazy';
    const txt = el('div');
    txt.append(el('div', 'lbl red', `Day ${s.day} · ${fmt.day(s.at, tzOf(s))}`), el('h3', null, s.place));
    if (s.caption) txt.append(el('p', 'a2', s.caption));
    row.append(img, txt); p.appendChild(row);
    const ans = state.answers[s.id];
    if (s.question) {
      p.append(el('div', 'q2', s.question));
      p.append(el('p', 'a2', ans ? ans.text : t('notAnswered')));
    }
    pages.appendChild(p);
  }

  const letters = state.letters || [];
  if (letters.length) {
    const p = el('div', 'page');
    p.append(el('div', 'lbl red', (j.midnight && j.midnight.dayLabel) || ''), el('h3', null, t('midnightLetters')));
    for (const l of letters) {
      const row = el('div', 'letter-row');
      const left = el('div');
      left.append(el('div', 'lbl', l.last ? `From ${l.from} · last` : `From ${l.from}`));
      if (l.text) left.append(el('p', 'a2', l.text));
      if (l.audio || l.video) left.append(el('div', 'q2', l.video ? t('scanWatch') : t('scanListen')));
      row.appendChild(left);
      const media = l.video || l.audio;
      if (media) { const q = qrSvg(new URL(media, location.href).href); if (q) row.appendChild(q); }
      p.appendChild(row);
    }
    pages.appendChild(p);
  }

  // The callback is optional. A journey without one simply ends on its last poster.
  const first = trip.stops[0];
  if (j.callback && first.question) {
    const last = el('div', 'page last');
    last.append(el('div', 'moon-mark'), el('div', 'lbl gold', j.callback.label || ''),
      el('h3', null, j.callback.title || t('firstComesBack')),
      el('p', 'a2', `At ${first.place} you were asked: ${first.question} This app will show you what you wrote, so you can see what you found.`));
    pages.appendChild(last);
  }
}
