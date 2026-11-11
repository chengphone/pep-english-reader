import assert from 'node:assert/strict'
import { bookCatalogEntry } from './bookSource.mjs'

const full = bookCatalogEntry({
  id: 'begin-1',
  title: "Let's Go Begin 1",
  pages: 2,
  manifest: {
    pages: [
      {
        image: 'pages/001.jpg',
        items: [{}],
        resources: [
          { id: 'a01', kind: 'audio', src: 'audio/one.mp3' },
          { id: 'v1', kind: 'video', src: 'video/one.mp4' },
          { id: 'a02', kind: 'audio', src: 'audio/shared.mp3' },
          { id: 'unknown', kind: 'unknown' },
        ],
      },
      {
        image: 'pages/002.jpg',
        items: [],
        // 同一段连续音频挂到第二页，只能算一段。
        resources: [{ id: 'a02', kind: 'audio', src: 'audio/shared.mp3', continuous: true }],
      },
    ],
  },
}, '/book-data/begin-1')
assert.deepEqual(full, {
  id: 'begin-1',
  title: "Let's Go Begin 1",
  pages: 2,
  items: 1,
  audio: 2,
  videos: 1,
  manifest: '/book-data/begin-1/book.json',
  cover: '/book-data/begin-1/pages/001.jpg',
})

const minimal = bookCatalogEntry({
  id: 'plain',
  title: 'Plain',
  pages: 1,
  manifest: { pages: [{ image: 'https://example.com/cover.jpg', items: [] }] },
}, '/book-data/plain')
assert.deepEqual(minimal, {
  id: 'plain',
  title: 'Plain',
  pages: 1,
  manifest: '/book-data/plain/book.json',
})

console.log('Passed: catalog counts unique page audio/video resources, omits empty counts, and keeps covers relative to the book mount')
