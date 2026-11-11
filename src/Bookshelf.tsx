import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, BookOpen, ChevronRight, Clapperboard, Download, Headphones, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import './Bookshelf.css'
import RenameDialog from './RenameDialog'
import type { OnlineBook, RemoteBookEntry } from './reader/types'
import { onlineBookEdition, type PendingOnlineBook } from './onlineCatalog'
import { LOCAL_BOOKS_ENABLED } from './features'
type SavedBook={id:string;title:string;pages:number;lastPage:number}
type RemoteShelfBook=RemoteBookEntry&{lastPage:number}
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
export default function Bookshelf({books,remoteBooks,catalog,pendingCatalog=[],onRead,onRemote,onOnline,onImport,onRemove,onRename,onDictation,onFollowAlong,onDemo,onHelp}:{books:SavedBook[];remoteBooks:RemoteShelfBook[];catalog:OnlineBook[];pendingCatalog?:PendingOnlineBook[];onRead:(id:string)=>void;onRemote:(id:string)=>void;onOnline:(id:string)=>void;onFollowAlong:(bookId:string)=>void;onImport:(file?:File)=>Promise<void>;onRemove:(id:string)=>Promise<void>;onRename:(id:string,name:string)=>Promise<void>;onDictation:()=>void;onDemo:()=>void;onHelp:()=>void}){
 const [grade,setGrade]=useState(()=>{try{const n=Number(localStorage.getItem('pep:shelf-grade'));return n>=3&&n<=9?n:3}catch{return 3}}),[manage,setManage]=useState(false),[busy,setBusy]=useState(false),[deleting,setDeleting]=useState<string|null>(null),[deleteError,setDeleteError]=useState('')
 const [renaming,setRenaming]=useState<SavedBook|null>(null)
 const input=useRef<HTMLInputElement>(null)
 const available=catalog.filter(book=>book.grade===grade)
 const pending=pendingCatalog.filter(book=>book.grade===grade)
 const heroBook=available[0]??catalog.find(book=>book.grade===grade)??catalog[0]
 const stackBooks=[...available,...catalog].filter((book,index,list)=>list.findIndex(item=>item.id===book.id)===index).slice(0,3)
 const featuredRemote=remoteBooks[0]
 const moreRemote=remoteBooks.slice(1)
 async function importBook(file?:File){if(!file)return;setBusy(true);try{await onImport(file)}finally{setBusy(false);if(input.current)input.current.value=''}}
 async function removeBook(){if(!deleting)return;setDeleteError('');try{await onRemove(deleting);setDeleting(null)}catch{setDeleteError('删除失败，请重试。')}}
 return <div className="kids-bookshelf shelf-page"><header className="topbar"><div className="topbar-inner"><div className="brand"><span className="brand-mark" aria-hidden="true"><BookOpen size={19}/></span><span className="brand-text"><strong>英语课本点读</strong><span>PEP · 牛津 · 点读跟读</span></span></div><nav className="nav" aria-label="学习导航"><button className="nav-btn selected" aria-current="page">课本点读</button><button className="nav-btn" onClick={()=>onFollowAlong(followAlongBook(grade))}>跟读学习</button><button className="nav-btn" onClick={onDictation}>听写练习</button></nav>{LOCAL_BOOKS_ENABLED&&<button className="manage-btn" aria-pressed={manage} onClick={()=>setManage(value=>!value)}>{manage?'完成管理':'管理课本'}</button>}</div></header>
 <main className="shell shelf-main">
  {featuredRemote?<section className="oxford-hero" aria-labelledby="oxford-title">
   <div className="oxford-copy">
    <p className="oxford-kicker"><span className="oxford-badge">新上线</span>Oxford · {featuredRemote.items?'点读版':'课堂版'}</p>
    <h1 id="oxford-title">牛津少儿教材</h1>
    <p className="oxford-book-title">{featuredRemote.title}</p>
    <p className="oxford-lede">{featuredRemote.items?'一本可以点的图画词典。点一下图就能听到单词和句子，手机、平板、电脑打开即读。':'学生用书、课堂音频和课堂动漫放在同一页，翻到哪页就听哪页。'}</p>
    <div className="oxford-stats">
     {featuredRemote.pages?<div><strong>{featuredRemote.pages}</strong><span>页</span></div>:null}
     {featuredRemote.items?<div><strong>{featuredRemote.items.toLocaleString('zh-CN')}</strong><span>个点读条目</span></div>:null}
     {featuredRemote.audio?<div><strong>{featuredRemote.audio}</strong><span>段课堂音频</span></div>:null}
     {featuredRemote.videos?<div><strong>{featuredRemote.videos}</strong><span>个课堂动漫</span></div>:null}
     {!featuredRemote.audio&&!featuredRemote.videos?<div><strong>真人</strong><span>教材原音</span></div>:null}
    </div>
    <div className="hero-actions oxford-actions">
     <button className="btn btn-primary oxford-cta" onClick={()=>onRemote(featuredRemote.id)}>{featuredRemote.lastPage>0?`继续第 ${featuredRemote.lastPage+1} 页`:featuredRemote.items?'开始点读':'进入课堂'}<ArrowRight size={17}/></button>
     <a className="btn btn-ghost oxford-secondary" href={moreRemote.length?'#oxford-series':'#pep-books'}>{moreRemote.length?'课程教材':'人教 PEP 课本'}</a>
    </div>
    <p className="oxford-note">阅读进度会自动记住，不需要下载整本教材。{moreRemote.length>0&&<a href="#pep-books">人教 PEP 课本</a>}</p>
   </div>
   <div className="oxford-art" aria-hidden="true">
    <div className="oxford-sheet oxford-sheet-back"/>
    <div className="oxford-sheet oxford-sheet-mid"/>
    <div className="oxford-cover">
     <span className="oxford-cover-fallback"><BookOpen size={48}/><small>ONLINE</small></span>
     {featuredRemote.cover&&<img src={featuredRemote.cover} alt="" onError={event=>event.currentTarget.remove()}/>}
     <span className="oxford-spine"/>
    </div>
    <div className="oxford-float"><span className="oxford-float-dot"/><span><strong>{featuredRemote.pages?`${featuredRemote.pages} 页`:'打开即读'}</strong>真实教材页面</span></div>
   </div>
  </section>:<section className="hero" aria-labelledby="hero-title">
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
  </section>}
  {moreRemote.length>0&&<section className="oxford-series" id="oxford-series" aria-labelledby="oxford-series-title">
   <div className="oxford-series-head">
    <div>
     <p className="section-kicker">牛津系列</p>
     <h2 id="oxford-series-title">课程教材</h2>
    </div>
    <p>学生用书、课堂音频和课堂动漫，按页同步。</p>
   </div>
   <div className="oxford-series-grid">
    {moreRemote.map(book=><article className="series-card" key={book.id}>
     <div className="series-cover" aria-hidden="true">
      <span className="series-cover-fallback"><BookOpen size={30}/><small>ONLINE</small></span>
      {book.cover&&<img src={book.cover} alt="" onError={event=>event.currentTarget.remove()}/>}
     </div>
     <div className="series-copy">
      <h3>{book.title}</h3>
      <p>{book.audio||book.videos?'学生用书、课堂音频和课堂动漫放在每页旁边，翻页即可听、可看。':'另一本在线教材，打开即可阅读。'}</p>
      <div className="series-meta">
       {book.pages?<span>{book.pages} 页</span>:null}
       {book.audio?<span><Headphones size={13}/>{book.audio} 段音频</span>:null}
       {book.videos?<span><Clapperboard size={13}/>{book.videos} 个动漫</span>:null}
      </div>
     </div>
     <div className="series-actions">
      <button className="btn btn-primary btn-small" onClick={()=>onRemote(book.id)}>{book.lastPage>0?'继续学习':'进入课堂'}<ArrowRight size={15}/></button>
      <span>{book.lastPage>0?`上次读到第 ${book.lastPage+1} 页`:'需要网络 · 打开即读'}</span>
     </div>
    </article>)}
   </div>
  </section>}

  <section className="pep-section" id="pep-books" aria-labelledby="pep-heading">
   <div className="pep-head">
    <div className="pep-head-copy">
     {featuredRemote&&<p className="section-kicker">人教 PEP · 三年级起点</p>}
     <h2 id="pep-heading">在线课本</h2>
     <p>按年级选课本，点开就能读。</p>
    </div>
    <div className="pep-head-side">
     {featuredRemote&&heroBook&&<button className="pep-continue" onClick={()=>onOnline(heroBook.id)}>继续 {grades[grade]}{termLabel(heroBook.term)}<ChevronRight size={15}/></button>}
     <div className="grade-tabs" role="group" aria-label="选择年级">{Object.entries(grades).map(([n,label])=><button key={n} className={`grade-tab ${grade===Number(n)?'selected':''}`} aria-pressed={grade===Number(n)} onClick={()=>{setGrade(Number(n));try{localStorage.setItem('pep:shelf-grade',n)}catch{}}}>{label}</button>)}</div>
    </div>
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
  </section>

  <section className="feature-band" aria-labelledby="feature-title">
   <div className="feature-copy">
    <span className="feature-tag">跟读学习</span>
    <h2 id="feature-title">把单词读顺，再读整句</h2>
    <p>教材原音、音标和中文释义放在同一张卡片上，重复遍数和语速都能调。孩子点一下就能听，不用来回找。</p>
    <ul className="feature-steps"><li><span>01</span>听教材原音</li><li><span>02</span>跟着读一遍</li><li><span>03</span>调语速反复练</li></ul>
    <button className="btn" onClick={()=>onFollowAlong(followAlongBook(grade))}>打开跟读学习<ArrowRight size={16}/></button>
   </div>
   <div className="feature-art">
    <img src={`${import.meta.env.BASE_URL}assets/word-learning/generated/friend.webp`} alt="两个正在读书的孩子插画"/>
    <div className="feature-note"><strong>教材原音</strong><span>音标 · 中文释义 · 可调语速</span></div>
   </div>
  </section>

  {LOCAL_BOOKS_ENABLED&&<section className="offline" aria-labelledby="my-books-heading">
   <div className="offline-head"><div><h2 id="my-books-heading">我的离线教材</h2><p>保存在本机，不上传课本和录音。</p></div><button className="btn btn-ghost btn-small" onClick={onHelp}>导入格式说明</button></div>
   {books.length?<div className="local-grid">{books.map(book=><article className="local-book" key={book.id}><div className="local-cover" aria-hidden="true"><BookOpen size={26}/><span>ENGLISH</span></div><div className="local-copy"><h3>{book.title}</h3><p>{book.lastPage?'上次读到第 '+(book.lastPage+1)+' 页':'共 '+book.pages+' 页'}</p><div className="local-actions"><button className="btn btn-small btn-primary" onClick={()=>onRead(book.id)}>继续阅读</button><button className="name-edit-button" aria-label={`修改课本名称 ${book.title}`} onClick={()=>setRenaming(book)}><Pencil size={14}/>修改名称</button>{manage&&<button className="local-remove" aria-label={`删除课本 ${book.title}`} onClick={()=>{setDeleteError('');setDeleting(book.id)}}><Trash2 size={15}/>删除</button>}</div></div></article>)}</div>:<div className="dropzone"><div className="dropzone-main"><span className="dropzone-icon" aria-hidden="true"><Upload size={20}/></span><div><h3>还没有离线教材</h3><p>导入教材 PDF 或 ZIP 包，断网也能点读和跟读。</p></div></div><div className="dropzone-actions"><button className="btn btn-ghost btn-small" onClick={onDemo}>试读原创样例</button><button className="btn btn-primary btn-small" disabled={busy} onClick={()=>input.current?.click()}>{busy?'正在导入…':'导入教材包'}</button></div></div>}
   <input className="kids-file" ref={input} type="file" accept=".pdf,.zip,application/pdf,application/zip" aria-label="导入课本文件" onChange={event=>void importBook(event.target.files?.[0])}/>
   {manage&&<div className="kids-management"><button onClick={()=>input.current?.click()} disabled={busy}><Plus size={17}/>添加 PDF / 教材包</button><button onClick={onHelp}><Download size={17}/>教材包说明</button><button onClick={onDemo}><Headphones size={17}/>添加原创示例</button></div>}
  </section>}

  <footer className="shelf-footer"><span>在线教材需要网络，支持手机、平板和电脑浏览器。</span>{LOCAL_BOOKS_ENABLED&&<button className="footer-link" onClick={onHelp}>教材包格式<ChevronRight size={14}/></button>}</footer>
 </main>
 {renaming&&<RenameDialog title="修改教材名称" value={renaming.title} onClose={()=>setRenaming(null)} onSave={name=>onRename(renaming.id,name)}/>}
 {deleting&&<div className="modal-shade" onClick={()=>setDeleting(null)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="delete-book-title" onClick={event=>event.stopPropagation()}><h2 id="delete-book-title">删除这本课本？</h2><p>{books.find(book=>book.id===deleting)?.title}</p>{deleteError&&<p role="alert">{deleteError}</p>}<div className="unit-delete-actions"><button className="soft-btn" onClick={()=>setDeleting(null)}>取消</button><button className="danger-btn" onClick={()=>void removeBook()}>确认删除</button></div></section></div>}
 </div>
}
