import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SCRIPT = join(ROOT, 'tools', 'export-online.mjs')

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pep-export-test-'))
  const write = (path, body) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
  }
  write('dist/index.html', '<html>app</html>')
  write('dist/assets/app.js', 'js')
  write('book/book.json', JSON.stringify({
    bookId: 'fixture-book',
    title: 'Fixture',
    pages: [{ page: 1, image: 'pages/第 1 页.jpg', items: [{ id: 'w1', text: 'hello', audio: 'audio/1.mp3' }] }],
  }))
  write('book/pages/第 1 页.jpg', 'JPEGDATA')
  write('book/audio/1.mp3', 'MP3DATA')
  write('picture/picture-books.json', JSON.stringify({
    books: [{ id: 'demo', title: 'Demo', cover: 'books/demo/cover.jpg', manifest: 'books/demo/manifest.json' }],
  }))
  write('picture/books/demo/cover.jpg', 'COVER')
  write('picture/books/demo/manifest.json', JSON.stringify({ cover: 'cover.jpg', audio: 'audio/full.mp3', pages: [{ image: 'pages/1.jpg' }] }))
  write('picture/books/demo/pages/1.jpg', 'PAGEIMG')
  write('picture/books/demo/audio/full.mp3', 'FULLAUDIO')
  return root
}

function exportTo(root, extra = []) {
  return execFileSync(process.execPath, [
    SCRIPT,
    '--dist', join(root, 'dist'),
    '--book', join(root, 'book'),
    '--picture', join(root, 'picture'),
    '--out', join(root, 'out'),
    ...extra,
  ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })
}

test('export writes a size map that matches every exported media file', () => {
  const root = fixture()
  try {
    exportTo(root)
    const out = join(root, 'out')
    const sizes = JSON.parse(readFileSync(join(out, '__family-sizes.json'), 'utf8'))
    for (const [key, expected] of Object.entries(sizes)) {
      assert.equal(statSync(join(out, decodeURIComponent(key))).size, expected, key)
    }
    // Worker 用编码后的 URL 查表，因此带空格/中文的路径必须同时记录编码键。
    const encoded = '/book-data/fixture-book/pages/%E7%AC%AC%201%20%E9%A1%B5.jpg'
    const raw = '/book-data/fixture-book/pages/第 1 页.jpg'
    assert.equal(sizes[raw], statSync(join(out, 'book-data', 'fixture-book', 'pages', '第 1 页.jpg')).size)
    assert.equal(sizes[encoded], sizes[raw])
    assert.equal(sizes['/picture-data/books/demo/audio/full.mp3'], 9)
    assert.equal(sizes['/book-data/fixture-book/book.json'], statSync(join(out, 'book-data', 'fixture-book', 'book.json')).size)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failed export keeps the previous output untouched', () => {
  const root = fixture()
  try {
    exportTo(root)
    const out = join(root, 'out')
    const before = readFileSync(join(out, '__family-sizes.json'), 'utf8')
    // 删掉清单引用的页面：校验必须在清空旧导出之前失败。
    rmSync(join(root, 'picture', 'books', 'demo', 'pages', '1.jpg'))
    assert.throws(() => exportTo(root), error => error.status === 1)
    assert(existsSync(out))
    assert.equal(readFileSync(join(out, '__family-sizes.json'), 'utf8'), before)
    assert(existsSync(join(out, 'picture-data', 'books', 'demo', 'pages', '1.jpg')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
