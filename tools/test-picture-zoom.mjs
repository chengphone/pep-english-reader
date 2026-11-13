import assert from 'node:assert/strict'
import { test } from 'node:test'
import { zoomScrollTarget } from '../src/picture/zoomScroll.ts'

// 手机 360 CSS px：页面左右各 10px 边距，纸面 clientWidth 338，放大约 2 倍。
const VIEW = { canvasWidth: 660, canvasLeft: 4, viewportWidth: 338, maxScroll: 330 }
function target(rects) {
  return zoomScrollTarget(rects, VIEW.canvasWidth, VIEW.canvasLeft, VIEW.viewportWidth, VIEW.maxScroll)
}

test('a sentence crossing the spread midline is centered instead of clipped', () => {
  // 截图中的 “The dinosaur frowned.” 从 34% 延伸到 65%，按中心点会被判成左页并滚到 0。
  const value = target([[0.34174, 0.67333, 0.31337, 0.0523]])
  assert.ok(Number.isFinite(value))
  const start = VIEW.canvasLeft + 0.34174 * VIEW.canvasWidth
  const width = 0.31337 * VIEW.canvasWidth
  assert.ok(start - value >= 0, 'sentence start must not be clipped on the left')
  assert.ok(start - value + width <= VIEW.viewportWidth + 0.01, 'sentence end must remain visible')
  assert.ok(value > 0 && value < VIEW.maxScroll, `expected a middle scroll position, got ${value}`)
})

test('a sentence near the right edge clamps to the maximum scroll instead of overshooting', () => {
  assert.equal(target([[0.7, 0.1, 0.25, 0.05]]), VIEW.maxScroll)
})

test('a left-page sentence stays at the left edge', () => {
  assert.equal(target([[0.05, 0.1, 0.1, 0.05]]), 0)
})

test('a sentence wider than the viewport starts at its beginning', () => {
  const value = target([[0.05, 0.1, 0.9, 0.05]])
  assert.ok(Math.abs(value - (VIEW.canvasLeft + 0.05 * VIEW.canvasWidth)) < 0.01)
})

test('multiple hotspot rectangles are merged into one horizontal range', () => {
  const value = target([[0.2, 0.1, 0.1, 0.05], [0.5, 0.5, 0.1, 0.05]])
  assert.ok(Math.abs(value - 99) < 0.01)
})

test('invalid rectangles or geometry do not produce a scroll target', () => {
  assert.equal(target([]), undefined)
  assert.equal(target([[0.5, 0.5]]), undefined)
  assert.equal(target([[Number.NaN, 0, 0.1, 0.1]]), undefined)
  assert.equal(target([[0.5, 0, -0.1, 0.1]]), undefined)
  assert.equal(zoomScrollTarget([[0.5, 0, 0.1, 0.1]], 0, 0, 338, 330), undefined)
  assert.equal(zoomScrollTarget([[0.5, 0, 0.1, 0.1]], 660, 0, 0, 330), undefined)
})
