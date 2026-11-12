import { ArrowRight, Check, Headphones, RotateCcw, Sparkles, Volume2 } from 'lucide-react'
import { dueForBook, recordWordResult, summaryForBook, useLearningState, weakForBook } from './learningStore'
import type { ReaderItem } from './types'

type Props = {
  bookId: string
  pool: ReaderItem[]
  labelForPage: (page: number) => string
  onPlay: (item: ReaderItem) => void
  onGoPage: (page: number) => void
  nextPage?: { page: number; label: string; count: number }
}

// P2 智能复习：按 SM-2 排期取出到期词，答对拉长间隔，答错回到一天后。
// 同时给出薄弱词和下一处未学词页，作为轻量学习建议。
export default function ReviewPanel({ bookId, pool, labelForPage, onPlay, onGoPage, nextPage }: Props) {
  useLearningState()
  const due = dueForBook(bookId)
  const weak = weakForBook(bookId)
  const summary = summaryForBook(bookId)
  const byId = new Map(pool.map(item => [item.id, item]))

  function mark(record: (typeof due)[number], correct: boolean) {
    const item = byId.get(record.itemId) ?? {
      id: record.itemId,
      text: record.text,
      translation: record.translation,
      order: 0,
      rects: [],
    }
    recordWordResult({ bookId, page: record.page, item, kind: 'review', correct })
  }

  if (!summary.totalWords) {
    return <div className="review-panel">
      <div className="review-hero">
        <Sparkles size={24}/>
        <div><strong>还没有复习记录</strong><p>先在书页或单词列表里点读几个词，系统会自动安排复习。</p></div>
      </div>
      {nextPage && <button className="review-next-page" onClick={() => onGoPage(nextPage.page)}>
        <span><small>下一步</small><strong>第 {nextPage.label} 页 · {nextPage.count} 个新词</strong></span>
        <ArrowRight size={18}/>
      </button>}
    </div>
  }

  return <div className="review-panel">
    <div className="review-hero">
      <div className="review-hero-score">{due.length}<small>本书待复习</small></div>
      <div className="review-hero-copy">
        <strong>{due.length ? '今天还有这些词' : '今天的复习完成了'}</strong>
        <p>本书已掌握 {summary.masteredWords} / {summary.totalWords} 个词 · 正确率 {summary.accuracy}%</p>
      </div>
    </div>
    {due.length > 0 ? <div className="review-list">
      {due.slice(0, 12).map(record => {
        const item = byId.get(record.itemId)
        return <div className="review-row" key={`${record.bookId}:${record.itemId}`}>
          <button className="review-play" aria-label={`播放 ${record.text}`} disabled={!item} onClick={() => item && onPlay(item)}><Volume2 size={16}/></button>
          <div className="review-copy">
            <strong>{record.text}</strong>
            <small>{record.translation || '暂无释义'} · 第 {labelForPage(record.page)} 页 · {Math.round((record.correct / Math.max(1, record.reps)) * 100)}% 正确</small>
          </div>
          <div className="review-actions">
            <button className="review-known" aria-label={`认识 ${record.text}`} title="认识" onClick={() => mark(record, true)}><Check size={15}/></button>
            <button className="review-again" aria-label={`再练 ${record.text}`} title="还不熟" onClick={() => mark(record, false)}><RotateCcw size={15}/></button>
          </div>
        </div>
      })}
    </div> : <div className="review-done"><Check size={20}/><span>没有到期词，去下一处新词页继续学习。</span></div>}
    {nextPage && <button className="review-next-page" onClick={() => onGoPage(nextPage.page)}>
      <span><small>推荐下一步</small><strong>第 {nextPage.label} 页 · {nextPage.count} 个新词</strong></span>
      <ArrowRight size={18}/>
    </button>}
    {weak.length > 0 && <section className="review-weak">
      <h3><Headphones size={15}/>需要多听几遍</h3>
      {weak.slice(0, 5).map(record => <div key={record.itemId}>
        <span>{record.text}</span>
        <small>{record.wrong} 次答错</small>
        {byId.get(record.itemId) && <button aria-label={`播放 ${record.text}`} onClick={() => onPlay(byId.get(record.itemId)!)}><Volume2 size={14}/></button>}
      </div>)}
    </section>}
  </div>
}
