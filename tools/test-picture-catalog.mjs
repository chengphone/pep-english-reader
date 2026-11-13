import assert from 'node:assert/strict'
import { after, test } from 'node:test'

const originalFetch = globalThis.fetch
const originalLocation = globalThis.location
const originalLocalStorage = globalThis.localStorage

function installBase(href = 'https://example.test/pep-english-reader/') {
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
  series: 'Series',
  level: 'starter',
  levelLabel: 'Level 1',
  themes: [],
  cover: 'cover.jpg',
  manifest: `books/${id}/book.json`,
  pages: 1,
  vocabulary: 2,
})

installBase()
const { loadPictureCatalog, loadPictureCatalogDetailed } = await import('../src/pictureBooks.ts')

test('successful catalog is cached and used when the network later fails', async () => {
  installBase()
  globalThis.fetch = async () => jsonResponse({ books: [row('a')] })
  const first = await loadPictureCatalogDetailed()
  assert.equal(first.entries.length, 1)
  assert.equal(first.error, undefined)
  assert.equal(first.cached, undefined)

  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  const second = await loadPictureCatalogDetailed()
  assert.equal(second.entries.length, 1)
  assert.equal(second.entries[0].id, 'a')
  assert.equal(second.cached, true)
  assert.equal(second.error, undefined)
})

test('network failure without a cached copy reports an error instead of an empty catalog', async () => {
  installBase()
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  const result = await loadPictureCatalogDetailed()
  assert.deepEqual(result.entries, [])
  assert.match(result.error, /网络请求失败/)
})

test('a 404 catalog is a legitimate empty library, not a load failure', async () => {
  installBase()
  globalThis.fetch = async () => new Response('', { status: 404 })
  const result = await loadPictureCatalogDetailed()
  assert.deepEqual(result.entries, [])
  assert.equal(result.error, undefined)
})

test('invalid JSON and invalid catalog shapes are reported as format errors', async () => {
  installBase()
  globalThis.fetch = async () => new Response('not json', { status: 200, headers: { 'content-type': 'text/html' } })
  const badJson = await loadPictureCatalogDetailed()
  assert.match(badJson.error, /格式无效/)

  installBase()
  globalThis.fetch = async () => jsonResponse({ unexpected: [] })
  const badShape = await loadPictureCatalogDetailed()
  assert.match(badShape.error, /格式无效/)

  installBase()
  globalThis.fetch = async () => jsonResponse({ books: [{ id: 'bad', manifest: 'http://[' }] })
  const allInvalid = await loadPictureCatalogDetailed()
  assert.match(allInvalid.error, /格式无效/)
})

test('an explicit custom catalog still surfaces its own failures', async () => {
  installBase('https://example.test/pep-english-reader/?picture-catalog=https://example.test/custom.json')
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(loadPictureCatalogDetailed(), /网络请求失败/)
})

test('catalog entries resolve relative to the catalog URL', async () => {
  installBase('https://example.test/pep-english-reader/?picture-catalog=https://example.test/custom/books.json')
  globalThis.fetch = async () => jsonResponse({ books: [row('a')] })
  const result = await loadPictureCatalogDetailed()
  assert.equal(result.entries[0].manifest, 'https://example.test/custom/books/a/book.json')
})

test('a catalog cached from a different catalog URL is not reused', async () => {
  installBase('https://example.test/pep-english-reader/?picture-catalog=https://example.test/custom/books.json')
  globalThis.fetch = async () => jsonResponse({ books: [row('a')] })
  assert.equal((await loadPictureCatalogDetailed()).entries.length, 1)

  // 同一份 localStorage，切回默认目录地址后断网：缓存里的相对路径属于另一个根，不能复用。
  globalThis.location = { href: 'https://example.test/pep-english-reader/', origin: 'https://example.test' }
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  const fallback = await loadPictureCatalogDetailed()
  assert.deepEqual(fallback.entries, [])
  assert.match(fallback.error, /网络请求失败/)
})

test('loadPictureCatalog keeps the entries-only compatibility API', async () => {
  installBase()
  globalThis.fetch = async () => jsonResponse({ books: [row('a')] })
  assert.equal((await loadPictureCatalog()).length, 1)
})

after(() => {
  globalThis.fetch = originalFetch
  if (originalLocation === undefined) delete globalThis.location
  else globalThis.location = originalLocation
  if (originalLocalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalLocalStorage
})
