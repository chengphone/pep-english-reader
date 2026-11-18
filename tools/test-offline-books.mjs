import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cacheBook, collectBookUrls } from '../src/reader/offlineBooks.ts'

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

test('a stalled offline resource times out and the remaining queue finishes partially', async () => {
  const originalWindow = globalThis.window
  const originalCaches = globalThis.caches
  const originalLocation = globalThis.location
  const originalFetch = globalThis.fetch
  const originalSetTimeout = globalThis.setTimeout
  const requests = []
  const saved = new Map()
  const cache = { match: async () => undefined, put: async (url, response) => { saved.set(url, response.clone()) } }
  globalThis.location = { origin: 'https://cdn.example.com' }
  globalThis.caches = { open: async () => cache }
  globalThis.window = { caches: globalThis.caches }
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
    assert(Date.now() - started < 500)
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
