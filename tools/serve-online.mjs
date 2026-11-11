#!/usr/bin/env node
// 本机在线教材服务器：同时提供构建后的应用和多本教材包。
// 手机、平板和电脑在同一 Wi-Fi 下打开终端打印的地址即可点读，无需导入。
// 教材目录在站点根路径 /book-data/ 下，不进入 dist，也不会被提交到仓库。
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { extname, join, resolve } from 'node:path'
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
const PORT = Number(option('port', process.env.PORT ?? 4173))
const HOST = option('host', '0.0.0.0')
const BASE = `/${String(option('base', '/pep-english-reader/')).replace(/^\/+|\/+$/g, '')}/`
const DIST = resolve(ROOT, option('dist', 'dist'))
const BOOK_INPUTS = options('book').length ? options('book').map(value => resolve(value)) : defaultBookInputs()

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.m4a': 'audio/mp4', '.pdf': 'application/pdf', '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8',
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

async function prepareBooks() {
  const books = []
  const ids = new Set()
  for (const input of BOOK_INPUTS) {
    let source
    try { source = await resolveBookSource(input) } catch (error) { fail(error instanceof Error ? error.message : String(error)); return [] }
    if (ids.has(source.id)) { fail(`教材 id 重复：${source.id}（${input}）`); return [] }
    ids.add(source.id)
    const mount = '/book-data/' + encodeURIComponent(source.id)
    books.push({ ...source, mount })
  }
  return {
    books,
    catalog: { books: books.map(book => bookCatalogEntry(book, book.mount)) },
  }
}

function cacheHeaders(pathname, isBook) {
  if (isBook) {
    if (pathname.endsWith('.json')) return 'no-cache'
    return 'public, max-age=86400'
  }
  if (pathname.endsWith('.html')) return 'no-cache'
  if (pathname.includes('/assets/')) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

function sendFile(request, response, path, { isBook = false, cors = true } = {}) {
  let info
  try {
    info = statSync(path)
    if (!info.isFile()) throw new Error('not a file')
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...(cors ? CORS : {}) })
    response.end('Not found')
    return
  }
  const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
  const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheHeaders(path, isBook),
    ETag: etag,
    ...(cors ? CORS : {}),
  }
  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, headers)
    response.end()
    return
  }
  let start = 0, end = info.size - 1, status = 200
  const range = request.headers.range
  if (typeof range === 'string' && !range.includes(',')) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (match) {
      if (match[1] === '') {
        const suffix = Number(match[2])
        if (!Number.isFinite(suffix) || suffix <= 0) {
          response.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` })
          response.end()
          return
        }
        start = Math.max(0, info.size - suffix)
      } else {
        start = Number(match[1])
        end = match[2] === '' ? info.size - 1 : Math.min(Number(match[2]), info.size - 1)
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= info.size) {
        response.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` })
        response.end()
        return
      }
      status = 206
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
    }
  }
  headers['Content-Length'] = String(end - start + 1)
  response.writeHead(status, headers)
  if (request.method === 'HEAD' || info.size === 0) {
    response.end()
    return
  }
  const stream = createReadStream(path, { start, end })
  stream.on('error', () => { if (!response.headersSent) response.writeHead(500); response.destroy() })
  stream.pipe(response)
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Modified-Since',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

if (!existsSync(join(DIST, 'index.html'))) fail(`找不到 ${join(DIST, 'index.html')}，请先运行 npm run build。`)
const { books, catalog } = await prepareBooks()
console.log('教材：')
for (const book of books) console.log(`  ${book.title} · ${book.pages} 页`)

const server = createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS)
    response.end()
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' })
    response.end()
    return
  }
  let rawPathname, pathname
  try {
    rawPathname = new URL(request.url, 'http://localhost').pathname
    pathname = decodeURIComponent(rawPathname)
  } catch {
    response.writeHead(400)
    response.end('Bad request')
    return
  }
  try {
    if (pathname === '/' || pathname === BASE.slice(0, -1)) {
      response.writeHead(302, { Location: BASE })
      response.end()
      return
    }
    if (rawPathname.startsWith('/book-data/')) {
      const book = books.find(item => rawPathname.startsWith(item.mount + '/'))
      if (!book) { response.writeHead(404); response.end('Not found'); return }
      const relative = decodeURIComponent(rawPathname.slice(book.mount.length + 1))
      const target = safeJoin(book.root, relative)
      if (!target) { response.writeHead(404); response.end('Not found'); return }
      sendFile(request, response, target, { isBook: true })
      return
    }
    if (pathname.startsWith(BASE)) {
      const relative = pathname.slice(BASE.length) || 'index.html'
      if (relative === 'remote-books.json') {
        const body = JSON.stringify(catalog)
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...CORS })
        response.end(request.method === 'HEAD' ? undefined : body)
        return
      }
      const target = safeJoin(DIST, relative)
      if (!target) { response.writeHead(404); response.end('Not found'); return }
      sendFile(request, response, target, { cors: false })
      return
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  } catch (error) {
    console.error(error)
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Server error')
  }
})

server.on('error', error => fail(`无法启动服务器：${error.message}`))
server.listen(PORT, HOST, () => {
  const addresses = []
  for (const rows of Object.values(networkInterfaces())) {
    for (const row of rows ?? []) if (row.family === 'IPv4' && !row.internal) addresses.push(row.address)
  }
  const query = id => `?view=remote&book=${encodeURIComponent(id)}`
  const local = `http://localhost:${PORT}${BASE}`
  console.log('\n在线点读已启动\n')
  console.log('电脑：')
  console.log(`  书架      ${local}`)
  for (const book of books) console.log(`  ${book.title}  ${local}${query(book.id)}`)
  if (addresses.length) {
    console.log('手机/平板（同一 Wi-Fi）：')
    for (const address of addresses) {
      const origin = `http://${address}:${PORT}${BASE}`
      console.log(`  书架      ${origin}`)
      for (const book of books) console.log(`  ${book.title}  ${origin}${query(book.id)}`)
    }
  } else {
    console.log('手机/平板：未检测到局域网地址，请确认已连接 Wi-Fi。')
  }
  console.log('\n按 Ctrl+C 停止。首次在手机上打开时，如弹出防火墙提示，请允许 Node 接收入站连接。')
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => process.exit(0)) })
