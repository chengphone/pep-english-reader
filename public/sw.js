const CACHE = 'pep-reader-shell-v3-word-audio'
const BASE = '/pep-english-reader/'
// Filled with hashed build assets by tools/build-sw.mjs.
const PRECACHE = []
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([BASE, BASE + 'index.html', BASE + 'icon.svg', BASE + 'manifest.webmanifest', ...PRECACHE])))
  self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))))
  self.clients.claim()
})
self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if(/\/(data\/default-vocabulary|audio\/library-manifest)\.json$/.test(new URL(request.url).pathname)){
    const canonical=new URL(request.url);canonical.search=''
    event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(request);if(response.ok)await cache.put(canonical.href,response.clone());else throw new Error('metadata unavailable');return response}catch{return await cache.match(canonical.href)||Response.error()}})())
    return
  }
  event.respondWith(caches.match(request, { ignoreVary: true }).then(cached => cached || fetch(request).then(response => {
    if (response.ok) event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, response.clone())))
    return response
  }).catch(() => request.mode === 'navigate' ? caches.match(BASE + 'index.html') : Response.error())))
})
