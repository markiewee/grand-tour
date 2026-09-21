// Rehearse the whole journey on a phone: open every envelope in order at its time, hold every seal,
// let every letter unfold and every poster print, answer every question, send every answer up, open
// the midnight letters and the book, then check the first answer comes back on the callback date.
//   node qa/rehearse.mjs [outdir]
import { chromium as loadChromium, CHROME } from './journey.mjs';

const chromium = await loadChromium();
import fs from 'node:fs';

const BASE = process.env.GA_BASE || 'http://127.0.0.1:8780/';
const OUT = process.argv[2] || 'qa/out/rehearse';
fs.mkdirSync(OUT, { recursive: true });
const trip = JSON.parse(fs.readFileSync(new URL('../public/data/trip.json', import.meta.url)));
const at = (s, plusMin = 1) => new Date(Date.parse(s.opensAt) + plusMin * 60e3).toISOString();
const J = trip.journey || {};
const callbackAt = J.callback ? Date.parse(J.callback.at) : null;
const first = trip.stops[0];
// Reopening only proves anything on a stop that was answered, so pick one with a question.
const answerable = trip.stops.filter((s) => !s.kind && s.poster && s.question);
const reopenable = answerable[Math.min(1, answerable.length - 1)] || trip.stops[1];

const browser = await chromium.launch({ executablePath: CHROME, headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
const log = (m) => { console.log(m); fs.appendFileSync(`${OUT}/log.txt`, m + '\n'); };
fs.writeFileSync(`${OUT}/log.txt`, '');
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`${r.status()} ${r.url().replace(BASE, '')}`); });

