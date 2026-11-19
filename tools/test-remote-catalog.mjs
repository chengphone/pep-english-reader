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
  loadRemoteBook,
  loadRemoteCatalog,
  loadRemoteCatalogDetailed,
  normalizeCatalog,
  readRemotePageItems,
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

test('catalog IDs stay unique after trimming whitespace', () => {
  const base = new URL('https://example.test/pep-english-reader/remote-books.json')
  const entries = normalizeCatalog({ books: [
    { id: ' demo ', title: 'First', manifest: 'one.json' },
    { id: 'demo', title: 'Second', manifest: 'two.json' },
    { id: 'book', manifest: 'three.json' },
    { id: 'book', manifest: 'four.json' },
  ] }, base)
  assert.deepEqual(entries.map(entry => entry.id), ['demo', 'book'])
  assert.equal(entries[0].title, 'First')
  assert.equal(entries[0].manifest, 'https://example.test/pep-english-reader/one.json')
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length)
})

test('malformed remote and local hotspots do not break a usable page', async () => {
  const store = installBase()
  store.set('pep:remote-items:demo:1', JSON.stringify([null, { broken: true }]))
  globalThis.fetch = async () => jsonResponse({
    schemaVersion: 1,
    bookId: 'demo',
    title: 'Demo',
    publisherId: 'test',
    pages: [{
      page: 1,
      image: 'page.jpg',
      items: [null, { broken: true }, { id: 'valid', text: 'hello', order: 0, rects: [[0.1, 0.1, 0.4, 0.3], [0.8, 0.1, 0.2, 0.3], [-0.1, 0.1, 0.2, 0.3], [0.1, 0.1, 1.2, 0.3]] }],
    }],
  })
  const book = await loadRemoteBook({ id: 'demo', title: 'Demo', manifest: 'https://example.test/book.json' })
  assert.equal(book.manifest.pages.length, 1)
  assert.deepEqual(book.manifest.pages[0].items.map(item => item.id), ['valid'])
  assert.deepEqual(book.manifest.pages[0].items[0].rects, [[0.1, 0.1, 0.4, 0.3]])
  assert.equal(readRemotePageItems('demo', 1), undefined)
})

test('resources with invalid durations are dropped from a remote manifest', async () => {
  installBase()
  // JSON 里的 1e999 会解析成 Infinity；NaN 和负数同样不能进入播放器状态。
  const fixture = {
    schemaVersion: 1,
    bookId: 'demo',
    title: 'Demo',
    publisherId: 'test',
    pages: [{
      page: 1,
      image: 'page.jpg',
      items: [],
      resources: [
        { id: 'inf', kind: 'audio', src: 'a.mp3', duration: Number.POSITIVE_INFINITY },
        { id: 'negative', kind: 'audio', src: 'b.mp3', duration: -3 },
        { id: 'ok', kind: 'audio', src: 'c.mp3', duration: 12.5 },
        { id: 'no-duration', kind: 'video', src: 'd.mp4' },
      ],
    }],
  }
  // JSON.stringify 会把 Infinity 写成 null，这里手动还原成 JSON 数字 1e999。
  const raw = JSON.stringify(fixture).replace('"duration":null', '"duration":1e999')
  globalThis.fetch = async () => new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } })
  const book = await loadRemoteBook({ id: 'demo', title: 'Demo', manifest: 'https://example.test/book.json' })
  assert.deepEqual(book.manifest.pages[0].resources.map(resource => resource.id), ['ok', 'no-duration'])
  assert.equal(book.manifest.pages[0].resources[0].duration, 12.5)
})

test('non-string manifest titles fall back to the catalog title', async () => {
  installBase()
  const page = { page: 1, image: 'page.jpg', items: [] }
  const fetchTitle = title => { globalThis.fetch = async () => jsonResponse({ schemaVersion: 1, bookId: 'demo', title, publisherId: 'test', pages: [page] }) }
  // 标题会进入阅读器、统计弹窗和 document.title；数字或对象会让 .trim() 抛错。
  for (const title of [123, { bad: true }, '   ', null]) {
    fetchTitle(title)
    const book = await loadRemoteBook({ id: 'demo', title: 'Demo', manifest: 'https://example.test/book.json' })
    assert.equal(book.manifest.title, 'Demo')
  }
  fetchTitle('  Demo Book  ')
  const book = await loadRemoteBook({ id: 'demo', title: 'Demo', manifest: 'https://example.test/book.json' })
  assert.equal(book.manifest.title, 'Demo Book')
})

