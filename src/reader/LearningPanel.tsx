import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Headphones, Pause, Pencil, Play, Square, X } from 'lucide-react'
import PageResources from './PageResources'
import PracticePanel from './PracticePanel'
import RecordingPanel from './RecordingPanel'
import ReviewPanel from './ReviewPanel'
import type { QuizQuestion, ProfileId } from './learningCore'
import type { ReaderItem, ReaderPage, ReaderResource } from './types'
import type { PageAudioController } from './usePageAudio'
import type { ReaderPlaybackController } from './useReaderPlayback'

export type LearningTab = 'words' | 'resources' | 'record' | 'practice' | 'review'

type Props = {
  page?: ReaderPage
  pageNumber: number
  pageIndex: number
  bookId: string
  profile: ProfileId
  pool: ReaderItem[]
  labelForPage: (page: number) => string
  nextPage?: { page: number; label: string; count: number }
  dueCount: number
  tab: LearningTab
  onTab: (tab: LearningTab) => void
  admin: boolean
  selected: ReaderItem | null
  translation?: string
  translating: boolean
  translationMessage?: string
  repeat: number
  speed: number
  playback: ReaderPlaybackController
  pageAudio: PageAudioController
  onTogglePlayback: () => void
  onToggleResource: (resource: ReaderResource) => void
  onOpenVideo: (resource: ReaderResource) => void
  onPlayItem: (item: ReaderItem) => void
  onPreviewItem: (item: ReaderItem) => void
  onPlaySequence: (items: ReaderItem[]) => void
  onRecordItem: (item: ReaderItem) => void
  onQuizResult: (item: ReaderItem, kind: QuizQuestion['kind'], correct: boolean) => void
  onRecordingSaved: (item: ReaderItem, score?: number) => void
  onReadPage: () => void
  onRepeat: (value: number) => void
  onSpeed: (value: number) => void
  onEdit: () => void
  onPrevPage: () => void
  onNextPage: () => void
  canPrevPage: boolean
  canNextPage: boolean
  onGoPage: (page: number) => void
  onBeforeRecord: () => void
  onClose: () => void
}

