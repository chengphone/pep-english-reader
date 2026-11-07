const CACHE = 'pep-reader-shell-v3-word-audio'
// Data lives in a cache that survives app versions so follow-along content cached
// online is still available offline after an update. It is not shell-prefixed, so
// the activation cleanup below leaves it alone.
const DATA_CACHE = 'pep-reader-data-v1'
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
    // Data files are small and change between releases; fetch them fresh and keep the
    // cached copy only as an offline fallback. Hashed build assets, audio and images
    // stay cache-first because their URLs identify their contents.
    const freshData = (url.pathname.startsWith(BASE + 'data/') && url.pathname.endsWith('.json')) || url.pathname === BASE + 'audio/library-manifest.json'
    // Cache failures must not turn a successful online request into an offline error.
    const cache = await caches.open(freshData ? DATA_CACHE : CACHE).catch(() => undefined)
    const navigation = request.mode === 'navigate'
    const key = freshData ? url.origin + url.pathname : navigation ? url.origin + BASE + 'index.html' : request
    // Static assets vary only by URL; some hosts add `Vary: Origin`, while precache
    // requests and page requests send different Origin headers. Ignore Vary so
    // offline loads still hit the precached copy.
    if (!freshData && !navigation) {
      const cached = await cache?.match(key, {ignoreVary: true}).catch(() => undefined)
      if (cached) return cached
    }
    // When a cached data copy exists, a stalled network must not hold the page
    // hostage; after a short grace period serve the cache and retry next visit.
    const cachedData = freshData ? await cache?.match(key, {ignoreVary: true}).catch(() => undefined) : undefined
    const controller = new AbortController()
    const timer = cachedData ? setTimeout(() => controller.abort(), 4000) : undefined
    try {
      const response = await fetch(request, timer ? { signal: controller.signal } : undefined)
      if ((freshData || navigation) && !response.ok) throw new Error('fresh data unavailable')
      // A captive portal or misconfigured host can answer a JSON request with an
      // HTML page; caching that would break the offline fallback until a later success.
      const jsonResponse = !freshData || (response.headers.get('content-type') || '').toLowerCase().includes('json')
      if (response.status === 200 && response.type !== 'opaque' && jsonResponse) {
        await cache?.put(key, response.clone()).catch(() => {})
      }
      return response
    } catch {
      return cachedData || (await cache?.match(key, {ignoreVary: true}).catch(() => undefined)) || Response.error()
    } finally {
      if (timer) clearTimeout(timer)
    }
  })())
})
