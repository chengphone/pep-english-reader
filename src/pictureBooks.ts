import { fetchWithTimeout } from './fetchTimeout.ts'
import type { ProfileId } from './reader/learningCore'

// 绘本馆目录和教材目录分开：教材继续使用 remote-books.json，
// 绘本使用 /picture-data/picture-books.json。目录只包含元数据，
// 原始插画、整集音频和文字清单由本地服务器按清单地址提供。
const PICTURE_ROOT = new URL('../picture-data/', (typeof location === 'undefined' ? 'http://localhost' : location.origin) + (import.meta.env?.BASE_URL ?? '/pep-english-reader/'))
const PROGRESS_KEY = 'pep:picture-progress:v1'

export type PictureLevel = 'starter' | 'beginner' | 'elementary' | 'intermediate'
export type PictureMode = 'listen' | 'self' | 'practice'
export type PictureSide = 'left' | 'right' | 'both'

export type PictureSentence = {
  id: string
  text: string
  side?: PictureSide
  rects: [number, number, number, number][]
  continuedFrom?: string
  translation?: string
  start?: number
  end?: number
}
export type PicturePage = { pageIndex: number; displayPage: string; image: string; sentences: PictureSentence[] }
export type PictureWord = { word: string; definition: string; example?: string }
export type PictureQuestion = { id: string; prompt: string; options: string[]; answer: number; explanation?: string }
export type PictureBookManifest = {
  schemaVersion: number
  bookId: string
  title: string
  series?: string
  episode?: number
  level: PictureLevel
  levelLabel: string
  themes?: string[]
  audio: string
  audioDuration?: number
  cover: string
  art?: string
  wordCount?: number
  audioSync?: { source?: string; aligned?: number; total?: number; generatedAt?: string }
  pages: PicturePage[]
  vocabulary?: PictureWord[]
  comprehension?: PictureQuestion[]
}
export type PictureCatalogEntry = {
  id: string
  title: string
  episode?: number
  series: string
  level: PictureLevel
  levelLabel: string
  themes: string[]
  cover: string
  art?: string
  manifest: string
  pages?: number
  vocabulary?: number
  quiz?: number
  wordCount?: number
  minutes?: number
  audioDuration?: number
}
export type PictureBook = { id: string; manifest: PictureBookManifest; manifestUrl: string }
export type PictureProgress = { pageIndex: number; mode: PictureMode; updatedAt: number; completedPages: number[] }

// 横版卡片优先使用完整跨页图；书架和搜索的竖版位置使用裁好的封面。
export function pictureArt(entry: { art?: string; cover: string }) {
  return entry.art || entry.cover
}

const LEVELS: PictureLevel[] = ['starter', 'beginner', 'elementary', 'intermediate']
const MODES: PictureMode[] = ['listen', 'self', 'practice']

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function isRect(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every(number => typeof number === 'number' && Number.isFinite(number))
}
function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
function normalizeLevel(value: unknown): PictureLevel {
  return LEVELS.includes(value as PictureLevel) ? value as PictureLevel : 'starter'
}

export function pictureCatalogUrl(): URL {
  const requested = new URL(location.href).searchParams.get('picture-catalog')
  return requested ? new URL(requested, location.href) : new URL('picture-books.json', PICTURE_ROOT)
}

function normalizeCatalog(value: unknown, base: URL): PictureCatalogEntry[] {
  const rows = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.books) ? value.books : []
  const entries: PictureCatalogEntry[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!isObject(row) || !cleanText(row.id) || !cleanText(row.manifest) || seen.has(String(row.id))) continue
    const id = String(row.id)
    seen.add(id)
    const themes = Array.isArray(row.themes) ? row.themes.map(cleanText).filter(Boolean) : []
    entries.push({
      id,
      title: cleanText(row.title) || id,
      episode: Number.isFinite(Number(row.episode)) ? Number(row.episode) : undefined,
      series: cleanText(row.series) || '绘本',
      level: normalizeLevel(row.level),
      levelLabel: cleanText(row.levelLabel) || '启蒙',
      themes,
      cover: new URL(String(row.cover || 'cover.jpg'), base).href,
      art: cleanText(row.art) ? new URL(String(row.art), base).href : undefined,
      manifest: new URL(String(row.manifest), base).href,
      pages: Number.isFinite(Number(row.pages)) ? Math.max(0, Math.trunc(Number(row.pages))) : undefined,
      vocabulary: Number.isFinite(Number(row.vocabulary)) ? Math.max(0, Math.trunc(Number(row.vocabulary))) : undefined,
      quiz: Number.isFinite(Number(row.quiz)) ? Math.max(0, Math.trunc(Number(row.quiz))) : undefined,
      wordCount: Number.isFinite(Number(row.wordCount)) ? Math.max(0, Math.trunc(Number(row.wordCount))) : undefined,
      minutes: Number.isFinite(Number(row.minutes)) ? Math.max(1, Math.trunc(Number(row.minutes))) : undefined,
      audioDuration: Number.isFinite(Number(row.audioDuration)) ? Number(row.audioDuration) : undefined,
    })
  }
  return entries
}

