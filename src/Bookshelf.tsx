import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { BookOpen, ChevronRight, Download, Headphones, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import './Bookshelf.css'
import RenameDialog from './RenameDialog'
import type { OnlineBook } from './reader/types'
import { onlineBookEdition, type PendingOnlineBook } from './onlineCatalog'
import { LOCAL_BOOKS_ENABLED } from './features'
type SavedBook={id:string;title:string;pages:number;lastPage:number}
const grades:Record<number,string>={3:'三年级',4:'四年级',5:'五年级',6:'六年级',7:'七年级',8:'八年级',9:'九年级'}
const coverArtNames:Record<number,[string,string]>={3:['school','friend'],4:['apple','cat'],5:['dog','book-fair'],6:['friend','school'],7:['great-wall','museum'],8:['earth','ocean'],9:['space','great-wall']}
const coverTones:Record<number,string>={3:'#0E5B43',4:'#8C6420',5:'#3C73B4',6:'#4B7D6B',7:'#A8532F',8:'#4A5A8C',9:'#6B4A7D'}
const coverArt=(book:{grade:number;term:'a'|'b'})=>`${import.meta.env.BASE_URL}assets/word-learning/generated/${(coverArtNames[book.grade]??coverArtNames[3])[book.term==='b'?1:0]}.webp`
const coverTone=(book:{grade:number})=>coverTones[book.grade]??'#0E5B43'
const termLabel=(term:'a'|'b')=>term==='a'?'上册':'下册'
const editionShort=(edition?:string)=>!edition?'PEP':edition.includes('新课标')?'新课标':edition.includes('老版')?'老版':edition.includes('初中')?'初中':edition.includes('新版')?'新版':'PEP'
const editionKind=(edition?:string)=>edition?.includes('新课标')?'new':edition?.includes('老版')?'classic':edition?.includes('初中')?'junior':edition?.includes('新版')?'fresh':'pep'
type CoverBook={grade:number;term:'a'|'b';edition?:string}
function BookCover({book,pending=false}:{book:CoverBook;pending?:boolean}){
 const kind=pending?'pending':editionKind(book.edition)
 return <div className={`book-cover term-${book.term} cover-${kind}${pending?' is-pending':''}`} style={{'--cover':pending?'#7C8A80':coverTone(book)} as CSSProperties} aria-hidden="true">
  <span className="cover-watermark">{book.grade}</span>
  <div className="cover-top"><span className="cover-series">{book.grade>=7?'人教版':'人教 PEP'}</span><span className="cover-series-sub">{book.grade>=7?'初中起点':'三年级起点'}</span></div>
  <div className="cover-title"><strong>英语</strong><span>ENGLISH</span></div>
  <div className="cover-window">{pending?<BookOpen className="cover-pending-icon" size={40}/>:<img src={coverArt(book)} alt=""/>}</div>
  <div className="cover-foot"><span className="cover-term"><strong>{grades[book.grade]}</strong><span>{termLabel(book.term)}</span></span><span className={`cover-edition cover-edition-${kind}`}>{pending?'待上线':editionShort(book.edition)}</span></div>
 </div>
}
function followAlongBook(grade:number){if(grade===6)return 'tape6a_002015';if(grade===3)return 'tape3a_002013';try{return localStorage.getItem('pep:followalong-book')??'tape3a_002013'}catch{return 'tape3a_002013'}}
export default function Bookshelf({books,catalog,pendingCatalog=[],onRead,onOnline,onImport,onRemove,onRename,onDictation,onFollowAlong,onDemo,onHelp}:{books:SavedBook[];catalog:OnlineBook[];pendingCatalog?:PendingOnlineBook[];onRead:(id:string)=>void;onOnline:(id:string)=>void;onFollowAlong:(bookId:string)=>void;onImport:(file?:File)=>Promise<void>;onRemove:(id:string)=>Promise<void>;onRename:(id:string,name:string)=>Promise<void>;onDictation:()=>void;onDemo:()=>void;onHelp:()=>void}){
 const [grade,setGrade]=useState(()=>{try{const n=Number(localStorage.getItem('pep:shelf-grade'));return n>=3&&n<=9?n:3}catch{return 3}}),[manage,setManage]=useState(false),[busy,setBusy]=useState(false),[deleting,setDeleting]=useState<string|null>(null)
 const [renaming,setRenaming]=useState<SavedBook|null>(null)
 const input=useRef<HTMLInputElement>(null)
 const available=catalog.filter(book=>book.grade===grade)
 const pending=pendingCatalog.filter(book=>book.grade===grade)
 const heroBook=available[0]??catalog.find(book=>book.grade===grade)??catalog[0]
 const stackBooks=[...available,...catalog].filter((book,index,list)=>list.findIndex(item=>item.id===book.id)===index).slice(0,3)
 async function importBook(file?:File){if(!file)return;setBusy(true);try{await onImport(file)}finally{setBusy(false);if(input.current)input.current.value=''}}
 async function removeBook(){if(!deleting)return;await onRemove(deleting);setDeleting(null)}
 return <div className="kids-bookshelf shelf-page"><header className="topbar"><div className="topbar-inner"><div className="brand"><span className="brand-mark" aria-hidden="true"><BookOpen size={19}/></span><span className="brand-text"><strong>英语课本点读</strong><span>PEP · 点读跟读</span></span></div><nav className="nav" aria-label="学习导航"><button className="nav-btn selected" aria-current="page">课本点读</button><button className="nav-btn" onClick={()=>onFollowAlong(followAlongBook(grade))}>跟读学习</button><button className="nav-btn" onClick={onDictation}>听写练习</button></nav>{LOCAL_BOOKS_ENABLED&&<button className="manage-btn" aria-pressed={manage} onClick={()=>setManage(value=>!value)}>{manage?'完成管理':'管理课本'}</button>}</div></header>
 <main className="shell shelf-main">
  <section className="hero" aria-labelledby="hero-title">
   <div className="hero-copy">
    <p className="kicker">人教 PEP · 三年级起点</p>
    <h1 id="hero-title">今天读哪一本？</h1>
    <p>选好年级，点开课本就能读。发音、跟读和听写都放在同一处，孩子自己也能找到。</p>
    <div className="hero-actions">
     <button className="btn btn-primary" disabled={!heroBook} onClick={()=>heroBook&&onOnline(heroBook.id)}>{heroBook?`继续${grades[grade]}${termLabel(heroBook.term)}`:'浏览在线课本'}</button>
     <button className="btn btn-ghost" onClick={()=>onFollowAlong(followAlongBook(grade))}>去跟读</button>
    </div>
   </div>
   <div className="hero-stack" aria-hidden="true">
    {stackBooks.map(book=><div className="stack-cover" key={`stack-${book.id}`}><BookCover book={book}/></div>)}
   </div>
  </section>

  <div className="section-head">
   <h2>在线课本</h2>
   <div className="grade-tabs" role="group" aria-label="选择年级">{Object.entries(grades).map(([n,label])=><button key={n} className={`grade-tab ${grade===Number(n)?'selected':''}`} aria-pressed={grade===Number(n)} onClick={()=>{setGrade(Number(n));try{localStorage.setItem('pep:shelf-grade',n)}catch{}}}>{label}</button>)}</div>
  </div>

  <div className={`book-grid${LOCAL_BOOKS_ENABLED?'':' no-local'}`}>
   {available.map(book=><article className="book-card kids-online-book" key={book.id}>
    <button className="book-card-open kids-online-card-open" aria-label={`打开 ${grades[book.grade]}${termLabel(book.term)} ${onlineBookEdition(book)}`} onClick={()=>onOnline(book.id)}>
     <BookCover book={book}/>
    </button>
    <div className="book-info"><div className="book-title-row"><h3>{grades[book.grade]} {termLabel(book.term)}</h3><span className="tag">E63 在线</span></div><p>{onlineBookEdition(book)} · 点读内容由 E63 提供</p><div className="book-actions"><span className="book-status">需要网络</span><button className="btn btn-small btn-ghost" onClick={()=>onOnline(book.id)}>打开课本</button></div></div>
   </article>)}
   {pending.map(book=><button disabled className="book-card kids-online-book is-unavailable" key={`${book.grade}-${book.term}-pending`} aria-label={`${grades[book.grade]}${termLabel(book.term)} ${book.edition} ${book.message}`}>
    <BookCover book={book} pending/>
    <div className="book-info"><div className="book-title-row"><h3>{grades[book.grade]} {termLabel(book.term)}</h3><span className="tag muted">待上线</span></div><p>{book.edition}</p><div className="book-actions"><span className="book-status">{book.message}</span></div></div>
   </button>)}
   {LOCAL_BOOKS_ENABLED&&<article className="book-card import-card"><button className="import-cover" disabled={busy} onClick={()=>input.current?.click()}><span className="import-plus" aria-hidden="true">＋</span><strong>{busy?'正在导入…':'导入本地教材'}</strong><span>支持 PDF / ZIP · 断网也能读</span></button></article>}
  </div>

  <section className="feature-band">
   <div className="feature-copy"><span className="feature-tag">跟读学习</span><h2>把单词读顺，再读整句</h2><p>教材原音、音标和中文释义放在同一张卡片上，重复遍数和语速都能调。孩子点一下就能听，不用来回找。</p><button className="btn btn-primary" onClick={()=>onFollowAlong(followAlongBook(grade))}>打开跟读学习</button></div>
   <div className="feature-art"><img src={`${import.meta.env.BASE_URL}assets/word-learning/generated/friend.webp`} alt="两个正在读书的孩子插画"/></div>
  </section>

  {LOCAL_BOOKS_ENABLED&&<section className="offline" aria-labelledby="my-books-heading">
   <div className="offline-head"><div><h2 id="my-books-heading">我的离线教材</h2><p>保存在本机，不上传课本和录音。</p></div><button className="btn btn-ghost btn-small" onClick={onHelp}>导入格式说明</button></div>
   {books.length?<div className="local-grid">{books.map(book=><article className="local-book" key={book.id}><div className="local-cover" aria-hidden="true"><BookOpen size={26}/><span>ENGLISH</span></div><div className="local-copy"><h3>{book.title}</h3><p>{book.lastPage?'上次读到第 '+(book.lastPage+1)+' 页':'共 '+book.pages+' 页'}</p><div className="local-actions"><button className="btn btn-small btn-primary" onClick={()=>onRead(book.id)}>继续阅读</button><button className="name-edit-button" aria-label={`修改课本名称 ${book.title}`} onClick={()=>setRenaming(book)}><Pencil size={14}/>修改名称</button>{manage&&<button className="local-remove" aria-label={`删除课本 ${book.title}`} onClick={()=>setDeleting(book.id)}><Trash2 size={15}/>删除</button>}</div></div></article>)}</div>:<div className="dropzone"><div className="dropzone-main"><span className="dropzone-icon" aria-hidden="true"><Upload size={20}/></span><div><h3>还没有离线教材</h3><p>导入教材 PDF 或 ZIP 包，断网也能点读和跟读。</p></div></div><div className="dropzone-actions"><button className="btn btn-ghost btn-small" onClick={onDemo}>试读原创样例</button><button className="btn btn-primary btn-small" disabled={busy} onClick={()=>input.current?.click()}>{busy?'正在导入…':'导入教材包'}</button></div></div>}
   <input className="kids-file" ref={input} type="file" accept=".pdf,.zip,application/pdf,application/zip" aria-label="导入课本文件" onChange={event=>void importBook(event.target.files?.[0])}/>
   {manage&&<div className="kids-management"><button onClick={()=>input.current?.click()} disabled={busy}><Plus size={17}/>添加 PDF / 教材包</button><button onClick={onHelp}><Download size={17}/>教材包说明</button><button onClick={onDemo}><Headphones size={17}/>添加原创示例</button></div>}
  </section>}

  <footer className="shelf-footer"><span>在线课本需要网络，支持电脑和手机浏览器。</span>{LOCAL_BOOKS_ENABLED&&<button className="footer-link" onClick={onHelp}>教材包格式<ChevronRight size={14}/></button>}</footer>
 </main>
 {renaming&&<RenameDialog title="修改教材名称" value={renaming.title} onClose={()=>setRenaming(null)} onSave={name=>onRename(renaming.id,name)}/>}
 {deleting&&<div className="modal-shade" onClick={()=>setDeleting(null)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="delete-book-title" onClick={event=>event.stopPropagation()}><h2 id="delete-book-title">删除这本课本？</h2><p>{books.find(book=>book.id===deleting)?.title}</p><div className="unit-delete-actions"><button className="soft-btn" onClick={()=>setDeleting(null)}>取消</button><button className="danger-btn" onClick={()=>void removeBook()}>确认删除</button></div></section></div>}
 </div>
}
