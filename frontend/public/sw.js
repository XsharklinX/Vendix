const CACHE = 'vendix-v2'
const OFFLINE_URL = '/offline.html'

// Assets to pre-cache (updated on each deploy by build hash)
const PRECACHE = ['/', '/vender', '/cola-offline', '/manifest.json']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Evita que un fetch colgado (visto en Electron al re-pasar el Request del
// FetchEvent) bloquee la respuesta para siempre: si la red no responde en
// FETCH_TIMEOUT_MS, se descarta y se cae al fallback de caché/offline.
const FETCH_TIMEOUT_MS = 8000
function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sw-fetch-timeout')), FETCH_TIMEOUT_MS)
    fetch(request.clone()).then(
      (res) => { clearTimeout(timer); resolve(res) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  // Never intercept API calls — always go to network
  if (url.pathname.startsWith('/api/')) {
    return
  }

  // For navigation requests: try network first, fall back to cached index.html
  if (request.mode === 'navigate') {
    e.respondWith(
      fetchWithTimeout(request).catch(() =>
        caches.match('/').then(r => r || new Response('Offline', { status: 503 }))
      )
    )
    return
  }

  // For static assets: cache-first strategy
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetchWithTimeout(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
        }
        return response
      }).catch(() => cached || new Response('', { status: 503 }))
    })
  )
})

// Background sync for offline mutations (future implementation)
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-pending-sales') {
    e.waitUntil(syncPendingSales())
  }
})

async function syncPendingSales() {
  // Future: read from IndexedDB and POST to /api
  console.log('[SW] Background sync triggered — pending implementation')
}
