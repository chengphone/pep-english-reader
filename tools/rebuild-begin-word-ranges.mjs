// 用真实音频重建 Begin 1 每个主词的完整朗读区间：
// 逐段识别音轨里的语音，按 “Number 1–4” 分组，每组内的朗读都属于对应单词，
// 起点前留 80 ms、终点后留 160 ms，不包含编号提示。
// 用法：node tools/rebuild-begin-word-ranges.mjs [--apply] [--report /tmp/begin-ranges.json]
// 需要先在本机启动 whisper-server：whisper-server -m ~/.cache/whisper.cpp/ggml-small.en.bin --port 8099 -sow -ml 0
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { frameLevels } from './pictureAudioBounds.mjs'

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1] ?? null }
const flag = name => args.includes(`--${name}`)
const ROOT = resolve(option('root') ?? join(homedir(), 'Downloads', 'lets-go-begin-1-reader'))
const BOOK = join(ROOT, 'book.json')
const REPORT = option('report') ?? '/tmp/begin-ranges.json'
const APPLY = flag('apply')
const SERVER = option('server') ?? 'http://127.0.0.1:8099'

const book = JSON.parse(await readFile(BOOK, 'utf8'))
const groups = new Map()
for (const [pageIndex, page] of (book.pages ?? []).entries()) {
  for (const item of page.items ?? []) {
    if (!item.audio || !Number.isFinite(item.audioStart)) continue
    const list = groups.get(item.audio) ?? []
    list.push({ item, page: pageIndex + 1 })
    groups.set(item.audio, list)
  }
}

const cache = new Map()
function levelsFor(file) {
  if (cache.has(file)) return cache.get(file)
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], { maxBuffer: 256 * 1024 * 1024 })
  const pcm = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
  const levels = frameLevels(new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2))
  const value = { pcm, levels }
  cache.set(file, value)
  return value
}

function detectRuns(levels) {
  const sorted = [...levels].sort((a, b) => a - b)
  const pct = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  const peak = pct(0.97)
  const quiet = levels.filter(v => v < peak - 18).sort((a, b) => a - b)
  const noise = quiet.length >= 20 ? quiet[Math.floor(quiet.length * 0.2)] : -90
  const edge = Math.min(peak - 25, Math.max(peak - 40, noise + 8))
  const speaking = i => levels[i] >= edge
  const solid = i => speaking(i) && (speaking(i - 1) || speaking(i + 1))
  const raw = []
  let run = null
  for (let i = 0; i < levels.length; i++) {
    if (solid(i)) { if (!run) run = { from: i, to: i }; else run.to = i }
    else if (run) { raw.push(run); run = null }
  }
  if (run) raw.push(run)
  const merged = []
  for (const r of raw) {
    const last = merged.at(-1)
    if (last && r.from - last.to <= 8) last.to = r.to
    else merged.push({ ...r })
  }
  return merged.filter(r => r.to - r.from >= 3)
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(samples[i], i * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8)
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

async function transcribe(samples, prompt) {
  const form = new FormData()
  form.append('file', new Blob([wav(samples)], { type: 'audio/wav' }), 'run.wav')
  form.append('response_format', 'json')
  form.append('language', 'en')
  if (prompt) form.append('prompt', prompt)
  const response = await fetch(`${SERVER}/inference`, { method: 'POST', body: form })
  if (!response.ok) throw new Error(`whisper-server ${response.status}: ${await response.text()}`)
  return ((await response.json()).text ?? '').trim()
}

const numberPattern = /\bnumber\s*(one|two|three|four|1|2|3|4)\b/i
const standalonePattern = /^(one|two|three|four|1|2|3|4)[.!]?$/i
const numberValue = text => {
  const match = text.match(numberPattern) ?? text.trim().match(standalonePattern)
  if (!match) return null
  const raw = match[1].toLowerCase()
  return { one: 1, two: 2, three: 3, four: 4, 1: 1, 2: 2, 3: 3, 4: 4 }[raw] ?? null
}

const report = []
for (const [audio, rows] of groups) {
  rows.sort((a, b) => a.item.audioStart - b.item.audioStart || a.item.audioEnd - b.item.audioEnd)
  const file = resolve(ROOT, audio)
  if (!existsSync(file)) throw new Error(`找不到音频：${file}`)
  const { pcm, levels } = levelsFor(file)
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2)
  const runs = detectRuns(levels)
  const prompt = rows.map(row => row.item.text).join(', ')
  const labeled = []
  for (const [index, run] of runs.entries()) {
    const from = Math.max(0, run.from - 8)
    const to = Math.min(levels.length, run.to + 9)
    const text = await transcribe(samples.slice(from * 160, to * 160), prompt)
    labeled.push({ index, from: run.from / 100, to: (run.to + 1) / 100, text })
  }
  const prompts = labeled.filter(run => numberValue(run.text)).map(run => ({ ...run, value: numberValue(run.text) }))
  const byValue = new Map(prompts.map(run => [run.value, run]))
  const missing = [1, 2, 3, 4].filter(value => !byValue.has(value))
  if (missing.length) {
    console.log(`! ${audio} 缺少编号 ${missing.join(',')}：`, labeled.map(run => `${run.from}-${run.to} ${JSON.stringify(run.text)}`).join(' | '))
    continue
  }
  for (const [itemIndex, row] of rows.entries()) {
    const marker = byValue.get(itemIndex + 1)
    const next = byValue.get(itemIndex + 2)
    const content = labeled.filter(run => run.index > marker.index && (!next || run.index < next.index))
    if (!content.length) {
      console.log(`! ${row.item.id} ${row.item.text} 没有找到朗读`)
      continue
    }
    const first = content[0]
    const last = content.at(-1)
    const start = Math.max(0, Number((first.from - 0.08).toFixed(2)))
    const end = Math.min(levels.length / 100, Number((last.to + 0.16).toFixed(2)))
    report.push({
      page: row.page, id: row.item.id, text: row.item.text, audio,
      from: row.item.audioStart, to: row.item.audioEnd, start, end,
      runs: content.map(run => `${run.from}-${run.to} ${JSON.stringify(run.text)}`),
    })
  }
}
await writeFile(REPORT, JSON.stringify(report, null, 2))
console.log(`\n生成 ${report.length} 条区间，报告：${REPORT}`)
let changed = 0
for (const row of report) {
  if (Math.abs(row.start - row.from) >= 0.01 || Math.abs(row.end - row.to) >= 0.01) {
    changed++
    console.log(`p${row.page} ${row.id} ${JSON.stringify(row.text)} ${row.from}-${row.to} -> ${row.start}-${row.end}`)
  }
}
console.log(`其中变化 ${changed} 条`)
if (APPLY) {
  const byId = new Map(report.map(row => [row.id, row]))
  for (const page of book.pages ?? []) for (const item of page.items ?? []) {
    const row = byId.get(item.id)
    if (!row) continue
    item.audioStart = row.start
    item.audioEnd = row.end
  }
  book.textbookAudioBounds = { ...(book.textbookAudioBounds ?? {}), beginRebuiltAt: new Date().toISOString(), beginRebuilt: changed, beginRebuiltTotal: report.length }
  const raw = await readFile(BOOK, 'utf8')
  const indentMatch = raw.match(/\n([ \t]+)"/)
  const indent = indentMatch ? indentMatch[1] : null
  await writeFile(BOOK, JSON.stringify(book, null, indent) + '\n')
  console.log('已写入 book.json')
}
