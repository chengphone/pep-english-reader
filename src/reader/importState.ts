import type { LocalBook } from './types'

export function importRouteIsCurrent(startRevision: number, currentRevision: number): boolean {
  return startRevision === currentRevision
}

export function upsertImportedBook(books: LocalBook[], imported: LocalBook): LocalBook[] {
  const index = books.findIndex(book => book.id === imported.id)
  if (index < 0) return [...books, imported]
  return books.map(book => book.id === imported.id ? imported : book)
}
