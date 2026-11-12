#!/usr/bin/env node
// 把 Journey to the West 的 PDF、MP3 和生词 PDF 整理成绘本阅读器数据。
//
// 生成物只保存在仓库外（默认 ~/Downloads/journey-to-the-west-reader）：
//   picture-books.json                      绘本馆目录
//   books/<id>/book.json                    单本清单
//   books/<id>/cover.jpg                    右侧单封面（书架、搜索使用）
//   books/<id>/art.jpg                      完整封底+封面跨页（横版卡片使用）
//   books/<id>/pages/001.jpg…               原版跨页图
//   books/<id>/audio/episode.mp3            整集原声（优先硬链接，不复制内容）
//
// 句子文本和坐标来自 PDF 文字层。本脚本不生成逐句时间戳；
// 需要时再运行 tools/sync-picture-audio.mjs，用 whisper.cpp 的转写
// 与这里的文字做对齐，并对通过校验的句子写入 start/end。
//
// 依赖：pdftotext / pdftoppm / pdfinfo（poppler）、ffprobe（ffmpeg）。
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
function flag(name) {
  return args.includes(`--${name}`)
}

const PDF_DIR = resolve(option('pdf-dir', join(homedir(), 'Downloads', '03、绘本可打印')))
const AUDIO_DIR = resolve(option('audio-dir', join(homedir(), 'Downloads', '02、音频MP3')))
const VOCAB_PDF = resolve(option('vocab', join(homedir(), 'Downloads', 'Journey to the West 生词.pdf')))
const OUT = resolve(option('out', join(homedir(), 'Downloads', 'journey-to-the-west-reader')))
const LIMIT = Number(option('limit', '0'))
const FROM = Math.max(1, Number(option('from', '1')))
const FORCE = flag('force')
const QUIZZES = option('quizzes', '')

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

