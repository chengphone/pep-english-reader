import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import './App.css'
import Bookshelf from './Bookshelf'
import { renameMaterialBook } from './vocabularyStorage'
import { buildTextHotspots, buildOcrHotspots, HOTSPOT_VERSION } from './hotspotExtraction'
import { automaticallyTranslate, invalidateTranslationGlossary, type TranslationResult } from './automaticTranslation'
import { extractVocabularyAppendix, parseVocabularyAppendix, persistAppendixUnits } from './vocabularyExtraction'
import VocabularyStudio from './VocabularyStudio'
import LocalReader from './reader/LocalReader'
import OnlineReader from './reader/OnlineReader'
import { useReaderPlayback } from './reader/useReaderPlayback'
import type { ReaderItem as Item, ReaderPage as Page, ReaderManifest as Manifest, LocalBook, OnlineBook } from './reader/types'

const DB_NAME = 'pep-reader-v1'
const ONLINE_BOOKS: OnlineBook[] = [
  {id:'tape3a_002013',grade:3,term:'a'},{id:'tape3b_002013',grade:3,term:'b'},
  {id:'tape4a_002013',grade:4,term:'a'},{id:'tape4b_002013',grade:4,term:'b'},
  {id:'tape5a_002003',grade:5,term:'a',edition:'人教PEP版'}, {id:'tape5a_002113',grade:5,term:'a',edition:'新课标版'},
  {id:'tape5b_002006',grade:5,term:'b',edition:'人教PEP版'}, {id:'tape5b_002113',grade:5,term:'b',edition:'新课标版'},
  {id:'tape6a_002003',grade:6,term:'a'},{id:'tape6b_002006',grade:6,term:'b'},
  {id:'tape7a_002021',grade:7,term:'a',edition:'人教版初中'},{id:'284',grade:7,term:'a',edition:'人教老版'},
  {id:'tape7b_002021',grade:7,term:'b',edition:'人教版初中'},{id:'285',grade:7,term:'b',edition:'人教老版'},
  {id:'tape8a_002021',grade:8,term:'a',edition:'人教版初中'},{id:'286',grade:8,term:'a',edition:'人教老版'},
  {id:'tape8b_002021',grade:8,term:'b',edition:'人教版初中'},{id:'287',grade:8,term:'b',edition:'人教老版'},
  {id:'tape9a_002020',grade:9,term:'a',edition:'人教版初中'},
]
const objectUrls = new Map<string, string>()
function assetUrl(book: LocalBook | null, path?: string) { if (!book || !path) return ''; const blob = book.assets[path]; if (!blob) return path; const key = `${book.id}:${path}`; if (!objectUrls.has(key)) objectUrls.set(key, URL.createObjectURL(blob)); return objectUrls.get(key)! }

