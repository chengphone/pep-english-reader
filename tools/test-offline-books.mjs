import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectBookUrls } from '../src/reader/offlineBooks.ts'

test('offline book URLs cover manifest, pages, audio, posters and deduplicate', () => {
  const book = {
    id: 'demo',
    remote: true,
    manifestUrl: 'https://cdn.example.com/book-data/demo/book.json',
    assets: {},
    manifest: {
      schemaVersion: 1,
      bookId: 'demo',
      title: 'Demo',
      publisherId: 'pep',
      pages: [
        {
          page: 1,
          image: 'https://cdn.example.com/book-data/demo/pages/001.jpg',
          items: [
            { id: 'a', text: 'apple', order: 1, rects: [], audio: 'https://cdn.example.com/book-data/demo/audio/03.mp3' },
            { id: 'b', text: 'ant', order: 2, rects: [], audio: 'https://cdn.example.com/book-data/demo/audio/03.mp3' },
          ],
          resources: [
            { id: 'r', kind: 'audio', title: 'Track', src: 'https://cdn.example.com/book-data/demo/audio/03.mp3' },
            { id: 'v', kind: 'video', title: 'Video', src: 'https://cdn.example.com/book-data/demo/video/l1.mp4', poster: 'https://cdn.example.com/book-data/demo/pages/001.jpg' },
          ],
        },
        { page: 2, image: 'relative/pages/002.jpg', items: [] },
      ],
    },
  }
  const urls = collectBookUrls(book)
  assert.deepEqual(urls.sort(), [
    'https://cdn.example.com/book-data/demo/audio/03.mp3',
    'https://cdn.example.com/book-data/demo/book.json',
    'https://cdn.example.com/book-data/demo/pages/001.jpg',
    'https://cdn.example.com/book-data/demo/video/l1.mp4',
  ])
})

test('offline book URLs ignore empty and non-http entries', () => {
  const urls = collectBookUrls({
    id: 'demo', assets: {}, manifestUrl: '/relative/book.json',
    manifest: { schemaVersion: 1, bookId: 'demo', title: 'Demo', publisherId: 'pep', pages: [{ page: 1, image: '', items: [], resources: [{ id: 'r', kind: 'audio', title: 'x', src: '' }] }] },
  })
  assert.deepEqual(urls, [])
})
