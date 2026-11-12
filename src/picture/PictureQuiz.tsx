import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, RotateCcw, Sparkles, X } from 'lucide-react'
import './PictureQuiz.css'
import type { PictureBook, PictureCatalogEntry, PictureQuestion } from '../pictureBooks'
import { loadPictureBook, pictureArt, questionsFor } from '../pictureBooks'

type QuizMode = 'comprehension' | 'vocabulary'

export default function PictureQuiz({
  entry,
  mode,
  onBack,
  onLibrary,
}: {
  entry: PictureCatalogEntry
  mode: QuizMode
  onBack: () => void
  onLibrary: () => void
}) {
  const [book, setBook] = useState<PictureBook | null>(null)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    let live = true
    setBook(null)
    setError('')
    setIndex(0)
    setAnswers({})
    setFinished(false)
    loadPictureBook(entry).then(next => { if (live) setBook(next) }).catch(reason => {
      if (live) setError(reason instanceof Error ? reason.message : '绘本加载失败，请检查本地服务器。')
    })
    return () => { live = false }
  }, [entry])

  const actualMode: QuizMode = mode === 'comprehension' && book?.manifest.comprehension?.length ? 'comprehension' : 'vocabulary'
  const questions = useMemo<PictureQuestion[]>(() => book ? questionsFor(book.manifest, actualMode) : [], [book, actualMode])
  const question = questions[index]
  const answer = question ? answers[question.id] : undefined
  const answered = answer !== undefined
  const correct = question && answer === question.answer
  const score = questions.reduce((sum, row) => sum + (answers[row.id] === row.answer ? 1 : 0), 0)

  function choose(option: number) {
    if (!question || answered) return
    setAnswers(prev => ({ ...prev, [question.id]: option }))
  }
  function next() {
    if (index < questions.length - 1) setIndex(value => value + 1)
    else setFinished(true)
  }
  function restart() {
    setAnswers({})
    setIndex(0)
    setFinished(false)
  }

  if (error) return <div className="picture-quiz">
    <div className="pquiz-topbar"><button type="button" className="pbook-back" onClick={onLibrary}><ArrowLeft size={17}/>返回绘本馆</button></div>
    <div className="pquiz-loading"><BookOpen size={30}/><h1>无法打开小测</h1><p>{error}</p><button type="button" className="pquiz-primary" onClick={onLibrary}>返回绘本馆</button></div>
  </div>
  if (!book) return <div className="picture-quiz">
    <div className="pquiz-topbar"><button type="button" className="pbook-back" onClick={onLibrary}><ArrowLeft size={17}/>返回绘本馆</button></div>
    <div className="pquiz-loading"><span className="pbook-spinner" aria-hidden="true"/><p>正在准备小测…</p></div>
  </div>

  return <div className="picture-quiz">
    <header className="pquiz-topbar">
      <button type="button" className="pbook-back" onClick={onBack}><ArrowLeft size={17}/><span>返回阅读</span></button>
      <div className="pquiz-top-title"><strong>{book.manifest.title}</strong><small>第 {book.manifest.episode} 集 · {actualMode === 'comprehension' ? '故事理解' : '词汇小测'}</small></div>
      <button type="button" className="pquiz-library-link" onClick={onLibrary}>绘本馆<ArrowRight size={14}/></button>
    </header>

    <main className="pquiz-main">
      <section className="pquiz-hero">
        <div className="pquiz-cover" aria-hidden="true"><img src={pictureArt(entry)} alt=""/></div>
        <div>
          <span className="page-kicker">{actualMode === 'comprehension' ? 'READING COMPREHENSION' : 'VOCABULARY CHECK'}</span>
          <h1>{actualMode === 'comprehension' ? '故事理解小测' : '本集词汇小测'}</h1>
          <p>{actualMode === 'comprehension'
            ? '题目来自本集故事，已按原版文字校对。选择后立即看到反馈。'
            : '题目来自随书生词 PDF，只考本集词义，不冒充故事理解题。'}</p>
        </div>
      </section>

      {!questions.length && <div className="page-empty">
        <BookOpen size={24}/>
        <strong>这一集还没有可用题目</strong>
        <span>{actualMode === 'comprehension' ? '本集暂无已校对的故事理解题；可以先做词汇小测。' : '随书生词表为空，暂时无法生成词汇小测。'}</span>
        <div className="pquiz-empty-actions">
          {actualMode === 'comprehension' && <button type="button" className="pquiz-primary" onClick={() => { setAnswers({}); setIndex(0); setFinished(false); onBack() }}>返回阅读</button>}
          <button type="button" className="pquiz-secondary" onClick={onLibrary}>返回绘本馆</button>
        </div>
      </div>}

      {questions.length > 0 && finished && <section className="pquiz-result" aria-live="polite">
        <span className="pquiz-result-mark" aria-hidden="true"><Sparkles size={30}/></span>
        <h2>{score === questions.length ? '全对！' : score >= Math.ceil(questions.length * .6) ? '完成小测' : '再读一遍会更好'}</h2>
        <p>答对 <strong>{score}</strong> / {questions.length} 题</p>
        <div className="pquiz-result-actions">
          <button type="button" className="pquiz-primary" onClick={restart}><RotateCcw size={15}/>再做一次</button>
          <button type="button" className="pquiz-secondary" onClick={onBack}>返回阅读</button>
          <button type="button" className="pquiz-secondary" onClick={onLibrary}>绘本馆</button>
        </div>
      </section>}

      {questions.length > 0 && !finished && question && <section className="pquiz-card" aria-labelledby="pquiz-question">
        <header className="pquiz-progress">
          <span>第 {index + 1} / {questions.length} 题</span>
          <div aria-hidden="true">{questions.map((row, rowIndex) => <i key={row.id} className={rowIndex < index || answers[row.id] !== undefined ? 'is-done' : rowIndex === index ? 'is-current' : ''}/>)}</div>
        </header>
        <h2 id="pquiz-question">{question.prompt}</h2>
        <div className="pquiz-options">
          {question.options.map((option, optionIndex) => {
            const isChosen = answer === optionIndex
            const isCorrect = question.answer === optionIndex
            const state = !answered ? '' : isCorrect ? ' is-correct' : isChosen ? ' is-wrong' : ' is-muted'
            return <button key={`${question.id}-${optionIndex}`} type="button" className={`pquiz-option${state}`} disabled={answered} aria-pressed={isChosen} onClick={() => choose(optionIndex)}>
              <span className="pquiz-letter">{String.fromCharCode(65 + optionIndex)}</span>
              <span>{option}</span>
              {answered && isCorrect && <Check size={16}/>}
              {answered && isChosen && !isCorrect && <X size={16}/>}
            </button>
          })}
        </div>
        {answered && <div className={`pquiz-feedback${correct ? ' is-correct' : ' is-wrong'}`} role="status">
          <strong>{correct ? '答对了' : '正确答案是 ' + String.fromCharCode(65 + question.answer)}</strong>
          {question.explanation && <p>{question.explanation}</p>}
        </div>}
        <div className="pquiz-actions">
          <button type="button" className="pquiz-secondary" onClick={onBack}>返回阅读</button>
          <button type="button" className="pquiz-primary" disabled={!answered} onClick={next}>{index < questions.length - 1 ? '下一题' : '查看结果'}<ArrowRight size={15}/></button>
        </div>
      </section>}
    </main>
  </div>
}
