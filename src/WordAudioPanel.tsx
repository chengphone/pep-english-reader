import { useEffect, useRef, useState } from 'react'
import { audioKey, exportAudioRequest, importWordAudio } from './wordAudio'
import { readMaterialAudios, exportMaterialAudio } from './textbookAudio'
import type { VocabularyUnit, VocabularyWord } from './vocabularyExtraction'

export default function WordAudioPanel({ words, units, book }: { words: VocabularyWord[]; units: VocabularyUnit[]; book: string }) {
  const [scope, setScope] = useState('unit'), [voice, setVoice] = useState('en-US-AriaNeural')
  const [covered, setCovered] = useState<Set<string>>(new Set()), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const player = useRef<HTMLAudioElement | null>(null), url = useRef(''), version = useRef(0)
  const entries=scope==='book'?units.filter(u=>u.book===book).flatMap(u=>u.words):words
  const texts=[...new Set(entries.map(w=>w.english.trim()).filter(Boolean))]
  const originalOnly=!!entries.length&&entries.every(word=>!!word.audio)
  const signature=JSON.stringify(entries.map(({english,audio})=>({english,audio})))
  function stop() { version.current++; if (player.current) { player.current.pause(); player.current.removeAttribute('src'); player.current.load(); player.current = null } if (url.current) { URL.revokeObjectURL(url.current); url.current = '' } }
  useEffect(() => { let live = true; stop(); setCovered(new Set()); void readMaterialAudios(JSON.parse(signature)).then(records => { if (live) setCovered(new Set(records.keys())) }).catch(() => { if (live) setMessage('本地音频读取失败，请检查浏览器存储权限。') }); return () => { live = false; stop() } }, [signature])
  async function perform(action: () => void | Promise<void>) { setBusy(true); setMessage(''); try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : '音频操作失败') } finally { setBusy(false) } }
  async function preview(text: string) {
    stop(); const token = version.current
    try {
      const record = (await readMaterialAudios(entries.filter(word=>audioKey(word.english)===audioKey(text)))).get(audioKey(text))
      if (token !== version.current || !record) return
      url.current = URL.createObjectURL(record.blob); const audio = new Audio(url.current); player.current = audio
      audio.onended = () => { if (token === version.current) stop() }
      audio.onerror = () => { if (token === version.current) { stop(); setMessage('该音频无法播放，请重新导入。') } }
      await audio.play()
    } catch { if (token === version.current) { stop(); setMessage('播放失败，请再点一次试听。') } }
  }
  return <section className="word-audio-panel" aria-label="单词音频管理"><h3>{originalOnly?'教材原音 · 离线听写':'单词音频 · 制作一次，离线听写'}</h3><p>{originalOnly?'已关联对应课本原音，直接试听和下载到本机；听写时使用教材录音。':'优先使用本地 MP3。导出词表后，在电脑运行 edge-tts 生成工具，再导入音频 ZIP。无需自建服务器。'}</p><div className="word-audio-settings"><label>处理范围<select aria-label="音频处理范围" value={scope} onChange={e => setScope(e.target.value)}><option value="unit">当前单元（含未保存修改）</option><option value="book">本教材全部已保存词表</option></select></label>{!originalOnly&&<label>生成音色<select aria-label="生成音色" value={voice} onChange={e => setVoice(e.target.value)}><option value="en-US-AriaNeural">美式女声 Aria</option><option value="en-US-GuyNeural">美式男声 Guy</option><option value="en-GB-LibbyNeural">英式女声 Libby</option><option value="en-GB-RyanNeural">英式男声 Ryan</option></select></label>}</div><p role="status">本地音频已就绪 {texts.filter(t => covered.has(audioKey(t))).length} / {texts.length} 条。{originalOnly?'原音按教材条目关联，已下载后可离线使用。':'同词音频跨单元复用；再次导入会替换该词音频。'}</p><div className="word-audio-actions"><button hidden={originalOnly} className="soft-btn" disabled={busy || !texts.length} onClick={() => void perform(() => exportAudioRequest(texts, voice))}>① 导出音频制作包</button><label hidden={originalOnly} className="upload-source">② 导入音频 ZIP / MP3<input type="file" multiple disabled={busy || !texts.length} accept=".zip,.mp3,.wav,.m4a,.ogg" onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void perform(async () => { stop(); const result = await importWordAudio(files, texts); setCovered(new Set((await readMaterialAudios(entries)).keys())); setMessage(`已保存 ${result.imported} 条音频${result.skipped ? `，跳过 ${result.skipped} 条范围外词条` : ''}，请试听确认。`) }) }}/></label><button className="soft-btn" disabled={busy || !covered.size} onClick={() => void perform(async()=>{if(originalOnly){const records=await readMaterialAudios(entries);setCovered(new Set(records.keys()));setMessage(`已就绪 ${records.size} / ${texts.length} 条教材原音，已缓存的录音可以离线使用。`)}else await exportMaterialAudio(entries)})}>{originalOnly?'下载离线原音':'备份音频包'}</button></div><details><summary>{originalOnly?'原音试听与检查':'怎样生成？ / 试听与检查'}</summary><p hidden={originalOnly}>解压制作包，按其中“使用说明.txt”运行。生成时仅将英文词条发送到微软在线语音服务；教材和中文释义留在本机。将生成的 word-audio.zip 导回这里。也可直接多选 apple.mp3 等按英文命名的文件。</p><p hidden={originalOnly}>音色选项用于下次生成，不会改变已有音频。多音词需对照教材试听，读音不符时可单独导入替换。</p><div className="audio-preview-list">{texts.map(text => <div key={text}><span>{text}</span>{covered.has(audioKey(text)) ? <button onClick={() => void preview(text)}>试听</button> : <small>缺少音频</small>}</div>)}</div><button className="soft-btn" onClick={stop}>停止试听</button></details>{busy && <p>正在处理音频，请稍候…</p>}{message && <p role="status">{message}</p>}</section>
}
