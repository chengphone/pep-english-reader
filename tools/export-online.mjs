#!/usr/bin/env node
// 生成可直接上传到任意静态空间的目录：
//   <out>/pep-english-reader/  ← dist
//   <out>/book-data/<bookId>/  ← 教材清单、页面、音频和动漫
//   <out>/picture-data/        ← 绘本目录、跨页图、整集音频和清单
// 上传后打开 https://<域名>/pep-english-reader/ 即可使用。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { bookCatalogEntry, defaultBookInputs, resolveBookSource, safeJoin } from './bookSource.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.findIndex(value => value === `--${name}` || value.startsWith(`--${name}=`))
  if (index < 0) return fallback
  const value = args[index]
  return value.includes('=') ? value.slice(value.indexOf('=') + 1) : args[index + 1] ?? fallback
}
function options(name) {
  const values = []
  for (let index = 0; index < args.length; index++) {
    const value = args[index]
    if (value === `--${name}`) {
      if (args[index + 1] && !args[index + 1].startsWith('--')) values.push(args[++index])
    } else if (value.startsWith(`--${name}=`)) {
      values.push(value.slice(value.indexOf('=') + 1))
    }
  }
  return values
}
const DIST = resolve(ROOT, option('dist', 'dist'))
const BOOK_INPUTS = options('book').length ? options('book').map(value => resolve(value)) : defaultBookInputs()
const OUT = resolve(option('out', join(homedir(), 'Downloads', 'pep-english-reader-site')))
const PICTURE_DIR = resolve(option('picture', join(homedir(), 'Downloads', 'journey-to-the-west-reader')))
const INCLUDE_PICTURE = !args.includes('--no-picture')

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`找不到 ${join(DIST, 'index.html')}，请先运行 npm run build。`)
  process.exit(1)
}
if (OUT === ROOT || OUT.startsWith(ROOT + sep) || ROOT.startsWith(OUT + sep)) {
  throw new Error(`输出目录不能是仓库目录、仓库内的目录或仓库的上级目录：${OUT}`)
}
if (existsSync(OUT)) {
  const entries = readdirSync(OUT)
  const looksLikeExport = entries.length === 0 || existsSync(join(OUT, 'pep-english-reader')) || existsSync(join(OUT, 'book-data'))
  if (!looksLikeExport) throw new Error(`输出目录已存在且不像之前的导出目录，请换一个目录：${OUT}`)
}

const sources = []
const ids = new Set()
for (const input of BOOK_INPUTS) {
  const source = await resolveBookSource(input)
  if (ids.has(source.id)) throw new Error(`教材 id 重复：${source.id}（${input}）`)
  ids.add(source.id)
  sources.push(source)
}

const appDir = join(OUT, 'pep-english-reader')
await rm(OUT, { recursive: true, force: true })
await mkdir(appDir, { recursive: true })
await cp(DIST, appDir, { recursive: true })

