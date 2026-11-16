const cacheName = 'theus-offline-v1';
const offline = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.add(offline)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names
    .filter((name) => name.startsWith('theus-offline-') && name !== cacheName)
    .map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate' || request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).catch(async () => (await caches.match(offline)) || Response.error()));
});

self.addEventListener('push', (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (!payload || typeof payload.body !== 'string') return;
  const links = { discount: '/agendar', loyalty: '/meus-horarios#fidelidade', subscription: '/meus-horarios#assinatura' };
  const path = Object.hasOwn(links, payload.destination) ? links[payload.destination] : '/meus-horarios';
  event.waitUntil(self.registration.showNotification(typeof payload.title === 'string' ? payload.title : 'Theus Studio', {
    body: payload.body, tag: payload.tag, icon: '/icons/studio-192.png',
    data: { path },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const path = event.notification.data?.path;
    const allowed = ['/agendar', '/meus-horarios#fidelidade', '/meus-horarios#assinatura'];
    const url = new URL(allowed.includes(path) ? path : '/meus-horarios', self.location.origin).href;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clients.find((item) => item.url === url);
    if (client) await client.focus();
    else await self.clients.openWindow(url);
  })());
});
