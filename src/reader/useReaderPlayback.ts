import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { audioKey, readWordAudios } from '../wordAudio'
import { formatAudioRange, prepareAudioRange, rangeProgress, resolveAudioRange, type AudioRange } from './audioRange'
import type { LocalBook, ReaderItem } from './types'
export type ReaderPlaybackStatus='idle'|'loading'|'playing'|'paused'|'error'
export type ReaderPlaybackController={
 status:ReaderPlaybackStatus
 source:string
 error:string
 current:number
 duration:number
 volume:number
 muted:boolean
 play:(item:ReaderItem,remaining?:ReaderItem[])=>void
 stop:()=>void
 toggle:(selected:ReaderItem|null)=>void
 seek:(value:number)=>void
 setVolume:(value:number)=>void
 toggleMute:()=>void
}
export function useReaderPlayback(book:LocalBook|null,onSelect:(item:ReaderItem)=>void,repeat:number,speed:number):ReaderPlaybackController {
 const [status,setStatus]=useState<ReaderPlaybackStatus>('idle'),[source,setSource]=useState(''),[error,setError]=useState('')
 const [current,setCurrent]=useState(0),[duration,setDuration]=useState(0)
 const [volume,setVolumeState]=useState(1),[muted,setMutedState]=useState(false)
 const audio=useRef<HTMLAudioElement|null>(null),speech=useRef<SpeechSynthesisUtterance|null>(null),url=useRef('')
 const version=useRef(0),attempt=useRef(0),phase=useRef<ReaderPlaybackStatus>('idle'),paused=useRef(false),pendingEnd=useRef(false)
 const complete=useRef<(()=>void)|null>(null),resumePlayback=useRef<(()=>void)|null>(null),rangeDetach=useRef<(()=>void)|null>(null)
 const range=useRef<AudioRange|null>(null),volumeRef=useRef(1),mutedRef=useRef(false)
 const queue=useRef<ReaderItem[]>([]),position=useRef(0),times=useRef(0),bookRef=useRef(book),selectRef=useRef(onSelect),options=useRef({repeat,speed})
 useLayoutEffect(()=>{bookRef.current=book;selectRef.current=onSelect;options.current={repeat,speed}},[book,onSelect,repeat,speed])
 function changeStatus(value:ReaderPlaybackStatus){phase.current=value;setStatus(value)}
 function resetProgress(){range.current=null;setCurrent(0);setDuration(0)}
 function clearMedia(){
  rangeDetach.current?.();rangeDetach.current=null
  const player=audio.current;audio.current=null
  if(player){player.onended=null;player.onerror=null;player.ontimeupdate=null;player.onloadedmetadata=null;player.pause();player.removeAttribute('src');player.load()}
  if(speech.current){speech.current.onstart=null;speech.current.onend=null;speech.current.onerror=null;speech.current=null}
  window.speechSynthesis?.cancel()
  if(url.current){URL.revokeObjectURL(url.current);url.current=''}
  range.current=null
 }
 function invalidate(){version.current++;attempt.current++;complete.current=null;resumePlayback.current=null;pendingEnd.current=false;paused.current=false;clearMedia()}
 function stop(){invalidate();queue.current=[];changeStatus('idle');setError('');setSource('');resetProgress()}
 function fail(message:string,token:number){if(token!==version.current)return;invalidate();queue.current=[];setError(message);changeStatus('error');resetProgress()}
 function requestPlay(player:HTMLAudioElement,token:number){
  const request=++attempt.current
  changeStatus('loading')
  const active=()=>token===version.current&&request===attempt.current&&audio.current===player
  try{
   void player.play().then(()=>{
    if(active()&&!paused.current)changeStatus('playing')
    else if(audio.current===player&&paused.current)player.pause()
   }).catch(()=>{if(active()&&!paused.current)fail('播放未启动，请再点一次播放。',token)})
  }catch{if(active())fail('播放未启动，请再点一次播放。',token)}
 }
 function syncProgress(player:HTMLAudioElement, activeRange:AudioRange|null=range.current){
  if(audio.current!==player)return
  const next=rangeProgress(player.currentTime,activeRange,player.duration)
  setCurrent(next.current);setDuration(next.total)
 }
 async function startItem(previousToken:number){
  if(previousToken!==version.current)return
  const item=queue.current[position.current]
  if(!item){clearMedia();changeStatus('idle');resetProgress();return}
  // Each sentence has its own generation, including sentences in the same page queue.
  invalidate();const token=version.current;times.current=0
  resetProgress()
  selectRef.current(item);changeStatus('loading');setError('');setSource('')
  try{
   let blob=item.audio?bookRef.current?.assets[item.audio]:undefined,src=item.audio,kind=src?'教材音频':''
   if(!src){const record=(await readWordAudios([item.text])).get(audioKey(item.text));if(token!==version.current)return;if(record){blob=record.blob;kind=record.voice.startsWith('网站音频')?record.voice:'本地音频'}}
   if(token!==version.current)return
   if(blob){url.current=URL.createObjectURL(blob);src=url.current}
   const rangeValue=src?resolveAudioRange(item):null
   range.current=rangeValue
   // 区间总长可以先显示出来，不必等浏览器加载完整音频元数据。
   if(rangeValue)setDuration(Math.max(0,rangeValue.end-rangeValue.start))
   setSource(rangeValue?`${kind||'浏览器朗读'} · ${formatAudioRange(rangeValue.start,rangeValue.end)}`:kind||'浏览器朗读')
   const finished=()=>{
    if(token!==version.current)return
    times.current++
    if(options.current.repeat===0||times.current<options.current.repeat)speak()
    else if(++position.current<queue.current.length)void startItem(token)
    else{invalidate();queue.current=[];changeStatus('idle');resetProgress()}
   }
   complete.current=finished
   let cycle=0
   const speak=()=>{
    if(token!==version.current||paused.current)return
    const currentCycle=++cycle;let ended=false
    const end=()=>{
     if(token!==version.current||currentCycle!==cycle||ended)return
     ended=true;rangeDetach.current?.();rangeDetach.current=null
     if(paused.current)pendingEnd.current=true
     else finished()
    }
    if(src){
     if(!audio.current)audio.current=new Audio(src)
     const player=audio.current
     player.onended=end
     player.onerror=()=>{if(audio.current===player)fail('音频无法播放，请重试或检查音频文件。',token)}
     player.ontimeupdate=()=>syncProgress(player,rangeValue)
     player.onloadedmetadata=()=>syncProgress(player,rangeValue)
     player.volume=volumeRef.current
     player.muted=mutedRef.current
     rangeDetach.current?.();rangeDetach.current=null
     rangeDetach.current=prepareAudioRange(player,item,end)
     player.playbackRate=options.current.speed
     requestPlay(player,token)
    }else if('speechSynthesis'in window){
     const utterance=new SpeechSynthesisUtterance(item.text);utterance.lang='en-US';utterance.rate=options.current.speed;utterance.volume=volumeRef.current
     if(mutedRef.current)utterance.volume=0
     const voices=window.speechSynthesis.getVoices()
     utterance.voice=voices.find(v=>v.lang==='en-US'&&/Aria|Jenny|Samantha|Google US English/.test(v.name))??voices.find(v=>v.lang==='en-US')??null
     utterance.onstart=()=>{if(token===version.current&&speech.current===utterance&&!paused.current)changeStatus('playing')}
     utterance.onend=end;utterance.onerror=()=>{if(speech.current===utterance)fail('当前语音不可用，请导入本地音频。',token)}
     speech.current=utterance;changeStatus('loading');window.speechSynthesis.resume();window.speechSynthesis.speak(utterance)
    }else fail('没有可用语音，请先导入音频。',token)
   }
   resumePlayback.current=speak
   if(!paused.current)speak()
  }catch{fail('本地音频读取失败，请重试。',token)}
 }
 function play(item:ReaderItem,remaining:ReaderItem[]=[]){stop();queue.current=[item,...remaining];position.current=0;void startItem(version.current)}
 function toggle(selected:ReaderItem|null){
  if(phase.current==='playing'||phase.current==='loading'){
   paused.current=true;attempt.current++;audio.current?.pause();if(speech.current)window.speechSynthesis.pause();changeStatus('paused')
  }else if(phase.current==='paused'){
   paused.current=false;changeStatus('loading')
   if(pendingEnd.current){pendingEnd.current=false;complete.current?.();return}
   if(audio.current)requestPlay(audio.current,version.current)
   else if(speech.current){window.speechSynthesis?.resume();changeStatus('playing')}
   // When the download is still pending, startItem will observe the resumed state.
   else resumePlayback.current?.()
  }else if(selected)play(selected)
 }
 function seek(value:number){
  const player=audio.current
  if(!player)return
  const activeRange=range.current
  const absolute=activeRange
   ?activeRange.start+Math.max(0,Math.min(value,activeRange.end-activeRange.start))
   :Math.max(0,value)
  try{player.currentTime=absolute;syncProgress(player,activeRange)}catch{/* 元数据尚未就绪时忽略拖动 */}
 }
 function setVolume(value:number){
  const next=Math.max(0,Math.min(1,value));volumeRef.current=next;setVolumeState(next)
  if(audio.current)audio.current.volume=next
 }
 function toggleMute(){
  const next=!mutedRef.current;mutedRef.current=next;setMutedState(next)
  if(audio.current)audio.current.muted=next
 }
 useEffect(()=>{if(audio.current)audio.current.playbackRate=speed},[speed])
 useEffect(()=>()=>{version.current++;attempt.current++;clearMedia()},[])
 return {status,source,error,current,duration,volume,muted,play,stop,toggle,seek,setVolume,toggleMute}
}
