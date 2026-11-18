import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assetObjectUrl, revokeBookObjectUrls } from '../src/assetUrls.ts'

function fakeApi() {
  let sequence = 0
  const created = []
  const revoked = []
  return {
    createObjectURL(blob) {
      const url = `blob:test/${++sequence}`
      created.push({ url, blob })
      return url
    },
    revokeObjectURL(url) {
      revoked.push(url)
    },
    created,
    revoked,
  }
}

test('asset URLs are reused per blob and replaced when a book is re-imported', () => {
  const api = fakeApi()
  const first = new Blob(['first'])
  const second = new Blob(['second'])
  const url1 = assetObjectUrl('book-a', 'pages/001.jpg', first, api)
  assert.equal(assetObjectUrl('book-a', 'pages/001.jpg', first, api), url1)
  assert.equal(api.created.length, 1)
  // 同一路径换了 Blob（重新导入）：撤销旧 URL，返回新 URL。
  const url2 = assetObjectUrl('book-a', 'pages/001.jpg', second, api)
  assert.notEqual(url2, url1)
  assert.deepEqual(api.revoked, [url1])
  // 不同教材的同名路径互不影响。
  const url3 = assetObjectUrl('book-b', 'pages/001.jpg', first, api)
  assert.notEqual(url3, url1)
  assert.equal(assetObjectUrl('book-b', 'pages/001.jpg', first, api), url3)
})

test('removing a book revokes only that book created URLs', () => {
  const api = fakeApi()
  const blob = new Blob(['data'])
  const a = assetObjectUrl('remove-a', 'pages/001.jpg', blob, api)
  const b = assetObjectUrl('remove-a', 'audio/001.mp3', blob, api)
  const c = assetObjectUrl('remove-b', 'pages/001.jpg', blob, api)
  revokeBookObjectUrls('remove-a', api)
  assert.deepEqual([...api.revoked].sort(), [a, b].sort())
  assert.equal(assetObjectUrl('remove-b', 'pages/001.jpg', blob, api), c)
  // 撤销后再次请求同一 Blob 会创建新的 URL，而不是返回已失效的旧 URL。
  const again = assetObjectUrl('remove-a', 'pages/001.jpg', blob, api)
  assert.ok(![a, b].includes(again))
})
