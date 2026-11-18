// 本机教材的图片和音频以 Blob 存在 IndexedDB 里，渲染前要换成 object URL。
// 同一本教材重新导入后 Blob 会变；只按教材 id 缓存会继续显示旧图片、播放旧音频。
type ObjectUrlApi = {
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

const cache = new Map<string, { blob: Blob; url: string }>()

export function assetObjectUrl(bookId: string, path: string, blob: Blob, api: ObjectUrlApi = URL): string {
  const key = `${bookId}:${path}`
  const cached = cache.get(key)
  if (cached && cached.blob === blob) return cached.url
  if (cached) api.revokeObjectURL(cached.url)
  const url = api.createObjectURL(blob)
  cache.set(key, { blob, url })
  return url
}

export function revokeBookObjectUrls(bookId: string, api: ObjectUrlApi = URL): void {
  const prefix = `${bookId}:`
  for (const [key, entry] of cache) {
    if (!key.startsWith(prefix)) continue
    api.revokeObjectURL(entry.url)
    cache.delete(key)
  }
}
