import type { VocabularyUnit } from './vocabularyExtraction'
function openDb() {
 return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('pep-reader-v1',2)
  request.onupgradeneeded=()=>{for(const name of ['books','units'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'})}
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
 })
}
export async function loadUnits():Promise<VocabularyUnit[]> {
 const db=await openDb()
 try{return await new Promise((resolve,reject)=>{const request=db.transaction('units').objectStore('units').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}finally{db.close()}
}
async function write(operation:(store:IDBObjectStore)=>void) {
 const db=await openDb()
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('units','readwrite');operation(tx.objectStore('units'));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
}
export const saveUnit=(unit:VocabularyUnit)=>write(store=>store.put(unit))
export const deleteUnit=(id:string)=>write(store=>store.delete(id))

// Names are display metadata. Keep stable unit/book/word IDs so audio and progress survive.
export async function renameMaterialBook(oldName:string,newName:string,bookId?:string){
 const name=newName.trim();if(!name)throw new Error('名称不能为空。')
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
}
export async function renameMaterialUnit(id:string,newName:string){
 const name=newName.trim();if(!name)throw new Error('名称不能为空。')
 const db=await openDb()
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('units','readwrite'),store=tx.objectStore('units');let failure:Error|undefined
  const request=store.getAll();request.onsuccess=()=>{const units=request.result as VocabularyUnit[],unit=units.find(item=>item.id===id);if(!unit){failure=new Error('单元已不存在，请刷新后重试。');tx.abort();return}if(units.some(item=>item.id!==id&&item.book===unit.book&&(item.category??'units')===(unit.category??'units')&&item.title===name)){failure=new Error('当前分类已有同名单元，请使用不同名称。');tx.abort();return}store.put({...unit,title:name})}
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(failure??tx.error);tx.onabort=()=>reject(failure??tx.error)
 })}finally{db.close()}
}
