import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import generator from '../tools/build_word_audio.py?raw'

export type WordAudio = { key: string; text: string; blob: Blob; voice: string; updatedAt: number }
export const audioKey = (text: string) => text.normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
const MAX_FILE = 10 * 1024 * 1024
function openAudioDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pep-word-audio', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('audio', { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function readWordAudios(texts: string[]): Promise<Map<string, WordAudio>> {
  const db = await openAudioDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('audio'), result = new Map<string, WordAudio>()
      for (const key of new Set(texts.map(audioKey))) {
        const request = tx.objectStore('audio').get(key)
        request.onsuccess = () => { if (request.result) result.set(key, request.result) }
      }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}
async function saveAudios(records: WordAudio[]) {
  const db = await openAudioDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('audio', 'readwrite')
      for (const record of records) tx.objectStore('audio').put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
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
      function finish(error?: Error) { clearTimeout(timeout); audio.onloadedmetadata = null; audio.onerror = null; error ? reject(error) : resolve() }
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
  // Validate every file before the transaction so a bad import never partially replaces good audio.
  for (const [key, item] of candidates) {
    const blob = new Blob([new Uint8Array(item.bytes)], { type: audioMime(item.bytes) })
    await verifyAudio(blob)
    records.push({ key, text: item.text, blob, voice: item.voice, updatedAt: Date.now() })
  }
  await saveAudios(records)
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
  const entries: Record<string, Uint8Array> = {}, items: { text: string; file: string }[] = []
  for (const [index, record] of records.entries()) {
    const file = `audio/${index}.${record.blob.type === 'audio/wav' ? 'wav' : record.blob.type === 'audio/ogg' ? 'ogg' : record.blob.type === 'audio/mp4' ? 'm4a' : 'mp3'}`
    entries[file] = new Uint8Array(await record.blob.arrayBuffer()); items.push({ text: record.text, file })
  }
  entries['manifest.json'] = strToU8(JSON.stringify({ schemaVersion: 1, voice: '本地音频备份', items }))
  downloadFile('word-audio-backup.zip', zipSync(entries))
}
