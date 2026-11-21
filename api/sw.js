// عامل الخدمة: يستقبل الإشعارات ويعرضها حتى لو كان الموقع مغلقًا
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'مدرسة النهضة بالقرآن', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl', lang: 'ar',
    tag: d.tag || 'nahda',
    renotify: true,
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        try { await w.navigate(url); } catch (_) {}
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
