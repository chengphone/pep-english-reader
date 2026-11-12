import { useEffect, useMemo, useRef, useState } from 'react'
import { List, Pause, Play, X } from 'lucide-react'
import BookToc from './BookToc'
import BookmarksDialog from './BookmarksDialog'
import HotspotEditor from './HotspotEditor'
import LearningPanel, { type LearningTab } from './LearningPanel'
import MediaDock, { type MediaDockState } from './MediaDock'
import OfflineDialog from './OfflineDialog'
import PageVideoDialog from './PageVideoDialog'
import ReaderPageSurface, { type PageFit } from './ReaderPageSurface'
import ReaderTopBar from './ReaderTopBar'
import ReadingViewTools from './ReadingViewTools'
import StatsDialog from './StatsDialog'
import TeacherModeDialog from './TeacherModeDialog'
import { setTeacherMode, useTeacherMode } from './adminMode'
import { activeTocIndex, buildBookToc } from './tocEntries'
import { preloadAudio, usePageAudio } from './usePageAudio'
import { useReadingFullscreen } from './useReadingFullscreen'
import { useStudyTimer } from './useStudyTimer'
import { bookmarksFor, dueForBook, recordLastChapter, recordPageVisit, recordRecordingResult, recordWordResult, setActiveProfile, toggleBookmark, useLearningState } from './learningStore'
import type { QuizQuestion } from './learningCore'
import type { LocalBook, ReaderItem, ReaderResource } from './types'
import type { ReaderPlaybackController } from './useReaderPlayback'
import './Reader.css'

