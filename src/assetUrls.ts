// 本机教材的图片和音频以 Blob 存在 IndexedDB 里，渲染前要换成 object URL。
// 同一本教材重新导入后 Blob 会变；只按教材 id 缓存会继续显示旧图片、播放旧音频。
type ObjectUrlApi = {
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

const cache = new Map<string, { bookId: string; blob: Blob; url: string }>()

// 教材 id 和资源路径都来自清单，可以包含任意字符（包括冒号）。用拼接字符串
// 做键会让 ('a','b:c') 与 ('a:b','c') 撞在一起；JSON 数组键不会产生歧义。
const keyFor = (bookId: string, path: string) => JSON.stringify([bookId, path])

export function assetObjectUrl(bookId: string, path: string, blob: Blob, api: ObjectUrlApi = URL): string {
  const key = keyFor(bookId, path)
  const cached = cache.get(key)
  if (cached && cached.blob === blob) return cached.url
  if (cached) api.revokeObjectURL(cached.url)
  const url = api.createObjectURL(blob)
  cache.set(key, { bookId, blob, url })
  return url
}

export function revokeBookObjectUrls(bookId: string, api: ObjectUrlApi = URL): void {
  // 不能按 `${bookId}:` 前缀筛选：删除教材 a 时会把 a:b 的资源一起撤销。
  for (const [key, entry] of cache) {
    if (entry.bookId !== bookId) continue
    api.revokeObjectURL(entry.url)
    cache.delete(key)
  }
}
