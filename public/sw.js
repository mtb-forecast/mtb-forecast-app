const CACHE_NAME = 'mtb-forecaster-v3'
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

  // Só cacheamos assets estáticos do mesmo origin
  if (url.origin !== self.location.origin) return

  const isStaticAsset =
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'

  if (!isStaticAsset) return

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  )
})