const shot = async (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const onScene = () => page.evaluate(() => [...document.querySelectorAll('.scene.on')].map((s) => s.id).join(','));
const check = (cond, msg) => { if (!cond) { problems.push('CHECK: ' + msg); log('  FAIL ' + msg); } };

async function holdSeal(ms = 1500) {
  const box = await page.locator('#seal').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}

const answers = {};
let risen = 0;
// GA_FROM=13 resumes at an envelope, as if every earlier one was opened and answered
const FROM = parseInt(process.env.GA_FROM || '1', 10);
if (FROM > 1) {
  const opened = {}, ans = {};
  for (const s of trip.stops.filter((x) => x.n < FROM)) {
    opened[s.id] = Date.parse(s.opensAt) + 60e3;
    if (s.question) { const a = `Rehearsal answer for ${s.place}.`; ans[s.id] = { text: a, at: opened[s.id] + 60e3 }; answers[s.id] = a; risen++; }
  }
  await ctx.addInitScript((st) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ga_state_rehearse_v1', st); sessionStorage.setItem('seeded', '1'); } } catch (e) {} },
    JSON.stringify({ opened, answers: ans, firstOpen: opened[trip.stops[0].id] }));
}
for (const s of trip.stops.filter((x) => x.n >= FROM)) {
  const t = at(s, s.n === 1 ? 5 : 1);
  await page.goto(`${BASE}?t=${encodeURIComponent(t)}`, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  const tag = String(s.n).padStart(2, '0') + '_' + s.id;
  if (s.n === 1) {
    check((await onScene()) === 'welcome', 'welcome screen shows on first open');
    await shot(`${tag}_0welcome`);
    await page.click('#startBtn');
  } else {
    check((await onScene()) === 'home', `home shows before ${s.id}`);
    const sheet = await page.evaluate(() => ({ place: document.querySelector('#sheetPlace').textContent, btn: document.querySelector('#openBtn').textContent }));
    check(sheet.place === s.place, `sheet names the next envelope (${sheet.place} vs ${s.place})`);
    check(sheet.btn === 'Open it', `sheet says Open it for ${s.id} (${sheet.btn})`);
    if (s.n === 2 || s.n === 13 || s.n === 25) await shot(`${tag}_0home`);
    await page.click('#openBtn');
  }
  await page.waitForTimeout(1500);
  check((await onScene()) === 'env', `envelope scene for ${s.id}`);
  const head = await page.evaluate(() => document.querySelector('#envPlace').textContent);
  check(head === s.place, `envelope head names ${s.place} (${head})`);
  await shot(`${tag}_1env`);
  await holdSeal();
  await page.waitForTimeout(2600);
  if ([1, 13, 25].includes(s.n)) await shot(`${tag}_2opening`);
  await page.waitForTimeout(3600);
  const scene = await onScene();
  if (s.kind === 'midnight') {
    check(scene === 'midnight', `midnight scene opens (${scene})`);
    await page.waitForTimeout(6000);
    const n = await page.evaluate(() => document.querySelectorAll('.fall').length);
    const held = (await (await fetch(`${BASE}api/state?t=${Date.parse(t)}`)).json()).letters.length;
    log(`  midnight, ${n} came down (server holds ${held})`);
    check(n === held, `one comes down for every letter (${n} of ${held})`);
    if (!held) check(/on their way/.test(await page.textContent('#midSub')), 'with no letters yet it says they are on their way');
    await shot(`${tag}_3midnight`);
    if (n) {
      await page.locator('.fall').first().click({ force: true }); await page.waitForTimeout(900);
      const memo = await page.evaluate(() => document.querySelector('#memoA').textContent);
      check(memo.length > 3, 'a midnight letter opens');
      await shot(`${tag}_4letter`);
      await page.mouse.click(20, 820); await page.waitForTimeout(700);
    }
    await page.click('#midDone'); await page.waitForTimeout(900);
    continue;
  }
  if (s.kind === 'book') {
    check(scene === 'book', `book opens (${scene})`);
    const pages = await page.evaluate(() => document.querySelectorAll('#pages .page').length);
    log(`  book pages: ${pages}`);
    // a page per poster, a cover, a page of letters when any came down, and the callback
    const letters = (J.demoLetters || []).length;
    const want = trip.stops.filter((s) => s.poster).length + 1 + (letters ? 1 : 0)
      + (callbackAt && trip.stops[0].question ? 1 : 0);
    check(pages === want, `book has a page per poster, a cover and the callback (${pages}, wanted ${want})`);
    await shot(`${tag}_3book`);
    await page.evaluate(() => { document.querySelector('#book').scrollTop = 99999; });
    await page.waitForTimeout(400); await shot(`${tag}_4bookend`);
    continue;
  }
  check(scene === 'stop', `stop page for ${s.id} (${scene})`);
  await page.waitForTimeout(3200);
  const info = await page.evaluate(() => {
    const img = document.querySelector('#finalPoster');
    return { place: document.querySelector('#stopPlace').textContent, poster: img.currentSrc.split('/').pop(), loaded: img.complete && img.naturalWidth > 0,
      lede: document.querySelector('#stopLede').textContent, q: !document.querySelector('#q').hidden };
  });
  check(info.place === s.place, `stop page names ${s.place}`);
  check(info.loaded, `poster image loads for ${s.id} (${info.poster})`);
  check(info.poster === `${s.poster}.jpg`, `poster is ${s.poster} (${info.poster})`);
  check(info.lede.length > 20, `lede present for ${s.id}`);
  await shot(`${tag}_3stop`);
  if (s.question) {
    await page.evaluate(() => document.querySelector('#q').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    const a = `Rehearsal answer for ${s.place}.`;
    await page.fill('#answer', a); answers[s.id] = a;
    await page.click('#sendBtn');
    await page.waitForTimeout(5200);
    risen++;
    const home = await page.evaluate(() => ({ scene: [...document.querySelectorAll('.scene.on')].map((x) => x.id).join(','), count: document.querySelector('#count').textContent }));
    check(home.scene === 'home', `after sending, back home (${home.scene})`);
    check(home.count.startsWith(String(risen)), `the count over the sky is ${risen} (${home.count})`);
    if (s.n === 5 || s.n === 24) await shot(`${tag}_4sent`);
  } else {
    await page.evaluate(() => document.querySelector('#doneBtn').scrollIntoView({ block: 'center' }));
    await page.click('#doneBtn'); await page.waitForTimeout(900);
    check((await onScene()) === 'home', `done button returns home from ${s.id}`);
  }
  log(`ok ${s.n} ${s.id}`);
}

// re-reading an opened stop from the route, and the callback if this journey has one
if (callbackAt) {
  await page.goto(`${BASE}?t=${encodeURIComponent(new Date(callbackAt + 40e3).toISOString())}`, { waitUntil: 'load' });
  await page.waitForTimeout(3200);
  const back = await page.evaluate(() => ({ open: getComputedStyle(document.querySelector('#memo')).visibility, title: document.querySelector('#memoPlace').textContent, a: document.querySelector('#memoA').textContent }));
  check(back.open === 'visible' && back.title === (J.callback.title || ''),
    `the first answer comes back on the callback date (${back.title})`);
  check(back.a === answers[first.id], `it carries the answer from ${first.place}`);
  await shot('90_callback');
  await page.mouse.click(20, 820); await page.waitForTimeout(800);
}
await shot('91_home_end');
const tap = await page.evaluate((id) => { const h = document.querySelector(`.stop-hit[data-id="${id}"]`); const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, reopenable.id);
await page.mouse.click(tap.x, tap.y); await page.waitForTimeout(1200);
const reread = await page.evaluate(() => ({ scene: [...document.querySelectorAll('.scene.on')].map((x) => x.id).join(','), ans: document.querySelector('#qAnswer').textContent }));
check(reread.scene === 'stop' && reread.ans === answers[reopenable.id], `tapping ${reopenable.place} reopens it with the answer (${reread.scene})`);
await shot('92_reread');

// sealed refusal on a fresh rehearsal phone
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const q = await ctx2.newPage();
await q.addInitScript((id) => { try { localStorage.setItem('ga_state_rehearse_v1', JSON.stringify({ opened: { [id]: 1 }, answers: {}, firstOpen: 1 })); } catch (e) {} }, first.id);
await q.goto(`${BASE}?t=${encodeURIComponent(at(first, 90))}`, { waitUntil: 'load' });
await q.waitForTimeout(1500);
await q.click('#openBtn'); await q.waitForTimeout(1500);
const sb = await q.locator('#seal').boundingBox();
await q.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await q.mouse.down(); await q.waitForTimeout(1600); await q.mouse.up(); await q.waitForTimeout(500);
const refused = await q.evaluate(() => ({ lbl: document.querySelector('#hintLbl').textContent, scene: [...document.querySelectorAll('.scene.on')].map((x) => x.id).join(',') }));
check(refused.lbl === 'Not yet' && refused.scene === 'env', `a sealed envelope refuses before its time (${refused.lbl})`);
await q.screenshot({ path: `${OUT}/93_sealed_refuses.png` });
await ctx2.close();

const uniq = [...new Set(problems)];
log(`\nPROBLEMS ${uniq.length}`); uniq.forEach((p) => log(' - ' + p));
await browser.close();
