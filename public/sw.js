const CACHE_NAME = 'mtb-forecaster-v2'
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-apple.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Deixa pass-through: auth, API, e qualquer navegação (document)
  if (
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/dashboard') ||
    event.request.mode === 'navigate' ||
    event.request.destination === 'document'
  ) {
    return
  }

  // Cache-first apenas para assets estáticos
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  )
})
