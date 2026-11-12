import type { PictureCatalogEntry } from './pictureBooks'

// 绘本馆按“系列 + 集数”分篇章。Journey to the West 是 108 集的连续故事，
// Dino Buddies 是 44 集独立的 Level 1 小故事；分组只影响阅读导航，
// 不改变原始清单、音频映射或首页按系列聚合的逻辑。
export type PictureArc = {
  id: string
  series: string
  volume: string
  title: string
  description: string
  from: number
  to: number
}

export type PictureArcGroup<T> = { arc: PictureArc; entries: T[] }

const JTW = 'Journey to the West'
const DINO = 'Dino Buddies'

export const PICTURE_ARCS: PictureArc[] = [
  { id: 'monkey-king', series: JTW, volume: '第一卷', title: '猴王出世', description: '石猴出世，成为美猴王，拜师学艺。', from: 1, to: 7 },
  { id: 'heaven', series: JTW, volume: '第二卷', title: '大闹天宫', description: '天庭封官、蟠桃园与天宫大战。', from: 8, to: 13 },
  { id: 'pilgrimage', series: JTW, volume: '第三卷', title: '取经启程', description: '观音点化，唐僧西行，徒弟们陆续加入。', from: 14, to: 21 },
  { id: 'yellow-wind', series: JTW, volume: '第四卷', title: '黄风岭与流沙河', description: '黄风怪与流沙河收徒。', from: 22, to: 26 },
  { id: 'ginseng', series: JTW, volume: '第五卷', title: '五庄观', description: '人参果树风波。', from: 27, to: 31 },
  { id: 'white-bone', series: JTW, volume: '第六卷', title: '白骨精与宝象国', description: '三打白骨精，宝象国救师。', from: 32, to: 36 },
  { id: 'gold-horn', series: JTW, volume: '第七卷', title: '金角银角', description: '平顶山莲花洞的紫金红葫芦。', from: 37, to: 43 },
  { id: 'black-rooster', series: JTW, volume: '第八卷', title: '乌鸡国', description: '井中国王与真假唐僧。', from: 44, to: 48 },
  { id: 'red-boy', series: JTW, volume: '第九卷', title: '红孩儿', description: '火云洞三昧真火。', from: 49, to: 52 },
  { id: 'cart-slow', series: JTW, volume: '第十卷', title: '黑水河与车迟国', description: '黑水河神与车迟国斗法。', from: 53, to: 58 },
  { id: 'heaven-river', series: JTW, volume: '第十一卷', title: '通天河', description: '通天河金鱼精与灵感大王。', from: 59, to: 63 },
  { id: 'gold-ring', series: JTW, volume: '第十二卷', title: '金兜洞', description: '独角兕大王与金刚琢。', from: 64, to: 67 },
  { id: 'two-monkeys', series: JTW, volume: '第十三卷', title: '女儿国与真假美猴王', description: '女儿国、蝎子精与真假悟空。', from: 68, to: 75 },
  { id: 'flame', series: JTW, volume: '第十四卷', title: '火焰山与小雷音寺', description: '三借芭蕉扇，小雷音寺遇阻。', from: 76, to: 84 },
  { id: 'spider', series: JTW, volume: '第十五卷', title: '盘丝洞与狮驼岭', description: '盘丝洞蜘蛛精与狮驼岭三魔。', from: 85, to: 98 },
  { id: 'ling-shan', series: JTW, volume: '第十六卷', title: '灵山取经', description: '铜台府洗冤，灵山取得真经。', from: 99, to: 108 },
  { id: 'dino-buddies', series: DINO, volume: 'DINO', title: 'Dino Buddies', description: 'Rex、Sara、Sid 和 Tor 的 44 个日常小故事，Level 1。', from: 1, to: 44 },
]

const OTHER_ARC: PictureArc = {
  id: 'other',
  series: '',
  volume: '未分卷',
  title: '其他绘本',
  description: '没有对应系列篇章的绘本。',
  from: 0,
  to: 0,
}

export function arcForEntry(entry: Pick<PictureCatalogEntry, 'series' | 'episode'>): PictureArc | undefined {
  const series = entry.series?.trim()
  const episode = Number(entry.episode)
  if (!series || !Number.isFinite(episode)) return undefined
  return PICTURE_ARCS.find(arc => arc.series === series && episode >= arc.from && episode <= arc.to)
}

// 保留按集数查 JTW 篇章的便捷函数；新代码请优先用 arcForEntry，避免
// 不同系列的同一集数互相串篇。
export function arcForEpisode(episode?: number): PictureArc | undefined {
  const value = Number(episode)
  if (!Number.isFinite(value)) return undefined
  return PICTURE_ARCS.find(arc => arc.series === JTW && value >= arc.from && value <= arc.to)
}

export function groupPictureEntries<T extends Pick<PictureCatalogEntry, 'series' | 'episode'>>(entries: T[]): PictureArcGroup<T>[] {
  const groups = PICTURE_ARCS.map(arc => ({ arc, entries: [] as T[] }))
  const other: T[] = []
  for (const entry of entries) {
    const series = entry.series?.trim()
    const episode = Number(entry.episode)
    const index = PICTURE_ARCS.findIndex(arc => arc.series === series && Number.isFinite(episode) && episode >= arc.from && episode <= arc.to)
    if (index >= 0) groups[index].entries.push(entry)
    else other.push(entry)
  }
  const visible = groups.filter(group => group.entries.length > 0)
  return other.length ? [...visible, { arc: OTHER_ARC, entries: other }] : visible
}
