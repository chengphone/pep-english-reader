import { useEffect, useRef, useState } from 'react'
import { Clapperboard, Headphones, Pause, Play, Volume2, X } from 'lucide-react'
import { formatAudioTime } from './audioRange'
import type { ReaderPage, ReaderResource } from './types'

type Props = { page?: ReaderPage; pageNumber: number; onClose: () => void }

export default function PageResources({ page, pageNumber, onClose }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')
  const [video, setVideo] = useState<ReaderResource | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const resources = page?.resources ?? []
  const audios = resources.filter(resource => resource.kind === 'audio')
  const videos = resources.filter(resource => resource.kind === 'video')
  const activeResource = audios.find(resource => resource.id === activeId)
  // 翻页时组件会保留，起始点要跟着当前页的资源走，供播放结束后重新定位。
  const activeStartAt = Math.max(0, activeResource?.startAt ?? 0)
  const startAtRef = useRef(0)
  useEffect(() => {
    startAtRef.current = activeStartAt
  }, [activeStartAt])

  function stopAudio() {
    const player = audio.current
    if (player) {
      player.pause()
      audio.current = null
    }
    setPlaying(false)
    setActiveId(null)
    setCurrent(0)
    setDuration(0)
  }

  useEffect(() => () => { audio.current?.pause() }, [])

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (video) setVideo(null)
      else onClose()
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [video, onClose])

  async function toggleAudio(resource: ReaderResource) {
    setError('')
    const player = audio.current
    if (player && activeId === resource.id) {
      if (player.paused) {
        // 结束后再次播放时回到本页的起点，而不是整段录音的开头。
        if (player.ended) {
          const restart = Math.max(0, resource.startAt ?? 0)
          try {
            player.currentTime = restart
            setCurrent(restart)
          } catch { /* 元数据尚未就绪时忽略 */ }
        }
        try {
          await player.play()
          setPlaying(true)
        } catch {
          setError('浏览器没有开始播放，请再点一次。')
        }
      } else {
        player.pause()
        setPlaying(false)
      }
      return
    }
    stopAudio()
    const next = new Audio(resource.src)
    next.preload = 'auto'
    const startAt = Math.max(0, resource.startAt ?? 0)
    audio.current = next
    setActiveId(resource.id)
    setDuration(resource.duration ?? 0)
    setCurrent(startAt)
    if (startAt > 0) {
      // 先设置起点，元数据未就绪的浏览器在 loadedmetadata 后再补一次。
      try { next.currentTime = startAt } catch { /* 稍后重试 */ }
      next.addEventListener('loadedmetadata', () => {
        if (audio.current !== next) return
        if (next.currentTime + 0.25 < startAt) {
          try { next.currentTime = startAt } catch { /* 忽略 */ }
        }
      }, { once: true })
    }
    next.addEventListener('timeupdate', () => {
      if (audio.current === next) setCurrent(next.currentTime || 0)
    })
    next.addEventListener('loadedmetadata', () => {
      if (audio.current === next && Number.isFinite(next.duration) && next.duration > 0) setDuration(next.duration)
    })
    next.addEventListener('ended', () => {
      if (audio.current !== next) return
      const restart = Math.max(0, startAtRef.current)
      setPlaying(false)
      setCurrent(restart)
      try { next.currentTime = restart } catch { /* 某些浏览器在结束后不允许 seek，忽略即可 */ }
    })
    next.addEventListener('error', () => {
      if (audio.current !== next) return
      setPlaying(false)
      setError('这段音频无法加载，请检查网络后重试。')
    })
    try {
      await next.play()
      setPlaying(true)
    } catch {
      setError('浏览器阻止了自动播放，请再点一次。')
    }
  }

  function seek(value: number) {
    const player = audio.current
    if (!player) return
    try {
      player.currentTime = value
      setCurrent(value)
    } catch { /* 元数据尚未就绪时忽略拖动 */ }
  }

  function openVideo(resource: ReaderResource) {
    stopAudio()
    setError('')
    setVideo(resource)
  }

  return <>
    <aside className="page-resources" id="reading-page-resources" aria-label={`第 ${pageNumber} 页课堂资源`}>
      <header className="page-resources-head">
        <div>
          <span className="page-resources-kicker">第 {pageNumber} 页</span>
          <h2>课堂资源</h2>
        </div>
        <button aria-label="关闭课堂资源" onClick={onClose}><X size={19}/></button>
      </header>
      <div className="page-resources-body">
        {error && <p className="page-resources-error" role="alert">{error}</p>}
        {audios.length > 0 && <section className="page-resources-section" aria-labelledby="page-audio-title">
          <h3 id="page-audio-title"><Volume2 size={15}/>本页音频<span>{audios.length}</span></h3>
          <div className="page-resource-audios">
            {audios.map(resource => {
              const isActive = activeId === resource.id
              const total = (isActive ? duration : 0) || resource.duration || 0
              return <div className={`page-resource-audio${isActive ? ' is-active' : ''}`} key={resource.id}>
                <button className="page-resource-audio-main" aria-label={`${isActive && playing ? '暂停' : '播放'}${resource.title}`} onClick={() => void toggleAudio(resource)}>
                  <span className="page-resource-play-icon">{isActive && playing ? <Pause size={18}/> : <Play size={18}/>}</span>
                  <span className="page-resource-audio-copy">
                    <strong>{resource.title}{resource.continuous && <span className="page-resource-continuous" title="翻页时继续播放">跨页连播</span>}</strong>
                    {resource.subtitle && <small>{resource.subtitle}</small>}
                  </span>
                  <span className="page-resource-audio-meta">
                    {resource.track ? <span>CD1 {String(resource.track).padStart(2, '0')}</span> : null}
                    {total > 0 ? <em>{formatAudioTime(total)}</em> : null}
                  </span>
                </button>
                {isActive && <div className="page-resource-progress">
                  <input type="range" min={0} max={Math.max(0, total)} step={0.1} value={Math.min(current, total || 0)} aria-label={`${resource.title} 播放进度`} onChange={event => seek(Number(event.target.value))}/>
                  <span>{formatAudioTime(current)} / {formatAudioTime(total)}</span>
                </div>}
              </div>
            })}
          </div>
        </section>}
        {videos.length > 0 && <section className="page-resources-section" aria-labelledby="page-video-title">
          <h3 id="page-video-title"><Clapperboard size={15}/>课堂动漫<span>{videos.length}</span></h3>
          <div className="page-resource-videos">
            {videos.map(resource => <button className="page-resource-video" key={resource.id} onClick={() => openVideo(resource)}>
              <span className="page-resource-video-thumb">
                {resource.poster ? <img src={resource.poster} alt=""/> : <Clapperboard size={24}/>}
                <span className="page-resource-video-play"><Play size={18}/></span>
              </span>
              <span className="page-resource-video-copy">
                <strong>{resource.subtitle || resource.title}</strong>
                <small>{resource.title}{resource.duration ? ` · ${formatAudioTime(resource.duration)}` : ''}</small>
              </span>
            </button>)}
          </div>
        </section>}
        {!resources.length && <div className="page-resources-empty">
          <Headphones size={28}/>
          <strong>本页暂无音频</strong>
          <p>翻到学习页，就能看到单词跟读、歌谣和课堂动漫。</p>
        </div>}
      </div>
    </aside>
    {video && <div className="page-video-backdrop" role="presentation" onClick={() => setVideo(null)}>
      <section className="page-video-dialog" role="dialog" aria-modal="true" aria-labelledby="page-video-title-modal" onClick={event => event.stopPropagation()}>
        <header>
          <div>
            <span className="page-resources-kicker">课堂动漫</span>
            <h2 id="page-video-title-modal">{video.subtitle || video.title}</h2>
          </div>
          <button aria-label="关闭视频" onClick={() => setVideo(null)}><X size={20}/></button>
        </header>
        <video key={video.id} src={video.src} poster={video.poster} controls autoPlay playsInline/>
      </section>
    </div>}
  </>
}
