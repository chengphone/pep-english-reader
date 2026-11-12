import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, BookOpen, ChevronDown, Filter, Play, Search, Sparkles, X } from 'lucide-react'
import type { PictureCatalogEntry, PictureLevel } from '../pictureBooks'
import { latestPictureProgress, pictureArt, pictureProgressPosition, readPictureProgress } from '../pictureBooks'
import { arcForEpisode, groupPictureEntries } from '../pictureArcs'
import { useLearningState } from '../reader/learningStore'
import './SitePages.css'

const LEVEL_TABS: { value: PictureLevel | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'starter', label: '启蒙' },
  { value: 'beginner', label: '入门' },
  { value: 'elementary', label: '初级' },
  { value: 'intermediate', label: '进阶' },
]

export default function PictureLibrary({
  entries,
  ready,
  onOpenPicture,
  onOpenTextbooks,
}: {
  entries: PictureCatalogEntry[]
  ready: boolean
  onOpenPicture: (id: string, page?: number) => void
  onOpenTextbooks: () => void
}) {
  const learning = useLearningState()
  const profile = learning.active
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<PictureLevel | 'all'>('all')
  const [theme, setTheme] = useState('全部')
  const [openArcs, setOpenArcs] = useState<Set<string>>(new Set())
  const initializedArcs = useRef(false)
  const needle = query.trim().toLowerCase()
  const themes = useMemo(() => ['全部', ...new Set(entries.flatMap(entry => entry.themes ?? []))], [entries])
  const levelTabs = useMemo(() => {
    const labels = new Map<PictureLevel, string>()
    for (const entry of entries) labels.set(entry.level, entry.levelLabel)
    return LEVEL_TABS.filter(tab => tab.value === 'all' || labels.has(tab.value)).map(tab => tab.value === 'all' ? tab : { ...tab, label: labels.get(tab.value) ?? tab.label })
  }, [entries])
  const latest = latestPictureProgress(profile)
  const continueEntry = latest ? entries.find(entry => entry.id === latest.bookId) : undefined
  const continueProgress = continueEntry ? readPictureProgress(continueEntry.id, profile) : undefined
  const filtered = useMemo(() => entries.filter(entry => {
    if (level !== 'all' && entry.level !== level) return false
    if (theme !== '全部' && !(entry.themes ?? []).includes(theme)) return false
    if (needle) {
      const arc = arcForEpisode(entry.episode)
      const haystack = `${entry.title} ${entry.series} ${entry.levelLabel} ${(entry.themes ?? []).join(' ')} 第${entry.episode ?? ''}集 ${arc?.volume ?? ''} ${arc?.title ?? ''} ${arc?.description ?? ''}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  }), [entries, level, theme, needle])
  const groups = useMemo(() => groupPictureEntries(filtered), [filtered])
  const totalArcs = useMemo(() => groupPictureEntries(entries).length, [entries])
  const hasFilter = Boolean(needle) || level !== 'all' || theme !== '全部'
  const first = entries[0]
  const continuePage = continueProgress ? continueProgress.pageIndex : 0

  // 首次载入目录时展开最近读过的篇章；没有进度时从第一卷开始。
  useEffect(() => {
    if (initializedArcs.current || !entries.length) return
    initializedArcs.current = true
    const preferred = (continueEntry && arcForEpisode(continueEntry.episode)?.id) || groupPictureEntries(entries)[0]?.arc.id
    if (preferred) setOpenArcs(new Set([preferred]))
  }, [entries, continueEntry])

  // 筛选时自动展开命中的篇章；展开状态仍可手动切换。
  useEffect(() => {
    if (!hasFilter) return
    setOpenArcs(current => {
      const next = new Set(current)
      let changed = false
      for (const group of groups) {
        if (!next.has(group.arc.id)) {
          next.add(group.arc.id)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [hasFilter, groups])

  function clearFilters() {
    setQuery('')
    setLevel('all')
    setTheme('全部')
  }

  function toggleArc(id: string) {
    setOpenArcs(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAllArcs() {
    setOpenArcs(new Set(groups.map(group => group.arc.id)))
  }

  function collapseAllArcs() {
    setOpenArcs(new Set())
  }

  return <div className="site-page library-page">
    <section className="page-hero library-hero">
      <div className="library-hero-copy">
        <span className="page-kicker">PICTURE BOOK LIBRARY</span>
        <h1>绘本馆</h1>
        <p>原版跨页插画、整集原声和逐句阅读。难度和主题按整套作品分级{first ? `：${first.levelLabel} · ${(first.themes ?? []).join(' / ')}` : ''}。</p>
        <div className="page-hero-actions">
          {first && <button type="button" className="page-hero-action" onClick={() => onOpenPicture(first.id, 0)}><Play size={15}/>从第 1 集开始</button>}
          <button type="button" className="page-hero-ghost" onClick={onOpenTextbooks}><BookOpen size={15}/>去课本中心</button>
        </div>
      </div>
      <div className="library-hero-art" aria-hidden="true">
        {first ? <img src={pictureArt(first)} alt=""/> : <Sparkles size={48}/>}
        <span className="library-hero-count"><strong>{entries.length}</strong> 本绘本 · <strong>{totalArcs}</strong> 个篇章</span>
      </div>
    </section>

    {!ready && <div className="series-empty">正在读取绘本目录…</div>}

    {ready && !entries.length && <div className="page-empty library-empty">
      <BookOpen size={26}/>
      <strong>本机还没有接入绘本资源</strong>
      <span>把 Journey to the West 的 PDF、MP3 和生词 PDF 整理到仓库外，再用本地服务器打开即可。</span>
      <code>npm run book:prepare-picture &amp;&amp; npm run book:serve</code>
      <button type="button" className="page-empty-action" onClick={onOpenTextbooks}>先去课本中心</button>
    </div>}

    {continueEntry && <section className="library-continue" aria-labelledby="library-continue-title">
      <div className="library-continue-cover" aria-hidden="true"><img src={pictureArt(continueEntry)} alt=""/></div>
      <div className="library-continue-copy">
        <span className="page-kicker">CONTINUE STORY</span>
        <h2 id="library-continue-title">{continueEntry.title}</h2>
        <p>{continueEntry.series} · 第 {continueEntry.episode} 集 · 上次读到第 {continuePage + 1} 个跨页</p>
        <div className="library-progress"><span><i style={{ width: `${pictureProgressPosition(continueProgress, continueEntry.pages ?? 1)}%` }}/></span><small>{continueProgress?.mode === 'practice' ? '跟读模式' : continueProgress?.mode === 'self' ? '自己读' : '听故事'}</small></div>
      </div>
      <div className="library-continue-actions">
        <button type="button" className="page-hero-action" onClick={() => onOpenPicture(continueEntry.id)}>继续读<ArrowRight size={15}/></button>
        <button type="button" className="page-hero-ghost" onClick={() => onOpenPicture(continueEntry.id, 0)}>从头开始</button>
      </div>
    </section>}

    {entries.length > 0 && <section className="library-browser" aria-labelledby="library-browser-title">
      <header className="library-browser-head">
        <div><span className="page-kicker">ALL STORIES</span><h2 id="library-browser-title">按篇章挑选绘本</h2></div>
        <p>{filtered.length} 本符合条件 · {groups.length} 个篇章</p>
      </header>
      <div className="page-toolbar library-toolbar">
        <label className="page-search">
          <Search size={18} aria-hidden="true"/>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索绘本、篇章、主题或集数" aria-label="搜索绘本、篇章、主题或集数"/>
          {query && <button type="button" aria-label="清空绘本搜索" onClick={() => setQuery('')}><X size={15}/></button>}
        </label>
      </div>
      <div className="library-filters">
        <div className="library-filter-group" role="group" aria-label="按难度筛选">
          <span>难度</span>
          {levelTabs.map(tab => <button key={tab.value} type="button" className={level === tab.value ? 'is-active' : ''} aria-pressed={level === tab.value} onClick={() => setLevel(tab.value)}>{tab.label}</button>)}
        </div>
        <div className="library-filter-group" role="group" aria-label="按主题筛选">
          <span>主题</span>
          {themes.map(value => <button key={value} type="button" className={theme === value ? 'is-active' : ''} aria-pressed={theme === value} onClick={() => setTheme(value)}>{value}</button>)}
        </div>
      </div>
      <p className="library-classification-note">难度和主题按整套作品分级，不按单集或篇章拆分。</p>

      {!filtered.length && <div className="page-empty">
        <Filter size={22}/>
        <strong>没有符合条件的绘本</strong>
        <span>搜索、篇章、难度和主题可以叠加筛选；清空后重新选择。</span>
        <button type="button" className="page-empty-action" onClick={clearFilters}>清空筛选</button>
      </div>}

      {groups.length > 0 && <div className="library-arc-tools">
        <span>{hasFilter ? `匹配 ${groups.length} 个篇章` : `按篇章浏览 · 共 ${groups.length} 个篇章`}</span>
        {!hasFilter && <div>
          <button type="button" onClick={expandAllArcs}>全部展开</button>
          <button type="button" onClick={collapseAllArcs}>全部收起</button>
        </div>}
      </div>}

      {groups.length > 0 && <div className="picture-arc-list">
        {groups.map(({ arc, entries: arcEntries }) => {
          const open = openArcs.has(arc.id)
          const readCount = arcEntries.filter(entry => readPictureProgress(entry.id, profile)).length
          return <section key={arc.id} className={`picture-arc${open ? ' is-open' : ''}`} aria-labelledby={`picture-arc-title-${arc.id}`}>
            <button type="button" className="picture-arc-head" aria-expanded={open} onClick={() => toggleArc(arc.id)}>
              <span className="picture-arc-volume">{arc.volume}</span>
              <span className="picture-arc-copy">
                <strong id={`picture-arc-title-${arc.id}`}>{arc.title}</strong>
                <small>{arc.from > 0 ? `第 ${arc.from}–${arc.to} 集 · ` : ''}{arcEntries.length} 本{readCount ? ` · 读过 ${readCount} 本` : ''}</small>
              </span>
              <ChevronDown size={18} className="picture-arc-chevron"/>
            </button>
            {open && <div className="picture-arc-body">
              <p className="picture-arc-desc">{arc.description}</p>
              <div className="picture-card-grid picture-arc-grid">
                {arcEntries.map(entry => {
                  const progress = readPictureProgress(entry.id, profile)
                  return <button key={entry.id} type="button" className="picture-card" aria-label={`打开绘本 ${entry.title}`} onClick={() => onOpenPicture(entry.id)}>
                    <span className="picture-card-art">
                      <img src={pictureArt(entry)} alt="" loading="lazy"/>
                      <span className="picture-card-episode">第 {entry.episode} 集</span>
                      {progress && <span className="picture-card-progress"><i style={{ width: `${pictureProgressPosition(progress, entry.pages ?? 1)}%` }}/></span>}
                    </span>
                    <span className="picture-card-copy">
                      <strong>{entry.title}</strong>
                      <small>{entry.levelLabel} · {entry.minutes ? `${entry.minutes} 分钟` : `${entry.pages ?? 0} 个跨页`} · {(entry.themes ?? []).slice(0, 2).join(' / ')}</small>
                    </span>
                  </button>
                })}
              </div>
            </div>}
          </section>
        })}
      </div>}
      {hasFilter && <p className="library-filter-note">当前筛选：{needle ? `“${query.trim()}”` : '无关键词'} · {level === 'all' ? '全部难度' : levelTabs.find(tab => tab.value === level)?.label} · {theme}</p>}
    </section>}
  </div>
}
