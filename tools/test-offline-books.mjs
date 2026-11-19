import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOOK_CACHE, cacheBook, collectBookUrls, listOfflineBooks, offlineStatus, removeBookCache } from '../src/reader/offlineBooks.ts'

test('offline book URLs cover manifest, pages, audio, posters and deduplicate', () => {
  const book = {
    id: 'demo',
    remote: true,
    manifestUrl: 'https://cdn.example.com/book-data/demo/book.json',
    assets: {},
    manifest: {
      schemaVersion: 1,
      bookId: 'demo',
      title: 'Demo',
      publisherId: 'pep',
      pages: [
        {
          page: 1,
          image: 'https://cdn.example.com/book-data/demo/pages/001.jpg',
          items: [
            { id: 'a', text: 'apple', order: 1, rects: [], audio: 'https://cdn.example.com/book-data/demo/audio/03.mp3' },
            { id: 'b', text: 'ant', order: 2, rects: [], audio: 'https://cdn.example.com/book-data/demo/audio/03.mp3' },
          ],
          resources: [
            { id: 'r', kind: 'audio', title: 'Track', src: 'https://cdn.example.com/book-data/demo/audio/03.mp3' },
            { id: 'v', kind: 'video', title: 'Video', src: 'https://cdn.example.com/book-data/demo/video/l1.mp4', poster: 'https://cdn.example.com/book-data/demo/pages/001.jpg' },
          ],
        },
        { page: 2, image: 'relative/pages/002.jpg', items: [] },
      ],
    },
  }
  const urls = collectBookUrls(book)
  assert.deepEqual(urls.sort(), [
    'https://cdn.example.com/book-data/demo/audio/03.mp3',
    'https://cdn.example.com/book-data/demo/book.json',
    'https://cdn.example.com/book-data/demo/pages/001.jpg',
    'https://cdn.example.com/book-data/demo/video/l1.mp4',
  ])
})

test('offline book URLs ignore empty and non-http entries', () => {
  const urls = collectBookUrls({
    id: 'demo', assets: {}, manifestUrl: '/relative/book.json',
    manifest: { schemaVersion: 1, bookId: 'demo', title: 'Demo', publisherId: 'pep', pages: [{ page: 1, image: '', items: [], resources: [{ id: 'r', kind: 'audio', title: 'x', src: '' }] }] },
  })
  assert.deepEqual(urls, [])
})

test('corrupt offline metadata is ignored instead of crashing the dialog', () => {
  const original = globalThis.localStorage
  const store = new Map()
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: key => { store.delete(key) },
  }
  try {
    store.set('pep:offline-books:v1', JSON.stringify({
      good: { bookId: 'good', title: ' Good ', cachedAt: 100, bytes: 2048, urls: ['https://example.test/a.jpg'] },
      noUrls: { title: 'No urls', cachedAt: 5, bytes: 1 },
      stringUrls: { urls: 'oops', cachedAt: 7 },
      nullEntry: null,
      badNumbers: { urls: ['https://example.test/b.jpg', 3, null, ''], cachedAt: 'yesterday', bytes: 'many' },
      ['__proto__']: { title: 'Prototype key', cachedAt: 8, bytes: 1, urls: ['https://example.test/proto.jpg'] },
    }))
    assert.deepEqual(offlineStatus('good'), {
      bookId: 'good', title: 'Good', cachedAt: 100, bytes: 2048, urls: ['https://example.test/a.jpg'],
    })
    // 没有 urls 数组的记录无法支撑“N 个资源”和移除缓存，应当整体忽略。
    assert.equal(offlineStatus('noUrls'), undefined)
    assert.equal(offlineStatus('stringUrls'), undefined)
    assert.equal(offlineStatus('nullEntry'), undefined)
    assert.deepEqual(offlineStatus('badNumbers'), {
      bookId: 'badNumbers', title: 'badNumbers', cachedAt: 0, bytes: 0, urls: ['https://example.test/b.jpg'],
    })
    assert.deepEqual(offlineStatus('__proto__'), {
      bookId: '__proto__', title: 'Prototype key', cachedAt: 8, bytes: 1, urls: ['https://example.test/proto.jpg'],
    })
    assert.deepEqual(listOfflineBooks().map(meta => meta.bookId), ['good', '__proto__', 'badNumbers'])
    store.set('pep:offline-books:v1', JSON.stringify(['not', 'an', 'object']))
    assert.deepEqual(listOfflineBooks(), [])
  } finally {
    if (original === undefined) delete globalThis.localStorage
    else globalThis.localStorage = original
  }
})

