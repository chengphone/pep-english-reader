import type { ProfileId } from './learningCore'

// 录音 blob 单独放在 IndexedDB，元数据只存 localStorage。
// 不与教材数据库共用版本号，避免以后升级学习库时让旧的教材读取失败。
const DB_NAME = 'pep-reader-learning-v1'
const STORE = 'clips'
const META_KEY = 'pep:recordings:v1'
const MAX_CLIPS = 300

export type RecordingMeta = {
  id: string
  profile: ProfileId
  bookId: string
  itemId: string
  text: string
  duration: number
  score?: number
  mime: string
  createdAt: number
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('录音存储打开超时'))
    }, 5000)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => {
      clearTimeout(timer)
      if (settled) {
        request.result.close()
        return
      }
      settled = true
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      reject(request.error ?? new Error('录音存储不可用'))
    }
  })
}

function readMeta(): RecordingMeta[] {
  try {
    const value = JSON.parse(localStorage.getItem(META_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    // 元数据可能来自旧版本或被手工改写；逐条规范化，坏记录不能让面板崩溃。
    return value.flatMap((row): RecordingMeta[] => {
      if (!row || typeof row !== 'object') return []
      const record = row as Record<string, unknown>
      if (typeof record.id !== 'string' || !record.id) return []
      if (record.profile !== 'a' && record.profile !== 'b') return []
      if (typeof record.bookId !== 'string' || !record.bookId) return []
      if (typeof record.itemId !== 'string' || !record.itemId) return []
      if (typeof record.text !== 'string') return []
      if (typeof record.mime !== 'string' || !record.mime) return []
      const duration = Number(record.duration)
      const createdAt = Number(record.createdAt)
      const score = Number(record.score)
      return [{
        id: record.id,
        profile: record.profile,
        bookId: record.bookId,
        itemId: record.itemId,
        text: record.text,
        duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
        score: Number.isFinite(score) ? score : undefined,
        mime: record.mime,
        createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0,
      }]
    })
  } catch {
    return []
  }
}

function writeMeta(rows: RecordingMeta[]) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(rows.slice(0, MAX_CLIPS)))
  } catch {
    // 存储失败时仍把本次录音留在这个页面里。
  }
}

export function listRecordings(profile: ProfileId, bookId: string, itemId: string) {
  return readMeta()
    .filter(row => row.profile === profile && row.bookId === bookId && row.itemId === itemId)
    .sort((left, right) => right.createdAt - left.createdAt)
}

export function latestRecording(profile: ProfileId, bookId: string, itemId: string) {
  return listRecordings(profile, bookId, itemId)[0]
}

async function putBlob(id: string, blob: Blob) {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ id, blob })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function deleteBlob(id: string) {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function saveRecording(options: {
  profile: ProfileId
  bookId: string
  itemId: string
  text: string
  duration: number
  score?: number
  mime: string
  blob: Blob
}): Promise<RecordingMeta> {
  const createdAt = Date.now()
  const id = `${options.profile}:${options.bookId}:${options.itemId}:${createdAt}`
  await putBlob(id, options.blob)
  const meta: RecordingMeta = {
    id,
    profile: options.profile,
    bookId: options.bookId,
    itemId: options.itemId,
    text: options.text,
    duration: Math.max(0, options.duration),
    score: Number.isFinite(options.score) ? Math.round(options.score!) : undefined,
    mime: options.mime,
    createdAt,
  }
  const rows = [meta, ...readMeta()]
  writeMeta(rows)
  for (const stale of rows.slice(MAX_CLIPS)) void deleteBlob(stale.id).catch(() => {})
  return meta
}

export async function readRecording(id: string): Promise<Blob | null> {
  const db = await openDb()
  try {
    const value = await new Promise<{ blob?: Blob } | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).get(id)
      request.onsuccess = () => resolve(request.result as { blob?: Blob } | undefined)
      request.onerror = () => reject(request.error)
    })
    return value?.blob instanceof Blob ? value.blob : null
  } finally {
    db.close()
  }
}

export async function deleteRecording(id: string) {
  writeMeta(readMeta().filter(row => row.id !== id))
  await deleteBlob(id).catch(() => {})
}
