import { useSyncExternalStore } from 'react'
import type { ReaderItem } from './types'
import {
  addStudySeconds,
  dueWords,
  emptyState,
  newWordRecord,
  normalizeState,
  profileWordKey,
  recordEvent,
  reviewWord,
  summarize,
  weakWords,
  type Bookmark,
  type LearningState,
  type ProfileId,
  type QuizEvent,
  type QuizKind,
  type WordRecord,
} from './learningCore'

const STORAGE_KEY = 'pep:learning:v1'
const listeners = new Set<() => void>()
let cache: LearningState | null = null

function emit() {
  for (const listener of listeners) listener()
}

function persist(next: LearningState) {
  cache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 隐私模式或存储已满时至少保留当前会话内的学习状态。
  }
  emit()
}

export function getLearningState(): LearningState {
  if (!cache) {
    try {
      cache = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
    } catch {
      cache = emptyState()
    }
  }
  return cache
}

function update(mutator: (state: LearningState) => LearningState) {
  persist(mutator(getLearningState()))
}

export function subscribeLearning(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return
    try {
      cache = normalizeState(JSON.parse(event.newValue ?? 'null'))
    } catch {
      cache = emptyState()
    }
    emit()
  })
}

export function useLearningState() {
  return useSyncExternalStore(subscribeLearning, getLearningState, getLearningState)
}

export function activeProfile(state = getLearningState()): ProfileId {
  return state.active
}

export function setActiveProfile(profile: ProfileId) {
  if (profile !== 'a' && profile !== 'b') return
  update(state => ({ ...state, active: profile }))
}

export function renameProfile(profile: ProfileId, name: string) {
  const trimmed = name.trim().slice(0, 24)
  if (!trimmed) return
  update(state => ({ ...state, profiles: { ...state.profiles, [profile]: { name: trimmed } } }))
}

export function recordPageVisit(bookId: string, page: number) {
  const profile = activeProfile()
  const previous = getLearningState().lastPages[profile]?.[bookId]
  if (previous === page) return
  update(state => ({
    ...state,
    lastPages: {
      ...state.lastPages,
      [profile]: { ...(state.lastPages[profile] ?? {}), [bookId]: Math.max(0, Math.trunc(page)) },
    },
  }))
}

export function readLastPage(bookId: string, profile = activeProfile()) {
  return getLearningState().lastPages[profile]?.[bookId]
}

const CHAPTER_KEY = 'pep:last-chapter:'

// 最近阅读章节只影响书架上的“继续学习”卡片，不写入学习库主状态。
// 按学习档案隔离，A/B 切换后各自看到自己停下的位置。
export function readLastChapter(bookId: string, profile = activeProfile()): { label: string; at: number } | undefined {
  try {
    const raw = localStorage.getItem(CHAPTER_KEY + profile + ':' + bookId)
    if (!raw) return undefined
    try {
      const value = JSON.parse(raw)
      if (value && typeof value.label === 'string' && Number.isFinite(value.at)) return { label: value.label, at: value.at }
    } catch {
      // 兼容早期只保存标题文本的格式。
    }
    return { label: raw, at: 0 }
  } catch {
    return undefined
  }
}

export function recordLastChapter(bookId: string, label: string) {
  const trimmed = label.trim()
  if (!trimmed) return
  const profile = activeProfile()
  try {
    localStorage.setItem(CHAPTER_KEY + profile + ':' + bookId, JSON.stringify({ label: trimmed.slice(0, 120), at: Date.now() }))
  } catch {
    // 存储不可用时不影响阅读。
  }
}

export function recordStudySeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return
  const profile = activeProfile()
  update(state => ({ ...state, days: { ...state.days, [profile]: addStudySeconds(state, profile, seconds) } }))
}

