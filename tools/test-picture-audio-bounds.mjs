import assert from 'node:assert/strict'
import { test } from 'node:test'
import { frameLevels, refineSentenceBounds } from './pictureAudioBounds.mjs'

// 构造 10 ms 一帧的包络：默认静音，give speech() 返回 true 的帧设为语音。
function envelope(seconds, speech) {
  const frames = new Float64Array(Math.round(seconds * 100))
  for (let frame = 0; frame < frames.length; frame++) frames[frame] = speech(frame / 100) ? -20 : -60
  return frames
}

test('trims the whisper lead-in and trailing music', () => {
  const levels = envelope(3, time => time >= 0.4 && time < 0.7)
  const result = refineSentenceBounds(levels, { start: 0.3, end: 0.9 })
  assert.equal(result.start, 0.32)
  assert.equal(result.end, 0.85)
  assert.equal(result.changed, true)
})

test('leaves a sentence alone when the span has no speech', () => {
  const levels = envelope(3, () => false)
  const result = refineSentenceBounds(levels, { start: 0.4, end: 1.4 })
  assert.deepEqual(result, { start: 0.4, end: 1.4, changed: false })
})

test('never runs into the next sentence', () => {
  const levels = envelope(3, time => time >= 0.4 && time < 1.2)
  const result = refineSentenceBounds(levels, { start: 0.3, end: 1.6, nextStart: 0.9 })
  assert.ok(result.end <= 0.88, `end ${result.end}`)
  assert.ok(result.end > result.start)
})

test('never starts before the previous refined sentence ends', () => {
  const levels = envelope(3, time => time >= 0.2 && time < 0.8)
  const result = refineSentenceBounds(levels, { start: 0.5, end: 0.9, prevEnd: 0.55 })
  assert.ok(result.start >= 0.57, `start ${result.start}`)
})

test('extends a zero-length exclamation to the actual speech', () => {
  const levels = envelope(3, time => time >= 0.95 && time < 1.3)
  const result = refineSentenceBounds(levels, { start: 1, end: 1 })
  assert.ok(result.start < 1 && result.start > 0.8, `start ${result.start}`)
  assert.ok(result.end > 1.3 && result.end < 1.5, `end ${result.end}`)
})

test('recovers a sentence that whisper placed inside quiet music', () => {
  // Tire Town School 的配乐比旁白轻约 20 dB：旧时间落在配乐里时，
  // 仍能找到后面真正的说话区间，而不是把配乐当成语音。
  const levels = new Float64Array(400)
  for (let frame = 0; frame < levels.length; frame++) levels[frame] = -35
  for (let frame = 160; frame < 240; frame++) levels[frame] = -15
  const result = refineSentenceBounds(levels, { start: 1, end: 1.4 })
  assert.equal(result.start, 1.52)
  assert.equal(result.end, 2.56)
  assert.equal(result.changed, true)
})

test('recovers the real speech when the old span starts in music', () => {
  // whisper 起点落在前奏音乐里、终点在语音里时，按词数判定区间异常，
  // 再用严格阈值找到真正的语音段。
  const levels = new Float64Array(500)
  levels.fill(-25)
  for (let frame = 260; frame <= 340; frame++) levels[frame] = -16
  const result = refineSentenceBounds(levels, { start: 0.3, end: 3.3, nextStart: 4.6, wordCount: 3 })
  assert.equal(result.start, 2.52)
  assert.equal(result.end, 3.56)
  assert.equal(result.changed, true)
})

test('cuts a long music tail after the real speech', () => {
  const levels = new Float64Array(800)
  levels.fill(-25)
  for (let frame = 100; frame <= 180; frame++) levels[frame] = -16
  const result = refineSentenceBounds(levels, { start: 1, end: 6, nextStart: 7, wordCount: 5 })
  assert.equal(result.start, 0.92)
  assert.equal(result.end, 1.96)
})

test('keeps a sentence that is split by a music interlude', () => {
  // 有的句子在音频里被一段音乐隔开（先读一半，音乐后读剩下的），
  // 两个端点都落在语音里时不能只保留其中一段。
  const levels = new Float64Array(800)
  levels.fill(-25)
  for (let frame = 100; frame <= 200; frame++) levels[frame] = -16
  for (let frame = 500; frame <= 600; frame++) levels[frame] = -16
  const result = refineSentenceBounds(levels, { start: 1, end: 6, nextStart: 7, wordCount: 4 })
  assert.equal(result.start, 0.92)
  assert.equal(result.end, 6.16)
})

test('does not stretch a sentence into a steady music bed', () => {
  // 配乐被严格阈值误判成语音时，用音量起伏区分：语音有音节起伏，配乐较平稳。
  const levels = new Float64Array(1000)
  levels.fill(-35)
  for (let frame = 100; frame <= 180; frame++) levels[frame] = frame % 10 < 5 ? -16 : -30
  for (let frame = 300; frame <= 800; frame++) levels[frame] = -21
  const result = refineSentenceBounds(levels, { start: 1, end: 8, nextStart: 9, wordCount: 2 })
  assert.equal(result.start, 0.92)
  assert.equal(result.end, 1.96)
})

test('rescues an absurdly long span when one clear speech run remains', () => {
  // 起止都落在配乐里、区间又长得离谱时，才允许按起伏挑一个语音段。
  const levels = new Float64Array(1200)
  levels.fill(-25)
  for (let frame = 260; frame <= 340; frame++) levels[frame] = frame % 2 ? -12 : -38
  const result = refineSentenceBounds(levels, { start: 0.3, end: 10, nextStart: 11, wordCount: 2 })
  assert.equal(result.start, 2.53)
  assert.equal(result.end, 3.55)
})

test('recovers consecutive short exclamations that share one start time', () => {
  const levels = new Float64Array(400)
  levels.fill(-35)
  for (let frame = 100; frame <= 150; frame++) levels[frame] = -16
  const result = refineSentenceBounds(levels, { start: 1, end: 1, nextStart: 1, wordCount: 1 })
  assert.equal(result.start, 0.92)
  assert.equal(result.end, 1.66)
})

test('frameLevels tracks the RMS envelope', () => {
  const samples = new Int16Array(16000)
  for (let index = 4000; index < 8000; index++) samples[index] = 16384
  const levels = frameLevels(samples)
  assert.ok(levels.length >= 90)
  assert.ok(levels[10] < -50, `silence ${levels[10]}`)
  assert.ok(levels[30] > -15 && levels[30] < -5, `speech ${levels[30]}`)
})
