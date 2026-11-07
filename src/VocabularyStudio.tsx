import { useEffect, useRef, useState } from 'react'
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
 const live=useRef(true)
 function loadVocabulary(){setNotice('');setUnitsLoaded(false);void seedHostedVocabulary().then(items=>{if(!live.current)return;setUnits(items);setUnitsLoaded(true);if(!items.length)setNotice('词表暂时无法读取，请检查网络后重试。')}).catch(()=>{if(!live.current)return;setUnitsLoaded(true);setNotice('词表读取失败，请检查网络或浏览器存储后重试。')})}
 useEffect(()=>{live.current=true;loadVocabulary();return()=>{live.current=false}},[])
 const go=(next:AppRoute)=>onNavigate(next,done=>done())
 return <section className={`dictation-workspace${round?' session-open':''}`}><header className="topbar" inert={!!round} aria-hidden={round?true:undefined}><div className="topbar-inner"><div className="brand"><span className="brand-mark" aria-hidden="true"><BookOpen size={19}/></span><span className="brand-text"><strong>英语课本点读</strong><span>PEP · 点读跟读</span></span></div><nav className="nav" aria-label="学习导航"><button className="nav-btn" onClick={()=>go({kind:'shelf'})}>课本点读</button><button className="nav-btn" onClick={()=>go({kind:'followalong',bookId:followAlongBook(),unitId:''})}>跟读学习</button><button className="nav-btn selected" aria-current="page">听写练习</button></nav></div></header><main inert={!!round} aria-hidden={round?true:undefined} className="dictation-page"><div className="page-head"><p className="kicker">LISTEN &amp; WRITE</p><h1>听写练习</h1><p>选好内容，检查声音，再开始。答案在交卷后才会出现。</p></div>{notice&&<div className="material-notice" role="status">{notice}<button className="soft-btn" onClick={loadVocabulary}>重新读取词表</button></div>}<DictationChooser units={units} unitsLoaded={unitsLoaded} entryContext={entryContext} onStart={setRound}/></main>{round&&<DictationSession key={roundKey} words={round.words} title={round.title} repeat={round.repeat} audio={round.audio} allowFallback={round.allowFallback} onBack={()=>setRound(null)} onReplay={indices=>{if(!indices.length)return;setRound(current=>current?{...current,words:indices.map(index=>current.words[index]),audio:indices.map(index=>current.audio[index])}:current);setRoundKey(value=>value+1)}}/>}</section>
}
