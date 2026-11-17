#!/usr/bin/env node
// 把 Tire Town School 的 PDF、MP3 和生词 PDF 整理成绘本阅读器数据。
//
// 资源只保存在仓库外（默认 ~/Downloads/tire-town-school-reader）：
//   picture-books.json
//   books/tire-001/book.json
//   books/tire-001/cover.jpg / art.jpg
//   books/tire-001/pages/001.jpg…
//   books/tire-001/audio/episode.mp3
//
// 这批 PDF 都是 595×420 横版，一页一个故事页：
//   016 页版本：1 封面 / 2 空白 / 3–13 故事 / 空白页 / 末页版权
//   012 页版本：1 封面 / 2–11 故事 / 12 版权
// 句子文本和坐标来自 PDF 文字层；不生成、不伪造音频，也不写时间戳。
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, link, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
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

const PDF_DIR = resolve(option('pdf-dir', join(homedir(), 'Downloads', 'Tire Town School 电子书')))
const AUDIO_DIR = resolve(option('audio-dir', join(homedir(), 'Downloads', 'Tire Town School 音频')))
const VOCAB_PDF = resolve(option('vocab', join(homedir(), 'Downloads', 'Tire Town School 词汇', 'Tire Town School 133页词汇中英文对照表.pdf')))
const OUT = resolve(option('out', join(homedir(), 'Downloads', 'tire-town-school-reader')))
const FROM = Math.max(1, Number(option('from', '1')) || 1)
const LIMIT = Math.max(0, Number(option('limit', '0')) || 0)
const ONLY = new Set(option('only', '').split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0))
const FORCE = flag('force')
const DPI = Math.max(96, Number(option('dpi', '160')) || 160)

if (OUT === ROOT || OUT.startsWith(ROOT + '/')) throw new Error(`输出目录必须在仓库外：${OUT}`)

