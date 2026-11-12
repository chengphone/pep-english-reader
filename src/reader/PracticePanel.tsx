import { useState } from 'react'
import QuizPanel from './QuizPanel'
import { DialoguePanel } from './DialoguePanel'
import type { QuizQuestion } from './learningCore'
import type { ReaderItem } from './types'

type Props = {
  items: ReaderItem[]
  pool: ReaderItem[]
  onPlay: (item: ReaderItem) => void
  onPlaySequence: (items: ReaderItem[]) => void
  onRecordItem: (item: ReaderItem) => void
  onResult: (item: ReaderItem, kind: QuizQuestion['kind'], correct: boolean) => void
}

export default function PracticePanel({ items, pool, onPlay, onPlaySequence, onRecordItem, onResult }: Props) {
  const [mode, setMode] = useState<'quiz' | 'dialogue'>('quiz')
  return <div className="practice-panel">
    <div className="practice-switch" role="tablist" aria-label="练习方式">
      <button role="tab" aria-selected={mode === 'quiz'} className={mode === 'quiz' ? 'is-active' : ''} onClick={() => setMode('quiz')}>单词练习</button>
      <button role="tab" aria-selected={mode === 'dialogue'} className={mode === 'dialogue' ? 'is-active' : ''} onClick={() => setMode('dialogue')} disabled={items.length < 2}>分级对话</button>
    </div>
    {mode === 'quiz'
      ? <QuizPanel items={items} pool={pool} onPlay={onPlay} onResult={onResult}/>
      : <DialoguePanel items={items} onPlay={onPlay} onPlaySequence={onPlaySequence} onRecordItem={onRecordItem}/>}
  </div>
}
