import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentBoxFromPixels } from '../src/picture/trimMargins.ts'

// 构造一张白底 RGBA 图，并按需涂黑一块区域。
function page(width, height, paint = () => {}) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  const dark = (x, y) => {
    const index = (y * width + x) * 4
    data[index] = data[index + 1] = data[index + 2] = 0
  }
  paint(dark)
  return { data, width, height }
}
function rect(dark, left, top, right, bottom) {
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) dark(x, y)
}
function contains(box, x, y) {
  return x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h
}

test('trims the white border and leaves a small safety pad', () => {
  const { data, width, height } = page(320, 240, dark => rect(dark, 50, 40, 269, 159))
  const box = contentBoxFromPixels(data, width, height)
  assert.ok(box)
  assert.ok(box.x > 0.14 && box.x < 0.16, `left ${box.x}`)
  assert.ok(box.y > 0.15 && box.y < 0.17, `top ${box.y}`)
  assert.ok(box.w > 0.70 && box.w < 0.72, `width ${box.w}`)
  assert.ok(box.h > 0.51 && box.h < 0.53, `height ${box.h}`)
  // 插图四角都必须留在裁剪框内。
  assert.ok(contains(box, 50 / 320, 40 / 240))
  assert.ok(contains(box, 269 / 320, 159 / 240))
})

test('ignores a tiny page number below the content', () => {
  const { data, width, height } = page(320, 240, dark => {
    rect(dark, 40, 30, 279, 159)
    rect(dark, 300, 200, 301, 201)
  })
  const box = contentBoxFromPixels(data, width, height)
  assert.ok(box)
  assert.ok(!contains(box, 300 / 320, 200 / 240), 'page number must be outside the crop')
  assert.ok(box.x + box.w < 0.9, `right edge ${box.x + box.w}`)
  assert.ok(box.y + box.h < 0.8, `bottom edge ${box.y + box.h}`)
})

test('keeps several short text lines together', () => {
  const { data, width, height } = page(320, 240, dark => {
    for (const top of [40, 70, 100, 130]) rect(dark, 60, top, 259, top + 2)
  })
  const box = contentBoxFromPixels(data, width, height)
  assert.ok(box)
  assert.ok(box.y < 40 / 240 && box.y + box.h > 132 / 240)
  assert.ok(box.x < 60 / 320 && box.x + box.w > 259 / 320)
})

test('a blank page is not cropped', () => {
  const { data, width, height } = page(320, 240)
  assert.equal(contentBoxFromPixels(data, width, height), undefined)
})

test('a full-bleed page is not scaled', () => {
  const { data, width, height } = page(320, 240, dark => rect(dark, 0, 0, 319, 239))
  assert.equal(contentBoxFromPixels(data, width, height), undefined)
})

test('a tiny isolated mark is treated as noise', () => {
  const { data, width, height } = page(320, 240, dark => rect(dark, 100, 100, 105, 105))
  assert.equal(contentBoxFromPixels(data, width, height), undefined)
})

test('invalid dimensions or buffers are rejected', () => {
  const { data } = page(320, 240)
  assert.equal(contentBoxFromPixels(data, 0, 240), undefined)
  assert.equal(contentBoxFromPixels(data, 320, 240.5), undefined)
  assert.equal(contentBoxFromPixels(data.subarray(0, 100), 320, 240), undefined)
})
