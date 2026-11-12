import type { PictureCatalogEntry } from './pictureBooks'

export type PictureSeriesGroup = {
  key: string
  name: string
  episodes: PictureCatalogEntry[]
}

// 首页按“整套绘本”展示，而不是把连载的每一集都铺成卡片。
// 分组只影响首页聚合，不改变绘本馆里的篇章和单集顺序。
export function groupPictureSeries(entries: PictureCatalogEntry[]): PictureSeriesGroup[] {
  const groups = new Map<string, PictureSeriesGroup>()
  for (const entry of entries) {
    const name = entry.series.trim() || '绘本'
    const key = name.toLocaleLowerCase()
    const group = groups.get(key)
    if (group) group.episodes.push(entry)
    else groups.set(key, { key, name, episodes: [entry] })
  }
  return [...groups.values()].map(group => ({
    ...group,
    episodes: [...group.episodes].sort((left, right) => (left.episode ?? 0) - (right.episode ?? 0)),
  }))
}

// 顶部导航的“下一集”只在同一套绘本内前进，不会跳到别的系列。
export function nextPictureInSeries(entries: PictureCatalogEntry[], currentId: string): PictureCatalogEntry | undefined {
  const current = entries.find(entry => entry.id === currentId)
  if (!current) return undefined
  const series = entries
    .filter(entry => entry.series.trim().toLocaleLowerCase() === current.series.trim().toLocaleLowerCase())
    .sort((left, right) => (left.episode ?? 0) - (right.episode ?? 0))
  const index = series.findIndex(entry => entry.id === currentId)
  return index >= 0 ? series[index + 1] : undefined
}
