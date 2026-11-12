import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const assetsDir = new URL('../dist/assets/', import.meta.url)
const files = (await readdir(assetsDir)).filter(name => /\.(js|mjs|css|woff2?)$/.test(name)).sort()
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
const revision = createHash('sha256').update(files.join('\n')).update(source).digest('hex').slice(0, 12)
// 预缓存应用外壳和所有常规路由 chunk，保证离线深链接仍能打开对应页面。
// 只排除 PDF 解析器与 worker（约 1.7MB）：它们只在导入/渲染本地 PDF 时用到，
// 首次使用时再由 fetch 处理器写入缓存，不拖慢弱网首屏。
const pdfAssets = /^pdf[-.]|^pdf\.worker/
const precache = files.filter(name => !pdfAssets.test(name))
await writeFile(new URL('../dist/sw.js', import.meta.url), source
  .replace("const CACHE = 'pep-reader-shell-v3-word-audio'", `const CACHE = 'pep-reader-shell-${revision}'`)
  .replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(precache.map(file => '/pep-english-reader/assets/' + file))}`))
console.log(`Service worker: precache ${precache.length} shell assets (${revision})`)