export async function loadPictureCatalog(): Promise<PictureCatalogEntry[]> {
  const url = pictureCatalogUrl()
  const explicit = new URL(location.href).searchParams.has('picture-catalog')
  try {
    return await fetchWithTimeout(url, { cache: 'no-store' }, async response => {
      if (response.status === 404) return []
      if (!response.ok) throw new Error(`绘本目录加载失败（HTTP ${response.status}）。`)
      let data: unknown
      try { data = await response.json() } catch { throw new Error('绘本目录格式无效。') }
      return normalizeCatalog(data, url)
    })
  } catch (error) {
    if (explicit) throw error
    console.warn('Picture book catalog unavailable', error)
    return []
  }
}

function normalizeManifest(value: unknown, base: URL): PictureBookManifest | undefined {
  if (!isObject(value) || !Array.isArray(value.pages) || !value.pages.length) return undefined
  const pages: PicturePage[] = []
  for (const [index, row] of value.pages.entries()) {
    if (!isObject(row) || typeof row.image !== 'string' || !row.image.trim()) continue
    const sentences: PictureSentence[] = []
    for (const sentence of Array.isArray(row.sentences) ? row.sentences : []) {
      if (!isObject(sentence) || typeof sentence.text !== 'string' || !sentence.text.trim()) continue
      const rects = Array.isArray(sentence.rects) ? sentence.rects.filter(isRect) : []
      sentences.push({
        id: cleanText(sentence.id) || `p${index}-s${sentences.length + 1}`,
        text: sentence.text.trim(),
        side: sentence.side === 'right' || sentence.side === 'both' ? sentence.side : 'left',
        rects,
        continuedFrom: cleanText(sentence.continuedFrom) || undefined,
        translation: cleanText(sentence.translation) || undefined,
        start: Number.isFinite(Number(sentence.start)) ? Math.max(0, Number(sentence.start)) : undefined,
        end: Number.isFinite(Number(sentence.end)) ? Math.max(0, Number(sentence.end)) : undefined,
      })
    }
    pages.push({
      pageIndex: Number.isFinite(Number(row.pageIndex)) ? Number(row.pageIndex) : index,
      displayPage: cleanText(row.displayPage) || String(index + 1),
      image: new URL(row.image, base).href,
      sentences,
    })
  }
  if (!pages.length) return undefined
  const vocabulary = (Array.isArray(value.vocabulary) ? value.vocabulary : [])
    .filter(isObject)
    .map(row => ({ word: cleanText(row.word), definition: cleanText(row.definition), example: cleanText(row.example) || undefined }))
    .filter(row => row.word && row.definition)
  const comprehension = (Array.isArray(value.comprehension) ? value.comprehension : [])
    .filter(isObject)
    .map<PictureQuestion>((row, index) => ({
      id: cleanText(row.id) || `q${index + 1}`,
      prompt: cleanText(row.prompt),
      options: Array.isArray(row.options) ? row.options.map(cleanText).filter(Boolean) : [],
      answer: Number.isInteger(row.answer) ? row.answer : 0,
      explanation: cleanText(row.explanation) || undefined,
    }))
    .filter(row => row.prompt && row.options.length >= 2 && row.answer >= 0 && row.answer < row.options.length)
  return {
    schemaVersion: Number(value.schemaVersion) || 1,
    bookId: cleanText(value.bookId),
    title: cleanText(value.title) || '绘本',
    series: cleanText(value.series) || '绘本',
    episode: Number.isFinite(Number(value.episode)) ? Number(value.episode) : undefined,
    level: normalizeLevel(value.level),
    levelLabel: cleanText(value.levelLabel) || '启蒙',
    themes: Array.isArray(value.themes) ? value.themes.map(cleanText).filter(Boolean) : [],
    audio: new URL(cleanText(value.audio) || 'audio/episode.mp3', base).href,
    audioDuration: Number.isFinite(Number(value.audioDuration)) ? Number(value.audioDuration) : undefined,
    cover: new URL(cleanText(value.cover) || 'cover.jpg', base).href,
    art: cleanText(value.art) ? new URL(String(value.art), base).href : undefined,
    wordCount: Number.isFinite(Number(value.wordCount)) ? Number(value.wordCount) : undefined,
    audioSync: isObject(value.audioSync) ? {
      source: cleanText(value.audioSync.source) || undefined,
      aligned: Number.isFinite(Number(value.audioSync.aligned)) ? Number(value.audioSync.aligned) : undefined,
      total: Number.isFinite(Number(value.audioSync.total)) ? Number(value.audioSync.total) : undefined,
      generatedAt: cleanText(value.audioSync.generatedAt) || undefined,
    } : undefined,
    pages,
    vocabulary,
    comprehension: comprehension.length ? comprehension : undefined,
  }
}

