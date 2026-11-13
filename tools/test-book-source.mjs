import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { resolveBookSource, safeJoin, safeRealJoin, validBookId } from './bookSource.mjs'

test('book ids used as directory names must be single safe segments', () => {
  for (const id of ['begin-1', 'lets-go-picture-dictionary', 'A.b_c-1', '0']) assert.equal(validBookId(id), true, id)
  for (const id of ['', '.', '..', '../evil', 'a/b', 'a\\b', '/abs', 'a b', '中文', 'a\0b']) assert.equal(validBookId(id), false, JSON.stringify(id))
})

test('safeJoin and safeRealJoin reject traversal and symlinks escaping the root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pep-book-root-'))
  const outside = await mkdtemp(join(tmpdir(), 'pep-book-outside-'))
  try {
    await mkdir(join(root, 'pages'))
    await writeFile(join(root, 'pages', 'ok.jpg'), 'ok')
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(join(outside, 'secret.txt'), join(root, 'pages', 'escape.jpg'))
    await symlink(join(root, 'pages', 'ok.jpg'), join(root, 'pages', 'inside.jpg'))

    assert.equal(safeJoin(root, '../outside.txt'), null)
    assert.equal(safeJoin(root, '..'), null)
    assert.equal(safeRealJoin(root, 'pages/escape.jpg'), null, 'a symlink pointing outside must be rejected')
    assert.equal(await readFile(safeRealJoin(root, 'pages/inside.jpg'), 'utf8'), 'ok')
    assert.equal(safeRealJoin(root, 'missing.jpg'), null)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('resolveBookSource refuses a book.json whose bookId escapes book-data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pep-book-source-'))
  try {
    await writeFile(join(root, 'book.json'), JSON.stringify({ bookId: '../../evil', pages: [{ page: 1, image: 'pages/1.jpg', items: [] }] }))
    await assert.rejects(resolveBookSource(root), /bookId/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
