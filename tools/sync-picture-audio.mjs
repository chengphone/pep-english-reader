import { spawn } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { homedir } from 'node:os'

// 用 whisper.cpp 得到词级时间，再和 PDF 文字层做序列对齐。
// 只写入通过覆盖率、顺序和时长检查的句子时间戳；失败句保留为未同步。
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const ROOT = resolve(option('--root', join(homedir(), 'Downloads/journey-to-the-west-reader')))
const MODEL = resolve(option('--model', join(homedir(), '.cache/whisper.cpp/ggml-base.en.bin')))
const WHISPER = option('--whisper', 'whisper-cli')
const JOBS = Math.max(1, Math.min(8, Number(option('--jobs', '3')) || 3))
const LIMIT = Number(option('--limit', '0')) || 0
const ONLY = new Set(option('--only', '').split(',').map(value => value.trim()).filter(Boolean))
const FORCE = args.includes('--force')
const MIN_COVERAGE = Number(option('--min-coverage', '0.6')) || 0.6
const CACHE = join(ROOT, 'sync-cache', basename(MODEL, '.bin'))

const NUMBER_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
  sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100',
}

function words(text) {
  return text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean)
    .map(word => NUMBER_WORDS[word] ?? word)
}

function similarity(a, b) {
  if (a === b) return 1
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 2) return 0
  const m = a.length
  const n = b.length
  let previous = Array.from({ length: n + 1 }, (_, index) => index)
  for (let i = 1; i <= m; i++) {
    const current = [i]
    for (let j = 1; j <= n; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  const score = 1 - previous[n] / Math.max(m, n, 1)
  return score >= 0.72 ? score : 0
}

function readWhisperWords(json) {
  const result = []
  let inBracket = false
  for (const row of json.transcription ?? []) {
    const raw = String(row.text ?? '').trim()
    if (!raw) continue
    if (inBracket) {
      if (raw.includes(']')) inBracket = false
      continue
    }
    if (raw.includes('[')) {
      if (!raw.includes(']')) inBracket = true
      continue
    }
    if (raw.startsWith('[_')) continue
    const start = Number(row.offsets?.from) / 1000
    const end = Math.max(Number(row.offsets?.from), Number(row.offsets?.to)) / 1000
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    for (const word of words(raw)) result.push({ word, start, end })
  }
  return result
}

function alignBook(book, whisperJson) {
  const asr = readWhisperWords(whisperJson)
  const pdf = []
  const sentenceRows = []
  for (const [pageIndex, page] of book.pages.entries()) {
    for (const sentence of page.sentences) {
      const row = { sentence, pageIndex, first: pdf.length, count: 0 }
      for (const word of words(sentence.text)) {
        pdf.push({ word, row })
        row.count++
      }
      sentenceRows.push(row)
    }
  }
  if (!asr.length || !pdf.length) return { asr, pdf, sentenceRows, timestamps: new Map(), anchor: 0, coverage: 0 }

  // 去掉片头曲和章节播报，从第一句正文的第一个词开始对齐。
  const expected = pdf.slice(0, Math.min(10, pdf.length)).map(item => item.word)
  let anchor = { index: 0, score: -1 }
  for (let start = 0; start < Math.min(asr.length, 900); start++) {
    let score = 0
    for (let offset = 0; offset < expected.length && start + offset < asr.length; offset++) {
      const value = similarity(expected[offset], asr[start + offset].word)
      score += value > 0 ? 1 + value : -0.4
    }
    if (score > anchor.score) anchor = { index: start, score }
  }
  const from = anchor.score > 2 ? anchor.index : 0
  const n = pdf.length
  const m = asr.length - from
  const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1))
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1))
  for (let j = 1; j <= m; j++) { dp[0][j] = -0.7 * j; move[0][j] = 2 }
  for (let i = 1; i <= n; i++) { dp[i][0] = -0.7 * i; move[i][0] = 1 }
  for (let i = 1; i <= n; i++) {
    const current = dp[i]
    const previous = dp[i - 1]
    const directions = move[i]
    for (let j = 1; j <= m; j++) {
      const score = similarity(pdf[i - 1].word, asr[from + j - 1].word)
      const diagonal = previous[j - 1] + (score > 0 ? 1 + score : -0.8)
      const up = previous[j] - 0.7
      const left = current[j - 1] - 0.7
      let best = diagonal
      let direction = 0
      if (up > best) { best = up; direction = 1 }
      if (left > best) { best = left; direction = 2 }
      current[j] = best
      directions[j] = direction
    }
  }
  const matches = new Map()
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const direction = move[i][j]
    if (i > 0 && j > 0 && direction === 0) {
      matches.set(i - 1, from + j - 1)
      i--
      j--
    } else if (i > 0 && (j === 0 || direction === 1)) i--
    else j--
  }

  const timestamps = new Map()
  let previousStart = -1
  for (const row of sentenceRows) {
    let firstStart = Infinity
    let lastEnd = -Infinity
    let hits = 0
    for (let index = row.first; index < row.first + row.count; index++) {
      const match = matches.get(index)
      if (match === undefined) continue
      hits++
      firstStart = Math.min(firstStart, asr[match].start)
      lastEnd = Math.max(lastEnd, asr[match].end)
    }
    const coverage = row.count ? hits / row.count : 0
    if (coverage < MIN_COVERAGE || !Number.isFinite(firstStart) || !Number.isFinite(lastEnd)) continue
    const start = Math.max(0, firstStart)
    const end = Math.max(start, lastEnd)
    if (start < previousStart - 0.3) continue
    previousStart = Math.max(previousStart, start)
    timestamps.set(row.sentence.id, { start: Number(start.toFixed(2)), end: Number(end.toFixed(2)), coverage })
  }
  return { asr, pdf, sentenceRows, timestamps, anchor: from, coverage: timestamps.size / Math.max(1, sentenceRows.length) }
}

