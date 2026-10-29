import { normalizeUnitWordIds } from './vocabularyWords'
import { validateVocabularyLibrary, validVocabularyUnit } from './libraryValidation'
import { readSharedMetadata, updateSharedMetadata, withSharedSyncLock } from './sharedMetadata'
import { stable } from './sharedCanonical'
import type { VocabularyUnit } from './vocabularyExtraction'
function openDb() {
 return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('pep-reader-v1',2)
  request.onupgradeneeded=()=>{for(const name of ['books','units'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'})}
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
 })
}
export async function loadUnits(options:{strict?:boolean}={}):Promise<VocabularyUnit[]> {
 const db=await openDb()
 try{
  const rows=await new Promise<unknown[]>((resolve,reject)=>{const tx=db.transaction('units'),request=tx.objectStore('units').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.onabort=()=>reject(tx.error)})
  const normalized=rows.map(row=>normalizeUnitWordIds(row as VocabularyUnit))
  if(options.strict&&normalized.some(unit=>!validVocabularyUnit(unit)))throw new Error('本机存在无法读取的词表，请先校对或恢复资料，再发布。')
  return normalized.filter(validVocabularyUnit)
 }finally{db.close()}
}

async function write(operation:(store:IDBObjectStore)=>void) {
 const db=await openDb()
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('units','readwrite');operation(tx.objectStore('units'));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
 window.dispatchEvent(new Event('pep-materials-changed'))
}
export async function saveUnit(unit:VocabularyUnit){const normalized=normalizeUnitWordIds(unit);if(!validVocabularyUnit(normalized))throw new Error('词表名称、词句或编号无效，未保存。');await write(store=>store.put(normalized))}
export const deleteUnit=(id:string)=>write(store=>store.delete(id))

export async function readSharedBaseline(){return (await readSharedMetadata()).baseline}
export async function setSharedBaseline(units:VocabularyUnit[]){await updateSharedMetadata(value=>({...value,baseline:units}))}
let syncing:Promise<VocabularyUnit[]>|undefined
export function seedHostedVocabulary(){
 syncing??=withSharedSyncLock(refreshSharedVocabulary).finally(()=>{syncing=undefined})
 return syncing
}
async function refreshSharedVocabulary(){
 try{
  const response=await fetch(import.meta.env.BASE_URL+'data/default-vocabulary.json?version='+Date.now(),{cache:'no-store'})
  if(!response.ok)throw new Error('Hosted practice vocabulary unavailable')
  const data=validateVocabularyLibrary(await response.json())
  const metadata=await readSharedMetadata()
  const pending=metadata.pendingRevision
  if(Number(data.revision??0)<pending)return loadUnits()
  const baseline=new Map(metadata.baseline.map(unit=>[unit.id,unit]))
  const remote=new Map(data.units.map(unit=>[unit.id,unit]))
  const db=await openDb()
  try{await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('units','readwrite'),store=tx.objectStore('units'),request=store.getAll()
   request.onsuccess=()=>{
    const current=new Map<string,VocabularyUnit>((request.result as VocabularyUnit[]).map(normalizeUnitWordIds).map(unit=>[unit.id,unit]))
    for(const id of new Set([...baseline.keys(),...remote.keys()])){
     const before=baseline.get(id),next=remote.get(id)
     let local=current.get(id)
     if(!before&&!local&&next){
      const alias=[...current.values()].find(unit=>unit.book===next.book&&(unit.category??'units')===(next.category??'units')&&unit.title===next.title)
      if(alias){current.delete(alias.id);local={...alias,id};current.set(id,local)}
     }
     if(before&&stable(local)!==stable(before))continue
     if(!before&&local&&next&&stable(local)!==stable(next)){baseline.set(id,next);continue}
     if(next){current.set(id,next);baseline.set(id,next)}else{current.delete(id);baseline.delete(id)}
    }
    store.clear();for(const unit of current.values())store.put(unit)
   }
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error)
  })}finally{db.close()}
  await updateSharedMetadata(value=>({...value,baseline:[...baseline.values()],pendingRevision:0}))
 }catch(error){console.warn('Shared vocabulary unavailable; using local materials',error)}
 return loadUnits()
}

// Names are display metadata. Keep stable unit/book/word IDs so audio and progress survive.
export async function renameMaterialBook(oldName:string,newName:string,bookId?:string){
 const name=newName.trim();if(!name||name.length>200)throw new Error('名称不能为空，且不能超过 200 个字符。')
 const db=await openDb()
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['books','units'],'readwrite'),bookStore=tx.objectStore('books'),unitStore=tx.objectStore('units')
  let failure:Error|undefined
  const booksRequest=bookStore.getAll(),unitsRequest=unitStore.getAll()
  unitsRequest.onsuccess=()=>{
   const books=booksRequest.result,units=unitsRequest.result as VocabularyUnit[]
   const matches=books.filter(book=>book.manifest.title===oldName)
   if(bookId&&!matches.some(book=>book.id===bookId)){failure=new Error('教材名称已变化，请刷新后重试。');tx.abort();return}
   if(name!==oldName&&(books.some(book=>book.manifest.title===name)||units.some(unit=>unit.book===name))){failure=new Error('已有同名教材，请使用不同名称。');tx.abort();return}
   if(matches.length>1){failure=new Error('存在多本同名教材，无法确定对应词表。请先移除重复教材后重试。');tx.abort();return}
   for(const book of matches)bookStore.put({...book,manifest:{...book.manifest,title:name}})
   for(const unit of units)if(unit.book===oldName)unitStore.put({...unit,book:name})
  }
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(failure??tx.error);tx.onabort=()=>reject(failure??tx.error??new Error('名称保存失败。'))
 })}finally{db.close()}
 window.dispatchEvent(new Event('pep-materials-changed'))
}
export async function renameMaterialUnit(id:string,newName:string){
 const name=newName.trim();if(!name||name.length>200)throw new Error('名称不能为空，且不能超过 200 个字符。')
 const db=await openDb()
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('units','readwrite'),store=tx.objectStore('units');let failure:Error|undefined
  const request=store.getAll();request.onsuccess=()=>{const units=request.result as VocabularyUnit[],unit=units.find(item=>item.id===id);if(!unit){failure=new Error('单元已不存在，请刷新后重试。');tx.abort();return}if(units.some(item=>item.id!==id&&item.book===unit.book&&(item.category??'units')===(unit.category??'units')&&item.title===name)){failure=new Error('当前分类已有同名单元，请使用不同名称。');tx.abort();return}store.put({...unit,title:name})}
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(failure??tx.error);tx.onabort=()=>reject(failure??tx.error)
 })}finally{db.close()}
 window.dispatchEvent(new Event('pep-materials-changed'))
}