type Props = {
  book: LocalBook
  pageIndex: number
  imageSrc: string
  selected: ReaderItem | null
  translation?: string
  translating: boolean
  translationMessage?: string
  repeat: number
  speed: number
  playback: ReaderPlaybackController
  onPage: (index: number) => void
  onRepeat: (value: number) => void
  onSpeed: (value: number) => void
  onBack: () => void
  onDictation: () => void
  onSaveTranslation: (text: string) => Promise<void>
  onSaveItems: (page: number, items: ReaderItem[]) => Promise<void>
}

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function LocalReader({ book, pageIndex, imageSrc, selected, translation, translating, translationMessage, repeat, speed, playback, onPage, onRepeat, onSpeed, onBack, onDictation, onSaveTranslation, onSaveItems }: Props) {
  const fullscreen = useReadingFullscreen(), stage = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null)
  const wide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1181px)').matches
  const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1180px)').matches
  // 宽屏默认展开目录和学习面板；平板和手机上两者都是覆盖式抽屉，先收起。
  const [tocOpen, setTocOpen] = useState(wide)
  const [panelOpen, setPanelOpen] = useState(wide)
  const [learningTab, setLearningTab] = useState<LearningTab>('words')
  const [clean, setClean] = useState(false)
  const [video, setVideo] = useState<ReaderResource | null>(null)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [offlineOpen, setOfflineOpen] = useState(false)
  const [teacherModeOpen, setTeacherModeOpen] = useState(false)
  const teacher = useTeacherMode()
  const [size, setSize] = useState({ width: 1000, height: 700 }), [fit, setFit] = useState<PageFit>('page'), [zoom, setZoom] = useState(1), [regions, setRegions] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [hotspotEditing, setHotspotEditing] = useState(false), [draftItems, setDraftItems] = useState<ReaderItem[]>([]), [editorSelectedId, setEditorSelectedId] = useState<string>(), [savingItems, setSavingItems] = useState(false)
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(''), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('')
  const learning = useLearningState()
  const page = book.manifest.pages[pageIndex], count = book.manifest.pages.length
  const pageResources = page?.resources ?? []
  const pool = useMemo(() => book.manifest.pages.flatMap(row => row.items), [book.manifest])
  const hasItems = Boolean(page?.items.length), hasResources = pageResources.length > 0, hasLearning = hasItems || hasResources || pool.length > 0
  const pageNumber = page?.printedPage ?? pageIndex + 1
  const tocEntries = useMemo(() => buildBookToc(book.manifest), [book.manifest])
  const activeToc = tocEntries[activeTocIndex(tocEntries, page?.page ?? pageIndex + 1)]
  const section = activeToc ? [activeToc.title, activeToc.subtitle].filter(Boolean).join(' · ') : undefined
  const pageAudio = usePageAudio(page)
  const audioPlayingRef = useRef(false)
  useEffect(() => { audioPlayingRef.current = pageAudio.playing }, [pageAudio.playing])
  const sortedItems = useMemo(() => [...(page?.items ?? [])].sort((a, b) => a.order - b.order), [page])
  const pageAudios = pageResources.filter(resource => resource.kind === 'audio')
  const pageAudioIndex = pageAudios.findIndex(resource => resource.id === pageAudio.activeId)
  const pointIndex = sortedItems.findIndex(item => item.id === selected?.id)
  const profile = learning.active
  const bookmarks = bookmarksFor(book.id, profile)
  const bookmarked = bookmarks.some(row => row.page === pageIndex)
  const dueCount = dueForBook(book.id, profile).length
  const labelForPage = (index: number) => String(book.manifest.pages[index]?.printedPage ?? index + 1)
  const nextPage = useMemo(() => {
    const studied = learning.words[profile] ?? {}
    const pages = book.manifest.pages
    for (let offset = 1; offset <= pages.length; offset++) {
      const index = pageIndex + offset
      if (index >= pages.length) break
      const row = pages[index]
      const fresh = row.items.filter(item => !studied[`${book.id}:${item.id}`])
      if (fresh.length) return { page: index, label: String(row.printedPage ?? row.page), count: fresh.length }
    }
    for (let index = 0; index < pageIndex; index++) {
      const row = pages[index]
      const fresh = row.items.filter(item => !studied[`${book.id}:${item.id}`])
      if (fresh.length) return { page: index, label: String(row.printedPage ?? row.page), count: fresh.length }
    }
    return undefined
  }, [book.id, book.manifest.pages, learning.words, pageIndex, profile])
  const focusRect = focusMode && !hotspotEditing ? selected?.rects[0] ?? null : null
  const surfacePage = page && hotspotEditing ? { ...page, items: draftItems } : page

  useStudyTimer(book.id, pageIndex)
  useEffect(() => { recordPageVisit(book.id, pageIndex) }, [book.id, pageIndex])
  useEffect(() => { recordLastChapter(book.id, section ?? `第 ${pageNumber} 页`) }, [book.id, section, pageNumber])
  // 退出教师模式时立即收起管理入口和未保存的编辑，儿童端不会残留标注层。
  useEffect(() => {
    if (teacher) return
    setHotspotEditing(false)
    setDraftItems([])
    setEditorSelectedId(undefined)
    setEditing(false)
  }, [teacher])

  useEffect(() => {
    const target = stage.current
    if (!target) return
    const measure = () => {
      const bounds = target.getBoundingClientRect()
      setSize({ width: bounds.width, height: bounds.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0, left: 0 })
    setVideo(null)
    setHotspotEditing(false)
    setDraftItems([])
  }, [pageIndex])
  // 提前拉取下一页图片，翻页时直接命中浏览器/SW 缓存；不阻塞当前页。
  useEffect(() => {
    const next = book.manifest.pages[pageIndex + 1]
    if (!next?.image) return
    const image = new Image()
    image.decoding = 'async'
    image.src = next.image
  }, [book.id, book.manifest.pages, pageIndex])
  // 页面稳定后再预取本页第一段音频；如果用户已经开始播放就跳过，避免抢带宽。
  useEffect(() => {
    const url = page?.items.find(item => item.audio)?.audio ?? page?.resources?.find(resource => resource.kind === 'audio')?.src
    if (!url) return
    const timer = window.setTimeout(() => {
      if (!audioPlayingRef.current) preloadAudio(url)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [page])
  useEffect(() => {
    if (!hasLearning && narrow()) setPanelOpen(false)
  }, [pageIndex, hasLearning])
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target
      if (editing || document.querySelector('.page-video-backdrop, .learning-dialog-backdrop, .reader-more-menu, .reading-view-tools.is-open') || (target instanceof Element && target.closest('input,textarea,select,[contenteditable],video'))) {
        if (event.key === 'Escape' && editing) setEditing(false)
        return
      }
      if (event.key === 'ArrowRight' && pageIndex < count - 1) {
        event.preventDefault()
        onPage(pageIndex + 1)
      } else if (event.key === 'ArrowLeft' && pageIndex > 0) {
        event.preventDefault()
        onPage(pageIndex - 1)
      } else if (event.key === 'Escape') {
        if (video) setVideo(null)
        else if (bookmarksOpen) setBookmarksOpen(false)
        else if (statsOpen) setStatsOpen(false)
        else if (offlineOpen) setOfflineOpen(false)
        else if (hotspotEditing) cancelHotspots()
        else if (clean) setClean(false)
        else if (focusMode) setFocusMode(false)
        else if (narrow() && panelOpen) setPanelOpen(false)
        else if (narrow() && tocOpen) setTocOpen(false)
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [pageIndex, count, editing, video, clean, panelOpen, tocOpen, onPage, bookmarksOpen, statsOpen, offlineOpen, hotspotEditing, focusMode])

  function readPage() {
    if (!page) return
    const [first, ...remaining] = sortedItems
    if (!first) return
    pageAudio.stop()
    playback.play(first, remaining)
  }
  function playItem(item: ReaderItem) {
    pageAudio.stop()
    playback.play(item)
    setLearningTab('words')
    if (!narrow()) setPanelOpen(true)
  }
  function previewItem(item: ReaderItem) {
    pageAudio.stop()
    playback.play(item)
  }
  function playSequence(items: ReaderItem[]) {
    const [first, ...remaining] = items
    if (!first) return
    pageAudio.stop()
    playback.play(first, remaining)
  }
  function recordItem(item: ReaderItem) {
    previewItem(item)
    setLearningTab('record')
    if (!narrow()) setPanelOpen(true)
  }
  function togglePoint() {
    pageAudio.stop()
    playback.toggle(selected)
  }
  function toggleResource(resource: ReaderResource) {
    playback.stop()
    pageAudio.toggle(resource)
  }
  function openVideo(resource: ReaderResource) {
    playback.stop()
    pageAudio.stop()
    setVideo(resource)
  }
  function skipPoint(direction: -1 | 1) {
    if (!sortedItems.length) return
    const index = pointIndex < 0 ? (direction > 0 ? 0 : sortedItems.length - 1) : Math.max(0, Math.min(sortedItems.length - 1, pointIndex + direction))
    const next = sortedItems[index]
    if (next && next.id !== selected?.id) playItem(next)
  }
  function toggleToc() {
    const next = !tocOpen
    setTocOpen(next)
    if (next && narrow()) setPanelOpen(false)
  }
  function togglePanel() {
    const next = !panelOpen
    setPanelOpen(next)
    if (next && narrow()) setTocOpen(false)
  }
  function enterClean() {
    setVideo(null)
    setBookmarksOpen(false)
    setStatsOpen(false)
    setOfflineOpen(false)
    setHotspotEditing(false)
    setFocusMode(false)
    setClean(true)
  }
  function selectTocPage(target: number) {
    onPage(target - 1)
    if (narrow()) setTocOpen(false)
  }
  async function leave(action: () => void) {
    pageAudio.stop()
    playback.stop()
    setVideo(null)
    await fullscreen.leave()
    action()
  }
  async function save() {
    if (saving) return
    setSaving(true)
    setSaveError('')
    try {
      await onSaveTranslation(draft)
      setEditing(false)
    } catch {
      setSaveError('保存失败，请重试。')
    } finally {
      setSaving(false)
    }
  }
  function openTranslation() {
    if (!teacher) {
      setTeacherModeOpen(true)
      return
    }
    setDraft(translation ?? '')
    setEditing(true)
    setSaveError('')
  }
  function requestTeacherMode() {
    if (teacher) {
      setTeacherMode(false)
      return
    }
    setTeacherModeOpen(true)
  }
  function beginHotspots() {
    if (!page) return
    if (!teacher) {
      setTeacherModeOpen(true)
      return
    }
    pageAudio.stop()
    playback.stop()
    setDraftItems(page.items.map(item => ({ ...item, rects: item.rects.map(rect => [...rect]) })))
    setEditorSelectedId(page.items[0]?.id)
    setHotspotEditing(true)
    setFocusMode(false)
    setRegions(true)
    setVideo(null)
  }
  function cancelHotspots() {
    setHotspotEditing(false)
    setDraftItems([])
    setEditorSelectedId(undefined)
  }
  function createHotspot(rect: [number, number, number, number]) {
    if (!page) return
    const order = draftItems.reduce((max, item) => Math.max(max, item.order), 0) + 1
    const item: ReaderItem = {
      id: `p${String(page.page).padStart(3, '0')}_custom_${Date.now()}`,
      text: '新词条',
      translation: '',
      order,
      rects: [rect],
      audio: pageAudios[0]?.src,
      audioStart: 0,
      audioEnd: 5,
    }
    setDraftItems(rows => [...rows, item])
    setEditorSelectedId(item.id)
  }
  function changeHotspot(patch: Partial<ReaderItem>) {
    setDraftItems(rows => rows.map(item => item.id === editorSelectedId ? { ...item, ...patch } : item))
  }
  function deleteHotspot() {
    setDraftItems(rows => {
      const next = rows.filter(item => item.id !== editorSelectedId)
      setEditorSelectedId(next[0]?.id)
      return next
    })
  }
  async function saveHotspots() {
    if (!page || savingItems) return
    setSavingItems(true)
    try {
      await onSaveItems(page.page, draftItems)
      setHotspotEditing(false)
      setDraftItems([])
    } finally {
      setSavingItems(false)
    }
  }
  function exportPageItems() {
    if (!page) return
    downloadJson(`${book.id}-page-${page.page}-items.json`, { [page.page]: draftItems })
  }
  function exportAllItems() {
    const data: Record<string, ReaderItem[]> = {}
    for (const row of book.manifest.pages) {
      if (row.items.length) data[row.page] = row.page === page?.page && hotspotEditing ? draftItems : row.items
    }
    downloadJson(`${book.id}-items.json`, data)
  }
  function quizResult(item: ReaderItem, kind: QuizQuestion['kind'], correct: boolean) {
    recordWordResult({ bookId: book.id, page: pageIndex, item, kind, correct })
  }
  function recordingSaved(item: ReaderItem, score?: number) {
    recordRecordingResult({ bookId: book.id, page: pageIndex, item, score })
  }
  function beforeRecord() {
    pageAudio.stop()
    playback.stop()
    setVideo(null)
  }
  function toggleCurrentBookmark() {
    toggleBookmark(book.id, pageIndex, String(pageNumber))
  }

  const pointActive = !pageAudio.activeResource && playback.status !== 'idle'
  const dockState: MediaDockState | null = pageAudio.activeResource ? {
    kind: 'page',
    title: pageAudio.activeResource.title,
    subtitle: pageAudio.activeResource.subtitle || `第 ${pageNumber} 页 · 本页音频`,
    playing: pageAudio.playing,
    current: pageAudio.current,
    duration: pageAudio.duration,
    rate: pageAudio.rate,
    loop: pageAudio.loop,
    volume: pageAudio.volume,
    muted: pageAudio.muted,
    error: pageAudio.error,
    canPrev: pageAudioIndex > 0,
    canNext: pageAudioIndex >= 0 && pageAudioIndex < pageAudios.length - 1,
  } : pointActive ? {
    kind: 'point',
    title: selected?.text ?? '点读',
    subtitle: playback.source || '教材音频',
    playing: playback.status === 'playing' || playback.status === 'loading',
    current: playback.current,
    duration: playback.duration,
    rate: speed,
    loop: repeat === 0,
    volume: playback.volume,
    muted: playback.muted,
    error: playback.error,
    canPrev: sortedItems.length > 0 && pointIndex !== 0,
    canNext: sortedItems.length > 0 && pointIndex < sortedItems.length - 1,
  } : null
  const dock = dockState && <MediaDock
    state={dockState}
    onToggle={pageAudio.activeResource ? () => { const resource = pageAudio.activeResource; if (resource) pageAudio.toggle(resource) } : togglePoint}
    onSeek={pageAudio.activeResource ? pageAudio.seek : playback.seek}
    onRate={pageAudio.activeResource ? pageAudio.setRate : onSpeed}
    onLoop={pageAudio.activeResource ? () => pageAudio.setLoop(!pageAudio.loop) : () => onRepeat(repeat === 0 ? 1 : 0)}
    onVolume={pageAudio.activeResource ? pageAudio.setVolume : playback.setVolume}
    onMute={pageAudio.activeResource ? pageAudio.toggleMute : playback.toggleMute}
    onPrev={pageAudio.activeResource ? () => pageAudio.skip(-1) : () => skipPoint(-1)}
    onNext={pageAudio.activeResource ? () => pageAudio.skip(1) : () => skipPoint(1)}
    onClose={pageAudio.activeResource ? pageAudio.stop : playback.stop}
  />

  return <section ref={fullscreen.ref} className={`reading-shell local-reading${fullscreen.expanded ? ' reading-expanded' : ''}${clean ? ' reading-clean' : ''}`}>
    {!clean && <ReaderTopBar
      title={book.manifest.title}
      section={section}
      pageLabel={pageNumber}
      pageCount={count}
      tocAvailable={tocEntries.length > 0}
      tocOpen={tocOpen}
      onToc={toggleToc}
      panelAvailable={hasLearning}
      panelOpen={panelOpen}
      onPanel={togglePanel}
      dictationAvailable={!book.remote}
      onDictation={() => void leave(onDictation)}
      teacherMode={teacher}
      onTeacherMode={requestTeacherMode}
      onBack={() => void leave(onBack)}
      profile={profile}
      profiles={learning.profiles}
      onProfile={setActiveProfile}
      bookmarked={bookmarked}
      onToggleBookmark={toggleCurrentBookmark}
      onBookmarks={() => setBookmarksOpen(true)}
      onStats={() => setStatsOpen(true)}
      onOffline={() => setOfflineOpen(true)}
    />}
    <div className="reading-workspace">
      {!clean && tocEntries.length > 0 && (tocOpen
        ? <BookToc entries={tocEntries} bookTitle={book.manifest.title} currentPage={page?.page ?? pageIndex + 1} onSelect={selectTocPage} onClose={() => setTocOpen(false)}/>
        : <aside className="reading-mini-rail" aria-label="阅读导航">
          <button className="reading-mini-button" aria-label="书籍目录" aria-expanded={false} aria-controls="reading-book-toc" title="打开书籍目录" onClick={toggleToc}><List size={19}/><span>目录</span></button>
        </aside>)}
      <div className="reading-stage" ref={stage}>
        <span className="sr-only" aria-live="polite">第 {pageNumber} 页，共 {count} 页</span>
        <div className="reading-scroll" ref={scroll}>
          <div className="reading-scroll-content">{surfacePage ? <ReaderPageSurface
            source={book.assets['source.pdf']}
            imageSrc={imageSrc}
            page={surfacePage}
            size={size}
            fit={fit}
            zoom={focusRect ? Math.max(zoom, 2.15) : zoom}
            selectedId={hotspotEditing ? editorSelectedId : selected?.id}
            showRegions={regions || hotspotEditing}
            focusRect={focusRect}
            editing={hotspotEditing}
            onCreateRect={createHotspot}
            onPlay={previewItem}
            onPrev={() => onPage(pageIndex - 1)}
            onNext={() => onPage(pageIndex + 1)}
            canPrev={pageIndex > 0}
            canNext={pageIndex < count - 1}
          /> : <div className="reading-page-status">这本教材暂无页面。</div>}</div>
        </div>
        {!clean && <ReadingViewTools
          fit={fit}
          zoom={zoom}
          regions={regions}
          hasItems={hasItems || hotspotEditing}
          focus={focusMode}
          focusAvailable={hasItems}
          editing={hotspotEditing}
          fullscreen={fullscreen.expanded}
          admin={teacher}
          onFit={setFit}
          onZoom={setZoom}
          onRegions={() => setRegions(value => !value)}
          onFocus={() => setFocusMode(value => !value)}
          onClean={enterClean}
          onFullscreen={() => void fullscreen.toggle()}
          onEditHotspots={() => hotspotEditing ? cancelHotspots() : beginHotspots()}
        />}
        {hotspotEditing && <HotspotEditor
          pageNumber={pageNumber}
          items={draftItems}
          selectedId={editorSelectedId}
          audioResources={pageAudios}
          saving={savingItems}
          onSelect={item => setEditorSelectedId(item.id)}
          onChange={changeHotspot}
          onDelete={deleteHotspot}
          onSave={() => void saveHotspots()}
          onCancel={cancelHotspots}
          onExportPage={exportPageItems}
          onExportAll={exportAllItems}
        />}
      </div>
      {!clean && panelOpen && <LearningPanel
        key={`${book.id}:${profile}`}
        page={page}
        pageNumber={pageNumber}
        pageIndex={pageIndex}
        bookId={book.id}
        profile={profile}
        pool={pool}
        labelForPage={labelForPage}
        nextPage={nextPage}
        dueCount={dueCount}
        tab={learningTab}
        onTab={setLearningTab}
        admin={teacher}
        selected={selected}
        translation={translation}
        translating={translating}
        translationMessage={translationMessage}
        repeat={repeat}
        speed={speed}
        playback={playback}
        pageAudio={pageAudio}
        onTogglePlayback={togglePoint}
        onToggleResource={toggleResource}
        onOpenVideo={openVideo}
        onPlayItem={playItem}
        onPreviewItem={previewItem}
        onPlaySequence={playSequence}
        onRecordItem={recordItem}
        onQuizResult={quizResult}
        onRecordingSaved={recordingSaved}
        onReadPage={readPage}
        onRepeat={onRepeat}
        onSpeed={onSpeed}
        onEdit={openTranslation}
        onPrevPage={() => onPage(pageIndex - 1)}
        onNextPage={() => onPage(pageIndex + 1)}
        canPrevPage={pageIndex > 0}
        canNextPage={pageIndex < count - 1}
        onGoPage={onPage}
        onBeforeRecord={beforeRecord}
        onClose={() => setPanelOpen(false)}
      />}
    </div>
    {!clean && dock}
    {clean && <div className="reading-clean-tools">
      <button className="reading-clean-exit" aria-label="退出纯净阅读" title="退出纯净阅读" onClick={() => setClean(false)}><X size={16}/><span>退出纯读</span></button>
      {dockState && <button className="reading-clean-audio" aria-label={dockState.playing ? '暂停' : '播放'} title={dockState.title} onClick={pageAudio.activeResource ? () => { const resource = pageAudio.activeResource; if (resource) pageAudio.toggle(resource) } : togglePoint}>{dockState.playing ? <Pause size={17}/> : <Play size={17}/>}</button>}
    </div>}
    {video && <PageVideoDialog video={video} onClose={() => setVideo(null)}/>}
    {bookmarksOpen && <BookmarksDialog bookId={book.id} page={pageIndex} label={String(pageNumber)} section={section} onGoPage={onPage} onClose={() => setBookmarksOpen(false)}/>}
    {statsOpen && <StatsDialog bookId={book.id} bookTitle={book.manifest.title} pageLabel={pageNumber} pageCount={count} pool={pool} onPlay={previewItem} onClose={() => setStatsOpen(false)}/>}
    {offlineOpen && <OfflineDialog book={book} onClose={() => setOfflineOpen(false)}/>}
    {teacherModeOpen && <TeacherModeDialog onClose={() => setTeacherModeOpen(false)}/>}
    {editing && <div className="reading-dialog-backdrop"><section className="reading-translation-dialog" role="dialog" aria-modal="true" aria-labelledby="reader-translation-title"><button aria-label="关闭翻译编辑" className="reading-dialog-close" disabled={saving} onClick={() => setEditing(false)}><X size={21}/></button><h2 id="reader-translation-title">编辑中文释义</h2><p>{selected?.text}</p><textarea aria-label="中文翻译" value={draft} onChange={event => setDraft(event.target.value)} autoFocus/>{saveError && <p role="alert">{saveError}</p>}<div><button disabled={saving} onClick={() => setEditing(false)}>取消</button><button className="reading-page-play" disabled={saving} onClick={() => void save()}>{saving ? '正在保存…' : '保存翻译'}</button></div></section></div>}
  </section>
}
