import { Clapperboard, Headphones, Pause, Play, Volume2 } from 'lucide-react'
import { formatAudioTime } from './audioRange'
import type { ReaderPage, ReaderResource } from './types'
import type { PageAudioController } from './usePageAudio'

type Props = {
  page?: ReaderPage
  pageNumber: number
  audio: PageAudioController
  onToggle: (resource: ReaderResource) => void
  onOpenVideo: (resource: ReaderResource) => void
}

// 课堂资源标签页的内容。播放状态由 LocalReader 上的 usePageAudio 持有，
// 所以关闭学习面板或翻页时，正在播放的跨页音频不会被面板卸载。
export default function PageResources({ page, pageNumber, audio, onToggle, onOpenVideo }: Props) {
  const resources = page?.resources ?? []
  const audios = resources.filter(resource => resource.kind === 'audio')
  const videos = resources.filter(resource => resource.kind === 'video')
  return <div className="page-resources page-resources-embedded" id="reading-page-resources" aria-label={`第 ${pageNumber} 页课堂资源`}>
    <div className="page-resources-body">
      {audio.error && <p className="page-resources-error" role="alert">{audio.error}</p>}
      {audios.length > 0 && <section className="page-resources-section" aria-labelledby="page-audio-title">
        <h3 id="page-audio-title"><Volume2 size={15}/>本页音频<span>{audios.length}</span></h3>
        <div className="page-resource-audios">
          {audios.map(resource => {
            const isActive = audio.activeId === resource.id
            const total = (isActive ? audio.duration : 0) || resource.duration || 0
            return <div className={`page-resource-audio${isActive ? ' is-active' : ''}`} key={resource.id}>
              <button className="page-resource-audio-main" aria-label={`${isActive && audio.playing ? '暂停' : '播放'}${resource.title}`} onClick={() => onToggle(resource)}>
                <span className="page-resource-play-icon">{isActive && audio.playing ? <Pause size={18}/> : <Play size={18}/>}</span>
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
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, total)}
                  step={0.1}
                  value={Math.min(audio.current, Math.max(0.1, total))}
                  aria-label={`${resource.title} 播放进度`}
                  onChange={event => audio.seek(Number(event.target.value))}
                />
                <span>{formatAudioTime(audio.current)} / {formatAudioTime(total)}</span>
              </div>}
            </div>
          })}
        </div>
      </section>}
      {videos.length > 0 && <section className="page-resources-section" aria-labelledby="page-video-title">
        <h3 id="page-video-title"><Clapperboard size={15}/>课堂动漫<span>{videos.length}</span></h3>
        <div className="page-resource-videos">
          {videos.map(resource => <button className="page-resource-video" key={resource.id} onClick={() => onOpenVideo(resource)}>
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
        <strong>本页暂无课堂资源</strong>
        <p>翻到学习页，就能看到单词跟读、歌谣和课堂动漫。</p>
      </div>}
    </div>
  </div>
}
