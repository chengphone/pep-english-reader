#!/usr/bin/env node
// 修正牛津教材点读区间的起止点。
//
// 教材 book.json 的 audioStart/audioEnd 来自 whisper 对齐；有些单词的边界
// 落在语音中间，点读会削掉首尾辅音，另一些区间前后留着成片静音。
// 本工具解码区间引用的真实音频，计算 10 ms 音量包络，把边界放到完整音节
// 的首尾并留出少量余量；只调整已有区间，不新增、不合成任何声音。
//
// 用法：
//   node tools/refine-textbook-audio-bounds.mjs --root ~/Downloads/lets-go-begin-1-reader
//   node tools/refine-textbook-audio-bounds.mjs --book ~/Downloads/lets-go-begin-1-reader/book.json --dry-run
//   node tools/refine-textbook-audio-bounds.mjs --root ~/Downloads/lets-go-picture-dictionary-unpack --only p011_17,p012_08
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { frameLevels } from './pictureAudioBounds.mjs'
import { refineTextbookBounds } from './textbookAudioBounds.mjs'

const run = promisify(execFile)
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.findIndex(value => value === `--${name}` || value.startsWith(`--${name}=`))
  if (index < 0) return fallback
  const value = args[index]
  return value.includes('=') ? value.slice(value.indexOf('=') + 1) : args[index + 1] ?? fallback
}
function flag(name) { return args.includes(`--${name}`) }

const BOOK = resolve(option('book', join(option('root', join(homedir(), 'Downloads', 'lets-go-begin-1-reader')), 'book.json')))
const ROOT = dirname(BOOK)
const ONLY = new Set(option('only', '').split(',').map(value => value.trim()).filter(Boolean))
const LIMIT = Math.max(0, Number(option('limit', '0')) || 0)
const DRY = flag('dry-run')
const FORCE = flag('force')
const DROP_DB = Number(option('drop-db', '18'))
const REPORT = option('report', '')

if (!existsSync(BOOK)) throw new Error(`找不到教材清单：${BOOK}`)
const raw = await readFile(BOOK, 'utf8')
const book = JSON.parse(raw)
// 保持原文件的缩进风格，避免整本清单变成一行。
const indentMatch = raw.match(/\n([ \t]+)"/)
const indent = indentMatch ? indentMatch[1] : null
const items = []
for (const [pageIndex, page] of (book.pages ?? []).entries()) {
  for (const item of page.items ?? []) {
    if (!item.audio || !Number.isFinite(item.audioStart) || !Number.isFinite(item.audioEnd)) continue
    if (ONLY.size && !ONLY.has(item.id)) continue
    items.push({ item, page: pageIndex + 1 })
  }
}
const selected = LIMIT > 0 ? items.slice(0, LIMIT) : items
if (!selected.length) throw new Error('没有匹配到带音频区间的点读条目。')
const partial = ONLY.size > 0 || LIMIT > 0
if (book.textbookAudioBounds?.refinedAt && !FORCE && !partial) {
  console.log(`这本书已于 ${book.textbookAudioBounds.refinedAt} 精修过；加 --force 可重跑。`)
  process.exit(0)
}

const byAudio = new Map()
for (const row of selected) {
  const list = byAudio.get(row.item.audio) ?? []
  list.push(row)
  byAudio.set(row.item.audio, list)
}
console.log(`精修点读区间：${selected.length} 条，${byAudio.size} 段音频${DRY ? '，试运行' : ''}`)

const cache = new Map()
async function levelsFor(src) {
  if (cache.has(src)) return cache.get(src)
  const file = join(ROOT, src)
  if (!existsSync(file)) throw new Error(`找不到音频：${file}`)
  const { stdout } = await run('ffmpeg', [
    '-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 's16le', '-',
  ], { maxBuffer: 128 * 1024 * 1024, encoding: 'buffer' })
  const levels = frameLevels(new Int16Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 2))
  if (!levels.length) throw new Error(`音频解码为空：${file}`)
  cache.set(src, levels)
  return levels
}

const report = []
let changed = 0
let refinedStarts = 0
let refinedEnds = 0
let startsExtended = 0
let endsExtended = 0
for (const [src, rows] of byAudio) {
  rows.sort((a, b) => a.item.audioStart - b.item.audioStart || a.item.audioEnd - b.item.audioEnd)
  const levels = await levelsFor(src)
  const duration = levels.length * 0.01
  let previousEnd = 0
  for (const [index, row] of rows.entries()) {
    const nextStart = rows[index + 1]?.item.audioStart ?? Number.POSITIVE_INFINITY
    const item = row.item
    const result = refineTextbookBounds(levels, {
      start: item.audioStart,
      end: item.audioEnd,
      nextStart,
      prevEnd: previousEnd,
      duration,
      dropDb: DROP_DB,
    })
    if (result.changed) {
      changed++
      if (Math.abs(result.start - item.audioStart) >= 0.01) refinedStarts++
      if (Math.abs(result.end - item.audioEnd) >= 0.01) refinedEnds++
      if (result.extendedStart) startsExtended++
      if (result.extendedEnd) endsExtended++
      report.push({
        page: row.page, id: item.id, text: item.text, audio: src,
        from: item.audioStart, to: item.audioEnd, start: result.start, end: result.end,
        extendedStart: Boolean(result.extendedStart), extendedEnd: Boolean(result.extendedEnd),
      })
      item.audioStart = result.start
      item.audioEnd = result.end
    }
    previousEnd = item.audioEnd
  }
}

if (!DRY && (!partial || changed)) {
  const now = new Date().toISOString()
  // 保留已有的重建记录（例如 Begin 1 的逐词重建时间），只更新本次精修字段。
  book.textbookAudioBounds = partial
    ? { ...(book.textbookAudioBounds ?? {}), lastPartialAt: now, lastPartialRefined: changed, lastPartialTotal: selected.length }
    : { ...(book.textbookAudioBounds ?? {}), refinedAt: now, refined: changed, total: selected.length, startsExtended, endsExtended }
  await writeFile(BOOK, JSON.stringify(book, null, indent) + '\n')
}
if (REPORT) await writeFile(REPORT, JSON.stringify(report, null, 2))
console.log(`\n完成：${changed} 条调整（起点 ${refinedStarts}、终点 ${refinedEnds}），` +
  `其中起点接上被切的语音 ${startsExtended} 条、终点接上 ${endsExtended} 条。`)
console.log('调整幅度最大的 10 处：')
const movement = row => Math.abs(row.start - row.from) + Math.abs(row.end - row.to)
for (const row of [...report].sort((a, b) => movement(b) - movement(a)).slice(0, 10)) {
  console.log(`p${row.page} ${row.id} ${JSON.stringify(row.text)} ${row.from}–${row.to} -> ${row.start}–${row.end}`)
}
if (DRY) console.log('这是试运行，book.json 未改动。')
if (!changed) console.log('没有需要调整的区间。')
