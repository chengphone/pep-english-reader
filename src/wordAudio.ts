import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import generator from '../tools/build_word_audio.py?raw'

export type WordAudio = { key: string; text: string; blob: Blob; voice: string; updatedAt: number; hostedFile?: string; baseHostedFile?: string | null }
export { audioKey } from './audioKey'
import { audioKey } from './audioKey'
const MAX_FILE = 10 * 1024 * 1024
type HostedAudioManifest = { schemaVersion: number; voice?: string; items: { text: string; file: string; voice?: string }[] }
let hostedManifestAt=0
let hostedManifestPromise: Promise<Map<string, { file: string; voice: string }>> | undefined
const hostedAudioPromises = new Map<string, Promise<WordAudio | undefined>>()
type StoredWordAudio=Omit<WordAudio,'blob'> & {bytes?:ArrayBuffer;mime?:string;blob?:Blob}
function restoreAudio(value:StoredWordAudio|undefined):WordAudio|undefined{
 if(!value||typeof value.key!=='string'||typeof value.text!=='string'||value.key!==audioKey(value.text)||typeof value.voice!=='string'||!Number.isFinite(value.updatedAt))return
 const blob=value.blob instanceof Blob?value.blob:value.bytes instanceof ArrayBuffer?new Blob([value.bytes],{type:value.mime??'audio/mpeg'}):undefined
 if(!blob?.size)return
 const {bytes:_bytes,mime:_mime,blob:_blob,...metadata}=value
 return {...metadata,blob}
}
function openAudioDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pep-word-audio', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('audio', { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function readWordAudios(texts: string[]): Promise<Map<string, WordAudio>> {
  let result=new Map<string,WordAudio>()
  try{
    const db=await openAudioDb()
    try{
      result=await new Promise<Map<string,WordAudio>>((resolve,reject)=>{
        const tx=db.transaction('audio'),found=new Map<string,WordAudio>()
        for(const key of new Set(texts.map(audioKey))){
          const request=tx.objectStore('audio').get(key)
          request.onsuccess=()=>{const record=restoreAudio(request.result);if(record)found.set(key,record)}
        }
        tx.oncomplete=()=>resolve(found)
        tx.onerror=()=>reject(tx.error??new Error('本地音频读取失败。'))
        tx.onabort=()=>reject(tx.error??new Error('本地音频读取中止。'))
      })
    }finally{db.close()}
  }catch{
    // Storage may be blocked or full; hosted audio must remain playable online.
  }
    try {
      const hosted = await loadHostedManifest()
      const missing=[...new Set(texts.map(audioKey))].filter(key=>{const record=result.get(key),remote=hosted.get(key);return !record||!!remote&&(!!record.hostedFile||record.voice.startsWith('网站音频'))&&record.hostedFile!==remote.file})
      const records = await Promise.all(missing.map(async key => {
        const item = hosted.get(key)
        if (!item) return undefined
        let request = hostedAudioPromises.get(key+item.file)
        if (!request) {
          request = fetch(import.meta.env.BASE_URL + item.file).then(async response => {
            if (!response.ok) return undefined
            const blob = await response.blob()
            if (!blob.size || blob.size > MAX_FILE) return undefined
            return { key, text: texts.find(text => audioKey(text) === key) ?? key, blob, voice: item.voice, hostedFile: item.file, updatedAt: Date.now() }
          }).catch(() => undefined).finally(()=>hostedAudioPromises.delete(key+item.file))
          hostedAudioPromises.set(key+item.file, request)
        }
        return request
      }))
      const available = records.filter((record): record is WordAudio => !!record)
      if (available.length) {
        for (const record of available) result.set(record.key, record)
        try{await saveAudios(available)}catch{ /* Online playback still works when local storage is full. */ }
      }
    } catch {
      // The reader can still use an explicitly imported audio or browser fallback.
    }
    return result
}
export function invalidateHostedAudioManifest(){
 hostedManifestPromise=undefined
 hostedManifestAt=Date.now()
}
async function loadHostedManifest() {
  if(Date.now()-hostedManifestAt>60000){hostedManifestPromise=undefined;hostedManifestAt=Date.now()}
  hostedManifestPromise ??= fetch(import.meta.env.BASE_URL + 'audio/library-manifest.json?version='+Math.floor(Date.now()/60000),{cache:'no-store'})
    .then(async response => {
      if (!response.ok) throw new Error('Hosted audio list unavailable')
      const manifest = await response.json() as HostedAudioManifest
      if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.items)) throw new Error('Invalid hosted audio list')
      return new Map(manifest.items.flatMap(item => {
        if (typeof item.text !== 'string' || !/^audio\/library\/[a-f0-9]{64}\.(mp3|wav|m4a|ogg)$/i.test(item.file)) return []
        return [[audioKey(item.text), { file: item.file, voice: `网站音频 · ${item.voice ?? manifest.voice ?? 'Aria'}` }] as const]
      }))
    }).catch(error => { hostedManifestPromise = undefined; throw error })
  return hostedManifestPromise
}
async function saveAudios(records: WordAudio[]) {
  // Safari/WebKit can reject Blob values in IndexedDB, including in private contexts.
  // Convert outside the transaction: awaiting Blob.arrayBuffer() inside it closes Safari transactions.
  const stored=await Promise.all(records.map(async({blob,...metadata})=>({...metadata,bytes:await blob.arrayBuffer(),mime:blob.type})))
  const db=await openAudioDb()
  try{await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('audio','readwrite');let failure:unknown
   for(const record of stored){const request=tx.objectStore('audio').put(record);request.onerror=()=>{failure=request.error}}
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(failure??tx.error??new Error('音频保存失败，请检查本机储存空间。'));tx.onabort=()=>reject(failure??tx.error??new Error('音频保存已中止。'))
  })}finally{db.close()}
}

