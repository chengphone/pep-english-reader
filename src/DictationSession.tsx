import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Pause, Play, RotateCcw, Volume2 } from 'lucide-react'
import { resolveDictationAudios } from './textbookAudio'
import type { VocabularyWord } from './vocabularyExtraction'
import type { WordAudio } from './wordAudio'
type Word=VocabularyWord
type Status='speaking'|'writing'|'paused'|'finished'|'error'
export default function DictationSession({words,title,repeat,audio,allowFallback:initialFallback,onBack}:{words:Word[];title:string;repeat:number;audio:(WordAudio|undefined)[];allowFallback:boolean;onBack:()=>void}){
 const [index,setIndex]=useState(0),[played,setPlayed]=useState(0),[status,setStatus]=useState<Status>('speaking'),[autoNext,setAutoNext]=useState(false),[waitSeconds,setWaitSeconds]=useState(5),[remaining,setRemaining]=useState(5),[revealed,setRevealed]=useState(false)
 const [source,setSource]=useState('正在读取音频…'),[allowFallback,setAllowFallback]=useState(initialFallback),[settingsOpen,setSettingsOpen]=useState(false)
 const run=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),utterance=useRef<SpeechSynthesisUtterance|null>(null)
 const player=useRef<HTMLAudioElement|null>(null),objectUrl=useRef('')
 function stop(){run.current++;clearTimeout(timer.current);if(player.current){player.current.onended=null;player.current.onerror=null;player.current.pause();player.current.removeAttribute('src');player.current.load();player.current=null}if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current=''}if(utterance.current){utterance.current.onend=null;utterance.current.onerror=null;utterance.current=null}window.speechSynthesis?.cancel()}
 async function playQuestion(at:number,alreadyPlayed=0,fallback=allowFallback,retryMissing=false){
  stop();setIndex(at);setPlayed(alreadyPlayed)
  if(at>=words.length){setStatus('finished');return}
  if(alreadyPlayed>=repeat){setStatus('writing');return}
  setStatus('speaking');setSource('正在准备音频…');const token=run.current;let done=alreadyPlayed
  const fail=(message:string)=>{if(token!==run.current)return;stop();setSource(message);setStatus('error')}
  const ended=()=>{if(token!==run.current)return;done++;setPlayed(done);if(done>=repeat)setStatus('writing');else timer.current=setTimeout(say,450)}
  let record:WordAudio|undefined
  try{record=audio[at]??(!words[at].audio||retryMissing?(await resolveDictationAudios([words[at]]))[0]:undefined)}catch{fail('本地音频读取失败，请返回检查音频。');return}
  if(token!==run.current)return
  if(record){objectUrl.current=URL.createObjectURL(record.blob);player.current=new Audio(objectUrl.current);setSource(record.voice.startsWith('网站音频')?record.voice:'本地音频 · '+record.voice)}
  else if(words[at].audio){fail('本题教材原音未能加载，请联网后重试；不会使用备用合成语音。');return}
  else if(!fallback){fail('本题缺少本地音频，请返回“管理词表”导入，或开启备用朗读。');return}
  else if(!('speechSynthesis'in window)){fail('当前浏览器没有备用语音，请导入本地音频。');return}
  else setSource('浏览器备用朗读 · 发音因设备而异')
  function say(){
   if(token!==run.current)return
   if(record&&player.current){const audio=player.current;audio.currentTime=0;audio.onended=ended;audio.onerror=()=>fail('本地音频播放失败，请重听或重新导入。');void audio.play().catch(()=>fail('播放未启动，请点击重听。'));return}
   const u=new SpeechSynthesisUtterance(words[at].english);u.lang='en-US';u.rate=.85
   const voices=window.speechSynthesis.getVoices();u.voice=voices.find(v=>v.lang==='en-US'&&/Aria|Jenny|Samantha|Google US English/.test(v.name))??voices.find(v=>v.lang==='en-US')??null
   utterance.current=u;u.onend=ended;u.onerror=()=>fail('备用语音播放失败，请导入本地音频。');try{window.speechSynthesis.speak(u)}catch{fail('备用语音播放失败')}
  }
  say()
 }
 function advance(){playQuestion(index+1)}
 function togglePause(){if(status==='paused'){if(played<repeat)void playQuestion(index,played);else setStatus('writing')}else{stop();setStatus('paused')}}
 useEffect(()=>{void playQuestion(0);return stop},[])
 useEffect(()=>{if(status!=='writing'||!autoNext)return;setRemaining(waitSeconds);const token=run.current;const countdown=setInterval(()=>setRemaining(n=>Math.max(0,n-1)),1000);const next=setTimeout(()=>{if(token===run.current)advance()},waitSeconds*1000);return()=>{clearInterval(countdown);clearTimeout(next)}},[status,autoNext,waitSeconds,index])
 const completed=status==='finished'?words.length:status==='writing'?index+1:index
 const percent=100*completed/Math.max(1,words.length)
 return <section className="dictation-screen"><header><button onClick={()=>{stop();onBack()}}><ArrowLeft size={17}/>返回词表</button><span>{title} · 听音默写</span><span>{Math.min(index+1,words.length)} / {words.length}</span></header><div className="dictation-card"><div className="dictation-progress" role="progressbar" aria-label="听写进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{width:`${percent}%`}}/></div><div className="dictation-progress-label">已完成 {completed} / {words.length} 题 · {Math.round(percent)}%</div>{status!=='finished'?<><span className="dictation-kicker">LISTEN & WRITE</span><div className="sound-orb"><Volume2 size={30}/></div><h2>听发音，用纸笔写下来</h2><p aria-live="polite">第 {index+1} 题 · 已读 {played} / {repeat} 遍{status==='speaking'?(played===0?' · 正在准备声音':' · 正在朗读'):status==='writing'?(autoNext?` · ${remaining} 秒后自动下一题`:' · 等待手动下一题'):status==='paused'?' · 已暂停':' · 发音失败，请重听或手动下一题'}</p><p className="dictation-audio-source" role="status">{source}</p><button className="dictation-settings-toggle" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(value=>!value)}>{settingsOpen?'收起本轮设置':'本轮设置'}</button>{settingsOpen&&<div className="dictation-play-settings"><label><input type="checkbox" disabled={!!words[index]?.audio} checked={words[index]?.audio?false:allowFallback} onChange={e=>{setAllowFallback(e.target.checked);void playQuestion(index,0,e.target.checked)}}/>缺少音频时允许浏览器备用朗读</label><label className="auto-next-switch"><input type="checkbox" role="switch" aria-label="自动下一词" checked={autoNext} onChange={e=>setAutoNext(e.target.checked)}/><span className="switch-track" aria-hidden="true"/><span>自动下一词</span></label><label>书写间隔<select aria-label="书写间隔" value={waitSeconds} onChange={e=>setWaitSeconds(Number(e.target.value))}>{[2,5,8,10,15].map(n=><option key={n} value={n}>{n} 秒</option>)}</select></label></div>}<div className="dictation-actions"><button className="soft-btn" onClick={()=>playQuestion(index,0,allowFallback,true)}><RotateCcw size={16}/>重听 {repeat} 遍</button><button className="soft-btn" onClick={togglePause}>{status==='paused'?<Play size={16}/>:<Pause size={16}/ >}{status==='paused'?'继续':'暂停'}</button><button className="solid-btn" onClick={advance}>{index+1===words.length?'完成本轮':'下一个'}<Check size={16}/></button></div></>:<><span className="dictation-kicker">ROUND COMPLETE</span><h2>本轮听写完成</h2><p>共 {words.length} 题。写完后再查看答案。</p><button className="solid-btn" onClick={()=>setRevealed(true)}>对答案</button></>}{revealed&&<div className="answer-key"><h3>答案 · {title}</h3>{words.map((w,i)=><div key={w.id}><span>{i+1}</span><b>{w.english}</b><em>{w.meaning}</em></div>)}</div>}</div></section>
}
