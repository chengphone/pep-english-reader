import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Clapperboard, Expand, Headphones, Minus, Plus, Scan, SlidersHorizontal, X } from 'lucide-react'
import ReaderPageSurface, { type PageFit } from './ReaderPageSurface'
import PageResources from './PageResources'
import ReadingAudioPanel from './ReadingAudioPanel'
import { useReadingFullscreen } from './useReadingFullscreen'
import type { LocalBook, ReaderItem } from './types'
import type { ReaderPlaybackStatus } from './useReaderPlayback'
import './Reader.css'
type Playback={status:ReaderPlaybackStatus;source:string;error:string;play:(item:ReaderItem,remaining?:ReaderItem[])=>void;stop:()=>void;toggle:(selected:ReaderItem|null)=>void}
export default function LocalReader({book,pageIndex,imageSrc,selected,translation,translating,translationMessage,repeat,speed,playback,onPage,onRepeat,onSpeed,onBack,onDictation,onSaveTranslation}:{book:LocalBook;pageIndex:number;imageSrc:string;selected:ReaderItem|null;translation?:string;translating:boolean;translationMessage?:string;repeat:number;speed:number;playback:Playback;onPage:(index:number)=>void;onRepeat:(value:number)=>void;onSpeed:(value:number)=>void;onBack:()=>void;onDictation:()=>void;onSaveTranslation:(text:string)=>Promise<void>}) {
 const fullscreen=useReadingFullscreen(),stage=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null)
 const [resourcesOpen,setResourcesOpen]=useState(false),[audioOpen,setAudioOpen]=useState(true)
 const [viewSettings,setViewSettings]=useState(false),[audioSettings,setAudioSettings]=useState(false)
 const [size,setSize]=useState({width:1000,height:700}),[fit,setFit]=useState<PageFit>('page'),[zoom,setZoom]=useState(1),[regions,setRegions]=useState(false),[pageInput,setPageInput]=useState(String(pageIndex+1))
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('')
 const page=book.manifest.pages[pageIndex],count=book.manifest.pages.length
 const pageResources=page?.resources??[],hasResources=book.manifest.pages.some(row=>row.resources?.length),hasItems=book.manifest.pages.some(row=>row.items.length)
 // 跨页音频在相邻页使用同一个 id / src：保持同一个 PageResources 实例，播放器就不会被卸载。
 const continuousResource=page?.resources?.find(resource=>resource.kind==='audio'&&resource.continuous)
 const resourceKey=continuousResource?`continuous:${continuousResource.id}:${continuousResource.src}`:`page:${pageIndex}`
 useEffect(()=>{const target=stage.current;if(!target)return;const measure=()=>{const bounds=target.getBoundingClientRect();setSize({width:bounds.width,height:bounds.height})};measure();const observer=new ResizeObserver(measure);observer.observe(target);return()=>observer.disconnect()},[])
 useEffect(()=>{setPageInput(String(pageIndex+1));scroll.current?.scrollTo({top:0,left:0})},[pageIndex])
 useEffect(()=>{const keyboard=(event:KeyboardEvent)=>{if(editing||document.querySelector('.page-video-backdrop')||(event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable],video'))return;if(event.key==='ArrowRight'&&pageIndex<count-1){event.preventDefault();onPage(pageIndex+1)}else if(event.key==='ArrowLeft'&&pageIndex>0){event.preventDefault();onPage(pageIndex-1)}};window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard)},[pageIndex,count,editing,onPage])
 function jump(){const number=Number(pageInput);if(Number.isFinite(number)&&pageInput.trim()){const target=Math.max(1,Math.min(count,Math.trunc(number)));if(target!==pageIndex+1)onPage(target-1);setPageInput(String(target))}else setPageInput(String(pageIndex+1))}
 function readPage(){if(!page)return;const [first,...remaining]=[...page.items].sort((a,b)=>a.order-b.order);if(first)playback.play(first,remaining)}
 function playItem(item:ReaderItem){if(hasItems&&!audioOpen){setAudioOpen(true);setResourcesOpen(false)}playback.play(item)}
 async function leave(action:()=>void){playback.stop();await fullscreen.leave();action()}
 async function save(){if(saving)return;setSaving(true);setSaveError('');try{await onSaveTranslation(draft);setEditing(false)}catch{setSaveError('保存失败，请重试。')}finally{setSaving(false)}}
 function toggleResources(){const next=!resourcesOpen;setResourcesOpen(next);if(next){playback.stop();setAudioOpen(false);setViewSettings(false)}}
 function toggleAudio(){const next=!audioOpen;setAudioOpen(next);if(next){setResourcesOpen(false);setViewSettings(false)}else{playback.stop();setAudioSettings(false)}}
 function closeAudio(){playback.stop();setAudioOpen(false);setAudioSettings(false)}
 function openTranslation(){setDraft(translation??'');setEditing(true);setSaveError('')}
 return <section ref={fullscreen.ref} className={`reading-shell local-reading ${fullscreen.expanded?'reading-expanded':''}`}>
  <div className={`reading-main${hasItems?' has-audio':''}${hasItems&&audioOpen?' audio-open':''}${resourcesOpen?' resources-open':''}`}>
   <aside className="reading-side reading-side-left" aria-label="阅读导航">
    <button className="reading-side-button" aria-label="返回书架" title="返回书架" onClick={()=>void leave(onBack)}><ArrowLeft size={19}/><span>书架</span></button>
    <h1 className="reading-side-title" title={book.remote?'在线阅读 · 无需下载':'本地教材 · 已保存到本机'}>{book.manifest.title}</h1>
    <div className="reading-side-nav">
     <button className="reading-side-button" aria-label="课本上一页" title="上一页" disabled={pageIndex===0} onClick={()=>onPage(pageIndex-1)}><ChevronLeft size={22}/><span>上一页</span></button>
     <form className="reading-side-page" onSubmit={event=>{event.preventDefault();jump()}}>
      <input aria-label="跳转页码" inputMode="numeric" value={pageInput} onChange={event=>setPageInput(event.target.value)} onBlur={jump}/>
      <span aria-hidden="true">/ {count}</span>
     </form>
     <button className="reading-side-button" aria-label="课本下一页" title="下一页" disabled={pageIndex>=count-1} onClick={()=>onPage(pageIndex+1)}><ChevronRight size={22}/><span>下一页</span></button>
    </div>
    {!book.remote&&<button className="reading-side-button reading-side-bottom" aria-label="听写练习" title="听写练习" onClick={()=>void leave(onDictation)}><Headphones size={18}/><span>听写</span></button>}
   </aside>
   <div className="reading-stage" ref={stage}>
    <div className="reading-scroll" ref={scroll}>
     <div className="reading-scroll-content">{page?<ReaderPageSurface source={book.assets['source.pdf']} imageSrc={imageSrc} page={page} size={size} fit={fit} zoom={zoom} selectedId={selected?.id} showRegions={regions} onPlay={playItem}/>:<div className="reading-page-status">这本教材暂无页面。</div>}</div>
    </div>
   </div>
   {hasItems&&audioOpen&&<ReadingAudioPanel page={page} selected={selected} translation={translation} translating={translating} translationMessage={translationMessage} repeat={repeat} speed={speed} playback={playback} settingsOpen={audioSettings} onSettings={()=>setAudioSettings(value=>!value)} onRepeat={onRepeat} onSpeed={onSpeed} onReadPage={readPage} onEdit={openTranslation} onClose={closeAudio}/>}
   {hasResources&&resourcesOpen&&<PageResources key={resourceKey} page={page} pageNumber={pageIndex+1} onClose={()=>setResourcesOpen(false)}/>}
   <aside className="reading-side reading-side-right" aria-label="阅读工具">
    {hasResources&&<button className={`reading-side-button${resourcesOpen?' is-active':''}`} aria-label="课堂资源" aria-expanded={resourcesOpen} aria-controls="reading-page-resources" title="课堂资源" onClick={toggleResources}><Clapperboard size={18}/><span>资源</span>{pageResources.length>0&&<b className="reading-side-badge">{pageResources.length}</b>}</button>}
    {hasItems&&<button className={`reading-side-button${audioOpen?' is-active':''}`} aria-label="朗读面板" aria-expanded={audioOpen} aria-controls="reading-audio-panel" title={audioOpen?'关闭朗读与翻译':'打开朗读与翻译'} onClick={toggleAudio}><Headphones size={18}/><span>朗读</span></button>}
    {(hasResources||hasItems)&&<div className="reading-side-divider"/>}
    <div className="reading-side-settings-wrap">
     <div id="reading-mobile-settings" className={`reading-side-view${viewSettings?' mobile-settings-open':''}`}>
      <select aria-label="页面适应方式" title={fit==='width'?'适合宽度':'适合整页'} value={fit} onChange={event=>{setFit(event.target.value as PageFit);setZoom(1)}}><option value="width">宽度</option><option value="page">整页</option></select>
      <div className="reading-side-zoom">
       <button aria-label="缩小课本" title="缩小" disabled={zoom<=.5} onClick={()=>setZoom(value=>Math.max(.5,Math.round((value-.1)*10)/10))}><Minus size={16}/></button>
       <button className="reading-side-zoom-reset" aria-label="恢复 100%" title="恢复 100%" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button>
       <button aria-label="放大课本" title="放大" disabled={zoom>=3} onClick={()=>setZoom(value=>Math.min(3,Math.round((value+.1)*10)/10))}><Plus size={16}/></button>
      </div>
      {hasItems&&<button className="reading-side-region" aria-label="点读区域" title="显示或隐藏点读区域" aria-pressed={regions} onClick={()=>setRegions(value=>!value)}><Scan size={17}/><span>点读</span></button>}
     </div>
     <button className="reading-side-settings" aria-label={viewSettings?'收起阅读设置':'阅读设置'} title="阅读设置" aria-expanded={viewSettings} aria-controls="reading-mobile-settings" onClick={()=>setViewSettings(value=>!value)}><SlidersHorizontal size={17}/><span>设置</span></button>
    </div>
    <div className="reading-side-divider"/>
    <button className="reading-side-button" aria-label={fullscreen.expanded?'退出全屏':'全屏阅读'} title={fullscreen.expanded?'退出全屏':'全屏阅读'} onClick={()=>void fullscreen.toggle()}><Expand size={18}/><span>全屏</span></button>
   </aside>
  </div>
  {editing&&<div className="reading-dialog-backdrop"><section className="reading-translation-dialog" role="dialog" aria-modal="true" aria-labelledby="reader-translation-title"><button aria-label="关闭翻译编辑" className="reading-dialog-close" disabled={saving} onClick={()=>setEditing(false)}><X size={21}/></button><h2 id="reader-translation-title">编辑中文释义</h2><p>{selected?.text}</p><textarea aria-label="中文翻译" value={draft} onChange={event=>setDraft(event.target.value)} autoFocus/>{saveError&&<p role="alert">{saveError}</p>}<div><button disabled={saving} onClick={()=>setEditing(false)}>取消</button><button className="reading-page-play" disabled={saving} onClick={()=>void save()}>{saving?'正在保存…':'保存翻译'}</button></div></section></div>}
 </section>
}
