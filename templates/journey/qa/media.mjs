// A friend in a real browser choosing a real video, sending it, and it arriving. This is the
// one path qa/flows.mjs cannot reach: the recording never touches our server, it goes from their
// phone straight to storage, so only a real browser upload proves it.
//
//   node qa/media.mjs                     against the deployed site
//
// Needs the production key in /tmp/ga-key-token.txt and the media store token in
// /tmp/lr-media-token.txt, and a small mp4 at /tmp/lr-test-video.mp4:
//   ffmpeg -f lavfi -i testsrc=duration=3:size=320x240:rate=15 -pix_fmt yuv420p /tmp/lr-test-video.mp4
import { chromium as loadChromium, CHROME } from './journey.mjs';

const chromium = await loadChromium();
import fs from 'node:fs';
const B = process.env.GA_BASE || 'https://your-journey.vercel.app/';
const K = process.env.GA_KEY || fs.readFileSync('/tmp/ga-key-token.txt', 'utf8').trim();
const problems = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) problems.push(m); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
await page.goto(B + 'letterbox.html', { waitUntil: 'load' });

await page.fill('#from', 'QA video');
await page.fill('#text', 'QA video letter, delete me.');
await page.setInputFiles('#vid', '/tmp/lr-test-video.mp4');
await page.waitForTimeout(2500);
ok((await page.textContent('#vidHint')).includes('second'), 'the video is accepted and its length read');

await page.click('#sendBtn');
await page.waitForSelector('#done:not([hidden])', { timeout: 60000 }).catch(() => {});
ok(await page.isVisible('#done'), 'the letterbox seals it after a real video upload');
const errText = await page.textContent('#err');
if (errText) console.log('   (error shown: ' + errText + ')');

const key = await (await fetch(`${B}api/key?k=${K}`)).json();
const letter = key.letters.find((l) => l.from === 'QA video');
ok(!!letter, 'the letter reaches the key');
ok(!!(letter && letter.video), 'it carries a video address');
if (letter && letter.video) {
  ok(letter.video.includes('.public.blob.vercel-storage.com/media/'), 'the address is in our own media store');
  const head = await fetch(letter.video, { method: 'HEAD' });
  ok(head.ok, `the video plays back from that address (${head.status}, ${head.headers.get('content-type')}, ${head.headers.get('content-length')} bytes)`);
  // and it must be reachable by range, which is what iOS insists on for video
  const range = await fetch(letter.video, { headers: { Range: 'bytes=0-1023' } });
  ok(range.status === 206, `it serves byte ranges, which iOS needs (${range.status})`);
}

// clean up: the letter, and the blob behind it
if (letter) {
  await fetch(`${B}api/key/letter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: K, id: letter.id, delete: true }) });
  const { list, del } = await import('@vercel/blob');
  const t = { token: fs.readFileSync('/tmp/lr-media-token.txt', 'utf8').trim() };
  for (const b of (await list({ prefix: 'media/', ...t })).blobs) await del(b.url, t);
  const left = (await list({ prefix: 'media/', ...t })).blobs.length;
  const after = await (await fetch(`${B}api/key?k=${K}`)).json();
  ok(left === 0 && !after.letters.some((l) => l.from === 'QA video'), 'test letter and its video removed');
}
console.log(`\nPROBLEMS ${problems.length}`); problems.forEach((p) => console.log(' - ' + p));
await browser.close();
