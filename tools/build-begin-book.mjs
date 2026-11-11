#!/usr/bin/env node
// 把 Let's Go Begin 1 的学生用书 PDF、课堂音频和课堂动漫整理成阅读器教材包。
// 生成物只放在本机（默认 ~/Downloads/lets-go-begin-1-reader），不会进入仓库。
import { existsSync, readdirSync } from 'node:fs'
import { cp, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.findIndex(value => value === `--${name}` || value.startsWith(`--${name}=`))
  if (index < 0) return fallback
  const value = args[index]
  return value.includes('=') ? value.slice(value.indexOf('=') + 1) : args[index + 1] ?? fallback
}

const PDF = resolve(option('pdf', join(homedir(), 'Downloads', '学生用书-SB.pdf')))
const AUDIO_DIR = resolve(option('audio', join(homedir(), 'Downloads', '课堂音频')))
const VIDEO_DIR = resolve(option('videos', join(homedir(), 'Downloads', '课堂动漫视频')))
const OUT = resolve(option('out', join(homedir(), 'Downloads', 'lets-go-begin-1-reader')))
const BUILD = OUT + '.building'
const DPI = String(Number(option('dpi', 150)) || 150)

const BOOK_ID = 'lets-go-begin-1'
const TITLE = "Let's Go Begin 1 · 学生用书"
const LESSONS = [
  { n: 1, letter: 'Aa', learn: 6, talk: 7, chant: 'The A Chant' },
  { n: 2, letter: 'Ee', learn: 8, talk: 9, chant: 'The E Chant' },
  { n: 3, letter: 'Ii', learn: 10, talk: 11, chant: 'The I Chant' },
  { n: 4, letter: 'Oo', learn: 12, talk: 13, chant: 'The O Chant' },
  { n: 5, letter: 'Uu', learn: 14, talk: 15, chant: 'The U Chant' },
  { n: 6, letter: 'Cc', learn: 16, talk: 17, chant: 'The C Chant' },
  { n: 7, letter: 'Gg', learn: 18, talk: 19, chant: 'The G Chant' },
  { n: 8, letter: 'Bb', learn: 20, talk: 21, chant: 'The B Chant' },
  { n: 9, letter: 'Dd', learn: 22, talk: 23, chant: 'The D Chant' },
  { n: 10, letter: 'Pp', learn: 24, talk: 25, chant: 'The P Chant' },
  { n: 11, letter: 'Tt', learn: 26, talk: 27, chant: 'The T Chant' },
  { n: 12, letter: 'Vv', learn: 28, talk: 29, chant: 'The V Chant' },
  { n: 13, letter: 'Zz', learn: 30, talk: 31, chant: 'The Z Chant' },
  { n: 14, letter: 'Ff', learn: 32, talk: 33, chant: 'The F Chant' },
  { n: 15, letter: 'Ll', learn: 34, talk: 35, chant: 'The L Chant' },
  { n: 16, letter: 'Mm', learn: 36, talk: 37, chant: 'The M Chant' },
  { n: 17, letter: 'Nn', learn: 38, talk: 39, chant: 'The N Chant' },
  { n: 18, letter: 'Ss', learn: 40, talk: 41, chant: 'The S Chant' },
  { n: 19, letter: 'Xx', learn: 42, talk: 43, chant: 'The X Chant' },
  { n: 20, letter: 'Jj', learn: 44, talk: 45, chant: 'The J Chant' },
  { n: 21, letter: 'Kk', learn: 46, talk: 47, chant: 'The K Chant' },
  { n: 22, letter: 'Hh', learn: 48, talk: 49, chant: 'The H Chant' },
  { n: 23, letter: 'Qq', learn: 50, talk: 51, chant: 'The Q Chant' },
  { n: 24, letter: 'Rr', learn: 52, talk: 53, chant: 'The R Chant' },
  { n: 25, letter: 'Ww', learn: 54, talk: 55, chant: 'The W Chant' },
  { n: 26, letter: 'Yy', learn: 56, talk: 57, chant: 'The Y Chant' },
]
// 每个复习歌曲所在的 Learn 页会多一条音轨；页码与音轨号均已按教材内页标注核对。
const REVIEW_SONGS = {
  5: 'The A-E-I-O-U Song',
  8: 'The B-C G-C Song',
  10: 'The D-G P-G Song',
  13: 'The T-V Z-V Song',
  16: 'The F-L-M Song',
  19: 'The N-S-X Song',
  22: 'The J-K-H Song',
  24: 'The Q-R Song',
  26: 'The W-Y Song',
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
function pad3(value) { return String(value).padStart(3, '0') }
function pad2(value) { return String(value).padStart(2, '0') }
function audioName(track) { return `LG5e_LB1_CD1_${pad2(track)}.mp3` }
function videoName(lesson) { return `LG5e_LB1_L${lesson}_Chant.mp4` }
function seconds(path) {
  try {
    const value = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path], { encoding: 'utf8' }).trim())
    return Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : undefined
  } catch { return undefined }
}
function pageCount(pdf) {
  const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' })
  const match = /^Pages:\s+(\d+)/m.exec(info)
  const count = match ? Number(match[1]) : 0
  if (!count) throw new Error('无法读取 PDF 页数，请确认已安装 poppler（pdfinfo / pdftoppm）。')
  return count
}
function ensureTool(name) {
  try { execFileSync('which', [name], { stdio: 'ignore' }) } catch { fail(`找不到 ${name}，请先安装 poppler（brew install poppler）。`) }
}
function collectFiles(root, extension) {
  const files = new Map()
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.toLowerCase().endsWith(extension)) files.set(entry.name, full)
    }
  }
  walk(root)
  return files
}

