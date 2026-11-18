import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPictureOffline, savePictureOffline } from '../src/picture/offlinePicture.ts'

function makeBook(overrides = {}) {
  return {
    id: 'demo',
    manifestUrl: 'https://example.test/picture-data/books/demo/manifest.json',
    manifest: {
      audio: 'https://example.test/picture-data/books/demo/audio.mp3',
      cover: 'https://example.test/picture-data/books/demo/cover.jpg',
      pages: [{ image: 'https://example.test/picture-data/books/demo/page.jpg' }],
      ...overrides,
    },
  }
}

function installEnvironment(fetchImpl = async () => new Response('asset')) {
  const originalCaches = globalThis.caches
  const originalLocation = globalThis.location
  const originalFetch = globalThis.fetch
  const values = new Map()
  const cache = {
    match: async url => values.get(String(url))?.clone(),
    put: async (url, response) => { values.set(String(url), response.clone()) },
  }
  globalThis.location = { origin: 'https://example.test', href: 'https://example.test/pep-english-reader/' }
  globalThis.caches = { open: async () => cache }
  globalThis.fetch = fetchImpl
  return {
    values,
    restore() {
      if (originalCaches === undefined) delete globalThis.caches
      else globalThis.caches = originalCaches
      if (originalLocation === undefined) delete globalThis.location
      else globalThis.location = originalLocation
      globalThis.fetch = originalFetch
    },
  }
}

test('same-origin picture files are saved and verified from the shared cache', async () => {
  const env = installEnvironment()
  try {
    const states = []
    const saved = await savePictureOffline(makeBook(), state => states.push(state))
    assert.equal(saved.complete, true)
    assert.equal(saved.saved, saved.total)
    assert.equal(states.at(-1).complete, true)
    assert.equal((await checkPictureOffline(makeBook())).complete, true)
  } finally {
    env.restore()
  }
})

test('cross-origin files are not advertised or marked as offline complete', async () => {
  let fetches = 0
  const env = installEnvironment(async () => { fetches++; return new Response('asset') })
  try {
    const book = makeBook({ pages: [{ image: 'https://cdn.example.net/page.jpg' }] })
    const state = await checkPictureOffline(book)
    assert.deepEqual(state, { supported: false, total: 4, saved: 0, complete: false, reason: 'cross-origin' })
    const saved = await savePictureOffline(book, () => {})
    assert.equal(saved.complete, false)
    assert.equal(saved.reason, 'cross-origin')
    assert.equal(fetches, 0)
    assert.equal(env.values.size, 0)
  } finally {
    env.restore()
  }
})

test('cancelling a pending picture request aborts it and stops the queue', async () => {
  const env = installEnvironment((_url, init) => new Promise((_, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'))
    if (init.signal.aborted) abort()
    else init.signal.addEventListener('abort', abort, { once: true })
  }))
  try {
    const controller = new AbortController()
    const pending = savePictureOffline(makeBook(), () => {}, controller.signal, 500)
    const settled = pending.then(value => ({ value }), error => ({ error }))
    await new Promise(resolve => setImmediate(resolve))
    controller.abort()
    const result = await Promise.race([
      settled,
      new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), 200)),
    ])
    assert.equal(result.timedOut, undefined)
    assert.equal(result.error?.name, 'AbortError')
    assert.equal(env.values.size, 0)
  } finally {
    env.restore()
  }
})

test('a stalled picture file times out and the rest of the queue completes as partial', async () => {
  const env = installEnvironment((_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  try {
    const started = Date.now()
    const state = await savePictureOffline(makeBook(), () => {}, undefined, 20)
    assert.equal(state.supported, true)
    assert.equal(state.complete, false)
    assert.equal(state.saved, 0)
    assert(Date.now() - started < 500)
  } finally {
    env.restore()
  }
})
