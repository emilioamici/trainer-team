// Importato dal service worker generato da Workbox (vedi vite.config.ts → workbox.importScripts).
// Safari/WebKit non ammette push "silenziose": ogni push DEVE mostrare una notifica, anche con l'app aperta.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { body: event.data ? event.data.text() : '' } }
  const title = data.title || 'Trainer Team'
  const options = {
    body: data.body || '',
    tag: data.tag || undefined, // lo stesso tag sostituisce la notifica precedente: niente doppioni
    renotify: !!data.tag,
    icon: new URL('icons/icon-192.png', self.registration.scope).href,
    badge: new URL('icons/favicon-64.png', self.registration.scope).href,
    data: { url: data.url || self.registration.scope },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow(target)
    }),
  )
})
