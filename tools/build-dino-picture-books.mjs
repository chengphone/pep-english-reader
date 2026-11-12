#!/usr/bin/env node
// 把 Dino Buddies 的 PDF、MP3 和生词 PDF 整理成绘本阅读器数据。
//
// 资源只保存在仓库外（默认 ~/Downloads/dino-buddies-reader）：
//   picture-books.json
//   books/dino-001/book.json
//   books/dino-001/cover.jpg / art.jpg
//   books/dino-001/pages/001.jpg…
//   books/dino-001/audio/episode.mp3
//
// 这批 PDF 有三种版式：
//   1. 595×420 横版，一页一个故事页（001–024）
//   2. 453×344 横版，一页一个故事页（025–039，033 的页面高度异常，需要纵向还原）
//   3. 595×839 竖版，一页上下两个故事页，下半页旋转 180°（040–044）
// 句子文本和坐标来自 PDF 文字层；逐句时间戳由 tools/sync-picture-audio.mjs
// 用整集原声转写对齐后写入，不生成、不伪造音频。
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, link, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.findIndex(value => value === `--${name}` || value.startsWith(`--${name}=`))
  if (index < 0) return fallback
  const value = args[index]
  return value.includes('=') ? value.slice(value.indexOf('=') + 1) : args[index + 1] ?? fallback
}
function flag(name) { return args.includes(`--${name}`) }

const PDF_DIR = resolve(option('pdf-dir', join(homedir(), 'Downloads', 'Dino Buddies_制作故事书')))
const AUDIO_DIR = resolve(option('audio-dir', join(homedir(), 'Downloads', 'Dino Buddies_mp3')))
const VOCAB_PDF = resolve(option('vocab', join(homedir(), 'Downloads', 'Dino Buddies 词汇', 'Dino Buddies Vocab.pdf')))
const OUT = resolve(option('out', join(homedir(), 'Downloads', 'dino-buddies-reader')))
const FROM = Math.max(1, Number(option('from', '1')) || 1)
const LIMIT = Math.max(0, Number(option('limit', '0')) || 0)
const ONLY = new Set(option('only', '').split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0))
const FORCE = flag('force')
const DPI = Math.max(96, Number(option('dpi', '130')) || 130)
const SINGLE_ASPECT = 1.317

if (OUT === ROOT || OUT.startsWith(ROOT + '/')) throw new Error(`输出目录必须在仓库外：${OUT}`)

function xmlDecode(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
function normalizeText(value) {
  return value.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().normalize('NFKC')
}
function wordsOf(value) {
  return normalizeText(value).split(' ').filter(Boolean)
}
function cleanDefinition(value) {
  return normalizeText(value).replace(/^[0-9]+[.、]\s*/, '')
}

function episodeFromPdf(name) {
  const match = name.match(/^(\d{3})\.\s*Dino Buddies\s+(\d+)\s*[-._]?\s*(.+)\.pdf$/i)
  if (!match) return undefined
  return { episode: Number(match[2]), title: normalizeText(match[3]) }
}
function episodeFromAudio(name) {
  const match = name.match(/^(\d{3})\.\s*Dino Buddies\s+(\d+)\s*[-._]?\s*(.+)\.mp3$/i)
  if (!match) return undefined
  return { episode: Number(match[2]), title: normalizeText(match[3]) }
}

async function mediaDuration(file) {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { timeout: 30_000 })
    const duration = Number(stdout.trim())
    return Number.isFinite(duration) && duration > 0 ? duration : undefined
  } catch {
    return undefined
  }
}

// 解析一页（或上下半页）的文字层。words 已经过坐标变换，region 是这一页
// 的实际宽高；页码是单独一行且靠近上/下边缘的数字，需要剔除。
function parsePageWords(lines, regionWidth, regionHeight) {
  const kept = []
  for (const line of lines) {
    const words = line.words.filter(word => normalizeText(word.text))
    if (!words.length) continue
    const only = words.length === 1 ? normalizeText(words[0].text) : ''
    if (/^\d{1,3}$/.test(only)) {
      const center = (line.yMin + line.yMax) / 2
      if (center < regionHeight * 0.15 || center > regionHeight * 0.85) continue
    }
    kept.push({ ...line, words })
  }
  kept.sort((left, right) => left.yMin - right.yMin || left.xMin - right.xMin)
  return kept
}

