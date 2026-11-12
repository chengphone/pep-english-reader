import type { ReaderItem } from './types'

// 学习系统的纯逻辑放在这里：不访问浏览器存储，方便用 Node 单测。
// P1：双用户、进度、书签、练习、跟读；P2：发音评分、间隔复习、学情统计、分级对话。

export type ProfileId = 'a' | 'b'
export type QuizKind = 'listen' | 'meaning' | 'spell' | 'review' | 'recording' | 'dialogue'

export type WordRecord = {
  bookId: string
  itemId: string
  page: number
  text: string
  translation?: string
  reps: number
  correct: number
  wrong: number
  streak: number
  ease: number
  interval: number
  lastSeen: number
  nextReview: number
  bestScore?: number
}

export type Bookmark = {
  id: string
  bookId: string
  page: number
  label: string
  createdAt: number
}

export type QuizEvent = {
  id: string
  at: number
  bookId: string
  page: number
  itemId: string
  text: string
  kind: QuizKind
  correct: boolean
  score?: number
}

export type DayStat = {
  day: string
  seconds: number
  correct: number
  wrong: number
  words: number
}

export type LearningState = {
  version: 1
  active: ProfileId
  profiles: Record<ProfileId, { name: string }>
  words: Record<ProfileId, Record<string, WordRecord>>
  bookmarks: Record<ProfileId, Bookmark[]>
  events: Record<ProfileId, QuizEvent[]>
  days: Record<ProfileId, Record<string, DayStat>>
  lastPages: Record<ProfileId, Record<string, number>>
}

export type QuizQuestion = {
  id: string
  item: ReaderItem
  kind: 'listen' | 'meaning' | 'spell'
  options: string[]
  answer: string
}

export type StatsSummary = {
  totalSeconds: number
  todaySeconds: number
  totalWords: number
  masteredWords: number
  dueWords: number
  correct: number
  wrong: number
  accuracy: number
  streak: number
  week: { day: string; seconds: number; correct: number; wrong: number }[]
}

const DAY = 24 * 60 * 60 * 1000