async function runWhisper(audio, outputBase) {
  await new Promise((resolvePromise, reject) => {
    // macOS 上 Metal 的 residency set 在多进程/长时间运行时会出现
    // 命令缓冲区长时间不返回；关掉它，转写仍走 GPU，但不再建常驻集合。
    const env = { ...process.env, GGML_METAL_NO_RESIDENCY: process.env.GGML_METAL_NO_RESIDENCY ?? '1' }
    const child = spawn(WHISPER, ['-m', MODEL, '-f', audio, '-ojf', '-of', outputBase, '-ml', '1', '-np'], { stdio: ['ignore', 'ignore', 'pipe'], env })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolvePromise() : reject(new Error(`whisper-cli 退出码 ${code}${stderr ? `：${stderr.slice(-300)}` : ''}`)))
  })
}

async function processBook(row) {
  const bookPath = join(ROOT, row.manifest)
  const book = JSON.parse(await readFile(bookPath, 'utf8'))
  const sentenceCount = book.pages.reduce((sum, page) => sum + page.sentences.length, 0)
  const already = book.pages.every(page => page.sentences.every(sentence => Number.isFinite(sentence.start)))
  if (already && !FORCE) return { id: row.id, skipped: true, sentenceCount }
  const audio = join(ROOT, 'books', row.id, book.audio)
  const outputBase = join(CACHE, row.id)
  await mkdir(CACHE, { recursive: true })
  const jsonPath = `${outputBase}.json`
  let json
  try {
    await access(jsonPath)
    json = JSON.parse(await readFile(jsonPath, 'utf8'))
  } catch {
    await runWhisper(audio, outputBase)
    json = JSON.parse(await readFile(jsonPath, 'utf8'))
  }
  const result = alignBook(book, json)
  for (const page of book.pages) {
    for (const sentence of page.sentences) {
      const timestamp = result.timestamps.get(sentence.id)
      if (timestamp) {
        sentence.start = timestamp.start
        sentence.end = timestamp.end
      } else {
        delete sentence.start
        delete sentence.end
      }
    }
  }
  book.audioSync = {
    source: `whisper.cpp:${basename(MODEL)} + PDF text alignment`,
    aligned: result.timestamps.size,
    total: sentenceCount,
    generatedAt: new Date().toISOString(),
  }
  await writeFile(bookPath, JSON.stringify(book) + '\n')
  return { id: row.id, sentenceCount, aligned: result.timestamps.size, coverage: result.coverage, anchor: result.anchor, words: result.pdf.length }
}

const catalog = JSON.parse(await readFile(join(ROOT, 'picture-books.json'), 'utf8'))
const rows = (Array.isArray(catalog) ? catalog : catalog.books ?? []).filter(row => row?.manifest && row?.id)
const matched = ONLY.size ? rows.filter(row => ONLY.has(row.id)) : rows
const selected = LIMIT > 0 ? matched.slice(0, LIMIT) : matched
console.log(`绘本音频对齐：${selected.length} 本，模型 ${basename(MODEL)}，并发 ${JOBS}`)

let cursor = 0
const reports = []
const failures = []
async function worker() {
  while (cursor < selected.length) {
    const row = selected[cursor++]
    try {
      const report = await processBook(row)
      reports.push(report)
      if (!report.skipped) {
        const low = report.aligned < report.sentenceCount
        console.log(`${report.id} ${report.aligned}/${report.sentenceCount} 句${low ? '（有未同步句）' : ''}`)
      }
    } catch (error) {
      failures.push({ id: row.id, error: error instanceof Error ? error.message : String(error) })
      console.error(`${row.id} 失败：${failures.at(-1).error}`)
    }
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, selected.length) }, () => worker()))

const reportPath = join(ROOT, 'sync-report.json')
await writeFile(reportPath, JSON.stringify({
  model: basename(MODEL),
  generatedAt: new Date().toISOString(),
  books: reports.sort((left, right) => left.id.localeCompare(right.id)),
  failures,
}, null, 2) + '\n')
console.log(`\n完成：${reports.filter(row => !row.skipped).length} 本已对齐，${reports.filter(row => row.skipped).length} 本跳过，${failures.length} 本失败。报告：${reportPath}`)
if (failures.length) process.exitCode = 1
