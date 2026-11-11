#!/usr/bin/env node
// 生成可直接上传到任意静态空间的目录：
//   <out>/pep-english-reader/  ← dist
//   <out>/book-data/<bookId>/  ← 教材清单、页面和音频
// 上传后打开 https://<域名>/pep-english-reader/ 即可使用。
import { existsSync } from 'node:fs'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { defaultBookInput, resolveBookSource, safeJoin } from './bookSource.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.findIndex(value => value === `--${name}` || value.startsWith(`--${name}=`))
  if (index < 0) return fallback
  const value = args[index]
  return value.includes('=') ? value.slice(value.indexOf('=') + 1) : args[index + 1] ?? fallback
}
const DIST = resolve(ROOT, option('dist', 'dist'))
const BOOK_INPUT = resolve(option('book', defaultBookInput()))
const OUT = resolve(option('out', join(homedir(), 'Downloads', 'lets-go-picture-dictionary-site')))

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`找不到 ${join(DIST, 'index.html')}，请先运行 npm run build。`)
  process.exit(1)
}

const source = await resolveBookSource(BOOK_INPUT)
const appDir = join(OUT, 'pep-english-reader')
const bookDir = join(OUT, 'book-data', source.id)
await rm(OUT, { recursive: true, force: true })
await mkdir(appDir, { recursive: true })
await cp(DIST, appDir, { recursive: true })

// 只复制清单实际引用的页面和音频，避免把构建备份一并带出去。
const files = new Set(['book.json'])
for (const page of source.manifest.pages) {
  if (typeof page.image === 'string' && !/^[a-z]+:/i.test(page.image)) files.add(page.image.split('#')[0])
  for (const item of page.items ?? []) {
    if (typeof item.audio === 'string' && !/^[a-z]+:/i.test(item.audio)) files.add(item.audio)
  }
}
for (const relative of files) {
  const from = safeJoin(source.root, relative)
  if (!from || !existsSync(from)) throw new Error(`教材缺少清单引用的文件：${relative}`)
  const to = safeJoin(bookDir, relative)
  if (!to) throw new Error(`教材包含非法路径：${relative}`)
  await mkdir(dirname(to), { recursive: true })
  await cp(from, to)
}

const catalog = {
  books: [{
    id: source.id,
    title: source.title,
    pages: source.pages,
    manifest: `../book-data/${encodeURIComponent(source.id)}/book.json`,
  }],
}
await writeFile(join(appDir, 'remote-books.json'), JSON.stringify(catalog, null, 2) + '\n')

console.log(`\n已生成可上传目录：${OUT}`)
console.log(`包含：${source.title} · ${source.pages} 页 · ${files.size} 个教材文件`)
console.log('\n把整个目录上传到任意静态空间后，打开：')
console.log('  https://<域名>/pep-english-reader/')
console.log('\n教材内容仅供个人使用，请勿上传到公开仓库或公开演示站点。')
