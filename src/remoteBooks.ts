import { fetchWithTimeout } from './fetchTimeout'
import { normalizeReaderManifest } from './libraryValidation'
import type { LocalBook, ReaderItem, ReaderManifest, ReaderPage, ReaderResource, RemoteBookEntry } from './reader/types'

// 在线教材目录：应用基路径下的 remote-books.json；也可以用 ?catalog=<URL>
// 指向任意 HTTPS 静态目录。目录里只放清单地址，课本图片和音频由同一清单解析。
const DEFAULT_CATALOG = import.meta.env.BASE_URL + 'remote-books.json'
const PAGE_KEY = 'pep:remote-page:'
const TRANSLATION_KEY = 'pep:remote-translation:'

function isObject(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function isRect(value: unknown): value is [number, number, number, number] { return Array.isArray(value) && value.length === 4 && value.every(number => typeof number === 'number' && Number.isFinite(number)) }
function isResource(value: unknown): value is ReaderResource {
  return isObject(value) && typeof value.id === 'string' && !!value.id.trim() &&
    (value.kind === 'audio' || value.kind === 'video') &&
    typeof value.src === 'string' && !!value.src.trim() &&
    (value.title === undefined || typeof value.title === 'string') &&
    (value.subtitle === undefined || typeof value.subtitle === 'string') &&
    (value.track === undefined || typeof value.track === 'number') &&
    (value.duration === undefined || typeof value.duration === 'number') &&
    (value.poster === undefined || typeof value.poster === 'string') &&
    (value.continuous === undefined || typeof value.continuous === 'boolean') &&
    (value.startAt === undefined || (typeof value.startAt === 'number' && Number.isFinite(value.startAt) && value.startAt >= 0))
}

export function catalogUrl(): URL {
  const requested = new URL(location.href).searchParams.get('catalog')
  return new URL(requested || DEFAULT_CATALOG, location.href)
}

function normalizeCatalog(value: unknown, base: URL): RemoteBookEntry[] {
  const rows = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.books) ? value.books : []
  const entries: RemoteBookEntry[] = [], seen = new Set<string>()
  for (const row of rows) {
    if (!isObject(row) || typeof row.id !== 'string' || !row.id.trim() || typeof row.manifest !== 'string' || !row.manifest.trim() || seen.has(row.id)) continue
    seen.add(row.id)
    const pages = Number(row.pages)
    const items = Number(row.items)
    const audio = Number(row.audio)
    const videos = Number(row.videos)
    entries.push({
      id: row.id.trim(),
      title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : row.id.trim(),
      manifest: new URL(row.manifest, base).href,
      pages: Number.isFinite(pages) && pages > 0 ? Math.trunc(pages) : undefined,
      items: Number.isFinite(items) && items > 0 ? Math.trunc(items) : undefined,
      audio: Number.isFinite(audio) && audio > 0 ? Math.trunc(audio) : undefined,
      videos: Number.isFinite(videos) && videos > 0 ? Math.trunc(videos) : undefined,
      cover: typeof row.cover === 'string' && row.cover.trim() ? new URL(row.cover, base).href : undefined,
    })
  }
  return entries
}

export async function loadRemoteCatalog(): Promise<RemoteBookEntry[]> {
  const url = catalogUrl()
  const explicit = new URL(location.href).searchParams.has('catalog')
  try {
    return await fetchWithTimeout(url, { cache: 'no-store' }, async response => {
      if (response.status === 404) return []
      if (!response.ok) throw new Error(`在线教材目录加载失败（HTTP ${response.status}）。`)
      let data: unknown
      try { data = await response.json() } catch { throw new Error('在线教材目录格式无效。') }
      return normalizeCatalog(data, url)
    })
  } catch (error) {
    // 默认目录不存在是正常情况（例如 GitHub Pages 没有配置在线教材）。
    // 只有用户显式传了 ?catalog= 时才把错误显示出来。
    if (explicit) throw error
    console.warn('Remote book catalog unavailable', error)
    return []
  }
}

function validManifest(value: unknown): value is ReaderManifest {
  if (!isObject(value) || !Array.isArray(value.pages) || !value.pages.length) return false
  return value.pages.every((page: unknown) => isObject(page) && typeof page.page === 'number' && typeof page.image === 'string' && Array.isArray(page.items))
}

export async function loadRemoteBook(entry: RemoteBookEntry): Promise<LocalBook> {
  const manifestUrl = new URL(entry.manifest, location.href)
  const manifest = await fetchWithTimeout(manifestUrl, { cache: 'no-store' }, async response => {
    if (!response.ok) throw new Error(`在线教材清单无法加载（HTTP ${response.status}）。`)
    let data: unknown
    try { data = await response.json() } catch { throw new Error('在线教材清单格式无效。') }
    if (!validManifest(data)) throw new Error('在线教材清单缺少页面，无法打开。')
    return normalizeReaderManifest(data)
  })
  // 路由和书架都以目录里的 id 为准，清单里的 bookId 只作为数据字段保留。
  const bookId = entry.id
  const pages: ReaderPage[] = manifest.pages.map(page => ({
    ...page,
    image: new URL(page.image, manifestUrl).href,
    items: page.items.map(item => ({
      ...item,
      order: Number.isFinite(item.order) ? item.order : 0,
      rects: Array.isArray(item.rects) ? item.rects.filter(isRect) : [],
      audio: item.audio ? new URL(item.audio, manifestUrl).href : undefined,
      translation: item.translation ?? readRemoteTranslation(bookId, item.id),
    })),
    resources: Array.isArray(page.resources)
      ? page.resources.filter(isResource).map(resource => ({
          ...resource,
          title: resource.title?.trim() || (resource.kind === 'audio' ? '本页音频' : '课堂动漫'),
          src: new URL(resource.src, manifestUrl).href,
          poster: resource.poster ? new URL(resource.poster, manifestUrl).href : undefined,
        }))
      : undefined,
  }))
  return {
    id: bookId,
    manifest: { ...manifest, bookId, title: manifest.title || entry.title, pages },
    assets: {},
    remote: true,
    lastPage: readRemotePage(bookId),
  }
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 隐私模式下只保留本次阅读状态 */ }
}

export function readRemotePage(bookId: string): number {
  const value = Number(readStorage(PAGE_KEY + bookId))
  return Number.isInteger(value) && value > 0 ? value : 0
}
export function writeRemotePage(bookId: string, page: number) {
  writeStorage(PAGE_KEY + bookId, String(Math.max(0, Math.trunc(page))))
}
export function readRemoteTranslation(bookId: string, itemId: string): string | undefined {
  return readStorage(TRANSLATION_KEY + bookId + ':' + itemId) ?? undefined
}
export function writeRemoteTranslation(bookId: string, itemId: string, text: string) {
  const key = TRANSLATION_KEY + bookId + ':' + itemId
  if (!text.trim()) { try { localStorage.removeItem(key) } catch { /* ignore */ } return }
  writeStorage(key, text.trim())
}

export function withRemoteTranslation(book: LocalBook, item: ReaderItem, text: string): LocalBook {
  return {
    ...book,
    manifest: {
      ...book.manifest,
      pages: book.manifest.pages.map(page => ({
        ...page,
        items: page.items.map(row => row.id === item.id ? { ...row, translation: text } : row),
      })),
    },
  }
}