function buildFlow(lines, regionWidth, regionHeight) {
  const exact = []
  let text = ''
  for (const line of lines) {
    line.words.sort((left, right) => left.xMin - right.xMin)
    const gaps = []
    for (let index = 1; index < line.words.length; index++) {
      gaps.push(line.words[index].xMin - line.words[index - 1].xMax)
    }
    const singleLetters = line.words.filter(word => /^[A-Za-z]$/.test(normalizeText(word.text))).length
    const narrow = gaps.filter(gap => gap < 3).length
    const letterSpaced = singleLetters >= 3 && narrow >= 3 && singleLetters >= line.words.length * 0.25
    let lineText = ''
    const lineWords = []
    let previous = null
    for (const word of line.words) {
      const value = normalizeText(word.text)
      if (!value) continue
      if (previous && (!letterSpaced || word.xMin - previous.xMax >= 3)) lineText += ' '
      const start = lineText.length
      lineText += value
      lineWords.push({ word, start, end: lineText.length, line })
      previous = word
    }
    if (!lineText) continue
    const joinWithSpace = Boolean(text) && !text.endsWith('-')
    const offset = text.length + (joinWithSpace ? 1 : 0)
    if (joinWithSpace) text += ' '
    text += lineText
    for (const entry of lineWords) {
      exact.push({ ...entry, start: entry.start + offset, end: entry.end + offset })
    }
  }
  return { text, exact }
}

