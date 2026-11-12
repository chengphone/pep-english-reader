import { useEffect } from 'react'
import { BarChart3, CalendarDays, CheckCircle2, Flame, Target, Volume2, X, XCircle } from 'lucide-react'
import { eventsFor, summaryFor, useLearningState, weakForBook } from './learningStore'
import type { ReaderItem } from './types'

type Props = {
  bookId: string
  bookTitle: string
  pageLabel: number
  pageCount: number
  pool: ReaderItem[]
  onPlay: (item: ReaderItem) => void
  onClose: () => void
}

const WEEK_LABEL = ['日', '一', '二', '三', '四', '五', '六']

function duration(seconds: number) {
  if (!seconds) return '0 分钟'
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
}

// P2 学情分析：全部数据来自本机学习库，不接入远端统计服务。
export default function StatsDialog({ bookId, bookTitle, pageLabel, pageCount, pool, onPlay, onClose }: Props) {
  useLearningState()
  const summary = summaryFor()
  const events = eventsFor().filter(event => event.bookId === bookId).slice(0, 10)
  const weak = weakForBook(bookId).slice(0, 5)
  const byId = new Map(pool.map(item => [item.id, item]))
  const maxSeconds = Math.max(60, ...summary.week.map(row => row.seconds))
  const progress = pageCount ? Math.min(100, Math.round((pageLabel / pageCount) * 100)) : 0

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [onClose])

  return <div className="learning-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="learning-stats-dialog" role="dialog" aria-modal="true" aria-labelledby="learning-stats-title">
      <header className="learning-dialog-head">
        <div>
          <span className="page-resources-kicker">学习统计 · 本机数据</span>
          <h2 id="learning-stats-title">{bookTitle}</h2>
        </div>
        <button aria-label="关闭学习统计" title="关闭" onClick={onClose}><X size={19}/></button>
      </header>
      <div className="learning-stats-scroll">
        <div className="learning-stat-grid">
          <article><CalendarDays size={18}/><strong>{duration(summary.totalSeconds)}</strong><span>累计学习</span></article>
          <article><Flame size={18}/><strong>{summary.streak}<small> 天</small></strong><span>连续学习</span></article>
          <article><Target size={18}/><strong>{summary.masteredWords}<small> / {summary.totalWords}</small></strong><span>已掌握词</span></article>
          <article><CheckCircle2 size={18}/><strong>{summary.accuracy}<small>%</small></strong><span>练习正确率</span></article>
        </div>
        <section className="learning-stat-chart">
          <header><h3>最近 7 天</h3><small>今天 {duration(summary.todaySeconds)}</small></header>
          <div className="learning-bars" aria-label="最近 7 天学习时长">
            {summary.week.map(row => {
              const date = new Date(row.day + 'T00:00:00')
              const height = Math.max(3, Math.round((row.seconds / maxSeconds) * 100))
              return <div key={row.day} className="learning-bar">
                <span style={{ height: `${height}%` }} title={`${Math.round(row.seconds / 60)} 分钟`}/>
                <small>{WEEK_LABEL[date.getDay()]}</small>
              </div>
            })}
          </div>
        </section>
        <section className="learning-stat-progress">
          <header><h3>本书进度</h3><small>{pageLabel} / {pageCount} 页 · {progress}%</small></header>
          <div className="learning-progress-track"><i style={{ width: `${progress}%` }}/></div>
        </section>
        {weak.length > 0 && <section className="learning-stat-weak">
          <header><h3>需要加强</h3><small>按练习正确率排序</small></header>
          {weak.map(row => <div key={row.itemId} className="learning-weak-row">
            <span>{row.text}</span>
            <small>{row.correct} 对 · {row.wrong} 错</small>
            {byId.get(row.itemId) && <button aria-label={`播放 ${row.text}`} onClick={() => onPlay(byId.get(row.itemId)!)}><Volume2 size={14}/></button>}
          </div>)}
        </section>}
        <section className="learning-stat-events">
          <header><h3>最近练习</h3><small>本机保留最近 600 条</small></header>
          {!events.length && <p className="learning-stat-empty"><BarChart3 size={18}/>完成一次练习或跟读后，这里会显示记录。</p>}
          {events.map(event => <div key={event.id} className={`learning-event-row${event.correct ? ' is-correct' : ' is-wrong'}`}>
            {event.correct ? <CheckCircle2 size={15}/> : <XCircle size={15}/>}
            <span>{event.text}</span>
            <small>{event.kind === 'recording' ? '跟读' : event.kind === 'review' ? '复习' : event.kind === 'dialogue' ? '对话' : '练习'}{typeof event.score === 'number' ? ` · ${event.score} 分` : ''}</small>
            <time>{new Date(event.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
          </div>)}
        </section>
      </div>
    </section>
  </div>
}