test('a stalled offline resource times out and the remaining queue finishes partially', async () => {
  const originalWindow = globalThis.window
  const originalCaches = globalThis.caches
  const originalLocation = globalThis.location
  const originalLocalStorage = globalThis.localStorage
  const originalFetch = globalThis.fetch
  const originalSetTimeout = globalThis.setTimeout
  const metadata = new Map()
  const requests = []
  const saved = new Map()
  const cache = { match: async () => undefined, put: async (url, response) => { saved.set(url, response.clone()) } }
  globalThis.location = { origin: 'https://cdn.example.com' }
  globalThis.caches = { open: async () => cache }
  globalThis.window = { caches: globalThis.caches }
  globalThis.localStorage = { getItem: key => metadata.get(key) ?? null, setItem: (key, value) => metadata.set(key, String(value)) }
  globalThis.setTimeout = (callback, ms, ...args) => originalSetTimeout(callback, Math.min(ms, 30), ...args)
  globalThis.fetch = (url, init = {}) => {
    requests.push({ url: String(url), mode: init.mode })
    if (String(url).endsWith('/book.json')) return Promise.resolve(new Response('manifest'))
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
  }
  try {
    const book = {
      id: 'partial', remote: true, manifestUrl: 'https://cdn.example.com/book-data/partial/book.json', assets: {},
      manifest: { schemaVersion: 1, bookId: 'partial', title: 'Partial', publisherId: 'pep', pages: [{ page: 1, image: 'https://cdn.example.com/book-data/partial/1.jpg', items: [] }] },
    }
    const started = Date.now()
    const result = await cacheBook(book, () => {})
    // 30ms 的内部超时在并行跑整套测试时可能被调度延迟；2s 仍远小于真实的 20s 超时，
    // 足以证明请求是有界结束而不是挂起。
    assert(Date.now() - started < 2000, 'a stalled resource must settle with a bounded timeout')
    assert.equal(saved.size, 1)
    assert.deepEqual(result.failures, ['https://cdn.example.com/book-data/partial/1.jpg'])
    assert.equal(result.meta.urls.length, 1)
    assert(requests.every(request => request.mode === 'cors'), 'a timed-out CORS attempt must not start an unbounded fallback request')
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
    if (originalLocation === undefined) delete globalThis.location
    else globalThis.location = originalLocation
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
    globalThis.fetch = originalFetch
    globalThis.setTimeout = originalSetTimeout
  }
})

test('cancelling an offline download aborts active fetches and settles promptly', async () => {
  const originalWindow = globalThis.window
  const originalCaches = globalThis.caches
  const originalLocation = globalThis.location
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.location = { origin: 'https://cdn.example.com' }
  globalThis.caches = { open: async () => ({ match: async () => undefined, put: async () => {} }) }
  globalThis.window = { caches: globalThis.caches }
  globalThis.fetch = (url, init = {}) => new Promise((_, reject) => {
    requests.push({ url, signal: init.signal })
    const abort = () => reject(new DOMException('Aborted', 'AbortError'))
    if (init.signal?.aborted) abort()
    else init.signal?.addEventListener('abort', abort, { once: true })
  })
  try {
    const controller = new AbortController()
    const book = {
      id: 'pending', remote: true, manifestUrl: 'https://cdn.example.com/book-data/pending/book.json', assets: {},
      manifest: { schemaVersion: 1, bookId: 'pending', title: 'Pending', publisherId: 'pep', pages: [{ page: 1, image: 'https://cdn.example.com/book-data/pending/1.jpg', items: [] }] },
    }
    const pending = cacheBook(book, () => {}, controller.signal)
    const settled = pending.then(value => ({ value }), error => ({ error }))
    await new Promise(resolve => setImmediate(resolve))
    controller.abort()
    const result = await Promise.race([
      settled,
      new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), 250)),
    ])
    assert.equal(result.timedOut, undefined, 'the task must not stay pending after cancel')
    assert.equal(result.error?.name, 'AbortError')
    assert(requests.length > 0)
    assert(requests.every(request => request.signal instanceof AbortSignal && request.signal.aborted))
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
    if (originalLocation === undefined) delete globalThis.location
    else globalThis.location = originalLocation
    globalThis.fetch = originalFetch
  }
})

