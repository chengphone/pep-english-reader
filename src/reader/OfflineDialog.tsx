import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CloudDownload, Database, Trash2, WifiOff, X } from 'lucide-react'
import { cacheBook, estimateStorage, offlineStatus, removeBookCache, type OfflineMeta, type OfflineProgress } from './offlineBooks'
import type { LocalBook } from './types'

type Props = {
  book: LocalBook
  onClose: () => void
}

function bytes(value: number) {
  if (!value) return '未知大小'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function date(stamp: number) {
  return new Date(stamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function OfflineDialog({ book, onClose }: Props) {
  const [meta, setMeta] = useState<OfflineMeta | undefined>(() => offlineStatus(book.id))
  const [progress, setProgress] = useState<OfflineProgress | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [storage, setStorage] = useState({ usage: 0, quota: 0 })
  const [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    void estimateStorage().then(setStorage).catch(() => {})
    return () => controller.current?.abort()
  }, [])

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [onClose])

  async function download() {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    const abort = new AbortController()
    controller.current = abort
    try {
      const result = await cacheBook(book, setProgress, abort.signal)
      setMeta(result.meta)
      setNotice(result.failures.length ? `已保存大部分资源，但有 ${result.failures.length} 个文件失败；联网后可以再点一次补齐。` : '已保存到本机，断网后也能打开这本书。')
      setStorage(await estimateStorage())
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') setNotice('已取消离线下载。')
      else setError(reason instanceof Error ? reason.message : '离线下载失败，请重试。')
    } finally {
      setBusy(false)
      setProgress(null)
      controller.current = null
    }
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await removeBookCache(book.id)
      setMeta(undefined)
      setNotice('已移除这本书的离线缓存。')
      setStorage(await estimateStorage())
    } catch {
      setError('移除离线缓存失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  const percent = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0
  return <div className="learning-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="learning-offline-dialog" role="dialog" aria-modal="true" aria-labelledby="learning-offline-title">
      <header className="learning-dialog-head">
        <div>
          <span className="page-resources-kicker">离线阅读</span>
          <h2 id="learning-offline-title">{book.manifest.title}</h2>
        </div>
        <button aria-label="关闭离线设置" title="关闭" onClick={onClose}><X size={19}/></button>
      </header>
      {!book.remote ? <div className="offline-local">
        <CheckCircle2 size={28}/>
        <strong>本机教材已经可以离线使用</strong>
        <p>页面、音频和视频保存在浏览器 IndexedDB 中，不依赖网络。清理浏览器站点数据会同时移除这本教材。</p>
      </div> : <>
        {meta && <div className="offline-cached">
          <CheckCircle2 size={22}/>
          <div>
            <strong>已保存到本机</strong>
            <small>{date(meta.cachedAt)} · {bytes(meta.bytes)} · {meta.urls.length} 个资源</small>
          </div>
        </div>}
        {progress && <div className="offline-progress">
          <div className="offline-progress-head"><span>正在下载页面和音视频…</span><b>{percent}%</b></div>
          <div className="offline-progress-track"><i style={{ width: `${percent}%` }}/></div>
          <small>{progress.done} / {progress.total} 个资源 · 已接收 {bytes(progress.bytes)}</small>
        </div>}
        {notice && <p className="offline-notice" role="status">{notice}</p>}
        {error && <p className="offline-error" role="alert">{error}</p>}
        <div className="offline-actions">
          {busy && progress ? <button className="offline-secondary" onClick={() => controller.current?.abort()}><WifiOff size={16}/>取消下载</button>
            : <button className="offline-primary" disabled={busy} onClick={() => void download()}><CloudDownload size={17}/>{meta ? '补齐或更新离线资源' : '保存本书离线'}</button>}
          {meta && !busy && <button className="offline-danger" onClick={() => void remove()}><Trash2 size={16}/>移除缓存</button>}
        </div>
        <p className="offline-hint">离线保存会下载页面图片、课堂音频和动漫视频，教材包较大时可能需要几分钟。视频播放仍需要服务器支持 Range 请求；离线缓存按完整文件保存。</p>
      </>}
      <footer className="offline-storage">
        <Database size={15}/>
        <span>浏览器已用 {bytes(storage.usage)}{storage.quota ? ` / 可用约 ${bytes(storage.quota)}` : ''}</span>
      </footer>
    </section>
  </div>
}
