// 教材源解析：目录直接使用，ZIP 解压到用户缓存目录后复用。
import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { unzipSync } from 'fflate'

export function defaultBookInput() {
  return join(homedir(), 'Downloads', 'lets-go-picture-dictionary-reader.zip')
}

export function safeJoin(root, relative) {
  if (relative.includes('\0')) return null
  const target = resolve(root, '.' + (relative.startsWith('/') ? relative : '/' + relative))
  if (target !== root && !target.startsWith(root + sep)) return null
  return target
}

async function extractZip(zipPath) {
  const info = statSync(zipPath)
  const hash = createHash('sha1').update(`${zipPath}:${info.size}:${info.mtimeMs}`).digest('hex').slice(0, 12)
  const cacheRoot = process.platform === 'darwin' ? join(homedir(), 'Library', 'Caches', 'pep-reader-online') : join(homedir(), '.cache', 'pep-reader-online')
  const destination = join(cacheRoot, hash)
  if (existsSync(join(destination, 'book.json'))) return destination
  console.log(`首次启动，正在解压教材包到 ${destination} …`)
  await mkdir(destination, { recursive: true })
  // 优先用系统的 unzip（更快、内存占用低），失败时退回 fflate。
  try {
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', destination], { stdio: 'ignore' })
  } catch {
    const entries = unzipSync(new Uint8Array(await readFile(zipPath)))
    for (const [path, bytes] of Object.entries(entries)) {
      if (path.endsWith('/')) continue
      const target = safeJoin(destination, path)
      if (!target) throw new Error(`教材包包含非法路径：${path}`)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, bytes)
    }
  }
  if (!existsSync(join(destination, 'book.json'))) throw new Error('教材包里找不到 book.json')
  return destination
}

export async function resolveBookSource(input = defaultBookInput()) {
  const inputPath = resolve(input)
  if (!existsSync(inputPath)) throw new Error(`找不到教材包：${inputPath}`)
  let root = inputPath
  if (statSync(inputPath).isFile()) {
    if (!inputPath.toLowerCase().endsWith('.zip')) throw new Error('教材源只支持包含 book.json 的目录或 ZIP 包。')
    root = await extractZip(inputPath)
  }
  const manifestPath = join(root, 'book.json')
  if (!existsSync(manifestPath)) throw new Error(`教材目录里找不到 book.json：${root}`)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (!Array.isArray(manifest.pages) || !manifest.pages.length) throw new Error('book.json 没有页面。')
  const id = String(manifest.bookId || 'book').trim() || 'book'
  return {
    root,
    id,
    title: typeof manifest.title === 'string' && manifest.title.trim() ? manifest.title : id,
    pages: manifest.pages.length,
    manifest,
  }
}