export function recordWordResult(options: {
  bookId: string
  page: number
  item: ReaderItem
  kind: QuizKind
  correct: boolean
  score?: number
}) {
  const profile = activeProfile()
  const now = Date.now()
  const key = profileWordKey(options.bookId, options.item.id)
  update(state => {
    const current = state.words[profile] ?? {}
    const record = current[key] ?? newWordRecord(options.item, options.bookId, options.page, now)
    const next = reviewWord(record, options.correct, now)
    const scored: WordRecord = {
      ...next,
      translation: options.item.translation ?? next.translation,
      bestScore: Number.isFinite(options.score) ? Math.max(next.bestScore ?? 0, Math.round(options.score!)) : next.bestScore,
    }
    const event: QuizEvent = {
      id: `${now}:${key}:${options.kind}`,
      at: now,
      bookId: options.bookId,
      page: options.page,
      itemId: options.item.id,
      text: options.item.text,
      kind: options.kind,
      correct: options.correct,
      score: Number.isFinite(options.score) ? Math.round(options.score!) : undefined,
    }
    const { events, days } = recordEvent(state, profile, event)
    return {
      ...state,
      words: { ...state.words, [profile]: { ...current, [key]: scored } },
      events: { ...state.events, [profile]: events },
      days: { ...state.days, [profile]: days },
    }
  })
}

export function recordRecordingResult(options: {
  bookId: string
  page: number
  item: ReaderItem
  score?: number
}) {
  // 没有语音识别分数时只保留录音，不把“读过一遍”当成答对，
  // 否则统计页会出现没有评分依据的 100% 正确率。
  if (typeof options.score !== 'number') return
  recordWordResult({ ...options, kind: 'recording', correct: options.score >= 75, score: options.score })
}

export function toggleBookmark(bookId: string, page: number, label: string) {
  const profile = activeProfile()
  const id = `${bookId}:${page}`
  let added = false
  update(state => {
    const rows = state.bookmarks[profile] ?? []
    const existing = rows.find(row => row.id === id)
    added = !existing
    const next = existing
      ? rows.filter(row => row.id !== id)
      : [...rows, { id, bookId, page, label, createdAt: Date.now() }]
    return { ...state, bookmarks: { ...state.bookmarks, [profile]: next } }
  })
  return added
}

export function removeBookmark(id: string) {
  const profile = activeProfile()
  update(state => ({
    ...state,
    bookmarks: { ...state.bookmarks, [profile]: (state.bookmarks[profile] ?? []).filter(row => row.id !== id) },
  }))
}

export function bookmarksFor(bookId: string, profile = activeProfile()): Bookmark[] {
  return (getLearningState().bookmarks[profile] ?? [])
    .filter(row => row.bookId === bookId)
    .sort((left, right) => left.page - right.page || right.createdAt - left.createdAt)
}

export function recordsFor(profile = activeProfile()) {
  return getLearningState().words[profile] ?? {}
}

export function dueForBook(bookId: string, profile = activeProfile()) {
  return dueWords(recordsFor(profile), bookId)
}

export function weakForBook(bookId: string, profile = activeProfile()) {
  const records = Object.fromEntries(
    Object.entries(recordsFor(profile)).filter(([, row]) => row.bookId === bookId),
  )
  return weakWords(records)
}

export function summaryFor(profile = activeProfile()) {
  return summarize(recordsFor(profile), getLearningState().days[profile] ?? {})
}

// 复习面板按“本书”统计，避免把别的教材的待复习词算进当前课本。
export function summaryForBook(bookId: string, profile = activeProfile()) {
  const records = Object.fromEntries(
    Object.entries(recordsFor(profile)).filter(([, row]) => row.bookId === bookId),
  )
  return summarize(records, getLearningState().days[profile] ?? {})
}

export function eventsFor(profile = activeProfile()) {
  return [...(getLearningState().events[profile] ?? [])].sort((left, right) => right.at - left.at)
}

export function exportLearningState() {
  return JSON.stringify(getLearningState(), null, 2)
}
