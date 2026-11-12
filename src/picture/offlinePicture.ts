import type { PictureBook } from '../pictureBooks'

// 与 Service Worker 共用同一个教材/绘本缓存。这里只负责把一本绘本需要的
// 清单、页面图、封面和整集音频提前抓取到本机；阅读时仍由 Service Worker 提供缓存。
const CACHE = 'pep-reader-books-v1'

export type PictureOfflineState = {
  supported: boolean
  total: number
  saved: number
  complete: boolean
}

function assetUrls(book: PictureBook) {
  const urls = new Set<string>([book.manifestUrl, book.manifest.audio, book.manifest.cover])
  if (book.manifest.art) urls.add(book.manifest.art)
  for (const page of book.manifest.pages) urls.add(page.image)
  return [...urls]
}

export async function checkPictureOffline(book: PictureBook): Promise<PictureOfflineState> {
  const urls = assetUrls(book)
  if (typeof caches === 'undefined') return { supported: false, total: urls.length, saved: 0, complete: false }
  try {
    const cache = await caches.open(CACHE)
    let saved = 0
    for (const url of urls) {
      if (await cache.match(url, { ignoreVary: true })) saved += 1
    }
    return { supported: true, total: urls.length, saved, complete: saved === urls.length }
  } catch {
    return { supported: false, total: urls.length, saved: 0, complete: false }
  }
}

export async function savePictureOffline(
  book: PictureBook,
  onProgress: (state: PictureOfflineState) => void,
): Promise<PictureOfflineState> {
  const urls = assetUrls(book)
  if (typeof caches === 'undefined') return { supported: false, total: urls.length, saved: 0, complete: false }
  const cache = await caches.open(CACHE)
  let saved = 0
  for (const url of urls) {
    try {
      // reload 明确要求重新抓取；Service Worker 也会顺带更新自己的缓存副本。
      const response = await fetch(url, { cache: 'reload' })
      if (!response.ok) continue
      await cache.put(url, response.clone())
      saved += 1
    } catch {
      // 单个文件失败时继续保存其余文件，最后用 saved / total 如实反馈。
    }
    onProgress({ supported: true, total: urls.length, saved, complete: saved === urls.length })
  }
  return { supported: true, total: urls.length, saved, complete: saved === urls.length }
}
