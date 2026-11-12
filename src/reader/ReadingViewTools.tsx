import { useEffect, useRef, useState } from 'react'
import { Crosshair, Expand, Focus, Minus, PenLine, Plus, Scan, Shrink, SlidersHorizontal, X } from 'lucide-react'
import type { PageFit } from './layout'

type Props = {
  fit: PageFit
  zoom: number
  regions: boolean
  hasItems: boolean
  focus: boolean
  focusAvailable: boolean
  editing: boolean
  fullscreen: boolean
  admin: boolean
  onFit: (value: PageFit) => void
  onZoom: (value: number) => void
  onRegions: () => void
  onFocus: () => void
  onClean: () => void
  onFullscreen: () => void
  onEditHotspots: () => void
}

// 书页右上角只默认露出一个“视图”按钮，页面/学习/显示/管理设置都在弹出菜单里。
// 热区标注属于管理功能，只有教师模式解锁后才渲染。
export default function ReadingViewTools({ fit, zoom, regions, hasItems, focus, focusAvailable, editing, fullscreen, admin, onFit, onZoom, onRegions, onFocus, onClean, onFullscreen, onEditHotspots }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const clampZoom = (value: number) => Math.max(0.5, Math.min(3, Math.round(value * 10) / 10))

  useEffect(() => {
    if (!open) return
    const pointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('pointerdown', pointer)
      document.removeEventListener('keydown', keyboard)
    }
  }, [open])

  function run(action: () => void) {
    setOpen(false)
    action()
  }

  return <div ref={root} className={`reading-view-tools${open ? ' is-open' : ''}`}>
    <button className="reading-view-tools-toggle" aria-label={open ? '收起视图设置' : '展开视图设置'} aria-expanded={open} aria-controls="reading-view-tools-menu" title="视图" onClick={() => setOpen(value => !value)}>
      {open ? <X size={18}/> : <SlidersHorizontal size={18}/>}
      <span>视图</span>
    </button>
    <div className="reading-view-tools-menu" id="reading-view-tools-menu" role="group" aria-label="阅读视图设置">
      <section className="reading-view-tools-group">
        <span className="reading-view-tools-label">页面</span>
        <div className="reading-view-tools-segment" role="group" aria-label="页面适应方式">
          <button type="button" className={fit === 'width' ? 'is-active' : ''} aria-pressed={fit === 'width'} onClick={() => { onFit('width'); onZoom(1) }}>宽度</button>
          <button type="button" className={fit === 'page' ? 'is-active' : ''} aria-pressed={fit === 'page'} onClick={() => { onFit('page'); onZoom(1) }}>整页</button>
        </div>
        <div className="reading-view-tools-stepper" aria-label="缩放">
          <button type="button" aria-label="缩小课本" title="缩小" disabled={zoom <= 0.5} onClick={() => onZoom(clampZoom(zoom - 0.1))}><Minus size={16}/></button>
          <button type="button" className="reading-view-tools-reset" aria-label="恢复 100%" title="恢复 100%" onClick={() => onZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="放大课本" title="放大" disabled={zoom >= 3} onClick={() => onZoom(clampZoom(zoom + 0.1))}><Plus size={16}/></button>
        </div>
      </section>
      {(hasItems || focusAvailable) && <section className="reading-view-tools-group">
        <span className="reading-view-tools-label">学习</span>
        {hasItems && <button type="button" className="reading-view-tools-row" aria-pressed={regions} onClick={onRegions}><Scan size={16}/><span>点读区域</span><b>{regions ? '开' : '关'}</b></button>}
        {focusAvailable && <button type="button" className={`reading-view-tools-row${focus ? ' is-active' : ''}`} aria-pressed={focus} onClick={onFocus}><Crosshair size={16}/><span>局部聚焦</span><b>{focus ? '开' : '关'}</b></button>}
      </section>}
      <section className="reading-view-tools-group">
        <span className="reading-view-tools-label">显示</span>
        <button type="button" className="reading-view-tools-row" onClick={() => run(onClean)}><Focus size={16}/><span>纯净阅读</span></button>
        <button type="button" className="reading-view-tools-row" onClick={() => run(onFullscreen)}>{fullscreen ? <Shrink size={16}/> : <Expand size={16}/>}<span>{fullscreen ? '退出全屏' : '全屏阅读'}</span></button>
      </section>
      {admin && <section className="reading-view-tools-group">
        <span className="reading-view-tools-label">管理</span>
        <button type="button" className={`reading-view-tools-row reading-view-tools-edit${editing ? ' is-active' : ''}`} aria-pressed={editing} onClick={() => run(onEditHotspots)}><PenLine size={16}/><span>{editing ? '退出热区标注' : '标注热区'}</span></button>
      </section>}
    </div>
  </div>
}
