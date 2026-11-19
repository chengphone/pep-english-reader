import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCustomHotspotId } from '../src/reader/hotspotIds.ts'

test('custom hotspot ids remain unique within one page and timestamp', () => {
  const used = new Set()
  const ids = [0, 1, 2, 0].map(sequence => {
    const id = createCustomHotspotId(4, used, 12345, sequence)
    used.add(id)
    return id
  })
  assert.deepEqual(ids, [
    'p004_custom_12345',
    'p004_custom_12345_1',
    'p004_custom_12345_2',
    'p004_custom_12345_3',
  ])
})
