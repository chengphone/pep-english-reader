import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { ReaderItem, ReaderPage } from './types'
import { pageDisplaySize, type PageFit } from './layout'
export type { PageFit } from './layout'
export default function ReaderPageSurface({source,imageSrc,page,size,fit,zoom,selectedId,showRegions,onPlay}:{source?:Blob;imageSrc:string;page:ReaderPage;size:{width:number;height:number};fit:PageFit;zoom:number;selectedId?:string;showRegions:boolean;onPlay:(item:ReaderItem)=>void}) {
 const canvasRef=useRef<HTMLCanvasElement>(null),[doc,setDoc]=useState<PDFDocumentProxy|null>(null),[pdfPage,setPdfPage]=useState<PDFPageProxy|null>(null)
 const [image,setImage]=useState<{src:string;ratio:number}|null>(null),[rendered,setRendered]=useState(''),[error,setError]=useState('')
 useEffect(()=>{
  if(!source){setDoc(null);return}
  let cancelled=false,task:ReturnType<typeof import('pdfjs-dist')['getDocument']>|undefined
  setDoc(null);setPdfPage(null);setRendered('');setError('')
  void(async()=>{try{const pdfjs=await import('pdfjs-dist'),worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');if(cancelled)return;pdfjs.GlobalWorkerOptions.workerSrc=worker.default;task=pdfjs.getDocument({data:await source.arrayBuffer(),iccUrl:import.meta.env.BASE_URL+'pdfjs/iccs/',cMapUrl:import.meta.env.BASE_URL+'pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:import.meta.env.BASE_URL+'pdfjs/standard_fonts/',wasmUrl:import.meta.env.BASE_URL+'pdfjs/wasm/',isOffscreenCanvasSupported:false,isImageDecoderSupported:false});const loaded=await task.promise;if(!cancelled)setDoc(loaded)}catch{if(!cancelled)setError('PDF 加载失败，请返回书架重新打开。')}})()
  return()=>{cancelled=true;void task?.destroy()}
 },[source])
 useEffect(()=>{if(!doc)return;let cancelled=false;setPdfPage(null);setRendered('');setError('');void doc.getPage(page.page).then(value=>{if(!cancelled)setPdfPage(value)}).catch(()=>{if(!cancelled)setError('这一页读取失败，请重试翻页。')});return()=>{cancelled=true}},[doc,page.page])
 const viewport=pdfPage?.getViewport({scale:1}),ratio=source?(viewport?viewport.height/viewport.width:Math.SQRT2):(image?.src===imageSrc?image.ratio:Math.SQRT2)
 const dimensions=pageDisplaySize(size.width,size.height,ratio,fit,zoom)
 useEffect(()=>{
  if(!source||!pdfPage||pdfPage.pageNumber!==page.page)return
  let cancelled=false;setRendered('');setError('')
  const scratch=document.createElement('canvas'),viewport=pdfPage.getViewport({scale:dimensions.width/pdfPage.getViewport({scale:1}).width})
  const dpr=Math.min(window.devicePixelRatio||1,Math.sqrt(16000000/(viewport.width*viewport.height)))
  scratch.width=Math.ceil(viewport.width*dpr);scratch.height=Math.ceil(viewport.height*dpr)
  const task=pdfPage.render({canvas:scratch,canvasContext:scratch.getContext('2d')!,viewport,transform:[dpr,0,0,dpr,0,0]})
  void task.promise.then(()=>{if(cancelled||!canvasRef.current)return;const canvas=canvasRef.current;canvas.width=scratch.width;canvas.height=scratch.height;canvas.getContext('2d')!.drawImage(scratch,0,0);setRendered(`${page.page}:${dimensions.width}:${dimensions.height}`)}).catch(reason=>{if(!cancelled&&reason?.name!=='RenderingCancelledException')setError('页面渲染失败，请调整缩放后重试。')}).finally(()=>{scratch.width=0;scratch.height=0})
  return()=>{cancelled=true;task.cancel()}
 },[source,pdfPage,page.page,dimensions.width,dimensions.height])
 const displayed=source?rendered===`${page.page}:${dimensions.width}:${dimensions.height}`&&pdfPage?.pageNumber===page.page:image?.src===imageSrc
 return <div className={`reading-paper ${showRegions?'show-reading-regions':''}`} data-page={page.page} data-ready={displayed?'true':'false'} style={{width:dimensions.width,height:dimensions.height}}>{source?<canvas ref={canvasRef} aria-label={`PDF 第 ${page.page} 页`}/>:<img src={imageSrc} alt={`课本第 ${page.printedPage??page.page} 页`} onLoad={event=>{setImage({src:imageSrc,ratio:event.currentTarget.naturalHeight/event.currentTarget.naturalWidth});setError('')}} onError={()=>setError('页面图片无法加载，请检查教材包。')}/ >}{(!displayed||error)&&<div className="reading-page-status" role="status">{error||'正在显示课本…'}</div>}{displayed&&!error&&page.items.map(item=>item.rects.map(([left,top,right,bottom],index)=><button key={item.id+':'+index} className={`reading-region ${selectedId===item.id?'selected':''}`} tabIndex={index===0?0:-1} aria-label={`播放 ${item.text}`} style={{left:`${left*100}%`,top:`${top*100}%`,width:`${(right-left)*100}%`,height:`${(bottom-top)*100}%`}} onClick={()=>onPlay(item)}/>))}</div>
}
