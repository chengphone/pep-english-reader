import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addStudySeconds,
  dayKey,
  emptyState,
  makeQuiz,
  normalizeState,
  pronunciationScore,
  recordEvent,
  reviewWord,
  streakDays,
  summarize,
  weakWords,
  weekBars,
} from '../src/reader/learningCore.ts'

function record(overrides = {}) {
  const now = Date.now()
  return {
    bookId: 'book',
    itemId: 'p001_w1',
    page: 0,
    text: 'apple',
    translation: '苹果',
    reps: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    ease: 2.3,
    interval: 0,
    lastSeen: now,
    nextReview: now,
    ...overrides,
  }
}

const DAY = 24 * 60 * 60 * 1000

test('spaced review lengthens intervals and resets after a wrong answer', () => {
  const now = 1_700_000_000_000
  const first = reviewWord(record(), true, now)
  assert.equal(first.interval, 1)
  assert.equal(first.streak, 1)
  assert.equal(first.nextReview, now + DAY)

  const second = reviewWord(first, true, now + DAY)
  assert.equal(second.interval, 3)
  assert.equal(second.streak, 2)

  const third = reviewWord(second, true, now + 2 * DAY)
  assert(third.interval > 3)
  assert.equal(third.streak, 3)
  assert(third.ease > second.ease)

  const missed = reviewWord(third, false, now + 3 * DAY)
  assert.equal(missed.interval, 1)
  assert.equal(missed.streak, 0)
  assert.equal(missed.wrong, 1)
  assert(missed.ease < third.ease)
})

test('pronunciation scoring accepts punctuation and rejects unrelated speech', () => {
  assert.equal(pronunciationScore('apple', 'Apple!').score, 100)
  assert.equal(pronunciationScore('upside down', 'Upside down.').score, 100)
  assert(pronunciationScore('elephant', 'elefant').score >= 70)
  assert.equal(pronunciationScore('apple', '').score, 0)
  const phrase = pronunciationScore('good morning teacher', 'good morning')
  assert(phrase.score > 0 && phrase.score < 100)
  assert.equal(phrase.heard, 'good morning')
})

test('quiz questions include the answer and four distinct options', () => {
  const items = [
    { id: 'a', text: 'apple', translation: '苹果', order: 1, rects: [] },
    { id: 'b', text: 'banana', translation: '香蕉', order: 2, rects: [] },
    { id: 'c', text: 'cat', translation: '猫', order: 3, rects: [] },
    { id: 'd', text: 'dog', translation: '狗', order: 4, rects: [] },
  ]
  const questions = makeQuiz(items, items)
  assert.equal(questions.length, 8)
  for (const question of questions) {
    assert(question.answer)
    if (question.kind !== 'spell') {
      assert.equal(new Set(question.options).size, question.options.length)
      assert(question.options.includes(question.answer))
      assert.equal(question.options.length, 4)
    }
  }
})

test('meaning questions never repeat the same translation as an option', () => {
  const items = [
    { id: 'a', text: 'cat', translation: '猫', order: 1, rects: [] },
    { id: 'b', text: 'kitten', translation: '猫', order: 2, rects: [] },
    { id: 'c', text: 'dog', translation: '狗', order: 3, rects: [] },
    { id: 'd', text: 'apple', translation: '苹果', order: 4, rects: [] },
  ]
  const originalRandom = Math.random
  // 固定随机数，保证每轮先出 listen、再出 meaning，测试不靠运气。
  Math.random = () => 0
  try {
    const questions = makeQuiz(items, items)
    const meaning = questions.filter(question => question.kind === 'meaning')
    assert(meaning.length > 0)
    for (const question of meaning) {
      assert.equal(new Set(question.options).size, question.options.length)
      assert(question.options.includes(question.answer))
      assert(question.options.length >= 2)
    }
    // 所有释义都相同时只剩一个选项，应跳过而不是生成无法作答的题。
    const sameTranslation = [
      { id: 'e', text: 'cat', translation: '猫', order: 1, rects: [] },
      { id: 'f', text: 'kitten', translation: '猫', order: 2, rects: [] },
    ]
    const fallback = makeQuiz(sameTranslation, sameTranslation)
    assert(fallback.length > 0)
    for (const question of fallback) {
      assert.notEqual(question.kind, 'meaning')
      if (question.kind !== 'spell') assert(question.options.length >= 2)
    }
    // 释义两端空白不能制造出两个看起来一样的选项；纯空白释义也不应出题。
    const spaced = [
      { id: 'g', text: 'cat', translation: ' 猫 ', order: 1, rects: [] },
      { id: 'h', text: 'kitten', translation: '猫', order: 2, rects: [] },
      { id: 'i', text: 'dog', translation: ' 狗', order: 3, rects: [] },
      { id: 'j', text: 'bird', translation: '   ', order: 4, rects: [] },
    ]
    const spacedQuestions = makeQuiz(spaced, spaced)
    for (const question of spacedQuestions) {
      if (question.kind === 'meaning') {
        assert.equal(question.answer, question.answer.trim())
        assert(question.answer.length > 0)
        assert.equal(new Set(question.options).size, question.options.length)
        assert(question.options.every(option => option === option.trim() && option))
      }
    }
    assert(!spacedQuestions.some(question => question.kind === 'meaning' && question.item.id === 'j'))
  } finally {
    Math.random = originalRandom
  }
})

