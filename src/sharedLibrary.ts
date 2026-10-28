import { stable } from './sharedCanonical'
import { audioKey, listLocalWordAudios } from './wordAudio'
import { loadUnits, readSharedBaseline, setSharedBaseline } from './vocabularyStorage'
import type { VocabularyUnit } from './vocabularyExtraction'

const REPO='chengphone/pep-english-reader'
let credential=''
let automatic=true
let timer:ReturnType<typeof setTimeout>|undefined
let running:Promise<void>|undefined
let queued=false
let status='尚未连接管理员；手机和电脑会自动读取网站资料。'
const listeners=new Set<()=>void>()
export const sharedState=()=>({connected:!!credential,automatic,status,publishing:!!running})
export function subscribeShared(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
function notify(message:string){status=message;for(const listener of listeners)listener()}

async function api(path:string,body?:unknown,method=body?'POST':'GET'):Promise<any>{
 const response=await fetch(`https://api.github.com/repos/${REPO}${path?'/'+path:''}`,{method,redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${credential}`,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
 const data=await response.json()
 if(!response.ok)throw new Error(response.status===401?'GitHub 授权已失效，请重新连接。':response.status===403?'没有仓库写入权限或 GitHub 请求受限，请检查令牌 Contents 权限。':response.status===422||response.status===409?'远端资料刚被更新，请先检查更新后重试。':`GitHub 发布失败（${response.status}）。`)
 return data
}
function from64(text:string){return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g,'')),char=>char.charCodeAt(0)))}
function to64(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value)}
async function sourceJson(path:string,head:string){const result=await api(`contents/${path}?ref=${head}`);if(result.encoding!=='base64')throw new Error('资料清单过大，暂不能发布。');return JSON.parse(from64(result.content))}
export async function connectShared(token:string){
 credential=token.trim()
 try{const repo=await api('');if(!repo.permissions?.push)throw new Error('此令牌没有该仓库的写入权限。');notify('管理员已连接，保存或导入后将自动发布。')}
 catch(error){credential='';notify('连接失败，请检查令牌。');throw error}
}
export function disconnectShared(){credential='';automatic=false;clearTimeout(timer);notify('已断开管理员连接；共享资料仍可读取。')}
export function setAutomaticShared(value:boolean){automatic=value;notify(value?'已开启保存后自动发布。':'已暂停自动发布，可手动发布。')}
window.addEventListener('pep-materials-changed',()=>{if(!credential||!automatic)return;clearTimeout(timer);timer=setTimeout(()=>void publishShared().catch(()=>{}),1500);notify('资料已保存在本机，正在准备发布…')})
export async function publishShared(){
 if(!credential)throw new Error('请先连接 GitHub 管理员。')
 if(running){queued=true;return running}
 running=performPublish().catch(error=>{notify(error instanceof Error?error.message:'发布失败，本机资料仍保留，可重试。');throw error}).finally(()=>{running=undefined;for(const listener of listeners)listener();if(queued&&credential&&automatic){queued=false;void publishShared().catch(()=>{})}})
 for(const listener of listeners)listener()
 return running
}
async function performPublish(){
 notify('正在检查远端资料和本机修改…')
 const units=await loadUnits(),base=readSharedBaseline()
 const ref=await api('git/ref/heads/main'),head=ref.object.sha
 const commit=await api(`git/commits/${head}`)
 const remote=await sourceJson('public/data/default-vocabulary.json',head)
 const audio=await sourceJson('public/audio/library-manifest.json',head)
 const remoteUnits=new Map<string,VocabularyUnit>(remote.units.map((unit:VocabularyUnit)=>[unit.id,unit]))
 const local=new Map(units.map(unit=>[unit.id,unit]))
 for(const id of new Set([...base.map(unit=>unit.id),...local.keys()])){
  const previous=base.find(unit=>unit.id===id),next=local.get(id),current=remoteUnits.get(id)
  if(stable(previous)===stable(next))continue
  if(previous&&stable(current)!==stable(previous)&&stable(current)!==stable(next))throw new Error(`“${next?.title??previous.title}”在另一台设备也有修改，请校对后再发布。`)
  if(next)remoteUnits.set(id,next);else remoteUnits.delete(id)
 }
 const mergedUnits=[...remoteUnits.values()]
 const revision=Date.now()
 const treeEntries:{path:string;mode:string;type:string;sha?:string;content?:string}[]=[]
 if(stable(remote.units)!==stable(mergedUnits))treeEntries.push({path:'public/data/default-vocabulary.json',mode:'100644',type:'blob',content:JSON.stringify({schemaVersion:1,revision,units:mergedUnits})})
 const audioItems=new Map<string,any>(audio.items.map((item:any)=>[audioKey(item.text),item]))
 const records=await listLocalWordAudios()
 const knownFiles=new Set(audio.items.map((item:any)=>item.file))
 for(let i=0;i<records.length;i++){
  const record=records[i]
  if(record.hostedFile||record.voice.startsWith('网站音频'))continue
  const bytes=new Uint8Array(await record.blob.arrayBuffer())
  if(!bytes.length||bytes.length>10*1024*1024)throw new Error('单条音频为空或超过 10 MB，未发布。')
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')
  const ext=record.blob.type.includes('wav')?'wav':record.blob.type.includes('ogg')?'ogg':record.blob.type.includes('mp4')?'m4a':'mp3'
  const file=`audio/library/${digest}.${ext}`
  if(audioItems.get(record.key)?.file===file)continue
  notify(`正在发布音频 ${i+1}/${records.length}…`)
  if(!knownFiles.has(file)){const blob=await api('git/blobs',{content:to64(bytes),encoding:'base64'});treeEntries.push({path:'public/'+file,mode:'100644',type:'blob',sha:blob.sha});knownFiles.add(file);await new Promise(resolve=>setTimeout(resolve,1000))}
  audioItems.set(record.key,{text:record.text,file,voice:record.voice})
 }
 const mergedAudio=[...audioItems.values()]
 if(stable(audio.items)!==stable(mergedAudio))treeEntries.push({path:'public/audio/library-manifest.json',mode:'100644',type:'blob',content:JSON.stringify({schemaVersion:1,revision,voice:audio.voice,items:mergedAudio})})
 if(!treeEntries.length){localStorage.setItem('pep-shared-pending-revision',String(remote.revision??0));setSharedBaseline(mergedUnits);notify('网站资料已是最新，无需重复发布。');return}
 if(!credential)throw new Error('管理员已断开，未提交资料。')
 const tree=await api('git/trees',{base_tree:commit.tree.sha,tree:treeEntries})
 const created=await api('git/commits',{message:'Sync shared vocabulary and practice audio',tree:tree.sha,parents:[head]})
 if(!credential)throw new Error('管理员已断开，未提交资料。')
 await api('git/refs/heads/main',{sha:created.sha,force:false},'PATCH')
 localStorage.setItem('pep-shared-pending-revision',String(treeEntries.some(entry=>entry.path==='public/data/default-vocabulary.json')?revision:remote.revision??0))
 setSharedBaseline(mergedUnits)
 notify('已提交网站更新。通常 1–3 分钟后，手机和电脑检查更新即可使用。')
}
