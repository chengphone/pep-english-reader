import type { CSSProperties } from 'react'
import { BookOpen } from 'lucide-react'
import type { OnlineBook } from '../reader/types'
import { onlineBookEdition, type PendingOnlineBook } from '../onlineCatalog'

export const grades: Record<number, string> = { 3: '三年级', 4: '四年级', 5: '五年级', 6: '六年级', 7: '七年级', 8: '八年级', 9: '九年级' }
const coverArtNames: Record<number, [string, string]> = { 3: ['school', 'friend'], 4: ['apple', 'cat'], 5: ['dog', 'book-fair'], 6: ['friend', 'school'], 7: ['great-wall', 'museum'], 8: ['earth', 'ocean'], 9: ['space', 'great-wall'] }
const coverTones: Record<number, string> = { 3: '#0E5B43', 4: '#8C6420', 5: '#3C73B4', 6: '#4B7D6B', 7: '#A8532F', 8: '#4A5A8C', 9: '#6B4A7D' }
export const coverArt = (book: { grade: number; term: 'a' | 'b' }) => `${import.meta.env.BASE_URL}assets/word-learning/generated/${(coverArtNames[book.grade] ?? coverArtNames[3])[book.term === 'b' ? 1 : 0]}.webp`
export const coverTone = (book: { grade: number }) => coverTones[book.grade] ?? '#0E5B43'
export const termLabel = (term: 'a' | 'b') => term === 'a' ? '上册' : '下册'
export const editionShort = (edition?: string) => !edition ? 'PEP' : edition.includes('新课标') ? '新课标' : edition.includes('老版') ? '老版' : edition.includes('初中') ? '初中' : edition.includes('新版') ? '新版' : 'PEP'
export const editionKind = (edition?: string) => edition?.includes('新课标') ? 'new' : edition?.includes('老版') ? 'classic' : edition?.includes('初中') ? 'junior' : edition?.includes('新版') ? 'fresh' : 'pep'

export type CoverBook = { grade: number; term: 'a' | 'b'; edition?: string }

export function BookCover({ book, pending = false }: { book: CoverBook; pending?: boolean }) {
  const kind = pending ? 'pending' : editionKind(book.edition)
  return <div className={`book-cover term-${book.term} cover-${kind}${pending ? ' is-pending' : ''}`} style={{ '--cover': pending ? '#7C8A80' : coverTone(book) } as CSSProperties} aria-hidden="true">
    <span className="cover-watermark">{book.grade}</span>
    <div className="cover-top"><span className="cover-series">{book.grade >= 7 ? '人教版' : '人教 PEP'}</span><span className="cover-series-sub">{book.grade >= 7 ? '初中起点' : '三年级起点'}</span></div>
    <div className="cover-title"><strong>英语</strong><span>ENGLISH</span></div>
    <div className="cover-window">{pending ? <BookOpen className="cover-pending-icon" size={40}/> : <img src={coverArt(book)} alt=""/>}</div>
    <div className="cover-foot"><span className="cover-term"><strong>{grades[book.grade]}</strong><span>{termLabel(book.term)}</span></span><span className={`cover-edition cover-edition-${kind}`}>{pending ? '待上线' : editionShort(book.edition)}</span></div>
  </div>
}

export function OnlineCover({ book, pending = false }: { book: OnlineBook; pending?: boolean }) {
  return <BookCover book={book} pending={pending}/>
}

export function onlineLabel(book: OnlineBook) {
  return `${grades[book.grade]}${termLabel(book.term)} ${onlineBookEdition(book)}`
}

export function pendingLabel(book: PendingOnlineBook) {
  return `${grades[book.grade]}${termLabel(book.term)} ${book.edition}`
}