// 右侧学习面板：单词 / 资源 / 跟读 / 练习 / 复习。
// 点读和课堂音频的进度、循环、语速统一显示在底部全局播放条。
export default function LearningPanel({ page, pageNumber, pageIndex, bookId, profile, pool, labelForPage, nextPage, dueCount, tab, onTab, admin, selected, translation, translating, translationMessage, repeat, speed, playback, pageAudio, onTogglePlayback, onToggleResource, onOpenVideo, onPlayItem, onPreviewItem, onPlaySequence, onRecordItem, onQuizResult, onRecordingSaved, onReadPage, onRepeat, onSpeed, onEdit, onPrevPage, onNextPage, canPrevPage, canNextPage, onGoPage, onBeforeRecord, onClose }: Props) {
  const items = page?.items ?? []
  const resources = page?.resources ?? []
  const hasItems = items.length > 0
  const hasResources = resources.length > 0
  const hasReview = dueCount > 0 || Boolean(pool.length)
  const available = new Set<LearningTab>()
  if (hasItems) { available.add('words'); available.add('record'); available.add('practice') }
  if (hasResources) available.add('resources')
  if (hasReview) available.add('review')
  const activeTab: LearningTab = available.has(tab) ? tab : hasItems ? 'words' : hasResources ? 'resources' : 'review'
  const playing = playback.status === 'playing' || playback.status === 'loading'
  const sortedItems = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items])
  return <aside className="learning-panel" id="reading-learning-panel" aria-label="本页学习">
    <header className="learning-panel-head">
      <div className="learning-panel-heading">
        <span className="page-resources-kicker">第 {pageNumber} 页 · {profile === 'a' ? 'A' : 'B'} 用户</span>
        <h2>本页学习</h2>
      </div>
      <div className="learning-panel-head-actions">
        <div className="learning-page-nav" aria-label="课本翻页">
          <button aria-label="课本上一页" title="课本上一页" disabled={!canPrevPage} onClick={onPrevPage}><ChevronLeft size={17}/></button>
          <button aria-label="课本下一页" title="课本下一页" disabled={!canNextPage} onClick={onNextPage}><ChevronRight size={17}/></button>
        </div>
        <button className="learning-close" aria-label="关闭学习面板" title="关闭" onClick={onClose}><X size={18}/></button>
      </div>
    </header>
    {available.size > 0 && <div className="learning-tabs" role="tablist" aria-label="本页学习内容">
      {hasItems && <button id="learning-tab-words" role="tab" aria-selected={activeTab === 'words'} aria-controls="learning-tabpanel" className={activeTab === 'words' ? 'is-active' : ''} onClick={() => onTab('words')}>单词<span>{items.length}</span></button>}
      {hasResources && <button id="learning-tab-resources" role="tab" aria-selected={activeTab === 'resources'} aria-controls="learning-tabpanel" className={activeTab === 'resources' ? 'is-active' : ''} onClick={() => onTab('resources')}>资源<span>{resources.length}</span></button>}
      {hasItems && <button id="learning-tab-record" role="tab" aria-selected={activeTab === 'record'} aria-controls="learning-tabpanel" className={activeTab === 'record' ? 'is-active' : ''} onClick={() => onTab('record')}>跟读</button>}
      {hasItems && <button id="learning-tab-practice" role="tab" aria-selected={activeTab === 'practice'} aria-controls="learning-tabpanel" className={activeTab === 'practice' ? 'is-active' : ''} onClick={() => onTab('practice')}>练习</button>}
      {hasReview && <button id="learning-tab-review" role="tab" aria-selected={activeTab === 'review'} aria-controls="learning-tabpanel" className={activeTab === 'review' ? 'is-active' : ''} onClick={() => onTab('review')}>复习{dueCount > 0 && <span>{dueCount}</span>}</button>}
    </div>}
    <div className="learning-panel-body" id="learning-tabpanel" role="tabpanel" aria-labelledby={`learning-tab-${activeTab}`}>
      {available.size === 0 && <div className="learning-empty">
        <Headphones size={28}/>
        <strong>本页暂无学习内容</strong>
        <p>翻到学习页，就能在这里点读单词、听课文音频和看课堂动漫。</p>
      </div>}
      {activeTab === 'words' && hasItems && <div className="learning-words">
        <section className="learning-now" aria-live="polite">
          <div className="learning-now-copy">
            <strong>{selected?.text ?? '点选课本上的单词'}</strong>
            <span>{selected ? (translation || (translating ? '正在翻译…' : translationMessage || '暂无中文释义')) : '点击书上的单词或图片开始点读。'}</span>
            <small>{playback.error || (playback.status === 'loading' ? '正在准备音频…' : playback.source || '支持单词、句子和整页连读')}</small>
          </div>
          <button className="learning-now-play" aria-label={playing ? '暂停点读' : playback.status === 'paused' ? '继续点读' : '播放选中内容'} disabled={!selected} onClick={onTogglePlayback}>
            {playing ? <Pause size={20}/> : <Play size={20}/>}
          </button>
        </section>
        <div className="learning-word-actions">
          <button className="learning-read-page" disabled={!items.length} onClick={onReadPage}><Headphones size={17}/><span>整页连读</span></button>
          {admin && <button className="learning-edit" disabled={!selected} onClick={onEdit}><Pencil size={15}/><span>编辑释义</span></button>}
          <button className="learning-stop" aria-label="停止点读" title="停止点读" disabled={playback.status === 'idle'} onClick={playback.stop}><Square size={15}/></button>
        </div>
        <div className="learning-word-list" aria-label="本页单词">
          {sortedItems.map(item => {
            const active = selected?.id === item.id
            return <button key={item.id} className={`learning-word${active ? ' is-active' : ''}`} aria-label={`点读 ${item.text}`} onClick={() => onPlayItem(item)}>
              <span className="learning-word-text">{item.text}</span>
              {item.translation && <small>{item.translation}</small>}
              {active && playing ? <Pause size={15}/> : <Play size={15}/>}
            </button>
          })}
        </div>
        <div className="learning-word-settings">
          <label>循环<select aria-label="朗读循环次数" value={repeat} onChange={event => onRepeat(Number(event.target.value))}><option value={1}>1 次</option><option value={3}>3 次</option><option value={0}>无限</option></select></label>
          <label>语速<select aria-label="朗读语速" value={speed} onChange={event => onSpeed(Number(event.target.value))}><option value={0.75}>0.75×</option><option value={1}>1.0×</option><option value={1.25}>1.25×</option></select></label>
        </div>
      </div>}
      {activeTab === 'resources' && <PageResources page={page} pageNumber={pageNumber} audio={pageAudio} onToggle={onToggleResource} onOpenVideo={onOpenVideo}/>}
      {activeTab === 'record' && <RecordingPanel profile={profile} bookId={bookId} page={pageIndex} items={sortedItems} selected={selected} onPlay={onPreviewItem} onBeforeRecord={onBeforeRecord} onSaved={onRecordingSaved}/>}
      {activeTab === 'practice' && <PracticePanel key={pageIndex} items={sortedItems} pool={pool} onPlay={onPreviewItem} onPlaySequence={onPlaySequence} onRecordItem={onRecordItem} onResult={onQuizResult}/>}
      {activeTab === 'review' && <ReviewPanel bookId={bookId} pool={pool} labelForPage={labelForPage} onPlay={onPreviewItem} onGoPage={onGoPage} nextPage={nextPage}/>}
    </div>
  </aside>
}