test('removing one book preserves cache URLs referenced by another book', async () => {
  const originalWindow = globalThis.window
  const originalCaches = globalThis.caches
  const originalLocalStorage = globalThis.localStorage
  const saved = new Map([
    ['https://example.test/shared.mp3', new Response('shared')],
    ['https://example.test/first-only.jpg', new Response('first')],
  ])
  const cache = {
    match: async url => saved.get(String(url))?.clone(),
    delete: async url => saved.delete(String(url)),
  }
  const store = new Map([['pep:offline-books:v1', JSON.stringify({
    first: { title: 'First', urls: ['https://example.test/shared.mp3', 'https://example.test/first-only.jpg'] },
    second: { title: 'Second', urls: ['https://example.test/shared.mp3'] },
  })]])
  globalThis.caches = { open: async name => { assert.equal(name, BOOK_CACHE); return cache } }
  globalThis.window = { caches: globalThis.caches }
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) }
  try {
    await removeBookCache('first')
    assert.equal(saved.has('https://example.test/shared.mp3'), true)
    assert.equal(saved.has('https://example.test/first-only.jpg'), false)
    assert.deepEqual(offlineStatus('second')?.urls, ['https://example.test/shared.mp3'])
    assert.equal(offlineStatus('first'), undefined)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
  }
})

test('a cache deletion error keeps offline metadata available for retry', async () => {
  const originalWindow = globalThis.window
  const originalCaches = globalThis.caches
  const originalLocalStorage = globalThis.localStorage
  const url = 'https://example.test/kept.jpg'
  const store = new Map([['pep:offline-books:v1', JSON.stringify({ demo: { title: 'Demo', urls: [url] } })]])
  globalThis.caches = { open: async () => ({ delete: async () => { throw new Error('storage unavailable') } }) }
  globalThis.window = { caches: globalThis.caches }
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) }
  try {
    await assert.rejects(removeBookCache('demo'), /storage unavailable/)
    assert.deepEqual(offlineStatus('demo')?.urls, [url])
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
  }
})

test('saving cached responses without writable metadata reports failure', async () => {
  const originalWindow = globalThis.window
  const originalCaches = globalThis.caches
  const originalLocation = globalThis.location
  const originalLocalStorage = globalThis.localStorage
  const originalFetch = globalThis.fetch
  const saved = new Map()
  const cache = { match: async () => undefined, put: async (url, response) => { saved.set(String(url), response.clone()) } }
  globalThis.location = { origin: 'https://example.test' }
  globalThis.caches = { open: async () => cache }
  globalThis.window = { caches: globalThis.caches }
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('storage disabled') } }
  globalThis.fetch = async () => new Response('cached')
  try {
    const book = { id: 'demo', remote: true, manifestUrl: 'https://example.test/book.json', assets: {}, manifest: { title: 'Demo', pages: [] } }
    await assert.rejects(cacheBook(book, () => {}), /离线记录无法保存/)
    assert.equal(saved.size, 1)
    assert.equal(offlineStatus('demo'), undefined)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
    if (originalLocation === undefined) delete globalThis.location
    else globalThis.location = originalLocation
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
    globalThis.fetch = originalFetch
  }
})

