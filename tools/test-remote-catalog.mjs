import assert from 'node:assert/strict'
import { after, test } from 'node:test'

const originalFetch = globalThis.fetch
const originalLocation = globalThis.location
const originalLocalStorage = globalThis.localStorage

function installBase(href = 'https://example.test/pep-english-reader/?view=textbooks') {
  globalThis.location = { href, origin: 'https://example.test' }
  const store = new Map()
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: key => { store.delete(key) },
  }
  return store
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

const row = id => ({
  id,
  title: id,
  manifest: `book-data/${id}/book.json`,
  cover: `book-data/${id}/pages/001.jpg`,
  pages: 3,
})

installBase()
const {
  loadRemoteCatalog,
  loadRemoteCatalogDetailed,
  normalizeCatalog,
  readRemoteTranslation,
  writeRemotePageItems,
  writeRemoteTranslation,
} = await import('../src/remoteBooks.ts')

test('remote catalog skips only rows with unusable manifest URLs', () => {
  const base = new URL('https://example.test/pep-english-reader/remote-books.json')
  const entries = normalizeCatalog({
    books: [
      { id: 'ok', title: 'OK', manifest: 'book-data/ok/book.json', cover: 'cover.jpg' },
      { id: 'bad-cover', manifest: 'book-data/bc/book.json', cover: 'http://[' },
      { id: 'bad-manifest', manifest: 'http://[' },
      { id: 'js', manifest: 'javascript:alert(1)' },
      { id: 'ok', title: 'Duplicate' },
      null,
    ],
  }, base)
  assert.deepEqual(entries.map(entry => entry.id), ['ok', 'bad-cover'])
  assert.equal(entries[0].manifest, 'https://example.test/pep-english-reader/book-data/ok/book.json')
  assert.equal(entries[0].cover, 'https://example.test/pep-english-reader/cover.jpg')
  assert.equal(entries[1].cover, undefined)
  assert.deepEqual(normalizeCatalog([], base), [])
  assert.throws(() => normalizeCatalog({}, base), /格式无效/)
})

test('a failed default catalog reports an error instead of pretending the library is empty', async () => {
  installBase()
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  const result = await loadRemoteCatalogDetailed()
  assert.deepEqual(result.entries, [])
  assert.match(result.error, /网络请求失败/)

  globalThis.fetch = async () => new Response('', { status: 500 })
  assert.match((await loadRemoteCatalogDetailed()).error, /HTTP 500/)

  globalThis.fetch = async () => new Response('not json', { status: 200 })
  assert.match((await loadRemoteCatalogDetailed()).error, /格式无效/)

  globalThis.fetch = async () => jsonResponse({ books: [{ id: 'bad', manifest: 'http://[' }] })
  assert.match((await loadRemoteCatalogDetailed()).error, /格式无效/)
})

test('a 404 default catalog is a legitimate empty library', async () => {
  installBase()
  globalThis.fetch = async () => new Response('', { status: 404 })
  const result = await loadRemoteCatalogDetailed()
  assert.deepEqual(result.entries, [])
  assert.equal(result.error, undefined)
})

test('a successful catalog resolves relative URLs and keeps the compatibility API', async () => {
  installBase()
  globalThis.fetch = async () => jsonResponse({ books: [row('begin-1')] })
  const result = await loadRemoteCatalogDetailed()
  assert.equal(result.entries.length, 1)
  assert.equal(result.entries[0].manifest, 'https://example.test/pep-english-reader/book-data/begin-1/book.json')
  assert.equal(result.error, undefined)
  assert.equal((await loadRemoteCatalog()).length, 1)
})

test('an explicit custom catalog still surfaces its own failures', async () => {
  installBase('https://example.test/pep-english-reader/?catalog=https://example.test/custom.json')
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(loadRemoteCatalogDetailed(), /网络请求失败/)
})

test('remote storage writes report when localStorage rejects them', () => {
  const store = installBase()
  assert.equal(writeRemoteTranslation('book', 'item', '你好'), true)
  assert.equal(readRemoteTranslation('book', 'item'), '你好')
  assert.equal(writeRemotePageItems('book', 1, [{ id: 'item', text: 'hello', order: 0, rects: [] }]), true)

  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: () => { throw new Error('quota exceeded') },
    removeItem: () => { throw new Error('blocked') },
  }
  assert.equal(writeRemoteTranslation('book', 'item2', '翻译'), false)
  assert.equal(writeRemotePageItems('book', 2, []), false)
})

after(() => {
  globalThis.fetch = originalFetch
  if (originalLocation === undefined) delete globalThis.location
  else globalThis.location = originalLocation
  if (originalLocalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalLocalStorage
})
