#!/usr/bin/env node
// 生成可直接上传到任意静态空间的目录：
//   <out>/pep-english-reader/  ← dist
//   <out>/book-data/<bookId>/  ← 教材清单、页面、音频和动漫
//   <out>/picture-data/        ← 绘本目录、跨页图、整集音频和清单
// 上传后打开 https://<域名>/pep-english-reader/ 即可使用。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, parse, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { bookCatalogEntry, defaultBookInputs, resolveBookSource, safeJoin, safeRealJoin } from './bookSource.mjs'
import { slimPictureCatalogRows } from './pictureCatalog.mjs'

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
// 输出目录会先被清空；拒绝根目录、仓库、构建产物和输入源的重叠位置。
if (OUT === parse(OUT).root) throw new Error(`输出目录不能是文件系统根目录：${OUT}`)
if (OUT === ROOT || OUT.startsWith(ROOT + sep) || ROOT.startsWith(OUT + sep)) {
  throw new Error(`输出目录不能是仓库目录、仓库内的目录或仓库的上级目录：${OUT}`)
}
if (DIST === OUT || DIST.startsWith(OUT + sep) || OUT.startsWith(DIST + sep)) {
  throw new Error(`输出目录不能与构建目录重叠：${OUT} / ${DIST}`)
}
if (INCLUDE_PICTURE && (PICTURE_DIR === OUT || PICTURE_DIR.startsWith(OUT + sep) || OUT.startsWith(PICTURE_DIR + sep))) {
  throw new Error(`输出目录不能与绘本目录重叠：${OUT} / ${PICTURE_DIR}`)
}
if (existsSync(OUT)) {
  if (!statSync(OUT).isDirectory()) throw new Error(`输出路径已存在且不是目录：${OUT}`)
  const entries = readdirSync(OUT)
  const looksLikeExport = entries.length === 0 || existsSync(join(OUT, 'pep-english-reader')) || existsSync(join(OUT, 'book-data'))
  if (!looksLikeExport) throw new Error(`输出目录已存在且不像之前的导出目录，请换一个目录：${OUT}`)
}

const sources = []
const ids = new Set()
for (const input of BOOK_INPUTS) {
  const inputPath = resolve(input)
  if (inputPath === OUT || inputPath.startsWith(OUT + sep)) throw new Error(`教材源不能放在输出目录里：${inputPath}`)
  const source = await resolveBookSource(input)
  if (source.root === OUT || source.root.startsWith(OUT + sep)) throw new Error(`教材源不能放在输出目录里：${source.root}`)
  if (ids.has(source.id)) throw new Error(`教材 id 重复：${source.id}（${input}）`)
  ids.add(source.id)
  sources.push(source)
}

function bookFiles(source) {
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
  return files
}

// 先把所有引用文件校验完，再动输出目录；任何缺文件/越界符号链接都不会毁掉上一版导出。
function validateBookSource(source) {
  const files = bookFiles(source)
  for (const relative of files) {
    const from = safeRealJoin(source.root, relative)
    if (!from || !statSync(from).isFile()) throw new Error(`教材缺少清单引用的文件：${source.id}/${relative}`)
  }
  return files
}
const sourceFiles = new Map(sources.map(source => [source.id, validateBookSource(source)]))

// 家庭 Worker 的 ASSETS 响应不带 Content-Length，Range 分片依赖这份大小表。
// 每次导出都与媒体文件一起重写，避免旧映射和新文件长度不一致。
const sizes = {}
function recordSize(relativePath, size) {
  const raw = '/' + relativePath
  const encoded = '/' + relativePath.split('/').map(encodeURIComponent).join('/')
  sizes[raw] = size
  if (encoded !== raw) sizes[encoded] = size
}