export function profileWordKey(bookId: string, itemId: string) {
  return `${bookId}:${itemId}`
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function dayKey(time = Date.now()) {
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function emptyState(): LearningState {
  return {
    version: 1,
    active: 'a',
    profiles: { a: { name: '学习者 A' }, b: { name: '学习者 B' } },
    words: { a: {}, b: {} },
    bookmarks: { a: [], b: [] },
    events: { a: [], b: [] },
    days: { a: {}, b: {} },
    lastPages: { a: {}, b: {} },
  }
}

export function normalizeState(value: unknown): LearningState {
  const base = emptyState()
  if (!value || typeof value !== 'object') return base
  const raw = value as Partial<LearningState>
  if (raw.version !== 1) return base
  const active: ProfileId = raw.active === 'b' ? 'b' : 'a'
  const profiles = {
    a: { name: typeof raw.profiles?.a?.name === 'string' && raw.profiles.a.name.trim() ? raw.profiles.a.name.trim() : base.profiles.a.name },
    b: { name: typeof raw.profiles?.b?.name === 'string' && raw.profiles.b.name.trim() ? raw.profiles.b.name.trim() : base.profiles.b.name },
  }
  const readRecord = (profile: ProfileId) => {
    const rows = raw.words?.[profile]
    const out: Record<string, WordRecord> = {}
    if (!rows || typeof rows !== 'object') return out
    for (const [key, value] of Object.entries(rows)) {
      if (!value || typeof value !== 'object') continue
      const row = value as Partial<WordRecord>
      if (typeof row.bookId !== 'string' || typeof row.itemId !== 'string' || typeof row.text !== 'string') continue
      const reps = Math.max(0, Number(row.reps) || 0)
      out[key] = {
        bookId: row.bookId,
        itemId: row.itemId,
        page: Math.max(0, Number(row.page) || 0),
        text: row.text,
        translation: typeof row.translation === 'string' ? row.translation : undefined,
        reps,
        correct: Math.max(0, Number(row.correct) || 0),
        wrong: Math.max(0, Number(row.wrong) || 0),
        streak: Math.max(0, Number(row.streak) || 0),
        ease: clamp(Number(row.ease) || 2.3, 1.3, 2.8),
        interval: Math.max(0, Number(row.interval) || 0),
        lastSeen: Math.max(0, Number(row.lastSeen) || 0),
        nextReview: Math.max(0, Number(row.nextReview) || 0),
        bestScore: Number.isFinite(row.bestScore) ? clamp(Number(row.bestScore), 0, 100) : undefined,
      }
    }
    return out
  }
  const readBookmarks = (profile: ProfileId) => {
    const rows = raw.bookmarks?.[profile]
    if (!Array.isArray(rows)) return []
    return rows.flatMap(row => {
      if (!row || typeof row !== 'object') return []
      const item = row as Partial<Bookmark>
      const page = Number(item.page)
      if (typeof item.id !== 'string' || typeof item.bookId !== 'string' || !Number.isFinite(page)) return []
      return [{
        id: item.id,
        bookId: item.bookId,
        page: Math.max(0, Math.trunc(page)),
        label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : String(Math.trunc(page) + 1),
        createdAt: Math.max(0, Number(item.createdAt) || 0),
      }]
    })
  }
  const readEvents = (profile: ProfileId) => {
    const rows = raw.events?.[profile]
    if (!Array.isArray(rows)) return []
    return rows.flatMap(row => {
      if (!row || typeof row !== 'object') return []
      const item = row as Partial<QuizEvent>
      if (typeof item.id !== 'string' || typeof item.bookId !== 'string' || typeof item.text !== 'string') return []
      const kind: QuizKind = ['listen', 'meaning', 'spell', 'review', 'recording', 'dialogue'].includes(String(item.kind)) ? item.kind as QuizKind : 'review'
      return [{
        id: item.id,
        at: Math.max(0, Number(item.at) || 0),
        bookId: item.bookId,
        page: Math.max(0, Number(item.page) || 0),
        itemId: typeof item.itemId === 'string' ? item.itemId : '',
        text: item.text,
        kind,
        correct: Boolean(item.correct),
        score: Number.isFinite(item.score) ? clamp(Number(item.score), 0, 100) : undefined,
      }]
    }).slice(-600)
  }
  const readDays = (profile: ProfileId) => {
    const rows = raw.days?.[profile]
    const out: Record<string, DayStat> = {}
    if (!rows || typeof rows !== 'object') return out
    for (const [key, value] of Object.entries(rows)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== 'object') continue
      const row = value as Partial<DayStat>
      out[key] = {
        day: key,
        seconds: Math.max(0, Number(row.seconds) || 0),
        correct: Math.max(0, Number(row.correct) || 0),
        wrong: Math.max(0, Number(row.wrong) || 0),
        words: Math.max(0, Number(row.words) || 0),
      }
    }
    return out
  }
  const readPages = (profile: ProfileId) => {
    const rows = raw.lastPages?.[profile]
    const out: Record<string, number> = {}
    if (!rows || typeof rows !== 'object') return out
    for (const [key, value] of Object.entries(rows)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = Math.trunc(value)
    }
    return out
  }
  return {
    version: 1,
    active,
    profiles,
    words: { a: readRecord('a'), b: readRecord('b') },
    bookmarks: { a: readBookmarks('a'), b: readBookmarks('b') },
    events: { a: readEvents('a'), b: readEvents('b') },
    days: { a: readDays('a'), b: readDays('b') },
    lastPages: { a: readPages('a'), b: readPages('b') },
  }
}

export function newWordRecord(item: ReaderItem, bookId: string, page: number, now = Date.now()): WordRecord {
  return {
    bookId,
    itemId: item.id,
    page,
    text: item.text,
    translation: item.translation,
    reps: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    ease: 2.3,
    interval: 0,
    lastSeen: now,
    nextReview: now,
  }
}

// 简化版 SM-2：答对逐步拉长间隔，答错回到一天后再学。
// 语音跟读的分数只影响 bestScore 和事件统计，不直接当作答错。
export function reviewWord(record: WordRecord, correct: boolean, now = Date.now()): WordRecord {
  const streak = correct ? record.streak + 1 : 0
  const ease = clamp(correct ? record.ease + 0.08 : record.ease - 0.2, 1.3, 2.8)
  const interval = correct
    ? streak <= 1 ? 1 : streak === 2 ? 3 : Math.min(60, Math.max(2, Math.round(Math.max(1, record.interval) * ease)))
    : 1
  return {
    ...record,
    reps: record.reps + 1,
    correct: record.correct + (correct ? 1 : 0),
    wrong: record.wrong + (correct ? 0 : 1),
    streak,
    ease,
    interval,
    lastSeen: now,
    nextReview: now + interval * DAY,
  }
}

export function normalizeSpeech(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function editDistance(left: string, right: string) {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    const current = [i]
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[right.length]
}

// 浏览器语音识别只返回文本，这里用字符编辑距离做保守评分：
// 单词完全命中给 100；短语按整体相似度，避免把“漏读一句”评成高分。
export function pronunciationScore(target: string, transcript: string) {
  const expected = normalizeSpeech(target)
  const heard = normalizeSpeech(transcript)
  if (!expected || !heard) return { score: 0, heard }
  if (expected === heard) return { score: 100, heard }
  const expectedWords = expected.split(' ')
  const heardWords = heard.split(' ')
  if (expectedWords.length === 1) {
    if (heardWords.includes(expected)) return { score: 100, heard }
    const scored = heardWords
      .map(word => 100 * (1 - editDistance(expected, word) / Math.max(expected.length, word.length)))
      .sort((a, b) => b - a)[0] ?? 0
    return { score: Math.round(clamp(scored, 0, 100)), heard }
  }
  const distance = editDistance(expected, heard)
  const score = 100 * (1 - distance / Math.max(expected.length, heard.length))
  return { score: Math.round(clamp(score, 0, 100)), heard }
}

export function scoreMessage(score: number) {
  if (score >= 90) return '非常棒，发音很清晰'
  if (score >= 75) return '不错，再读一遍会更自然'
  if (score >= 60) return '接近了，注意听一听原音'
  return '再听一遍原音，然后慢慢读'
}

function shuffle<T>(rows: T[]) {
  const copy = [...rows]
  for (let index = copy.length - 1; index > 0; index--) {
    const pick = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[pick]] = [copy[pick], copy[index]]
  }
  return copy
}

function uniqueByText(rows: ReaderItem[]) {
  const seen = new Set<string>()
  return rows.filter(row => {
    const key = normalizeSpeech(row.text)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// 练习题从本页词条出题，干扰项优先从全书其它词条里取，保证同一页也能凑出四个选项。
// 每个词最多出三种题；一轮不够 8 题时会再循环一次，而不是重复同一道题。
export function makeQuiz(items: ReaderItem[], pool: ReaderItem[], count = 8): QuizQuestion[] {
  const targets = uniqueByText(items)
  if (!targets.length) return []
  const cleanPool = uniqueByText([...pool, ...targets])
  const questions: QuizQuestion[] = []
  const used = new Set<string>()
  let cursor = 0
  let attempts = 0
  while (questions.length < count && attempts < count * 8) {
    attempts++
    const item = targets[cursor++ % targets.length]
    const kinds: QuizQuestion['kind'][] = ['listen']
    if (item.translation) kinds.push('meaning')
    if (normalizeSpeech(item.text).length > 1) kinds.push('spell')
    const available = kinds.filter(kind => !used.has(`${item.id}:${kind}`))
    if (!available.length) continue
    const kind = available[Math.floor(Math.random() * available.length)]
    used.add(`${item.id}:${kind}`)
    let answer = item.text
    let options: string[] = []
    if (kind === 'meaning') {
      answer = item.translation || ''
      const distractors = shuffle(cleanPool.filter(row => row.id !== item.id && row.translation && row.translation !== answer)).slice(0, 3).map(row => row.translation!)
      options = shuffle([answer, ...distractors])
    } else if (kind === 'listen') {
      const distractors = shuffle(cleanPool.filter(row => row.id !== item.id && row.text !== answer)).slice(0, 3).map(row => row.text)
      options = shuffle([answer, ...distractors])
    }
    questions.push({
      id: `${item.id}:${kind}:${questions.length}`,
      item,
      kind,
      options,
      answer,
    })
  }
  return questions
}

export function recordEvent(state: LearningState, profile: ProfileId, event: QuizEvent) {
  const events = [...(state.events[profile] ?? []), event].slice(-600)
  const day = dayKey(event.at)
  const before = state.days[profile]?.[day] ?? { day, seconds: 0, correct: 0, wrong: 0, words: 0 }
  const days = {
    ...(state.days[profile] ?? {}),
    [day]: {
      ...before,
      correct: before.correct + (event.correct ? 1 : 0),
      wrong: before.wrong + (event.correct ? 0 : 1),
      words: before.words + 1,
    },
  }
  return { events, days }
}

export function addStudySeconds(state: LearningState, profile: ProfileId, seconds: number, at = Date.now()) {
  if (!Number.isFinite(seconds) || seconds <= 0) return state.days[profile] ?? {}
  const day = dayKey(at)
  const before = state.days[profile]?.[day] ?? { day, seconds: 0, correct: 0, wrong: 0, words: 0 }
  return { ...(state.days[profile] ?? {}), [day]: { ...before, seconds: before.seconds + Math.min(600, seconds) } }
}

export function weekBars(days: Record<string, DayStat>, now = Date.now()) {
  const out: StatsSummary['week'] = []
  for (let offset = 6; offset >= 0; offset--) {
    const stamp = now - offset * DAY
    const key = dayKey(stamp)
    const row = days[key]
    out.push({ day: key, seconds: row?.seconds ?? 0, correct: row?.correct ?? 0, wrong: row?.wrong ?? 0 })
  }
  return out
}

export function streakDays(days: Record<string, DayStat>, now = Date.now()) {
  let streak = 0
  let stamp = now
  // 今天还没学习时，从昨天开始算连续天数，避免白天打开统计就显示中断。
  if (!(days[dayKey(stamp)]?.seconds ?? 0) && !(days[dayKey(stamp)]?.correct ?? 0)) stamp -= DAY
  for (let index = 0; index < 366; index++) {
    const row = days[dayKey(stamp)]
    if (!row || (row.seconds <= 0 && row.correct <= 0 && row.wrong <= 0)) break
    streak++
    stamp -= DAY
  }
  return streak
}

export function summarize(records: Record<string, WordRecord>, days: Record<string, DayStat>, now = Date.now()): StatsSummary {
  const rows = Object.values(records)
  const correct = rows.reduce((sum, row) => sum + row.correct, 0)
  const wrong = rows.reduce((sum, row) => sum + row.wrong, 0)
  const totalSeconds = Object.values(days).reduce((sum, row) => sum + row.seconds, 0)
  const week = weekBars(days, now)
  return {
    totalSeconds,
    todaySeconds: days[dayKey(now)]?.seconds ?? 0,
    totalWords: rows.length,
    masteredWords: rows.filter(row => row.streak >= 2 || (row.reps >= 3 && row.correct / Math.max(1, row.reps) >= 0.8)).length,
    dueWords: rows.filter(row => row.reps > 0 && row.nextReview <= now).length,
    correct,
    wrong,
    accuracy: correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : 0,
    streak: streakDays(days, now),
    week,
  }
}

export function weakWords(records: Record<string, WordRecord>, limit = 8) {
  return Object.values(records)
    .filter(row => row.wrong > 0 || row.reps === 0 || row.streak === 0)
    .sort((left, right) => {
      const leftRate = left.correct / Math.max(1, left.reps)
      const rightRate = right.correct / Math.max(1, right.reps)
      return leftRate - rightRate || right.wrong - left.wrong || left.lastSeen - right.lastSeen
    })
    .slice(0, limit)
}

export function dueWords(records: Record<string, WordRecord>, bookId?: string, now = Date.now()) {
  return Object.values(records)
    .filter(row => (!bookId || row.bookId === bookId) && row.reps > 0 && row.nextReview <= now)
    .sort((left, right) => left.nextReview - right.nextReview)
}
