import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BarChart3, Bookmark, BookmarkCheck, BookOpen, Check, CloudDownload, Headphones, List, LogOut, MoreHorizontal, ShieldCheck, UserRound } from 'lucide-react'
import type { ProfileId } from './learningCore'

type Props = {
  title: string
  section?: string
  pageLabel: number
  pageCount: number
  tocAvailable: boolean
  tocOpen: boolean
  onToc: () => void
  panelAvailable: boolean
  panelOpen: boolean
  onPanel: () => void
  dictationAvailable: boolean
  onDictation: () => void
  teacherMode: boolean
  onTeacherMode: () => void
  onBack: () => void
  profile: ProfileId
  profiles: Record<ProfileId, { name: string }>
  onProfile: (profile: ProfileId) => void
  bookmarked: boolean
  onToggleBookmark: () => void
  onBookmarks: () => void
  onStats: () => void
  onOffline: () => void
}

// 顶部导航只保留高频动作：返回、书名/当前章节、页码、目录、学习。
// 纯读、全屏、缩放属于阅读设置，放进书页上的“视图”菜单；
// 书签、统计、离线、双用户、教师管理这些低频动作收进“更多”。
export default function ReaderTopBar({ title, section, pageLabel, pageCount, tocAvailable, tocOpen, onToc, panelAvailable, panelOpen, onPanel, dictationAvailable, onDictation, teacherMode, onTeacherMode, onBack, profile, profiles, onProfile, bookmarked, onToggleBookmark, onBookmarks, onStats, onOffline }: Props) {
  const [more, setMore] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!more) return
    const close = (event: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMore(false)
    }
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') setMore(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', keyboard)
    }
  }, [more])
  function action(callback: () => void) {
    setMore(false)
    callback()
  }
  return <header className="reader-topbar">
    <button className="reader-topbar-back" aria-label="返回书架" title="返回书架" onClick={onBack}>
      <ArrowLeft size={19}/><span>书架</span>
    </button>
    <div className="reader-topbar-title">
      <strong title={title}>{title}</strong>
      {section && <small title={section}>{section}</small>}
    </div>
    <span className="reader-topbar-page" aria-label={`书页 ${pageLabel}，共 ${pageCount} 页`}>
      <b>{pageLabel}</b><i>/</i><span>{pageCount}</span>
    </span>
    <nav className="reader-topbar-tools" aria-label="阅读工具">
      {tocAvailable && <button className={tocOpen ? 'is-active' : ''} aria-label="书籍目录" aria-expanded={tocOpen} aria-controls="reading-book-toc" title="书籍目录" onClick={onToc}><List size={18}/><span>目录</span></button>}
      {panelAvailable && <button className={panelOpen ? 'is-active' : ''} aria-label="本页学习" aria-expanded={panelOpen} aria-controls="reading-learning-panel" title="本页学习" onClick={onPanel}><BookOpen size={18}/><span>学习</span></button>}
      {dictationAvailable && <button aria-label="听写练习" title="听写练习" onClick={onDictation}><Headphones size={18}/><span>听写</span></button>}
      <div className="reader-more" ref={moreRef}>
        <button className={more || teacherMode ? 'is-active' : ''} aria-label={teacherMode ? '更多学习工具，管理模式已开启' : '更多学习工具'} aria-haspopup="menu" aria-expanded={more} title="更多" onClick={() => setMore(value => !value)}>
          <span className="reader-more-icon"><MoreHorizontal size={18}/><b>{profile.toUpperCase()}</b></span><span>更多</span>
        </button>
        {more && <div className="reader-more-menu" role="menu" aria-label="更多学习工具">
          <div className="reader-more-profile">
            <span><UserRound size={14}/>当前用户</span>
            <div>
              {(['a', 'b'] as ProfileId[]).map(id => <button key={id} role="menuitemradio" aria-checked={profile === id} className={profile === id ? 'is-active' : ''} onClick={() => action(() => onProfile(id))}>
                <b>{id.toUpperCase()}</b><small>{profiles[id].name}</small>{profile === id && <Check size={14}/>}
              </button>)}
            </div>
          </div>
          <button role="menuitem" onClick={() => action(onToggleBookmark)}>{bookmarked ? <BookmarkCheck size={16}/> : <Bookmark size={16}/>}<span>{bookmarked ? '取消收藏本页' : '收藏本页'}</span></button>
          <button role="menuitem" onClick={() => action(onBookmarks)}><Bookmark size={16}/><span>书签列表</span></button>
          <button role="menuitem" onClick={() => action(onStats)}><BarChart3 size={16}/><span>学习统计</span></button>
          <button role="menuitem" onClick={() => action(onOffline)}><CloudDownload size={16}/><span>离线保存</span></button>
          <span className="reader-more-separator" role="separator"/>
          <button role="menuitem" className={teacherMode ? 'is-admin is-active' : 'is-admin'} onClick={() => action(onTeacherMode)}>
            {teacherMode ? <LogOut size={16}/> : <ShieldCheck size={16}/>}
            <span>{teacherMode ? '退出管理模式' : '教师管理'}</span>
          </button>
        </div>}
      </div>
    </nav>
  </header>
}
