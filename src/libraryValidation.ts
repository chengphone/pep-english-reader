import type { VocabularyUnit } from './vocabularyExtraction'
import { audioKey } from './audioKey.ts'
export type AudioLibraryItem={text:string;file:string;voice?:string;sha256?:string}
export type AudioLibrary={schemaVersion:1;revision?:number;voice?:string;items:AudioLibraryItem[]}
export type VocabularyLibrary={schemaVersion:1;revision?:number;units:VocabularyUnit[]}
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=max
function revision(value:any){if(value!==undefined&&(!Number.isSafeInteger(value)||value<0))throw new Error('资料版本号无效，未修改本机资料。')}
// 点读音频区间：两个字段可选，单位秒。字段缺失或终点不大于起点时按整段音频处理，
// 这样旧教材包（没有 audioStart/audioEnd）导入后行为完全不变。
export function normalizeAudioRange(start:unknown,end:unknown):{audioStart:number;audioEnd:number}|undefined{
 if(start!==undefined&&(typeof start!=='number'||!Number.isFinite(start)||start<0))throw new Error('教材清单包含无效的音频起点。')
 if(end===undefined)return undefined
 if(typeof end!=='number'||!Number.isFinite(end)||end<0)throw new Error('教材清单包含无效的音频终点。')
 const from=start??0
 return end>from?{audioStart:from,audioEnd:end}:undefined
}
// 导入 ZIP 清单时调用：只规范 items 里的可选音频区间，不改动其他字段。
// 无效区间会退回整段播放；字段类型错误则抛出，由导入流程提示用户。
export function normalizeReaderManifest<T>(value:T):T{
 if(!object(value)||!Array.isArray(value.pages))return value
 for(const page of value.pages){
  if(!object(page)||!Array.isArray(page.items))continue
  for(const item of page.items){
   if(!object(item))continue
   const range=normalizeAudioRange(item.audioStart,item.audioEnd)
   if(range){item.audioStart=range.audioStart;item.audioEnd=range.audioEnd}
   else{delete item.audioStart;delete item.audioEnd}
  }
 }
 return value
}
export function validVocabularyUnit(value:unknown):value is VocabularyUnit{
 if(!object(value)||!text(value.id,1000)||!text(value.book,200)||!text(value.title,200)||!Array.isArray(value.words)||value.words.length>10000)return false
 if(value.category!==undefined&&!['units','vocabulary','expressions'].includes(value.category))return false
 if(value.source!==undefined&&typeof value.source!=='string')return false
 const ids=new Set<string>()
 for(const word of value.words){if(!object(word)||!text(word.id,2000)||!text(word.english,1000)||typeof word.meaning!=='string'||word.meaning.length>4000||ids.has(word.id))return false;if(word.audio!==undefined&&(!object(word.audio)||!text(word.audio.text,1000)||!text(word.audio.bookId,200)||typeof word.audio.file!=='string'||!/^audio\/library\/[a-f0-9]{64}\.(mp3|wav|m4a|ogg)$/i.test(word.audio.file)))return false;ids.add(word.id)}
 return true
}
export function validateVocabularyLibrary(value:unknown):VocabularyLibrary{
 if(!object(value)||value.schemaVersion!==1||!Array.isArray(value.units)||value.units.length>5000)throw new Error('词表清单格式不正确，未修改本机资料。')
 revision(value.revision)
 const ids=new Set<string>();let words=0
 for(const unit of value.units){if(!validVocabularyUnit(unit)||ids.has(unit.id))throw new Error('词表包含无效词句或重复单元，未修改本机资料。');ids.add(unit.id);words+=unit.words.length}
 if(words>100000)throw new Error('词表内容超过容量限制，未修改本机资料。')
 return value as VocabularyLibrary
}
export function validateAudioLibrary(value:unknown):AudioLibrary{
 if(!object(value)||value.schemaVersion!==1||!Array.isArray(value.items)||value.items.length>20000)throw new Error('音频清单格式不正确。')
 revision(value.revision)
 if(value.voice!==undefined&&!text(value.voice,200))throw new Error('音频音色字段无效。')
 const keys=new Set<string>()
 for(const item of value.items){
  if(!object(item)||!text(item.text,1000)||typeof item.file!=='string'||!/^audio\/library\/[a-f0-9]{64}\.(mp3|wav|m4a|ogg)$/i.test(item.file)||item.voice!==undefined&&!text(item.voice,200)||item.sha256!==undefined&&(typeof item.sha256!=='string'||!/^([a-f0-9]{64})$/i.test(item.sha256)))throw new Error('音频清单包含无效文件路径或词句。')
  const key=audioKey(item.text);if(keys.has(key))throw new Error('音频清单包含同词的重复映射。');keys.add(key)
 }
 return value as AudioLibrary
}
