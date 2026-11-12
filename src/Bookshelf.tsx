import { useRef, useState } from 'react'
import { ArrowRight, BookOpen, ChevronDown, ChevronRight, Headphones, Pencil, Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import './Bookshelf.css'
import RenameDialog from './RenameDialog'
import type { OnlineBook, RemoteBookEntry } from './reader/types'
import { onlineBookEdition, type PendingOnlineBook } from './onlineCatalog'
import { readLastChapter, useLearningState } from './reader/learningStore'
import type { ProfileId } from './reader/learningCore'
import { LOCAL_BOOKS_ENABLED } from './features'
import { BookCover, grades, termLabel } from './site/BookCover'
import type { PictureCatalogEntry } from './pictureBooks'
import { pictureArt, readPictureProgress, type PictureProgress } from './pictureBooks'
import { groupPictureSeries } from './pictureSeries'

type SavedBook = { id: string; title: string; pages: number; lastPage: number }
type RemoteShelfBook = RemoteBookEntry & { lastPage: number }
type ShelfKind = 'remote' | 'online' | 'local' | 'picture'

type ShelfEntry = {
  key: string
  kind: ShelfKind
  id: string
  title: string
  subtitle: string
  pages?: number
  items?: number
  hasMedia?: boolean
  lastPage: number
  cover?: string
  series?: string
  publisher?: string
  grade?: number
  term?: 'a' | 'b'
  online?: OnlineBook
  picture?: PictureCatalogEntry
  levelLabel?: string
  themes?: string[]
  minutes?: number
  keywords: string
}

const LAST_OPEN_KEY = 'pep:shelf-last-open:'

function followAlongBook(grade: number) {
  if (grade === 6) return 'tape6a_002015'
  if (grade === 3) return 'tape3a_002013'
  try { return localStorage.getItem('pep:followalong-book') ?? 'tape3a_002013' } catch { return 'tape3a_002013' }
}

function splitTitle(title: string) {
  const index = title.indexOf(' · ')
  return index < 0 ? { main: title, detail: '' } : { main: title.slice(0, index), detail: title.slice(index + 3) }
}

function remoteSubtitle(book: RemoteBookEntry, detail: string) {
  if (detail) return detail
  if (book.audio || book.videos) return '学生用书'
  if (book.items) return '图画词典'
  return '在线教材'
}

function readLastOpen(profile: ProfileId): { kind: ShelfKind; id: string; at: number } | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_OPEN_KEY + profile) ?? 'null')
    if (value && (value.kind === 'remote' || value.kind === 'online' || value.kind === 'local' || value.kind === 'picture') && typeof value.id === 'string') {
      return { kind: value.kind, id: value.id, at: Number.isFinite(value.at) ? value.at : 0 }
    }
  } catch {
    // 忽略损坏的本机记录。
  }
  return undefined
}

function rememberOpen(profile: ProfileId, entry: ShelfEntry) {
  try { localStorage.setItem(LAST_OPEN_KEY + profile, JSON.stringify({ kind: entry.kind, id: entry.id, at: Date.now() })) } catch { /* 存储不可用时只影响推荐 */ }
}

function uniqueEntries(entries: ShelfEntry[]) {
  const seen = new Set<string>()
  return entries.filter(entry => seen.has(entry.key) ? false : (seen.add(entry.key), true))
}

function pickContinue(entries: ShelfEntry[], profile: ProfileId) {
  const last = readLastOpen(profile)
  const opened = last ? entries.find(entry => entry.kind === last.kind && entry.id === last.id) : undefined
  const recent = entries
    .map(entry => {
      const pictureProgress = entry.kind === 'picture' ? readPictureProgress(entry.id, profile) : undefined
      const chapter = readLastChapter(entry.id, profile)
      return { entry, at: pictureProgress?.updatedAt ?? chapter?.at ?? 0 }
    })
    .filter(row => row.at > 0)
    .sort((a, b) => b.at - a.at)
  // 直接打开课本地址时不会经过书架，最近章节的时间戳可能晚于上次点击的教材。
  // 两边都带时间，取更晚的一条作为“继续学习”。
  if (opened && (!recent.length || (last?.at ?? 0) >= (recent[0].at ?? 0))) return opened
  if (recent.length) return recent[0].entry
  if (opened) return opened
  return entries.find(entry => entry.lastPage > 0)
    ?? entries.find(entry => entry.kind === 'remote' && entry.hasMedia)
    ?? entries[0]
}

