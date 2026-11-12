import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { ReaderItem, ReaderPage } from './types'
import { pageDisplaySize, type PageFit } from './layout'
export type { PageFit } from './layout'

type Rect = [number, number, number, number]

type Props = {
  source?: Blob
  imageSrc: string
  page: ReaderPage
  size: { width: number; height: number }
  fit: PageFit
  zoom: number
  selectedId?: string
  showRegions: boolean
  focusRect?: Rect | null
  editing?: boolean
  onCreateRect?: (rect: Rect) => void
  onPlay: (item: ReaderItem) => void
  onPrev?: () => void
  onNext?: () => void
  canPrev?: boolean
  canNext?: boolean
}

function normalizedPoint(element: HTMLElement | null, clientX: number, clientY: number): [number, number] {
  if (!element) return [0, 0]
  const bounds = element.getBoundingClientRect()
  return [
    Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width))),
    Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(1, bounds.height))),
  ]
}

export default function ReaderPageSurface({ source, imageSrc, page, size, fit, zoom, selectedId, showRegions, focusRect, editing = false, onCreateRect, onPlay, onPrev, onNext, canPrev = true, canNext = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null)
  const [image, setImage] = useState<{ src: string; ratio: number } | null>(null)
  const [rendered, setRendered] = useState('')
  const [error, setError] = useState('')
  const [drag, setDrag] = useState<{ start: [number, number]; end: [number, number] } | null>(null)

  useEffect(() => {
    if (!source) {
      setDoc(null)
      return
    }
    let cancelled = false
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined
    setDoc(null)
    setPdfPage(null)
    setRendered('')
    setError('')
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        if (cancelled) return
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        task = pdfjs.getDocument({ data: await source.arrayBuffer(), iccUrl: import.meta.env.BASE_URL + 'pdfjs/iccs/', cMapUrl: import.meta.env.BASE_URL + 'pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: import.meta.env.BASE_URL + 'pdfjs/standard_fonts/', wasmUrl: import.meta.env.BASE_URL + 'pdfjs/wasm/', isOffscreenCanvasSupported: false, isImageDecoderSupported: false })
        const loaded = await task.promise
        if (!cancelled) setDoc(loaded)
      } catch {
        if (!cancelled) setError('PDF 加载失败，请返回书架重新打开。')
      }
    })()
    return () => { cancelled = true; void task?.destroy() }
  }, [source])

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    setPdfPage(null)
    setRendered('')
    setError('')
    void doc.getPage(page.page).then(value => { if (!cancelled) setPdfPage(value) }).catch(() => { if (!cancelled) setError('这一页读取失败，请重试翻页。') })
    return () => { cancelled = true }
  }, [doc, page.page])

  const viewport = pdfPage?.getViewport({ scale: 1 })
  const ratio = source ? (viewport ? viewport.height / viewport.width : Math.SQRT2) : (image?.src === imageSrc ? image.ratio : Math.SQRT2)
  const dimensions = pageDisplaySize(size.width, size.height, ratio, fit, zoom)

  useEffect(() => {
    if (!source || !pdfPage || pdfPage.pageNumber !== page.page) return
    let cancelled = false
    setRendered('')
    setError('')
    const scratch = document.createElement('canvas')
    const pageViewport = pdfPage.getViewport({ scale: dimensions.width / pdfPage.getViewport({ scale: 1 }).width })
    const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(16000000 / (pageViewport.width * pageViewport.height)))
    scratch.width = Math.ceil(pageViewport.width * dpr)
    scratch.height = Math.ceil(pageViewport.height * dpr)
    const task = pdfPage.render({ canvas: scratch, canvasContext: scratch.getContext('2d')!, viewport: pageViewport, transform: [dpr, 0, 0, dpr, 0, 0] })
    void task.promise.then(() => {
      if (cancelled || !canvasRef.current) return
      const canvas = canvasRef.current
      canvas.width = scratch.width
      canvas.height = scratch.height
      canvas.getContext('2d')!.drawImage(scratch, 0, 0)
      setRendered(`${page.page}:${dimensions.width}:${dimensions.height}`)
    }).catch(reason => {
      if (!cancelled && reason?.name !== 'RenderingCancelledException') setError('页面渲染失败，请调整缩放后重试。')
    }).finally(() => { scratch.width = 0; scratch.height = 0 })
    return () => { cancelled = true; task.cancel() }
  }, [source, pdfPage, page.page, dimensions.width, dimensions.height])

  // 局部聚焦：把选中的热区滚动到阅读区中央。尺寸变化要先等一帧再量。
  useEffect(() => {
    if (!focusRect) return
    const paper = paperRef.current
    const scroller = paper?.closest('.reading-scroll') as HTMLElement | null
    if (!paper || !scroller) return
    let frame = 0
    frame = requestAnimationFrame(() => {
      const paperBounds = paper.getBoundingClientRect()
      const scrollerBounds = scroller.getBoundingClientRect()
      const centerX = paperBounds.left + ((focusRect[0] + focusRect[2]) / 2) * paperBounds.width
      const centerY = paperBounds.top + ((focusRect[1] + focusRect[3]) / 2) * paperBounds.height
      scroller.scrollTo({
        left: Math.max(0, scroller.scrollLeft + centerX - (scrollerBounds.left + scrollerBounds.width / 2)),
        top: Math.max(0, scroller.scrollTop + centerY - (scrollerBounds.top + scrollerBounds.height / 2)),
        behavior: 'smooth',
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusRect, dimensions.width, dimensions.height])

  // 指针捕获后，React 合成事件的 currentTarget 在 move/up 阶段可能已经置空。
  // 统一以书页 paper 为坐标基准，既稳定又能避免热区绘制中途中断。
  function startDraw(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editing || event.button !== 0) return
    const point = normalizedPoint(paperRef.current, event.clientX, event.clientY)
    try { event.currentTarget?.setPointerCapture(event.pointerId) } catch { /* 合成事件或已释放的指针 */ }
    setDrag({ start: point, end: point })
  }
  function moveDraw(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return
    const point = normalizedPoint(paperRef.current, event.clientX, event.clientY)
    setDrag(current => current ? { ...current, end: point } : current)
  }
  function endDraw(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return
    const end = normalizedPoint(paperRef.current, event.clientX, event.clientY)
    const rect: Rect = [
      Math.min(drag.start[0], end[0]),
      Math.min(drag.start[1], end[1]),
      Math.max(drag.start[0], end[0]),
      Math.max(drag.start[1], end[1]),
    ]
    setDrag(null)
    if (rect[2] - rect[0] > 0.012 && rect[3] - rect[1] > 0.008) onCreateRect?.(rect)
  }
  const displayed = source ? rendered === `${page.page}:${dimensions.width}:${dimensions.height}` && pdfPage?.pageNumber === page.page : image?.src === imageSrc
  const preview = drag ? {
    left: Math.min(drag.start[0], drag.end[0]) * 100,
    top: Math.min(drag.start[1], drag.end[1]) * 100,
    width: Math.abs(drag.end[0] - drag.start[0]) * 100,
    height: Math.abs(drag.end[1] - drag.start[1]) * 100,
  } : null
  return <div className="reading-page-frame">
    {onPrev && <button type="button" className="reading-page-arrow previous" aria-label="课本上一页" title="上一页" disabled={!canPrev} onClick={onPrev}><ChevronLeft size={24}/></button>}
    <div ref={paperRef} className={`reading-paper${showRegions ? ' show-reading-regions' : ''}${focusRect ? ' is-focused' : ''}${editing ? ' is-editing-hotspots' : ''}`} data-page={page.page} data-ready={displayed ? 'true' : 'false'} style={{ width: dimensions.width, height: dimensions.height }}>
      {source ? <canvas ref={canvasRef} aria-label={`PDF 第 ${page.page} 页`}/> : <img src={imageSrc} alt={`课本第 ${page.printedPage ?? page.page} 页`} fetchPriority="high" decoding="async" onLoad={event => { setImage({ src: imageSrc, ratio: event.currentTarget.naturalHeight / event.currentTarget.naturalWidth }); setError('') }} onError={() => setError('页面图片无法加载，请检查教材包。')}/>}
      {(!displayed || error) && <div className="reading-page-status" role="status">{error || '正在显示课本…'}</div>}
      {displayed && !error && page.items.map(item => item.rects.map(([left, top, right, bottom], index) => <button key={item.id + ':' + index} className={`reading-region ${selectedId === item.id ? 'selected' : ''}`} tabIndex={editing ? -1 : index === 0 ? 0 : -1} aria-label={`播放 ${item.text}`} style={{ left: `${left * 100}%`, top: `${top * 100}%`, width: `${(right - left) * 100}%`, height: `${(bottom - top) * 100}%` }} onClick={() => { if (!editing) onPlay(item) }}/>))}
      {editing && <div className="hotspot-draw-layer" onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={() => setDrag(null)}>
        {preview && <span className="hotspot-draw-preview" style={preview}/>}
      </div>}
    </div>
    {onNext && <button type="button" className="reading-page-arrow next" aria-label="课本下一页" title="下一页" disabled={!canNext} onClick={onNext}><ChevronRight size={24}/></button>}
  </div>
}
