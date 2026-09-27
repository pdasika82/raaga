// Retires the service worker that the first app registered at this scope before it moved to /steps/.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  await self.registration.unregister();
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const c of clients) c.navigate(c.url);
});
