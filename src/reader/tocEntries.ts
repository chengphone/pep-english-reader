import type { ReaderManifest, ReaderTocEntry, ReaderTocGroup } from './types'

// 阅读器左侧目录条目：page 是物理页码，label 是书上印刷的页码。
export type BookTocEntry = {
  title: string
  page: number
  level: 1 | 2
  subtitle?: string
  label: number
  group?: string
}

const MAX_TITLE = 120
// 资源标题只是播放器分组名，不适合当章节名；没有 Lesson 编号时不要把它们塞进目录。
const GENERIC_RESOURCE_TITLES = new Set([
  '本页音频', '课堂动漫', '音频', '视频',
  '单词跟读', '字母歌谣', '复习歌曲', '情景对话', '字母歌', '告别对话', '再见歌',
])

function cleanTitle(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : ''
}

function tocLevel(value: unknown): 1 | 2 {
  return value === 2 ? 2 : 1
}

function cleanGroup(value: unknown): string | undefined {
  const title = cleanTitle(value)
  return title || undefined
}

// 主题分组只接受有效页码区间；同一页可落在多个区间时，以先声明的主题为准。
function normalizeGroups(value: unknown): ReaderTocGroup[] {
  if (!Array.isArray(value)) return []
  const groups: ReaderTocGroup[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') continue
    const item = row as Partial<ReaderTocGroup>
    const title = cleanGroup(item.title)
    const from = Number(item.from), to = Number(item.to)
    if (!title || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) continue
    groups.push({ title, from, to })
  }
  return groups.sort((left, right) => left.from - right.from || left.to - right.to)
}

// 大目录没有显式主题时，至少按书页段落分组，避免几十条章节平铺成一列。
function applyGroups(entries: BookTocEntry[], manifest: ReaderManifest): BookTocEntry[] {
  const ranges = normalizeGroups(manifest.tocGroups)
  for (const entry of entries) {
    if (entry.group) continue
    const match = ranges.find(range => entry.page >= range.from && entry.page <= range.to)
    if (match) entry.group = match.title
  }
  if (entries.some(entry => entry.group) || entries.length <= 30) return entries
  const anchors = entries
    .map((entry, index) => ({ entry, index }))
    .filter(row => row.entry.level === 1)
  for (let start = 0; start < anchors.length; start += 10) {
    const first = anchors[start]
    const last = anchors[Math.min(start + 9, anchors.length - 1)]
    const title = `第 ${first.entry.label}–${last.entry.label} 页`
    for (let index = first.index; index <= last.index; index++) entries[index].group = title
  }
  return entries
}

function lessonFrom(text: string): { number: number; title: string } | null {
  // “Lesson 1 Aa · Learn the words” → Lesson 1 · Aa
  const letter = /Lesson\s+(\d+)\s+([A-Za-z]{2})\b/.exec(text)
  if (letter) return { number: Number(letter[1]), title: `Lesson ${Number(letter[1])} · ${letter[2]}` }
  // “Lesson 27 · The Alphabet” → Lesson 27 · The Alphabet
  const named = /Lesson\s+(\d+)\s*[·:]\s*([^·]+?)(?:\s*·|$)/.exec(text)
  if (!named) return null
  const title = cleanTitle(named[2])
  return title ? { number: Number(named[1]), title: `Lesson ${Number(named[1])} · ${title}` } : null
}

