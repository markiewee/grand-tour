// Keeps the whole journey on the phone, so envelopes still open where there is no signal.
// `adventure journey build` writes precache.json and bumps the version below whenever files change.
const V = 'ga-42ff3596eb59';
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    const list = await (await fetch('precache.json', { cache: 'no-store' })).json();
    for (let i = 0; i < list.length; i += 20) await c.addAll(list.slice(i, i + 20));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.pathname.includes('/api/') || u.pathname.includes('/media/')) return;
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: u.origin === location.origin });
    const net = fetch(e.request).then((r) => { if (r.ok && (u.origin === location.origin || r.type === 'cors')) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
