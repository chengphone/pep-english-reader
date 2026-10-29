const CACHE = 'pep-reader-shell-v3-word-audio'
const BASE = '/pep-english-reader/'
const CACHE_PREFIX = 'pep-reader-shell-'
// Filled with hashed build assets by tools/build-sw.mjs.
const PRECACHE = []
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll([BASE, BASE + 'index.html', BASE + 'icon.svg', BASE + 'manifest.webmanifest', ...PRECACHE])
    await self.skipWaiting()
  })())
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return
  event.respondWith((async () => {
    // Cache failures must not turn a successful online request into an offline error.
    const cache = await caches.open(CACHE).catch(() => undefined)
    const metadata = [BASE + 'data/default-vocabulary.json', BASE + 'audio/library-manifest.json'].includes(url.pathname)
    const key = metadata ? url.origin + url.pathname : request
    if (!metadata) {
      const cached = await cache?.match(key).catch(() => undefined)
      if (cached) return cached
    }
    try {
      const response = await fetch(request)
      if (metadata && !response.ok) throw new Error('metadata unavailable')
      if (response.status === 200 && response.type !== 'opaque') {
        await cache?.put(key, response.clone()).catch(() => {})
      }
      return response
    } catch {
      return (await cache?.match(metadata ? key : request.mode === 'navigate' ? BASE + 'index.html' : key).catch(() => undefined)) || Response.error()
    }
  })())
})