// 目录优先使用清单显式声明的 toc，其次从点读标题条目生成，最后从课堂资源里的
// Lesson 编号生成。无论哪种方式，跳转都按清单里的物理页码执行。
export function buildBookToc(manifest: ReaderManifest): BookTocEntry[] {
  const pages = Array.isArray(manifest.pages) ? manifest.pages : []
  if (!pages.length) return []
  const pageNumbers = new Set(pages.map(page => page.page))
  const labelByPage = new Map<number, number>()
  for (const page of pages) {
    const printed = page.printedPage
    labelByPage.set(page.page, typeof printed === 'number' && Number.isInteger(printed) && printed > 0 ? printed : page.page)
  }
  const normalize = (entry: ReaderTocEntry | undefined): BookTocEntry | null => {
    const title = cleanTitle(entry?.title)
    const page = Number(entry?.page)
    if (!title || !Number.isInteger(page) || !pageNumbers.has(page)) return null
    const subtitle = cleanTitle(entry?.subtitle)
    const group = cleanGroup(entry?.group)
    return {
      title,
      page,
      level: tocLevel(entry?.level),
      ...(subtitle ? { subtitle } : {}),
      ...(group ? { group } : {}),
      label: labelByPage.get(page) ?? page,
    }
  }

  if (Array.isArray(manifest.toc) && manifest.toc.length) {
    const explicit = manifest.toc.map(normalize).filter((entry): entry is BookTocEntry => entry !== null)
    if (explicit.length) {
      // 目录按页序排列；同一页上的小节保持清单里的先后顺序，当前章节高亮才能和翻页一致。
      return applyGroups(explicit
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => a.entry.page - b.entry.page || a.index - b.index)
        .map(row => row.entry), manifest)
    }
  }

  const entries: BookTocEntry[] = []
  const seen = new Set<string>()
  const add = (title: string, page: number, level: 1 | 2, subtitle?: string) => {
    const cleaned = cleanTitle(title)
    if (!cleaned || !pageNumbers.has(page)) return
    const key = `${page}\n${level}\n${cleaned}`
    if (seen.has(key)) return
    seen.add(key)
    const cleanSubtitle = cleanTitle(subtitle)
    entries.push({
      title: cleaned,
      page,
      level,
      ...(cleanSubtitle ? { subtitle: cleanSubtitle } : {}),
      label: labelByPage.get(page) ?? page,
    })
  }

  // 图画词典这类教材把主题标题 / 分区标题作为点读条目，id 以 _t、_h1… 结尾。
  for (const page of pages) {
    for (const item of page.items ?? []) {
      if (/_t$/.test(item.id)) add(item.text, page.page, 1)
      else if (/_h[1-9]\d*$/.test(item.id)) add(item.text, page.page, 2)
    }
  }
  if (entries.length) return applyGroups(entries, manifest)

  // 学生用书没有标题条目时，按 Lesson 编号归并相邻的 Learn / Talk 页；
  // 每课第一次出现的那一页就是目录跳转页。跨页音频只在起始页记一次。
  const lessons = new Set<number>()
  const resourceIds = new Set<string>()
  for (const page of pages) {
    let lessonMatched = false
    for (const resource of page.resources ?? []) {
      const subtitle = resource.subtitle ?? ''
      const title = resource.title ?? ''
      const lesson = lessonFrom(subtitle) ?? lessonFrom(title)
      if (lesson) {
        lessonMatched = true
        if (!lessons.has(lesson.number)) {
          lessons.add(lesson.number)
          add(lesson.title, page.page, 1)
        }
      }
    }
    if (!lessonMatched) {
      const resource = (page.resources ?? []).find(row => {
        const title = cleanTitle(row.title)
        return row.kind === 'audio' && title && !GENERIC_RESOURCE_TITLES.has(title) && !resourceIds.has(row.id)
      })
      if (resource) add(resource.title, page.page, 1)
    }
    for (const resource of page.resources ?? []) if (resource.id) resourceIds.add(resource.id)
  }
  return applyGroups(entries, manifest)
}

// 当前页对应的目录项：优先精确命中一级条目，否则取当前页之前最近的一级条目。
// 同一个印刷页上的小节（The Months / Days of the Week…）不会抢走主题的选中态。
export function activeTocIndex(entries: BookTocEntry[], currentPage: number): number {
  let exact = -1
  let lastTop = -1
  let lastAny = -1
  entries.forEach((entry, index) => {
    if (entry.page > currentPage) return
    lastAny = index
    if (entry.level !== 1) return
    lastTop = index
    if (entry.page === currentPage && exact < 0) exact = index
  })
  return exact >= 0 ? exact : lastTop >= 0 ? lastTop : lastAny
}
