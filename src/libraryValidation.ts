import type { VocabularyUnit } from './vocabularyExtraction'
import type { ReaderResource } from './reader/types'
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
// 热区坐标决定阅读页能把英文画到哪里；只有四个有限数字组成的矩形可用。
// 在线教材清单早已这样过滤，本地 ZIP 导入也走同一套规则。
const isRect=(value:unknown):value is [number,number,number,number]=>Array.isArray(value)&&value.length===4&&value.every(number=>typeof number==='number'&&Number.isFinite(number))&&value[0]>=0&&value[1]>=0&&value[2]<=1&&value[3]<=1&&value[2]>value[0]&&value[3]>value[1]
// 页面资源会进入 usePageAudio 的数组方法、播放器和资源面板；字符串或 [null]
// 会让 filter/kinds 读取直接抛错。与在线教材一样只保留有 id、kind 和 src 的对象。
const isResource=(value:unknown):value is ReaderResource=>object(value)&&typeof value.id==='string'&&!!value.id.trim()&&(value.kind==='audio'||value.kind==='video')&&typeof value.src==='string'&&!!value.src.trim()
// 导入 ZIP 清单时调用：规范 items 的热区坐标、可选文本字段和音频区间，不改动其他字段。
// 损坏的条目或坐标会让阅读页在渲染时崩溃，这里按“没有热区”处理；
// 无效区间会退回整段播放；区间字段类型错误则抛出，由导入流程提示用户。
export function normalizeReaderManifest<T>(value:T):T{
 if(!object(value)||!Array.isArray(value.pages))return value
 // 标题会进入 document.title、阅读器顶栏和书架；数字、对象或数组会在 .trim()
 // 或 JSX 渲染时抛错。删除坏标题，由导入流程回退到文件名。
 if(typeof value.title!=='string')delete value.title
 // item.id 同时作为 React key、热区编辑选择键和学习记录身份；同一本教材重复时，
 // 修改或删除一个热区会误伤所有同 id 条目。保留首个 id，给后续重复项补唯一后缀。
 const reservedItemIds=new Set<string>()
 for(const page of value.pages){
  if(!object(page)||!Array.isArray(page.items))continue
  for(const item of page.items)if(object(item)&&typeof item.id==='string'&&item.id.trim()&&typeof item.text==='string')reservedItemIds.add(item.id.trim())
 }
 const seenItemIds=new Set<string>()
 for(const page of value.pages){
  if(!object(page))continue
  // 书上页码会直接显示在阅读器顶栏和“第 N 页”提示里；对象或数组会让 JSX
  // 渲染抛错。非有限数字一律按未填写处理，退回物理页码。
  if(page.printedPage!==undefined&&!(typeof page.printedPage==='number'&&Number.isFinite(page.printedPage)))delete page.printedPage
  // resources 可以缺省，但坏值会让 usePageAudio 与 LocalReader 在渲染时抛错；
  // 逐条净化可选字段，标题再坏也不会进入 JSX。
  if(page.resources!==undefined){
   page.resources=Array.isArray(page.resources)?page.resources.filter(isResource):[]
   for(const resource of page.resources){
    if(typeof resource.title!=='string'||!resource.title.trim())resource.title=resource.kind==='audio'?'本页音频':'课堂动漫'
    if(resource.subtitle!==undefined&&typeof resource.subtitle!=='string')delete resource.subtitle
    if(resource.poster!==undefined&&typeof resource.poster!=='string')delete resource.poster
    if(resource.track!==undefined&&(typeof resource.track!=='number'||!Number.isFinite(resource.track)))delete resource.track
    if(resource.duration!==undefined&&(typeof resource.duration!=='number'||!Number.isFinite(resource.duration)||resource.duration<0))delete resource.duration
    if(resource.startAt!==undefined&&(typeof resource.startAt!=='number'||!Number.isFinite(resource.startAt)||resource.startAt<0))delete resource.startAt
    if(resource.continuous!==undefined&&typeof resource.continuous!=='boolean')delete resource.continuous
   }
  }
  if(!Array.isArray(page.items))continue
  // null、字符串或数组条目没有可用的 id / rects，保留下来只会在渲染时抛错。
  // id 是 React key 和学习记录键，text 会成为 React 子节点和朗读文本；坏值都丢弃。
  page.items=page.items.filter((item:unknown)=>object(item)&&typeof item.id==='string'&&!!item.id.trim()&&typeof item.text==='string')
  for(const item of page.items){
   const baseId=item.id.trim()
   if(seenItemIds.has(baseId)){
    let suffix=2,candidate=`${baseId}~${suffix}`
    while(seenItemIds.has(candidate)||reservedItemIds.has(candidate))candidate=`${baseId}~${++suffix}`
    item.id=candidate
   }else item.id=baseId
   seenItemIds.add(item.id)
   item.rects=Array.isArray(item.rects)?item.rects.filter(isRect):[]
   // 释义和点读音源会直接进入 React 子节点与 Audio 构造器；对象、数组或数字
   // 会让单词列表和复习卡在渲染时抛错。非字符串一律按未填写处理。
   if(item.translation!==undefined&&typeof item.translation!=='string')delete item.translation
   if(item.audio!==undefined&&typeof item.audio!=='string')delete item.audio
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
