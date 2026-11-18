import { fetchWithTimeout } from '../fetchTimeout.ts'
import type { PictureBook } from '../pictureBooks'

// 与 Service Worker 共用同一个教材/绘本缓存。这里只有同源 URL 能由本站的
// Service Worker 在断网时重放；跨域文件不能仅凭 Cache Storage 条目承诺离线可读。
const CACHE = 'pep-reader-books-v1'
const REQUEST_TIMEOUT_MS = 15_000

export type PictureOfflineState = {
  supported: boolean
  total: number
  saved: number
  complete: boolean
  reason?: 'unavailable' | 'cross-origin'
}

function assetUrls(book: PictureBook) {
  const urls = new Set<string>([book.manifestUrl, book.manifest.audio, book.manifest.cover])
  if (book.manifest.art) urls.add(book.manifest.art)
  for (const page of book.manifest.pages) urls.add(page.image)
  return [...urls]
}

function hasCrossOriginResource(urls: string[]) {
  if (typeof location === 'undefined' || !location.origin) return false
  return urls.some(url => {
    try { return new URL(url, location.href).origin !== location.origin }
    catch { return true }
  })
}

function unsupported(urls: string[], reason: PictureOfflineState['reason']): PictureOfflineState {
  return { supported: false, total: urls.length, saved: 0, complete: false, reason }
}

function assertSupported(urls: string[]) {
  if (typeof caches === 'undefined') return 'unavailable' as const
  if (hasCrossOriginResource(urls)) return 'cross-origin' as const
  return undefined
}

export async function checkPictureOffline(book: PictureBook): Promise<PictureOfflineState> {
  const urls = assetUrls(book)
  const reason = assertSupported(urls)
  if (reason) return unsupported(urls, reason)
  try {
    const cache = await caches.open(CACHE)
    let saved = 0
    for (const url of urls) {
      if (await cache.match(url, { ignoreVary: true })) saved += 1
    }
    return { supported: true, total: urls.length, saved, complete: saved === urls.length }
  } catch {
    return unsupported(urls, 'unavailable')
  }
}

export async function savePictureOffline(
  book: PictureBook,
  onProgress: (state: PictureOfflineState) => void,
  signal?: AbortSignal,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
): Promise<PictureOfflineState> {
  const urls = assetUrls(book)
  const reason = assertSupported(urls)
  if (reason) return unsupported(urls, reason)
  const cache = await caches.open(CACHE)
  let saved = 0
  for (const url of urls) {
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError')
    try {
      // A bounded request keeps one unavailable resource from pinning the whole queue.
      const response = await fetchWithTimeout(url, { cache: 'reload', signal }, response => response, requestTimeoutMs)
      if (!response.ok || response.type === 'opaque') continue
      await cache.put(url, response.clone())
      saved += 1
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
      // Single-resource network/timeout failure is reported through saved / total.
    }
    onProgress({ supported: true, total: urls.length, saved, complete: saved === urls.length })
  }
  return { supported: true, total: urls.length, saved, complete: saved === urls.length }
}
