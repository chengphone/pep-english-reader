import assert from 'node:assert/strict'
import { after, test } from 'node:test'

const originalLocalStorage = globalThis.localStorage
const originalIndexedDB = globalThis.indexedDB

function installStore(rows) {
  const store = new Map([['pep:recordings:v1', JSON.stringify(rows)]])
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: key => { store.delete(key) },
  }
  return store
}

function installBlobDb(blobs, { failDelete = false, failPut = false } = {}) {
  globalThis.indexedDB = {
    open() {
      const request = {}
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          close() {},
          transaction() {
            const transaction = {
              objectStore() {
                return {
                  put: row => { if (failPut) throw new Error('put blocked'); blobs.set(row.id, row.blob) },
                  delete: id => { if (failDelete) throw new Error('delete blocked'); blobs.delete(id) },
                  get(id) {
                    const getRequest = {}
                    queueMicrotask(() => {
                      getRequest.result = blobs.has(id) ? { id, blob: blobs.get(id) } : undefined
                      getRequest.onsuccess?.()
                    })
                    return getRequest
                  },
                }
              },
            }
            queueMicrotask(() => transaction.oncomplete?.())
            return transaction
          },
        }
        request.onsuccess?.()
      })
      return request
    },
  }
  return blobs
}

const { deleteRecording, latestRecording, listRecordings, saveRecording } = await import('../src/reader/recordingStore.ts')

test('corrupt recording metadata is normalized instead of crashing the reader', () => {
  installStore([
    { id: 'ok', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 2.5, createdAt: 100 },
    { id: 'null-score', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 1, score: null, createdAt: 150 },
    { id: 'string-score', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 1, score: '88', createdAt: 50 },
    { id: 'overflow-score', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 1, score: 250, createdAt: 25 },
    { id: 'missing-duration', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', createdAt: 200 },
    { id: 'missing-time', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 1 },
    { id: 'string-duration', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: '3', createdAt: 300 },
    { id: 'bad-profile', profile: 'x', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 1, createdAt: 400 },
    { id: 'no-mime', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', duration: 1, createdAt: 500 },
    null,
    'nope',
  ])
  const rows = listRecordings('a', 'book', 'item')
  assert.deepEqual(rows.map(row => row.id), ['string-duration', 'missing-duration', 'null-score', 'ok', 'string-score', 'overflow-score', 'missing-time'])
  assert.equal(rows.find(row => row.id === 'missing-duration').duration, 0)
  assert.equal(rows.find(row => row.id === 'missing-time').createdAt, 0)
  assert.equal(rows.find(row => row.id === 'string-duration').duration, 3)
  // score 为 null 时保持“没有评分”，不能被 Number(null) 变成 0 分。
  assert.equal(rows.find(row => row.id === 'null-score').score, undefined)
  assert.equal(rows.find(row => row.id === 'string-score').score, 88)
  assert.equal(rows.find(row => row.id === 'overflow-score').score, 100)
  assert.equal(latestRecording('a', 'book', 'item').id, 'string-duration')
  assert.equal(latestRecording('b', 'book', 'item'), undefined)
})

test('a corrupt recordings store is treated as empty', () => {
  const store = installStore([])
  store.set('pep:recordings:v1', 'not json')
  assert.deepEqual(listRecordings('a', 'book', 'item'), [])
  store.set('pep:recordings:v1', JSON.stringify({ rows: [] }))
  assert.deepEqual(listRecordings('a', 'book', 'item'), [])
})

test('metadata quota failure rejects and removes the newly written orphan blob', async () => {
  const blobs = new Map()
  globalThis.indexedDB = {
    open() {
      const request = {}
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          close() {},
          transaction() {
            const transaction = {
              objectStore() {
                return {
                  put: row => blobs.set(row.id, row.blob),
                  delete: id => blobs.delete(id),
                  get(id) {
                    const getRequest = {}
                    queueMicrotask(() => {
                      getRequest.result = blobs.has(id) ? { id, blob: blobs.get(id) } : undefined
                      getRequest.onsuccess?.()
                    })
                    return getRequest
                  },
                }
              },
            }
            queueMicrotask(() => transaction.oncomplete?.())
            return transaction
          },
        }
        request.onsuccess?.()
      })
      return request
    },
  }
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => { throw new DOMException('quota exceeded', 'QuotaExceededError') },
    removeItem: () => {},
  }
  try {
    await assert.rejects(saveRecording({
      profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', duration: 1, mime: 'audio/webm', blob: new Blob(['clip']),
    }), /录音元数据无法保存/)
    assert.equal(blobs.size, 0)
    assert.deepEqual(listRecordings('a', 'book', 'item'), [])
  } finally {
    if (originalIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = originalIndexedDB
  }
})