function xmlDecode(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
function normalizeText(value) {
  return value.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().normalize('NFKC')
}
function wordsOf(value) {
  return normalizeText(value).split(' ').filter(Boolean)
}
function cleanDefinition(value) {
  return normalizeText(value)
    .replace(/^[0-9]+[.、]\s*/, '')
    .replace(/\s+([，。；：、！？）])/g, '$1')
}

function episodeFromPdf(name) {
  const match = name.match(/^【Tire Town School】\s*(\d+)\s+(.+)\.pdf$/i)
  if (!match) return undefined
  return { episode: Number(match[1]), title: normalizeText(match[2]) }
}
function episodeFromAudio(name) {
  const match = name.match(/^【Tire Town School】\s*(\d+)\s+(.+)\.mp3$/i)
  if (!match) return undefined
  return { episode: Number(match[1]), title: normalizeText(match[2]) }
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

// 解析一页的文字层。页码是单独一行且靠近页面边缘的数字，需要剔除。
function parsePageWords(lines, regionHeight) {
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

function buildFlow(lines) {
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
  const { text, exact } = buildFlow(lines)
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
  // “Mr. Grill”“Ms. Fender”这类称谓不能当成句末：Intl.Segmenter 会在缩写点后断句，
  // 拆出来的 “Grill.” 还会分到单独的时间戳和高亮框。
  const abbreviation = /(?:^|[\s“”‘’"'(])(?:Mr|Ms|Mrs|Dr|St)\.$/
  const attribution = '(?:said|asked|cried|replied|continued|whispered|shouted|yelled|answered|added|laughed|thought|moaned|groaned|sighed)'
  const attributionPattern = new RegExp(`^(?:[A-Z][a-z’']+\\s+)?${attribution}\\b`, 'i')
  const merged = []
  for (const sentence of raw) {
    const previous = merged[merged.length - 1]
    const nextStartsLower = /^[a-z]/.test(sentence.text)
    const nextIsAttribution = attributionPattern.test(sentence.text)
    if (previous && (!terminal(previous.text) || abbreviation.test(previous.text) || nextStartsLower || (nextIsAttribution && /[”’"]$/.test(previous.text)))) {
      previous.text = normalizeText(`${previous.text} ${sentence.text}`)
      previous.rects.push(...sentence.rects)
      continue
    }
    merged.push({ ...sentence, rects: [...sentence.rects] })
  }
  return merged
}

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

// Tire Town School 生词表：Tire Town School 1: Eddy's First Day / 1. tire  轮胎
// 定义列和例句列缩进较深，词条可能折行（dump + truck、have something to + do），
// 定义也可能折行；表单页眉行首可能带换页符，需先去掉再计算缩进。
const DEFINITION_CHAR = /[\u2e80-\u2fdf\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/
const WORD_SHAPE = /^[A-Za-z][A-Za-z'’.,!? -]*$/
const FRAGMENT_SHAPE = /^[a-z][a-z'’.,!? -]*$/

function parseTireTownVocabulary(text) {
  const episodes = new Map()
  let current = null
  let word = null
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\f/g, '').replace(/\s+$/, '')
    if (!line.trim()) continue
    if (/^\s*\d+\s*\/\s*\d+\s*$/.test(line)) continue
    const header = line.match(/^\s*(?:\d{3}\.\s*)?Tire Town School\s+(\d+)\s*[:.]\s*(.+?)\s*$/)
    if (header) {
      current = { episode: Number(header[1]), title: normalizeText(header[2]), words: [] }
      episodes.set(current.episode, current)
      word = null
      continue
    }
    if (!current) continue
    const lead = line.length - line.trimStart().length
    // 保留行内多个空格用于分列；normalizeText 会把它们压成一个空格。
    const raw = line.trim()
    const trimmed = normalizeText(line)
    const entry = raw.match(/^(\d+)\.\s+(.+)$/)
    if (entry && lead === 0) {
      const rest = entry[2]
      const split = rest.match(/^(.+?)\s{2,}(\S.*)$/)
      let candidate = split ? normalizeText(split[1]) : ''
      let tail = split ? normalizeText(split[2]) : ''
      if (!candidate) {
        // 长词和释义之间只有一个空格：从第一个汉字/中文标点处切开。
        const at = rest.search(DEFINITION_CHAR)
        candidate = normalizeText(at > 0 ? rest.slice(0, at) : rest)
        tail = at > 0 ? normalizeText(rest.slice(at)) : ''
      }
      candidate = normalizeText(candidate.replace(/\s*\d+[.、]\s*$/, ''))
      if (!WORD_SHAPE.test(candidate) || candidate.length > 40) { word = null; continue }
      word = { word: candidate, definition: '', example: '' }
      current.words.push(word)
      if (tail) {
        if (DEFINITION_CHAR.test(tail)) word.definition = tail
        else word.example = tail
      }
      continue
    }
    if (!word) continue
    if (lead < 10) {
      const split = raw.match(/^(.+?)\s{2,}(\S.*)$/)
      const fragment = normalizeText(split ? split[1] : raw)
      const rest = split ? normalizeText(split[2]) : ''
      if (FRAGMENT_SHAPE.test(fragment) && fragment.length <= 24) {
        word.word = normalizeText(`${word.word} ${fragment}`)
        if (rest) {
          if (DEFINITION_CHAR.test(rest)) word.definition = normalizeText(`${word.definition} ${rest}`)
          else word.example = normalizeText(`${word.example} ${rest}`)
        }
        continue
      }
    }
    if (DEFINITION_CHAR.test(trimmed)) word.definition = normalizeText(`${word.definition} ${trimmed}`)
    else word.example = normalizeText(`${word.example} ${trimmed}`)
  }
  return episodes
}

async function renderPage(pdfPath, pageNumber, outBase) {
  const pageArgs = ['-jpeg', '-r', String(DPI), '-jpegopt', 'quality=84', '-f', String(pageNumber), '-l', String(pageNumber), '-singlefile']
  await run('pdftoppm', [...pageArgs, pdfPath, outBase], { maxBuffer: 16 * 1024 * 1024 })
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
  if (!selected.length) throw new Error('没有匹配到 Tire Town School PDF。')

  const vocabEpisodes = existsSync(VOCAB_PDF)
    ? parseTireTownVocabulary((await run('pdftotext', ['-layout', VOCAB_PDF, '-'], { maxBuffer: 32 * 1024 * 1024 })).stdout)
    : new Map()
  console.log(`准备 ${selected.length} 本 Tire Town School${vocabEpisodes.size ? `，生词 ${vocabEpisodes.size} 集` : ''}…`)

  if (FORCE && existsSync(OUT)) await rm(OUT, { recursive: true, force: true })
  await mkdir(join(OUT, 'books'), { recursive: true })

  const prepared = []
  for (const [index, row] of selected.entries()) {
    const id = `tire-${String(row.episode).padStart(3, '0')}`
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
    if (pageWidth <= pageHeight) throw new Error(`${basename(row.file)} 不是预期中的横版页面。`)

    const xml = (await run('pdftotext', ['-bbox-layout', row.file, '-'], { maxBuffer: 32 * 1024 * 1024 })).stdout
    const pdfPages = parsePdfPages(xml)

    // 封面：第 1 页整页。
    const coverTemp = join(bookDir, '__cover')
    await renderPage(row.file, 1, coverTemp)
    await copyFile(`${coverTemp}.jpg`, join(bookDir, 'cover.jpg'))
    await copyFile(`${coverTemp}.jpg`, join(bookDir, 'art.jpg'))
    await rm(`${coverTemp}.jpg`, { force: true })

    const storyPages = []
    for (let pdfPage = 2; pdfPage <= pageCount; pdfPage++) {
      const page = pdfPages[pdfPage - 1]
      if (!page) continue
      const lines = parsePageWords(page.lines, pageHeight)
      if (!lines.length) continue
      const flat = lines.map(line => line.words.map(word => normalizeText(word.text)).join(' ')).join(' ')
      if (/copyright|all rights reserved/i.test(flat)) continue
      const parsed = parseStoryPage(lines, pageWidth, pageHeight, storyPages.length)
      if (!parsed.sentences.length) continue
      const pageFile = join(pageDir, `${String(storyPages.length + 1).padStart(3, '0')}.jpg`)
      const pageTemp = join(bookDir, `__page-${storyPages.length + 1}`)
      await renderPage(row.file, pdfPage, pageTemp)
      await rename(`${pageTemp}.jpg`, pageFile)
      storyPages.push(parsed)
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
      series: 'Tire Town School',
      episode: row.episode,
      level: 'beginner',
      levelLabel: 'Level 1',
      themes: ['汽车', '学校', '友情'],
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
    console.log(`  ${String(index + 1).padStart(3, ' ')}/${selected.length} ${id} · ${row.title} · ${storyPages.length} 页 · ${storyPages.reduce((sum, page) => sum + page.sentences.length, 0)} 句 · ${vocabulary.length} 个生词`)
  }

  const books = prepared.map(row => ({
    id: row.id,
    title: row.title,
    episode: row.episode,
    series: 'Tire Town School',
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
  console.log(`Tire Town School ${books.length} 本。音频和原版页面只保存在本机。`)
  const missingAudio = pdfRows.filter(row => !audioByEpisode.has(row.episode))
  if (missingAudio.length) console.log(`注意：${missingAudio.length} 集缺少 MP3。`)
  const missingVocab = pdfRows.filter(row => !vocabEpisodes.has(row.episode))
  if (missingVocab.length) console.log(`注意：${missingVocab.length} 集缺少生词。`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
