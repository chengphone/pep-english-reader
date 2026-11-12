import { Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import { formatAudioTime } from './audioRange'

function mediaTime(seconds: number, total: number) {
  if (total > 0 && total < 10) {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
    return `${Math.floor(safe / 60)}:${(safe % 60).toFixed(1).padStart(4, '0')}`
  }
  return formatAudioTime(seconds)
}

export type MediaDockState = {
  kind: 'page' | 'point'
  title: string
  subtitle?: string
  playing: boolean
  current: number
  duration: number
  rate: number
  loop: boolean
  volume: number
  muted: boolean
  error?: string
  canPrev: boolean
  canNext: boolean
}

type Props = {
  state: MediaDockState
  onToggle: () => void
  onSeek: (value: number) => void
  onRate: (value: number) => void
  onLoop: () => void
  onVolume: (value: number) => void
  onMute: () => void
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

// 底部全局播放条：课堂音频和点读共用一套控制，避免同时播放两路声音。
// 没有活动媒体时整条隐藏，把阅读区上下两端还给课本。
export default function MediaDock({ state, onToggle, onSeek, onRate, onLoop, onVolume, onMute, onPrev, onNext, onClose }: Props) {
  const total = Math.max(0, state.duration)
  const current = Math.max(0, Math.min(state.current, total || state.current))
  return <section className="global-media-dock" aria-label="全局播放器">
    <button className="global-media-play" aria-label={state.playing ? '暂停' : '播放'} onClick={onToggle}>
      {state.playing ? <Pause size={20}/> : <Play size={20}/>}
    </button>
    <div className="global-media-copy">
      <div className="global-media-title-row">
        <span className={`global-media-kind ${state.kind}`}>{state.kind === 'page' ? '课堂音频' : '点读'}</span>
        <strong title={state.title}>{state.title}</strong>
        {state.subtitle && <small title={state.subtitle}>{state.subtitle}</small>}
      </div>
      <div className="global-media-progress">
        <span>{mediaTime(current, total)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(0.1, total)}
          step={0.1}
          value={Math.min(current, Math.max(0.1, total))}
          aria-label="播放进度"
          disabled={!total}
          onChange={event => onSeek(Number(event.target.value))}
        />
        <span>{mediaTime(total, total)}</span>
      </div>
      {state.error && <p className="global-media-error" role="alert">{state.error}</p>}
    </div>
    <div className="global-media-actions">
      <button className="global-media-icon global-media-skip" aria-label="上一段" title="上一段" disabled={!state.canPrev} onClick={onPrev}><SkipBack size={17}/></button>
      <button className="global-media-icon global-media-skip" aria-label="下一段" title="下一段" disabled={!state.canNext} onClick={onNext}><SkipForward size={17}/></button>
      <label className="global-media-rate">语速
        <select aria-label="播放语速" value={state.rate} onChange={event => onRate(Number(event.target.value))}>
          <option value={0.75}>0.75×</option>
          <option value={1}>1.0×</option>
          <option value={1.25}>1.25×</option>
        </select>
      </label>
      <button className={`global-media-icon${state.loop ? ' is-active' : ''}`} aria-label={state.loop ? '关闭循环' : '循环本段'} title={state.loop ? '关闭循环' : '循环本段'} aria-pressed={state.loop} onClick={onLoop}><Repeat size={17}/></button>
      <button className="global-media-icon global-media-volume-button" aria-label={state.muted ? '取消静音' : '静音'} title={state.muted ? '取消静音' : '静音'} onClick={onMute}>{state.muted || state.volume === 0 ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button>
      <label className="global-media-volume" title="音量">
        <span className="sr-only">音量</span>
        <input type="range" min={0} max={1} step={0.05} value={state.muted ? 0 : state.volume} aria-label="音量" onChange={event => onVolume(Number(event.target.value))}/>
      </label>
      <button className="global-media-close" aria-label="停止并关闭播放器" title="停止并关闭" onClick={onClose}><X size={17}/></button>
    </div>
  </section>
}