if (!existsSync(PDF)) fail(`找不到学生用书 PDF：${PDF}`)
if (!existsSync(AUDIO_DIR)) fail(`找不到课堂音频目录：${AUDIO_DIR}`)
if (!existsSync(VIDEO_DIR)) fail(`找不到课堂动漫目录：${VIDEO_DIR}`)
ensureTool('pdfinfo')
ensureTool('pdftoppm')
const totalPages = pageCount(PDF)
if (!existsSync(join(OUT, 'book.json')) && existsSync(OUT) && readdirSync(OUT).length > 0) {
  fail(`${OUT} 已存在且不是教材包，请更换 --out 或手动处理后再运行。`)
}

const AUDIO_FILES = collectFiles(AUDIO_DIR, '.mp3')
const VIDEO_FILES = collectFiles(VIDEO_DIR, '.mp4')
const pages = new Map()
function pageResources(page) {
  if (!pages.has(page)) pages.set(page, [])
  return pages.get(page)
}
let audioCount = 0
// 一段音轨可以挂到多页：pages 里每项可以覆盖 subtitle 和本页起点 startAt。
// 重复挂载只算一段音频，目录统计也不会把它算成多段。
function addAudio({ track, page, pages, title, subtitle, continuous = false }) {
  const file = audioName(track)
  const source = AUDIO_FILES.get(file)
  if (!source) throw new Error(`缺少音频文件：${file}`)
  const duration = seconds(source)
  const placements = pages ?? [{ page, subtitle }]
  for (const placement of placements) {
    if (!Number.isInteger(placement.page)) throw new Error(`音轨 ${track} 的页码无效：${placement.page}`)
    const placementSubtitle = placement.subtitle ?? subtitle
    pageResources(placement.page).push({
      id: `a${pad2(track)}`,
      kind: 'audio',
      title,
      ...(placementSubtitle ? { subtitle: placementSubtitle } : {}),
      src: `audio/${file}`,
      track,
      ...(duration !== undefined ? { duration } : {}),
      ...(continuous ? { continuous: true } : {}),
      ...(placement.startAt !== undefined ? { startAt: placement.startAt } : {}),
    })
  }
  audioCount++
}
let videoCount = 0
function addVideo({ lesson, page, chant }) {
  const file = videoName(lesson)
  const source = VIDEO_FILES.get(file)
  if (!source) return
  const duration = seconds(source)
  pageResources(page).push({
    id: `v-l${lesson}`,
    kind: 'video',
    title: '课堂动漫',
    subtitle: `Lesson ${lesson} · ${chant}`,
    src: `video/${file}`,
    poster: `pages/${pad3(page)}.jpg`,
    ...(duration !== undefined ? { duration } : {}),
  })
  videoCount++
}

