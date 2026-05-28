const CACHE = 'vendix-v1'
const OFFLINE_URL = '/offline.html'

// Assets to pre-cache (updated on each deploy by build hash)
const PRECACHE = ['/', '/vender', '/manifest.json']

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
      fetch(request).catch(() =>
        caches.match('/').then(r => r || new Response('Offline', { status: 503 }))
      )
    )
    return
  }

  // For static assets: cache-first strategy
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
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
