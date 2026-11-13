import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildVocabularyQuiz,
  hasComprehension,
  latestPictureProgress,
  normalizePictureCatalog,
  normalizePictureManifest,
  pictureArt,
  pictureProgressPosition,
  questionsFor,
  readPictureProgress,
} from '../src/pictureBooks.ts'
import { PICTURE_ARCS, arcForEntry, arcForEpisode, groupPictureEntries } from '../src/pictureArcs.ts'
import { groupPictureSeries, nextPictureInSeries } from '../src/pictureSeries.ts'
import { slimPictureCatalogRows } from './pictureCatalog.mjs'

const manifest = {
  schemaVersion: 1,
  bookId: 'jtw-test',
  title: 'Test Story',
  audio: 'audio/episode.mp3',
  cover: 'cover.jpg',
  art: 'art.jpg',
  pages: [{ pageIndex: 0, displayPage: '1–2', image: 'pages/001.jpg', sentences: [] }],
  vocabulary: [
    { word: 'journey', definition: '旅行，尤指长途旅行' },
    { word: 'monkey', definition: '猴子' },
    { word: 'river', definition: '河流' },
    { word: 'mountain', definition: '高山' },
    { word: 'king', definition: '国王' },
    { word: 'cave', definition: '山洞' },
  ],
  comprehension: [
    { id: 'q1', prompt: 'Where did the monkey come from?', options: ['A rock', 'A river', 'A cave'], answer: 0 },
    { id: 'q2', prompt: 'Who rules Heaven?', options: ['The captain', 'The Jade Emperor', 'The gibbon'], answer: 1 },
  ],
}

test('vocabulary quiz is deterministic and only asks for the supplied definitions', () => {
  const first = buildVocabularyQuiz(manifest, 5)
  const second = buildVocabularyQuiz(manifest, 5)
  assert.deepEqual(first, second)
  assert.equal(first.length, 5)
  for (const question of first) {
    const word = question.id.slice('vocab-'.length)
    const source = manifest.vocabulary.find(row => row.word === word)
    assert(source, `question ${question.id} must come from the vocabulary list`)
    assert(question.options[question.answer], 'the stored answer must point at an option')
    assert.equal(new Set(question.options).size, question.options.length, 'options must not repeat')
    assert(question.prompt.includes(word))
  }
})

test('comprehension questions are used verbatim; missing ones fall back to vocabulary', () => {
  assert.equal(hasComprehension(manifest), true)
  assert.deepEqual(questionsFor(manifest, 'comprehension'), manifest.comprehension)
  assert.equal(questionsFor({ ...manifest, comprehension: undefined }, 'comprehension').length, 5)
  assert.equal(hasComprehension({ ...manifest, comprehension: [] }), false)
})

test('Journey to the West arcs cover every episode exactly once', () => {
  assert.equal(PICTURE_ARCS.length, 17)
  const jtwArcs = PICTURE_ARCS.filter(arc => arc.series === 'Journey to the West')
  assert.equal(jtwArcs.length, 16)
  assert.deepEqual(jtwArcs.map(arc => [arc.from, arc.to]), [
    [1, 7], [8, 13], [14, 21], [22, 26], [27, 31], [32, 36], [37, 43], [44, 48],
    [49, 52], [53, 58], [59, 63], [64, 67], [68, 75], [76, 84], [85, 98], [99, 108],
  ])
  for (let episode = 1; episode <= 108; episode++) {
    const matches = jtwArcs.filter(arc => episode >= arc.from && episode <= arc.to)
    assert.equal(matches.length, 1, `episode ${episode} must belong to exactly one arc`)
    assert.equal(arcForEpisode(episode)?.id, matches[0].id)
  }
  assert.equal(arcForEpisode(0), undefined)
  assert.equal(arcForEpisode(109), undefined)
  assert.equal(arcForEpisode(undefined), undefined)
})

test('Dino Buddies has its own 44-episode arc and does not collide with JTW episodes', () => {
  const dino = PICTURE_ARCS.find(arc => arc.id === 'dino-buddies')
  assert.equal(dino?.series, 'Dino Buddies')
  assert.deepEqual([dino?.from, dino?.to], [1, 44])
  assert.equal(arcForEntry({ series: 'Dino Buddies', episode: 1 })?.id, 'dino-buddies')
  assert.equal(arcForEntry({ series: 'Dino Buddies', episode: 44 })?.id, 'dino-buddies')
  assert.equal(arcForEntry({ series: 'Dino Buddies', episode: 45 }), undefined)
  assert.equal(arcForEntry({ series: 'Journey to the West', episode: 1 })?.id, 'monkey-king')
  assert.equal(arcForEntry({ series: 'Other Series', episode: 1 }), undefined)
  assert.equal(arcForEntry({ series: '', episode: 1 }), undefined)
  assert.equal(arcForEntry({ series: 'Dino Buddies', episode: undefined }), undefined)
})

