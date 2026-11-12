import { useMemo, useState } from 'react'
import { Check, Headphones, RotateCcw, Volume2, X } from 'lucide-react'
import { makeQuiz, normalizeSpeech, type QuizQuestion } from './learningCore'
import type { ReaderItem } from './types'

type Props = {
  items: ReaderItem[]
  pool: ReaderItem[]
  onPlay: (item: ReaderItem) => void
  onResult: (item: ReaderItem, kind: QuizQuestion['kind'], correct: boolean) => void
}

const KIND_LABEL: Record<QuizQuestion['kind'], string> = {
  listen: '听音选词',
  meaning: '看词选义',
  spell: '听音拼写',
}

// P1 练习：每页 8 题，听音选词 / 看词选义 / 听音拼写三种题型。
// 结果写入学习库，作为 P2 智能复习的排期依据。
export default function QuizPanel({ items, pool, onPlay, onResult }: Props) {
  const [round, setRound] = useState(0)
  const questions = useMemo(() => makeQuiz(items, pool), [items, pool, round])
  const [index, setIndex] = useState(0)
  const [choice, setChoice] = useState('')
  const [draft, setDraft] = useState('')
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)
  const question = questions[index]

  function reset() {
    setIndex(0)
    setChoice('')
    setDraft('')
    setAnswered(false)
    setScore(0)
    setFinished(false)
  }
  function startRound() {
    setRound(value => value + 1)
    reset()
  }
  function submit(value: string) {
    if (!question || answered) return
    const correct = question.kind === 'spell'
      ? normalizeSpeech(value) === normalizeSpeech(question.answer)
      : value === question.answer
    setChoice(value)
    setAnswered(true)
    if (correct) setScore(value => value + 1)
    onResult(question.item, question.kind, correct)
  }
  function next() {
    if (index + 1 >= questions.length) {
      setFinished(true)
      return
    }
    const following = questions[index + 1]
    setIndex(value => value + 1)
    setChoice('')
    setDraft('')
    setAnswered(false)
    // “下一题”是用户手势，顺势播放下一题的听音材料，不触发浏览器自动播放限制。
    if (following && following.kind !== 'meaning') onPlay(following.item)
  }

  if (!questions.length) {
    return <div className="learning-empty"><Headphones size={28}/><strong>本页暂无练习</strong><p>翻到有单词或句子的页面，就能开始听音选词和拼写练习。</p></div>
  }

  if (finished) {
    const accuracy = Math.round((score / questions.length) * 100)
    return <div className="quiz-summary">
      <div className={`quiz-summary-score${accuracy >= 80 ? ' is-good' : ''}`}>{accuracy}<small>分</small></div>
      <strong>{accuracy >= 90 ? '太棒了，这一页掌握得很好' : accuracy >= 70 ? '不错，再练一组会更稳' : '先听几遍原音，再试一次'}</strong>
      <p>答对 {score} / {questions.length} 题</p>
      <button className="quiz-primary" onClick={startRound}><RotateCcw size={16}/>再来一组</button>
    </div>
  }

  return <div className="quiz-panel">
    <header className="quiz-head">
      <span>{KIND_LABEL[question.kind]}</span>
      <small>{index + 1} / {questions.length}</small>
    </header>
    <div className="quiz-progress" aria-hidden="true"><i style={{ width: `${((index + (answered ? 1 : 0)) / questions.length) * 100}%` }}/></div>
    <div className="quiz-prompt">
      {question.kind === 'listen' && <>
        <p>听一听，选出你听到的单词</p>
        <button className="quiz-listen" onClick={() => onPlay(question.item)}><Volume2 size={22}/><span>播放原音</span></button>
      </>}
      {question.kind === 'meaning' && <>
        <p>选择正确的中文意思</p>
        <strong className="quiz-word">{question.item.text}</strong>
        <button className="quiz-listen small" onClick={() => onPlay(question.item)}><Volume2 size={17}/><span>听发音</span></button>
      </>}
      {question.kind === 'spell' && <>
        <p>听一听，把单词拼出来</p>
        <button className="quiz-listen" onClick={() => onPlay(question.item)}><Volume2 size={22}/><span>播放原音</span></button>
        <small className="quiz-hint">{question.item.translation || '根据发音输入单词'}</small>
      </>}
    </div>
    {question.kind === 'spell' ? <form className="quiz-spell" onSubmit={event => { event.preventDefault(); submit(draft) }}>
      <input
        value={draft}
        onChange={event => setDraft(event.target.value)}
        placeholder="输入单词"
        aria-label="拼写答案"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={answered}
        autoFocus
      />
      {!answered && <button type="submit" disabled={!draft.trim()}>检查</button>}
    </form> : <div className="quiz-options">
      {question.options.map(option => {
        const isAnswer = option === question.answer
        const picked = option === choice
        const state = answered ? isAnswer ? ' is-correct' : picked ? ' is-wrong' : '' : ''
        return <button key={option} className={`quiz-option${state}`} disabled={answered} onClick={() => submit(option)}>
          <span>{option}</span>
          {answered && isAnswer && <Check size={17}/>}
          {answered && picked && !isAnswer && <X size={17}/>}
        </button>
      })}
    </div>}
    {answered && <div className={`quiz-feedback${choice === question.answer || (question.kind === 'spell' && normalizeSpeech(draft) === normalizeSpeech(question.answer)) ? ' is-correct' : ''}`} role="status">
      <strong>{question.kind === 'spell' ? normalizeSpeech(draft) === normalizeSpeech(question.answer) ? '拼写正确' : `正确拼写：${question.answer}` : choice === question.answer ? '答对了' : `正确答案：${question.answer}`}</strong>
      {question.kind === 'meaning' && <span>{question.item.text}</span>}
      <button onClick={next}>{index + 1 >= questions.length ? '查看结果' : '下一题'}</button>
    </div>}
  </div>
}
