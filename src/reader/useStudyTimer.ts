import { useEffect } from 'react'
import { recordStudySeconds } from './learningStore'

// 只统计页面可见时的阅读时长；翻页或离开阅读器时立即结算。
export function useStudyTimer(bookId: string, page: number) {
  useEffect(() => {
    let started = document.visibilityState === 'visible' ? Date.now() : 0
    let disposed = false
    const flush = () => {
      if (!started) return
      const seconds = (Date.now() - started) / 1000
      started = Date.now()
      if (seconds >= 1) recordStudySeconds(seconds)
    }
    const timer = window.setInterval(flush, 60_000)
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        flush()
        started = 0
      } else if (!started) {
        started = Date.now()
      }
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      if (disposed) return
      disposed = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      flush()
    }
  }, [bookId, page])
}