export async function loadPictureBook(entry: PictureCatalogEntry): Promise<PictureBook> {
  const manifestUrl = new URL(entry.manifest, location.href)
  const manifest = await fetchWithTimeout(manifestUrl, { cache: 'no-store' }, async response => {
    if (!response.ok) throw new Error(`绘本清单无法加载（HTTP ${response.status}）。`)
    let data: unknown
    try { data = await response.json() } catch { throw new Error('绘本清单格式无效。') }
    const normalized = normalizeManifest(data, manifestUrl)
    if (!normalized) throw new Error('绘本清单缺少页面，无法打开。')
    return normalized
  })
  return { id: entry.id, manifest: { ...manifest, bookId: entry.id, title: manifest.title || entry.title }, manifestUrl: manifestUrl.href }
}

type ProgressStore = Partial<Record<ProfileId, Record<string, PictureProgress>>>

function readStore(): ProgressStore {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}')
    return isObject(value) ? value as ProgressStore : {}
  } catch {
    return {}
  }
}
function writeStore(store: ProgressStore) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(store)) } catch { /* 隐私模式下只保留本次阅读状态 */ }
}

export function readPictureProgress(bookId: string, profile: ProfileId): PictureProgress | undefined {
  const value = readStore()[profile]?.[bookId]
  if (!value || !Number.isFinite(value.pageIndex)) return undefined
  return {
    pageIndex: Math.max(0, Math.trunc(value.pageIndex)),
    mode: MODES.includes(value.mode) ? value.mode : 'listen',
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
    completedPages: Array.isArray(value.completedPages) ? value.completedPages.filter(Number.isInteger) : [],
  }
}

export function writePictureProgress(bookId: string, profile: ProfileId, patch: Partial<PictureProgress>) {
  const store = readStore()
  const previous = store[profile]?.[bookId]
  const next: PictureProgress = {
    pageIndex: Math.max(0, Math.trunc(patch.pageIndex ?? previous?.pageIndex ?? 0)),
    mode: patch.mode && MODES.includes(patch.mode) ? patch.mode : previous?.mode ?? 'listen',
    updatedAt: Date.now(),
    completedPages: patch.completedPages ?? previous?.completedPages ?? [],
  }
  store[profile] = { ...(store[profile] ?? {}), [bookId]: next }
  writeStore(store)
  return next
}

export function markPicturePageComplete(bookId: string, profile: ProfileId, pageIndex: number) {
  const previous = readPictureProgress(bookId, profile)
  const completed = [...new Set([...(previous?.completedPages ?? []), pageIndex])].sort((left, right) => left - right)
  return writePictureProgress(bookId, profile, { pageIndex, completedPages: completed })
}

export function latestPictureProgress(profile: ProfileId): { bookId: string; progress: PictureProgress } | undefined {
  const rows = Object.entries(readStore()[profile] ?? {})
    .filter(([, progress]) => progress && Number.isFinite(progress.updatedAt))
    .sort((left, right) => (right[1].updatedAt ?? 0) - (left[1].updatedAt ?? 0))
  return rows[0] ? { bookId: rows[0][0], progress: rows[0][1] } : undefined
}

export function pictureProgressPosition(progress: PictureProgress | undefined, pageCount: number) {
  if (!progress || pageCount <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(((progress.pageIndex + 1) / pageCount) * 100)))
}

function hash(text: string) {
  let value = 2166136261
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}
function shortDefinition(definition: string) {
  const text = definition.replace(/^\d+[.、]\s*/, '').replace(/[（(]\s*\d+[.、]?\s*/g, '').trim()
  return text.length > 34 ? `${text.slice(0, 33)}…` : text
}
function deterministicShuffle<T>(items: T[], seed: string) {
  const rows = [...items]
  let state = hash(seed)
  for (let index = rows.length - 1; index > 0; index--) {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0
    const target = state % (index + 1)
    ;[rows[index], rows[target]] = [rows[target], rows[index]]
  }
  return rows
}

// 生词表来自随书附带的生词 PDF。题目只考词义，不冒充故事理解题。
export function buildVocabularyQuiz(manifest: PictureBookManifest, count = 5): PictureQuestion[] {
  const vocabulary = (manifest.vocabulary ?? []).filter(row => row.word && row.definition)
  if (vocabulary.length < 2) return []
  const picks = deterministicShuffle(vocabulary, `${manifest.bookId}:words`).slice(0, Math.min(count, vocabulary.length))
  return picks.map((word) => {
    const correct = shortDefinition(word.definition)
    const distractors = deterministicShuffle(
      vocabulary.filter(row => row.word !== word.word).map(row => shortDefinition(row.definition)).filter(value => value && value !== correct),
      `${manifest.bookId}:${word.word}:options`,
    ).slice(0, 3)
    const options = deterministicShuffle([correct, ...distractors], `${manifest.bookId}:${word.word}:order`)
    return {
      id: `vocab-${word.word}`,
      prompt: `“${word.word}” 在本集故事里最接近哪个意思？`,
      options,
      answer: options.indexOf(correct),
      explanation: word.example ? `例句：${word.example}` : undefined,
    }
  })
}

export function questionsFor(manifest: PictureBookManifest, mode: 'comprehension' | 'vocabulary') {
  if (mode === 'comprehension' && manifest.comprehension?.length) return manifest.comprehension
  return buildVocabularyQuiz(manifest)
}

export function hasComprehension(manifest: PictureBookManifest) {
  return Boolean(manifest.comprehension?.length)
}
