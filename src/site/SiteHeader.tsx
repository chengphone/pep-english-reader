import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, BookOpen, Check, ClipboardCheck, Home, Images, Search, UserRound, X } from 'lucide-react'
import './SiteHeader.css'
import { setActiveProfile, useLearningState } from '../reader/learningStore'
import type { ProfileId } from '../reader/learningCore'
import type { OnlineBook } from '../reader/types'
import type { PictureCatalogEntry } from '../pictureBooks'
import { BookCover, grades, onlineLabel, termLabel } from './BookCover'

export type SiteSection = 'home' | 'textbooks' | 'library' | 'practice'
export type SearchTextbook = {
  key: string
  kind: 'remote' | 'online'
  id: string
  title: string
  subtitle: string
  cover?: string
  online?: OnlineBook
  keywords?: string
}

const NAV: { key: SiteSection; label: string; icon: ReactNode }[] = [
  { key: 'home', label: '首页', icon: <Home size={18}/> },
  { key: 'textbooks', label: '课本', icon: <BookOpen size={18}/> },
  { key: 'library', label: '绘本馆', icon: <Images size={18}/> },
  { key: 'practice', label: '练习', icon: <ClipboardCheck size={18}/> },
]

function matches(needle: string, values: (string | undefined)[]) {
  return values.filter(Boolean).join(' ').toLowerCase().includes(needle)
}

