import assert from 'node:assert/strict'
import { after, test } from 'node:test'

const originalLocalStorage = globalThis.localStorage

function installStore(rows) {
  const store = new Map([['pep:recordings:v1', JSON.stringify(rows)]])
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: key => { store.delete(key) },
  }
  return store
}

const { latestRecording, listRecordings } = await import('../src/reader/recordingStore.ts')

test('corrupt recording metadata is normalized instead of crashing the reader', () => {
  installStore([
    { id: 'ok', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 2.5, createdAt: 100 },
    { id: 'missing-duration', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', createdAt: 200 },
    { id: 'missing-time', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 1 },
    { id: 'string-duration', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: '3', createdAt: 300 },
    { id: 'bad-profile', profile: 'x', bookId: 'book', itemId: 'item', text: 'hello', mime: 'audio/webm', duration: 1, createdAt: 400 },
    { id: 'no-mime', profile: 'a', bookId: 'book', itemId: 'item', text: 'hello', duration: 1, createdAt: 500 },
    null,
    'nope',
  ])
  const rows = listRecordings('a', 'book', 'item')
  assert.deepEqual(rows.map(row => row.id), ['string-duration', 'missing-duration', 'ok', 'missing-time'])
  assert.equal(rows.find(row => row.id === 'missing-duration').duration, 0)
  assert.equal(rows.find(row => row.id === 'missing-time').createdAt, 0)
  assert.equal(rows.find(row => row.id === 'string-duration').duration, 3)
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

after(() => {
  if (originalLocalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalLocalStorage
})