test('recordings created in the same millisecond still receive different blob ids', async () => {
  const originalNow = Date.now
  const blobs = installBlobDb(new Map())
  installStore([])
  Date.now = () => 123
  try {
    const options = { profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', duration: 1, mime: 'audio/webm', blob: new Blob(['clip']) }
    const first = await saveRecording(options)
    const second = await saveRecording(options)
    assert.equal(first.createdAt, second.createdAt)
    assert.notEqual(first.id, second.id)
    assert.equal(blobs.size, 2)
    assert.equal(listRecordings('a', 'book', 'item').length, 2)
  } finally {
    Date.now = originalNow
    if (originalIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = originalIndexedDB
  }
})

test('failed metadata update restores a deleted recording blob and allows retry', async () => {
  const meta = { id: 'clip-restore', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 1, createdAt: 1 }
  const storage = installStore([meta])
  const blobs = installBlobDb(new Map([[meta.id, new Blob(['clip'])]]))
  let blocked = true
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new DOMException('quota exceeded', 'QuotaExceededError'); storage.set(key, String(value)) },
    removeItem: key => storage.delete(key),
  }
  try {
    await assert.rejects(deleteRecording(meta.id), /录音数据已恢复/)
    assert.equal(blobs.has(meta.id), true)
    assert.equal(latestRecording('a', 'book', 'item')?.id, meta.id)
    blocked = false
    await deleteRecording(meta.id)
    assert.equal(blobs.has(meta.id), false)
    assert.equal(latestRecording('a', 'book', 'item'), undefined)
  } finally {
    if (originalIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = originalIndexedDB
  }
})

test('metadata failure without an existing blob does not claim that audio was restored', async () => {
  const meta = { id: 'clip-missing-blob', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 1, createdAt: 3 }
  const storage = installStore([meta])
  installBlobDb(new Map())
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: () => { throw new DOMException('quota exceeded', 'QuotaExceededError') },
    removeItem: key => storage.delete(key),
  }
  try {
    await assert.rejects(deleteRecording(meta.id), /录音记录无法更新；/)
    assert.equal(latestRecording('a', 'book', 'item')?.id, meta.id)
  } finally {
    if (originalIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = originalIndexedDB
  }
})

test('failed IndexedDB deletion keeps recording metadata and blob available', async () => {
  const meta = { id: 'clip-delete-error', profile: 'b', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 1, createdAt: 2 }
  installStore([meta])
  const blobs = installBlobDb(new Map([[meta.id, new Blob(['clip'])]]), { failDelete: true })
  try {
    await assert.rejects(deleteRecording(meta.id), /delete blocked/)
    assert.equal(blobs.has(meta.id), true)
    assert.equal(latestRecording('b', 'book', 'item')?.id, meta.id)
  } finally {
    if (originalIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = originalIndexedDB
  }
})

after(() => {
  if (originalLocalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalLocalStorage
  if (originalIndexedDB === undefined) delete globalThis.indexedDB
  else globalThis.indexedDB = originalIndexedDB
})
