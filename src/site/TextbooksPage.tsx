import { useState } from 'react'
import { ArrowRight, BookOpen, Filter, Search, X } from 'lucide-react'
import type { OnlineBook, RemoteBookEntry } from '../reader/types'
import type { PendingOnlineBook } from '../onlineCatalog'
import { onlineBookEdition } from '../onlineCatalog'
import { BookCover, grades, termLabel, type CoverBook } from './BookCover'
import './SitePages.css'

type Remote = RemoteBookEntry & { lastPage?: number }

function onlineLabel(book: OnlineBook) {
  return `${grades[book.grade]}${termLabel(book.term)} ${onlineBookEdition(book)}`
}

function TextbookCard({ title, subtitle, cover, online, pending, onOpen }: { title: string; subtitle: string; cover?: string; online?: CoverBook; pending?: boolean; onOpen?: () => void }) {
  const content = <>
    <span className="textbook-card-art">
      {online ? <BookCover book={online} pending={pending}/> : cover ? <img src={cover} alt="" loading="lazy" onError={event => event.currentTarget.remove()}/> : <span className="textbook-card-fallback"><BookOpen size={30}/><small>ENGLISH</small></span>}
    </span>
    <span className="textbook-card-copy"><strong>{title}</strong><small>{subtitle}</small></span>
  </>
  return onOpen
    ? <button type="button" className="textbook-card" aria-label={title} onClick={onOpen}>{content}</button>
    : <div className="textbook-card is-pending">{content}</div>
}

export default function TextbooksPage({
  remoteBooks,
  catalog,
  pendingCatalog = [],
  onRemote,
  onOnline,
  onPractice,
}: {
  remoteBooks: Remote[]
  catalog: OnlineBook[]
  pendingCatalog?: PendingOnlineBook[]
  onRemote: (id: string) => void
  onOnline: (id: string) => void
  onPractice: () => void
}) {
  const [grade, setGrade] = useState(() => { try { const value = Number(localStorage.getItem('pep:shelf-grade')); return value >= 3 && value <= 9 ? value : 3 } catch { return 3 } })
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const remoteResults = remoteBooks.filter(book => !needle || `${book.title} ${book.series ?? ''} ${book.publisher ?? ''} Oxford 牛津`.toLowerCase().includes(needle))
  const onlineResults = catalog.filter(book => !needle || `${grades[book.grade]} ${termLabel(book.term)} ${onlineBookEdition(book)} 人教 PEP ${book.grade}`.toLowerCase().includes(needle))
  const currentOnline = onlineResults.filter(book => book.grade === grade)
  const currentPending = pendingCatalog.filter(book => book.grade === grade)
  const total = remoteResults.length + onlineResults.length

  return <div className="site-page textbooks-page">
    <section className="page-hero textbooks-hero">
      <div>
        <span className="page-kicker">TEXTBOOK CENTER</span>
        <h1>课本中心</h1>
        <p>牛津 Let's Go 与人教 PEP 原版教材。进入后仍使用原点读、课堂音频、动漫和书籍目录阅读器。</p>
      </div>
      <button type="button" className="page-hero-action" onClick={onPractice}>去练习中心<ArrowRight size={16}/></button>
    </section>

    <div className="page-toolbar">
      <label className="page-search">
        <Search size={18} aria-hidden="true"/>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索课本、系列或年级" aria-label="搜索课本、系列或年级"/>
        {query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={15}/></button>}
      </label>
      <span className="page-toolbar-count" role="status">共 {total} 本可打开</span>
    </div>

    {needle && total === 0 && <div className="page-empty">
      <Filter size={22}/>
      <strong>没有找到课本</strong>
      <span>换一个书名、系列或年级试试。</span>
      <button type="button" className="page-empty-action" onClick={() => setQuery('')}>清空搜索</button>
    </div>}

    {(remoteResults.length > 0 || !needle) && <section className="textbook-series" aria-labelledby="textbook-oxford">
      <header className="series-head">
        <div><span className="page-kicker">OXFORD</span><h2 id="textbook-oxford">牛津系列</h2></div>
        <p>原版页面 · 点读热区 · 课堂音视频</p>
      </header>
      {remoteResults.length > 0
        ? <div className="textbook-grid">{remoteResults.map(book => <TextbookCard key={book.id} title={book.title} subtitle={[book.series, book.publisher].filter(Boolean).join(' · ') || '在线教材'} cover={book.cover} onOpen={() => onRemote(book.id)}/>)}</div>
        : <div className="series-empty">本机还没有牛津教材。运行 <code>npm run book:serve</code> 后会自动出现在这里。</div>}
    </section>}

    <section className="textbook-series" aria-labelledby="textbook-pep">
      <header className="series-head">
        <div><span className="page-kicker">PEP</span><h2 id="textbook-pep">人教 PEP</h2></div>
        <p>三至九年级 · 上下册</p>
      </header>
      <div className="grade-tabs textbook-grades" role="group" aria-label="选择年级">
        {Object.entries(grades).map(([value, label]) => <button key={value} type="button" className={`grade-tab ${grade === Number(value) ? 'selected' : ''}`} aria-pressed={grade === Number(value)} onClick={() => { setGrade(Number(value)); try { localStorage.setItem('pep:shelf-grade', value) } catch { /* 忽略 */ } }}>{label}</button>)}
      </div>
      <div className="textbook-grid">
        {currentOnline.map(book => <TextbookCard key={book.id} title={onlineLabel(book)} subtitle={`人教 PEP · ${book.grade} 年级`} online={book} onOpen={() => onOnline(book.id)}/>)}
        {currentPending.map(book => <TextbookCard key={`${book.grade}-${book.term}-pending`} title={`${grades[book.grade]}${termLabel(book.term)} ${book.edition}`} subtitle={book.message} online={book} pending/>)}
      </div>
      {!currentOnline.length && !currentPending.length && <div className="series-empty">这个年级暂时没有可用课本。</div>}
    </section>
  </div>
}
