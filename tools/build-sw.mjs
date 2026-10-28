import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const files = (await readdir(new URL('../dist/assets/', import.meta.url))).filter(name => /\.(js|mjs|css)$/.test(name)).sort()
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
const revision = createHash('sha256').update(files.join('\n')).update(source).digest('hex').slice(0, 12)
await writeFile(new URL('../dist/sw.js', import.meta.url), source
  .replace("const CACHE = 'pep-reader-shell-v3-word-audio'", `const CACHE = 'pep-reader-shell-${revision}'`)
  .replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(files.map(file => '/assets/' + file))}`))
console.log(`Service worker: precache ${files.length} application assets (${revision})`)
