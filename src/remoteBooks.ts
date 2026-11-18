import { fetchWithTimeout } from './fetchTimeout.ts'
import { normalizeReaderManifest } from './libraryValidation.ts'
import type { LocalBook, ReaderItem, ReaderManifest, ReaderPage, ReaderResource, RemoteBookEntry } from './reader/types'

// 在线教材目录：应用基路径下的 remote-books.json；也可以用 ?catalog=<URL>
// 指向任意 HTTPS 静态目录。目录里只放清单地址，课本图片和音频由同一清单解析。
const DEFAULT_CATALOG = (import.meta.env?.BASE_URL ?? '/pep-english-reader/') + 'remote-books.json'
const PAGE_KEY = 'pep:remote-page:'
const TRANSLATION_KEY = 'pep:remote-translation:'
const ITEMS_KEY = 'pep:remote-items:'

function isObject(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function isRect(value: unknown): value is [number, number, number, number] { return Array.isArray(value) && value.length === 4 && value.every(number => typeof number === 'number' && Number.isFinite(number)) && value[0] >= 0 && value[1] >= 0 && value[2] <= 1 && value[3] <= 1 && value[2] > value[0] && value[3] > value[1] }
function isResource(value: unknown): value is ReaderResource {
  return isObject(value) && typeof value.id === 'string' && !!value.id.trim() &&
    (value.kind === 'audio' || value.kind === 'video') &&
    typeof value.src === 'string' && !!value.src.trim() &&
    (value.title === undefined || typeof value.title === 'string') &&
    (value.subtitle === undefined || typeof value.subtitle === 'string') &&
    (value.track === undefined || typeof value.track === 'number') &&
    (value.duration === undefined || (typeof value.duration === 'number' && Number.isFinite(value.duration) && value.duration >= 0)) &&
    (value.poster === undefined || typeof value.poster === 'string') &&
    (value.continuous === undefined || typeof value.continuous === 'boolean') &&
    (value.startAt === undefined || (typeof value.startAt === 'number' && Number.isFinite(value.startAt) && value.startAt >= 0))
}

export function catalogUrl(): URL {
  const requested = new URL(location.href).searchParams.get('catalog')
  return new URL(requested || DEFAULT_CATALOG, location.href)
}

// 只接受 http(s) 地址；目录或清单里的单条坏 URL 不能拖垮整个列表。
function safeUrl(value: unknown, base: URL): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function catalogRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (isObject(value) && Array.isArray(value.books)) return value.books
  throw new Error('在线教材目录格式无效。')
}

export function normalizeCatalog(value: unknown, base: URL): RemoteBookEntry[] {
  const rows = catalogRows(value)
  const entries: RemoteBookEntry[] = [], seen = new Set<string>()
  for (const row of rows) {
    if (!isObject(row) || typeof row.id !== 'string' || !row.id.trim() || typeof row.manifest !== 'string' || !row.manifest.trim()) continue
    const id = row.id.trim()
    if (seen.has(id)) continue
    const manifest = safeUrl(row.manifest, base)
    if (!manifest) continue
    seen.add(id)
    const pages = Number(row.pages)
    const items = Number(row.items)
    const audio = Number(row.audio)
    const videos = Number(row.videos)
    entries.push({
      id,
      title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : id,
      manifest,
      pages: Number.isFinite(pages) && pages > 0 ? Math.trunc(pages) : undefined,
      items: Number.isFinite(items) && items > 0 ? Math.trunc(items) : undefined,
      audio: Number.isFinite(audio) && audio > 0 ? Math.trunc(audio) : undefined,
      videos: Number.isFinite(videos) && videos > 0 ? Math.trunc(videos) : undefined,
      cover: safeUrl(row.cover, base),
      series: typeof row.series === 'string' && row.series.trim() ? row.series.trim() : undefined,
      publisher: typeof row.publisher === 'string' && row.publisher.trim() ? row.publisher.trim() : undefined,
    })
  }
  return entries
}

export type RemoteCatalogLoad = { entries: RemoteBookEntry[]; error?: string }

// 默认目录失败时保留错误信息，让课本中心能区分“没有配置教材”和“网络/格式错误”。
export async function loadRemoteCatalogDetailed(): Promise<RemoteCatalogLoad> {
  const url = catalogUrl()
  const explicit = new URL(location.href).searchParams.has('catalog')
  try {
    const entries = await fetchWithTimeout(url, { cache: 'no-store' }, async response => {
      if (response.status === 404) return []
      if (!response.ok) throw new Error(`在线教材目录加载失败（HTTP ${response.status}）。`)
      let data: unknown
      try { data = await response.json() } catch { throw new Error('在线教材目录格式无效。') }
      const entries = normalizeCatalog(data, url)
      const rows = Array.isArray(data) ? data : isObject(data) && Array.isArray(data.books) ? data.books : []
      if (rows.length > 0 && !entries.length) throw new Error('在线教材目录格式无效。')
      return entries
    })
    return { entries }
  } catch (error) {
    // 用户显式传 ?catalog= 时保持抛错，方便自定义目录排查。
    if (explicit) throw error
    console.warn('Remote book catalog unavailable', error)
    return { entries: [], error: error instanceof Error ? error.message : '在线教材目录加载失败，请检查网络后重试。' }
  }
}

export async function loadRemoteCatalog(): Promise<RemoteBookEntry[]> {
  return (await loadRemoteCatalogDetailed()).entries
}

function validManifest(value: unknown): value is ReaderManifest {
  if (!isObject(value) || !Array.isArray(value.pages) || !value.pages.length) return false
  return value.pages.every((page: unknown) => isObject(page) && typeof page.page === 'number' && typeof page.image === 'string' && Array.isArray(page.items))
}

