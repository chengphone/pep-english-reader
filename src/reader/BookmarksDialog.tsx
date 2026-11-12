import { useEffect } from 'react'
import { Bookmark, BookmarkPlus, Trash2, X } from 'lucide-react'
import { bookmarksFor, removeBookmark, toggleBookmark, useLearningState } from './learningStore'

type Props = {
  bookId: string
  page: number
  label: string
  section?: string
  onGoPage: (page: number) => void
  onClose: () => void
}

function time(stamp: number) {
  return new Date(stamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function BookmarksDialog({ bookId, page, label, section, onGoPage, onClose }: Props) {
  useLearningState()
  const bookmarks = bookmarksFor(bookId)
  const current = bookmarks.find(row => row.page === page)

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [onClose])

  return <div className="learning-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="learning-bookmarks-dialog" role="dialog" aria-modal="true" aria-labelledby="learning-bookmarks-title">
      <header className="learning-dialog-head">
        <div>
          <span className="page-resources-kicker">书签</span>
          <h2 id="learning-bookmarks-title">第 {label} 页{section ? ` · ${section}` : ''}</h2>
        </div>
        <button aria-label="关闭书签" title="关闭" onClick={onClose}><X size={19}/></button>
      </header>
      <button className={`bookmark-current${current ? ' is-active' : ''}`} onClick={() => toggleBookmark(bookId, page, label)}>
        {current ? <Bookmark size={18}/> : <BookmarkPlus size={18}/>}
        <span>{current ? '取消收藏本页' : '收藏本页'}</span>
      </button>
      <div className="bookmark-list">
        {!bookmarks.length && <div className="bookmark-empty"><Bookmark size={24}/><strong>还没有书签</strong><p>收藏当前页，下次可以从这里直接跳回。</p></div>}
        {bookmarks.map(row => <div key={row.id} className={`bookmark-row${row.page === page ? ' is-current' : ''}`}>
          <button className="bookmark-jump" onClick={() => { onGoPage(row.page); onClose() }}>
            <span className="bookmark-page">第 {row.label} 页</span>
            <small>收藏于 {time(row.createdAt)}</small>
          </button>
          <button className="bookmark-remove" aria-label={`删除第 ${row.label} 页书签`} title="删除书签" onClick={() => removeBookmark(row.id)}><Trash2 size={15}/></button>
        </div>)}
      </div>
    </section>
  </div>
}
