import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { ReaderResource } from './types'

type Props = { video: ReaderResource; onClose: () => void }

// 课堂动漫弹层。打开前由 LocalReader 停止点读和课堂音频，保证同一时间只有一路声音。
export default function PageVideoDialog({ video, onClose }: Props) {
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [onClose])
  return <div className="page-video-backdrop" role="presentation" onClick={onClose}>
    <section className="page-video-dialog" role="dialog" aria-modal="true" aria-labelledby="page-video-title-modal" onClick={event => event.stopPropagation()}>
      <header>
        <div>
          <span className="page-resources-kicker">课堂动漫</span>
          <h2 id="page-video-title-modal">{video.subtitle || video.title}</h2>
        </div>
        <button aria-label="关闭视频" onClick={onClose}><X size={20}/></button>
      </header>
      <video key={video.id} src={video.src} poster={video.poster} controls autoPlay playsInline/>
    </section>
  </div>
}
