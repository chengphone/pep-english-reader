import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strToU8, zipSync } from 'fflate'
import { assertBookArchiveSize, unzipBookArchive } from '../src/bookArchive.ts'

const limits = { maxArchiveBytes: 4096, maxEntryBytes: 128, maxTotalBytes: 256, maxEntries: 4 }

test('book ZIP compressed size is checked before reading or unpacking', () => {
  assert.doesNotThrow(() => assertBookArchiveSize(4096, limits))
  assert.throws(() => assertBookArchiveSize(4097, limits), /不得超过/)
})

test('book ZIP rejects an oversized entry before decompression', async () => {
  const archive = zipSync({ 'book.json': strToU8('{"bookId":"demo"}'), 'pages/large.bin': new Uint8Array(129) })
  await assert.rejects(unzipBookArchive(archive, limits), /单个文件不得超过/)
})

test('book ZIP rejects excessive total expansion and entry count', async () => {
  const expanded = zipSync({ 'a.bin': new Uint8Array(100), 'b.bin': new Uint8Array(100), 'c.bin': new Uint8Array(100) })
  await assert.rejects(unzipBookArchive(expanded, { ...limits, maxTotalBytes: 250 }), /解压后不得超过/)
  await assert.rejects(unzipBookArchive(expanded, { ...limits, maxTotalBytes: 512, maxEntries: 2 }), /包含过多文件/)
})

test('book ZIP rejects a top-level prototype-mutating filename', async () => {
  const archive = zipSync({ x12345678: strToU8('ignored') })
  const dangerousName = strToU8('__proto__')
  archive.set(dangerousName, 30)
  let centralOffset = -1
  for (let offset = 0; offset < archive.length - 4; offset++) {
    if (archive[offset] === 0x50 && archive[offset + 1] === 0x4b && archive[offset + 2] === 0x01 && archive[offset + 3] === 0x02) {
      centralOffset = offset
      break
    }
  }
  assert.notEqual(centralOffset, -1)
  archive.set(dangerousName, centralOffset + 46)
  await assert.rejects(unzipBookArchive(archive, limits), /不支持的文件名/)
})

console.log('Passed: archive byte limit, per-entry expansion limit, total expansion limit, entry-count limit, and prototype-mutating filename')