test('groupPictureEntries keeps catalog order and only returns filled arcs', () => {
  const jtw = 'Journey to the West'
  const entries = [
    { id: 'a', series: jtw, episode: 1 },
    { id: 'b', series: jtw, episode: 7 },
    { id: 'c', series: jtw, episode: 8 },
    { id: 'd', series: jtw, episode: 108 },
    { id: 'e', series: jtw, episode: undefined },
    { id: 'f', series: jtw, episode: 200 },
  ]
  const groups = groupPictureEntries(entries)
  assert.deepEqual(groups.map(group => group.arc.id), ['monkey-king', 'heaven', 'ling-shan', 'other'])
  assert.deepEqual(groups.flatMap(group => group.entries.map(entry => entry.id)), ['a', 'b', 'c', 'd', 'e', 'f'])
  assert.deepEqual(groupPictureEntries([]), [])
})

test('groupPictureEntries separates series that share episode numbers', () => {
  const entries = [
    { id: 'j1', series: 'Journey to the West', episode: 1 },
    { id: 'd1', series: 'Dino Buddies', episode: 1 },
    { id: 'd44', series: 'Dino Buddies', episode: 44 },
    { id: 'x1', series: 'Unknown Series', episode: 1 },
  ]
  const groups = groupPictureEntries(entries)
  assert.deepEqual(groups.map(group => [group.arc.id, group.entries.map(entry => entry.id)]), [
    ['monkey-king', ['j1']],
    ['dino-buddies', ['d1', 'd44']],
    ['other', ['x1']],
  ])
})

test('picture art falls back to the portrait cover and progress stays inside 0–100%', () => {
  assert.equal(pictureArt(manifest), 'art.jpg')
  assert.equal(pictureArt({ cover: 'cover.jpg' }), 'cover.jpg')
  assert.equal(pictureProgressPosition(undefined, 6), 0)
  assert.equal(pictureProgressPosition({ pageIndex: 0, mode: 'listen', updatedAt: 1, completedPages: [] }, 6), 17)
  assert.equal(pictureProgressPosition({ pageIndex: 5, mode: 'listen', updatedAt: 1, completedPages: [] }, 6), 100)
  assert.equal(pictureProgressPosition({ pageIndex: 99, mode: 'listen', updatedAt: 1, completedPages: [] }, 6), 100)
  assert.equal(pictureProgressPosition({ pageIndex: 2, mode: 'listen', updatedAt: 1, completedPages: [] }, 0), 0)
})

test('home shelves group serialized picture books by series', () => {
  const entries = [
    { id: 'b', series: 'Journey to the West', episode: 2 },
    { id: 'a', series: 'Journey to the West', episode: 1 },
    { id: 'c', series: 'Another Series', episode: 5 },
    { id: 'd', series: 'Another Series', episode: 4 },
    { id: 'e', series: ' ', episode: undefined },
  ]
  const groups = groupPictureSeries(entries)
  assert.deepEqual(groups.map(group => [group.name, group.episodes.map(entry => entry.id)]), [
    ['Journey to the West', ['a', 'b']],
    ['Another Series', ['d', 'c']],
    ['绘本', ['e']],
  ])
  assert.deepEqual(groupPictureSeries([]), [])
})

test('next episode stays inside the same picture series', () => {
  const entries = [
    { id: 'a1', series: 'Series A', episode: 1 },
    { id: 'a3', series: 'Series A', episode: 3 },
    { id: 'a2', series: 'Series A', episode: 2 },
    { id: 'b1', series: 'Series B', episode: 1 },
  ]
  assert.equal(nextPictureInSeries(entries, 'a1')?.id, 'a2')
  assert.equal(nextPictureInSeries(entries, 'a2')?.id, 'a3')
  assert.equal(nextPictureInSeries(entries, 'a3'), undefined)
  assert.equal(nextPictureInSeries(entries, 'b1'), undefined)
  assert.equal(nextPictureInSeries(entries, 'missing'), undefined)
})

test('slim catalog replaces vocabulary arrays with their count without mutating rows', () => {
  const rows = [
    { id: 'a', title: 'A', vocabulary: [{ word: 'one' }, { word: 'two' }] },
    { id: 'b', vocabulary: 7 },
    { id: 'c' },
    { id: 'd', vocabulary: '3' },
    { id: 'e', vocabulary: 'not-a-number' },
    { id: 'f', vocabulary: [] },
    null,
  ]
  const slim = slimPictureCatalogRows(rows)
  assert.deepEqual(slim[0], { id: 'a', title: 'A', vocabulary: 2 })
  assert.equal(slim[1].vocabulary, 7)
  assert.equal(slim[2].vocabulary, 0)
  assert.equal(slim[3].vocabulary, 3)
  assert.equal(slim[4].vocabulary, 0)
  assert.equal(slim[5].vocabulary, 0)
  assert.equal(slim[6], null)
  assert.equal(rows[0].vocabulary.length, 2)
  assert.deepEqual(slimPictureCatalogRows([]), [])
})

