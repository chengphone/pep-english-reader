#!/usr/bin/env node
// 修正绘本逐句时间戳的起止点。
//
// whisper 的词级时间经常比真实语音早 0.3–0.6 秒开始、晚 0.5–1.5 秒结束；
// 直接用它点句播放，会带进前一句尾音或整段背景音乐。本工具解码整集原声，
// 计算 10 ms 一帧的音量包络，在原文时间附近找到真正的说话区间，并把
// 起止点写回 book.json。只调整已有时间戳，不新增、不伪造任何时间。
//
// 用法：
//   node tools/refine-picture-audio-bounds.mjs --series "Bat and Friends"
//   node tools/refine-picture-audio-bounds.mjs --only bat-001,bat-002 --dry-run
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { frameLevels, refineSentenceBounds } from './pictureAudioBounds.mjs'

const run = promisify(execFile)
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.findIndex(value => value === `--${name}` || value.startsWith(`--${name}=`))
  if (index < 0) return fallback
  const value = args[index]
  return value.includes('=') ? value.slice(value.indexOf('=') + 1) : args[index + 1] ?? fallback
}
function flag(name) { return args.includes(`--${name}`) }

const ROOT = resolve(option('root', join(homedir(), 'Downloads', 'journey-to-the-west-reader')))
const ONLY = new Set(option('only', '').split(',').map(value => value.trim()).filter(Boolean))
const SERIES = option('series', '').trim()
const LIMIT = Math.max(0, Number(option('limit', '0')) || 0)
const JOBS = Math.max(1, Math.min(6, Number(option('jobs', '3')) || 3))
const DRY = flag('dry-run')
const FORCE = flag('force')

async function decode(file) {
  const { stdout } = await run('ffmpeg', [
    '-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 's16le', '-',
  ], { maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' })
  const samples = new Int16Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 2)
  return frameLevels(samples)
}

async function processBook(row) {
  const bookPath = join(ROOT, row.manifest)
  const book = JSON.parse(await readFile(bookPath, 'utf8'))
  if (book.audioSync?.boundsRefinedAt && !FORCE) return { id: row.id, skipped: true }
  const audioPath = join(ROOT, 'books', row.id, book.audio ?? 'audio/episode.mp3')
  if (!existsSync(audioPath)) throw new Error('找不到整集音频')
  const levels = await decode(audioPath)
  if (!levels.length) throw new Error('音频解码为空')
  const sentences = book.pages.flatMap(page => page.sentences)
  let changed = 0
  let refinedStarts = 0
  let refinedEnds = 0
  let previousEnd = 0
  let usable = 0
  for (const [index, sentence] of sentences.entries()) {
    if (!Number.isFinite(sentence.start) || !Number.isFinite(sentence.end)) continue
    const next = sentences.slice(index + 1).find(item => Number.isFinite(item.start))?.start
    const nextStart = Number.isFinite(next) ? next : Number.POSITIVE_INFINITY
    const result = refineSentenceBounds(levels, {
      start: sentence.start,
      end: sentence.end,
      nextStart,
      prevEnd: previousEnd,
      duration: book.audioDuration || levels.length * 0.01,
      wordCount: sentence.text.trim().split(/\s+/).filter(Boolean).length,
    })
    usable++
    if (result.changed) {
      if (Math.abs(result.start - sentence.start) >= 0.01) refinedStarts++
      if (Math.abs(result.end - sentence.end) >= 0.01) refinedEnds++
      sentence.start = result.start
      sentence.end = result.end
      changed++
    }
    previousEnd = sentence.end
  }
  if (!changed) return { id: row.id, changed: 0, usable }
  book.audioSync = {
    ...(book.audioSync ?? {}),
    boundsRefinedAt: new Date().toISOString(),
    boundsRefined: changed,
    boundsTotal: usable,
  }
  if (!DRY) await writeFile(bookPath, JSON.stringify(book) + '\n')
  return { id: row.id, changed, usable, refinedStarts, refinedEnds }
}

const catalogPath = join(ROOT, 'picture-books.json')
if (!existsSync(catalogPath)) throw new Error(`找不到绘本目录：${catalogPath}`)
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const rows = (Array.isArray(catalog) ? catalog : catalog.books ?? [])
  .filter(row => row?.manifest && row?.id)
  .filter(row => !ONLY.size || ONLY.has(row.id))
  .filter(row => !SERIES || row.series === SERIES)
const selected = LIMIT > 0 ? rows.slice(0, LIMIT) : rows
if (!selected.length) throw new Error('没有匹配到绘本。')
console.log(`修正逐句音频边界：${selected.length} 本${SERIES ? `（${SERIES}）` : ''}，${JOBS} 个并发${DRY ? '，试运行' : ''}`)

let cursor = 0
const reports = []
const failures = []
async function worker() {
  while (cursor < selected.length) {
    const row = selected[cursor++]
    try {
      const report = await processBook(row)
      reports.push(report)
      if (!report.skipped && report.changed) {
        console.log(`${report.id} ${report.changed}/${report.usable} 句 · 起点 ${report.refinedStarts} · 终点 ${report.refinedEnds}`)
      }
    } catch (error) {
      failures.push({ id: row.id, error: error instanceof Error ? error.message : String(error) })
      console.error(`${row.id} 失败：${failures.at(-1).error}`)
    }
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, selected.length) }, () => worker()))

const changed = reports.filter(row => row.changed).length
const skipped = reports.filter(row => row.skipped).length
console.log(`\n完成：${changed} 本已修正，${skipped} 本跳过，${failures.length} 本失败。`)
if (DRY) console.log('这是试运行，book.json 未改动。')
if (failures.length) process.exitCode = 1
