import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {useReaderPlayback} from '../../src/reader/useReaderPlayback'
import type {ReaderItem,LocalBook} from '../../src/reader/types'

type MediaRecord={element:FakeMedia;src:string}
const media:MediaRecord[]=[]
// 可控的媒体元素：测试手动触发元数据、seek 完成与 timeupdate，避免依赖真实音频解码。
class FakeMedia extends EventTarget {
 private time=0
 duration=10
 readyState=0
 seeking=false
 paused=true
 playbackRate=1
 src=''
 onended:(()=>void)|null=null
 onerror:(()=>void)|null=null
 pauses=0
 constructor(src:string){super();this.src=src;media.push({element:this,src})}
 get currentTime(){return this.time}
 set currentTime(value:number){this.time=value;this.seeking=true}
 play(){this.paused=false;return Promise.resolve()}
 pause(){this.pauses++;this.paused=true}
 load(){}
 removeAttribute(name:string){if(name==='src')this.src=''}
 metadata(){this.readyState=1;this.dispatchEvent(new Event('loadedmetadata'))}
 seeked(){this.seeking=false;this.dispatchEvent(new Event('seeked'))}
 tick(time:number){this.time=time;this.dispatchEvent(new Event('timeupdate'))}
 finish(){this.paused=true;this.onended?.()}
}
window.Audio=FakeMedia as unknown as typeof Audio
Object.assign(window,{__media:media})
const rangeItem:ReaderItem={id:'R',text:'Range sentence',order:1,rects:[],audio:'R.mp3',audioStart:2,audioEnd:4}
const fullItem:ReaderItem={id:'F',text:'Full sentence',order:1,rects:[],audio:'F.mp3'}
const book:LocalBook={id:'range-fixture',manifest:{schemaVersion:1,bookId:'range-fixture',title:'区间回归样本',publisherId:'pep',pages:[]},assets:{'R.mp3':new Blob(['R']),'F.mp3':new Blob(['F'])}}
export function Harness(){
 const [selected,setSelected]=useState<ReaderItem|null>(null),[repeat,setRepeat]=useState(1)
 const playback=useReaderPlayback(book,setSelected,repeat,1)
 return <main><h1>Audio range regression fixture</h1><output aria-label="playback status">{playback.status}</output><output aria-label="playback source">{playback.source}</output><output aria-label="selected sentence">{selected?.id}</output><button onClick={()=>playback.play(rangeItem)}>Play range</button><button onClick={()=>playback.play(fullItem)}>Play full</button><button onClick={()=>setRepeat(2)}>Repeat twice</button><button onClick={()=>playback.toggle(selected)}>Pause or resume</button><button onClick={playback.stop}>Stop</button></main>
}
const root=createRoot(document.getElementById('root')!);root.render(<Harness/>);Object.assign(window,{__unmount:()=>root.unmount()})
