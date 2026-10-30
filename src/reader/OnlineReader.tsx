import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Expand, Headphones, Minimize2, MoreVertical, RotateCw, ScanEye, X } from 'lucide-react'
import { useReadingFullscreen } from './useReadingFullscreen'
import type { OnlineBook } from './types'
import './Reader.css'
import { onlineBookLabel as label } from '../onlineCatalog'

export default function OnlineReader({catalog,selectedId,onBack,onDictation,onFollowAlong}:{catalog:OnlineBook[];selectedId:string;onBack:()=>void;onDictation:()=>void;onFollowAlong:()=>void}) {
 const fullscreen=useReadingFullscreen(),menuButton=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null)
 const [focus,setFocus]=useState(false),[menuOpen,setMenuOpen]=useState(false),[reload,setReload]=useState(0),[loading,setLoading]=useState(true),[slow,setSlow]=useState(false),[offline,setOffline]=useState(!navigator.onLine)
 const selected=catalog.find(book=>book.id===selectedId)??catalog[0],url=`https://dd.e63.cn/reader.html?book=${encodeURIComponent(selected.id)}`
 useEffect(()=>{setLoading(true);setSlow(false);const timer=setTimeout(()=>setSlow(true),12000);return()=>clearTimeout(timer)},[selectedId,reload])
 useEffect(()=>{const update=()=>setOffline(!navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
 useEffect(()=>{if(!menuOpen)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenuOpen(false);menuButton.current?.focus()}};const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!menuButton.current?.contains(event.target as Node))setMenuOpen(false)};document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',outside)}},[menuOpen])
 async function leave(action:()=>void){setMenuOpen(false);await fullscreen.leave();action()}
 function retry(){setMenuOpen(false);setReload(value=>value+1)}
 return <section ref={fullscreen.ref} className={`reading-shell online-reading ${fullscreen.expanded?'reading-expanded':''} ${focus?'reading-focused':''}`}>
  <header className="online-reader-header">
   <button className="online-reader-back" onClick={()=>void leave(onBack)}><ArrowLeft size={19}/><span>返回书架</span></button>
   <div className="online-reader-title"><h1>{selected.grade}年级英语{selected.term==='a'?'上':'下'}册</h1><span>在线课本</span></div>
   <button className="online-reader-focus" aria-label={focus?'退出专注':'专注阅读'} aria-pressed={focus} onClick={()=>setFocus(value=>!value)}>{focus?<Minimize2 size={19}/>:<ScanEye size={19}/>}<span>{focus?'退出专注':'专注阅读'}</span></button>
   <div className="online-reader-menu-wrap" ref={menu}>
    <button ref={menuButton} className="online-reader-more" aria-label="更多阅读操作" aria-expanded={menuOpen} aria-controls="online-reader-menu" onClick={()=>setMenuOpen(value=>!value)}>{menuOpen?<X size={20}/>:<MoreVertical size={20}/>}<span>更多</span></button>
    {menuOpen&&<div id="online-reader-menu" className="online-reader-menu" role="menu">{['tape3a_002013','tape6a_002015'].includes(selected.id)&&<button role="menuitem" onClick={()=>{setMenuOpen(false);onFollowAlong()}}><Headphones size={18}/>跟读学习</button>}<button role="menuitem" onClick={retry}><RotateCw size={18}/>重新加载</button><button role="menuitem" onClick={()=>{setMenuOpen(false);void fullscreen.toggle()}}><Expand size={18}/>{fullscreen.expanded?'退出全屏':'全屏阅读'}</button><button role="menuitem" onClick={()=>void leave(onDictation)}><Headphones size={18}/>听写练习</button></div>}
   </div>
  </header>
  <div className="online-reading-stage">{offline&&<div className="online-reading-notice" role="status">当前没有网络，在线课本暂时无法加载。<button onClick={()=>void leave(onBack)}>返回书架</button></div>}{loading&&<div className="online-reading-loading" role="status">{slow?<>课本加载较慢，请检查网络后重试。<button onClick={retry}>重新加载</button></>:'正在打开在线课本…'}</div>}<div className="online-reader-back-shield" aria-hidden="true"/><iframe key={selected.id+':'+reload} title={`E63 ${label(selected)}`} src={url} allow="autoplay; fullscreen" allowFullScreen onLoad={()=>setLoading(false)}/></div>
  <footer className="online-reading-footer"><span>在线课本需要网络，点读和翻页请使用课本内的按钮。</span></footer>
 </section>
}
