import { useEffect, useRef, useState } from 'react'
import { Mic, Play, Square, Trash2, Volume2 } from 'lucide-react'
import { pronunciationScore, scoreMessage, type ProfileId } from './learningCore'
import { deleteRecording, latestRecording, listRecordings, readRecording, saveRecording, type RecordingMeta } from './recordingStore'
import type { ReaderItem } from './types'

type Props = {
  profile: ProfileId
  bookId: string
  page: number
  items: ReaderItem[]
  selected: ReaderItem | null
  onPlay: (item: ReaderItem) => void
  onBeforeRecord: () => void
  onSaved: (item: ReaderItem, score?: number) => void
}

type RecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionCtor = new () => RecognitionLike

function speechConstructor() {
  if (typeof window === 'undefined') return undefined
  const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition
}

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds)
  return `0:${Math.floor(safe).toString().padStart(2, '0')}.${Math.floor((safe % 1) * 10)}`
}

function formatDate(stamp: number) {
  if (!Number.isFinite(stamp) || stamp <= 0) return '时间未知'
  const date = new Date(stamp)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
    .find(type => MediaRecorder.isTypeSupported(type)) ?? ''
}

// P1 录音跟读 + P2 浏览器语音评分。录音只写入本机 IndexedDB；
// 语音评分默认关闭，开启后由浏览器语音服务返回识别文本。
export default function RecordingPanel({ profile, bookId, items, selected, onPlay, onBeforeRecord, onSaved }: Props) {
  const target = items.find(item => item.id === selected?.id) ?? items[0]
  const [status, setStatus] = useState<'idle' | 'starting' | 'recording' | 'saving'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState<RecordingMeta | undefined>(() => target ? latestRecording(profile, bookId, target.id) : undefined)
  const [count, setCount] = useState(() => target ? listRecordings(profile, bookId, target.id).length : 0)
  const [playing, setPlaying] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [speechEnabled, setSpeechEnabled] = useState(() => {
    try { return localStorage.getItem('pep:speech-scoring') === '1' } catch { return false }
  })
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const recognition = useRef<RecognitionLike | null>(null)
  const recognitionResult = useRef<Promise<string> | null>(null)
  const startedAt = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const audio = useRef<HTMLAudioElement | null>(null)
  const audioUrl = useRef('')
  const mounted = useRef(true)
  // 录音开始后锁定目标词和资料归属，翻页或点选其他词时停止本次录音，
  // 不能把旧录音保存到新词名下。
  const take = useRef<{ item: ReaderItem; profile: ProfileId; bookId: string; key: string } | null>(null)
  const startRequest = useRef(0)
  const takeKey = target ? `${profile}:${bookId}:${target.id}` : ''
  const takeKeyRef = useRef(takeKey)
  takeKeyRef.current = takeKey

  const supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const speechSupported = Boolean(speechConstructor())

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      startRequest.current++
      window.clearInterval(timer.current)
      stream.current?.getTracks().forEach(track => track.stop())
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
      recognition.current?.abort()
      audio.current?.pause()
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current)
    }
  }, [])

  // 目标词、教材或用户切换时，先结束正在进行的录音（归到开始时的目标名下），
  // 并让仍在等待麦克风权限的启动请求失效。
  useEffect(() => {
    startRequest.current++
    if (status === 'recording') stop()
    // 麦克风权限弹窗还没返回时换了目标词：这次请求已经作废，恢复成可再次点击。
    else if (status === 'starting') setStatus('idle')
  }, [takeKey])

  useEffect(() => {
    if (!target) {
      setMeta(undefined)
      setCount(0)
      return
    }
    setMeta(latestRecording(profile, bookId, target.id))
    setCount(listRecordings(profile, bookId, target.id).length)
    setTranscript('')
    setError('')
  }, [profile, bookId, target?.id])

  function stopAudio() {
    audio.current?.pause()
    audio.current = null
    if (audioUrl.current) {
      URL.revokeObjectURL(audioUrl.current)
      audioUrl.current = ''
    }
    setPlaying(false)
  }

  function startRecognition() {
    const Ctor = speechConstructor()
    if (!Ctor) return Promise.resolve('')
    return new Promise<string>(resolve => {
      let settled = false
      const finish = (value: string) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      try {
        const instance = new Ctor()
        instance.lang = 'en-US'
        instance.continuous = false
        instance.interimResults = false
        instance.maxAlternatives = 1
        instance.onresult = event => {
          const heard = event.results?.[0]?.[0]?.transcript ?? ''
          if (mounted.current) setTranscript(heard)
          finish(heard)
        }
        instance.onerror = () => finish('')
        instance.onend = () => finish('')
        recognition.current = instance
        instance.start()
        window.setTimeout(() => finish(''), 4000)
      } catch {
        finish('')
      }
    })
  }

  async function start() {
    if (!target || status !== 'idle') return
    if (!supported) {
      setError('当前浏览器不能录音。手机请使用 HTTPS 打开，并允许麦克风权限。')
      return
    }
    const item = target
    const key = takeKey
    take.current = { item, profile, bookId, key }
    const requestId = ++startRequest.current
    onBeforeRecord()
    stopAudio()
    setError('')
    setTranscript('')
    setStatus('starting')
    setMeta(latestRecording(profile, bookId, item.id))
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      if (!mounted.current || requestId !== startRequest.current || takeKeyRef.current !== key) {
        media.getTracks().forEach(track => track.stop())
        take.current = null
        return
      }
      stream.current = media
      const mime = pickMime()
      const instance = mime ? new MediaRecorder(media, { mimeType: mime }) : new MediaRecorder(media)
      recorder.current = instance
      chunks.current = []
      startedAt.current = Date.now()
      instance.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data) }
      instance.onstop = () => { void finishRecording(instance.mimeType || mime || 'audio/webm') }
      instance.start()
      setStatus('recording')
      setElapsed(0)
      timer.current = window.setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 100)
      if (speechEnabled && speechSupported) recognitionResult.current = startRecognition()
    } catch (reason) {
      stream.current?.getTracks().forEach(track => track.stop())
      stream.current = null
      take.current = null
      if (!mounted.current || requestId !== startRequest.current) return
      setStatus('idle')
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError'
        ? '麦克风权限被拒绝，请在浏览器设置中允许后重试。'
        : '无法打开麦克风，请检查设备或换一个浏览器。')
    }
  }

  async function finishRecording(mime: string) {
    const current = take.current
    const item = current?.item
    const duration = (Date.now() - startedAt.current) / 1000
    window.clearInterval(timer.current)
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    let heard = ''
    if (speechEnabled && speechSupported) {
      recognition.current?.stop()
      const pending = recognitionResult.current
      recognitionResult.current = null
      if (pending) {
        heard = await Promise.race([
          pending,
          new Promise<string>(resolve => window.setTimeout(() => resolve(''), 1500)),
        ])
      }
    }
    const blob = new Blob(chunks.current, { type: mime })
    chunks.current = []
    if (!current || !item || !blob.size) {
      take.current = null
      if (mounted.current) {
        setStatus('idle')
        setError('这次没有录到声音，请再试一次。')
      }
      return
    }
    const score = heard ? pronunciationScore(item.text, heard).score : undefined
    try {
      const saved = await saveRecording({ profile: current.profile, bookId: current.bookId, itemId: item.id, text: item.text, duration, score, mime, blob })
      const stillCurrent = mounted.current && take.current === current && takeKeyRef.current === current.key
      take.current = null
      if (!mounted.current) return
      if (stillCurrent) {
        setMeta(saved)
        setCount(listRecordings(current.profile, current.bookId, item.id).length)
        setElapsed(duration)
      }
      setStatus('idle')
      onSaved(item, score)
    } catch {
      take.current = null
      if (!mounted.current) return
      setStatus('idle')
      setError('录音保存失败，请检查浏览器存储空间。')
    }
  }

  function stop() {
    if (status !== 'recording') return
    setStatus('saving')
    recorder.current?.stop()
  }

  async function playLatest() {
    if (!meta) return
    if (playing) {
      stopAudio()
      return
    }
    try {
      const blob = await readRecording(meta.id)
      if (!blob) {
        setError('找不到这段录音，请重新录制。')
        return
      }
      stopAudio()
      const url = URL.createObjectURL(blob)
      audioUrl.current = url
      const player = new Audio(url)
      audio.current = player
      player.onended = () => setPlaying(false)
      player.onerror = () => setPlaying(false)
      setPlaying(true)
      await player.play()
    } catch {
      setPlaying(false)
      setError('录音回放失败。')
    }
  }

  async function removeLatest() {
    if (!meta || !target) return
    stopAudio()
    await deleteRecording(meta.id)
    const next = latestRecording(profile, bookId, target.id)
    setMeta(next)
    setCount(listRecordings(profile, bookId, target.id).length)
  }

  function toggleSpeech() {
    const next = !speechEnabled
    setSpeechEnabled(next)
    try { localStorage.setItem('pep:speech-scoring', next ? '1' : '0') } catch { /* 忽略 */ }
  }

  if (!items.length) {
    return <div className="learning-empty"><Mic size={28}/><strong>本页暂无跟读内容</strong><p>翻到有单词或句子的页面，就可以录下自己的声音并与原音对比。</p></div>
  }

  return <div className="recording-panel">
    <div className="recording-target">
      <div>
        <span className="page-resources-kicker">跟读 target</span>
        <strong>{target?.text}</strong>
        {target?.translation && <small>{target.translation}</small>}
      </div>
      {target && <button className="recording-play-reference" aria-label="播放原音" title="播放原音" onClick={() => onPlay(target)}><Volume2 size={19}/></button>}
    </div>
    <div className="recording-word-chips" aria-label="选择跟读内容">
      {items.map(item => <button key={item.id} className={target?.id === item.id ? 'is-active' : ''} onClick={() => onPlay(item)}>{item.text}</button>)}
    </div>
    <div className={`recording-stage${status === 'recording' ? ' is-recording' : ''}`}>
      <button className="recording-button" aria-label={status === 'recording' ? '停止录音' : status === 'starting' ? '正在请求麦克风权限' : '开始录音'} disabled={status === 'saving' || status === 'starting'} onClick={() => status === 'recording' ? stop() : void start()}>
        {status === 'recording' ? <Square size={25}/> : <Mic size={25}/>}
      </button>
      <div className="recording-stage-copy">
        <strong>{status === 'recording' ? '正在录音…' : status === 'saving' ? '正在保存…' : status === 'starting' ? '正在请求麦克风…' : '点一下，读一遍'}</strong>
        <span>{status === 'recording' ? formatClock(elapsed) : meta ? `最近录音 ${formatDate(meta.createdAt)}` : status === 'starting' ? '请在浏览器弹窗中允许麦克风' : '录音只保存在本机浏览器'}</span>
      </div>
      {status === 'recording' && <span className="recording-live-dot" aria-hidden="true"/>}
    </div>
    {error && <p className="recording-error" role="alert">{error}</p>}
    {transcript && <p className="recording-heard">识别到：{transcript}</p>}
    {meta && <div className="recording-result">
      <div className="recording-result-head">
        <span>最近一次</span>
        <small>{formatDate(meta.createdAt)} · {Number.isFinite(meta.duration) ? Math.max(0, meta.duration).toFixed(1) : '0.0'} 秒</small>
      </div>
      {typeof meta.score === 'number' ? <div className={`recording-score${meta.score >= 75 ? ' is-good' : ''}`}>
        <strong>{meta.score}</strong><span>分 · {scoreMessage(meta.score)}</span>
      </div> : <p className="recording-no-score">这次没有启用语音评分，可以回放录音自己对照原音。</p>}
      <div className="recording-result-actions">
        <button onClick={() => void playLatest()}>{playing ? <Square size={15}/> : <Play size={15}/>}<span>{playing ? '停止回放' : '回放录音'}</span></button>
        <button className="is-danger" onClick={() => void removeLatest()}><Trash2 size={15}/><span>删除</span></button>
      </div>
      {count > 1 && <small className="recording-count">这个内容已保存 {count} 条录音，始终保留最近一条。</small>}
    </div>}
    <label className="recording-speech-toggle">
      <input type="checkbox" checked={speechEnabled} onChange={toggleSpeech} disabled={!speechSupported}/>
      <span>启用浏览器语音评分</span>
    </label>
    <p className="recording-privacy">录音保存在本机 IndexedDB，不上传。语音评分由浏览器语音服务完成；如果浏览器不支持或没有网络，录音仍可正常保存和回放。</p>
  </div>
}
