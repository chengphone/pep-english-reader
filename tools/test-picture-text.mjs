import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseStoryPage } from './build-picture-books.mjs'

// 生成最小的 pdftotext -bbox-layout 页面结构：每一行是一个 <line>，
// 行内的 <word> 只声明 x 坐标，y 坐标继承行。
function pageXml(lines) {
  const body = lines.map(line => `<line xMin="0" yMin="${line.y}" xMax="800" yMax="${line.y + (line.height ?? 22)}">${line.words.map(word => `<word xMin="${word.x}" yMin="${line.y}" xMax="${word.x + word.width}" yMax="${line.y + (line.height ?? 22)}">${word.text}</word>`).join('')}</line>`).join('')
  return `<page width="800" height="600">${body}</page>`
}

function texts(lines) {
  return parseStoryPage(pageXml(lines), 1).sentences.map(sentence => sentence.text)
}

test('letter-spaced PDF text is joined back into words', () => {
  assert.deepEqual(texts([{ y: 100, words: [
    { text: 'O', x: 50, width: 8 },
    { text: 'n', x: 60, width: 8 },
    { text: 'l', x: 70, width: 4 },
    { text: 'y', x: 76, width: 8 },
    { text: 'the', x: 94, width: 24 },
    { text: 'bodhisattva.', x: 128, width: 90 },
  ] }]), ['Only the bodhisattva.'])
})

test('drop cap joins the rest of the word', () => {
  assert.deepEqual(texts([
    { y: 90, height: 60, words: [{ text: 'O', x: 50, width: 20 }] },
    { y: 100, words: [
      { text: 'ne-Horned', x: 71.4, width: 58 },
      { text: 'Buffalo', x: 140, width: 50 },
      { text: 'ran', x: 200, width: 30 },
      { text: 'away.', x: 240, width: 45 },
    ] },
  ]), ['One-Horned Buffalo ran away.'])
})

test('drop cap that is a complete word keeps its space', () => {
  assert.deepEqual(texts([
    { y: 90, height: 60, words: [{ text: 'I', x: 50, width: 10 }] },
    { y: 100, words: [
      { text: 'know', x: 66.9, width: 44 },
      { text: 'this.', x: 120, width: 40 },
    ] },
  ]), ['I know this.'])
})

test('hyphenated line break is joined without a space', () => {
  assert.deepEqual(texts([
    { y: 100, words: [{ text: 'One-', x: 50, width: 40 }] },
    { y: 130, words: [
      { text: 'Horned', x: 50, width: 50 },
      { text: 'Buffalo', x: 110, width: 50 },
      { text: 'ran', x: 170, width: 30 },
      { text: 'away.', x: 210, width: 45 },
    ] },
  ]), ['One-Horned Buffalo ran away.'])
})

test('missing space after punctuation in a word box is restored', () => {
  assert.deepEqual(texts([{ y: 100, words: [
    { text: 'I', x: 50, width: 8 },
    { text: 'know', x: 60, width: 44 },
    { text: 'correctly,”said', x: 110, width: 100 },
    { text: 'one', x: 220, width: 30 },
    { text: 'priest.', x: 260, width: 45 },
  ] }]), ['I know correctly,” said one priest.'])
})