function normalizeRemoteItems(values: unknown[]): ReaderItem[] {
  return values.flatMap(value => {
    if (!isObject(value) || typeof value.id !== 'string' || !value.id.trim() || typeof value.text !== 'string' || !Array.isArray(value.rects)) return []
    const item = { ...value }
    try {
      normalizeReaderManifest({ pages: [{ items: [item] }] })
    } catch {
      // 损坏的可选音频区间退回整段播放，不丢掉其他有效热点。
      delete item.audioStart
      delete item.audioEnd
    }
    return [item as ReaderItem]
  })
}

export async function loadRemoteBook(entry: RemoteBookEntry): Promise<LocalBook> {
  const manifestUrl = new URL(entry.manifest, location.href)
  const manifest = await fetchWithTimeout(manifestUrl, { cache: 'no-cache' }, async response => {
    if (!response.ok) throw new Error(`在线教材清单无法加载（HTTP ${response.status}）。`)
    let data: unknown
    try { data = await response.json() } catch { throw new Error('在线教材清单格式无效。') }
    if (!validManifest(data)) throw new Error('在线教材清单缺少页面，无法打开。')
    const sanitized: ReaderManifest = {
      ...data,
      pages: data.pages.map(page => ({
        ...page,
        items: normalizeRemoteItems(page.items),
        // 资源必须先按在线目录规则过滤。共享净化器会把无效的可选字段删掉，
        // 之后 isResource 就分辨不出原本损坏的资源了（例如负 duration）。
        resources: Array.isArray(page.resources) ? page.resources.filter(isResource) : page.resources,
      })),
    }
    return normalizeReaderManifest(sanitized)
  })
  // 路由和书架都以目录里的 id 为准，清单里的 bookId 只作为数据字段保留。
  const bookId = entry.id
  // 标题会进入阅读器、统计弹窗和 document.title；清单里写成数字或对象时
  // `.trim()` 会直接抛错，整本教材打不开。坏标题退回目录里的条目名。
  const title = typeof manifest.title === 'string' && manifest.title.trim() ? manifest.title.trim() : entry.title
  const pages: ReaderPage[] = []
  for (const page of manifest.pages) {
    const image = safeUrl(page.image, manifestUrl)
    // 单页图片地址损坏时跳过该页，而不是让整本教材打不开。
    if (!image) continue
    pages.push({
      ...page,
      image,
      items: (readRemotePageItems(bookId, page.page) ?? page.items).map(item => ({
        ...item,
        order: Number.isFinite(item.order) ? item.order : 0,
        rects: Array.isArray(item.rects) ? item.rects.filter(isRect) : [],
        audio: item.audio ? safeUrl(item.audio, manifestUrl) : undefined,
        translation: item.translation ?? readRemoteTranslation(bookId, item.id),
      })),
      resources: Array.isArray(page.resources)
        ? page.resources.filter(isResource).flatMap(resource => {
            const src = safeUrl(resource.src, manifestUrl)
            if (!src) return []
            return [{
              ...resource,
              title: resource.title?.trim() || (resource.kind === 'audio' ? '本页音频' : '课堂动漫'),
              src,
              poster: safeUrl(resource.poster, manifestUrl),
            }]
          })
        : undefined,
    })
  }
  if (!pages.length) throw new Error('在线教材清单缺少有效页面，无法打开。')
  return {
    id: bookId,
    manifest: { ...manifest, bookId, title, pages },
    assets: {},
    remote: true,
    manifestUrl: manifestUrl.href,
    lastPage: readRemotePage(bookId),
  }
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStorage(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true } catch { return false }
}

export function readRemotePage(bookId: string): number {
  const value = Number(readStorage(PAGE_KEY + bookId))
  return Number.isInteger(value) && value > 0 ? value : 0
}
export function writeRemotePage(bookId: string, page: number): boolean {
  return writeStorage(PAGE_KEY + bookId, String(Math.max(0, Math.trunc(page))))
}
export function readRemoteTranslation(bookId: string, itemId: string): string | undefined {
  return readStorage(TRANSLATION_KEY + bookId + ':' + itemId) ?? undefined
}
export function writeRemoteTranslation(bookId: string, itemId: string, text: string): boolean {
  const key = TRANSLATION_KEY + bookId + ':' + itemId
  if (!text.trim()) { try { localStorage.removeItem(key); return true } catch { return false } }
  return writeStorage(key, text.trim())
}

export function readRemotePageItems(bookId: string, page: number): ReaderItem[] | undefined {
  const raw = readStorage(ITEMS_KEY + bookId + ':' + page)
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return undefined
    const items = normalizeRemoteItems(value).map(item => ({
      ...item,
      order: Number.isFinite(item.order) ? item.order : 0,
      rects: item.rects.filter(isRect),
    }))
    // 管理员清空整页热区后存的是空数组，这是有效覆盖，不能退回清单里的原始热区；
    // 但如果数组里全是损坏条目，仍按无覆盖处理。
    if (!value.length) return []
    return items.length ? items : undefined
  } catch {
    return undefined
  }
}

export function writeRemotePageItems(bookId: string, page: number, items: ReaderItem[]): boolean {
  const key = ITEMS_KEY + bookId + ':' + page
  try {
    // 空数组也要写入，用来表示“这一页被明确清空”，而不是删除后恢复默认热区。
    localStorage.setItem(key, JSON.stringify(items))
    return true
  } catch {
    // 存储失败时仍然让当前页面使用内存中的修改，但调用方需要知道没有落盘。
    return false
  }
}

export function withRemoteItems(book: LocalBook, page: number, items: ReaderItem[]): LocalBook {
  return {
    ...book,
    manifest: {
      ...book.manifest,
      pages: book.manifest.pages.map(row => row.page === page ? { ...row, items } : row),
    },
  }
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
