import assert from 'node:assert/strict'
import { activeTocIndex, buildBookToc } from '../src/reader/tocEntries.ts'

const page = (number, printedPage, items = [], resources) => ({ page: number, printedPage, image: `pages/${number}.jpg`, items, ...(resources ? { resources } : {}) })
const item = (id, text) => ({ id, text, order: 0, rects: [] })
const manifest = pages => ({ schemaVersion: 1, bookId: 'test', title: 'Test Book', publisherId: 'test', pages })

// 图画词典：_t 是主题，_h1… 是主题下的小节；跳转用物理页码，显示用印刷页码。
const picture = buildBookToc(manifest([
  page(1, undefined, [item('p001_t', "Let's Go Picture Dictionary")]),
  page(10, 2, [item('p010_t', 'Alphabet')]),
  page(13, 5, [item('p013_t', 'Calendar'), item('p013_h1', 'The Months'), item('p013_h2', 'Days of the Week')]),
]))
assert.deepEqual(picture.map(entry => [entry.title, entry.page, entry.label, entry.level]), [
  ["Let's Go Picture Dictionary", 1, 1, 1],
  ['Alphabet', 10, 2, 1],
  ['Calendar', 13, 5, 1],
  ['The Months', 13, 5, 2],
  ['Days of the Week', 13, 5, 2],
])
assert.equal(activeTocIndex(picture, 13), 2)
assert.equal(activeTocIndex(picture, 12), 1)
assert.equal(activeTocIndex(picture, 14), 2)

// 主题分组按页码区间写入 group；同一页的二级小节和一级主题共享分组。
const grouped = buildBookToc({
  ...manifest([
    page(1, 1, [item('p001_t', 'Cover')]),
    page(10, 2, [item('p010_t', 'Alphabet')]),
    page(13, 5, [item('p013_t', 'Calendar'), item('p013_h1', 'The Months')]),
    page(20, 8, [item('p020_t', 'Shapes and Colors')]),
  ]),
  tocGroups: [
    { title: '入门与数字', from: 1, to: 13 },
    { title: '主题词汇', from: 14, to: 20 },
  ],
})
assert.deepEqual(grouped.map(entry => [entry.title, entry.group]), [
  ['Cover', '入门与数字'],
  ['Alphabet', '入门与数字'],
  ['Calendar', '入门与数字'],
  ['The Months', '入门与数字'],
  ['Shapes and Colors', '主题词汇'],
])
// 没有主题元数据的大目录按书页段落自动分组，至少不会 30+ 条平铺。
const fallbackPages = Array.from({ length: 32 }, (_, index) => page(index + 1, index + 1, [item(`p${index + 1}_t`, `Topic ${index + 1}`)]))
const fallback = buildBookToc(manifest(fallbackPages))
assert.equal(new Set(fallback.map(entry => entry.group)).size, 4)
assert.equal(fallback[0].group, '第 1–10 页')
assert.equal(fallback[31].group, '第 31–32 页')

// 清单显式目录优先；无效页码和空标题被丢弃。
const explicit = buildBookToc({
  ...manifest([page(1, 1), page(2, 2), page(3, 3)]),
  toc: [
    { title: 'Start', page: 2, level: 1, subtitle: '  Unit   1  ' },
    { title: '', page: 1 },
    { title: 'Missing', page: 99 },
    { title: 'Sub', page: 2, level: 2 },
  ],
})
assert.deepEqual(explicit.map(entry => [entry.title, entry.page, entry.label, entry.level, entry.subtitle]), [
  ['Start', 2, 2, 1, 'Unit 1'],
  ['Sub', 2, 2, 2, undefined],
])
const sorted = buildBookToc({
  ...manifest([page(1, 1), page(2, 2), page(3, 3)]),
  toc: [{ title: 'Later', page: 3 }, { title: 'Earlier', page: 1 }],
})
assert.deepEqual(sorted.map(entry => entry.title), ['Earlier', 'Later'])

// 学生用书：按 Lesson 编号归并 Learn / Talk 页，跨页音频只记一次，通用资源名不进入目录。
const begin = buildBookToc(manifest([
  page(1, 1, [], [{ id: 'a01', kind: 'audio', title: '课程开场', src: 'a01.mp3' }]),
  page(4, 4, [], [{ id: 'a02', kind: 'audio', title: '字母与发音', src: 'a02.mp3', continuous: true }]),
  page(5, 5, [], [{ id: 'a02', kind: 'audio', title: '字母与发音', src: 'a02.mp3', continuous: true }]),
  page(6, 6, [], [{ id: 'a03', kind: 'audio', title: '单词跟读', subtitle: 'Lesson 1 Aa · Learn the words', src: 'a03.mp3' }]),
  page(7, 7, [], [{ id: 'a04', kind: 'audio', title: '情景对话', subtitle: "Lesson 1 Aa · Let's Talk", src: 'a04.mp3' }]),
  page(58, 58, [], [{ id: 'a90', kind: 'audio', title: '字母歌', subtitle: 'Lesson 27 · The Alphabet', src: 'a90.mp3' }]),
  page(61, 61, [], [
    { id: 'a91', kind: 'audio', title: '告别对话', subtitle: "Lesson 28 · Let's Talk", src: 'a91.mp3' },
    { id: 'a92', kind: 'audio', title: '再见歌', subtitle: 'The Goodbye Song', src: 'a92.mp3' },
  ]),
]))
assert.deepEqual(begin.map(entry => entry.title), [
  '课程开场',
  '字母与发音',
  'Lesson 1 · Aa',
  'Lesson 27 · The Alphabet',
  "Lesson 28 · Let's Talk",
])
assert.deepEqual(begin.map(entry => entry.page), [1, 4, 6, 58, 61])
assert.ok(begin.every(entry => entry.level === 1))
assert.deepEqual(buildBookToc(manifest([page(1, 1, [], [{ id: 'x', kind: 'audio', title: '本页音频', src: 'x.mp3' }])])), [])

console.log('Passed: explicit TOC; _t/_h heading levels; theme groups; page-range fallback; physical jump vs printed label; active section; Lesson dedupe; generic resources skipped')
