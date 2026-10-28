import { localTranslation } from './translation'
export type TranslationResult={text?:string;source?:'textbook'|'local'|'model';message?:string}
export function translationKey(text:string){return text.normalize('NFKC').toLowerCase().replace(/[’‘‛']/g,'').replace(/[.,!?，。！？:;；：]/g,'').replace(/\s+/g,' ').trim()}
const glossaryCache=new Map<string,Promise<Record<string,string>>>()
const modelCache=new Map<string,string>()
let translatorPromise:Promise<any>|undefined
async function loadGlossary(book:string){if(!glossaryCache.has(book))glossaryCache.set(book,new Promise((resolve)=>{const request=indexedDB.open('pep-reader-v1',2);request.onerror=()=>resolve({});request.onsuccess=()=>{const db=request.result;const r=db.transaction('units').objectStore('units').getAll();r.onsuccess=()=>{const glossary:Record<string,string>={};for(const unit of r.result){if(unit.book!==book)continue;for(const word of unit.words??[])if(word.english&&word.meaning)glossary[translationKey(word.english)]=word.meaning}db.close();resolve(glossary)};r.onerror=()=>{db.close();resolve({})}}}));return glossaryCache.get(book)!}
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