addAudio({ track: 1, page: 1, title: '课程开场', subtitle: '出版信息 · 使用说明' })
// 第 2 段音轨连续录了第 4、5 页：第 5 页从 0:44 开始，翻页时保持同一个播放器。
addAudio({
  track: 2,
  title: '字母与发音',
  continuous: true,
  pages: [
    { page: 4, subtitle: '第 4–5 页 · Listen and point' },
    { page: 5, subtitle: '第 4–5 页 · 从 0:44 开始', startAt: 44.4 },
  ],
})
let track = 3
for (const lesson of LESSONS) {
  addAudio({ track: track++, page: lesson.learn, title: '单词跟读', subtitle: `Lesson ${lesson.n} ${lesson.letter} · Learn the words` })
  addAudio({ track: track++, page: lesson.learn, title: '字母歌谣', subtitle: lesson.chant })
  if (REVIEW_SONGS[lesson.n]) addAudio({ track: track++, page: lesson.learn, title: '复习歌曲', subtitle: REVIEW_SONGS[lesson.n] })
  addAudio({ track: track++, page: lesson.talk, title: '情景对话', subtitle: `Lesson ${lesson.n} ${lesson.letter} · Let's Talk` })
  addVideo({ lesson: lesson.n, page: lesson.learn, chant: lesson.chant })
}
if (track !== 90) throw new Error(`音轨编号不连续：Lesson 26 之后应为 90，实际为 ${track}`)
addAudio({ track: 90, page: 58, title: '字母歌', subtitle: 'Lesson 27 · The Alphabet' })
addAudio({ track: 91, page: 61, title: '告别对话', subtitle: "Lesson 28 · Let's Talk" })
addAudio({ track: 92, page: 61, title: '再见歌', subtitle: 'The Goodbye Song' })
if (audioCount !== 92) throw new Error(`音频条数不完整：期望 92，实际 ${audioCount}`)

console.log(`正在生成教材包：${OUT}`)
console.log(`PDF ${totalPages} 页 · 音频 ${audioCount} 段 · 动漫 ${videoCount} 个`)
await rm(BUILD, { recursive: true, force: true })
await mkdir(join(BUILD, 'pages'), { recursive: true })
await mkdir(join(BUILD, 'audio'), { recursive: true })
await mkdir(join(BUILD, 'video'), { recursive: true })

console.log(`正在把 PDF 转成页面图片（${DPI} dpi）…`)
execFileSync('pdftoppm', ['-jpeg', '-r', DPI, '-jpegopt', 'quality=82', '-f', '1', '-l', String(totalPages), PDF, join(BUILD, 'pages', 'p')], { stdio: 'inherit' })
for (const file of await readdir(join(BUILD, 'pages'))) {
  const match = /^p-(\d+)\.jpg$/.exec(file)
  if (!match) continue
  await rename(join(BUILD, 'pages', file), join(BUILD, 'pages', `${pad3(Number(match[1]))}.jpg`))
}
for (let page = 1; page <= totalPages; page++) {
  if (!existsSync(join(BUILD, 'pages', `${pad3(page)}.jpg`))) throw new Error(`PDF 第 ${page} 页没有生成图片`)
}

console.log('正在复制课堂音频和动漫…')
for (const [file, source] of AUDIO_FILES) await cp(source, join(BUILD, 'audio', file))
for (const [file, source] of VIDEO_FILES) await cp(source, join(BUILD, 'video', file))

const manifestPages = []
for (let page = 1; page <= totalPages; page++) {
  const resources = (pages.get(page) ?? []).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'audio' ? -1 : 1
    return (a.track ?? 0) - (b.track ?? 0)
  })
  manifestPages.push({
    page,
    printedPage: page,
    image: `pages/${pad3(page)}.jpg`,
    items: [],
    ...(resources.length ? { resources } : {}),
  })
}
const manifest = {
  schemaVersion: 1,
  bookId: BOOK_ID,
  title: TITLE,
  publisherId: 'oxford',
  pages: manifestPages,
}
await writeFile(join(BUILD, 'book.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true })
await rename(BUILD, OUT)
const size = Number(execFileSync('du', ['-sk', OUT], { encoding: 'utf8' }).split(/\s+/)[0]) * 1024
console.log(`\n教材包已生成：${OUT}`)
console.log(`${totalPages} 页 · ${audioCount} 段音频 · ${videoCount} 个动漫 · ${(size / 1024 / 1024).toFixed(0)} MB`)
console.log('启动方式：npm run build && npm run book:serve')
console.log('教材内容仅供个人使用，请勿提交到公开仓库或公开演示站点。')
