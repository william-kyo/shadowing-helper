// Minimal service worker: Web Push display + notification click handling.
// No fetch caching — the app stays network-first.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'シャドーイングヘルパー', body: event.data.text() }
  }
  const options = {
    body: data.body ?? '',
    icon: data.icon ?? '/icon-192.png',
    badge: data.badge ?? '/icon-192.png',
    // Replace any earlier reminder instead of stacking notifications.
    tag: data.tag ?? 'daily-reminder',
    data: { url: data.url ?? '/' },
  }
  event.waitUntil(self.registration.showNotification(data.title ?? 'シャドーイングヘルパー', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