test('removing cached responses without writable metadata reports failure', async () => {
  const originalWindow = globalThis.window
  const originalCaches = globalThis.caches
  const originalLocalStorage = globalThis.localStorage
  const url = 'https://example.test/remove.jpg'
  const saved = new Set([url])
  const store = new Map([['pep:offline-books:v1', JSON.stringify({ demo: { title: 'Demo', urls: [url] } })]])
  globalThis.caches = { open: async () => ({ delete: async value => saved.delete(String(value)) }) }
  globalThis.window = { caches: globalThis.caches }
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: () => { throw new Error('storage disabled') } }
  try {
    await assert.rejects(removeBookCache('demo'), /离线记录无法更新/)
    assert.equal(saved.has(url), false)
    assert.deepEqual(offlineStatus('demo')?.urls, [url])
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
  }
})

test('updating an offline book refreshes cached URLs', async () => {
  const originalWindow = globalThis.window
  const originalCaches = globalThis.caches
  const originalLocation = globalThis.location
  const originalLocalStorage = globalThis.localStorage
  const originalFetch = globalThis.fetch
  const urls = ['https://example.test/book-data/demo/book.json', 'https://example.test/book-data/demo/page.jpg']
  const saved = new Map(urls.map(url => [url, new Response('old')]))
  const requests = []
  const cache = {
    match: async url => saved.get(String(url))?.clone(),
    put: async (url, response) => { saved.set(String(url), response.clone()) },
  }
  const store = new Map()
  globalThis.location = { origin: 'https://example.test' }
  globalThis.caches = { open: async () => cache }
  globalThis.window = { caches: globalThis.caches }
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) }
  globalThis.fetch = async url => { requests.push(String(url)); return new Response(`new:${url}`) }
  try {
    const book = { id: 'demo', remote: true, manifestUrl: urls[0], assets: {}, manifest: { title: 'Demo', pages: [{ page: 1, image: urls[1], items: [] }] } }
    const result = await cacheBook(book, () => {}, undefined, { refreshExisting: true })
    assert.deepEqual(requests.sort(), [...urls].sort())
    assert.equal(await saved.get(urls[0]).text(), `new:${urls[0]}`)
    assert.equal(await saved.get(urls[1]).text(), `new:${urls[1]}`)
    assert.deepEqual(result.failures, [])
    assert.deepEqual(result.meta.urls.sort(), [...urls].sort())
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
    if (originalLocation === undefined) delete globalThis.location
    else globalThis.location = originalLocation
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
    globalThis.fetch = originalFetch
  }
})

test('failed offline refresh keeps its previous cached response', async () => {
  const originalWindow = globalThis.window
  const originalCaches = globalThis.caches
  const originalLocation = globalThis.location
  const originalLocalStorage = globalThis.localStorage
  const originalFetch = globalThis.fetch
  const urls = ['https://example.test/book-data/demo/book.json', 'https://example.test/book-data/demo/page.jpg']
  const saved = new Map(urls.map(url => [url, new Response(`old:${url}`)]))
  const cache = {
    match: async url => saved.get(String(url))?.clone(),
    put: async (url, response) => { saved.set(String(url), response.clone()) },
  }
  const store = new Map()
  globalThis.location = { origin: 'https://example.test' }
  globalThis.caches = { open: async () => cache }
  globalThis.window = { caches: globalThis.caches }
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) }
  globalThis.fetch = async url => String(url) === urls[1] ? new Response('unavailable', { status: 503 }) : new Response(`new:${url}`)
  try {
    const book = { id: 'demo', remote: true, manifestUrl: urls[0], assets: {}, manifest: { title: 'Demo', pages: [{ page: 1, image: urls[1], items: [] }] } }
    const result = await cacheBook(book, () => {}, undefined, { refreshExisting: true })
    assert.equal(await saved.get(urls[0]).text(), `new:${urls[0]}`)
    assert.equal(await saved.get(urls[1]).text(), `old:${urls[1]}`)
    assert.deepEqual(result.failures, [urls[1]])
    assert.deepEqual(result.meta.urls.sort(), [...urls].sort())
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
    if (originalLocation === undefined) delete globalThis.location
    else globalThis.location = originalLocation
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
    globalThis.fetch = originalFetch
  }
})
