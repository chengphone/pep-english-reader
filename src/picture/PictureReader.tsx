import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Headphones, Info, Maximize2, Mic, Minimize2, PanelRightClose, PanelRightOpen, Pause, Play, Repeat, Square, Trash2, Volume2 } from 'lucide-react'
import './PictureReader.css'
import type { PictureBook, PictureCatalogEntry, PictureMode, PictureSentence } from '../pictureBooks'
import { hasComprehension, loadPictureBook, markPicturePageComplete, readPictureProgress, writePictureProgress } from '../pictureBooks'
import { useLearningState } from '../reader/learningStore'
import { deleteRecording, latestRecording, readRecording, saveRecording, type RecordingMeta } from '../reader/recordingStore'
import { checkPictureOffline, savePictureOffline, type PictureOfflineState } from './offlinePicture'
import { locateWord } from './wordLocator'
import { zoomScrollTarget } from './zoomScroll'

const MODE_INFO: Record<PictureMode, { label: string; hint: string; detail: string }> = {
  listen: { label: '听故事', hint: '整集原声', detail: '播放本集完整原声；有已对齐的逐句时间戳时自动高亮当前句，并可用“跟随”自动翻到该句所在跨页。' },
  self: { label: '自己读', hint: '逐句高亮', detail: '点击书页上的句子或右侧列表，回放该句在整集原声中的片段并高亮；不会用合成的声音代替原音。' },
  practice: { label: '跟读', hint: '录音比较', detail: '先点句子听原声，再选中句子录音。只有你主动点击并允许麦克风时才开始录音，录音保存在本机。' },
}
const LEVELS: Record<string, string> = { starter: '启蒙', beginner: '入门', elementary: '初级', intermediate: '进阶' }

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function PictureReader({
  entry,
  initialPage,
  initialMode,
  nextEntry,
  onNextEpisode,
  onBack,
  onQuiz,
  onPositionChange,
}: {
  entry: PictureCatalogEntry
  initialPage: number
  initialMode?: PictureMode
  nextEntry?: PictureCatalogEntry
  onNextEpisode?: () => void
  onBack: () => void
  onQuiz: (mode: 'comprehension' | 'vocabulary') => void
  onPositionChange?: (page: number, mode: PictureMode) => void
}) {
  const learning = useLearningState()
  const profile = learning.active
  const [book, setBook] = useState<PictureBook | null>(null)
  const [error, setError] = useState('')
  const [pageIndex, setPageIndex] = useState(Math.max(0, initialPage))
  const [mode, setMode] = useState<PictureMode>('listen')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [followAudio, setFollowAudio] = useState(true)
  const [wordsOpen, setWordsOpen] = useState(false)
  const [speakingWord, setSpeakingWord] = useState('')
  const [wordError, setWordError] = useState('')
  const [wordLocateNote, setWordLocateNote] = useState('')
  const [zoomed, setZoomed] = useState(false)
  // 桌面端可以把右侧工具收起来，给课本留出完整宽度；手机端面板在正文下方，
  // 该开关由 CSS 隐藏，不影响手机布局。
  const [panelOpen, setPanelOpen] = useState(() => {
    try { return localStorage.getItem('pep:picture-panel:v1') !== 'closed' } catch { return true }
  })
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'saving'>('idle')
  const [recordError, setRecordError] = useState('')
  const [recordingUrl, setRecordingUrl] = useState('')
  const [recordingMeta, setRecordingMeta] = useState<RecordingMeta | null>(null)
  const [recordingVersion, setRecordingVersion] = useState(0)
  const [completionTick, setCompletionTick] = useState(0)
  const [offline, setOffline] = useState<PictureOfflineState | null>(null)
  const [offlineSaving, setOfflineSaving] = useState(false)
  const [offlineError, setOfflineError] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const sentenceStopRef = useRef<{ end: number; id: string } | null>(null)
  const pendingSentenceRef = useRef<{ start: number } | null>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const recordingAudioRef = useRef<HTMLAudioElement>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordStart = useRef(0)
  const wordTimerRef = useRef<number | null>(null)
  const wordRequestRef = useRef(0)
  const mountedRef = useRef(true)
  const recordStartingRef = useRef(false)
  const recordRequestRef = useRef(0)

  useEffect(() => {
    try { localStorage.setItem('pep:picture-panel:v1', panelOpen ? 'open' : 'closed') } catch { /* 隐私模式只保留本次状态 */ }
  }, [panelOpen])

  useEffect(() => {
    let live = true
    setBook(null)
    setError('')
    setAudioError('')
    setAudioPlaying(false)
    sentenceStopRef.current = null
    pendingSentenceRef.current = null
    setCurrentTime(0)
    setDuration(0)
    loadPictureBook(entry).then(next => {
      if (!live) return
      setBook(next)
      const saved = readPictureProgress(next.id, profile)
      const target = clamp(initialPage, 0, next.manifest.pages.length - 1)
      setPageIndex(target)
      setMode(initialMode ?? saved?.mode ?? 'listen')
      setSelectedId(next.manifest.pages[target]?.sentences[0]?.id ?? null)
    }).catch(reason => {
      if (live) setError(reason instanceof Error ? reason.message : '绘本加载失败，请检查本地服务器。')
    })
    return () => { live = false }
  }, [entry, initialPage, initialMode, profile])

  const page = book?.manifest.pages[clamp(pageIndex, 0, Math.max(0, (book?.manifest.pages.length ?? 1) - 1))]
  const selected = page?.sentences.find(sentence => sentence.id === selectedId) ?? null
  const lastPage = (book?.manifest.pages.length ?? 1) - 1
  const [completed, setCompleted] = useState(false)
  const vocabulary = book?.manifest.vocabulary ?? []
  const shownWords = wordsOpen ? vocabulary : vocabulary.slice(0, 8)
  const timeline = useMemo(() => {
    if (!book) return []
    const rows: { id: string; pageIndex: number; start: number }[] = []
    for (const [index, row] of book.manifest.pages.entries()) {
      for (const sentence of row.sentences) {
        if (Number.isFinite(sentence.start)) rows.push({ id: sentence.id, pageIndex: index, start: sentence.start as number })
      }
    }
    return rows.sort((left, right) => left.start - right.start)
  }, [book])
  const hasTimestamps = timeline.length > 0
  const pageHasTimestamps = page?.sentences.some(sentence => typeof sentence.start === 'number') ?? false

  useEffect(() => {
    if (!book) return
    let live = true
    setOffline(null)
    setOfflineError('')
    void checkPictureOffline(book).then(state => { if (live) setOffline(state) })
    return () => { live = false }
  }, [book?.id, book?.manifestUrl])

  useEffect(() => {
    if (!book) return
    writePictureProgress(book.id, profile, { pageIndex, mode })
    // 把当前位置写回地址栏，刷新或分享链接时能回到同一跨页和模式。
    onPositionChange?.(pageIndex, mode)
  }, [book?.id, pageIndex, mode, profile])

  useEffect(() => {
    if (!book) return
    const current = book.manifest.pages[pageIndex]
    setSelectedId(previous => current?.sentences.some(sentence => sentence.id === previous) ? previous : current?.sentences[0]?.id ?? null)
    setRecordError('')
  }, [book?.id, pageIndex])

  // 手机端放大后一次只显示跨页的一部分。音频跟随切换句子或跨页时，把横向
  // 滚动对准当前句的整体范围，否则跨中线的句子会被屏幕边缘裁掉一半。
  // 电脑端放大按整页宽度显示，不需要横向滚动，这里自然退化为无操作。
  useEffect(() => {
    if (!zoomed) return
    const paper = paperRef.current
    const canvas = paper?.querySelector<HTMLElement>('.pbook-canvas')
    if (!paper || !canvas) return
    const rects = page?.sentences.find(item => item.id === selectedId)?.rects ?? []
    const target = zoomScrollTarget(rects, canvas.offsetWidth, canvas.offsetLeft, paper.clientWidth, paper.scrollWidth - paper.clientWidth)
    if (target === undefined) return
    if (Math.abs(paper.scrollLeft - target) < 8) return
    paper.scrollTo({ left: target, behavior: 'smooth' })
  }, [zoomed, pageIndex, selectedId, book?.id])

  // 预取下一张跨页图，翻页时直接命中缓存。
  useEffect(() => {
    const next = book?.manifest.pages[pageIndex + 1]
    if (!next?.image) return
    const image = new Image()
    image.decoding = 'async'
    image.src = next.image
  }, [book?.id, pageIndex])

  useEffect(() => {
    if (!book) { setCompleted(false); return }
    setCompleted(readPictureProgress(book.id, profile)?.completedPages.includes(pageIndex) ?? false)
  }, [book?.id, pageIndex, profile, completionTick])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.playbackRate = speed
    audio.loop = loop
  }, [speed, loop, book?.manifest.audio])

  // timeupdate 大约每秒只触发 4 次，可能多播到下一句开头；播放时再用
  // requestAnimationFrame 精确盯住句末，后台标签页仍由 timeupdate 兜底。
  useEffect(() => {
    if (!audioPlaying) return
    let frame = 0
    const tick = () => {
      const audio = audioRef.current
      const stop = sentenceStopRef.current
      if (audio && stop && audio.currentTime >= stop.end - 0.02) {
        sentenceStopRef.current = null
        audio.pause()
        setCurrentTime(stop.end)
        setSelectedId(stop.id)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [audioPlaying])

  useEffect(() => {
    if (!book || !selected || mode !== 'practice') return
    let live = true
    let url = ''
    setRecordingUrl('')
    setRecordingMeta(null)
    const meta = latestRecording(profile, book.id, selected.id)
    if (!meta) return
    setRecordingMeta(meta)
    void readRecording(meta.id).then(blob => {
      if (!live || !blob) return
      url = URL.createObjectURL(blob)
      setRecordingUrl(url)
    }).catch(() => { if (live) setRecordError('录音读取失败，可以重新录制。') })
    return () => { live = false; if (url) URL.revokeObjectURL(url) }
  }, [book?.id, selected?.id, mode, profile, recordingVersion])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      recordRequestRef.current++
      recordStartingRef.current = false
      if (mediaRef.current?.state === 'recording') mediaRef.current.stop()
      streamRef.current?.getTracks().forEach(track => track.stop())
      cancelWordSpeech()
    }
  }, [])

  function cancelWordSpeech() {
    wordRequestRef.current++
    if (wordTimerRef.current) {
      window.clearTimeout(wordTimerRef.current)
      wordTimerRef.current = null
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  function cancelPendingRecording() {
    recordRequestRef.current++
    recordStartingRef.current = false
  }

  function changeMode(next: PictureMode) {
    setMode(next)
    sentenceStopRef.current = null
    pendingSentenceRef.current = null
    cancelPendingRecording()
    if (next !== 'listen') audioRef.current?.pause()
    if (next !== 'practice') stopRecording()
  }

  function goPage(next: number) {
    if (!book) return
    cancelPendingRecording()
    stopRecording()
    if (audioRef.current && !audioRef.current.paused) setFollowAudio(false)
    setPageIndex(clamp(next, 0, lastPage))
    setRecordError('')
  }

  function toggleZoom() {
    const next = !zoomed
    setZoomed(next)
    // 电脑端放大时收起右侧工具，让课本占满整行；手机上该开关不可见。
    if (next && window.matchMedia('(min-width: 981px)').matches) setPanelOpen(false)
  }

  function toggleAudio() {
    const audio = audioRef.current
    if (!audio) return
    sentenceStopRef.current = null
    pendingSentenceRef.current = null
    if (audio.paused) {
      setAudioError('')
      // 整集播完后直接点播放时，从开头重新播放，而不是停在结尾。
      if (audio.ended || (Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration - 0.05)) {
        try { audio.currentTime = 0 } catch { /* 忽略 */ }
        setCurrentTime(0)
      }
      void audio.play().catch(() => setAudioError('整集音频无法播放，请检查本地服务器或音频文件。'))
    } else audio.pause()
  }

  // 绘本没有逐句音频文件，但清单里有已校对的逐句时间戳。点句子时从整集
  // 原声里定位到该句并只播这一段，播完自动暂停；没有时间戳时只选中。
  function selectSentence(sentence: PictureSentence) {
    setSelectedId(sentence.id)
    cancelWordSpeech()
    setSpeakingWord('')
    cancelPendingRecording()
    if (recordingState === 'recording') stopRecording()
    recordingAudioRef.current?.pause()
    const audio = audioRef.current
    if (!audio) return
    const start = sentence.start
    if (typeof start !== 'number' || !Number.isFinite(start)) return
    const nextStart = timeline.find(row => row.start > start)?.start
    const end = typeof sentence.end === 'number' && Number.isFinite(sentence.end) && sentence.end > start
      ? sentence.end
      : nextStart
    sentenceStopRef.current = typeof end === 'number' && end > start ? { end, id: sentence.id } : null
    setAudioError('')
    if (audio.readyState >= 1) {
      pendingSentenceRef.current = null
      try { audio.currentTime = start } catch { pendingSentenceRef.current = { start } }
    } else {
      pendingSentenceRef.current = { start }
    }
    void audio.play().catch(() => setAudioError('整集音频无法播放，请检查本地服务器或音频文件。'))
  }

  function syncToTime(value: number) {
    if (!timeline.length) return
    let active: (typeof timeline)[number] | null = null
    for (const row of timeline) {
      if (row.start > value + 0.08) break
      active = row
    }
    if (!active) return
    const target = active
    setSelectedId(previous => previous === target.id ? previous : target.id)
    // 跟随是用户显式开关，不再限制在“听故事”模式；整集音频播放时
    // 其他模式同样需要翻到当前句所在跨页。
    if (followAudio && target.pageIndex !== pageIndex) setPageIndex(target.pageIndex)
  }

  function handleTimeUpdate(event: SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget
    const time = audio.currentTime
    const stop = sentenceStopRef.current
    if (stop && time >= stop.end - 0.02) {
      sentenceStopRef.current = null
      audio.pause()
      setCurrentTime(stop.end)
      setSelectedId(stop.id)
      return
    }
    setCurrentTime(time)
    syncToTime(time)
  }

  function seek(value: number) {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(value)) return
    sentenceStopRef.current = null
    pendingSentenceRef.current = null
    audio.currentTime = value
    setCurrentTime(value)
    syncToTime(value)
  }

  async function startRecording() {
    if (!book || !selected || recordingState !== 'idle' || recordStartingRef.current) return
    setRecordError('')
    if (!window.isSecureContext) {
      setRecordError('当前页面不是安全上下文，浏览器不允许录音。请使用 localhost 或 HTTPS。')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordError('当前浏览器不支持录音。你仍然可以听原音和阅读。')
      return
    }
    recordStartingRef.current = true
    const requestId = ++recordRequestRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // 权限弹窗可能停留很久；期间翻页、切换模式或离开页面时不要再开始录音。
      if (!mountedRef.current || requestId !== recordRequestRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      streamRef.current = stream
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream)
      mediaRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const durationSeconds = (Date.now() - recordStart.current) / 1000
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
        mediaRef.current = null
        void saveRecording({
          profile,
          bookId: book.id,
          itemId: selected.id,
          text: selected.text,
          duration: durationSeconds,
          mime: blob.type || 'audio/webm',
          blob,
        }).then(() => {
          setRecordingState('idle')
          setRecordingVersion(value => value + 1)
        }).catch(() => {
          setRecordingState('idle')
          setRecordError('录音保存失败；本次录音没有上传到任何服务器。')
        })
      }
      audioRef.current?.pause()
      recordStart.current = Date.now()
      recorder.start()
      setRecordingState('recording')
    } catch {
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
      setRecordingState('idle')
      setRecordError('无法使用麦克风。请检查浏览器权限；拒绝授权时不会上传任何声音。')
    } finally {
      if (requestId === recordRequestRef.current) recordStartingRef.current = false
    }
  }

  function stopRecording() {
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.stop()
      setRecordingState('saving')
    }
  }

  function removeRecording() {
    if (!recordingMeta) return
    void deleteRecording(recordingMeta.id).catch(() => {})
    setRecordingMeta(null)
    setRecordingUrl('')
    setRecordingVersion(value => value + 1)
  }

  async function saveOffline() {
    if (!book || offlineSaving) return
    setOfflineSaving(true)
    setOfflineError('')
    try {
      const state = await savePictureOffline(book, setOffline)
      setOffline(state)
      if (!state.complete) setOfflineError('部分文件没有保存成功，请确认本地服务器仍在运行后再试。')
    } catch {
      setOfflineError('离线保存失败，请检查浏览器存储空间或重新打开页面。')
    } finally {
      setOfflineSaving(false)
    }
  }

  function focusWord(word: string) {
    if (!book) return
    cancelPendingRecording()
    stopRecording()
    cancelWordSpeech()
    setSpeakingWord('')
    setWordLocateNote('')
    // 生词是词典原形，正文可能是 folded / steeper / untying 等形式，
    // 所以用词形展开和短语匹配来定位，而不是直接搜字符串。
    const found = locateWord(book.manifest.pages, word)
    if (!found) {
      setSelectedId(null)
      setWordLocateNote(`故事正文没有出现“${word}”，无法在页面中定位。`)
      return
    }
    if (found.pageIndex !== pageIndex) setPageIndex(found.pageIndex)
    setSelectedId(found.sentenceId)
  }

  function speakWord(word: string) {
    if (!('speechSynthesis' in window)) {
      setWordError('当前浏览器不支持语音合成，请使用系统语音包或换一个浏览器。')
      return
    }
    audioRef.current?.pause()
    cancelPendingRecording()
    stopRecording()
    cancelWordSpeech()
    const requestId = ++wordRequestRef.current
    const utterance = new SpeechSynthesisUtterance(word)
    utterance.lang = 'en-US'
    utterance.rate = 0.85
    const voices = window.speechSynthesis.getVoices()
    utterance.voice = voices.find(voice => /^en(-|_)/i.test(voice.lang) && /Samantha|Aria|Jenny|Google US English/i.test(voice.name))
      ?? voices.find(voice => /^en(-|_)/i.test(voice.lang))
      ?? null
    let finished = false
    const timeout = window.setTimeout(() => {
      if (finished || requestId !== wordRequestRef.current) return
      finished = true
      wordTimerRef.current = null
      window.speechSynthesis.cancel()
      setSpeakingWord(current => current === word ? '' : current)
      if (!voices.length) setWordError('系统没有可用的英语语音包；请先在系统中安装英语语音。')
    }, 5000)
    wordTimerRef.current = timeout
    utterance.onend = () => {
      finished = true
      window.clearTimeout(timeout)
      if (wordTimerRef.current === timeout) wordTimerRef.current = null
      if (requestId !== wordRequestRef.current) return
      setSpeakingWord(current => current === word ? '' : current)
    }
    utterance.onerror = event => {
      if (event.error === 'canceled' || event.error === 'interrupted') return
      finished = true
      window.clearTimeout(timeout)
      if (wordTimerRef.current === timeout) wordTimerRef.current = null
      if (requestId !== wordRequestRef.current) return
      setSpeakingWord(current => current === word ? '' : current)
      setWordError(voices.length ? '单词朗读失败，请检查系统的英语语音包。' : '系统没有可用的英语语音包；请先在系统中安装英语语音。')
    }
    setWordError('')
    setSpeakingWord(word)
    window.speechSynthesis.speak(utterance)
  }

  if (error) return <div className="picture-reader pbook-error">
    <div className="pbook-topbar"><button type="button" className="pbook-back" onClick={onBack}><ArrowLeft size={17}/>返回绘本馆</button></div>
    <div className="pbook-error-card"><BookOpen size={30}/><h1>无法打开绘本</h1><p>{error}</p><button type="button" className="page-hero-action" onClick={onBack}>返回绘本馆</button></div>
  </div>

  if (!book) return <div className="picture-reader">
    <div className="pbook-topbar"><button type="button" className="pbook-back" onClick={onBack}><ArrowLeft size={17}/>返回绘本馆</button></div>
    <div className="pbook-loading"><span className="pbook-spinner" aria-hidden="true"/><p>正在读取绘本…</p></div>
  </div>

  return <div className="picture-reader">
    <header className="pbook-topbar">
      <button type="button" className="pbook-back" onClick={onBack}><ArrowLeft size={17}/><span>返回绘本馆</span></button>
      <div className="pbook-title">
        <strong>{book.manifest.title}</strong>
        <small>第 {book.manifest.episode} 集 · {book.manifest.levelLabel || LEVELS[book.manifest.level]} · {book.manifest.series}</small>
      </div>
      <div className="pbook-position">
        <span>第 {pageIndex + 1} / {book.manifest.pages.length} 个跨页</span>
        <div className="pbook-position-track" aria-hidden="true"><i style={{ width: `${Math.round((pageIndex + 1) / book.manifest.pages.length * 100)}%` }}/></div>
      </div>
      <button
        type="button"
        className="pbook-next-episode"
        disabled={!nextEntry}
        onClick={onNextEpisode}
        title={nextEntry ? `下一集：第 ${nextEntry.episode} 集 · ${nextEntry.title}` : '已经是最后一集'}
        aria-label={nextEntry ? `下一集：第 ${nextEntry.episode} 集 ${nextEntry.title}` : '已经是最后一集'}
      >
        <span>下一集</span><ChevronRight size={16}/>
      </button>
      <button
        type="button"
        className="pbook-panel-toggle"
        aria-pressed={!panelOpen}
        aria-label={panelOpen ? '收起阅读工具' : '展开阅读工具'}
        title={panelOpen ? '收起右侧阅读工具，给课本更多空间' : '展开右侧阅读工具'}
        onClick={() => setPanelOpen(value => !value)}
      >
        {panelOpen ? <PanelRightClose size={15}/> : <PanelRightOpen size={15}/>}
        <span>{panelOpen ? '收起工具' : '阅读工具'}</span>
      </button>
    </header>

    <main className={`pbook-layout${panelOpen ? '' : ' is-panel-collapsed'}${zoomed ? ' is-zoomed' : ''}`}>
      <section className="pbook-stage" aria-label="绘本阅读区">
        <div ref={paperRef} className={`pbook-paper${zoomed ? ' is-zoomed' : ''}`}>
          <div className="pbook-canvas">
            {page && <>
              <img src={page.image} alt={`第 ${page.displayPage} 页原版绘本跨页`} draggable={false} fetchPriority="high" decoding="async"/>
              <div className="pbook-hotspots" aria-hidden="false">
                {page.sentences.map(sentence => <span key={sentence.id} className="pbook-sentence-overlay">
                  {sentence.rects.map((rect, index) => <button
                    key={`${sentence.id}-${index}`}
                    type="button"
                    className={`pbook-hotspot${selectedId === sentence.id ? ' is-selected' : ''}`}
                    style={{ left: `${rect[0] * 100}%`, top: `${rect[1] * 100}%`, width: `${rect[2] * 100}%`, height: `${rect[3] * 100}%` }}
                    aria-label={`${typeof sentence.start === 'number' ? '朗读' : '选择'}句子：${sentence.text}`}
                    title={sentence.text}
                    onClick={() => selectSentence(sentence)}
                  />)}
                </span>)}
              </div>
            </>}
          </div>
        </div>
        <div className="pbook-pager">
          <button type="button" className="pbook-page-button" aria-label="上一页" disabled={pageIndex <= 0} onClick={() => goPage(pageIndex - 1)}><ChevronLeft size={18}/><span>上一页</span></button>
          <div className="pbook-pager-center">
            <strong>{page?.displayPage ?? ''}</strong>
            <span>{completed ? '已标记读完' : '原版跨页'}</span>
            <div className="pbook-pager-tools">
              <button type="button" className={`pbook-complete${completed ? ' is-done' : ''}`} onClick={() => { if (!book) return; markPicturePageComplete(book.id, profile, pageIndex); setCompleted(true); setCompletionTick(value => value + 1) }}>
                {completed ? <Check size={13}/> : null}{completed ? '本页已读完' : '标记本页读完'}
              </button>
              <button type="button" className="pbook-zoom" aria-pressed={zoomed} aria-label={zoomed ? '缩小绘本页面' : '放大绘本页面'} onClick={toggleZoom}>
                {zoomed ? <Minimize2 size={13}/> : <Maximize2 size={13}/>}<span>{zoomed ? '缩小' : '放大'}</span>
              </button>
            </div>
          </div>
          <button type="button" className="pbook-page-button" aria-label="下一页" disabled={pageIndex >= lastPage} onClick={() => goPage(pageIndex + 1)}><span>下一页</span><ChevronRight size={18}/></button>
        </div>
      </section>

      <aside className="pbook-panel" aria-label="阅读辅助">
        <div className="pbook-player" aria-label="整集音频播放器">
          <div className="pbook-player-head">
            <span className="pbook-player-icon" aria-hidden="true"><Headphones size={17}/></span>
            <span className="pbook-player-title"><strong>整集原声</strong><small title={`第 ${book.manifest.episode} 集 · ${book.manifest.title}`}>第 {book.manifest.episode} 集 · {book.manifest.title}</small></span>
            <div className="pbook-player-actions">
              {hasTimestamps && <button type="button" className="pbook-player-follow" aria-pressed={followAudio} title={followAudio ? '关闭后页面不再跟随音频自动翻页' : '开启后页面跟随音频自动翻到当前句'} onClick={() => setFollowAudio(value => !value)}><BookOpen size={14}/><span>{followAudio ? '跟随中' : '跟随'}</span></button>}
              <button type="button" className="pbook-player-loop" aria-pressed={loop} title="循环整集" onClick={() => setLoop(value => !value)}><Repeat size={15}/><span>循环</span></button>
            </div>
          </div>
          <div className="pbook-player-main">
            <button type="button" className="pbook-player-play" aria-label={audioPlaying ? '暂停整集音频' : '播放整集音频'} onClick={toggleAudio}>
              {audioPlaying ? <Pause size={19}/> : <Play size={19} fill="currentColor"/>}
            </button>
            <span className="pbook-player-time">{formatTime(currentTime)}</span>
            <input className="pbook-player-seek" type="range" min={0} max={Math.max(duration, book.manifest.audioDuration ?? 0, 1)} step={0.1} value={Math.min(currentTime, Math.max(duration, book.manifest.audioDuration ?? 0, 1))} aria-label="音频进度" onChange={event => seek(Number(event.target.value))}/>
            <span className="pbook-player-time">{formatTime(duration || book.manifest.audioDuration || 0)}</span>
            <label className="pbook-player-speed"><span className="sr-only">播放速度</span><select value={speed} onChange={event => setSpeed(Number(event.target.value))} aria-label="播放速度"><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label>
          </div>
          {(!hasTimestamps || !followAudio) && <p className="pbook-player-note"><Info size={13}/>{hasTimestamps ? '“跟随”已关闭，页面不会自动翻页。' : '本集没有经过校对的逐句时间戳；句子高亮由点击控制，不伪造自动同步。'}</p>}
          {audioError && <p className="pbook-player-error" role="alert">{audioError}</p>}
          <audio
            ref={audioRef}
            src={book.manifest.audio}
            preload="metadata"
            onPlay={() => { setAudioPlaying(true); if (!sentenceStopRef.current) syncToTime(audioRef.current?.currentTime ?? 0) }}
            onPause={() => setAudioPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={event => {
              setDuration(event.currentTarget.duration || book.manifest.audioDuration || 0)
              const pending = pendingSentenceRef.current
              if (!pending) return
              pendingSentenceRef.current = null
              try { event.currentTarget.currentTime = pending.start } catch { /* 忽略 */ }
            }}
            onEnded={() => { sentenceStopRef.current = null; setAudioPlaying(false) }}
            onError={() => setAudioError('整集音频加载失败，请检查本地服务器。')}
          />
        </div>
        <div className="pbook-mode-tabs" role="tablist" aria-label="阅读模式">
          {(Object.keys(MODE_INFO) as PictureMode[]).map(value => <button key={value} type="button" role="tab" aria-selected={mode === value} className={mode === value ? 'is-active' : ''} title={MODE_INFO[value].detail} onClick={() => changeMode(value)}>
            <span>{MODE_INFO[value].label}</span><small>{MODE_INFO[value].hint}</small>
          </button>)}
        </div>

        <section className="pbook-offline" aria-label="离线阅读">
          <div className="pbook-offline-copy">
            <strong>离线阅读</strong>
            <small>{!offline
              ? '正在检查本机缓存…'
              : !offline.supported
                ? '当前地址不支持离线缓存；请使用 localhost 或 HTTPS。'
                : offline.complete
                  ? `已保存 ${offline.total} 个文件，可离线打开。`
                  : offline.saved
                    ? `已缓存 ${offline.saved} / ${offline.total} 个文件。`
                    : '把本集页面和整集音频保存到本机。'}</small>
          </div>
          {offline?.supported && !offline.complete && <button type="button" className="pbook-offline-button" disabled={offlineSaving} onClick={() => void saveOffline()}>
            <Download size={13}/>{offlineSaving ? `${offline.saved}/${offline.total}` : '保存到本机'}
          </button>}
          {offline?.complete && <span className="pbook-offline-check"><Check size={13}/>已保存</span>}
        </section>
        {offlineError && <p className="pbook-offline-error" role="alert">{offlineError}</p>}

        <section className="pbook-panel-section" aria-labelledby="pbook-sentences-title">
          <header><h2 id="pbook-sentences-title">本页句子</h2><span>{page?.sentences.length ?? 0} 句{pageHasTimestamps ? ' · 点击朗读' : ''}</span></header>
          <div className="pbook-sentence-list">
            {(page?.sentences ?? []).map((sentence, index) => <button key={sentence.id} type="button" className={`pbook-sentence${selectedId === sentence.id ? ' is-selected' : ''}`} aria-pressed={selectedId === sentence.id} title={typeof sentence.start === 'number' ? '点击朗读这句' : undefined} onClick={() => selectSentence(sentence)}>
              <span className="pbook-sentence-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="pbook-sentence-text">{sentence.text}{sentence.continuedFrom ? <small>接上页 {sentence.continuedFrom}</small> : null}</span>
            </button>)}
            {!page?.sentences.length && <p className="pbook-empty-note">这一页没有可选的文字。</p>}
          </div>
        </section>

        {mode === 'practice' && <section className="pbook-recording" aria-labelledby="pbook-recording-title">
          <header><h2 id="pbook-recording-title">跟读录音</h2><span>本机保存</span></header>
          {!selected && <p className="pbook-empty-note">先选一句再录音。</p>}
          {selected && <>
            <p className="pbook-recording-text">{selected.text}</p>
            <div className="pbook-recording-actions">
              {recordingState === 'recording'
                ? <button type="button" className="pbook-record-button is-recording" onClick={() => stopRecording()}><Square size={15}/>停止录音</button>
                : <button type="button" className="pbook-record-button" disabled={recordingState === 'saving'} onClick={() => void startRecording()}><Mic size={16}/>{recordingState === 'saving' ? '正在保存…' : '录这一句'}</button>}
              {recordingMeta && <button type="button" className="pbook-record-delete" aria-label="删除这句录音" onClick={() => void removeRecording()}><Trash2 size={15}/></button>}
            </div>
            {recordingUrl && <audio ref={recordingAudioRef} className="pbook-recording-audio" controls preload="metadata" src={recordingUrl} onPlay={() => audioRef.current?.pause()}/>}
            {recordingMeta && <p className="pbook-recording-meta">已保存 {formatTime(recordingMeta.duration)} 录音，刷新后仍可回放。</p>}
            {recordError && <p className="pbook-recording-error" role="alert">{recordError}</p>}
            <p className="pbook-recording-note">录音只在你主动点击后开始，存入本机 IndexedDB，不上传服务器。</p>
          </>}
        </section>}

        <details className="pbook-panel-section pbook-words-section" aria-labelledby="pbook-words-title">
          <summary>
            <h2 id="pbook-words-title">本集生词</h2>
            <span>{vocabulary.length} 个</span>
            <ChevronDown size={14} aria-hidden="true"/>
          </summary>
          {vocabulary.length > 0 ? <>
            <div className="pbook-word-list">
              {shownWords.map(word => <div key={word.word} className={`pbook-word${speakingWord === word.word ? ' is-speaking' : ''}`}>
                <button type="button" className="pbook-word-main" title="在故事里定位这个词" onClick={() => focusWord(word.word)}>
                  <strong>{word.word}</strong><span>{word.definition}</span>
                </button>
                <button type="button" className="pbook-word-speak" aria-label={`朗读 ${word.word}`} aria-pressed={speakingWord === word.word} title="朗读单词" onClick={() => speakWord(word.word)}><Volume2 size={14}/></button>
              </div>)}
            </div>
            {wordLocateNote && <p className="pbook-word-locate" role="status">{wordLocateNote}</p>}
            {wordError && <p className="pbook-word-error" role="alert">{wordError}</p>}
            {vocabulary.length > 8 && <button type="button" className="pbook-words-more" onClick={() => setWordsOpen(value => !value)}>{wordsOpen ? '收起生词' : `显示全部 ${vocabulary.length} 个生词`}</button>}
            <p className="pbook-word-note">单词读音由本机系统 TTS 合成，不发送到服务器。</p>
          </> : <p className="pbook-empty-note">这一集没有随书生词表。</p>}
        </details>

        <section className="pbook-quiz-card" aria-labelledby="pbook-quiz-title">
          <header><h2 id="pbook-quiz-title">读完做个小测</h2><span>{hasComprehension(book.manifest) ? '理解题 + 词汇' : '词汇小测'}</span></header>
          <p>{hasComprehension(book.manifest) ? '本集有已校对的故事理解题，也可以只做生词小测。' : '本集暂无已校对的故事理解题，先用随书生词做词汇小测。'}</p>
          <div>
            {hasComprehension(book.manifest) && <button type="button" className="pbook-quiz-primary" onClick={() => onQuiz('comprehension')}>阅读理解<ArrowRight size={15}/></button>}
            <button type="button" className={hasComprehension(book.manifest) ? 'pbook-quiz-secondary' : 'pbook-quiz-primary'} onClick={() => onQuiz('vocabulary')}>词汇小测<ArrowRight size={15}/></button>
          </div>
        </section>
      </aside>
    </main>
  </div>
}
