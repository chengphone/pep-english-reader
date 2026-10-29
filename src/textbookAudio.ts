import {zipSync,strToU8} from 'fflate'
import {audioKey} from './audioKey'
import {readWordAudios,downloadFile,type WordAudio} from './wordAudio'
import type {VocabularyWord} from './vocabularyExtraction'
type AudioWord=Pick<VocabularyWord,'english'|'audio'>
type CachedAudio={file:string;bytes:ArrayBuffer;mime:string}
const pending=new Map<string,Promise<Blob|undefined>>()
function openDb(){
 return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('pep-textbook-audio',1);let expired=false
  const timer=setTimeout(()=>{expired=true;reject(new Error('教材音频存储读取超时'))},5000)
  request.onupgradeneeded=()=>request.result.createObjectStore('audio',{keyPath:'file'})
  request.onsuccess=()=>{clearTimeout(timer);if(expired)request.result.close();else resolve(request.result)}
  request.onerror=()=>{clearTimeout(timer);reject(request.error)}
 })
}
async function cached(file:string){
 const db=await openDb()
 try{return await new Promise<CachedAudio|undefined>((resolve,reject)=>{const tx=db.transaction('audio'),request=tx.objectStore('audio').get(file);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
}
async function store(file:string,blob:Blob){
 const value={file,bytes:await blob.arrayBuffer(),mime:blob.type},db=await openDb()
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put(value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('原音保存失败'));tx.onabort=()=>reject(tx.error??new Error('原音保存已中止'))})}finally{db.close()}
}
async function validBytes(bytes:ArrayBuffer,digest:string){
 const result=await crypto.subtle.digest('SHA-256',bytes)
 return [...new Uint8Array(result)].map(n=>n.toString(16).padStart(2,'0')).join('')===digest
}
async function load(file:string):Promise<Blob|undefined>{
 const match=file.match(/^audio\/library\/([a-f0-9]{64})\.(mp3|wav|m4a|ogg)$/i)
 if(!match)return
 try{
  const value=await cached(file)
  if(value?.bytes instanceof ArrayBuffer&&await validBytes(value.bytes,match[1]))return new Blob([value.bytes],{type:value.mime})
 }catch{/* Original audio remains playable online when local storage is blocked. */}
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000)
 try{
  const response=await fetch(import.meta.env.BASE_URL+file,{signal:controller.signal})
  if(!response.ok)return
  const reader=response.body?.getReader();if(!reader)return
  const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>10*1024*1024){await reader.cancel();return}chunks.push(new Uint8Array(value))}}finally{reader.releaseLock()}
  const mime=({mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',ogg:'audio/ogg'} as Record<string,string>)[match[2].toLowerCase()]
  const blob=new Blob(chunks,{type:mime})
  if(!blob.size||!await validBytes(await blob.arrayBuffer(),match[1]))return
  try{await store(file,blob)}catch{/* A full or unavailable cache must not prevent online playback. */}
  return blob
 }catch{return undefined}finally{clearTimeout(timeout)}
}
async function original(word:AudioWord):Promise<WordAudio|undefined>{
 if(!word.audio||audioKey(word.audio.text)!==audioKey(word.english))return
 const file=word.audio.file
 let task=pending.get(file)
 if(!task){task=load(file).finally(()=>pending.delete(file));pending.set(file,task)}
 const blob=await task
 return blob?{key:audioKey(word.english),text:word.english,blob,voice:'网站音频 · 教材原音',hostedFile:file,updatedAt:Date.now()}:undefined
}
export async function readMaterialAudios(words:AudioWord[]):Promise<Map<string,WordAudio>>{
 const unique=[...new Map(words.map(word=>[audioKey(word.english),word])).values()]
 const plain=unique.filter(word=>!word.audio),bound=unique.filter(word=>word.audio)
 const result=plain.length?await readWordAudios(plain.map(word=>word.english)):new Map<string,WordAudio>()
 let next=0
 await Promise.all(Array.from({length:Math.min(4,bound.length)},async()=>{while(next<bound.length){const word=bound[next++],record=await original(word);if(record)result.set(record.key,record)}}))
 return result
}
export async function exportMaterialAudio(words:AudioWord[]){
 const records=[...(await readMaterialAudios(words)).values()]
 if(!records.length)throw new Error('当前范围没有可备份的音频。')
 const entries:Record<string,Uint8Array>={},items:{text:string;file:string}[]=[]
 for(const [index,record] of records.entries()){
  const ext=record.blob.type==='audio/wav'?'wav':record.blob.type==='audio/ogg'?'ogg':record.blob.type==='audio/mp4'?'m4a':'mp3',file=`audio/${index}.${ext}`
  entries[file]=new Uint8Array(await record.blob.arrayBuffer());items.push({text:record.text,file})
 }
 entries['manifest.json']=strToU8(JSON.stringify({schemaVersion:1,voice:'教材原音备份',items}))
 downloadFile('textbook-audio-backup.zip',zipSync(entries))
}