test('a day with only wrong answers still counts toward the streak', () => {
  const now = new Date('2026-11-12T10:00:00').getTime()
  const today = dayKey(now)
  const yesterday = dayKey(now - DAY)
  assert.equal(streakDays({
    [today]: { day: today, seconds: 0, correct: 0, wrong: 2, words: 2 },
    [yesterday]: { day: yesterday, seconds: 60, correct: 3, wrong: 0, words: 3 },
  }, now), 2)
  // 今天没有任何活动时仍从昨天开始算，空记录不会打断连续天数。
  assert.equal(streakDays({
    [today]: { day: today, seconds: 0, correct: 0, wrong: 0, words: 0 },
    [yesterday]: { day: yesterday, seconds: 60, correct: 3, wrong: 0, words: 3 },
  }, now), 1)
  assert.equal(streakDays({}, now), 0)
})

test('week bars and streaks walk local calendar days across year boundaries', () => {
  // 用本地日历日递减，而不是固定 24 小时：夏令时或跨年时日期不能重复或跳天。
  const now = new Date('2026-01-01T00:30:00').getTime()
  const week = weekBars({}, now)
  assert.equal(new Set(week.map(row => row.day)).size, 7)
  assert.deepEqual(week.map(row => row.day), [
    '2025-12-26', '2025-12-27', '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01',
  ])
  assert.equal(streakDays({
    '2025-12-31': { day: '2025-12-31', seconds: 60, correct: 1, wrong: 0, words: 1 },
    '2026-01-01': { day: '2026-01-01', seconds: 60, correct: 1, wrong: 0, words: 1 },
  }, now), 2)
})

test('summary counts words, accuracy, due items and a seven-day window', () => {
  const now = new Date('2026-11-12T10:00:00').getTime()
  const today = dayKey(now)
  const yesterday = dayKey(now - DAY)
  const rows = {
    'book:a': record({ itemId: 'a', text: 'apple', reps: 3, correct: 3, streak: 2, nextReview: now + DAY }),
    'book:b': record({ itemId: 'b', text: 'ant', reps: 2, correct: 1, wrong: 1, streak: 0, nextReview: now - DAY }),
  }
  const summary = summarize(rows, {
    [today]: { day: today, seconds: 120, correct: 3, wrong: 1, words: 4 },
    [yesterday]: { day: yesterday, seconds: 60, correct: 1, wrong: 0, words: 1 },
  }, now)
  assert.equal(summary.totalWords, 2)
  assert.equal(summary.masteredWords, 1)
  assert.equal(summary.dueWords, 1)
  assert.equal(summary.correct, 4)
  assert.equal(summary.wrong, 1)
  assert.equal(summary.accuracy, 80)
  assert.equal(summary.totalSeconds, 180)
  assert.equal(summary.todaySeconds, 120)
  assert.equal(summary.streak, 2)
  assert.equal(summary.week.length, 7)
  assert.equal(summary.week[6].day, today)
})

test('weak words put the lowest accuracy first', () => {
  const rows = {
    a: record({ itemId: 'a', text: 'apple', reps: 3, correct: 3, streak: 2 }),
    b: record({ itemId: 'b', text: 'ant', reps: 4, correct: 2, wrong: 2, streak: 0 }),
    c: record({ itemId: 'c', text: 'cat', reps: 2, correct: 1, wrong: 1, streak: 0 }),
  }
  assert.equal(weakWords(rows)[0].itemId, 'b')
})

test('state normalization drops unknown profiles and malformed rows', () => {
  const normalized = normalizeState({
    version: 1,
    active: 'b',
    profiles: { b: { name: '小明' } },
    words: { b: { good: record(), bad: { text: 1 } } },
    bookmarks: { b: [{ id: 'x', bookId: 'book', page: 'nope' }, { id: 'y', bookId: 'book', page: 3, label: '3' }] },
    events: { b: [{ id: 'e', bookId: 'book', text: 'apple', kind: 'review', correct: true }] },
    days: { b: { '2026-11-12': { seconds: 60 } } },
    lastPages: { b: { book: 4 } },
  })
  assert.equal(normalized.active, 'b')
  assert.equal(normalized.profiles.b.name, '小明')
  assert.equal(normalized.profiles.a.name, '学习者 A')
  assert.equal(Object.keys(normalized.words.b).length, 1)
  assert.equal(normalized.bookmarks.b.length, 1)
  assert.equal(normalized.events.b.length, 1)
  assert.equal(normalized.days.b['2026-11-12'].seconds, 60)
  assert.equal(normalized.lastPages.b.book, 4)
})