function shelfAriaLabel(entry: ShelfEntry, surface: 'shelf' | 'catalog' | 'search') {
  if (entry.kind === 'picture') {
    if (surface === 'catalog') return `打开绘本 ${entry.title}`
    return `继续阅读绘本 ${entry.title}`
  }
  if (entry.kind === 'online') {
    if (surface === 'catalog' && entry.online && entry.grade && entry.term) return `打开 ${grades[entry.grade]}${termLabel(entry.term)} ${onlineBookEdition(entry.online)}`
    return `打开 ${entry.title} ${entry.subtitle}`
  }
  if (surface === 'catalog') return `查看全部教材中的 ${entry.title}`
  return `打开 ${entry.title}`
}

function ShelfCover({ entry }: { entry: ShelfEntry }) {
  return <span className="shelf-book-art" aria-hidden="true">
    {entry.kind === 'online' && entry.online
      ? <BookCover book={entry.online}/>
      : <span className={`shelf-cover-frame is-${entry.kind}`}>
        <span className="shelf-cover-fallback"><BookOpen size={28}/><small>{entry.kind === 'picture' ? 'PICTURE BOOK' : 'ENGLISH'}</small></span>
        {(entry.kind === 'remote' || entry.kind === 'picture') && entry.cover && <img src={entry.cover} alt="" loading="lazy" onError={event => event.currentTarget.remove()}/>}
      </span>}
  </span>
}

function ShelfBookCard({ entry, surface, onOpen }: { entry: ShelfEntry; surface: 'shelf' | 'catalog'; onOpen: (entry: ShelfEntry) => void }) {
  return <button type="button" className="shelf-book-card" aria-label={shelfAriaLabel(entry, surface)} onClick={() => onOpen(entry)}>
    <ShelfCover entry={entry}/>
    <span className="shelf-book-copy">
      <strong title={entry.title}>{entry.title}</strong>
      <small>{entry.subtitle}</small>
    </span>
  </button>
}

