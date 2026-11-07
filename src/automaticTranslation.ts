import { localTranslation } from './translation'
export type TranslationResult={text?:string;source?:'textbook'|'local'|'model';message?:string}
export function translationKey(text:string){return text.normalize('NFKC').toLowerCase().replace(/[’‘‛']/g,'').replace(/[.,!?，。！？:;；：]/g,'').replace(/\s+/g,' ').trim()}
const glossaryCache=new Map<string,Promise<Record<string,string>>>()
const modelCache=new Map<string,string>()
let translatorPromise:Promise<any>|undefined
async function loadGlossary(book:string){
 if(!glossaryCache.has(book))glossaryCache.set(book,new Promise((resolve)=>{
  let settled=false
  const timer=setTimeout(()=>finish({}),5000)
  function finish(glossary:Record<string,string>){if(settled)return;settled=true;clearTimeout(timer);resolve(glossary)}
  try{
   const request=indexedDB.open('pep-reader-v1',2)
   // The DB may not exist yet (no local book or hosted vocabulary imported). Create
   // the same stores the rest of the app expects, otherwise the transaction below
   // throws and this promise would never settle.
   request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('books'))db.createObjectStore('books',{keyPath:'id'});if(!db.objectStoreNames.contains('units'))db.createObjectStore('units',{keyPath:'id'})}
   request.onerror=()=>finish({})
   request.onsuccess=()=>{
    const db=request.result
    try{
     const r=db.transaction('units').objectStore('units').getAll()
     r.onsuccess=()=>{const glossary:Record<string,string>={};for(const unit of r.result){if(unit.book!==book)continue;for(const word of unit.words??[])if(word.english&&word.meaning)glossary[translationKey(word.english)]=word.meaning}db.close();finish(glossary)}
     r.onerror=()=>{db.close();finish({})}
    }catch{db.close();finish({})}
   }
  }catch{finish({})}
 }))
 return glossaryCache.get(book)!
}
export function invalidateTranslationGlossary(book:string){glossaryCache.delete(book)}
export async function automaticallyTranslate(text:string,book:string):Promise<TranslationResult>{
 const key=translationKey(text);if(!key)return{};
 const glossary=await loadGlossary(book);if(glossary[key])return{text:glossary[key],source:'textbook'};
 const local=localTranslation(text);if(local)return{text:local,source:'local'};
 if(modelCache.has(key))return{text:modelCache.get(key),source:'model'};
 // Chrome's on-device Translator downloads a model when needed. Text stays on device.
 const api=(globalThis as any).Translator;if(!api)return{message:'未匹配到教材释义，可补充中文翻译'};
 try{const options={sourceLanguage:'en',targetLanguage:'zh'};if(await api.availability(options)==='unavailable')return{message:'当前设备无可用翻译模型，可补充中文翻译'};translatorPromise??=api.create(options);const translator=await translatorPromise;const result=(await translator.translate(text)).trim();if(result){modelCache.set(key,result);return{text:result,source:'model'}}}catch{translatorPromise=undefined;return{message:'自动翻译暂不可用，可补充中文翻译'}}
 return{message:'未获得翻译，可补充中文翻译'}
}