// 绘本目录、跨页图和音频同样留在仓库外；导出时只复制清单实际引用的文件，
// 不把 whisper 缓存、词汇备份和 PDF/MP3 原始素材一起带出去。
async function exportPictures() {
  if (!INCLUDE_PICTURE) { console.log('已按 --no-picture 跳过绘本。'); return undefined }
  const catalogPath = join(PICTURE_DIR, 'picture-books.json')
  if (!existsSync(catalogPath)) { console.log(`未找到 ${catalogPath}，跳过绘本。`); return undefined }
  let data
  try { data = JSON.parse(readFileSync(catalogPath, 'utf8')) } catch { throw new Error(`绘本目录不是有效 JSON：${catalogPath}`) }
  const rows = Array.isArray(data) ? data : Array.isArray(data?.books) ? data.books : []
  if (!rows.length) throw new Error(`绘本目录为空：${catalogPath}`)
  const files = new Set(['picture-books.json'])
  const add = (base, value) => {
    if (typeof value !== 'string' || !value.trim() || /^[a-z]+:/i.test(value.trim())) return
    const clean = value.split('#')[0].trim().replace(/^\.\/+/, '').replace(/^\/+/, '')
    if (clean) files.add(base ? join(base, clean) : clean)
  }
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    add('', row.cover)
    add('', row.art)
    if (typeof row.manifest !== 'string' || !row.manifest.trim()) continue
    add('', row.manifest)
    const manifestPath = safeJoin(PICTURE_DIR, row.manifest)
    if (!manifestPath || !existsSync(manifestPath)) throw new Error(`绘本缺少清单：${row.id ?? row.manifest}`)
    let manifest
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch { throw new Error(`绘本清单不是有效 JSON：${row.manifest}`) }
    const base = dirname(row.manifest)
    add(base, manifest.cover)
    add(base, manifest.art)
    add(base, manifest.audio)
    for (const page of manifest.pages ?? []) add(base, page.image)
  }
  const targetRoot = join(OUT, 'picture-data')
  let bytes = 0
  for (const file of files) {
    const from = safeJoin(PICTURE_DIR, file), to = safeJoin(targetRoot, file)
    if (!from || !to || !existsSync(from)) throw new Error(`绘本缺少目录引用的文件：${file}`)
    await mkdir(dirname(to), { recursive: true })
    await cp(from, to)
    bytes += statSync(from).size
  }
  console.log(`已整理绘本：${rows.length} 本 · ${files.size} 个文件 · ${(bytes / 1048576).toFixed(0)} MB`)
  return { books: rows.length, files: files.size }
}

const pictureSummary = await exportPictures()

const catalog = { books: [] }
let totalFiles = 0
console.log('')
for (const source of sources) {
  const bookDir = join(OUT, 'book-data', source.id)
  // 只复制清单实际引用的文件，避免把构建备份一并带出去。
  const files = new Set(['book.json'])
  for (const page of source.manifest.pages) {
    if (typeof page.image === 'string' && !/^[a-z]+:/i.test(page.image)) files.add(page.image.split('#')[0])
    for (const item of page.items ?? []) {
      if (typeof item.audio === 'string' && !/^[a-z]+:/i.test(item.audio)) files.add(item.audio.split('#')[0])
    }
    for (const resource of page.resources ?? []) {
      if (typeof resource.src === 'string' && !/^[a-z]+:/i.test(resource.src)) files.add(resource.src.split('#')[0])
      if (typeof resource.poster === 'string' && !/^[a-z]+:/i.test(resource.poster)) files.add(resource.poster.split('#')[0])
    }
  }
  for (const relative of files) {
    const from = safeJoin(source.root, relative)
    if (!from || !existsSync(from)) throw new Error(`教材缺少清单引用的文件：${source.id}/${relative}`)
    const to = safeJoin(bookDir, relative)
    if (!to) throw new Error(`教材包含非法路径：${source.id}/${relative}`)
    await mkdir(dirname(to), { recursive: true })
    await cp(from, to)
  }
  catalog.books.push(bookCatalogEntry(source, `../book-data/${encodeURIComponent(source.id)}`))
  totalFiles += files.size
  console.log(`已整理：${source.title} · ${source.pages} 页 · ${files.size} 个文件`)
}

await writeFile(join(appDir, 'remote-books.json'), JSON.stringify(catalog, null, 2) + '\n')

console.log(`\n已生成可上传目录：${OUT}`)
console.log(`包含 ${sources.length} 本教材、${totalFiles} 个教材文件${pictureSummary ? `，以及 ${pictureSummary.books} 本绘本、${pictureSummary.files} 个绘本文件` : ''}。`)
console.log('\n把整个目录上传到任意静态空间后，打开：')
console.log('  https://<域名>/pep-english-reader/')
console.log('\n教材和绘本内容仅供个人使用；如上传到静态空间，必须配置登录/访问控制，不能公开分发。')