function audioMime(bytes: Uint8Array) {
  const tag = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (tag(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224)) return 'audio/mpeg'
  if (tag(0, 4) === 'RIFF' && tag(8, 12) === 'WAVE') return 'audio/wav'
  if (tag(0, 4) === 'OggS') return 'audio/ogg'
  if (tag(4, 8) === 'ftyp') return 'audio/mp4'
  throw new Error('文件不是支持的音频，请导入有效 MP3 / WAV / M4A / OGG。')
}
async function verifyAudio(blob: Blob) {
  const url = URL.createObjectURL(blob), audio = new Audio()
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('音频读取超时')), 8000)
      function finish(error?: Error) { clearTimeout(timeout); audio.onloadedmetadata = null; audio.onerror = null; if(error)reject(error);else resolve() }
      audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? undefined : new Error('音频没有有效时长'))
      audio.onerror = () => finish(new Error('浏览器无法播放该音频，请转换为 MP3。'))
      audio.src = url
      audio.load()
    })
  } finally { audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url) }
}
export async function importWordAudio(files: File[], texts: string[]) {
  const expected = new Map(texts.filter(t => t.trim()).map(text => [audioKey(text), text]))
  const candidates = new Map<string, { text: string; bytes: Uint8Array; voice: string }>()
  let skipped = 0
  const add = (text: string, bytes: Uint8Array, voice = '导入音频') => {
    const key = audioKey(text)
    if (!expected.has(key)) { skipped++; return }
    if (!bytes.length || bytes.length > MAX_FILE) throw new Error('单条音频为空或超过 10 MB。')
    if (candidates.has(key)) throw new Error(`同一个词有多份音频：${text}。请每次只导入一种音色。`)
    candidates.set(key, { text: expected.get(key)!, bytes, voice })
  }
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      if (file.size > 50 * 1024 * 1024) throw new Error('音频 ZIP 不得超过 50 MB，请分批导入。')
      let total = 0
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => {
        total += entry.originalSize
        if (entry.originalSize > MAX_FILE || total > 200 * 1024 * 1024) throw new Error('音频包解压大小超过限制。')
        return /\.(json|mp3|wav|m4a|ogg)$/i.test(entry.name)
      } })
      if (!entries['manifest.json']) throw new Error(entries['request.json'] ? '这是音频制作包，还没有 MP3。请先解压，在电脑运行 build_word_audio.py，再导入生成的 word-audio.zip。' : 'ZIP 缺少 manifest.json，请导入生成后的 word-audio.zip，或直接导入按英文命名的 MP3。')
      const manifest = JSON.parse(strFromU8(entries['manifest.json']))
      if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.items) || manifest.items.length > 5000) throw new Error('音频包清单格式不正确。')
      for (const item of manifest.items) {
        if (typeof item.text !== 'string' || typeof item.file !== 'string' || !entries[item.file]) throw new Error('音频包存在缺失文件或无效词条。')
        add(item.text, entries[item.file], typeof manifest.voice === 'string' ? manifest.voice : '导入音频')
      }
    } else {
      if (file.size > MAX_FILE) throw new Error('单条音频不得超过 10 MB。')
      let name = file.name.replace(/\.(mp3|wav|m4a|ogg)$/i, '')
      if (!expected.has(audioKey(name))) name = name.replace(/-(?:us|uk)-(?:male|female)$/i, '').replace(/-/g, ' ')
      add(name, new Uint8Array(await file.arrayBuffer()))
    }
  }
  if (!candidates.size) throw new Error('没有匹配到当前范围内的词条。散装音频请命名为 apple.mp3，或使用生成的 ZIP。')
  const records: WordAudio[] = []
  const observed=await loadHostedManifest().catch(()=>undefined)
  // Validate every file before the transaction so a bad import never partially replaces good audio.
  for (const [key, item] of candidates) {
    const blob = new Blob([new Uint8Array(item.bytes)], { type: audioMime(item.bytes) })
    await verifyAudio(blob)
    records.push({ key, text: item.text, blob, voice: item.voice, updatedAt: Date.now(),...(observed?{baseHostedFile:observed.get(key)?.file??null}:{}) })
  }
  await saveAudios(records)
  window.dispatchEvent(new Event('pep-materials-changed'))
  return { imported: records.length, skipped }
}
export function downloadFile(name: string, data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)])), anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function exportAudioRequest(texts: string[], voice: string) {
  const unique = new Map<string, string>()
  for (const text of texts) if (audioKey(text) && !unique.has(audioKey(text))) unique.set(audioKey(text), text.normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim())
  const items = [...unique.values()].map(text => ({ text }))
  if (!items.length) throw new Error('请先添加词条。')
  downloadFile('单词音频制作.zip', zipSync({
    'request.json': strToU8(JSON.stringify({ schemaVersion: 1, voice, items }, null, 2)),
    'build_word_audio.py': strToU8(generator),
    '使用说明.txt': strToU8('解压后在本目录打开终端。首次安装：\npython3 -m venv .venv\nmacOS: .venv/bin/python -m pip install edge-tts\nmacOS: .venv/bin/python build_word_audio.py request.json\nWindows: .venv\\Scripts\\python -m pip install edge-tts\nWindows: .venv\\Scripts\\python build_word_audio.py request.json\n\n联网生成后，将 word-audio.zip 导入应用。无需 API 密钥或自建服务器。仅英文词条发送到微软在线语音服务；中文释义和教材不上传。失败可重跑，会复用已完成音频。试听确认后用于听写。')
  }))
}
export async function exportWordAudio(texts: string[]) {
  const records = [...(await readWordAudios(texts)).values()]
  if (!records.length) throw new Error('当前范围没有可备份的音频。')
  const entries: Record<string, Uint8Array> = {}, items: { text: string; file: string; voice?: string }[] = []
  for (const [index, record] of records.entries()) {
    const file = `audio/${index}.${record.blob.type === 'audio/wav' ? 'wav' : record.blob.type === 'audio/ogg' ? 'ogg' : record.blob.type === 'audio/mp4' ? 'm4a' : 'mp3'}`
    entries[file] = new Uint8Array(await record.blob.arrayBuffer()); items.push({ text: record.text, file })
  }
  entries['manifest.json'] = strToU8(JSON.stringify({ schemaVersion: 1, voice: '本地音频备份', items }))
  downloadFile('word-audio-backup.zip', zipSync(entries))
}

export async function listLocalWordAudios():Promise<WordAudio[]>{
 const db=await openAudioDb()
 try{
  const values=await new Promise<StoredWordAudio[]>((resolve,reject)=>{const tx=db.transaction('audio'),request=tx.objectStore('audio').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.onabort=()=>reject(tx.error)})
  const restored=values.map(restoreAudio)
  if(restored.some(value=>!value))throw new Error('本机有损坏的音频记录，请重新导入对应音频后再发布。')
  return restored as WordAudio[]
 }finally{db.close()}
}