test('vocabulary quiz deduplicates words and drops questions without two options', () => {
  const duplicated = {
    ...manifest,
    vocabulary: [
      { word: 'apple', definition: '苹果' },
      { word: 'Apple', definition: '苹果' },
      { word: 'banana', definition: '香蕉' },
      { word: 'cake', definition: '蛋糕' },
      { word: 'date', definition: '枣' },
    ],
  }
  const questions = buildVocabularyQuiz(duplicated, 10)
  assert.equal(questions.length, 4)
  assert.equal(new Set(questions.map(question => question.id)).size, questions.length)
  for (const question of questions) {
    assert(question.options.length >= 2)
    assert(question.answer >= 0 && question.answer < question.options.length)
  }
  const identical = buildVocabularyQuiz({
    ...manifest,
    vocabulary: [
      { word: 'ant', definition: '蚂蚁' },
      { word: 'bee', definition: '蚂蚁' },
      { word: 'cat', definition: '蚂蚁' },
      { word: 'dog', definition: '蚂蚁' },
    ],
  }, 5)
  assert.deepEqual(identical, [])
})

test('picture catalog skips only rows with unusable manifest URLs', () => {
  const base = new URL('https://example.test/picture-data/picture-books.json')
  const entries = normalizePictureCatalog({
    books: [
      { id: 'ok', title: 'OK', series: 'Series', cover: 'cover.jpg', manifest: 'books/ok/book.json' },
      { id: 'bad-cover', title: 'Bad Cover', cover: 'http://[', manifest: 'books/bc/book.json' },
      { id: 'bad-manifest', title: 'Bad', manifest: 'http://[' },
      { id: 'js', title: 'JS', manifest: 'javascript:alert(1)' },
      null,
      { id: 'ok', title: 'Duplicate' },
    ],
  }, base)
  assert.deepEqual(entries.map(entry => entry.id), ['ok', 'bad-cover'])
  assert.equal(entries[0].manifest, 'https://example.test/picture-data/books/ok/book.json')
  assert.equal(entries[1].cover, 'https://example.test/picture-data/cover.jpg')
  assert.deepEqual(normalizePictureCatalog([], base), [])
  assert.throws(() => normalizePictureCatalog({}, base), /绘本目录格式无效/)
})

test('corrupt picture progress entries are ignored and latest valid entry wins', () => {
  const store = new Map()
  const original = globalThis.localStorage
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: key => { store.delete(key) },
  }
  try {
    store.set('pep:picture-progress:v1', JSON.stringify({ a: {
      broken: { pageIndex: 'two', updatedAt: 10 },
      older: { pageIndex: 1, mode: 'self', updatedAt: 5, completedPages: [0, -1, 2.5, 2] },
      newer: { pageIndex: 3, mode: 'practice', updatedAt: 20, completedPages: [1] },
    } }))
    assert.equal(readPictureProgress('broken', 'a'), undefined)
    assert.deepEqual(readPictureProgress('older', 'a'), { pageIndex: 1, mode: 'self', updatedAt: 5, completedPages: [0, 2] })
    assert.deepEqual(latestPictureProgress('a'), {
      bookId: 'newer',
      progress: { pageIndex: 3, mode: 'practice', updatedAt: 20, completedPages: [1] },
    })
    assert.equal(latestPictureProgress('b'), undefined)
  } finally {
    if (original === undefined) delete globalThis.localStorage
    else globalThis.localStorage = original
  }
})

test('picture manifest skips unusable pages and falls back to default media URLs', () => {
  const base = new URL('https://example.test/picture-data/books/x/book.json')
  const normalized = normalizePictureManifest({
    bookId: 'x',
    audio: 'http://[',
    cover: 'javascript:alert(1)',
    pages: [
      { image: 'http://[', sentences: [] },
      {
        image: 'pages/001.jpg',
        sentences: [
          { text: 'Hello', rects: [[0, 0, 0.5, 0.2], 'bad'], start: '1.2', end: '2.5' },
          { text: '   ', rects: [] },
          null,
        ],
      },
      { image: 'pages/002.jpg' },
    ],
    vocabulary: [{ word: 'hello', definition: '你好' }, { word: 'hello' }],
    comprehension: [
      { id: 'dup', prompt: 'Question', options: ['a', 'b'], answer: 1 },
      { id: 'dup', prompt: 'Duplicate', options: ['a', 'b'], answer: 0 },
      { prompt: 'Question without id', options: ['a', 'b'], answer: 0 },
    ],
  }, base)
  assert.equal(normalized.pages.length, 2)
  assert.equal(normalized.pages[0].image, 'https://example.test/picture-data/books/x/pages/001.jpg')
  assert.equal(normalized.pages[0].sentences.length, 1)
  assert.deepEqual(normalized.pages[0].sentences[0].rects, [[0, 0, 0.5, 0.2]])
  assert.equal(normalized.pages[0].sentences[0].start, 1.2)
  assert.equal(normalized.audio, 'https://example.test/picture-data/books/x/audio/episode.mp3')
  assert.equal(normalized.cover, 'https://example.test/picture-data/books/x/cover.jpg')
  assert.equal(normalized.vocabulary.length, 1)
  assert.deepEqual(normalized.comprehension.map(question => question.id), ['dup', 'q3'])
  assert.equal(normalizePictureManifest({ pages: [] }, base), undefined)
  assert.equal(normalizePictureManifest({ pages: [{ image: 'http://[' }] }, base), undefined)
})
