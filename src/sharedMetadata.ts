import { normalizeUnitWordIds } from './vocabularyWords'
import { validVocabularyUnit } from './libraryValidation'
import type { VocabularyUnit } from './vocabularyExtraction'
export type AudioReceipt={digest:string;updatedAt:number;file:string}
export type SharedMetadata={baseline:VocabularyUnit[];pendingRevision:number;audioReceipts:Record<string,AudioReceipt>}
const empty=():SharedMetadata=>({baseline:[],pendingRevision:0,audioReceipts:{}})
function migrateLegacy(){
 const result=empty()
 try{const legacy=JSON.parse(localStorage.getItem('pep-shared-vocabulary-baseline-v2')??'[]');if(Array.isArray(legacy))result.baseline=legacy.map(normalizeUnitWordIds).filter(validVocabularyUnit);const pending=Number(localStorage.getItem('pep-shared-pending-revision'));if(Number.isFinite(pending)&&pending>=0)result.pendingRevision=pending}catch{/* A corrupt or unavailable legacy cache must not block the library. */}
 return result
}
function open(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('pep-shared-sync',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db)};request.onerror=()=>reject(request.error)})}
export async function updateSharedMetadata(update:(value:SharedMetadata)=>SharedMetadata):Promise<SharedMetadata>{
 const db=await open()
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),request=store.get('metadata');let result:SharedMetadata,failure:unknown
  request.onsuccess=()=>{try{const value=request.result;const valid=value&&Array.isArray(value.baseline)&&Number.isSafeInteger(value.pendingRevision)&&value.pendingRevision>=0&&value.audioReceipts&&typeof value.audioReceipts==='object';result=update(valid?{...value,baseline:value.baseline.map(normalizeUnitWordIds).filter(validVocabularyUnit)}:migrateLegacy());store.put(result,'metadata')}catch(error){failure=error;tx.abort()}}
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure??tx.error??new Error('同步状态保存失败。'));tx.onerror=()=>reject(failure??tx.error)
 })}finally{db.close()}
}
export async function readSharedMetadata():Promise<SharedMetadata>{
 const db=await open()
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('state'),request=tx.objectStore('state').get('metadata');request.onsuccess=()=>{const value=request.result;resolve(value&&Array.isArray(value.baseline)&&Number.isSafeInteger(value.pendingRevision)&&value.pendingRevision>=0&&value.audioReceipts&&typeof value.audioReceipts==='object'?{...value,baseline:value.baseline.map(normalizeUnitWordIds).filter(validVocabularyUnit)}:migrateLegacy())};request.onerror=()=>reject(request.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
}
let fallback:Promise<unknown>=Promise.resolve()
export async function withSharedSyncLock<T>(action:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
 if(navigator.locks?.request)return navigator.locks.request('pep-shared-library',{mode:'exclusive',signal},action)
 const before=fallback;let release!:()=>void;fallback=new Promise<void>(resolve=>{release=resolve})
 await before.catch(()=>{})
 try{signal?.throwIfAborted();return await action()}finally{release()}
}
