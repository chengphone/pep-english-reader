import { useMemo, useState } from 'react'
import { ArrowRight, BookOpen, ClipboardCheck, Headphones, Pencil, Search, Sparkles, X } from 'lucide-react'
import type { PictureCatalogEntry } from '../pictureBooks'
import { pictureArt } from '../pictureBooks'
import './SitePages.css'

export default function PracticeCenter({
  pictureBooks,
  catalogError,
  onRetryCatalog,
  onFollowAlong,
  onDictation,
  onOpenPicture,
  onQuiz,
}: {
  pictureBooks: PictureCatalogEntry[]
  catalogError?: string
  onRetryCatalog?: () => void
  onFollowAlong: (bookId: string) => void
  onDictation: () => void
  onOpenPicture: (id: string, page?: number, mode?: 'listen' | 'self' | 'practice') => void
  onQuiz: (bookId: string, mode: 'comprehension' | 'vocabulary') => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const quizBooks = useMemo(() => pictureBooks
    .filter(entry => (entry.vocabulary ?? 0) > 1)
    .filter(entry => !needle || `${entry.title} ${entry.series} 第${entry.episode}集`.toLowerCase().includes(needle))
    .sort((left, right) => (left.episode ?? 0) - (right.episode ?? 0) || left.title.localeCompare(right.title)), [needle, pictureBooks])
  const comprehensionBooks = pictureBooks.filter(entry => (entry.quiz ?? 0) > 0)
  const firstPicture = pictureBooks[0]
  const visible = quizBooks.slice(0, 8)

  return <div className="site-page practice-page">
    <section className="page-hero practice-hero">
      <div>
        <span className="page-kicker">PRACTICE CENTER</span>
        <h1>练习中心</h1>
        <p>跟读、听写和故事小测汇总在一起。教材练习沿用原来的录音与听写数据，绘本小测只使用随书生词和已校对的理解题。</p>
      </div>
      <div className="practice-hero-mark" aria-hidden="true"><ClipboardCheck size={42}/></div>
    </section>

    <section className="practice-primary" aria-label="练习方式">
      <button type="button" className="practice-card is-green" onClick={() => onFollowAlong('tape3a_002013')}>
        <span className="practice-card-icon"><Headphones size={22}/></span>
        <span className="practice-card-copy"><strong>课本跟读</strong><small>听原音，逐句录音比较</small></span>
        <ArrowRight size={17}/>
      </button>
      <button type="button" className="practice-card is-amber" onClick={onDictation}>
        <span className="practice-card-icon"><Pencil size={21}/></span>
        <span className="practice-card-copy"><strong>课本听写</strong><small>听单词和句子，检查拼写</small></span>
        <ArrowRight size={17}/>
      </button>
      <button type="button" className="practice-card is-blue" disabled={!firstPicture} onClick={() => firstPicture && onOpenPicture(firstPicture.id, undefined, 'practice')}>
        <span className="practice-card-icon"><BookOpen size={21}/></span>
        <span className="practice-card-copy"><strong>绘本跟读</strong><small>{firstPicture ? `从《${firstPicture.title}》开始` : '等待绘本资源接入'}</small></span>
        <ArrowRight size={17}/>
      </button>
    </section>

    <section className="practice-quizzes" aria-labelledby="practice-picture-title">
      <header className="library-browser-head">
        <div><span className="page-kicker">PICTURE BOOK QUIZZES</span><h2 id="practice-picture-title">绘本小测</h2></div>
        <p>{quizBooks.length} 本有生词小测{comprehensionBooks.length ? ` · ${comprehensionBooks.length} 本有理解题` : ''}</p>
      </header>
      <div className="page-toolbar">
        <label className="page-search">
          <Search size={18} aria-hidden="true"/>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索绘本或集数" aria-label="搜索绘本或集数"/>
          {query && <button type="button" aria-label="清空小测搜索" onClick={() => setQuery('')}><X size={15}/></button>}
        </label>
      </div>
      {!pictureBooks.length && (catalogError ? <div className="page-empty">
        <BookOpen size={24}/>
        <strong>绘本目录加载失败</strong>
        <span>{catalogError}</span>
        {onRetryCatalog && <button type="button" className="page-empty-action" onClick={onRetryCatalog}>重新读取</button>}
      </div> : <div className="page-empty">
        <BookOpen size={24}/>
        <strong>还没有绘本练习</strong>
        <span>运行本地服务器并接入 Journey to the West 后，词汇小测会出现在这里。</span>
        <code>npm run book:prepare-picture &amp;&amp; npm run book:serve</code>
      </div>)}
      {pictureBooks.length > 0 && !quizBooks.length && <div className="page-empty"><Search size={22}/><strong>没有匹配的绘本</strong><span>换一个书名或集数试试。</span><button type="button" className="page-empty-action" onClick={() => setQuery('')}>清空搜索</button></div>}
      {visible.length > 0 && <div className="quiz-book-list">
        {visible.map(entry => <article key={entry.id} className="quiz-book-row">
          <div className="quiz-book-cover" aria-hidden="true"><img src={pictureArt(entry)} alt="" loading="lazy"/></div>
          <div className="quiz-book-copy">
            <strong>{entry.title}</strong>
            <small>第 {entry.episode} 集 · {entry.levelLabel} · {entry.vocabulary ?? 0} 个生词{entry.quiz ? ` · ${entry.quiz} 道理解题` : ''}</small>
          </div>
          <div className="quiz-book-actions">
            {entry.quiz ? <button type="button" className="quiz-action is-primary" onClick={() => onQuiz(entry.id, 'comprehension')}>阅读理解</button> : null}
            <button type="button" className={`quiz-action${entry.quiz ? '' : ' is-primary'}`} onClick={() => onQuiz(entry.id, 'vocabulary')}>词汇小测</button>
          </div>
        </article>)}
      </div>}
      {quizBooks.length > visible.length && <p className="practice-note">先显示前 8 本；用搜索可以找到其余绘本。</p>}
    </section>

    {comprehensionBooks.length > 0 && <section className="practice-comprehension" aria-labelledby="practice-comprehension-title">
      <header className="library-browser-head">
        <div><span className="page-kicker">READING COMPREHENSION</span><h2 id="practice-comprehension-title">已校对的理解题</h2></div>
        <p>{comprehensionBooks.length} 本</p>
      </header>
      <div className="practice-comprehension-grid">
        {comprehensionBooks.map(entry => <button key={entry.id} type="button" className="practice-comprehension-card" onClick={() => onQuiz(entry.id, 'comprehension')}>
          <span className="practice-comprehension-art" aria-hidden="true"><img src={pictureArt(entry)} alt=""/></span>
          <span><strong>{entry.title}</strong><small>第 {entry.episode} 集 · {entry.quiz} 道题</small></span>
          <Sparkles size={17}/>
        </button>)}
      </div>
    </section>}
  </div>
}