export default function Bookshelf({ books, remoteBooks, catalog, pendingCatalog = [], pictureBooks = [], onRead, onRemote, onOnline, onPicture, onLibrary, onTextbooks, onPractice, onImport, onRemove, onRename, onDictation, onFollowAlong, onDemo, onHelp }: { books: SavedBook[]; remoteBooks: RemoteShelfBook[]; catalog: OnlineBook[]; pendingCatalog?: PendingOnlineBook[]; pictureBooks?: PictureCatalogEntry[]; onRead: (id: string) => void; onRemote: (id: string) => void; onOnline: (id: string) => void; onPicture: (id: string) => void; onLibrary: () => void; onTextbooks: () => void; onPractice: () => void; onFollowAlong: (bookId: string) => void; onImport: (file?: File) => Promise<void>; onRemove: (id: string) => Promise<void>; onRename: (id: string, name: string) => Promise<void>; onDictation: () => void; onDemo: () => void; onHelp: () => void }) {
  const learning = useLearningState()
  const profile = learning.active
  const [grade, setGrade] = useState(() => { try { const n = Number(localStorage.getItem('pep:shelf-grade')); return n >= 3 && n <= 9 ? n : 3 } catch { return 3 } })
  const [manage, setManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [renaming, setRenaming] = useState<SavedBook | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const remoteEntries: ShelfEntry[] = remoteBooks.map(book => {
    const title = splitTitle(book.title)
    return {
      key: `remote:${book.id}`,
      kind: 'remote',
      id: book.id,
      title: title.main,
      subtitle: remoteSubtitle(book, title.detail),
      pages: book.pages,
      items: book.items,
      hasMedia: Boolean(book.audio || book.videos),
      lastPage: book.lastPage,
      cover: book.cover,
      series: book.series,
      publisher: book.publisher,
      keywords: `${title.main} ${book.title} ${book.series ?? ''} ${book.publisher ?? ''} 牛津 Oxford`,
    }
  })
  const localEntries: ShelfEntry[] = LOCAL_BOOKS_ENABLED ? books.map(book => ({
    key: `local:${book.id}`,
    kind: 'local',
    id: book.id,
    title: book.title,
    subtitle: book.lastPage > 0 ? `第 ${book.lastPage + 1} 页` : '离线教材',
    pages: book.pages,
    lastPage: book.lastPage,
    keywords: `${book.title} 离线 本机`,
  })) : []
  const onlineEntries: ShelfEntry[] = catalog.map(book => ({
    key: `online:${book.id}`,
    kind: 'online',
    id: book.id,
    title: `${book.grade <= 6 ? 'PEP ' : ''}${grades[book.grade]}${termLabel(book.term)}`,
    subtitle: '在线课本',
    grade: book.grade,
    term: book.term,
    lastPage: 0,
    online: book,
    keywords: `${grades[book.grade]} ${termLabel(book.term)} ${onlineBookEdition(book)} 人教 PEP 在线`,
  }))
  const pictureEntries: ShelfEntry[] = pictureBooks.map(book => {
    const progress = readPictureProgress(book.id, profile)
    return {
      key: `picture:${book.id}`,
      kind: 'picture',
      id: book.id,
      title: book.title,
      subtitle: progress ? `第 ${progress.pageIndex + 1} / ${book.pages ?? 0} 个跨页` : `绘本 · ${book.levelLabel}`,
      pages: book.pages,
      lastPage: progress?.pageIndex ?? 0,
      cover: book.cover,
      series: book.series,
      levelLabel: book.levelLabel,
      themes: book.themes,
      minutes: book.minutes,
      picture: book,
      keywords: `${book.title} ${book.series} ${book.levelLabel} ${(book.themes ?? []).join(' ')} 绘本 故事`,
    }
  })
  // 首页按整套绘本聚合：108 集只占一张卡片，卡片上的进度取最近读的那一集。
  const pictureSeriesCards = groupPictureSeries(pictureBooks).map(group => {
    const display = group.episodes[0]
    let latest: { book: PictureCatalogEntry; progress: PictureProgress } | undefined
    for (const book of group.episodes) {
      const progress = readPictureProgress(book.id, profile)
      if (progress && (!latest || progress.updatedAt > latest.progress.updatedAt)) latest = { book, progress }
    }
    const openBook = latest?.book ?? display
    const meta = latest
      ? `${display.levelLabel} · 读到第 ${openBook.episode ?? 1} / ${group.episodes.length} 集`
      : `${display.levelLabel} · 共 ${group.episodes.length} 集`
    const entry: ShelfEntry = {
      key: `picture-series:${group.key}`,
      kind: 'picture',
      id: openBook.id,
      title: group.name,
      subtitle: meta,
      pages: openBook.pages,
      lastPage: latest?.progress.pageIndex ?? 0,
      cover: display.cover,
      series: group.name,
      levelLabel: display.levelLabel,
      themes: display.themes,
      picture: display,
      keywords: `${group.name} ${display.levelLabel} ${display.themes.join(' ')} 绘本 故事`,
    }
    return { group, display, latest, entry, meta }
  })
  const recentPictureSeries = pictureSeriesCards
    .filter(card => card.latest)
    .sort((left, right) => (right.latest?.progress.updatedAt ?? 0) - (left.latest?.progress.updatedAt ?? 0))
    .map(card => card.entry)
  const currentGradeOnline = onlineEntries.filter(entry => entry.grade === grade)
  const activeGradeOnline = onlineEntries.filter(entry => entry.grade === grade && entry.online)
  const allEntries = [...remoteEntries, ...localEntries, ...onlineEntries, ...pictureEntries]
  const continueRaw = pickContinue(allEntries, profile)
  const continueSeries = continueRaw?.kind === 'picture'
    ? pictureSeriesCards.find(card => card.group.name === continueRaw.series)
    : undefined
  const continueEntry = continueRaw && continueSeries
    ? {
      ...continueSeries.entry,
      id: continueRaw.id,
      pages: continueRaw.pages,
      lastPage: continueRaw.lastPage,
      picture: continueRaw.picture ?? continueSeries.entry.picture,
    }
    : continueRaw
  const myShelf = uniqueEntries([
    ...(continueEntry ? [continueEntry] : []),
    ...recentPictureSeries,
    ...remoteEntries,
    ...localEntries,
    ...currentGradeOnline,
  ]).slice(0, 4)
  const featuredRemote = remoteEntries[0]
  const browseEntry = featuredRemote ?? currentGradeOnline[0] ?? localEntries[0] ?? continueEntry
  const browseSeries = [featuredRemote?.series, '人教PEP'].filter(Boolean).join(' / ')
  const pending = pendingCatalog.filter(book => book.grade === grade)
  const localCurrent = localEntries
  const featuredPictureSeries = pictureSeriesCards.slice(0, 4)
  const promoSeries = featuredPictureSeries.find(card => card.entry.key !== continueEntry?.key) ?? featuredPictureSeries[0]
  const promoProgress = promoSeries?.latest?.progress

  function chooseGrade(next: number) {
    setGrade(next)
    try { localStorage.setItem('pep:shelf-grade', String(next)) } catch { /* 忽略 */ }
    setCatalogOpen(true)
  }

  function showAllMaterials() {
    setCatalogOpen(true)
    window.requestAnimationFrame(() => document.getElementById('shelf-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function openEntry(entry: ShelfEntry) {
    rememberOpen(profile, entry)
    if (entry.kind === 'remote') onRemote(entry.id)
    else if (entry.kind === 'online') onOnline(entry.id)
    else if (entry.kind === 'picture') onPicture(entry.id)
    else onRead(entry.id)
  }

  async function importBook(file?: File) {
    if (!file) return
    setBusy(true)
    try { await onImport(file) } finally { setBusy(false); if (input.current) input.current.value = '' }
  }

  async function removeBook() {
    if (!deleting) return
    setDeleteError('')
    try { await onRemove(deleting); setDeleting(null) } catch { setDeleteError('删除失败，请重试。') }
  }

  const continuePages = continueEntry?.pages ?? 0
  const continuePage = continueEntry ? Math.min(continueEntry.lastPage + 1, continuePages || continueEntry.lastPage + 1) : 0
  const continueProgress = continueEntry && continuePages > 0 && continueEntry.lastPage > 0 ? Math.max(2, Math.round(continuePage / continuePages * 100)) : 0
  const continueBadge = continueEntry && continueEntry.lastPage > 0
    ? continueEntry.kind === 'picture' ? `上次第 ${continueEntry.lastPage + 1} 个跨页` : `上次第 ${continueEntry.lastPage + 1} 页`
    : '开始学习'
  const continueChapter = continueRaw
    ? continueRaw.kind === 'online'
      ? continueRaw.subtitle
      : continueRaw.kind === 'picture'
        ? [continueRaw.picture?.episode ? `第 ${continueRaw.picture.episode} 集` : '', continueRaw.title].filter(Boolean).join(' · ')
        : readLastChapter(continueRaw.id, profile)?.label || continueRaw.subtitle
    : ''
  const continueLabel = continueEntry
    ? continueEntry.kind === 'online' ? '打开课本' : continueEntry.lastPage > 0 ? '继续' : '开始学习'
    : '开始学习'

  return <div className="kids-bookshelf shelf-page">
    <main className="shell shelf-main">
      <div className="shelf-home">
        <h1 className="sr-only">今天读哪一本？</h1>

        {continueEntry && <section className="shelf-continue" aria-labelledby="shelf-continue-title">
          <header className="shelf-section-head">
            <h2 id="shelf-continue-title">继续学习</h2>
            <span className={`shelf-continue-badge${continueEntry.lastPage > 0 ? '' : ' is-start'}`}>{continueBadge}</span>
          </header>
          <div className="shelf-continue-layout">
            <div className="shelf-continue-card">
              <div className="shelf-continue-cover"><ShelfCover entry={continueEntry}/></div>
              <div className="shelf-continue-copy">
                <strong>{continueEntry.title}</strong>
                <span>{continueChapter}</span>
                <div className="shelf-continue-progress">
                  <div className="shelf-progress-track" aria-hidden="true"><i style={{ width: `${continueProgress}%` }}/></div>
                  <small>{continuePages > 0 ? continueEntry.kind === 'picture' ? `第 ${continuePage} / ${continuePages} 个跨页` : `第 ${continuePage} / ${continuePages} 页` : '在线课本'}</small>
                </div>
              </div>
              <button type="button" className="shelf-primary" aria-label={`继续学习 ${continueEntry.title}`} onClick={() => openEntry(continueEntry)}>
                <span>{continueLabel}</span><ArrowRight size={17}/>
              </button>
            </div>
            <div className="shelf-story-card">
              <div className="shelf-story-art" aria-hidden="true">
                {promoSeries ? <img src={pictureArt(promoSeries.display)} alt="" loading="lazy"/> : <Sparkles size={28}/>}
              </div>
              <div className="shelf-story-copy">
                <span className="shelf-story-kicker">绘本馆</span>
                <strong>{promoSeries?.group.name ?? '打开故事绘本'}</strong>
                <small>{promoSeries ? `${promoSeries.group.episodes.length} 集 · ${promoSeries.display.levelLabel} · ${promoSeries.display.themes.slice(0, 2).join(' / ')}${promoProgress ? ` · 读到第 ${promoSeries.latest?.book.episode ?? 1} 集` : ' · 听故事 · 自己读 · 跟读'}` : '原版插画 · 整集原声 · 逐句高亮'}</small>
              </div>
              <div className="shelf-story-actions">
                <button type="button" className="shelf-story-link" onClick={onLibrary}>全部绘本<ArrowRight size={13}/></button>
                {promoSeries && <button type="button" className="shelf-story-play" aria-label={`阅读绘本 ${promoSeries.group.name}`} onClick={() => onPicture(promoSeries.entry.id)}>{promoProgress ? '继续阅读' : '开始阅读'}</button>}
              </div>
            </div>
          </div>
        </section>}

        <section className="shelf-mine" aria-labelledby="shelf-mine-title">
          <header className="shelf-section-head">
            <h2 id="shelf-mine-title">我的书架</h2>
            <button type="button" className="shelf-section-link" onClick={onTextbooks}>全部课本<ChevronRight size={15}/></button>
          </header>
          <div className="shelf-book-grid">
            {myShelf.map(entry => <ShelfBookCard key={entry.key} entry={entry} surface="shelf" onOpen={openEntry}/>)}
            {!myShelf.length && <p className="shelf-empty">还没有教材，打开“全部课本”选一本开始。</p>}
          </div>
        </section>

        {featuredPictureSeries.length > 0 && <section className="shelf-featured" aria-labelledby="shelf-featured-title">
          <header className="shelf-section-head">
            <h2 id="shelf-featured-title">绘本精选</h2>
            <button type="button" className="shelf-section-link" onClick={onLibrary}>全部绘本<ChevronRight size={15}/></button>
          </header>
          <div className={`shelf-picture-grid${featuredPictureSeries.length === 1 ? ' is-single' : ''}`}>
            {featuredPictureSeries.map(card => <button key={card.entry.key} type="button" className="shelf-picture-card" aria-label={`打开绘本 ${card.group.name}`} onClick={() => onPicture(card.entry.id)}>
              <span className="shelf-picture-art"><img src={featuredPictureSeries.length === 1 ? card.display.cover : pictureArt(card.display)} alt="" loading="lazy"/></span>
              <span className="shelf-picture-copy"><strong>{card.group.name}</strong><small>{card.meta}</small></span>
              {featuredPictureSeries.length === 1 && <span className="shelf-picture-cta">{card.latest ? '继续阅读' : '开始阅读'}<ArrowRight size={15}/></span>}
            </button>)}
          </div>
        </section>}

        <section className="shelf-browse" id="shelf-catalog" aria-labelledby="shelf-browse-title">
          <div className="shelf-browse-main">
            {browseEntry && <div className="shelf-browse-cover"><ShelfCover entry={browseEntry}/></div>}
            <div className="shelf-browse-copy">
              <span className="shelf-browse-kicker">{browseSeries}</span>
              <h2 id="shelf-browse-title">全部课本</h2>
              <p>{featuredRemote?.publisher ?? browseEntry?.publisher ?? '按系列和年级查找教材'}</p>
              {featuredRemote && <small><span className="shelf-browse-book-title">{featuredRemote.title} · </span>{featuredRemote.pages ? `${featuredRemote.pages} 页` : '在线教材'}{featuredRemote.items ? ` · ${featuredRemote.items.toLocaleString('zh-CN')} 个点读条目` : ''}</small>}
            </div>
            {browseEntry && <button type="button" className="shelf-browse-cta" onClick={() => openEntry(browseEntry)}>进入教材<ArrowRight size={16}/></button>}
          </div>
          <div className="shelf-browse-footer">
            <div className="grade-tabs" role="group" aria-label="选择年级">
              {Object.entries(grades).map(([n, label]) => <button key={n} type="button" className={`grade-tab ${grade === Number(n) ? 'selected' : ''}`} aria-pressed={grade === Number(n)} onClick={() => chooseGrade(Number(n))}>{label}</button>)}
            </div>
            <button type="button" className="shelf-browse-expand" aria-expanded={catalogOpen} aria-controls="shelf-catalog-all" onClick={() => catalogOpen ? setCatalogOpen(false) : showAllMaterials()}>
              {catalogOpen ? '收起' : '全部教材'}<ChevronDown size={15} className={catalogOpen ? 'is-open' : ''}/>
            </button>
          </div>
          {catalogOpen && <div className="shelf-catalog-all" id="shelf-catalog-all">
            {remoteEntries.length > 0 && <section className="shelf-catalog-group" aria-labelledby="shelf-catalog-oxford">
              <header><h3 id="shelf-catalog-oxford">牛津系列</h3><span>{featuredRemote?.series ?? 'Oxford'}</span></header>
              <div className="shelf-book-grid is-catalog">{remoteEntries.map(entry => <ShelfBookCard key={entry.key} entry={entry} surface="catalog" onOpen={openEntry}/>)}</div>
            </section>}
            <section className="shelf-catalog-group" aria-labelledby="shelf-catalog-pep">
              <header><h3 id="shelf-catalog-pep">人教 PEP</h3><span>{grades[grade]}</span></header>
              <div className="shelf-book-grid is-catalog">
                {activeGradeOnline.map(entry => <ShelfBookCard key={entry.key} entry={entry} surface="catalog" onOpen={openEntry}/>)}
                {pending.map(book => <div className="shelf-book-card is-pending" key={`${book.grade}-${book.term}-pending`} aria-label={`${grades[book.grade]}${termLabel(book.term)} ${book.edition} ${book.message}`}>
                  <span className="shelf-book-art" aria-hidden="true"><BookCover book={book} pending/></span>
                  <span className="shelf-book-copy"><strong>{grades[book.grade]} {termLabel(book.term)}</strong><small>{book.message}</small></span>
                </div>)}
                {LOCAL_BOOKS_ENABLED && <button type="button" className="shelf-book-card shelf-import-card" disabled={busy} onClick={() => input.current?.click()}>
                  <span className="shelf-book-art shelf-import-art" aria-hidden="true"><span className="shelf-import-plus"><Plus size={32}/></span><small>PDF / ZIP</small></span>
                  <span className="shelf-book-copy"><strong>{busy ? '正在导入…' : '导入本地教材'}</strong><small>断网也能读</small></span>
                </button>}
              </div>
            </section>
            {LOCAL_BOOKS_ENABLED && <section className="shelf-catalog-group" aria-labelledby="shelf-catalog-local">
              <header><h3 id="shelf-catalog-local">我的离线教材</h3><div className="shelf-local-tools"><button type="button" aria-pressed={manage} onClick={() => setManage(value => !value)}>{manage ? '完成管理' : '管理课本'}</button><button type="button" onClick={onHelp}>格式说明</button></div></header>
              {localCurrent.length > 0 ? <div className="local-grid shelf-local-grid">
                {books.map(book => <article className="local-book" key={book.id}>
                  <div className="local-cover" aria-hidden="true"><BookOpen size={26}/><span>ENGLISH</span></div>
                  <div className="local-copy"><h3>{book.title}</h3><p>{book.lastPage ? '上次读到第 ' + (book.lastPage + 1) + ' 页' : '共 ' + book.pages + ' 页'}</p><div className="local-actions">
                    <button className="btn btn-small btn-primary" onClick={() => openEntry(localEntries.find(entry => entry.id === book.id)!)}>继续阅读</button>
                    <button className="name-edit-button" aria-label={`修改课本名称 ${book.title}`} onClick={() => setRenaming(book)}><Pencil size={14}/>修改名称</button>
                    {manage && <button className="local-remove" aria-label={`删除课本 ${book.title}`} onClick={() => { setDeleteError(''); setDeleting(book.id) }}><Trash2 size={15}/>删除</button>}
                  </div></div>
                </article>)}
              </div> : <div className="shelf-local-empty">
                <p>导入 PDF 或 ZIP 教材包，断网也能点读和跟读。</p>
                <div><button className="btn btn-ghost btn-small" onClick={onDemo}>试读原创样例</button><button className="btn btn-primary btn-small" disabled={busy} onClick={() => input.current?.click()}><Upload size={14}/>{busy ? '正在导入…' : '导入教材包'}</button></div>
              </div>}
            </section>}
          </div>}
        </section>

        <div className="shelf-tools">
          <button type="button" className="shelf-tool-card" aria-label="跟读学习" onClick={() => onFollowAlong(followAlongBook(grade))}>
            <span className="shelf-tool-icon" aria-hidden="true"><Headphones size={21}/></span>
            <span className="shelf-tool-copy"><strong>跟读学习</strong><small>听原音 · 练发音</small></span>
            <ChevronRight size={17} className="shelf-tool-arrow"/>
          </button>
          <button type="button" className="shelf-tool-card" aria-label="听写练习" onClick={onDictation}>
            <span className="shelf-tool-icon" aria-hidden="true"><Pencil size={20}/></span>
            <span className="shelf-tool-copy"><strong>听写练习</strong><small>听单词 · 做练习</small></span>
            <ChevronRight size={17} className="shelf-tool-arrow"/>
          </button>
          <button type="button" className="shelf-tool-card" aria-label="阅读理解" onClick={onPractice}>
            <span className="shelf-tool-icon" aria-hidden="true"><Sparkles size={20}/></span>
            <span className="shelf-tool-copy"><strong>阅读理解</strong><small>读故事 · 做小测</small></span>
            <ChevronRight size={17} className="shelf-tool-arrow"/>
          </button>
        </div>
      </div>

      <footer className="shelf-footer">
        <span>在线教材需要网络；阅读进度和学习档案保存在本机。</span>
        {LOCAL_BOOKS_ENABLED && <button className="footer-link" onClick={onHelp}>教材包格式<ChevronRight size={14}/></button>}
      </footer>
      <input className="kids-file" ref={input} type="file" accept=".pdf,.zip,application/pdf,application/zip" aria-label="导入课本文件" onChange={event => void importBook(event.target.files?.[0])}/>
    </main>

    {renaming && <RenameDialog title="修改教材名称" value={renaming.title} onClose={() => setRenaming(null)} onSave={name => onRename(renaming.id, name)}/>}
    {deleting && <div className="modal-shade" onClick={() => setDeleting(null)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="delete-book-title" onClick={event => event.stopPropagation()}><h2 id="delete-book-title">删除这本课本？</h2><p>{books.find(book => book.id === deleting)?.title}</p>{deleteError && <p role="alert">{deleteError}</p>}<div className="unit-delete-actions"><button className="soft-btn" onClick={() => setDeleting(null)}>取消</button><button className="danger-btn" onClick={() => void removeBook()}>确认删除</button></div></section></div>}
  </div>
}
