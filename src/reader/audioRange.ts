import type { ReaderItem } from './types'
export type AudioRange={start:number;end:number}
type RangePlayer=Pick<HTMLAudioElement,'currentTime'|'duration'|'seeking'|'readyState'|'pause'|'addEventListener'|'removeEventListener'>
// timeupdate 通常每 250ms 一次，终点留 40ms 余量，避免刚好越过片段末尾还继续播放。
const END_TOLERANCE=.04
// 只认 end > start 的有限秒数；字段缺失或无效时返回 null，老数据继续整段播放。
export function resolveAudioRange(item:Pick<ReaderItem,'audioStart'|'audioEnd'>):AudioRange|null{
 const start=typeof item.audioStart==='number'&&Number.isFinite(item.audioStart)&&item.audioStart>=0?item.audioStart:0
 const end=item.audioEnd
 return typeof end==='number'&&Number.isFinite(end)&&end>start?{start,end}:null
}
// 进度按片段计算：current/total 都是片段内秒数，总长受音频实际时长截断。
// 传入 null 区间时退化为整段进度，保持旧行为。
export function rangeProgress(currentTime:number,range:AudioRange|null,duration:number):{current:number;total:number}{
 const start=range?.start??0
 const end=range?.end??(Number.isFinite(duration)&&duration>0?duration:start)
 const total=Math.max(0,(Number.isFinite(duration)&&duration>0?Math.min(duration,end):end)-start)
 const current=Number.isFinite(currentTime)?currentTime:start
 return {current:Math.min(total,Math.max(0,current-start)),total}
}
export function formatAudioTime(seconds:number){const value=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`}
// 在播放器上启用区间：元数据就绪后跳到起点，播到终点就暂停并回调。
// 返回清理函数；暂停后恢复复用同一播放器时监听保持有效。
export function attachAudioRange(player:RangePlayer,range:AudioRange,onEnd:()=>void){
 let done=false,started=false
 const cleanup=()=>{player.removeEventListener('loadedmetadata',seekToStart);player.removeEventListener('seeked',onSeeked);player.removeEventListener('timeupdate',onTime)}
 const finish=()=>{if(done)return;done=true;cleanup();player.pause();onEnd()}
 const seekToStart=()=>{
  started=false
  try{player.currentTime=range.start}catch{started=true;return}
  // 已在起点时不会触发 seeked，直接开放终点判定。
  if(!player.seeking)started=true
 }
 const onSeeked=()=>{started=true}
 const onTime=()=>{
  if(done||!started||player.seeking)return
  const {current,total}=rangeProgress(player.currentTime,range,player.duration)
  if(total>0&&current>=total-END_TOLERANCE)finish()
 }
 player.addEventListener('loadedmetadata',seekToStart)
 player.addEventListener('seeked',onSeeked)
 player.addEventListener('timeupdate',onTime)
 if(player.readyState>=1)seekToStart()
 return cleanup
}
// 每次播放前调用：有区间时返回监听清理函数；无区间时维持原来的“回到开头整段播放”。
export function prepareAudioRange(player:RangePlayer,item:Pick<ReaderItem,'audioStart'|'audioEnd'>,onEnd:()=>void):(()=>void)|null{
 const range=resolveAudioRange(item)
 if(!range){player.currentTime=0;return null}
 return attachAudioRange(player,range,onEnd)
}
