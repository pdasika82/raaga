// Retires the service worker installed at this scope and sends open pages to the new address.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(new URL('../', c.url).href);
});