// 每一页是一张左右合订的跨页。文字层按列读取，先按 x 分成左右两栏，
// 再按 y 合并同一行，最后把整栏文字切成句子。句子坐标取所在行的并集。
export function parseStoryPage(pageXml, pageIndex) {
  const pageMatch = pageXml.match(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/)
  if (!pageMatch) return { sentences: [], width: 0, height: 0 }
  const width = Number(pageMatch[1]), height = Number(pageMatch[2])
  const body = pageMatch[3]
  const rawWords = []
  for (const line of body.matchAll(/<line\b([^>]*)>([\s\S]*?)<\/line>/g)) {
    const attrs = line[1]
    const xMin = Number(/\bxMin="([\d.]+)"/.exec(attrs)?.[1] ?? 0)
    const yMin = Number(/\byMin="([\d.]+)"/.exec(attrs)?.[1] ?? 0)
    const yMax = Number(/\byMax="([\d.]+)"/.exec(attrs)?.[1] ?? 0)
    let x = xMin
    for (const word of line[2].matchAll(/<word\b[^>]*>([\s\S]*?)<\/word>/g)) {
      const text = xmlDecode(word[1])
      if (!text) continue
      const wordX = Number(/\bxMin="([\d.]+)"/.exec(word[0])?.[1] ?? x)
      const wordMax = Number(/\bxMax="([\d.]+)"/.exec(word[0])?.[1] ?? wordX)
      rawWords.push({ text, xMin: wordX, xMax: wordMax, yMin, yMax })
      x = wordMax
    }
  }
  if (!rawWords.length) return { sentences: [], width, height }

  // 去掉页脚页码。正文页的页码是底部居中的 1～3 位数字。
  const content = rawWords.filter(word => {
    if (!/^\d{1,3}$/.test(word.text)) return true
    return word.yMax < height * 0.9
  })

  // 大字号首字母（Drop cap）和后面的剩余字母不在同一个文字块里。
  // 例如 "F" + "rom" 需要合并成 "From"；“I know” 这种独立单词则只把
  // 首字母挪到第一行，保留词间空格。
  for (let index = 0; index < content.length; index++) {
    const word = content[index]
    if (!/^[A-Z]$/.test(word.text) || word.yMax - word.yMin < 18) continue
    const wordHeight = word.yMax - word.yMin
    const center = (word.yMin + word.yMax) / 2
    const sameSide = (left, right) => ((left.xMin + left.xMax) / 2 < width / 2) === ((right.xMin + right.xMax) / 2 < width / 2)
    const candidates = content
      .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
      .filter(({ candidate, candidateIndex }) => candidateIndex !== index && candidate.xMin >= word.xMax - 1 && sameSide(candidate, word) && Math.abs((candidate.yMin + candidate.yMax) / 2 - center) < wordHeight * 0.55)
      // 首字母后的剩余字母一定在最高的那一行，不能选到下一行的行首。
      .sort((left, right) => left.candidate.yMin - right.candidate.yMin || left.candidate.xMin - right.candidate.xMin)
    const next = candidates[0]
    if (!next) continue
    const lineHeight = next.candidate.yMax - next.candidate.yMin
    // 只有首字母明显大于后续文字时才按 Drop cap 处理；普通的 “A voice”
    // 和 “I will” 必须保留原样。
    if (wordHeight < lineHeight * 1.18) continue
    if (/^[a-z’']/.test(next.candidate.text) && next.candidate.xMin - word.xMax <= Math.max(1.5, lineHeight * 0.18)) {
      next.candidate.text = word.text + next.candidate.text
      next.candidate.xMin = word.xMin
      // 行分组仍使用候选词原来的 y 坐标；首字母只扩大热区高度，
      // 否则大字号 Drop cap 会把 “One-Horned” 拉到下一行。
      next.candidate.rectYMin = Math.min(next.candidate.yMin, word.yMin)
      next.candidate.rectYMax = Math.max(next.candidate.yMax, word.yMax)
      content.splice(index, 1)
      index--
    } else {
      // “I know…”：首字母本身是完整单词，只把排版位置移到第一行。
      word.rectYMin = Math.min(word.yMin, next.candidate.yMin)
      word.rectYMax = Math.max(word.yMax, next.candidate.yMax)
      word.yMin = next.candidate.yMin
      word.yMax = next.candidate.yMax
    }
  }

  // 一页跨页的阅读顺序是左栏接右栏。句子可以跨栏，所以先把两栏接成
  // 一条完整文字流再分句，最后按词坐标把句子映射回左右两栏。
  const flows = []
  for (const side of ['left', 'right']) {
    const column = content.filter(word => ((word.xMin + word.xMax) / 2 < width / 2) === (side === 'left'))
    if (!column.length) continue
    // 按 y 聚成行；同一行按 x 排序。
    const lines = []
    for (const word of column.sort((left, right) => left.yMin - right.yMin || left.xMin - right.xMin)) {
      const line = lines.find(row => Math.abs(row.yMin - word.yMin) < 5 || Math.abs(row.yMax - word.yMax) < 5)
      if (line) line.words.push(word)
      else lines.push({ yMin: word.yMin, yMax: word.yMax, words: [word] })
    }
    lines.sort((left, right) => left.yMin - right.yMin)
    let text = ''
    const exact = []
    for (const line of lines) {
      line.words.sort((left, right) => left.xMin - right.xMin)
      const gaps = []
      for (let index = 1; index < line.words.length; index++) {
        gaps.push(line.words[index].xMin - line.words[index - 1].xMax)
      }
      // 部分页面的文字层给整句加了字距，每个字母都成了独立的 <word>，
      // 例如 “O n l y”。这种行的相邻字母间隙约 1.7–2.3，而词间距约 9–11。
      // 普通行里偶尔也会出现 2.1–3.1 的窄空格，所以只在“单字母词很多、
      // 窄间隙也很多”的行里按字距拼接；其余行仍按词边界补空格。
      const singleLetters = line.words.filter(word => /^[A-Za-z]$/.test(word.text)).length
      const narrow = gaps.filter(gap => gap < 3).length
      const letterSpaced = singleLetters >= 3 && narrow >= 3 && singleLetters >= line.words.length * 0.25
      let lineText = ''
      const lineWords = []
      let previous = null
      for (const word of line.words) {
        if (previous && (!letterSpaced || word.xMin - previous.xMax >= 3)) lineText += ' '
        const start = lineText.length
        lineText += word.text
        lineWords.push({ word, start, end: lineText.length, line })
        previous = word
      }
      if (!lineText) continue
      // 行末连字符是跨行拆词（“One-” / “Horned”），直接拼接，不再补空格。
      const joinWithSpace = Boolean(text) && !text.endsWith('-')
      const offset = text.length + (joinWithSpace ? 1 : 0)
      if (joinWithSpace) text += ' '
      text += lineText
      for (const entry of lineWords) {
        exact.push({
          start: entry.start + offset,
          end: entry.end + offset,
          xMin: entry.word.xMin,
          yMin: entry.word.rectYMin ?? entry.word.yMin,
          xMax: entry.word.xMax,
          yMax: entry.word.rectYMax ?? entry.word.yMax,
          line: entry.line,
          side,
        })
      }
    }
    if (normalizeText(text)) flows.push({ side, text, exact })
  }
  if (!flows.length) return { sentences: [], width, height }

  let flowText = ''
  const exact = []
  for (const flow of flows) {
    const joinWithSpace = Boolean(flowText) && !flowText.endsWith('-')
    const offset = flowText.length + (joinWithSpace ? 1 : 0)
    for (const word of flow.exact) exact.push({ ...word, start: word.start + offset, end: word.end + offset })
    flowText += (joinWithSpace ? ' ' : '') + flow.text
  }

  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  const rawSentences = []
  for (const part of segmenter.segment(flowText)) {
    const raw = part.segment
    const trimmed = normalizeText(raw)
    if (!trimmed || !/[A-Za-z]/.test(trimmed)) continue
    const leading = raw.length - raw.trimStart().length
    const start = part.index + leading
    const end = start + trimmed.length
    const overlapping = exact.filter(word => word.start < end && word.end > start)
    if (!overlapping.length) continue
    const rects = []
    for (const word of overlapping) {
      const last = rects[rects.length - 1]
      if (last && last.line === word.line) {
        last.xMin = Math.min(last.xMin, word.xMin)
        last.xMax = Math.max(last.xMax, word.xMax)
        last.yMin = Math.min(last.yMin, word.yMin)
        last.yMax = Math.max(last.yMax, word.yMax)
      } else {
        rects.push({ line: word.line, xMin: word.xMin, yMin: word.yMin, xMax: word.xMax, yMax: word.yMax })
      }
    }
    rawSentences.push({
      // 文字层偶尔把标点后的空格吞进同一个 <word>（correctly,”said），
      // 句子文本补回空格；坐标仍按原词框计算。
      text: trimmed.replace(/([\p{L}][.,!?;:][”’"]?)(?=[\p{L}])/gu, '$1 '),
      side: overlapping[0].side,
      rects: rects.map(rect => [
        Number((rect.xMin / width).toFixed(5)),
        Number((rect.yMin / height).toFixed(5)),
        Number(((rect.xMax - rect.xMin) / width).toFixed(5)),
        Number(((rect.yMax - rect.yMin) / height).toFixed(5)),
      ]),
    })
  }

  // 分句器会把 “Well?” said the emperor. 拆成两段，也会在跨栏处留下
  // 没有结束标点的片段。把这类片段并回前一句，避免阅读器出现孤立单词。
  const terminal = value => /[.!?…][”’"]?$/.test(value.trim())
  const merged = []
  for (const sentence of rawSentences) {
    const previous = merged[merged.length - 1]
    const nextStartsLower = /^[a-z]/.test(sentence.text)
    const nextIsAttribution = /^(said|asked|cried|replied|continued|whispered|shouted|answered|added|laughed)\b/i.test(sentence.text)
    if (previous && (!terminal(previous.text) || nextStartsLower || (nextIsAttribution && /[”’"]$/.test(previous.text)))) {
      previous.text = normalizeText(`${previous.text} ${sentence.text}`)
      previous.rects.push(...sentence.rects)
      continue
    }
    merged.push({ ...sentence, rects: [...sentence.rects] })
  }
  return {
    sentences: merged.map((sentence, index) => ({
      id: `p${String(pageIndex).padStart(2, '0')}-${sentence.side[0]}-${String(index + 1).padStart(2, '0')}`,
      ...sentence,
    })),
    width,
    height,
  }
}

export function parseVocabulary(text) {
  const episodes = new Map()
  let current = null
  let word = null
  let freshEntry = false
  const isCjk = value => /[㐀-鿿]/.test(value)
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim()) {
      freshEntry = false
      continue
    }
    if (/^\s*\d+\s*\/\s*266\s*$/.test(line)) continue
    const header = line.match(/^\s*Journey to the West\s+(\d+)\s*:\s*(.+?)\s*$/)
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
      if (/^[A-Za-z][A-Za-z' .-]*$/.test(candidate) && candidate.length <= 32) {
        word = { word: candidate, definition: normalizeText(entry[3]), example: '' }
        current.words.push(word)
        freshEntry = true
        continue
      }
    }
    if (!word) continue
    // PDF 的词条列较窄，较长的短语会把最后一个词折到下一行，
    // 例如 “fold one's” + “arms”。这种续行只有两个词，第二个
    // 才是释义或例句，不能当成例句拼进上一行。
    if (freshEntry) {
      freshEntry = false
      const wrapped = line.match(/^\s{1,24}([A-Za-z][A-Za-z'’ .!?,;-]*?)(?:\s{2,}(\S.*))?$/)
      const fragment = wrapped?.[1].trim()
      if (fragment && /^[a-z]/.test(fragment) && fragment.length <= 24) {
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
    const particle = trimmed.match(/^(down|up|out|off|away|on|in|over)\s+(?=[A-Z“"])/)
    if (particle && !word.word.includes(' ')) {
      word.word = `${word.word} ${particle[1]}`
      word.example = normalizeText(trimmed.slice(particle[0].length))
      continue
    }
    if (isCjk(trimmed)) {
      word.definition = normalizeText(`${word.definition} ${trimmed}`)
    } else {
      word.example = word.example ? `${word.example} ${trimmed}` : trimmed
    }
  }
  return episodes
}

function cleanDefinition(value) {
  return normalizeText(value).replace(/^[0-9]+[.、]\s*/, '')
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

function episodeFromPdf(name) {
  const match = name.match(/^(\d{3})\.\s*Journey to the West\s+\d+\s*-\s*(.+)\.pdf$/i)
  if (!match) return undefined
  return { episode: Number(match[1]), title: normalizeText(match[2]) }
}
function episodeFromAudio(name) {
  const match = name.match(/^第(\d{3})集\s+(.+?)(?:\s*\[[^\]]*\])?\.mp3$/i)
  if (!match) return undefined
  return { episode: Number(match[1]), title: normalizeText(match[2]) }
}

// 封面统一标注 Little Fox Level 5。难度和主题属于整套作品，
// 不按单集词量或标题关键词给每一集重新分级。
const SERIES_LEVEL = { level: 'intermediate', levelLabel: 'Level 5' }
const SERIES_THEMES = ['神话', '冒险']

async function main() {
  if (!existsSync(PDF_DIR)) throw new Error(`找不到绘本 PDF 目录：${PDF_DIR}`)
  if (!existsSync(AUDIO_DIR)) throw new Error(`找不到音频目录：${AUDIO_DIR}`)
  const pdfFiles = (await readdir(PDF_DIR)).map(episodeFromPdf).filter(Boolean).sort((left, right) => left.episode - right.episode)
  const audioFiles = (await readdir(AUDIO_DIR)).map(name => ({ ...episodeFromAudio(name), file: join(AUDIO_DIR, name) })).filter(row => row.episode).sort((left, right) => left.episode - right.episode)
  const audioByEpisode = new Map(audioFiles.map(row => [row.episode, row]))
  const selected = pdfFiles.filter(row => row.episode >= FROM).slice(0, LIMIT > 0 ? LIMIT : undefined)
  if (!selected.length) throw new Error('没有匹配到绘本 PDF。')

  const vocabEpisodes = existsSync(VOCAB_PDF)
    ? parseVocabulary((await run('pdftotext', ['-layout', VOCAB_PDF, '-'], { maxBuffer: 32 * 1024 * 1024 })).stdout)
    : new Map()
  const quizzes = QUIZZES && existsSync(QUIZZES) ? JSON.parse(await readFile(QUIZZES, 'utf8')) : {}
  console.log(`准备 ${selected.length} 本绘本${vocabEpisodes.size ? `，生词 ${vocabEpisodes.size} 集` : ''}…`)

  if (FORCE && existsSync(OUT)) await rm(OUT, { recursive: true, force: true })
  await mkdir(join(OUT, 'books'), { recursive: true })

  const prepared = []
  for (const [index, pdf] of selected.entries()) {
    const id = `jtw-${String(pdf.episode).padStart(3, '0')}`
    const bookDir = join(OUT, 'books', id)
    const pageDir = join(bookDir, 'pages')
    const audioDir = join(bookDir, 'audio')
    await mkdir(pageDir, { recursive: true })
    await mkdir(audioDir, { recursive: true })
    const pdfPath = join(PDF_DIR, (await readdir(PDF_DIR)).find(name => episodeFromPdf(name)?.episode === pdf.episode))
    const tmp = join(bookDir, '__render')
    await mkdir(tmp, { recursive: true })

    // 封面和第 2 页之后的正文跨页分开渲染。
    // 第 1 页是“封底 + 封面”横向拼版；只保留右侧封面，书架和卡片才不会出现两张小图。
    const info = await run('pdfinfo', [pdfPath], { maxBuffer: 4 * 1024 * 1024 })
    const pageCount = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1] ?? 0)
    if (!pageCount || pageCount < 2) throw new Error(`${basename(pdfPath)} 没有正文页。`)
    const pageSize = /^Page size:\s+([\d.]+) x ([\d.]+)/m.exec(info.stdout)
    // 第 1 页同时产出两张图：
    // art.jpg 是完整“封底 + 封面”跨页，用于绘本馆的横版卡片；
    // cover.jpg 只保留右侧封面，用于书架、搜索等竖版位置。
    const baseArgs = ['-jpeg', '-r', '130', '-jpegopt', 'quality=84', '-f', '1', '-l', '1', '-singlefile']
    await run('pdftoppm', [...baseArgs, pdfPath, join(bookDir, 'art')], { maxBuffer: 8 * 1024 * 1024 })
    if (pageSize && Number(pageSize[1]) > Number(pageSize[2]) * 1.2) {
      const width = Math.round(Number(pageSize[1]) / 72 * 130)
      const height = Math.round(Number(pageSize[2]) / 72 * 130)
      const left = Math.floor(width / 2)
      await run('pdftoppm', [...baseArgs, '-x', String(left), '-y', '0', '-W', String(width - left), '-H', String(height), pdfPath, join(bookDir, 'cover')], { maxBuffer: 8 * 1024 * 1024 })
    } else {
      await copyFile(join(bookDir, 'art.jpg'), join(bookDir, 'cover.jpg'))
    }
    await run('pdftoppm', ['-jpeg', '-r', '130', '-jpegopt', 'quality=84', '-f', '2', '-l', String(pageCount), pdfPath, join(tmp, 'page')], { maxBuffer: 8 * 1024 * 1024 })
    const rendered = (await readdir(tmp)).filter(name => /\.jpe?g$/i.test(name)).sort((left, right) => {
      const a = Number(left.match(/(\d+)\.jpe?g$/i)?.[1] ?? 0), b = Number(right.match(/(\d+)\.jpe?g$/i)?.[1] ?? 0)
      return a - b
    })
    for (const [pageIndex, name] of rendered.entries()) {
      await rename(join(tmp, name), join(pageDir, `${String(pageIndex + 1).padStart(3, '0')}.jpg`))
    }
    await rm(tmp, { recursive: true, force: true })

    const xml = (await run('pdftotext', ['-bbox-layout', pdfPath, '-'], { maxBuffer: 32 * 1024 * 1024 })).stdout
    const pageXmls = [...xml.matchAll(/<page\b[\s\S]*?<\/page>/g)].map(match => match[0]).slice(1)
    const pages = rendered.map((_, pageIndex) => {
      const parsed = parseStoryPage(pageXmls[pageIndex] ?? '', pageIndex + 1)
      const pageNumber = pageIndex * 2 + 1
      return {
        pageIndex,
        displayPage: `${pageNumber}–${pageNumber + 1}`,
        image: `pages/${String(pageIndex + 1).padStart(3, '0')}.jpg`,
        sentences: parsed.sentences,
      }
    })
    // 句子跨过跨页边界时，把上一页末尾的残句接到下一页首句。
    // 残句没有句末标点，下一句可能以专有名词或数字开头，不能只按大小写判断。
    for (let index = 0; index < pages.length - 1; index++) {
      const last = pages[index].sentences[pages[index].sentences.length - 1]
      const first = pages[index + 1].sentences[0]
      if (!last || !first) continue
      // 上一页没有句末标点，或下一页以小写字母开头（“said Wukong.” 这类
      // 跨页的说话人说明），都说明这一句还没结束。
      if (!/[.!?…][”’"]?$/.test(last.text.trim()) || /^[a-z]/.test(first.text.trim())) {
        const joiner = last.text.endsWith('-') ? '' : ' '
        first.text = normalizeText(`${last.text}${joiner}${first.text}`)
        first.continuedFrom = pages[index].displayPage
        pages[index].sentences.pop()
      }
    }

    const audio = audioByEpisode.get(pdf.episode)
    if (!audio) throw new Error(`第 ${pdf.episode} 集缺少 MP3。`)
    const audioTarget = join(audioDir, 'episode.mp3')
    try { await link(audio.file, audioTarget) } catch { await copyFile(audio.file, audioTarget) }
    const duration = await mediaDuration(audio.file)

    const vocabulary = (vocabEpisodes.get(pdf.episode)?.words ?? []).map(row => ({
      word: row.word,
      definition: cleanDefinition(row.definition),
      example: row.example,
    }))
    const wordCount = pages.reduce((sum, page) => sum + page.sentences.reduce((count, sentence) => count + wordsOf(sentence.text).length, 0), 0)
    const comprehension = Array.isArray(quizzes[pdf.episode]) ? quizzes[pdf.episode] : Array.isArray(quizzes[id]) ? quizzes[id] : undefined

    const manifest = {
      schemaVersion: 1,
      bookId: id,
      title: pdf.title,
      series: 'Journey to the West',
      episode: pdf.episode,
      level: SERIES_LEVEL.level,
      levelLabel: SERIES_LEVEL.levelLabel,
      themes: [...SERIES_THEMES],
      audio: 'audio/episode.mp3',
      audioDuration: duration,
      cover: 'cover.jpg',
      art: 'art.jpg',
      pages,
      vocabulary,
      ...(comprehension ? { comprehension } : {}),
    }
    await writeFile(join(bookDir, 'book.json'), JSON.stringify(manifest) + '\n')
    prepared.push({ id, manifest, wordCount, duration, pdf: pdf.episode, title: pdf.title })
    console.log(`  ${String(index + 1).padStart(3, ' ')}/${selected.length} ${id} · ${pdf.title} · ${pages.length} 个跨页 · ${pages.reduce((sum, page) => sum + page.sentences.length, 0)} 句 · ${vocabulary.length} 个生词`)
  }

  for (const row of prepared) {
    row.manifest.wordCount = row.wordCount
    await writeFile(join(OUT, 'books', row.id, 'book.json'), JSON.stringify(row.manifest) + '\n')
  }

  const books = prepared.map(row => ({
    id: row.id,
    title: row.title,
    episode: row.pdf,
    series: 'Journey to the West',
    level: row.manifest.level,
    levelLabel: row.manifest.levelLabel,
    themes: row.manifest.themes,
    cover: `books/${row.id}/cover.jpg`,
    art: `books/${row.id}/art.jpg`,
    manifest: `books/${row.id}/book.json`,
    pages: row.manifest.pages.length,
    vocabulary: row.manifest.vocabulary.length,
    quiz: row.manifest.comprehension?.length ?? 0,
    wordCount: row.wordCount,
    minutes: row.duration ? Math.max(1, Math.round(row.duration / 60)) : undefined,
    audioDuration: row.duration,
  }))
  await writeFile(join(OUT, 'picture-books.json'), JSON.stringify({ books }, null, 2) + '\n')
  console.log(`\n已生成：${OUT}`)
  console.log(`绘本 ${books.length} 本，目录 picture-books.json。旁白音频和原版页面只保存在本机。`)
  const missingAudio = pdfFiles.filter(row => !audioByEpisode.has(row.episode))
  if (missingAudio.length) console.log(`注意：${missingAudio.length} 集缺少 MP3。`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