test('non-string display fields are dropped from remote items and pages', async () => {
  installBase()
  const items = [
    { id: 'bad-object', text: 'apple', order: 0, rects: [], translation: { zh: '苹果' } },
    { id: 'bad-number', text: 'pear', order: 1, rects: [], translation: 12 },
    { id: 'bad-array', text: 'peach', order: 2, rects: [], translation: ['桃'] },
    { id: 'bad-audio', text: 'grape', order: 3, rects: [], audio: { src: 'x.mp3' } },
    { id: 'ok', text: 'banana', order: 4, rects: [], translation: '香蕉' },
    { id: 'fallback', text: 'orange', order: 5, rects: [], translation: { zh: '橙子' } },
  ]
  globalThis.fetch = async () => jsonResponse({ schemaVersion: 1, bookId: 'demo', title: 'Demo', publisherId: 'test', pages: [{ page: 1, image: 'page.jpg', printedPage: { zh: '封二' }, items }] })
  assert.equal(writeRemoteTranslation('demo', 'fallback', '本地释义'), true)
  const book = await loadRemoteBook({ id: 'demo', title: 'Demo', manifest: 'https://example.test/book.json' })
  // 书上页码会直接进阅读器顶栏；对象值必须退回物理页码。
  assert.equal(book.manifest.pages[0].printedPage, undefined)
  const byId = new Map(book.manifest.pages[0].items.map(item => [item.id, item]))
  // 释义会直接进入 React 子节点；对象会让单词列表和复习卡渲染时抛错。
  assert.equal(byId.get('bad-object').translation, undefined)
  assert.equal(byId.get('bad-number').translation, undefined)
  assert.equal(byId.get('bad-array').translation, undefined)
  // 点读音源会进入 Audio 构造器；非字符串不能留在条目里。
  assert.equal(byId.get('bad-audio').audio, undefined)
  assert.equal(byId.get('ok').translation, '香蕉')
  // 清单里的坏释义不能遮住管理员在本机补充的翻译。
  assert.equal(byId.get('fallback').translation, '本地释义')
  // 合法的数字页码保持不变。
  globalThis.fetch = async () => jsonResponse({ schemaVersion: 1, bookId: 'demo', title: 'Demo', publisherId: 'test', pages: [{ page: 1, image: 'page.jpg', printedPage: 42, items: [] }] })
  const numbered = await loadRemoteBook({ id: 'demo', title: 'Demo', manifest: 'https://example.test/book.json' })
  assert.equal(numbered.manifest.pages[0].printedPage, 42)
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

test('an explicitly cleared remote page keeps its empty hotspot override', async () => {
  installBase()
  globalThis.fetch = async () => jsonResponse({
    schemaVersion: 1,
    bookId: 'demo',
    title: 'Demo',
    publisherId: 'test',
    pages: [{ page: 1, image: 'page.jpg', items: [{ id: 'valid', text: 'hello', order: 0, rects: [] }] }],
  })
  assert.equal(writeRemotePageItems('demo', 1, []), true)
  assert.deepEqual(readRemotePageItems('demo', 1), [])
  // 清空后重新打开教材，这一页不应再被清单里的原始热区覆盖。
  const cleared = await loadRemoteBook({ id: 'demo', title: 'Demo', manifest: 'https://example.test/book.json' })
  assert.deepEqual(cleared.manifest.pages[0].items, [])
  // 再存回一个热区时正常覆盖。
  assert.equal(writeRemotePageItems('demo', 1, [{ id: 'only', text: 'x', order: 1, rects: [] }]), true)
  const restored = await loadRemoteBook({ id: 'demo', title: 'Demo', manifest: 'https://example.test/book.json' })
  assert.deepEqual(restored.manifest.pages[0].items.map(item => item.id), ['only'])
})

test('remote hotspot overrides are normalized against the whole book', async () => {
  installBase()
  assert.equal(writeRemotePageItems('demo', 1, [
    { id: 'same', text: 'first', order: 1, rects: [] },
    { id: 'same', text: 'second', order: 2, rects: [] },
    { id: 'same~2', text: 'third', order: 3, rects: [] },
  ]), true)
  globalThis.fetch = async () => jsonResponse({
    schemaVersion: 1,
    bookId: 'demo',
    title: 'Demo',
    publisherId: 'test',
    pages: [
      { page: 1, image: 'one.jpg', items: [{ id: 'base', text: 'base', rects: [] }] },
      { page: 2, image: 'two.jpg', items: [{ id: 'same~2', text: 'other page', rects: [] }] },
    ],
  })
  const book = await loadRemoteBook({ id: 'demo', title: 'Demo', manifest: 'https://example.test/book.json' })
  const ids = book.manifest.pages.flatMap(page => page.items.map(item => item.id))
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(ids, ['same', 'same~3', 'same~2', 'same~2~2'])
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