function sentenceRects(exact, start, end, regionWidth, regionHeight) {
  const overlapping = exact.filter(word => word.start < end && word.end > start)
  const rects = []
  for (const word of overlapping) {
    const last = rects[rects.length - 1]
    if (last && last.line === word.line) {
      last.xMin = Math.min(last.xMin, word.word.xMin)
      last.xMax = Math.max(last.xMax, word.word.xMax)
      last.yMin = Math.min(last.yMin, word.word.yMin)
      last.yMax = Math.max(last.yMax, word.word.yMax)
    } else {
      rects.push({
        line: word.line,
        xMin: word.word.xMin,
        yMin: word.word.yMin,
        xMax: word.word.xMax,
        yMax: word.word.yMax,
      })
    }
  }
  return rects.map(rect => [
    Number(clamp01(rect.xMin / regionWidth).toFixed(5)),
    Number(clamp01(rect.yMin / regionHeight).toFixed(5)),
    Number(clamp01((rect.xMax - rect.xMin) / regionWidth).toFixed(5)),
    Number(clamp01((rect.yMax - rect.yMin) / regionHeight).toFixed(5)),
  ])
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

function parseSentences(lines, regionWidth, regionHeight) {
  const { text, exact } = buildFlow(lines, regionWidth, regionHeight)
  if (!normalizeText(text)) return []
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  const raw = []
  for (const part of segmenter.segment(text)) {
    const segment = part.segment
    const trimmed = normalizeText(segment)
    if (!trimmed || !/[A-Za-z]/.test(trimmed)) continue
    const leading = segment.length - segment.trimStart().length
    const start = part.index + leading
    const end = start + trimmed.length
    const rects = sentenceRects(exact, start, end, regionWidth, regionHeight)
    if (!rects.length) continue
    raw.push({
      text: trimmed.replace(/([\p{L}][.,!?;:][”’"]?)(?=[\p{L}])/gu, '$1 '),
      side: 'both',
      rects,
    })
  }
  const terminal = value => /[.!?…][”’"]?$/.test(value.trim())
  const attribution = '(?:said|asked|cried|replied|continued|whispered|shouted|yelled|answered|added|laughed|thought|moaned|groaned|sighed)'
  const attributionPattern = new RegExp(`^(?:[A-Z][a-z’']+\\s+)?${attribution}\\b`, 'i')
  const merged = []
  for (const sentence of raw) {
    const previous = merged[merged.length - 1]
    const nextStartsLower = /^[a-z]/.test(sentence.text)
    const nextIsAttribution = attributionPattern.test(sentence.text)
    if (previous && (!terminal(previous.text) || nextStartsLower || (nextIsAttribution && /[”’"]$/.test(previous.text)))) {
      previous.text = normalizeText(`${previous.text} ${sentence.text}`)
      previous.rects.push(...sentence.rects)
      continue
    }
    merged.push({ ...sentence, rects: [...sentence.rects] })
  }
  return merged
}

// 一页跨页/故事页。lines 的坐标已经换算到这一页的局部坐标系。
function parseStoryPage(lines, width, height, pageIndex) {
  const sentences = parseSentences(lines, width, height)
  return {
    pageIndex,
    displayPage: String(pageIndex + 1),
    image: `pages/${String(pageIndex + 1).padStart(3, '0')}.jpg`,
    sentences: sentences.map((sentence, index) => ({
      id: `p${String(pageIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
      ...sentence,
    })),
  }
}

// 把一页 PDF 的 <line> 按上下半页拆开；下半页旋转 180° 后再换算坐标。
function splitPageLines(page, twoUp, scaleY = 1) {
  const width = page.width, height = page.height
  const half = height / 2
  const top = [], bottom = []
  const scaleLine = line => ({
    ...line,
    yMin: line.yMin * scaleY,
    yMax: line.yMax * scaleY,
    words: line.words.map(word => ({ ...word, yMin: word.yMin * scaleY, yMax: word.yMax * scaleY })),
  })
  for (const line of page.lines) {
    const center = (line.yMin + line.yMax) / 2
    if (!twoUp || center < half) {
      top.push(scaleY === 1 ? line : scaleLine(line))
    } else {
      bottom.push({
        ...line,
        xMin: width - line.xMax,
        xMax: width - line.xMin,
        yMin: height - line.yMax,
        yMax: height - line.yMin,
        words: line.words.map(word => ({
          ...word,
          xMin: width - word.xMax,
          xMax: width - word.xMin,
          yMin: height - word.yMax,
          yMax: height - word.yMin,
        })),
      })
    }
  }
  return { top, bottom, topHeight: twoUp ? half : height, bottomHeight: half }
}

function parsePdfPages(xml) {
  const pages = []
  for (const match of xml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)) {
    const width = Number(/\bwidth="([\d.]+)"/.exec(match[1])?.[1] ?? 0)
    const height = Number(/\bheight="([\d.]+)"/.exec(match[1])?.[1] ?? 0)
    const lines = []
    for (const lineMatch of match[2].matchAll(/<line\b([^>]*)>([\s\S]*?)<\/line>/g)) {
      const attrs = lineMatch[1]
      const words = []
      for (const wordMatch of lineMatch[2].matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/g)) {
        const wordAttrs = wordMatch[1]
        const text = xmlDecode(wordMatch[2])
        if (!text) continue
        words.push({
          text,
          xMin: Number(/\bxMin="([\d.]+)"/.exec(wordAttrs)?.[1] ?? 0),
          xMax: Number(/\bxMax="([\d.]+)"/.exec(wordAttrs)?.[1] ?? 0),
          yMin: Number(/\byMin="([\d.]+)"/.exec(wordAttrs)?.[1] ?? 0),
          yMax: Number(/\byMax="([\d.]+)"/.exec(wordAttrs)?.[1] ?? 0),
        })
      }
      if (!words.length) continue
      lines.push({
        xMin: Number(/\bxMin="([\d.]+)"/.exec(attrs)?.[1] ?? Math.min(...words.map(word => word.xMin))),
        xMax: Number(/\bxMax="([\d.]+)"/.exec(attrs)?.[1] ?? Math.max(...words.map(word => word.xMax))),
        yMin: Number(/\byMin="([\d.]+)"/.exec(attrs)?.[1] ?? Math.min(...words.map(word => word.yMin))),
        yMax: Number(/\byMax="([\d.]+)"/.exec(attrs)?.[1] ?? Math.max(...words.map(word => word.yMax))),
        words,
      })
    }
    pages.push({ width, height, lines })
  }
  return pages
}

// Dino Buddies 生词表：001.Dino Buddies 1-The Park / 1. dino  恐龙
// 词条可能把短语折成下一行（sat / down），例句也可能占多行。
function parseDinoVocabulary(text) {
  const episodes = new Map()
  let current = null
  let word = null
  let freshEntry = false
  const isCjk = value => /[㐀-鿿]/.test(value)
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim()) { freshEntry = false; continue }
    if (/^\s*\d+\s*\/\s*\d+\s*$/.test(line)) continue
    const header = line.match(/^\s*(?:\d{3}\.\s*)?Dino Buddies\s+(\d+)\s*[-.:]?\s*(.+?)\s*$/)
    if (header) {
      current = { episode: Number(header[1]), title: normalizeText(header[2]), words: [] }
      episodes.set(current.episode, current)
      word = null
      freshEntry = false
      continue
    }
    if (!current) continue
    const entry = line.match(/^\s*(\d+)\.\s+(.+?)\s{2,}(\S.*)$/)
    if (entry) {
      const candidate = normalizeText(entry[2])
      if (/^[A-Za-z][A-Za-z' .!?-]*$/.test(candidate) && candidate.length <= 40) {
        word = { word: candidate, definition: normalizeText(entry[3]), example: '' }
        current.words.push(word)
        freshEntry = true
        continue
      }
    }
    if (!word) continue
    if (freshEntry) {
      freshEntry = false
      const wrapped = line.match(/^\s{1,24}([A-Za-z][A-Za-z'’ .!?-]*?)(?:\s{2,}(\S.*))?$/)
      const fragment = wrapped?.[1]?.trim()
      if (fragment && /^[a-z][a-z'’.-]*(?:\s+[a-z][a-z'’.-]*){0,2}$/.test(fragment) && fragment.length <= 24) {
        word.word = normalizeText(`${word.word} ${fragment}`)
        const rest = wrapped[2] ? normalizeText(wrapped[2]) : ''
        if (rest) {
          if (isCjk(rest)) word.definition = normalizeText(`${word.definition} ${rest}`)
          else word.example = rest
        }
        continue
      }
    }
    freshEntry = false
    const trimmed = normalizeText(line.trim())
    if (!trimmed) continue
    if (isCjk(trimmed) || /^[（(=]/.test(trimmed)) {
      word.definition = normalizeText(`${word.definition} ${trimmed}`)
    } else {
      word.example = word.example ? `${word.example} ${trimmed}` : trimmed
    }
  }
  return episodes
}

async function renderPage(pdfPath, pageNumber, outBase, crop) {
  const args = ['-jpeg', '-r', String(DPI), '-jpegopt', 'quality=84', '-f', String(pageNumber), '-l', String(pageNumber), '-singlefile']
  if (crop) args.push('-x', String(crop.x), '-y', String(crop.y), '-W', String(crop.width), '-H', String(crop.height))
  await run('pdftoppm', [...args, pdfPath, outBase], { maxBuffer: 16 * 1024 * 1024 })
}

async function transformImage(file, transform) {
  if (!transform) return
  if (transform.rotate === 180 && !transform.height) {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', 'hflip,vflip', '-q:v', '3', `${file}.tmp.jpg`], { maxBuffer: 16 * 1024 * 1024 })
  } else if (transform.height) {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', `scale=${transform.width}:${transform.height}`, '-q:v', '3', `${file}.tmp.jpg`], { maxBuffer: 16 * 1024 * 1024 })
  } else {
    return
  }
  await rename(`${file}.tmp.jpg`, file)
}

async function main() {
  if (!existsSync(PDF_DIR)) throw new Error(`找不到绘本 PDF 目录：${PDF_DIR}`)
  if (!existsSync(AUDIO_DIR)) throw new Error(`找不到音频目录：${AUDIO_DIR}`)
  const pdfRows = []
  for (const name of await readdir(PDF_DIR)) {
    const parsed = episodeFromPdf(name)
    if (parsed) pdfRows.push({ ...parsed, file: join(PDF_DIR, name) })
  }
  pdfRows.sort((left, right) => left.episode - right.episode)
  const audioRows = []
  for (const name of await readdir(AUDIO_DIR)) {
    const parsed = episodeFromAudio(name)
    if (parsed) audioRows.push({ ...parsed, file: join(AUDIO_DIR, name) })
  }
  const audioByEpisode = new Map(audioRows.map(row => [row.episode, row]))
  const selected = pdfRows.filter(row => (ONLY.size ? ONLY.has(row.episode) : row.episode >= FROM)).slice(0, LIMIT || undefined)
  if (!selected.length) throw new Error('没有匹配到 Dino Buddies PDF。')

  const vocabEpisodes = existsSync(VOCAB_PDF)
    ? parseDinoVocabulary((await run('pdftotext', ['-layout', VOCAB_PDF, '-'], { maxBuffer: 32 * 1024 * 1024 })).stdout)
    : new Map()
  console.log(`准备 ${selected.length} 本 Dino Buddies${vocabEpisodes.size ? `，生词 ${vocabEpisodes.size} 集` : ''}…`)

  if (FORCE && existsSync(OUT)) await rm(OUT, { recursive: true, force: true })
  await mkdir(join(OUT, 'books'), { recursive: true })

  const prepared = []
  for (const [index, row] of selected.entries()) {
    const id = `dino-${String(row.episode).padStart(3, '0')}`
    const bookDir = join(OUT, 'books', id)
    const pageDir = join(bookDir, 'pages')
    const audioDir = join(bookDir, 'audio')
    await mkdir(pageDir, { recursive: true })
    await mkdir(audioDir, { recursive: true })

    const info = await run('pdfinfo', [row.file], { maxBuffer: 4 * 1024 * 1024 })
    const pageCount = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1] ?? 0)
    const sizeMatch = /^Page size:\s+([\d.]+) x ([\d.]+)/m.exec(info.stdout)
    if (!pageCount || !sizeMatch) throw new Error(`${basename(row.file)} 无法读取页数或页面尺寸。`)
    const pageWidth = Number(sizeMatch[1]), pageHeight = Number(sizeMatch[2])
    const twoUp = pageHeight > pageWidth * 1.2
    const squished = !twoUp && pageWidth / pageHeight > 2.2
    const targetHeight = squished ? pageWidth / SINGLE_ASPECT : pageHeight
    const scaleY = squished ? targetHeight / pageHeight : 1
    const widthPx = Math.round(pageWidth / 72 * DPI)
    const heightPx = Math.round(pageHeight / 72 * DPI)
    const targetHeightPx = Math.round(targetHeight / 72 * DPI)
    const halfPx = Math.floor(heightPx / 2)

    const xml = (await run('pdftotext', ['-bbox-layout', row.file, '-'], { maxBuffer: 32 * 1024 * 1024 })).stdout
    const pdfPages = parsePdfPages(xml)

    // 封面：横版取第 1 页整页；竖版两页一版取第 1 页上半页。
    const coverTemp = join(bookDir, '__cover')
    if (twoUp) {
      await renderPage(row.file, 1, coverTemp, { x: 0, y: 0, width: widthPx, height: halfPx - 4 })
    } else {
      await renderPage(row.file, 1, coverTemp, { x: 0, y: 0, width: widthPx, height: heightPx - 4 })
    }
    await transformImage(`${coverTemp}.jpg`, squished ? { width: widthPx, height: targetHeightPx } : undefined)
    await copyFile(`${coverTemp}.jpg`, join(bookDir, 'cover.jpg'))
    await copyFile(`${coverTemp}.jpg`, join(bookDir, 'art.jpg'))
    await rm(`${coverTemp}.jpg`, { force: true })

    const storyPages = []
    for (let pdfPage = 2; pdfPage <= pageCount; pdfPage++) {
      const page = pdfPages[pdfPage - 1]
      if (!page) continue
      const split = splitPageLines(page, twoUp, squished ? scaleY : 1)
      const halves = twoUp
        ? [{ lines: split.top, width: pageWidth, height: pageHeight / 2, crop: { x: 0, y: 0, width: widthPx, height: halfPx - 4 }, transform: null }]
        : [{ lines: split.top, width: pageWidth, height: targetHeight, crop: { x: 0, y: 0, width: widthPx, height: heightPx - 4 }, transform: squished ? { width: widthPx, height: targetHeightPx } : null }]
      if (twoUp) {
        halves.push({
          lines: split.bottom,
          width: pageWidth,
          height: pageHeight / 2,
          crop: { x: 0, y: halfPx + 4, width: widthPx, height: heightPx - halfPx - 8 },
          transform: { rotate: 180 },
        })
      }
      for (const half of halves) {
        const lines = parsePageWords(half.lines, half.width, half.height)
        if (!lines.length) continue
        const flat = lines.map(line => line.words.map(word => normalizeText(word.text)).join(' ')).join(' ')
        if (/copyright|all rights reserved/i.test(flat)) continue
        const storyIndex = storyPages.length
        const parsed = parseStoryPage(lines, half.width, half.height, storyIndex)
        if (!parsed.sentences.length) continue
        const pageFile = join(pageDir, `${String(storyIndex + 1).padStart(3, '0')}.jpg`)
        const pageTemp = join(bookDir, `__page-${storyIndex + 1}`)
        await renderPage(row.file, pdfPage, pageTemp, half.crop)
        await transformImage(`${pageTemp}.jpg`, half.transform)
        await rename(`${pageTemp}.jpg`, pageFile)
        storyPages.push(parsed)
      }
    }
    if (!storyPages.length) throw new Error(`${basename(row.file)} 没有解析到故事页。`)

    // 跨页残句接到下一页首句；句子 id 在合并后重新编号。
    for (let pageIndex = 0; pageIndex < storyPages.length - 1; pageIndex++) {
      const last = storyPages[pageIndex].sentences[storyPages[pageIndex].sentences.length - 1]
      const first = storyPages[pageIndex + 1].sentences[0]
      if (!last || !first) continue
      if (!/[.!?…][”’"]?$/.test(last.text.trim()) || /^[a-z]/.test(first.text.trim())) {
        const joiner = last.text.endsWith('-') ? '' : ' '
        first.text = normalizeText(`${last.text}${joiner}${first.text}`)
        first.continuedFrom = storyPages[pageIndex].displayPage
        storyPages[pageIndex].sentences.pop()
      }
    }
    for (const page of storyPages) {
      page.sentences = page.sentences.map((sentence, index) => ({
        ...sentence,
        id: `p${String(page.pageIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
      }))
    }

    const audio = audioByEpisode.get(row.episode)
    if (!audio) throw new Error(`第 ${row.episode} 集缺少 MP3。`)
    const audioTarget = join(audioDir, 'episode.mp3')
    try { await link(audio.file, audioTarget) } catch { await copyFile(audio.file, audioTarget) }
    const duration = await mediaDuration(audio.file)
    const vocabulary = (vocabEpisodes.get(row.episode)?.words ?? []).map(entry => ({
      word: entry.word,
      definition: cleanDefinition(entry.definition),
      example: entry.example,
    }))
    const wordCount = storyPages.reduce((sum, page) => sum + page.sentences.reduce((count, sentence) => count + wordsOf(sentence.text).length, 0), 0)

    const manifest = {
      schemaVersion: 1,
      bookId: id,
      title: row.title,
      series: 'Dino Buddies',
      episode: row.episode,
      level: 'beginner',
      levelLabel: 'Level 1',
      themes: ['动物', '友情', '冒险'],
      audio: 'audio/episode.mp3',
      audioDuration: duration,
      cover: 'cover.jpg',
      art: 'art.jpg',
      pages: storyPages,
      vocabulary,
      wordCount,
    }
    await writeFile(join(bookDir, 'book.json'), JSON.stringify(manifest) + '\n')
    prepared.push({ id, manifest, wordCount, duration, episode: row.episode, title: row.title })
    console.log(`  ${String(index + 1).padStart(3, ' ')}/${selected.length} ${id} · ${row.title} · ${storyPages.length} 页 · ${storyPages.reduce((sum, page) => sum + page.sentences.length, 0)} 句 · ${vocabulary.length} 个生词${twoUp ? ' · 两页一版' : squished ? ' · 纵向还原' : ''}`)
  }

  const books = prepared.map(row => ({
    id: row.id,
    title: row.title,
    episode: row.episode,
    series: 'Dino Buddies',
    level: row.manifest.level,
    levelLabel: row.manifest.levelLabel,
    themes: row.manifest.themes,
    cover: `books/${row.id}/cover.jpg`,
    art: `books/${row.id}/art.jpg`,
    manifest: `books/${row.id}/book.json`,
    pages: row.manifest.pages.length,
    vocabulary: row.manifest.vocabulary.length,
    quiz: 0,
    wordCount: row.wordCount,
    minutes: row.duration ? Math.max(1, Math.round(row.duration / 60)) : undefined,
    audioDuration: row.duration,
  }))
  await writeFile(join(OUT, 'picture-books.json'), JSON.stringify({ books }, null, 2) + '\n')
  console.log(`\n已生成：${OUT}`)
  console.log(`Dino Buddies ${books.length} 本。音频和原版页面只保存在本机。`)
  const missingAudio = pdfRows.filter(row => !audioByEpisode.has(row.episode))
  if (missingAudio.length) console.log(`注意：${missingAudio.length} 集缺少 MP3。`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
