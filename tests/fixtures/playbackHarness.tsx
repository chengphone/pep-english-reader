import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import LocalReader from '../../src/reader/LocalReader'
import {useReaderPlayback} from '../../src/reader/useReaderPlayback'
import type {ReaderItem,LocalBook} from '../../src/reader/types'
type Attempt={resolve:()=>void;reject:(error:Error)=>void}
type Media={element:HTMLAudioElement;attempts:Attempt[];pauses:number;src:string}
const media:Media[]=[],revoked:string[]=[]
const revoke=URL.revokeObjectURL.bind(URL)
URL.revokeObjectURL=(url:string)=>{revoked.push(url);revoke(url)}
window.Audio=function(src:string){
 const element=document.createElement('audio'),record:Media={element,attempts:[],pauses:0,src}
 element.play=()=>new Promise<void>((resolve,reject)=>record.attempts.push({resolve,reject}))
 element.pause=()=>{record.pauses++};element.load=()=>{}
 media.push(record);return element
} as unknown as typeof Audio
Object.assign(window,{__media:media,__revoked:revoked})
const item=(id:string,audio=true):ReaderItem=>({id,text:id,order:1,rects:[],...(audio?{audio:id+'.mp3'}:{})})
const a=item('A'),b=item('B'),remote=item('hosted-test',false)
const book:LocalBook={id:'fixture',manifest:{schemaVersion:1,bookId:'fixture',title:'回归样本',publisherId:'pep',pages:[]},assets:{'A.mp3':new Blob(['A']), 'B.mp3':new Blob(['B'])}}
export function Harness(){
 const [selected,setSelected]=useState<ReaderItem|null>(null),[repeat,setRepeat]=useState(1),[speed,setSpeed]=useState(1)
 const playback=useReaderPlayback(book,setSelected,repeat,speed)
 return <main><h1>Reader playback regression fixture</h1><output aria-label="playback status">{playback.status}</output><output aria-label="selected sentence">{selected?.id}</output><output aria-label="playback source">{playback.source}</output><output aria-label="playback error">{playback.error}</output><button onClick={()=>playback.play(a)}>Play A</button><button onClick={()=>playback.play(b)}>Play B</button><button onClick={()=>playback.play(a,[b])}>Play queue</button><button onClick={()=>playback.play(remote)}>Play hosted</button><button onClick={()=>playback.toggle(selected)}>Pause or resume</button><button onClick={playback.stop}>Stop</button><button onClick={()=>setRepeat(3)}>Repeat three</button><button onClick={()=>setRepeat(0)}>Repeat forever</button><button onClick={()=>setSpeed(1.25)}>Faster</button></main>
}
export function ReaderHarness(){
 const [selected,setSelected]=useState<ReaderItem|null>(null),[repeat,setRepeat]=useState(1),[speed,setSpeed]=useState(1),[page,setPage]=useState(0)
 const playback=useReaderPlayback(book,setSelected,repeat,speed)
 const pages=[a,b].map((word,index)=>({page:index+1,image:'fixture.svg',items:[{...word,rects:[[.1,.1,.6,.25] as [number,number,number,number]]}]}))
 const readerBook={...book,manifest:{...book.manifest,pages}}
 return <LocalReader book={readerBook} pageIndex={page} imageSrc={'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><text x="60" y="130" font-size="45">'+(page===0?'A':'B')+'</text></svg>')} selected={selected} translation="示例中文释义" translating={false} repeat={repeat} speed={speed} playback={playback} onPage={n=>{playback.stop();setSelected(null);setPage(n)}} onRepeat={setRepeat} onSpeed={setSpeed} onBack={playback.stop} onDictation={playback.stop} onSaveTranslation={async()=>{}}/>
}
const root=createRoot(document.getElementById('root')!);root.render(new URLSearchParams(location.search).has('ui')?<ReaderHarness/>:<Harness/>);Object.assign(window,{__unmount:()=>root.unmount()})
