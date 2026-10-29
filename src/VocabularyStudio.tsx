import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, FileCheck2, Plus, Pencil, Save, Trash2, UploadCloud } from 'lucide-react'
import './VocabularyStudio.css'
import './DictationChooser.css'
import { recognizeVocabularyImage, type ImageOcrResult, type ImageImportKind, type ImageCategory } from './imageVocabularyOcr'
import DictationSession from './DictationSession'
import ConfirmDialog from './ConfirmDialog'
import type {AppRoute} from './AppNavigation'
import DictationChooser, { type DictationContext, type DictationRound, type PracticeContext } from './DictationChooser'
import WordAudioPanel from './WordAudioPanel'
import WordEditor from './WordEditor'
import RenameDialog from './RenameDialog'
import SharedLibraryPanel from './SharedLibraryPanel'
import { invalidateTranslationGlossary } from './automaticTranslation'
import { extractVocabularyAppendix, parseVocabularyAppendix, persistAppendixUnits, type VocabularyUnit, type VocabularyWord } from './vocabularyExtraction'
import { deleteUnit, loadUnits, saveUnit, renameMaterialBook, renameMaterialUnit, seedHostedVocabulary } from './vocabularyStorage'

type ManageTab='import'|'edit'|'audio'
type PendingTransition=()=>void
type SaveResult='saved'|'invalid'|'failed'
const categories=[['units','单元单词'],['vocabulary','整册词汇'],['expressions','常用表达']] as const
function parseImport(text:string,book:string):VocabularyUnit[] {
 const groups=parseVocabularyAppendix(text,book)
 if(groups.length)return groups
 const words:VocabularyWord[]=text.split(/\r?\n/).flatMap(line=>{
  const match=line.trim().match(/^([A-Za-z][^\t]*?)\t+(.+)$/)??line.trim().match(/^([A-Za-z][A-Za-z '\-]*?)\s+(\p{Script=Han}.+)$/u)
  return match?[{id:crypto.randomUUID(),english:match[1].trim(),meaning:match[2].trim()}]:[]
 })
 return words.length?[{id:crypto.randomUUID(),book,title:'Unit 1',category:'units',source:'appendix',words}]:[]
}
export default function VocabularyStudio({onNavigate,entryContext}:{onNavigate:(next:AppRoute,transition:(done:()=>void)=>void)=>void;entryContext?:DictationContext|null}) {
 const [units,setUnits]=useState<VocabularyUnit[]>([]),[unitsLoaded,setUnitsLoaded]=useState(false),[page,setPage]=useState<'practice'|'manage'>('practice'),[tab,setTab]=useState<ManageTab>('import')
 const [practiceContext,setPracticeContext]=useState<PracticeContext>({book:'',category:'units',unitId:''})
 const [round,setRound]=useState<DictationRound|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[guardOpen,setGuardOpen]=useState(false),[guardError,setGuardError]=useState('')
 const pendingTransition=useRef<PendingTransition|null>(null),guardTrigger=useRef<HTMLElement|null>(null),deleteDialog=useRef<HTMLElement>(null),historyResolver=useRef<((allow:boolean)=>void)|null>(null)
 // Material drafts and student selection live in separate components. Starting a
 // round can only use the saved units and the explicit selection from the practice page.
 const [book,setBook]=useState(''),[category,setCategory]=useState<ImageCategory>('units'),[activeId,setActiveId]=useState(''),[unitTitle,setUnitTitle]=useState('Unit 1'),[words,setWords]=useState<VocabularyWord[]>([])
 const [importBook,setImportBook]=useState('')
 const [imageKind,setImageKind]=useState<ImageImportKind>('auto'),[continuation,setContinuation]=useState(''),[progress,setProgress]=useState('')
 const [raw,setRaw]=useState(''),[draft,setDraft]=useState<VocabularyUnit[]>([]),[draftIndex,setDraftIndex]=useState(0),[ocr,setOcr]=useState<ImageOcrResult|null>(null),[confirmed,setConfirmed]=useState(false),[savedImport,setSavedImport]=useState(false)
 const [importBaseline,setImportBaseline]=useState('')
 const baselineValues=useRef({editorBook:'',editorCategory:'units' as ImageCategory,editorId:'',editorTitle:'Unit 1',editorWords:[] as VocabularyWord[],importBook:'',raw:'',draft:[] as VocabularyUnit[],draftIndex:0,confirmed:false})
 const parsedRaw=useRef('')
 const [pendingDelete,setPendingDelete]=useState<VocabularyUnit|null>(null),[deleting,setDeleting]=useState(false)
 const [pendingDeleteProceed,setPendingDeleteProceed]=useState(false)
 const [renaming,setRenaming]=useState<{kind:'book'|'unit';value:string;id?:string}|null>(null)
 const books=useMemo(()=>[...new Set(units.map(unit=>unit.book))],[units])
 const available=units.filter(unit=>unit.book===book&&(unit.category??'units')===category).sort((a,b)=>a.title.localeCompare(b.title,'zh-CN',{numeric:true}))
 const active=units.find(unit=>unit.id===activeId)
 const editorBaseline=useRef(''),editorInitialized=useRef(false)
 const editorSnapshot=JSON.stringify([book,category,activeId,unitTitle,words])
 const editorDirty=editorInitialized.current&&editorSnapshot!==editorBaseline.current
 const importSnapshot=JSON.stringify([importBook,raw,draft,draftIndex,confirmed]),importDirty=importBaseline!==''&&(importSnapshot!==importBaseline||raw!==parsedRaw.current)
 useEffect(()=>{let live=true;void seedHostedVocabulary().then(items=>{if(!live)return;setUnits(items);setUnitsLoaded(true);const first=items.find(unit=>(unit.category??'units')==='units')??items[0];if(first){setBook(first.book);setImportBook(first.book);setCategory(first.category??'units');setActiveId(first.id);setUnitTitle(first.title);setWords(first.words);baselineValues.current={...baselineValues.current,editorBook:first.book,editorCategory:(first.category??'units') as ImageCategory,editorId:first.id,editorTitle:first.title,editorWords:first.words,importBook:first.book};editorBaseline.current=JSON.stringify([first.book,first.category??'units',first.id,first.title,first.words]);editorInitialized.current=true;setImportBaseline(JSON.stringify([first.book,'',[],0,false]))}}).catch(()=>{if(live)setNotice('本地词表读取失败，请检查浏览器存储权限。')});return()=>{live=false}},[])
 function selectUnit(unit:VocabularyUnit){setActiveId(unit.id);setBook(unit.book);setCategory(unit.category??'units');setUnitTitle(unit.title);setWords(unit.words);editorBaseline.current=JSON.stringify([unit.book,unit.category??'units',unit.id,unit.title,unit.words]);editorInitialized.current=true;baselineValues.current={...baselineValues.current,editorBook:unit.book,editorCategory:(unit.category??'units') as ImageCategory,editorId:unit.id,editorTitle:unit.title,editorWords:unit.words}}
 function applySyncedUnits(items:VocabularyUnit[]){setUnits(items);if(editorDirty)return;const next=items.find(unit=>unit.id===activeId)??items.find(unit=>unit.book===book&&(unit.category??'units')===category)??items[0];if(next)selectUnit(next);else{setActiveId('');setWords([]);setUnitTitle('Unit 1');editorBaseline.current=JSON.stringify([book,category,'','Unit 1',[]]);editorInitialized.current=true}}
 function selectContext(nextBook:string,nextCategory:ImageCategory){if(nextBook===book&&nextCategory===category)return;requestTransition(()=>{setBook(nextBook);setCategory(nextCategory);const unit=units.find(unit=>unit.book===nextBook&&(unit.category??'units')===nextCategory);if(unit)selectUnit(unit);else{setActiveId('');setUnitTitle('Unit 1');setWords([]);editorBaseline.current=JSON.stringify([nextBook,nextCategory,'', 'Unit 1',[]]);editorInitialized.current=true}setImportBook(nextBook);baselineValues.current={...baselineValues.current,importBook:nextBook};setImportBaseline(JSON.stringify([nextBook,baselineValues.current.raw,baselineValues.current.draft,baselineValues.current.draftIndex,baselineValues.current.confirmed]))})}
 function navigate(next:'practice'|'manage'){if(guardOpen)return;if(next===page)return;requestTransition(()=>{if(next==='manage'&&page==='practice'&&practiceContext.book&&!editorDirty&&!importDirty){const unit=units.find(unit=>unit.id===practiceContext.unitId);if(unit)selectUnit(unit);else selectContext(practiceContext.book,practiceContext.category as ImageCategory);setImportBook(practiceContext.book);baselineValues.current={...baselineValues.current,importBook:practiceContext.book};setImportBaseline(JSON.stringify([practiceContext.book,baselineValues.current.raw,baselineValues.current.draft,baselineValues.current.draftIndex,baselineValues.current.confirmed]))}setPage(next);setNotice('')})}
 function commitTransition(action:PendingTransition){pendingTransition.current=null;setGuardOpen(false);setGuardError('');action()}
 function requestTransition(action:PendingTransition){
  if(guardOpen)return
  if(busy){setNotice('正在处理资料，请稍候完成后再切换。');return}
  if(!editorDirty&&!importDirty){action();return}
  pendingTransition.current=action;guardTrigger.current=document.activeElement as HTMLElement|null;setGuardError('');setGuardOpen(true);requestAnimationFrame(()=>document.querySelector<HTMLElement>('.confirm-transition-dialog button:not(:disabled)')?.focus())
 }
 function requestDelete(unit:VocabularyUnit){if(busy||deleting)return;guardTrigger.current=document.activeElement as HTMLElement;if(unit.id===activeId&&editorDirty){setPendingDeleteProceed(true);requestTransition(()=>{setPendingDelete(unit);setPendingDeleteProceed(false)});return}setPendingDelete(unit)}
 function cancelDelete(){setPendingDelete(null);setPendingDeleteProceed(false);guardTrigger.current?.focus()}
 async function commitDelete(){if(!pendingDelete||deleting)return;await confirmDelete();setPendingDeleteProceed(false)}
 async function saveAndTransition(){
  if(busy)return
  setGuardError('')
  if(editorDirty){const result=await saveEdited();if(result!=='saved'){setGuardError('词表草稿尚未成功保存，仍保留在此页面。');return}}
  if(importDirty){const result=await saveImport();if(result!=='saved'){setGuardError('导入草稿尚未成功保存，仍保留在此页面。');return}}
  const action=pendingTransition.current;if(action)commitTransition(action);historyResolver.current?.(true);historyResolver.current=null
 }
 function discardAndTransition(){const saved=baselineValues.current;setBook(saved.editorBook);setCategory(saved.editorCategory);setActiveId(saved.editorId);setUnitTitle(saved.editorTitle);setWords(saved.editorWords);setImportBook(saved.importBook);setRaw(saved.raw);setDraft(saved.draft);setDraftIndex(saved.draftIndex);setConfirmed(saved.confirmed);parsedRaw.current=saved.raw;editorBaseline.current=JSON.stringify([saved.editorBook,saved.editorCategory,saved.editorId,saved.editorTitle,saved.editorWords]);editorInitialized.current=true;setImportBaseline(JSON.stringify([saved.importBook,saved.raw,saved.draft,saved.draftIndex,saved.confirmed]));const action=pendingTransition.current;if(action)commitTransition(action);historyResolver.current?.(true);historyResolver.current=null}
 function cancelTransition(){pendingTransition.current=null;setGuardOpen(false);setGuardError('');historyResolver.current?.(false);historyResolver.current=null;requestAnimationFrame(()=>guardTrigger.current?.focus())}
 useEffect(()=>{const listener=(event:Event)=>{const custom=event as CustomEvent<{next:AppRoute;resolve:(allow:boolean)=>void}>;const detail=custom.detail;if(!detail)return;if(!editorDirty&&!importDirty){detail.resolve(true);return}historyResolver.current=detail.resolve;requestTransition(()=>historyResolver.current?.(true))};window.addEventListener('pep-before-route',listener);return()=>window.removeEventListener('pep-before-route',listener)},[editorDirty,importDirty])
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(editorDirty||importDirty){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[editorDirty,importDirty])
 async function extract(files:File[]){
  if(guardOpen||busy)return
  if(editorDirty||importDirty){requestTransition(()=>void extract(files));return}

  if(!files.length)return
  const sorted=[...files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))
  if(sorted.length>1&&!sorted.every(file=>file.type.startsWith('image/'))){setNotice('多选仅支持词表图片；PDF 或 TXT 请每次选择一份。');return}
  const file=sorted[0],targetBook=importBook.trim()||file.name.replace(/\.[^.]+$/,'')
  setBusy(true);setOcr(null);setConfirmed(false);setSavedImport(false);setNotice('');setProgress('正在读取文件…')
  try {
   let text='',report:ImageOcrResult|null=null
   if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
    const pdfjs=await import('pdfjs-dist'),worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');pdfjs.GlobalWorkerOptions.workerSrc=worker.default
    const task=pdfjs.getDocument({iccUrl:import.meta.env.BASE_URL+'pdfjs/iccs/',cMapUrl:import.meta.env.BASE_URL+'pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:import.meta.env.BASE_URL+'pdfjs/standard_fonts/',wasmUrl:import.meta.env.BASE_URL+'pdfjs/wasm/',data:await file.arrayBuffer()})
    try { const result=await extractVocabularyAppendix(await task.promise);text=result.raw } finally {await task.destroy()}
   }else if(file.type.startsWith('image/')){
    let current=continuation,previous:ImageCategory|undefined
    for(let i=0;i<sorted.length;i++){
     const result=await recognizeVocabularyImage(sorted[i],message=>setProgress(`${i+1}/${sorted.length} ${sorted[i].name} · ${message}`),current,imageKind,previous)
     text+=result.raw+'\n';current=result.lastUnit??current;previous=result.category
     report=report?{...result,raw:text,width:Math.min(report.width,result.width),height:Math.min(report.height,result.height),lowResolution:report.lowResolution||result.lowResolution,count:report.count+result.count,dictionaryCount:report.dictionaryCount+result.dictionaryCount,unresolved:report.unresolved+result.unresolved}:result
    }
    setContinuation(current);setOcr(report)
   }else text=await file.text()
   const groups=parseImport(text,targetBook);setImportBook(targetBook);setRaw(text);setDraft(groups);setDraftIndex(0);parsedRaw.current=text
   setNotice(groups.length?`识别出 ${groups.length} 个分组、${groups.reduce((sum,group)=>sum+group.words.length,0)} 条词句，请校对后保存。`:'没有识别到成对词句。请检查图片内容类型，或在下方原文中补充英文和中文。')
  }catch(error){setNotice(error instanceof Error?error.message:'识别失败，请重试。')}finally{setBusy(false);setProgress('')}
 }
 async function saveImport():Promise<SaveResult>{
  if(busy)return 'failed'
  if(!importBook.trim()||!draft.length||(ocr?.lowResolution&&!confirmed)){setNotice('请确认教材、识别分组和低分辨率校对后再保存。');return 'invalid'}
  if(raw!==parsedRaw.current){setNotice('识别原文有未解析的修改；请先重新解析并校对，再保存。');return 'invalid'}
  const prepared=draft.map(unit=>({...unit,id:JSON.stringify([importBook.trim(),unit.category??'units',unit.title]),book:importBook.trim(),words:unit.words.filter(word=>word.english.trim())})).filter(unit=>unit.words.length)
  if(!prepared.length){setNotice('没有可保存的英文词句。');return 'invalid'}
  setBusy(true)
  try {
   await persistAppendixUnits(prepared,importBook.trim(),{merge:true});invalidateTranslationGlossary(importBook.trim())
   baselineValues.current={...baselineValues.current,importBook,raw,draft,draftIndex,confirmed};parsedRaw.current=raw;setImportBaseline(JSON.stringify([importBook,raw,draft,draftIndex,confirmed]));setSavedImport(true);setNotice(`已写入本机 ${prepared.length} 个分组。`)
   try{setUnits(await loadUnits())}catch{setNotice('词表已写入本机，但列表刷新失败；请重新打开资料页核对。')}
   return 'saved'
  }catch{setNotice('保存失败，导入草稿仍保留；请检查本机存储后重试。');return 'failed'}finally{setBusy(false)}
 }
 async function saveEdited():Promise<SaveResult>{
  if(busy)return 'failed'
  if(!book.trim()||!unitTitle.trim()){setNotice('请填写教材和单元名称。');return 'invalid'}
  const saved:VocabularyUnit={...active,id:activeId||crypto.randomUUID(),book:book.trim(),title:unitTitle.trim(),category,words:words.filter(word=>word.english.trim())}
  setBusy(true)
  try{
   await saveUnit(saved);invalidateTranslationGlossary(saved.book)
   baselineValues.current={...baselineValues.current,editorBook:saved.book,editorCategory:category,editorId:saved.id,editorTitle:saved.title,editorWords:saved.words}
   editorBaseline.current=JSON.stringify([saved.book,category,saved.id,saved.title,saved.words]);editorInitialized.current=true
   setActiveId(saved.id);setBook(saved.book);setUnitTitle(saved.title);setWords(saved.words);setNotice(`已保存 ${saved.title}，共 ${saved.words.length} 条。`)
   try{setUnits(await loadUnits())}catch{setNotice('词表已写入本机，但列表刷新失败；请返回或重新打开资料页核对。')}
   return 'saved'
  }catch{setNotice('词表保存失败，草稿仍保留；请检查本机存储后重试。');return 'failed'}finally{setBusy(false)}
 }
 async function confirmDelete(){
  if(!pendingDelete||deleting)return
  setDeleting(true)
  try{await deleteUnit(pendingDelete.id);invalidateTranslationGlossary(pendingDelete.book);let remaining:VocabularyUnit[]=[];try{remaining=await loadUnits();setUnits(remaining)}catch{setNotice('单元已删除，但列表刷新失败；请重新打开资料页核对。')}if(activeId===pendingDelete.id){const next=remaining.find(unit=>unit.book===book&&(unit.category??'units')===category);if(next)selectUnit(next);else{setActiveId('');setWords([]);setUnitTitle('Unit 1');editorBaseline.current=JSON.stringify([book,category,'','Unit 1',[]]);editorInitialized.current=true}}setNotice(`已删除 ${pendingDelete.title}。`);setPendingDelete(null)}catch{setNotice('删除失败，请重试。')}finally{setDeleting(false)}
 }
 async function rename(name:string){
  if(!renaming)return
  const oldName=renaming.value
  if(renaming.kind==='book'){await renameMaterialBook(oldName,name);invalidateTranslationGlossary(oldName);invalidateTranslationGlossary(name)}else await renameMaterialUnit(renaming.id!,name)
  const all=await loadUnits();setUnits(all)
  if(renaming.kind==='book'){if(book===oldName)setBook(name);if(importBook===oldName)setImportBook(name);setPracticeContext(current=>current.book===oldName?{...current,book:name}:current)}
  else if(activeId===renaming.id)setUnitTitle(name)
  setNotice('名称已保存。')
 }
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')void seedHostedVocabulary().then(applySyncedUnits)};window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);const interval=setInterval(refresh,60000);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);clearInterval(interval)}},[editorDirty,activeId,book,category])
 const contextControls=<div className="material-context"><label className="field-label">教材<select aria-label="管理教材" value={books.includes(book)?book:''} onChange={event=>selectContext(event.target.value,category)}>{!books.includes(book)&&<option value="">请选择已保存教材</option>}{books.map(name=><option key={name}>{name}</option>)}</select></label><label className="field-label">内容类型<select aria-label="管理内容类型" value={category} onChange={event=>selectContext(book,event.target.value as ImageCategory)}>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
 return <section className="dictation-workspace kids-vocab"><header className="kids-header" inert={!!round||guardOpen} aria-hidden={round||guardOpen?true:undefined}><div className="kids-brand"><BookOpen size={32}/><span>英语课本点读</span></div><nav aria-label="学习导航"><button onClick={()=>{const event=new CustomEvent('pep-before-route',{detail:{next:{kind:'shelf'} as AppRoute,resolve:(allow:boolean)=>{if(allow)onNavigate({kind:'shelf'},done=>{if(guardOpen){historyResolver.current=done;return}done()})}}});window.dispatchEvent(event)}}>课本点读</button><button className="selected" aria-current="page" onClick={()=>navigate('practice')}>单元默写</button></nav><button className="kids-manage" onClick={()=>navigate(page==='practice'?'manage':'practice')}>{page==='practice'?'资料管理':<><ArrowLeft size={17}/>返回听写</>}</button></header><main inert={!!round||guardOpen||!!pendingDelete} aria-hidden={round||guardOpen||pendingDelete?true:undefined} className={`dictation-page ${page==='manage'?'materials-page':''}`}><div className="dictation-page-heading"><h1>{page==='practice'?'开始听写':'资料管理'}</h1><p>{page==='practice'?'选好教材、单元和词句，再开始。':'导入和校对资料后，回到听写页选择内容。'}</p></div><div className="workspace-tabs" role="tablist" aria-label="听写工作区"><button role="tab" aria-selected={page==='practice'} onClick={()=>navigate('practice')}>听写练习</button><button role="tab" aria-selected={page==='manage'} onClick={()=>navigate('manage')}>资料管理</button></div>{notice&&<div className="material-notice" role="status">{notice}</div>}{/* Keep practice mounted while managing so its explicit selection survives editing. */}<div hidden={page!=='practice'}><DictationChooser units={units} entryContext={entryContext} unitsLoaded={unitsLoaded} onContextChange={setPracticeContext} onStart={setRound} onImport={()=>{setTab('import');navigate('manage')}}/></div>{page==='manage'&&<><SharedLibraryPanel onRefresh={applySyncedUnits}/><div className="material-tabs" role="tablist" aria-label="资料管理功能">{[['import','导入识别'],['edit','词表校对'],['audio','单词音频']].map(([value,label])=><button role="tab" key={value} aria-selected={tab===value} onClick={()=>{const nextTab=value as ManageTab;if(tab==='import'&&nextTab!=='import'){requestTransition(()=>{setTab(nextTab);setNotice('')});return}setTab(nextTab);setNotice('')}}>{label}</button>)}</div>{tab==='import'?<div className="material-import"><section className="material-step"><h2><span>1</span>选择教材与文件</h2><div className="material-import-options"><label className="field-label">教材<input aria-label="导入到教材" list="material-book-options" placeholder="选择已有教材，或输入新教材名称" value={importBook} disabled={busy} onChange={event=>setImportBook(event.target.value)}/><datalist id="material-book-options">{books.map(name=><option key={name} value={name}/>)}</datalist></label><label className="field-label">图片内容<select aria-label="图片内容类型" value={imageKind} disabled={busy} onChange={event=>setImageKind(event.target.value as ImageImportKind)}><option value="auto">自动识别单词 / 常用表达</option><option value="units">单元单词表</option><option value="vocabulary">整册词汇表（按字母）</option><option value="expressions">常用表达（完整句子）</option></select></label><label className="field-label">图片接页<select aria-label="图片起始单元" value={continuation} disabled={busy} onChange={event=>setContinuation(event.target.value)}><option value="">不接上页</option>{Array.from({length:20},(_,index)=><option key={index} value={`Unit ${index+1}`}>接着 Unit {index+1}</option>)}</select></label></div><div className="material-upload-zone"><UploadCloud size={38}/><label className={`material-upload-button ${busy?'disabled':''}`}>{busy?'正在识别…':'选择 PDF / 图片 / TXT'}<input aria-label="导入资料文件" type="file" multiple disabled={busy} accept="application/pdf,image/*,.txt,.csv" onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value='';void extract(files)}}/></label><p>{busy?progress:'图片可多选，按文件名顺序识别。教材和图片留在本机。'}</p></div></section><section className="material-step"><h2><span>2</span>校对并保存</h2>{draft.length>0?<><div className="import-preview-toolbar"><label className="field-label">校对分组<select aria-label="校对导入分组" value={draftIndex} onChange={event=>setDraftIndex(Number(event.target.value))}>{draft.map((unit,index)=><option value={index} key={index}>{unit.title} · {unit.words.length} 条</option>)}</select></label><p>共 {draft.length} 个分组、{draft.reduce((sum,unit)=>sum+unit.words.length,0)} 条词句</p></div><WordEditor disabled={busy} words={draft[draftIndex]?.words??[]} onChange={next=>{setDraft(items=>items.map((unit,index)=>index===draftIndex?{...unit,words:next}:unit));setConfirmed(false);setSavedImport(false)}}/>{ocr?.lowResolution&&<label className="import-confirmation"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>图片较小，请对照原图校对英文和中文。<br/>我已核对所有分组的单元、拼写和释义。</span></label>}<div className="material-save-actions"><span>追加到对应单元；重复词保留原有校对。</span><button className="solid-btn" disabled={busy||!importBook.trim()||!!(ocr?.lowResolution&&!confirmed)} onClick={()=>void saveImport()}><Save size={17}/>保存到词表</button>{savedImport&&<button className="soft-btn" onClick={()=>navigate('practice')}>去选择听写内容<ArrowRight size={16}/></button>}</div></>:<div className="import-empty"><FileCheck2 size={42}/><p>识别完成后，词句会显示在这里。</p></div>}<details className="import-raw"><summary>手动输入 / 查看识别原文</summary><p>每行“英文 + Tab + 中文”，支持 Unit 标题。修改原文后点击重新解析，会重建上面的待保存结果。</p><textarea aria-label="识别原文" value={raw} onChange={event=>setRaw(event.target.value)} placeholder={'Unit 1\napple\t苹果'}/><button className="soft-btn" disabled={busy} onClick={()=>{requestTransition(()=>{const parsed=parseImport(raw,importBook);setDraft(parsed);setDraftIndex(0);setConfirmed(false);setSavedImport(false);parsedRaw.current=raw;baselineValues.current={...baselineValues.current,raw,draft:parsed,draftIndex:0,confirmed:false};setImportBaseline(JSON.stringify([importBook,raw,parsed,0,false]))})}}>重新解析</button></details></section><p className="material-footnote">保存后的词表会出现在听写页，可继续修改和删除。</p></div>:tab==='edit'?<section className="material-edit">{contextControls}<details className="material-data-note"><summary>本机资料与备份说明</summary><p>课本、词表和导入的音频保存在此浏览器的本机存储中，不会自动同步到其他设备。清理此网站的数据可能删除本机资料。音频备份只包含音频，不等于完整数据备份。</p><p>资料管理中的共享发布是单独操作；未发布的本机修改仍只保存在本机。</p></details><div className="material-edit-layout"><aside className="material-unit-list"><div><h2>已保存的单元</h2><button className="name-edit-button" disabled={!book||busy} onClick={()=>setRenaming({kind:'book',value:book})}><Pencil size={14}/>改教材名</button><button className="soft-btn" onClick={()=>requestTransition(()=>{setActiveId('');setUnitTitle(`Unit ${available.length+1}`);setWords([]);editorBaseline.current=JSON.stringify([book,category,'',`Unit ${available.length+1}`,[]]);editorInitialized.current=true})}><Plus size={16}/>新建</button></div>{available.map(unit=><div className={activeId===unit.id?'selected':''} key={unit.id}><button className="material-unit-select" aria-pressed={activeId===unit.id} onClick={()=>{if(activeId!==unit.id)requestTransition(()=>selectUnit(unit))}}>{unit.title}<small>{unit.words.length} 条</small></button><button className="material-delete" aria-label={`删除 ${unit.title}`} onClick={()=>requestDelete(unit)}><Trash2 size={16}/></button></div>)}{!available.length&&<p>还没有词表，可新建或导入。</p>}</aside><div className="material-editor"><label className="field-label">单元名称<input aria-label="编辑单元名称" value={unitTitle} onChange={event=>setUnitTitle(event.target.value)}/></label>{editorDirty&&<p className="material-dirty-note">修改尚未保存。保存后会更新听写内容。</p>}<WordEditor disabled={busy} words={words} onChange={setWords}/><div className="material-save-actions"><button className="solid-btn" disabled={busy} onClick={()=>void saveEdited()}><Save size={17}/>保存本单元</button></div></div></div></section>:<section className="material-audio">{contextControls}<label className="field-label audio-unit-choice">当前单元<select aria-label="音频单元" value={available.some(unit=>unit.id===activeId)?activeId:''} onChange={event=>{const unit=units.find(unit=>unit.id===event.target.value);if(unit&&unit.id!==activeId)requestTransition(()=>selectUnit(unit))}}>{!available.some(unit=>unit.id===activeId)&&<option value="">请选择单元</option>}{available.map(unit=><option key={unit.id} value={unit.id}>{unit.title} · {unit.words.length} 条</option>)}</select></label><WordAudioPanel words={available.some(unit=>unit.id===activeId)?words:[]} units={units} book={book}/></section>}</>}</main>{guardOpen&&<ConfirmDialog title="尚有未保存的资料" description={`${editorDirty?'词表校对':''}${editorDirty&&importDirty?'和':''}${importDirty?'导入识别':''}有修改尚未保存。离开会丢失这些草稿。`} error={guardError} busy={busy} onCancel={cancelTransition} onDiscard={discardAndTransition} onSave={()=>void saveAndTransition()}/ >}{renaming&&<RenameDialog title={renaming.kind==='book'?'修改教材名称':'修改单元名称'} value={renaming.value} onSave={rename} onClose={()=>setRenaming(null)}/ >}{pendingDelete&&<div className="modal-shade" onClick={()=>{if(!deleting){setPendingDelete(null);guardTrigger.current?.focus()}}}><section ref={deleteDialog} className="help-modal" role="dialog" aria-modal="true" aria-labelledby="delete-unit-title" onKeyDown={event=>{if(event.key==='Escape'&&!deleting){setPendingDelete(null);guardTrigger.current?.focus()}if(event.key==='Tab'){const nodes=event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)'),first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}}} onClick={event=>event.stopPropagation()}><h2 id="delete-unit-title">删除教材单元？</h2><p>{pendingDelete.book} · {pendingDelete.title}</p><p>将删除本单元的 {pendingDelete.words.length} 条词句，删除后无法恢复。</p><div className="unit-delete-actions"><button id="confirm-delete-unit" className="soft-btn" disabled={deleting} onClick={cancelDelete}>取消</button>{pendingDeleteProceed&&<button className="soft-btn" disabled={deleting} onClick={()=>{const target=pendingDelete;discardAndTransition();if(target)setPendingDelete(target);setPendingDeleteProceed(false)}}>放弃未保存修改</button>}<button className="danger-btn" disabled={deleting} onClick={()=>void commitDelete()}>{deleting?'正在删除…':'确认删除'}</button></div></section></div>}{round&&<DictationSession words={round.words} title={round.title} repeat={round.repeat} audio={round.audio} allowFallback={round.allowFallback} onBack={()=>setRound(null)}/>}</section>
}
