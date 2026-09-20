import fs from 'node:fs';
import { chromium as loadChromium, CHROME } from './journey.mjs';

const chromium = await loadChromium();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal','--ignore-gpu-blocklist','--enable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('console', (m) => console.log('console', m.type(), m.text()));
page.on('pageerror', (e) => console.log('pageerror', e.message));
const trip = JSON.parse(fs.readFileSync(new URL('../public/data/trip.json', import.meta.url), 'utf8'));
const q = process.argv[2] || `jump=env&id=${process.env.GA_ID || trip.stops[0].id}`;
await page.goto(`${process.env.GA_BASE || 'http://127.0.0.1:8780/'}?${q}`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => ({ on: [...document.querySelectorAll('.scene.on')].map(s => s.id), search: location.search, envOpacity: getComputedStyle(document.getElementById('env')).opacity })));
await browser.close();
