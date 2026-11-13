import type { AppRoute } from './AppNavigation'

export type ReloadState = {
  updateReady: boolean
  mode: 'shelf' | 'vocab'
  hasActiveBook: boolean
  online: boolean
  helpOpen: boolean
  routeKind: AppRoute['kind']
  messageKind: 'success' | 'error' | 'progress'
}

// 自动刷新会丢弃当前页面的内存状态；绘本阅读、绘本小测和跟读/录音期间
// 必须等用户自己决定，不能在新版本就绪时直接替换页面。
export function shouldReloadForUpdate(state: ReloadState): boolean {
  if (!state.updateReady || state.mode !== 'shelf') return false
  if (state.hasActiveBook || state.online || state.helpOpen) return false
  if (state.routeKind === 'followalong' || state.routeKind === 'picture' || state.routeKind === 'quiz') return false
  if (state.messageKind === 'progress') return false
  return true
}
