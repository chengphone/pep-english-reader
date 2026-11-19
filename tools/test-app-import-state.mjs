import assert from 'node:assert/strict'
import { test } from 'node:test'
import { importRouteIsCurrent, upsertImportedBook } from '../src/reader/importState.ts'

const book = (id, title = id) => ({ id, manifest: { title }, assets: {} })

test('an import may activate only while its starting route is still current', () => {
  assert.equal(importRouteIsCurrent(7, 7), true)
  assert.equal(importRouteIsCurrent(7, 8), false)
})

test('importing a book updates the in-memory list without a post-commit database read', () => {
  const first = book('first')
  const second = book('second')
  const replacement = book('first', 'Renamed in archive')
  assert.deepEqual(upsertImportedBook([first, second], replacement), [replacement, second])
  assert.deepEqual(upsertImportedBook([first], second), [first, second])
})
