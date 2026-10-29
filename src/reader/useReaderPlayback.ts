import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { audioKey, readWordAudios } from '../wordAudio'
import type { LocalBook, ReaderItem } from './types'
export type ReaderPlaybackStatus='idle'|'loading'|'playing'|'paused'|'error'
export function useReaderPlayback(book:LocalBook|null,onSelect:(item:ReaderItem)=>void,repeat:number,speed:number) {
 const [status,setStatus]=useState<ReaderPlaybackStatus>('idle'),[source,setSource]=useState(''),[error,setError]=useState('')
 const audio=useRef<HTMLAudioElement|null>(null),speech=useRef<SpeechSynthesisUtterance|null>(null),url=useRef('')
 const version=useRef(0),attempt=useRef(0),phase=useRef<ReaderPlaybackStatus>('idle'),paused=useRef(false),pendingEnd=useRef(false)
 const complete=useRef<(()=>void)|null>(null),resumePlayback=useRef<(()=>void)|null>(null)
 const queue=useRef<ReaderItem[]>([]),position=useRef(0),times=useRef(0),bookRef=useRef(book),selectRef=useRef(onSelect),options=useRef({repeat,speed})
 useLayoutEffect(()=>{bookRef.current=book;selectRef.current=onSelect;options.current={repeat,speed}},[book,onSelect,repeat,speed])
 function changeStatus(value:ReaderPlaybackStatus){phase.current=value;setStatus(value)}
 function clearMedia(){
  const player=audio.current;audio.current=null
  if(player){player.onended=null;player.onerror=null;player.pause();player.removeAttribute('src');player.load()}
  if(speech.current){speech.current.onstart=null;speech.current.onend=null;speech.current.onerror=null;speech.current=null}
  window.speechSynthesis?.cancel()
  if(url.current){URL.revokeObjectURL(url.current);url.current=''}
 }
 function invalidate(){version.current++;attempt.current++;complete.current=null;resumePlayback.current=null;pendingEnd.current=false;paused.current=false;clearMedia()}
 function stop(){invalidate();queue.current=[];changeStatus('idle');setError('');setSource('')}
 function fail(message:string,token:number){if(token!==version.current)return;invalidate();queue.current=[];setError(message);changeStatus('error')}
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
 async function startItem(previousToken:number){
  if(previousToken!==version.current)return
  const item=queue.current[position.current]
  if(!item){clearMedia();changeStatus('idle');return}
  // Each sentence has its own generation, including sentences in the same page queue.
  invalidate();const token=version.current;times.current=0
  selectRef.current(item);changeStatus('loading');setError('');setSource('')
  try{
   let blob=item.audio?bookRef.current?.assets[item.audio]:undefined,src=item.audio,kind=src?'教材音频':''
   if(!src){const record=(await readWordAudios([item.text])).get(audioKey(item.text));if(token!==version.current)return;if(record){blob=record.blob;kind=record.voice.startsWith('网站音频')?record.voice:'本地音频'}}
   if(token!==version.current)return
   if(blob){url.current=URL.createObjectURL(blob);src=url.current}
   setSource(kind||'浏览器朗读')
   const finished=()=>{
    if(token!==version.current)return
    times.current++
    if(options.current.repeat===0||times.current<options.current.repeat)speak()
    else if(++position.current<queue.current.length)void startItem(token)
    else{invalidate();queue.current=[];changeStatus('idle')}
   }
   complete.current=finished
   let cycle=0
   const speak=()=>{
    if(token!==version.current||paused.current)return
    const currentCycle=++cycle;let ended=false
    const end=()=>{
     if(token!==version.current||currentCycle!==cycle||ended)return
     ended=true
     if(paused.current)pendingEnd.current=true
     else finished()
    }
    if(src){
     if(!audio.current)audio.current=new Audio(src)
     const player=audio.current
     player.onended=end;player.onerror=()=>{if(audio.current===player)fail('音频无法播放，请重试或检查音频文件。',token)}
     player.currentTime=0;player.playbackRate=options.current.speed;requestPlay(player,token)
    }else if('speechSynthesis'in window){
     const utterance=new SpeechSynthesisUtterance(item.text);utterance.lang='en-US';utterance.rate=options.current.speed
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
 useEffect(()=>{if(audio.current)audio.current.playbackRate=speed},[speed])
 useEffect(()=>()=>{version.current++;attempt.current++;clearMedia()},[])
 return {status,source,error,play,stop,toggle}
}
