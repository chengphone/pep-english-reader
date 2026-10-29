import { stable } from './sharedCanonical'
import { acknowledgePublishedUnits, mergePublishedUnits } from './sharedMerge'
import { updateSharedMetadata, withSharedSyncLock, type AudioReceipt } from './sharedMetadata'
import { audioKey, listLocalWordAudios } from './wordAudio'
import { loadUnits } from './vocabularyStorage'
import { validateAudioLibrary, validateVocabularyLibrary } from './libraryValidation'

const REPO='chengphone/pep-english-reader'
class AuthorizationError extends Error {}
type Session={token:string;controller:AbortController}
let session:Session|undefined,connecting:Session|undefined
let automatic=true,timer:ReturnType<typeof setTimeout>|undefined
let running:{session:Session;promise:Promise<void>}|undefined
let queued=false
let status='尚未连接管理员；手机和电脑会自动读取网站资料。'
const listeners=new Set<()=>void>()
export const sharedState=()=>({connected:!!session,automatic,status,publishing:!!running})
export function subscribeShared(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
function notify(message:string){status=message;for(const listener of listeners)listener()}
function assertActive(owner:Session){if(session!==owner||owner.controller.signal.aborted)throw new Error('管理员会话已结束，已停止本次发布。')}
function invalidate(){clearTimeout(timer);queued=false;connecting?.controller.abort();session?.controller.abort();connecting=undefined;session=undefined}
async function api(owner:Session,path:string,body?:unknown,method=body?'POST':'GET'):Promise<any>{
 owner.controller.signal.throwIfAborted()
 const controller=new AbortController(),cancel=()=>controller.abort(),timeout=setTimeout(cancel,45000)
 owner.controller.signal.addEventListener('abort',cancel,{once:true})
 try{
  const response=await fetch(`https://api.github.com/repos/${REPO}${path?'/'+path:''}`,{method,redirect:'error',cache:'no-store',signal:controller.signal,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${owner.token}`,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  if(response.status===401)throw new AuthorizationError('GitHub 授权已失效，请重新连接。')
  if(!response.ok)throw new Error(response.status===403||response.status===429?'没有仓库写入权限或 GitHub 请求受限，请检查 Contents 权限后稍候重试。':response.status===422||response.status===409?'远端资料刚被更新，请先检查更新后重试。':`GitHub 发布失败（${response.status}）。`)
  try{return await response.json()}catch{throw new Error('GitHub 返回了无效数据，请稍后重试。')}
 }catch(error){
  if(owner.controller.signal.aborted)throw new Error('管理员会话已结束，已停止本次发布。')
  if(controller.signal.aborted)throw new Error('GitHub 请求超时，本机资料仍保留，请重试。')
  if(error instanceof TypeError)throw new Error('无法连接 GitHub，本机资料仍保留，请检查网络后重试。')
  throw error
 }finally{clearTimeout(timeout);owner.controller.signal.removeEventListener('abort',cancel)}
}
function from64(text:string){return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g,'')),char=>char.charCodeAt(0)))}
function to64(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value)}
async function sourceJson(owner:Session,path:string,head:string){
 let result=await api(owner,`contents/${path}?ref=${encodeURIComponent(head)}`)
 if(result.encoding!=='base64'&&typeof result.sha==='string'&&/^[a-f0-9]{40}$/i.test(result.sha))result=await api(owner,`git/blobs/${result.sha}`)
 if(result.encoding!=='base64'||typeof result.content!=='string'||result.content.length>40*1024*1024)throw new Error('资料清单过大或格式不正确，暂不能发布。')
 try{return JSON.parse(from64(result.content))}catch{throw new Error('网站资料清单不是有效 JSON，未发布任何修改。')}
}

export async function connectShared(token:string){
 if(!token.trim())throw new Error('请填写 GitHub 管理员令牌。')
 invalidate()
 const candidate:Session={token:token.trim(),controller:new AbortController()};connecting=candidate
 try{
  const repo=await api(candidate,'')
  if(connecting!==candidate||candidate.controller.signal.aborted)throw new Error('连接已取消。')
  if(!repo.permissions?.push)throw new Error('此令牌没有该仓库的写入权限。')
  session=candidate;connecting=undefined;notify('管理员已连接，保存或导入后将自动发布。')
 }catch(error){if(connecting===candidate){connecting=undefined;notify('连接失败，请检查令牌。')}candidate.controller.abort();throw error}
}
export function disconnectShared(){invalidate();automatic=false;notify('已断开管理员连接；共享资料仍可读取。')}
export function setAutomaticShared(value:boolean){automatic=value;if(!value){clearTimeout(timer);queued=false}notify(value?'已开启保存后自动发布。':'已暂停自动发布，可手动发布。')}
window.addEventListener('pep-materials-changed',()=>{
 if(!session||!automatic)return
 const owner=session;clearTimeout(timer)
 timer=setTimeout(()=>{if(session===owner&&automatic)void requestPublication(false).catch(()=>{})},1500)
 notify('资料已保存在本机，正在准备发布…')
})
export const publishShared=()=>requestPublication(true)
async function requestPublication(manual:boolean):Promise<void>{
 const owner=session
 if(!owner)throw new Error('请先连接 GitHub 管理员。')
 if(running){
  const previous=running.promise
  if(!manual){if(running.session===owner)queued=true;return previous}
  await previous.catch(()=>{});assertActive(owner);return requestPublication(true)
 }
 const operation=withSharedSyncLock(()=>performPublish(owner),owner.controller.signal)
 const promise=operation.catch(error=>{if(session===owner){if(error instanceof AuthorizationError){invalidate();automatic=false}notify(error instanceof Error?error.message:'发布失败，本机资料仍保留，可重试。')}throw error}).finally(()=>{
  if(running?.promise===promise)running=undefined
  for(const listener of listeners)listener()
  if(queued&&session===owner&&automatic){queued=false;void requestPublication(false).catch(()=>{})}
 })
 running={session:owner,promise};for(const listener of listeners)listener()
 return promise
}
async function performPublish(owner:Session){
 assertActive(owner);notify('正在检查远端资料和本机修改…')
 const units=await loadUnits({strict:true}),metadata=await updateSharedMetadata(value=>value)
 const ref=await api(owner,'git/ref/heads/main'),head=ref.object.sha
 const commit=await api(owner,`git/commits/${head}`)
 const remote=validateVocabularyLibrary(await sourceJson(owner,'public/data/default-vocabulary.json',head))
 const audio=validateAudioLibrary(await sourceJson(owner,'public/audio/library-manifest.json',head))
 const mergedUnits=mergePublishedUnits(metadata.baseline,units,remote.units)
 // Revisions must also increase when the publishing devices' clocks disagree.
 const latestRevision=Math.max(remote.revision??0,audio.revision??0,Date.now())
 if(latestRevision>=Number.MAX_SAFE_INTEGER)throw new Error('资料版本号已达上限，未发布修改。')
 const revision=latestRevision+1
 const treeEntries:{path:string;mode:string;type:string;sha?:string;content?:string}[]=[]
 const wordsChanged=stable(remote.units)!==stable(mergedUnits)
 if(wordsChanged)treeEntries.push({path:'public/data/default-vocabulary.json',mode:'100644',type:'blob',content:JSON.stringify({schemaVersion:1,revision,units:mergedUnits})})
 const audioItems=new Map<string,any>(audio.items.map((item:any)=>[audioKey(item.text),item]))
 const records=await listLocalWordAudios(),receipts:Record<string,AudioReceipt>=Object.create(null)
 const knownFiles=new Set(audio.items.map((item:any)=>item.file))
 for(let i=0;i<records.length;i++){
  assertActive(owner)
  const record=records[i]
  if(record.hostedFile||record.voice.startsWith('网站音频'))continue
  const bytes=new Uint8Array(await record.blob.arrayBuffer())
  if(!bytes.length||bytes.length>10*1024*1024)throw new Error('单条音频为空或超过 10 MB，未发布。')
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')
  const previous=Object.hasOwn(metadata.audioReceipts,record.key)?metadata.audioReceipts[record.key]:undefined,current=audioItems.get(record.key)
  if(previous?.digest===digest&&previous.updatedAt===record.updatedAt)continue
  const ext=record.blob.type.includes('wav')?'wav':record.blob.type.includes('ogg')?'ogg':record.blob.type.includes('mp4')?'m4a':'mp3'
  const file=`audio/library/${digest}.${ext}`
  if(current?.sha256?.toLowerCase()===digest||current?.file===file){receipts[record.key]={digest,updatedAt:record.updatedAt,file:current.file};continue}
  const expected=record.baseHostedFile!==undefined?record.baseHostedFile:previous?.file
  if(expected===undefined?!!current:(current?.file??null)!==expected)throw new Error(`“${record.text}”的远端音频与本机记录不同，请检查更新并重新导入要替换的音频。`)
  notify(`正在发布音频 ${i+1}/${records.length}…`)
  if(!knownFiles.has(file)){const blob=await api(owner,'git/blobs',{content:to64(bytes),encoding:'base64'});treeEntries.push({path:'public/'+file,mode:'100644',type:'blob',sha:blob.sha});knownFiles.add(file);await new Promise(resolve=>setTimeout(resolve,1000))}
  audioItems.set(record.key,{text:record.text,file,voice:record.voice,sha256:digest});receipts[record.key]={digest,updatedAt:record.updatedAt,file}
 }
 const mergedAudio=[...audioItems.values()]
 if(stable(audio.items)!==stable(mergedAudio))treeEntries.push({path:'public/audio/library-manifest.json',mode:'100644',type:'blob',content:JSON.stringify({schemaVersion:1,revision,voice:audio.voice,items:mergedAudio})})
 const acknowledge=async()=>{await updateSharedMetadata(value=>({...value,baseline:acknowledgePublishedUnits(metadata.baseline,units,mergedUnits),pendingRevision:wordsChanged?revision:remote.revision??0,audioReceipts:{...value.audioReceipts,...receipts}}))}
 if(!treeEntries.length){assertActive(owner);await acknowledge();notify('网站资料已是最新，无需重复发布。');return}
 assertActive(owner)
 const tree=await api(owner,'git/trees',{base_tree:commit.tree.sha,tree:treeEntries})
 assertActive(owner)
 const created=await api(owner,'git/commits',{message:'Sync shared vocabulary and practice audio',tree:tree.sha,parents:[head]})
 assertActive(owner)
 await api(owner,'git/refs/heads/main',{sha:created.sha,force:false},'PATCH')
 await acknowledge()
 if(session===owner)notify('已提交网站更新。通常 1–3 分钟后，手机和电脑检查更新即可使用。')
}
