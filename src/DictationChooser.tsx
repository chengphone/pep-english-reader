import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Headphones, Search } from 'lucide-react'
import type { VocabularyUnit, VocabularyWord } from './vocabularyExtraction'
import { createDictationQueue } from './dictationSelection'
import { resolveDictationAudios } from './textbookAudio'
import type { WordAudio } from './wordAudio'
import './DictationChooser.css'
export type PracticeContext={book:string;category:string;unitId:string}
export type DictationRound={words:VocabularyWord[];title:string;repeat:number;audio:(WordAudio|undefined)[];allowFallback:boolean}
export type DictationContext={kind:'local';title:string}|{kind:'online';bookId:string}
type Props={units:VocabularyUnit[];unitsLoaded:boolean;entryContext?:DictationContext|null;onContextChange:(context:PracticeContext)=>void;onStart:(round:DictationRound)=>void;onImport:()=>void}
export default function DictationChooser({units,unitsLoaded,onStart,onImport,onContextChange,entryContext}:Props){
 const [book,setBook]=useState(''),[category,setCategory]=useState('units'),[unitId,setUnitId]=useState('')
 const [selection,setSelection]=useState<{scope:string;ids:string[]}|null>(null),[query,setQuery]=useState(''),[count,setCount]=useState('all'),[repeat,setRepeat]=useState(3),[detailsOpen,setDetailsOpen]=useState(false),[preparing,setPreparing]=useState(false),[preflight,setPreflight]=useState<{words:VocabularyWord[];audio:(WordAudio|undefined)[]}|null>(null),[allowFallback,setAllowFallback]=useState(false)
 const initialized=useRef(false),request=useRef(0),contextApplied=useRef(false)
 const books=[...new Set(units.map(unit=>unit.book))]
 useEffect(()=>{
  if(!unitsLoaded)return
  initialized.current=true
  if(!entryContext||contextApplied.current)return
  contextApplied.current=true
  if(entryContext.kind==='online'&&units.length===0){setBook('');return}
  const candidates=entryContext.kind==='local'?units.filter(item=>item.book===entryContext.title):entryContext.bookId==='tape3a_002013'?units.filter(item=>item.book==='3年级英语上册'):entryContext.bookId==='tape6a_002015'?units.filter(item=>item.book==='六年级英语上册 · PEP新版（E63 002015）'):[]
  const matches=[...new Set(candidates.map(item=>item.book))]
  setBook(matches.length===1?matches[0]:'')
 },[entryContext,units,unitsLoaded])
 const currentBook=books.includes(book)?book:units.find(item=>item.id===unitId)?.book??(entryContext?'':books[0]??'')
 const available=units.filter(item=>item.book===currentBook&&(item.category??'units')===category).sort((a,b)=>a.title.localeCompare(b.title,'zh-CN',{numeric:true}))
 const unit=available.find(item=>item.id===unitId)??available[0],words=unit?.words.filter(word=>word.english.trim())??[]
 const scope=JSON.stringify([category,unit?.id]),selectedIds=new Set(selection?.scope===scope?selection.ids:words.map(word=>word.id)),chosen=words.filter(word=>selectedIds.has(word.id))
 const actualCount=count==='all'?chosen.length:count===''?0:Math.min(chosen.length,Math.max(1,Math.floor(Number(count)||1)))
 useEffect(()=>{if(chosen.length)setCount(value=>value==='all'||value===''?value:String(Math.min(chosen.length,Math.max(1,Math.floor(Number(value)||1)))) )},[chosen.length])
 const visible=words.filter(word=>(word.english+' '+word.meaning).toLowerCase().includes(query.trim().toLowerCase())),visibleIds=visible.map(word=>word.id)
 const noun=category==='expressions'?'句表达':'个单词'
 const selectedReady=!!preflight&&preflight.words.length===actualCount&&preflight.words.every(word=>chosen.some(item=>item.id===word.id))
 const missing=preflight?.words.map((word,index)=>!preflight.audio[index]?word.english:'').filter(Boolean)??[]
 const missingPlain=preflight?.words.some((word,index)=>!word.audio&&!preflight.audio[index])??false
 const missingOriginal=preflight?.words.some((word,index)=>!!word.audio&&!preflight.audio[index])??false
 useEffect(()=>{onContextChange({book:currentBook,category,unitId:unit?.id??''})},[currentBook,category,unit?.id])
 function resetPreflight(){request.current++;setPreparing(false);setPreflight(null);setAllowFallback(false)}
 function changeScope(change:()=>void){change();setSelection(null);setQuery('');resetPreflight()}
 function toggle(id:string){const ids=new Set(selectedIds);if(ids.has(id))ids.delete(id);else ids.add(id);setSelection({scope,ids:[...ids]});resetPreflight()}
 function setFiltered(checked:boolean){const ids=new Set(selectedIds);for(const id of visibleIds){if(checked)ids.add(id);else ids.delete(id)}setSelection({scope,ids:[...ids]});resetPreflight()}
 async function prepareRound(retry=false){
  if(preparing)return
  if(selectedReady&&!retry){if(missingOriginal)return;onStart({words:preflight!.words,title:`${currentBook} · ${unit?.title??''}`,repeat,audio:preflight!.audio,allowFallback});resetPreflight();return}
  if(!unit||!actualCount)return
  const id=++request.current,roundWords=createDictationQueue(chosen,actualCount)
  setPreparing(true)
  try{const audio=await resolveDictationAudios(roundWords);if(id===request.current)setPreflight({words:roundWords,audio})}
  catch{if(id===request.current)setPreflight({words:roundWords,audio:roundWords.map(()=>undefined)})}
  finally{if(id===request.current)setPreparing(false)}
 }
 useEffect(()=>()=>{request.current++},[])
 const toggleDetails=()=>setDetailsOpen(value=>!value)
 return <div className="practice-layout"><section className="practice-content" aria-label="选择听写内容">
  <label className="field-label">教材<select aria-label="选择课本" value={currentBook} disabled={!books.length} onChange={event=>changeScope(()=>{setBook(event.target.value);setUnitId('')})}><option value="">请选择教材</option>{books.map(name=><option key={name}>{name}</option>)}</select></label>
  <fieldset className="practice-categories"><legend>听写范围</legend><div>{[['units','单元单词'],['vocabulary','整册词汇'],['expressions','常用表达']].map(([value,label])=><button key={value} aria-pressed={category===value} className={category===value?'selected':''} onClick={()=>changeScope(()=>{setCategory(value);setUnitId('')})}>{category===value&&<Check size={18}/ >}{label}</button>)}</div></fieldset>
  <fieldset className="practice-units"><legend>选择单元</legend><div>{available.map(item=><button className={unit?.id===item.id?'selected':''} aria-pressed={unit?.id===item.id} key={item.id} onClick={()=>changeScope(()=>setUnitId(item.id))}>{unit?.id===item.id&&<Check size={18}/>}{item.title.replace(/^常用表达\s*·\s*/,'')}</button>)}</div></fieldset>
  {!available.length?<div className="practice-empty"><h2>{books.length?'这本教材还没有这类内容':'先添加听写资料'}</h2><p>{entryContext&&!unitsLoaded?'正在读取词表…':entryContext&&!initialized.current?'正在匹配教材…':entryContext?'未找到可确认的对应词表，请手动选择教材。':'到资料管理导入教材或词表，校对保存后再来选择。'}</p><button className="soft-btn" onClick={onImport}>去导入资料</button></div>:<>
   <button className="practice-disclosure" aria-expanded={detailsOpen} onClick={toggleDetails}><span>选择词句 · 已选 {chosen.length}/{words.length} 项</span><ChevronDown size={20}/></button>
   {detailsOpen&&<section className="practice-items" aria-label="具体听写词句"><div className="practice-items-top"><div><h2>本次听写内容</h2><p aria-live="polite">已选 {chosen.length} / {words.length} 项</p></div><div><button className="soft-btn" onClick={()=>{setSelection({scope,ids:words.map(word=>word.id)});resetPreflight()}}>全选本单元</button><button className="soft-btn" onClick={()=>{setSelection({scope,ids:[]});resetPreflight()}}>清空本单元</button></div></div>
    <label className="word-search"><Search size={19}/><input aria-label="搜索当前单元词句" placeholder="搜索当前单元词句" value={query} onChange={event=>{setQuery(event.target.value);resetPreflight()}}/></label>
    {query.trim()&&<div className="practice-search-actions"><span>搜索结果 {visible.length} 项</span><button className="soft-btn" disabled={!visible.length} onClick={()=>setFiltered(true)}>选中搜索结果</button><button className="soft-btn" disabled={!visible.length} onClick={()=>setFiltered(false)}>取消结果选择</button></div>}
    <div className="practice-word-list"><div className="practice-word-list-head"><span/><span>英文</span><span>中文</span></div>{visible.map(word=><label className="practice-word-row" key={word.id}><input type="checkbox" aria-label={`听写 ${word.english}`} checked={selectedIds.has(word.id)} onChange={()=>toggle(word.id)}/><span>{word.english}</span><span>{word.meaning||'暂无释义'}</span></label>)}{!visible.length&&<p className="no-search-result">没有找到符合条件的词句。</p>}</div><p className="practice-help">选中的词句会随机播放，开始后隐藏答案。</p></section>}
  </>}
 </section><aside className="practice-summary" aria-label="听写设置"><h2>本次听写</h2><div className="practice-round-summary"><p>{currentBook?`${currentBook} · ${unit?.title.replace(/^常用表达\s*·\s*/,'')??'请选择单元'}`:'请选择教材'}</p><span>已选 {chosen.length} {noun} · 随机抽取 {actualCount} {noun} · 每题播放 {repeat} 遍</span></div>
  <button className="practice-settings-toggle" aria-expanded={detailsOpen} onClick={toggleDetails}>数量与播放设置</button>
  {detailsOpen&&<div className="practice-advanced-settings"><fieldset><legend>出题数量</legend><label><input type="radio" name="question-count" checked={count==='all'} onChange={()=>{setCount('all');resetPreflight()}}/>全部</label><label><input type="radio" name="question-count" checked={count!=='all'} onChange={()=>{setCount(String(Math.max(1,Math.min(chosen.length,10))));resetPreflight()}}/>自定义</label><input aria-label="听写数量" type="number" min={1} max={Math.max(1,chosen.length)} value={count==='all'?String(chosen.length):count} disabled={count==='all'||!chosen.length} onChange={event=>{const value=event.target.value;setCount(value===''?'':String(Math.min(chosen.length,Math.max(1,Math.floor(Number(value)||1)))));resetPreflight()}} onBlur={()=>{if(count===''){setCount('1');resetPreflight()}else{const normalized=String(Math.min(chosen.length,Math.max(1,Math.floor(Number(count)||1))));if(normalized!==count){setCount(normalized);resetPreflight()}}}}/></fieldset><label className="field-label summary-repeat">每题播放<select aria-label="每题播放次数" value={repeat} onChange={event=>{setRepeat(Number(event.target.value));resetPreflight()}}>{[3,2,1].map(value=><option key={value} value={value}>{value} 遍</option>)}</select></label></div>}
  {preflight&&<div className="audio-preflight" role="status"><b>{missing.length?`本轮有 ${missing.length} 题未准备好声音`:'本轮声音已准备，可开始听写'}</b><p>预检可能联网并暂存音频；不能保证之后播放或离线可用。</p>{missingOriginal&&<p>教材原音缺失或无法验证。原音题不会替换为其他声音。</p>}{missingPlain&&!allowFallback&&<p>普通词音频缺失；开始后会在对应题目提示，可重听重试。</p>}{missingPlain&&<label><input type="checkbox" checked={allowFallback} onChange={event=>setAllowFallback(event.target.checked)}/> 普通词缺音频时允许设备备用朗读</label>}{missingPlain&&!missingOriginal&&<button className="soft-btn" onClick={()=>{onStart({words:preflight!.words,title:`${currentBook} · ${unit?.title??''}`,repeat,audio:preflight!.audio,allowFallback});resetPreflight()}}>先开始，缺音频时再处理</button>}{missing.length>0&&<button className="soft-btn" onClick={()=>{setPreflight(null);void prepareRound(true)}}>重试检查</button>}</div>}
  <button className="practice-start" disabled={!actualCount||preparing||!!(selectedReady&&missingOriginal)} onClick={()=>void prepareRound()}><Headphones size={22}/>{preparing?'正在准备声音…':selectedReady?'开始听写':'检查声音并开始'}</button><p className="practice-help">默认随机抽取，每题读 3 遍；手动进入下一词。</p>
 </aside><div className="practice-mobile-start"><span>听写 {actualCount} {noun}</span><button className="practice-start" disabled={!actualCount||preparing||!!(selectedReady&&missingOriginal)} onClick={()=>void prepareRound()}>{preparing?'正在准备…':selectedReady?'开始听写':'检查声音并开始'}</button></div></div>
}
