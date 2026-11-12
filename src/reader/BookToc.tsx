import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, LocateFixed, Search, X } from 'lucide-react'
import { activeTocIndex, type BookTocEntry } from './tocEntries'

type Props = {
  entries: BookTocEntry[]
  bookTitle: string
  currentPage: number
  onSelect: (page: number) => void
  onClose: () => void
}

type TocRow = { entry: BookTocEntry; index: number }
type TocGroup = { title?: string; rows: TocRow[] }

function groupRows(rows: TocRow[]): TocGroup[] {
  const groups: TocGroup[] = []
  const byTitle = new Map<string, TocGroup>()
  for (const row of rows) {
    const title = row.entry.group
    const key = title ?? '__ungrouped'
    let group = byTitle.get(key)
    if (!group) {
      group = title ? { title, rows: [] } : { rows: [] }
      byTitle.set(key, group)
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

// 目录按主题分组，并提供搜索和“回到当前”定位。
// 同一页的小节（如 Calendar 下的月份/星期/季节）保持二级缩进，避免看起来像重复条目。
export default function BookToc({ entries, bookTitle, currentPage, onSelect, onClose }: Props) {
  const active = activeTocIndex(entries, currentPage)
  const activeEntry = entries[active]
  const bodyRef = useRef<HTMLElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [locateTick, setLocateTick] = useState(0)

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        if (!needle) return true
        return `${entry.title} ${entry.subtitle ?? ''}`.toLowerCase().includes(needle) ||
          String(entry.label) === needle
      })
  }, [entries, query])
  const groups = useMemo(() => groupRows(rows), [rows])
  const groupCount = new Set(entries.map(entry => entry.group).filter(Boolean)).size

  // 翻到新章节时自动展开它所在的主题；用户手动折起其他组不受影响。
  const activeGroup = activeEntry?.group
  useEffect(() => {
    if (!activeGroup) return
    setCollapsed(current => {
      if (!current.has(activeGroup)) return current
      const next = new Set(current)
      next.delete(activeGroup)
      return next
    })
  }, [activeGroup])

  // 目录打开、翻页、搜索或展开/折叠后，把当前章节保持可见；只滚动目录自身。
  useEffect(() => {
    const body = bodyRef.current, entry = activeRef.current
    if (!body || !entry) return
    const bounds = body.getBoundingClientRect(), row = entry.getBoundingClientRect()
    if (row.top < bounds.top + 8) body.scrollTop += row.top - bounds.top - 8
    else if (row.bottom > bounds.bottom - 8) body.scrollTop += row.bottom - bounds.bottom + 8
  }, [active, entries, query, collapsed, locateTick])

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.page-video-backdrop, .reading-dialog-backdrop')) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [onClose])

  function toggleGroup(title: string) {
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  function locateCurrent() {
    if (!activeEntry) return
    setQuery('')
    if (activeGroup) {
      setCollapsed(current => {
        if (!current.has(activeGroup)) return current
        const next = new Set(current)
        next.delete(activeGroup)
        return next
      })
    }
    setLocateTick(value => value + 1)
  }

  return <aside className="book-toc" id="reading-book-toc" aria-label="书籍目录">
    <header className="book-toc-head">
      <div className="book-toc-head-copy">
        <span className="book-toc-kicker">目录</span>
        <h2>{bookTitle}</h2>
        <small>{groupCount ? `${groupCount} 个主题 · ${entries.length} 个章节` : `${entries.length} 个章节`} · 书上页码</small>
      </div>
      <button type="button" aria-label="关闭书籍目录" title="关闭目录" onClick={onClose}><X size={17}/></button>
    </header>
    {activeEntry && <button type="button" className="book-toc-current" onClick={locateCurrent} title="定位到当前章节">
      <LocateFixed size={13}/>
      <span>当前</span>
      <strong>{activeEntry.title}</strong>
      <small>{activeEntry.label} 页</small>
    </button>}
    <div className="book-toc-search">
      <Search size={14} aria-hidden="true"/>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索章节或页码" aria-label="搜索目录"/>
      {query && <button type="button" aria-label="清除目录搜索" onClick={() => setQuery('')}><X size={13}/></button>}
    </div>
    <nav ref={bodyRef} className="book-toc-body" aria-label="选择章节">
      {query && <p className="book-toc-result" role="status">找到 {rows.length} 个章节</p>}
      {!rows.length && <div className="book-toc-empty">
        <Search size={18}/>
        <strong>没有找到章节</strong>
        <small>可以搜索英文主题、章节名或书上页码。</small>
      </div>}
      {groups.map(group => {
        const key = group.title ?? '__ungrouped'
        const isCollapsed = Boolean(group.title && collapsed.has(group.title) && !query.trim())
        return <section className="book-toc-group" key={key}>
          {group.title && <button
            type="button"
            className="book-toc-group-head"
            aria-expanded={!isCollapsed}
            onClick={() => toggleGroup(group.title!)}
          >
            {isCollapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
            <strong>{group.title}</strong>
            <small>{group.rows.length}</small>
          </button>}
          {!isCollapsed && group.rows.map(({ entry, index }) => {
            const current = index === active
            return <button
              key={`${entry.page}:${entry.level}:${entry.title}:${index}`}
              ref={current ? activeRef : undefined}
              type="button"
              className={`book-toc-entry level-${entry.level}${current ? ' is-current' : ''}`}
              aria-current={current ? 'page' : undefined}
              aria-level={entry.level}
              aria-label={`第 ${entry.label} 页，${entry.title}${entry.subtitle ? `，${entry.subtitle}` : ''}`}
              title={entry.subtitle ? `${entry.title} · ${entry.subtitle}` : entry.title}
              onClick={() => onSelect(entry.page)}
            >
              <span className="book-toc-page" aria-hidden="true">{entry.label}</span>
              <span className="book-toc-copy">
                <strong>{entry.title}</strong>
                {entry.subtitle && <small>{entry.subtitle}</small>}
              </span>
            </button>
          })}
        </section>
      })}
    </nav>
  </aside>
}
