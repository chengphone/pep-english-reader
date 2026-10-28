import { useEffect, useRef, useState } from 'react'
import { audioKey, readWordAudios } from '../wordAudio'
import type { LocalBook, ReaderItem } from './types'
export type ReaderPlaybackStatus='idle'|'loading'|'playing'|'paused'|'error'
export function useReaderPlayback(book:LocalBook|null,onSelect:(item:ReaderItem)=>void,repeat:number,speed:number) {
 const [status,setStatus]=useState<ReaderPlaybackStatus>('idle'),[source,setSource]=useState(''),[error,setError]=useState('')
 const audio=useRef<HTMLAudioElement|null>(null),speech=useRef<SpeechSynthesisUtterance|null>(null),url=useRef(''),version=useRef(0),paused=useRef(false),pendingEnd=useRef(false)
 const complete=useRef<(()=>void)|null>(null)
 const queue=useRef<ReaderItem[]>([]),position=useRef(0),times=useRef(0),bookRef=useRef(book),selectRef=useRef(onSelect),options=useRef({repeat,speed})
 bookRef.current=book;selectRef.current=onSelect;options.current={repeat,speed}
 function clearMedia(){if(audio.current){audio.current.onended=null;audio.current.onerror=null;audio.current.pause();audio.current.removeAttribute('src');audio.current.load();audio.current=null}if(speech.current){speech.current.onend=null;speech.current.onerror=null;speech.current=null}window.speechSynthesis?.cancel();if(url.current){URL.revokeObjectURL(url.current);url.current=''}}
 function stop(){version.current++;clearMedia();queue.current=[];paused.current=false;pendingEnd.current=false;setStatus('idle');setError('');setSource('')}
 function fail(message:string,token:number){if(token!==version.current)return;clearMedia();setError(message);setStatus('error')}
 async function startItem(token:number){
  clearMedia();paused.current=false;pendingEnd.current=false;times.current=0
  const item=queue.current[position.current];if(!item||token!==version.current){setStatus('idle');return}
  selectRef.current(item);setStatus('loading');setError('');setSource('')
  try{
   let blob=item.audio?bookRef.current?.assets[item.audio]:undefined,src=item.audio,kind=src?'教材音频':''
   if(!src){const record=(await readWordAudios([item.text])).get(audioKey(item.text));if(token!==version.current)return;if(record){blob=record.blob;kind='本地音频'}}
   if(token!==version.current)return
   if(blob){url.current=URL.createObjectURL(blob);src=url.current}
   setSource(kind||'浏览器朗读')
   const ended=()=>{if(token!==version.current)return;if(paused.current){pendingEnd.current=true;return}times.current++;if(options.current.repeat===0||times.current<options.current.repeat){speak();return}if(++position.current<queue.current.length)void startItem(token);else{clearMedia();setStatus('idle')}}
   complete.current=ended
   let speechVoices:SpeechSynthesisVoice[]=[]
   const speak=()=>{
    if(token!==version.current)return
    if(src){if(!audio.current){audio.current=new Audio(src);audio.current.onended=ended;audio.current.onerror=()=>fail('音频无法播放，请重试或检查音频文件。',token)}const player=audio.current;player.currentTime=0;player.playbackRate=options.current.speed;void player.play().then(()=>{if(token===version.current)setStatus('playing')}).catch(()=>fail('播放未启动，请再点一次播放。',token))}
    else if('speechSynthesis'in window){window.speechSynthesis.resume();const utterance=new SpeechSynthesisUtterance(item.text);utterance.lang='en-US';utterance.rate=options.current.speed;speechVoices=window.speechSynthesis.getVoices();utterance.voice=speechVoices.find(v=>v.lang==='en-US'&&/Aria|Jenny|Samantha|Google US English/.test(v.name))??speechVoices.find(v=>v.lang==='en-US')??null;utterance.onstart=()=>{if(token===version.current)setStatus('playing')};utterance.onend=ended;utterance.onerror=()=>fail('当前语音不可用，请导入本地音频。',token);speech.current=utterance;setStatus('playing');window.speechSynthesis.speak(utterance)}
    else fail('没有可用语音，请先导入音频。',token)
   }
   speak()
  }catch{fail('本地音频读取失败，请重试。',token)}
 }
 function play(item:ReaderItem,remaining:ReaderItem[]=[]){stop();queue.current=[item,...remaining];position.current=0;void startItem(version.current)}
 function toggle(selected:ReaderItem|null){
  if(status==='playing'){paused.current=true;audio.current?.pause();if(speech.current)window.speechSynthesis.pause();setStatus('paused')}
  else if(status==='paused'){
   paused.current=false
   if(pendingEnd.current){pendingEnd.current=false;complete.current?.();return}
   const token=version.current
   if(audio.current)void audio.current.play().then(()=>{if(token===version.current)setStatus('playing')}).catch(()=>fail('请点击停止后重试播放。',token))
   else{window.speechSynthesis?.resume();setStatus('playing')}
  }else if(selected)play(selected)
 }
 useEffect(()=>{if(audio.current)audio.current.playbackRate=speed},[speed])
 useEffect(()=>()=>{version.current++;clearMedia()},[])
 return {status,source,error,play,stop,toggle}
}
