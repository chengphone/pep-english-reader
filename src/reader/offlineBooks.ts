import type { LocalBook } from './types'

// 在线教材的离线缓存。SW 会优先从 pep-reader-books-v1 返回 /book-data/ 下的
// 清单、页面、音频和视频；这里只负责把 URL 抓下来并记录状态。
export const BOOK_CACHE = 'pep-reader-books-v1'
const META_KEY = 'pep:offline-books:v1'

export type OfflineMeta = {
  bookId: string
  title: string
  cachedAt: number
  bytes: number
  urls: string[]
}

export type OfflineProgress = {
  done: number
  total: number
  bytes: number
  current: string
}

function readAll(): Record<string, OfflineMeta> {
  try {
    const value = JSON.parse(localStorage.getItem(META_KEY) ?? '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function writeAll(value: Record<string, OfflineMeta>) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(value))
  } catch {
    // 存储配额不足时至少让当前会话知道哪些书已经缓存。
  }
}

export function offlineStatus(bookId: string): OfflineMeta | undefined {
  return readAll()[bookId]
}

export function listOfflineBooks() {
  return Object.values(readAll()).sort((left, right) => right.cachedAt - left.cachedAt)
}

export function collectBookUrls(book: LocalBook) {
  const urls = new Set<string>()
  if (book.manifestUrl) urls.add(book.manifestUrl)
  for (const page of book.manifest.pages) {
    if (page.image) urls.add(page.image)
    for (const item of page.items) if (item.audio) urls.add(item.audio)
    for (const resource of page.resources ?? []) {
      urls.add(resource.src)
      if (resource.poster) urls.add(resource.poster)
    }
  }
  return [...urls].filter(url => /^https?:\/\//i.test(url))
}

async function fetchForCache(url: string) {
  try {
    return await fetch(url, { mode: 'cors', cache: 'reload' })
  } catch {
    // 跨域媒体如果没有 CORS 头，仍然可以用 no-cors 存成 opaque 响应，
    // <img>/<audio> 读取时不需要应用层访问响应正文。
    return fetch(url, { mode: 'no-cors', cache: 'reload' })
  }
}

export async function cacheBook(
  book: LocalBook,
  onProgress: (progress: OfflineProgress) => void,
  signal?: AbortSignal,
): Promise<{ meta: OfflineMeta; failures: string[] }> {
  if (!book.remote) throw new Error('本机教材已经保存在浏览器中，不需要重复下载。')
  if (!('caches' in window)) throw new Error('当前浏览器不支持离线缓存，请使用 HTTPS 或 localhost 打开。')
  const urls = collectBookUrls(book)
  if (!urls.length) throw new Error('这本教材没有可缓存的资源。')
  const cache = await caches.open(BOOK_CACHE)
  let done = 0
  let bytes = 0
  const failures: string[] = []
  const cachedUrls: string[] = []
  const total = urls.length
  const worker = async () => {
    while (true) {
      if (signal?.aborted) throw new DOMException('已取消下载', 'AbortError')
      const url = urls.shift()
      if (!url) return
      let cached: Response | undefined
      try {
        cached = await cache.match(url, { ignoreVary: true })
      } catch {
        cached = undefined
      }
      if (!cached) {
        try {
          const response = await fetchForCache(url)
          if (!response.ok && response.type !== 'opaque') throw new Error(String(response.status))
          await cache.put(url, response.clone())
          bytes += Number(response.headers.get('content-length')) || 0
          cachedUrls.push(url)
        } catch {
          failures.push(url)
        }
      } else {
        cachedUrls.push(url)
        bytes += Number(cached.headers.get('content-length')) || 0
      }
      done++
      onProgress({ done, total, bytes, current: url })
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  if (!cachedUrls.length) throw new Error('资源下载失败，请检查网络或跨域设置后重试。')
  const previous = readAll()
  const meta: OfflineMeta = {
    bookId: book.id,
    title: book.manifest.title,
    cachedAt: Date.now(),
    bytes,
    urls: [...new Set([...(previous[book.id]?.urls ?? []), ...cachedUrls])],
  }
  writeAll({ ...previous, [book.id]: meta })
  return { meta, failures }
}

export async function removeBookCache(bookId: string) {
  if (!('caches' in window)) return
  const all = readAll()
  const meta = all[bookId]
  if (!meta) return
  const cache = await caches.open(BOOK_CACHE)
  await Promise.all(meta.urls.map(url => cache.delete(url).catch(() => false)))
  delete all[bookId]
  writeAll(all)
}

export async function estimateStorage() {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 }
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
}
