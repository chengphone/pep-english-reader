import assert from 'node:assert/strict'
import { test } from 'node:test'
import { refineTextbookBounds } from './textbookAudioBounds.mjs'

// 10 ms 一帧的包络：默认静音，speech(t) 为 true 的帧设成语音。
function envelope(seconds, speech, level = -20) {
  const frames = new Float64Array(Math.round(seconds * 100))
  for (let frame = 0; frame < frames.length; frame++) frames[frame] = speech(frame / 100) ? level : -99
  return frames
}

test('trims leading and trailing silence', () => {
  const levels = envelope(3, time => time >= 1 && time < 1.5)
  const result = refineTextbookBounds(levels, { start: 0.5, end: 2 })
  assert.equal(result.start, 0.92)
  assert.equal(result.end, 1.65)
  assert.equal(result.changed, true)
})

test('extends a start that lands inside a word', () => {
  const levels = envelope(3, time => time >= 1 && time < 2)
  const result = refineTextbookBounds(levels, { start: 1.3, end: 1.5 })
  assert.equal(result.start, 0.92)
  assert.equal(result.end, 2.15)
  assert.equal(result.extendedStart, true)
  assert.equal(result.extendedEnd, true)
})

test('extends a quiet onset just after the old end', () => {
  // 旧终点 17.89 落在第二个单词起音前，单词在终点之后才变响。
  const levels = new Float64Array(2200)
  levels.fill(-99)
  for (let frame = 1270; frame < 1500; frame++) levels[frame] = -20
  for (let frame = 1776; frame < 1850; frame++) levels[frame] = frame < 1790 ? -55 : -20
  const result = refineTextbookBounds(levels, { start: 14.66, end: 17.89, nextStart: 21.73 })
  assert.equal(result.end, 18.65)
  assert.equal(result.start, 12.62)
})

test('keeps all repetitions inside the old range', () => {
  const levels = envelope(5, time => (time >= 1 && time < 1.5) || (time >= 2.5 && time < 3) || (time >= 4 && time < 4.4))
  const result = refineTextbookBounds(levels, { start: 0.8, end: 4.6 })
  assert.equal(result.start, 0.92)
  assert.equal(result.end, 4.55)
})

test('does not pull in speech outside a range that already starts and ends in silence', () => {
  const levels = envelope(3, time => (time >= 0.3 && time < 0.6) || (time >= 1.2 && time < 1.8) || (time >= 2.4 && time < 2.7))
  const result = refineTextbookBounds(levels, { start: 1, end: 2 })
  assert.equal(result.start, 1.12)
  assert.equal(result.end, 1.95)
})

test('respects previous and next item boundaries', () => {
  const levels = envelope(3, time => time >= 0.8 && time < 1.8)
  const result = refineTextbookBounds(levels, { start: 1, end: 1.5, prevEnd: 1.1, nextStart: 1.6 })
  assert.equal(result.start, 1.12)
  assert.equal(result.end, 1.58)
})

test('leaves a silent range unchanged', () => {
  const levels = envelope(2, () => false)
  const result = refineTextbookBounds(levels, { start: 0.4, end: 1.2 })
  assert.deepEqual(result, { start: 0.4, end: 1.2, changed: false, reason: 'silent' })
})

test('ignores an isolated noise click', () => {
  const levels = envelope(3, time => (time >= 1 && time < 1.2) || (Math.abs(time - 0.6) < 0.005))
  const result = refineTextbookBounds(levels, { start: 0.5, end: 1.5 })
  assert.equal(result.start, 0.92)
  assert.equal(result.end, 1.35)
})

test('bridges a short stop-consonant gap at the end', () => {
  // 单词末尾的塞音闭合段是安静，随后才放出爆破音；旧的终点落在闭合段里。
  const levels = envelope(3, time => (time >= 1 && time < 1.5) || (time >= 1.6 && time < 1.9))
  const result = refineTextbookBounds(levels, { start: 0.8, end: 1.55 })
  assert.equal(result.end, 2.05)
})

test('keeps a quiet second word after a short gap', () => {
  // 双词主题标题的第二个词比第一个词轻 25 dB，旧终点切在它前面；
  // 补边界时必须用更敏感的阈值把它接回来，不能只保留第一个词。
  const levels = envelope(3, time => time >= 1 && time < 1.5)
  for (let frame = 160; frame < 190; frame++) levels[frame] = -45
  const result = refineTextbookBounds(levels, { start: 0.8, end: 1.55 })
  assert.equal(result.end, 2.05)
})

test('uses a sensitive threshold to keep quiet consonants at the edge', () => {
  // 首尾辅音比元音低 25 dB，主阈值 18 dB 会漏掉，补边界时必须保留。
  const levels = envelope(3, time => time >= 1 && time < 2, -20)
  for (let frame = 100; frame < 112; frame++) levels[frame] = -45
  for (let frame = 190; frame < 200; frame++) levels[frame] = -45
  const result = refineTextbookBounds(levels, { start: 1.15, end: 1.9 })
  assert.equal(result.start, 0.92)
  assert.equal(result.end, 2.15)
})