function dbOpen() { return new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(DB_NAME, 2); r.onupgradeneeded = () => { if(!r.result.objectStoreNames.contains('books'))r.result.createObjectStore('books', { keyPath: 'id' }); if(!r.result.objectStoreNames.contains('units'))r.result.createObjectStore('units',{keyPath:'id'}) }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) }
function mimeType(path: string) { const ext = path.split('.').pop()?.toLowerCase(); return ({ svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' } as Record<string,string>)[ext ?? ''] ?? 'application/octet-stream' }
async function allBooks(): Promise<LocalBook[]> { const db = await dbOpen(); const out = await new Promise<LocalBook[]>((resolve, reject) => { const r = db.transaction('books').objectStore('books').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }); db.close(); return out }
async function putBook(book: LocalBook) { const db = await dbOpen(); await new Promise<void>((resolve, reject) => { const tx = db.transaction('books', 'readwrite'); tx.objectStore('books').put(book); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close() }
async function dropBook(id: string) { const db = await dbOpen(); await new Promise<void>((resolve, reject) => { const tx = db.transaction('books', 'readwrite'); tx.objectStore('books').delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close() }

export default function App() {
  const [books, setBooks] = useState<LocalBook[]>([]), [active, setActive] = useState<LocalBook | null>(null), [online, setOnline] = useState(false), [mode,setMode]=useState<'shelf'|'vocab'>('shelf')
  const [pageIdx, setPageIdx] = useState(0), [selected, setSelected] = useState<Item | null>(null)
  const [repeat, setRepeat] = useState(1), [speed, setSpeed] = useState(1), [message, setMessage] = useState(''), [help, setHelp] = useState(false)
  const [onlineId, setOnlineId] = useState('tape5a_002113')
  const playback=useReaderPlayback(active,setSelected,repeat,speed)
  const stop=playback.stop
  const page = active?.manifest.pages[pageIdx]
  useEffect(()=>{if(!active||!page||page.hotspotVersion===HOTSPOT_VERSION||!active.assets['source.pdf'])return;let cancelled=false;let task:any;void(async()=>{try{const pdfjs=await import('pdfjs-dist');const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');pdfjs.GlobalWorkerOptions.workerSrc=worker.default;task=pdfjs.getDocument({data:await active.assets['source.pdf'].arrayBuffer(),cMapUrl:import.meta.env.BASE_URL+'pdfjs/cmaps/',cMapPacked:true});const doc=await task.promise;const pdfPage=await doc.getPage(page.page);const generated=buildTextHotspots(await pdfPage.getTextContent(),pdfPage.getViewport({scale:1}),page.page);if(cancelled)return;const items=generated.length?generated.map(item=>({...item,translation:page.items.find(old=>old.text===item.text)?.translation})):page.items;const saved={...active,manifest:{...active.manifest,pages:active.manifest.pages.map(p=>p.page===page.page?{...p,items,hotspotVersion:HOTSPOT_VERSION}:p)}};await putBook(saved);if(cancelled)return;setActive(saved);setBooks(books=>books.map(b=>b.id===saved.id?saved:b));setSelected(null)}catch(e){if(!cancelled)console.error('Rebuild hotspots failed',e)}finally{void task?.destroy()}})();return()=>{cancelled=true}},[active?.id,pageIdx])
  useEffect(() => { void allBooks().then(setBooks).catch(() => setMessage('本地存储不可用')) }, [])
  useEffect(() => { if (!message) return; const id = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(id) }, [message])
  function openBook(book: LocalBook) { stop();setSelected(null);setActive(book);setOnline(false);setMode('shelf');setPageIdx(Math.max(0,Math.min(book.manifest.pages.length-1,book.lastPage??0))) }
  function backToShelf(){if(mode==='vocab')void allBooks().then(setBooks).catch(()=>setMessage('教材列表刷新失败，请重试'));stop();setSelected(null);setActive(null);setOnline(false);setMode('shelf')}
  function openDictation(){stop();setSelected(null);setActive(null);setOnline(false);setMode('vocab')}
  function goPage(next: number) { if (!active) return; stop();setSelected(null); const index = Math.max(0, Math.min(active.manifest.pages.length - 1, next)); setPageIdx(index); const saved = { ...active, lastPage: index }; setActive(saved); setBooks(current => current.map(book => book.id === saved.id ? saved : book)); void putBook(saved) }
  async function importFile(file?: File) {
    if (!file) return
    try {
      if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){await importPdf(file);return}
      const { unzipSync, strFromU8 } = await import('fflate')
      const z = unzipSync(new Uint8Array(await file.arrayBuffer())), mf = z['book.json'] ?? z['manifest.json']
      if (!mf) throw new Error('ZIP 根目录缺少 book.json')
      const manifest = JSON.parse(strFromU8(mf)) as Manifest
      if (manifest.publisherId?.toLowerCase() !== 'pep' || !manifest.pages?.length) throw new Error('仅支持结构正确的人教 PEP 教材包')
      const assets: Record<string,Blob> = {}
      for (const [path, bytes] of Object.entries(z)) if (!path.endsWith('/')) assets[path] = new Blob([bytes], { type: mimeType(path) })
      const book = { id: manifest.bookId, manifest, assets }; await putBook(book); setBooks(await allBooks()); setActive(book); setOnline(false); setPageIdx(0); setMessage('已导入教材，可离线点读')
    } catch (e) { setMessage(e instanceof Error ? e.message : '导入失败') }
  }
  async function importPdf(file:File){setMessage('正在读取 PDF…');const pdfjs=await import('pdfjs-dist');const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');pdfjs.GlobalWorkerOptions.workerSrc=worker.default;const source=file.slice(0,file.size,'application/pdf');const doc=await pdfjs.getDocument({iccUrl:import.meta.env.BASE_URL+'pdfjs/iccs/',cMapUrl:import.meta.env.BASE_URL+'pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:import.meta.env.BASE_URL+'pdfjs/standard_fonts/',wasmUrl:import.meta.env.BASE_URL+'pdfjs/wasm/',data:await source.arrayBuffer(),isOffscreenCanvasSupported:false,isImageDecoderSupported:false}).promise;const assets:Record<string,Blob>={'source.pdf':source};const pages:Page[]=[];let ocrWorker:any=null;for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n);const base=p.getViewport({scale:1});const scale=Math.min(1.8,1300/base.width);const viewport=p.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法创建 PDF 页面画布');await p.render({canvas,canvasContext:ctx,viewport}).promise;const textContent=await p.getTextContent();const items:Item[]=buildTextHotspots(textContent,viewport,n);if(!items.length){try{if(!ocrWorker){const tesseract=await import('tesseract.js');ocrWorker=await tesseract.createWorker('eng')}const result=await ocrWorker.recognize(canvas,{}, {blocks:true});const ocrWords=(result.data.blocks??[]).flatMap((b:any)=>b.paragraphs.flatMap((p:any)=>p.lines.flatMap((l:any)=>l.words)));items.push(...buildOcrHotspots(ocrWords,canvas.width,canvas.height,n))}catch(e){console.warn('OCR unavailable on page',n,e)}}pages.push({page:n,printedPage:n,image:`source.pdf#${n}`,items,hotspotVersion:HOTSPOT_VERSION});canvas.width=0;canvas.height=0;setMessage(`正在识别 PDF ${n}/${doc.numPages} · 已发现 ${pages.reduce((sum,x)=>sum+x.items.length,0)} 个点读区域…`)}if(ocrWorker)await ocrWorker.terminate();const appendix=await extractVocabularyAppendix(doc);const autoUnits=parseVocabularyAppendix(appendix.raw,file.name.replace(/\.pdf$/i,''));await persistAppendixUnits(autoUnits,file.name.replace(/\.pdf$/i,''));invalidateTranslationGlossary(file.name.replace(/\.pdf$/i,''));const manifest:Manifest={schemaVersion:1,bookId:`pep-pdf-${crypto.randomUUID()}`,title:file.name.replace(/\.pdf$/i,''),publisherId:'pep',pages};const book={id:manifest.bookId,manifest,assets};await putBook(book);setBooks(await allBooks());setActive(book);setMode('shelf');setOnline(false);setPageIdx(0);const total=pages.reduce((sum,x)=>sum+x.items.length,0);setMessage(total?`已导入并生成 ${total} 个英文点读热区；末尾词表与表达已提取 ${autoUnits.length} 个分组，可进入单元默写。`:'PDF 页面已导入，但未识别到文字；请检查文件是否为扫描版。')}
  async function renameBook(id:string,name:string){const book=books.find(item=>item.id===id);if(!book)throw new Error('教材已不存在。');await renameMaterialBook(book.manifest.title,name,id);invalidateTranslationGlossary(book.manifest.title);invalidateTranslationGlossary(name);setBooks(await allBooks());setMessage('教材名称已保存，对应听写资料已同步更新')}
  async function remove(book: LocalBook) { stop(); await dropBook(book.id); setBooks(await allBooks()); if (active?.id === book.id) setActive(null); setMessage('已移除本机教材') }
  async function tryDemo() { try { const response = await fetch(import.meta.env.BASE_URL+'demo-pep-sample.zip'); if (!response.ok) throw new Error('原创样例尚未生成，请运行 npm run demo:build'); const blob = await response.blob(); await importFile(new File([blob], 'demo-pep-sample.zip')) } catch (e) { setMessage(e instanceof Error ? e.message : '无法载入样例') } }
  const img = assetUrl(active, page?.image)
  const [autoTranslation,setAutoTranslation]=useState<TranslationResult>({}),[translating,setTranslating]=useState(false)
  useEffect(()=>{let cancelled=false;setAutoTranslation({});if(!selected||!active||selected.translation){setTranslating(false);return}setTranslating(true);void automaticallyTranslate(selected.text,active.manifest.title).then(result=>{if(!cancelled){setAutoTranslation(result);setTranslating(false)}}).catch(()=>{if(!cancelled){setAutoTranslation({message:'自动翻译失败，可补充中文翻译'});setTranslating(false)}});return()=>{cancelled=true}},[selected?.id,selected?.text,selected?.translation,active?.id,active?.manifest.title])
  const translated=selected ? selected.translation || autoTranslation.text : undefined
  async function saveTranslation(text:string){if(!active||!selected)throw new Error('没有选中的句子');const saved={...active,manifest:{...active.manifest,pages:active.manifest.pages.map(p=>({...p,items:p.items.map(i=>i.id===selected.id?{...i,translation:text.trim()}:i)}))}};await putBook(saved);setActive(saved);setBooks(v=>v.map(b=>b.id===saved.id?saved:b));setSelected({...selected,translation:text.trim()});setMessage('中文翻译已保存，下次点读优先使用此释义')}
  return <div className={`app-shell ${mode==='shelf'&&(active||online)?'reading-mode':'shelf-mode'}`}>
    <main className="main-area">{mode==='vocab'?<VocabularyStudio onBack={backToShelf}/>:online?<OnlineReader key="online-reader" catalog={ONLINE_BOOKS} selectedId={onlineId} onBook={setOnlineId} onBack={backToShelf} onDictation={openDictation}/>:active?<LocalReader key={active.id} book={active} pageIndex={pageIdx} imageSrc={img} selected={selected} translation={translated} translating={translating} translationMessage={autoTranslation.message} repeat={repeat} speed={speed} playback={playback} onPage={goPage} onRepeat={setRepeat} onSpeed={setSpeed} onBack={backToShelf} onDictation={openDictation} onSaveTranslation={saveTranslation}/>:<Bookshelf books={books.map(book=>({id:book.id,title:book.manifest.title,pages:book.manifest.pages.length,lastPage:book.lastPage??0}))} catalog={ONLINE_BOOKS} onRename={renameBook} onRead={id=>{const book=books.find(book=>book.id===id);if(book)openBook(book)}} onOnline={id=>{stop();setSelected(null);setActive(null);setOnlineId(id);setOnline(true)}} onImport={importFile} onRemove={async id=>{const book=books.find(book=>book.id===id);if(book)await remove(book)}} onDictation={openDictation} onDemo={()=>void tryDemo()} onHelp={()=>setHelp(true)}/>}</main>
    {help&&<div className="modal-shade" onClick={()=>setHelp(false)}><section className="help-modal" onClick={e=>e.stopPropagation()}><button className="modal-x" onClick={()=>setHelp(false)}><X/></button><span className="edition">LOCAL BOOK PACKAGE</span><h2>教材包格式</h2><p>ZIP 根目录放置 <code>book.json</code>，并包含页面图片和音频文件。热区坐标为 0～1 的页面比例。</p><pre>{'{\n  "schemaVersion": 1,\n  "bookId": "pep-g5-a",\n  "title": "人教 PEP 五年级上册",\n  "publisherId": "pep",\n  "grade": 5, "term": "a",\n  "pages": [{\n    "page": 1, "image": "pages/001.webp",\n    "items": [{ "id": "p001_s001",\n      "text": "Good morning!", "order": 1,\n      "rects": [[0.1,0.2,0.8,0.3]],\n      "audio": "audio/p001_s001.mp3" }]\n  }]\n}'}</pre><button className="primary-button" onClick={()=>setHelp(false)}>知道了</button></section></div>}
    {message&&<div className="toast"><i/>{message}</div>}
  </div>
}