export default function SiteHeader({
  current,
  onNavigate,
  textbooks,
  pictures,
  onOpenTextbook,
  onOpenPicture,
}: {
  current: SiteSection
  onNavigate: (section: SiteSection) => void
  textbooks: SearchTextbook[]
  pictures: PictureCatalogEntry[]
  onOpenTextbook: (item: SearchTextbook) => void
  onOpenPicture: (entry: PictureCatalogEntry) => void
}) {
  const learning = useLearningState()
  const profile = learning.active
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const needle = query.trim().toLowerCase()

  const textbookResults = useMemo(() => {
    if (!needle) return []
    return textbooks.filter(item => matches(needle, [item.title, item.subtitle, item.keywords])).slice(0, 6)
  }, [needle, textbooks])
  const pictureResults = useMemo(() => {
    if (!needle) return []
    return pictures.filter(item => matches(needle, [item.title, item.series, item.levelLabel, ...(item.themes ?? []), item.episode ? `第${item.episode}集` : ''])).slice(0, 8)
  }, [needle, pictures])

  useEffect(() => {
    if (!searchOpen && !profileOpen) return
    const pointer = (event: PointerEvent) => {
      if (profileOpen && profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false)
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSearchOpen(false)
      setProfileOpen(false)
      setQuery('')
    }
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', keyboard)
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', keyboard) }
  }, [searchOpen, profileOpen])

  useEffect(() => {
    if (searchOpen) window.requestAnimationFrame(() => searchInput.current?.focus())
  }, [searchOpen])

  function openSearch() {
    setSearchOpen(value => !value)
    setProfileOpen(false)
    if (searchOpen) setQuery('')
  }
  function chooseTextbook(item: SearchTextbook) {
    setSearchOpen(false); setQuery('')
    onOpenTextbook(item)
  }
  function choosePicture(entry: PictureCatalogEntry) {
    setSearchOpen(false); setQuery('')
    onOpenPicture(entry)
  }
  function go(section: SiteSection) {
    setSearchOpen(false); setQuery(''); setProfileOpen(false)
    onNavigate(section)
  }

  return <>
    <header className="site-header">
      <div className="site-header-inner">
        <button type="button" className="site-brand" aria-label="返回首页" onClick={() => go('home')}>
          <span className="site-brand-mark" aria-hidden="true"><BookOpen size={19}/></span>
          <span className="site-brand-text"><strong>英语阅读</strong><span>原版教材 · 绘本 · 点读跟读</span></span>
        </button>
        <nav className="site-nav" aria-label="主导航">
          {NAV.map(item => <button key={item.key} type="button" className={`site-nav-link${current === item.key ? ' is-active' : ''}`} aria-current={current === item.key ? 'page' : undefined} onClick={() => go(item.key)}>{item.label}</button>)}
        </nav>
        <div className="site-header-actions">
          <button type="button" className={`site-icon-button${searchOpen ? ' is-active' : ''}`} aria-label={searchOpen ? '关闭搜索' : '搜索教材和绘本'} aria-expanded={searchOpen} aria-controls="site-search-panel" title="搜索" onClick={openSearch}>
            {searchOpen ? <X size={19}/> : <Search size={19}/>}
          </button>
          <div className="site-profile-wrap" ref={profileRef}>
            <button type="button" className={`site-icon-button site-profile-button${profileOpen ? ' is-active' : ''}`} aria-label={`学习档案：${profile.toUpperCase()}`} aria-haspopup="menu" aria-expanded={profileOpen} title="学习档案" onClick={() => { setProfileOpen(value => !value); setSearchOpen(false) }}>
              <UserRound size={19}/><b>{profile.toUpperCase()}</b>
            </button>
            {profileOpen && <div className="site-profile-menu" role="menu" aria-label="切换学习档案">
              <span className="site-profile-kicker">学习档案</span>
              {(['a', 'b'] as ProfileId[]).map(id => <button key={id} role="menuitemradio" aria-checked={profile === id} className={profile === id ? 'is-active' : ''} onClick={() => { setActiveProfile(id); setProfileOpen(false) }}>
                <b>{id.toUpperCase()}</b>
                <span>{learning.profiles[id].name}</span>
                {profile === id && <Check size={14}/>}
              </button>)}
              <small>切换后，继续学习、书签和练习记录会一起切换。</small>
            </div>}
          </div>
        </div>
      </div>
      {searchOpen && <section className="site-search-panel" id="site-search-panel" aria-label="搜索教材和绘本">
        <div className="site-search-input">
          <Search size={18} aria-hidden="true"/>
          <input ref={searchInput} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索课本、绘本、系列或主题" aria-label="搜索课本、绘本、系列或主题"/>
          <button type="button" aria-label="关闭搜索" onClick={() => { setSearchOpen(false); setQuery('') }}><X size={16}/></button>
        </div>
        {!needle && <p className="site-search-hint">可以搜索“三年级”“Oxford”“Monkey”“冒险”等关键词。</p>}
        {needle && !textbookResults.length && !pictureResults.length && <div className="site-search-empty"><Search size={19}/><strong>没有找到内容</strong><span>换一个书名、系列或主题试试。</span></div>}
        {textbookResults.length > 0 && <div className="site-search-group">
          <p>课本</p>
          {textbookResults.map(item => <button key={item.key} type="button" className="site-search-result" aria-label={`打开 ${item.title}`} onClick={() => chooseTextbook(item)}>
            <span className="site-search-cover">
              {item.kind === 'online' && item.online ? <BookCover book={item.online}/> : item.cover ? <img src={item.cover} alt="" loading="lazy"/> : <BookOpen size={18}/>}
            </span>
            <span className="site-search-copy"><strong>{item.title}</strong><small>{item.subtitle}</small></span>
            <ArrowRight size={16}/>
          </button>)}
        </div>}
        {pictureResults.length > 0 && <div className="site-search-group">
          <p>绘本</p>
          {pictureResults.map(entry => <button key={entry.id} type="button" className="site-search-result" aria-label={`打开绘本 ${entry.title}`} onClick={() => choosePicture(entry)}>
            <span className="site-search-cover is-picture"><img src={entry.cover} alt="" loading="lazy"/></span>
            <span className="site-search-copy"><strong>{entry.title}</strong><small>{entry.series}{entry.episode ? ` · 第 ${entry.episode} 集` : ''} · {entry.levelLabel}</small></span>
            <ArrowRight size={16}/>
          </button>)}
        </div>}
      </section>}
    </header>
    <nav className="site-tabbar" aria-label="移动端主导航">
      {NAV.map(item => <button key={item.key} type="button" className={`site-tab${current === item.key ? ' is-active' : ''}`} aria-current={current === item.key ? 'page' : undefined} onClick={() => go(item.key)}>
        {item.icon}<span>{item.label}</span>
      </button>)}
    </nav>
  </>
}

export function textbookSearchEntries(remote: { id: string; title: string; series?: string; publisher?: string; cover?: string }[], online: OnlineBook[]): SearchTextbook[] {
  return [
    ...remote.map(book => ({ key: `remote:${book.id}`, kind: 'remote' as const, id: book.id, title: book.title, subtitle: [book.series, book.publisher].filter(Boolean).join(' · ') || '在线教材', cover: book.cover, keywords: `${book.title} ${book.series ?? ''} ${book.publisher ?? ''} Oxford 牛津` })),
    ...online.map(book => ({ key: `online:${book.id}`, kind: 'online' as const, id: book.id, title: onlineLabel(book), subtitle: `人教 PEP · ${grades[book.grade]}${termLabel(book.term)}`, online: book, keywords: `${grades[book.grade]} ${termLabel(book.term)} 人教 PEP 在线` })),
  ]
}
