import type { PictureMode } from './pictureBooks'

export type PictureQuizMode = 'comprehension' | 'vocabulary'
export type AppRoute =
  | { kind: 'shelf' }
  | { kind: 'textbooks' }
  | { kind: 'library' }
  | { kind: 'practice' }
  | { kind: 'picture'; bookId: string; page: number; mode?: PictureMode }
  | { kind: 'quiz'; bookId: string; mode: PictureQuizMode }
  | { kind: 'local'; bookId: string; page: number }
  | { kind: 'remote'; bookId: string; page: number }
  | { kind: 'online'; bookId: string }
  | { kind: 'followalong'; bookId: string; unitId: string }
  | { kind: 'vocab' }
export const routeKey = 'pep-english-reader'
type HistoryState = { key?: string; idx?: number; route?: AppRoute }
export function readAppHistory(state: unknown): HistoryState | undefined {
  const value = state && typeof state === 'object' ? state as HistoryState : {}
  return value.key === routeKey && Number.isInteger(value.idx) && value.idx! >= 0 && value.route ? value : undefined
}
export function routeFromUrl(url: URL): AppRoute {
  const app = url.searchParams.get('view'), id = url.searchParams.get('book')
  if (app === 'online' && id) return { kind: 'online', bookId: id }
  if (app === 'followalong' && id) return { kind: 'followalong', bookId: id, unitId: url.searchParams.get('unit') ?? '' }
  if (app === 'picture' && id) {
    const requested = Number(url.searchParams.get('page'))
    const page = Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 0
    const requestedMode = url.searchParams.get('mode')
    const mode = requestedMode === 'listen' || requestedMode === 'self' || requestedMode === 'practice' ? requestedMode : undefined
    return { kind: 'picture', bookId: id, page, ...(mode ? { mode } : {}) }
  }
  if (app === 'quiz' && id) {
    const mode = url.searchParams.get('mode') === 'comprehension' ? 'comprehension' : 'vocabulary'
    return { kind: 'quiz', bookId: id, mode }
  }
  if (app === 'textbooks') return { kind: 'textbooks' }
  if (app === 'library') return { kind: 'library' }
  if (app === 'practice') return { kind: 'practice' }
  if ((app === 'local' || app === 'remote') && id) {
    const requested = Number(url.searchParams.get('page'))
    const page = Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 0
    return { kind: app, bookId: id, page }
  }
  if (app === 'vocab') return { kind: 'vocab' }
  return { kind: 'shelf' }
}
export function writeRouteUrl(route: AppRoute) {
  const url = new URL(location.href)
  for (const key of ['view', 'book', 'page', 'unit', 'mode']) url.searchParams.delete(key)
  if (route.kind === 'online') { url.searchParams.set('view', 'online'); url.searchParams.set('book', route.bookId) }
  if (route.kind === 'followalong') { url.searchParams.set('view', 'followalong'); url.searchParams.set('book', route.bookId); if (route.unitId) url.searchParams.set('unit', route.unitId) }
  if (route.kind === 'local' || route.kind === 'remote') { url.searchParams.set('view', route.kind); url.searchParams.set('book', route.bookId); url.searchParams.set('page', String(route.page)) }
  if (route.kind === 'picture') { url.searchParams.set('view', 'picture'); url.searchParams.set('book', route.bookId); url.searchParams.set('page', String(route.page)); if (route.mode) url.searchParams.set('mode', route.mode) }
  if (route.kind === 'quiz') { url.searchParams.set('view', 'quiz'); url.searchParams.set('book', route.bookId); url.searchParams.set('mode', route.mode) }
  if (route.kind === 'textbooks') url.searchParams.set('view', 'textbooks')
  if (route.kind === 'library') url.searchParams.set('view', 'library')
  if (route.kind === 'practice') url.searchParams.set('view', 'practice')
  if (route.kind === 'vocab') url.searchParams.set('view', 'vocab')
  return url.href
}
export function navigationTarget(event: PopStateEvent) { return readAppHistory(event.state) }
export function writeAppState(route: AppRoute, index: number) {
  return { ...(history.state && typeof history.state === 'object' ? history.state : {}), key: routeKey, idx: index, route }
}
