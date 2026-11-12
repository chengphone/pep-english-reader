import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const assetsDir = new URL('../dist/assets/', import.meta.url)
const files = (await readdir(assetsDir)).filter(name => /\.(js|mjs|css|woff2?)$/.test(name)).sort()
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
const revision = createHash('sha256').update(files.join('\n')).update(source).digest('hex').slice(0, 12)
// 只预缓存首屏真正会用的入口脚本、样式和字体。路线级 chunk（阅读器、PDF、
// 词汇工作室等）首次访问时由 fetch 处理器写入缓存，避免弱网首屏在后台
// 抢着下载几 MB 的 PDF worker 和全部懒加载代码。
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const entry = [...html.matchAll(/\/pep-english-reader\/assets\/([^"']+\.(?:js|css))/g)].map(match => match[1])
const fonts = files.filter(name => /\.woff2?$/.test(name))
const precache = [...new Set([...entry, ...fonts])]
await writeFile(new URL('../dist/sw.js', import.meta.url), source
  .replace("const CACHE = 'pep-reader-shell-v3-word-audio'", `const CACHE = 'pep-reader-shell-${revision}'`)
  .replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(precache.map(file => '/pep-english-reader/assets/' + file))}`))
console.log(`Service worker: precache ${precache.length} shell assets (${revision})`)