test('state normalization keeps hand-edited infinities out of counters and stats', () => {
  // localStorage 可以被手工改写；JSON 里的 1e999 会解析成 Infinity，
  // 旧实现会把它原样写进学习计数，统计页随后显示 NaN% 正确率。
  const normalized = normalizeState(JSON.parse(`{
    "version": 1,
    "words": { "a": {
      "inf": {"bookId":"book","itemId":"inf","text":"apple","reps":1e999,"correct":1e999,"wrong":1e999,"streak":1e999,"interval":1e999,"lastSeen":1e999,"nextReview":1e999,"page":1e999},
      "over": {"bookId":"book","itemId":"over","text":"ant","reps":1,"correct":9,"wrong":4},
      "ok": {"bookId":"book","itemId":"ok","text":"cat","reps":2,"correct":2,"wrong":0}
    }},
    "bookmarks": { "a": [
      {"id":"bad","bookId":"book","page":1e999,"label":"x","createdAt":1e999},
      {"id":"good","bookId":"book","page":3,"label":"3","createdAt":1e999}
    ]},
    "events": { "a": [{"id":"e","bookId":"book","text":"apple","kind":"review","correct":true,"at":1e999,"page":1e999}] },
    "days": { "a": { "2026-11-12": {"seconds":1e999,"correct":1e999,"wrong":1e999,"words":1e999} } }
  }`))
  const inf = normalized.words.a.inf
  for (const key of ['reps', 'correct', 'wrong', 'streak', 'interval', 'lastSeen', 'nextReview', 'page']) {
    assert.ok(Number.isFinite(inf[key]), `${key} should be finite`)
  }
  assert.equal(inf.reps, 0)
  // 作答次数不可能超过总次数；手改出更大的值时按总次数收敛。
  assert.equal(normalized.words.a.over.correct, 1)
  assert.equal(normalized.words.a.over.wrong, 1)
  // 页码为 Infinity 的书签本来就会被过滤；合法书签的坏时间戳按 0 处理。
  assert.deepEqual(normalized.bookmarks.a.map(row => row.id), ['good'])
  assert.equal(normalized.bookmarks.a[0].createdAt, 0)
  assert.equal(normalized.events.a[0].at, 0)
  assert.equal(normalized.events.a[0].page, 0)
  const day = normalized.days.a['2026-11-12']
  assert.deepEqual([day.seconds, day.correct, day.wrong, day.words], [0, 0, 0, 0])
  const summary = summarize(normalized.words.a, normalized.days.a, new Date('2026-11-12T12:00:00').getTime())
  assert.ok(Number.isFinite(summary.accuracy))
  assert.ok(Number.isFinite(summary.totalSeconds))
  assert.equal(summary.totalSeconds, 0)
  assert.equal(summary.accuracy, 75)
})

test('study seconds and quiz events land on the same local day', () => {
  const now = new Date('2026-11-12T23:30:00').getTime()
  const state = emptyState()
  const days = addStudySeconds(state, 'a', 90, now)
  const merged = recordEvent({ ...state, days: { ...state.days, a: days } }, 'a', {
    id: 'e1', at: now, bookId: 'book', page: 0, itemId: 'a', text: 'apple', kind: 'listen', correct: true,
  })
  const day = merged.days[dayKey(now)]
  assert.equal(day.seconds, 90)
  assert.equal(day.correct, 1)
  assert.equal(day.words, 1)
})

test('state normalization treats dangerous keys as plain data instead of mutating prototypes', () => {
  // 存档键可以来自 `profileWordKey(bookId, itemId)`；手写或旧版本数据可能包含
  // `__proto__`。普通对象上的 `out[key] = ...` 会改写原型而不是保存记录。
  const normalized = normalizeState(JSON.parse(`{
    "version": 1,
    "words": { "a": { "__proto__": {"bookId":"book","itemId":"p","text":"apple","reps":1,"nextReview":0} } },
    "lastPages": { "a": { "__proto__": 4, "book": 2 } }
  }`))
  assert.equal(Object.keys(normalized.words.a).length, 1)
  assert.equal(normalized.words.a['__proto__'].itemId, 'p')
  assert.equal(Object.getPrototypeOf(normalized.words.a), Object.getPrototypeOf(normalized.words.b))
  assert.equal(Object.getPrototypeOf(normalized.words.a), null)
  assert.equal(({}).itemId, undefined)
  assert.equal(normalized.lastPages.a['__proto__'], 4)
  assert.equal(normalized.lastPages.a.book, 2)
  assert.equal(Object.getPrototypeOf(normalized.lastPages.a), null)
})

test('addStudySeconds ignores invalid values and caps one flush', () => {
  const state = emptyState()
  const now = Date.now()
  assert.deepEqual(addStudySeconds(state, 'a', -1, now), {})
  const result = addStudySeconds(state, 'a', 100_000, now)
  assert.equal(Object.values(result)[0].seconds, 600)
})
