// The flows the rehearsal cannot reach: the letterbox, the midnight gate, and the sender's
// open-now and hold-back switches. Writes a test letter and overrides, checks them, removes them.
//   node qa/flows.mjs
import fs from 'node:fs';
import { chromium as loadChromium, CHROME, stops, midnightAt, overridable, before as earlier, moment } from './journey.mjs';

const chromium = await loadChromium();
if (!midnightAt) {
  console.log('This journey has no midnight moment, so there is no letterbox to check. Nothing to do.');
  process.exit(0);
}
const iso = (ms) => new Date(ms).toISOString();

const BASE = process.env.GA_BASE || 'http://127.0.0.1:8780/';
// Against the deployed site, pass the production key: GA_KEY=... GA_BASE=https://... node qa/flows.mjs
const K = process.env.GA_KEY || fs.readFileSync(new URL('../data/key_token.txt', import.meta.url), 'utf8').trim();
const problems = [];
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) problems.push(msg); };
const api = async (path, body) => (await fetch(BASE + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: K, ...body }) } : {})).json();
// Only the deployed API gates ?t=; server.py stays open so the journey can be rehearsed offline.
const PROD = !BASE.startsWith('http://127.0.0.1') && !BASE.startsWith('http://localhost');

const browser = await chromium.launch({ executablePath: CHROME, headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const phone = async (state) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (state) await ctx.addInitScript((s) => { try { localStorage.setItem('ga_state_rehearse_v1', s); } catch (e) {} }, JSON.stringify(state));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  return { ctx, page };
};

// 1. a friend leaves a letter
{
  const { ctx, page } = await phone();
  await page.goto(BASE + 'letterbox.html', { waitUntil: 'load' });
  await page.click('#sendBtn');
  ok((await page.textContent('#err')).includes('name'), 'letterbox asks for a name first');
  await page.fill('#from', 'QA test');
  await page.click('#sendBtn');
  ok((await page.textContent('#err')).length > 5, 'letterbox asks for a letter, voice note or video');
  await page.fill('#text', 'QA letter, delete me.');
  await page.click('#sendBtn');
  await page.waitForSelector('#done:not([hidden])', { timeout: 8000 }).catch(() => {});
  ok(await page.isVisible('#done'), 'letterbox shows "sealed" after sending');
  await ctx.close();
}
const key = await (await fetch(`${BASE}api/key?k=${K}`)).json();
const qa = key.letters.find((l) => l.from === 'QA test');
ok(!!qa, 'the letter reaches the key');

// 2. the midnight gate
const before = await (await fetch(`${BASE}api/state?k=${K}&t=${midnightAt - 60e3}`)).json();
ok(!before.letters.some((l) => l.from === 'QA test'), 'letters stay sealed one minute before midnight');
const after = await (await fetch(`${BASE}api/state?k=${K}&t=${midnightAt + 30e3}`)).json();
ok(after.letters.some((l) => l.from === 'QA test'), 'letters open at 00:00');
ok((await fetch(`${BASE}api/key`)).status === 403, 'key API without the token is refused');
ok((await fetch(`${BASE}api/key?k=wrong`)).status === 403, 'key API with a wrong token is refused');
const nokey = await (await fetch(`${BASE}api/state?t=${midnightAt + 30e3}`)).json();
ok(!nokey.letters.some((l) => l.from === 'QA test') || !PROD, 'without the key, a ?t= cannot open the letters early');
{
  const { ctx, page } = await phone();
  await page.goto(`${BASE}?jump=midnight&k=${K}&t=${encodeURIComponent(iso(midnightAt + 60e3))}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const names = await page.$$eval('.fall .who', (els) => els.map((e) => e.textContent));
  ok(names.includes('QA test'), 'the letter comes down at midnight');
  await ctx.close();
}

// 3. inside an envelope
{
  const { ctx, page } = await phone();
  await page.goto(`${BASE}?jump=stop&id=${overridable.id}&t=${encodeURIComponent(moment(overridable, 15))}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  ok((await page.textContent('#stopPlace')).length > 2, 'the envelope opens on its place');
  ok((await page.$$('#note')).length === 0, 'no note row, that feature is gone');
  const body = await page.textContent('body');
  ok(!/[\u0300-\u036f\u1ea0-\u1ef9\u0110\u0111]/.test(body), 'the text is romanised, no stacked marks');
  await ctx.close();
}

// 4. open now, and hold back
const seed = { opened: {}, answers: {}, firstOpen: 1 };
for (const s of earlier) seed.opened[s.id] = 1;
await api('api/key/override', { id: overridable.id, mode: 'open' });
{
  const { ctx, page } = await phone(seed);
  await page.goto(`${BASE}?t=${encodeURIComponent(moment(overridable, -600))}`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  ok((await page.textContent('#openBtn')) === 'Open it', '"Open now" makes an envelope ready before its time');
  await ctx.close();
}
await api('api/key/override', { id: overridable.id, mode: 'hold' });
{
  const { ctx, page } = await phone(seed);
  await page.goto(`${BASE}?t=${encodeURIComponent(moment(overridable, 120))}`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  ok((await page.textContent('#openBtn')) === 'See the envelope', '"Hold it back" keeps it sealed after its time');
  await ctx.close();
}

// 5. the key page itself
{
  const { ctx, page } = await phone();
  await page.goto(`${BASE}key.html?k=${K}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  ok((await page.$$('.env')).length === stops.length, `the key lists all ${stops.length} envelopes`);
  ok((await page.textContent('#letters')).includes('QA test'), 'the key shows the letter');
  await page.goto(`${BASE}key.html`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  ok(await page.isVisible('#wrap'), 'the key remembers its token on this phone');
  await ctx.close();
}

// 6. the key saved on this phone moves the whole journey, which is how the live site is rehearsed
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((k) => { try { localStorage.setItem('ga_key', k); } catch (e) {} }, K);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.goto(`${BASE}?jump=midnight&t=${encodeURIComponent(iso(midnightAt + 60e3))}`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const names = await page.$$eval('.fall .who', (els) => els.map((e) => e.textContent));
  ok(names.includes('QA test'), 'the key saved on this phone opens the letters in a rehearsal');
  await ctx.close();
}

// clean up
if (qa) await api('api/key/letter', { id: qa.id, delete: true });
await api('api/key/override', { id: overridable.id, mode: null });
const final = await (await fetch(`${BASE}api/key?k=${K}`)).json();
ok(!final.letters.some((l) => l.from === 'QA test') && !final.overrides[overridable.id], 'test data removed');
console.log(`\nPROBLEMS ${problems.length}`); problems.forEach((p) => console.log(' - ' + p));
await browser.close();