// 绘本先只读取目录和清单，收集引用文件；复制留到暂存目录建好之后。
async function planPictures() {
  if (!INCLUDE_PICTURE) { console.log('已按 --no-picture 跳过绘本。'); return undefined }
  const catalogPath = join(PICTURE_DIR, 'picture-books.json')
  if (!existsSync(catalogPath)) { console.log(`未找到 ${catalogPath}，跳过绘本。`); return undefined }
  let data
  try { data = JSON.parse(readFileSync(catalogPath, 'utf8')) } catch { throw new Error(`绘本目录不是有效 JSON：${catalogPath}`) }
  const rows = Array.isArray(data) ? data : Array.isArray(data?.books) ? data.books : []
  if (!rows.length) throw new Error(`绘本目录为空：${catalogPath}`)
  const files = new Set()
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
    const manifestPath = safeRealJoin(PICTURE_DIR, row.manifest)
    if (!manifestPath) throw new Error(`绘本缺少清单：${row.id ?? row.manifest}`)
    let manifest
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch { throw new Error(`绘本清单不是有效 JSON：${row.manifest}`) }
    const base = dirname(row.manifest)
    add(base, manifest.cover)
    add(base, manifest.art)
    add(base, manifest.audio)
    for (const page of manifest.pages ?? []) add(base, page.image)
  }
  const plan = []
  let bytes = 0
  for (const file of files) {
    const from = safeRealJoin(PICTURE_DIR, file)
    if (!from || !statSync(from).isFile()) throw new Error(`绘本缺少目录引用的文件：${file}`)
    const size = statSync(from).size
    bytes += size
    plan.push({ from, file, size })
  }
  return { rows, files: plan, bytes }
}
const picturePlan = await planPictures()

async function copyPictures(outRoot, plan) {
  if (!plan) return undefined
  const targetRoot = join(outRoot, 'picture-data')
  for (const { from, file, size } of plan.files) {
    const to = safeJoin(targetRoot, file)
    if (!to) throw new Error(`绘本包含非法路径：${file}`)
    await mkdir(dirname(to), { recursive: true })
    await cp(from, to)
    recordSize('picture-data/' + file, size)
  }
  await mkdir(targetRoot, { recursive: true })
  await writeFile(join(targetRoot, 'picture-books.json'), JSON.stringify({ books: slimPictureCatalogRows(plan.rows) }, null, 2) + '\n')
  console.log(`已整理绘本：${plan.rows.length} 本 · ${plan.files.length + 1} 个文件 · ${(plan.bytes / 1048576).toFixed(0)} MB`)
  return { books: plan.rows.length, files: plan.files.length + 1 }
}

// 先写入同级的暂存目录，全部成功后再替换旧导出，失败时旧版本保持可用。
const STAGE = `${OUT}.tmp-${process.pid}`
let committed = false
try {
  await rm(STAGE, { recursive: true, force: true })
  await mkdir(join(STAGE, 'pep-english-reader'), { recursive: true })
  await cp(DIST, join(STAGE, 'pep-english-reader'), { recursive: true })

  const pictureSummary = await copyPictures(STAGE, picturePlan)

  const catalog = { books: [] }
  let totalFiles = 0
  console.log('')
  for (const source of sources) {
    const bookDir = join(STAGE, 'book-data', source.id)
    const files = sourceFiles.get(source.id)
    for (const relative of files) {
      const from = safeRealJoin(source.root, relative)
      if (!from) throw new Error(`教材包含非法路径：${source.id}/${relative}`)
      const to = safeJoin(bookDir, relative)
      if (!to) throw new Error(`教材包含非法路径：${source.id}/${relative}`)
      await mkdir(dirname(to), { recursive: true })
      await cp(from, to)
      recordSize(`book-data/${source.id}/${relative}`, statSync(from).size)
    }
    catalog.books.push(bookCatalogEntry(source, `../book-data/${encodeURIComponent(source.id)}`))
    totalFiles += files.size
    console.log(`已整理：${source.title} · ${source.pages} 页 · ${files.size} 个文件`)
  }

  await writeFile(join(STAGE, 'pep-english-reader', 'remote-books.json'), JSON.stringify(catalog, null, 2) + '\n')
  await writeFile(join(STAGE, '__family-sizes.json'), JSON.stringify(sizes))

  if (existsSync(OUT)) {
    const backup = `${OUT}.backup-${process.pid}`
    await rm(backup, { recursive: true, force: true })
    await rename(OUT, backup)
    try {
      await rename(STAGE, OUT)
      committed = true
    } catch (error) {
      await rename(backup, OUT).catch(() => {})
      throw error
    }
    await rm(backup, { recursive: true, force: true }).catch(() => {})
  } else {
    await rename(STAGE, OUT)
    committed = true
  }

  console.log(`\n已生成可上传目录：${OUT}`)
  console.log(`包含 ${sources.length} 本教材、${totalFiles} 个教材文件${pictureSummary ? `，以及 ${pictureSummary.books} 本绘本、${pictureSummary.files} 个绘本文件` : ''}。`)
  console.log('\n把整个目录上传到任意静态空间后，打开：')
  console.log('  https://<域名>/pep-english-reader/')
  console.log('\n教材和绘本内容仅供个人使用；如上传到静态空间，必须配置登录/访问控制，不能公开分发。')
} finally {
  if (!committed) await rm(STAGE, { recursive: true, force: true }).catch(() => {})
}
