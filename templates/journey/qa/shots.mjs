// Screenshots of any screen on a phone-sized viewport, using the real Chrome on the GPU.
//   node qa/shots.mjs <outdir> <name>=<query>[@wait_ms] ...
//   GA_STATE='{"opened":{...},"answers":{...},"firstOpen":1}' seeds the phone's saved state first.
import { chromium as loadChromium, CHROME } from './journey.mjs';

const chromium = await loadChromium();
import fs from 'node:fs';
const BASE = process.env.GA_BASE || 'http://127.0.0.1:8780/';
const [,, out, ...shots] = process.argv;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const errs = [];
for (const s of shots) {
  const [VW, VH] = (process.env.GA_VIEW || '390x844').split('x').map(Number); const phone = VW < 700;
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
  // Seed both keys. A page asked for with ?t= is a rehearsal and keeps its state under the other
  // one, so seeding only the live key silently gave every screenshot an empty journey.
  if (process.env.GA_STATE) await ctx.addInitScript((st) => {
    try {
      if (sessionStorage.getItem('seeded')) return;
      localStorage.setItem('ga_state_v1', st);
      localStorage.setItem('ga_state_rehearse_v1', st);
      sessionStorage.setItem('seeded', '1');
    } catch (e) { /* storage blocked: the shot just shows a fresh journey */ }
  }, process.env.GA_STATE);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errs.push('failed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errs.push(`${r.status()}: ${r.url()}`); });
  const i = s.indexOf('='); const name = s.slice(0, i); const rest = s.slice(i + 1);
  const [query, wait] = rest.split('@');
  const url = query.startsWith('/') ? BASE.replace(/\/$/, '') + query : BASE + (query ? '?' + query : '');
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(parseInt(wait || '1800', 10));
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
  await ctx.close();
}
console.log('ERRORS', JSON.stringify([...new Set(errs)].slice(0, 25), null, 1));
await browser.close();
