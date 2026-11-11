import { Headphones, Pause, Play, Square, X } from 'lucide-react'
import type { ReaderItem, ReaderPage } from './types'
import type { ReaderPlaybackStatus } from './useReaderPlayback'

type Playback = {
  status: ReaderPlaybackStatus
  source: string
  error: string
  toggle: (selected: ReaderItem | null) => void
  stop: () => void
}

type Props = {
  page?: ReaderPage
  selected: ReaderItem | null
  translation?: string
  translating: boolean
  translationMessage?: string
  repeat: number
  speed: number
  playback: Playback
  settingsOpen: boolean
  onSettings: () => void
  onRepeat: (value: number) => void
  onSpeed: (value: number) => void
  onReadPage: () => void
  onEdit: () => void
  onClose: () => void
}

// 阅读页右侧的朗读与翻译面板。手机/平板上会变成底部的浮层卡片，
// 音频设置折叠在“音频设置”按钮里，桌面端直接展开。
export default function ReadingAudioPanel({ page, selected, translation, translating, translationMessage, repeat, speed, playback, settingsOpen, onSettings, onRepeat, onSpeed, onReadPage, onEdit, onClose }: Props) {
  const playing = playback.status === 'playing' || playback.status === 'loading'
  return <aside className="reading-audio-panel" id="reading-audio-panel" aria-label="朗读与翻译">
    <header className="reading-audio-panel-head">
      <div>
        <span className="page-resources-kicker">点读</span>
        <h2>朗读与翻译</h2>
      </div>
      <button aria-label="关闭朗读面板" title="关闭" onClick={onClose}><X size={18}/></button>
    </header>
    <div className="reading-audio-panel-body">
      <div className="reading-audio-primary">
        <button className="reading-audio-play" aria-label={playing ? '暂停朗读' : playback.status === 'paused' ? '继续朗读' : '播放选中句子'} disabled={!selected} onClick={() => playback.toggle(selected)}>
          {playing ? <Pause size={24}/> : <Play size={24}/>}
        </button>
        <div className="reading-sentence" aria-live="polite">
          <b>{selected?.text ?? '点选课本上的一句英文'}</b>
          <div>
            <span>{selected ? (translation || (translating ? '正在翻译…' : translationMessage || '暂无中文释义')) : '英文和中文释义会显示在这里。'}</span>
            {selected && <button onClick={onEdit}>编辑翻译</button>}
          </div>
          <small>{playback.error || (playback.status === 'loading' ? '正在准备音频…' : playback.source || '支持单句点读与整页连读')}</small>
        </div>
      </div>
      <div className="reading-audio-actions">
        <button className="reading-page-play" disabled={!page?.items.length} onClick={onReadPage}><Headphones size={19}/><span>整页连读</span></button>
        <button className="reading-audio-stop" aria-label="停止朗读" title="停止朗读" disabled={playback.status === 'idle'} onClick={playback.stop}><Square size={18}/></button>
      </div>
      <button className="reading-audio-settings" aria-expanded={settingsOpen} aria-controls="reading-audio-settings" onClick={onSettings}>{settingsOpen ? '收起音频设置' : '音频设置'}</button>
      <div id="reading-audio-settings" className={`reading-audio-panel-controls${settingsOpen ? ' mobile-settings-open' : ''}`}>
        <label>循环<select aria-label="朗读循环次数" value={repeat} onChange={event => onRepeat(Number(event.target.value))}><option value={1}>1 次</option><option value={3}>3 次</option><option value={0}>无限</option></select></label>
        <label>语速<select aria-label="朗读语速" value={speed} onChange={event => onSpeed(Number(event.target.value))}><option value={.75}>0.75×</option><option value={1}>1.0×</option><option value={1.25}>1.25×</option></select></label>
      </div>
    </div>
  </aside>
}
