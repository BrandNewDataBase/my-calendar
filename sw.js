// 최소 서비스워커 — 알림 표시(showNotification)와 클릭 시 탭 포커스만 담당
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // github.io는 계정의 모든 프로젝트가 같은 origin을 공유하므로 이 앱 범위의 탭만 포커스
    const inScope = all.filter(c => c.url.startsWith(self.registration.scope));
    if (inScope.length) return inScope[0].focus();
    return self.clients.openWindow('./');
  })());
});
