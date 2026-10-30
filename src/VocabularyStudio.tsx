import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import './VocabularyStudio.css'
import './DictationChooser.css'
import DictationSession from './DictationSession'
import type { AppRoute } from './AppNavigation'
import DictationChooser, { type DictationContext, type DictationRound } from './DictationChooser'
import { seedHostedVocabulary } from './vocabularyStorage'
import type { VocabularyUnit } from './vocabularyExtraction'

function followAlongBook(){try{return localStorage.getItem('pep:followalong-book')??'tape3a_002013'}catch{return 'tape3a_002013'}}

export default function VocabularyStudio({onNavigate,entryContext}:{onNavigate:(next:AppRoute,transition:(done:()=>void)=>void)=>void;entryContext?:DictationContext|null}){
 const [units,setUnits]=useState<VocabularyUnit[]>([]),[unitsLoaded,setUnitsLoaded]=useState(false),[round,setRound]=useState<DictationRound|null>(null),[roundKey,setRoundKey]=useState(0),[notice,setNotice]=useState('')
 useEffect(()=>{let live=true;void seedHostedVocabulary().then(items=>{if(!live)return;setUnits(items);setUnitsLoaded(true)}).catch(()=>{if(!live)return;setUnitsLoaded(true);setNotice('词表读取失败，请检查网络或浏览器存储后重试。')});return()=>{live=false}},[])
 const go=(next:AppRoute)=>onNavigate(next,done=>done())
 return <section className="dictation-workspace kids-vocab"><header className="kids-header" inert={!!round} aria-hidden={round?true:undefined}><div className="kids-brand"><BookOpen size={32}/><span>英语课本点读</span></div><nav aria-label="学习导航"><button onClick={()=>go({kind:'shelf'})}>课本点读</button><button onClick={()=>go({kind:'followalong',bookId:followAlongBook(),unitId:''})}>跟读学习</button><button className="selected" aria-current="page">听写练习</button></nav></header><main inert={!!round} aria-hidden={round?true:undefined} className="dictation-page"><div className="dictation-page-heading"><span className="dictation-eyebrow">LISTEN &amp; WRITE</span><h1>听写练习</h1><p>选好教材、范围和单元，检查声音后开始。</p></div>{notice&&<div className="material-notice" role="status">{notice}</div>}<DictationChooser units={units} unitsLoaded={unitsLoaded} entryContext={entryContext} onStart={setRound}/></main>{round&&<DictationSession key={roundKey} words={round.words} title={round.title} repeat={round.repeat} audio={round.audio} allowFallback={round.allowFallback} onBack={()=>setRound(null)} onReplay={indices=>{if(!indices.length)return;setRound(current=>current?{...current,words:indices.map(index=>current.words[index]),audio:indices.map(index=>current.audio[index])}:current);setRoundKey(value=>value+1)}}/>}</section>
}
