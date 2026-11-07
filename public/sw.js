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
    // Data files are small and change between releases; fetch them fresh and keep the
    // cached copy only as an offline fallback. Hashed build assets, audio and images
    // stay cache-first because their URLs identify their contents.
    const freshData = (url.pathname.startsWith(BASE + 'data/') && url.pathname.endsWith('.json')) || url.pathname === BASE + 'audio/library-manifest.json'
    const navigation = request.mode === 'navigate'
    const key = freshData ? url.origin + url.pathname : navigation ? url.origin + BASE + 'index.html' : request
    // Static assets vary only by URL; some hosts add `Vary: Origin`, while precache
    // requests and page requests send different Origin headers. Ignore Vary so
    // offline loads still hit the precached copy.
    if (!freshData && !navigation) {
      const cached = await cache?.match(key, {ignoreVary: true}).catch(() => undefined)
      if (cached) return cached
    }
    try {
      const response = await fetch(request)
      if ((freshData || navigation) && !response.ok) throw new Error('fresh data unavailable')
      // A captive portal or misconfigured host can answer a JSON request with an
      // HTML page; caching that would break the offline fallback until a later success.
      const jsonResponse = !freshData || (response.headers.get('content-type') || '').toLowerCase().includes('json')
      if (response.status === 200 && response.type !== 'opaque' && jsonResponse) {
        await cache?.put(key, response.clone()).catch(() => {})
      }
      return response
    } catch {
      return (await cache?.match(key, {ignoreVary: true}).catch(() => undefined)) || Response.error()
    }
  })())
})
