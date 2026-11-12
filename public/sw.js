const CACHE = 'pep-reader-shell-v3-word-audio'
// Data lives in a cache that survives app versions so follow-along content cached
// online is still available offline after an update. It is not shell-prefixed, so
// the activation cleanup below leaves it alone.
const DATA_CACHE = 'pep-reader-data-v1'
// 在线教材和绘本的页面、音频和视频。缓存只写入本机；不随应用版本清理。
const BOOK_CACHE = 'pep-reader-books-v1'
const BASE = '/pep-english-reader/'
const CACHE_PREFIX = 'pep-reader-shell-'
const isFreshData = pathname => (pathname.startsWith(BASE + 'data/') && pathname.endsWith('.json')) || pathname === BASE + 'audio/library-manifest.json' || pathname === BASE + 'remote-books.json'
// Filled with hashed build assets by tools/build-sw.mjs.
const PRECACHE = []
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // `cache: 'reload'` keeps the host's HTTP cache (for example max-age on
    // index.html) from precaching the previous release's shell, whose hashed
    // asset URLs are gone after the deploy and could not boot offline.
    const shell = [BASE, BASE + 'index.html', BASE + 'icon.svg', BASE + 'manifest.webmanifest', ...PRECACHE]
    await cache.addAll(shell.map(url => new Request(url, { cache: 'reload' })))
    await self.skipWaiting()
  })())
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    const stale = keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
    // Older versions kept data inside their versioned shell cache. Carry it over
    // once so follow-along content stays available offline right after an update.
    try {
      const dataCache = await caches.open(DATA_CACHE)
      for (const key of stale) {
        const old = await caches.open(key)
        for (const request of await old.keys()) {
          const url = new URL(request.url)
          if (!isFreshData(url.pathname)) continue
          const response = await old.match(request)
          if (response) await dataCache.put(url.origin + url.pathname, response).catch(() => {})
        }
      }
    } catch { /* Storage unavailable must not block the update. */ }
    await Promise.all(stale.map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  const bookData = url.pathname.startsWith('/book-data/') || url.pathname.startsWith('/picture-data/')
  if (request.method !== 'GET' || url.origin !== self.location.origin || (!url.pathname.startsWith(BASE) && !bookData)) return
  if (bookData) {
    event.respondWith((async () => {
      const cache = await caches.open(BOOK_CACHE).catch(() => undefined)
      const cached = await cache?.match(request, {ignoreVary: true}).catch(() => undefined)
      // “离线保存”用 cache: 'reload' 重新抓取；目录和清单用 no-store 请求，
      // 两者都应绕过已缓存的副本，而图片和音频继续 cache-first。
      if (cached && request.cache !== 'reload' && request.cache !== 'no-store') return cached
      try {
        const response = await fetch(request)
        if ((response.ok || response.type === 'opaque') && cache) {
          await cache.put(request, response.clone()).catch(() => {})
        }
        return response
      } catch {
        return cached || Response.error()
      }
    })())
    return
  }
  event.respondWith((async () => {
    // Data files are small and change between releases; fetch them fresh and keep the
    // cached copy only as an offline fallback. Hashed build assets, audio and images
    // stay cache-first because their URLs identify their contents.
    const freshData = isFreshData(url.pathname)
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
      // Bypass the HTTP cache for data and navigations too; otherwise a deploy can
      // stay invisible for the host's max-age even though the worker asked the
      // network first, and an old shell can outlive the assets it references.
      const init = freshData ? { cache: 'no-store', ...(timer ? { signal: controller.signal } : {}) } : navigation ? { cache: 'no-store' } : undefined
      const response = await fetch(request, init)
      if ((freshData || navigation) && !response.ok) {
        // A real HTTP error (a removed data file, a server fault) must still reach
        // the page when there is no cached copy. Response.error() erases the
        // status, so the follow-along page would report a network failure for
        // missing content and its retry could never succeed.
        const fallback = cachedData || (await cache?.match(key, {ignoreVary: true}).catch(() => undefined))
        return fallback || response
      }
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
