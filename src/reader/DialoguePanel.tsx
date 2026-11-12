import { useState } from 'react'
import { Eye, EyeOff, Mic, Play, Volume2 } from 'lucide-react'
import type { ReaderItem } from './types'

type DialogueProps = {
  items: ReaderItem[]
  onPlay: (item: ReaderItem) => void
  onPlaySequence: (items: ReaderItem[]) => void
  onRecordItem: (item: ReaderItem) => void
}

const LEVELS = [
  { id: 'listen', label: '听读', hint: '看着文字听原音，先把句子听熟。' },
  { id: 'shadow', label: '跟读', hint: '先听一遍，再录下自己的声音。' },
  { id: 'challenge', label: '挑战', hint: '先遮住文字听，再决定是否显示原文。' },
] as const

type Level = (typeof LEVELS)[number]['id']

// P2 分级对话：同一组页面内容提供听读、跟读、挑战三种难度。
// 内容来自教材清单里的句词条目，不生成新的教材对白。
export function DialoguePanel({ items, onPlay, onPlaySequence, onRecordItem }: DialogueProps) {
  const [level, setLevel] = useState<Level>('listen')
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const active = LEVELS.find(row => row.id === level)!
  function toggle(id: string) {
    setRevealed(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return <div className="dialogue-panel">
    <div className="dialogue-levels" role="tablist" aria-label="对话难度">
      {LEVELS.map(row => <button key={row.id} role="tab" aria-selected={level === row.id} className={level === row.id ? 'is-active' : ''} onClick={() => setLevel(row.id)}>{row.label}</button>)}
    </div>
    <p className="dialogue-hint">{active.hint}</p>
    <button className="dialogue-play-all" disabled={!items.length} onClick={() => onPlaySequence(items)}><Play size={16}/><span>整段连续播放</span></button>
    <div className="dialogue-lines">
      {items.map((item, index) => {
        const hidden = level === 'challenge' && !revealed.has(item.id)
        return <article key={item.id} className={`dialogue-line${hidden ? ' is-hidden' : ''}`}>
          <span className="dialogue-index">{String(index + 1).padStart(2, '0')}</span>
          <div className="dialogue-copy">
            <strong>{hidden ? '••••••' : item.text}</strong>
            {!hidden && item.translation && <small>{item.translation}</small>}
          </div>
          <div className="dialogue-actions">
            <button aria-label={`播放第 ${index + 1} 句`} title="播放原音" onClick={() => onPlay(item)}><Volume2 size={15}/></button>
            {level === 'shadow' && <button aria-label={`跟读第 ${index + 1} 句`} title="去跟读" onClick={() => onRecordItem(item)}><Mic size={15}/></button>}
            {level === 'challenge' && <button aria-label={hidden ? '显示原文' : '遮住原文'} title={hidden ? '显示原文' : '遮住原文'} onClick={() => toggle(item.id)}>{hidden ? <Eye size={15}/> : <EyeOff size={15}/>}</button>}
          </div>
        </article>
      })}
    </div>
  </div>
}
