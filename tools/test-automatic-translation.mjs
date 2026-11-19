import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { stripTypeScriptTypes } from 'node:module'

const originalIndexedDb = globalThis.indexedDB
const originalTranslator = globalThis.Translator

const translationUrl = new URL('../src/translation.ts', import.meta.url).href
const source = stripTypeScriptTypes(
  (await readFile(new URL('../src/automaticTranslation.ts', import.meta.url), 'utf8'))
    .replace("from './translation'", `from '${translationUrl}'`),
  { mode: 'strip' },
)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const { automaticallyTranslate } = await import(moduleUrl)

after(() => {
  if (originalIndexedDb === undefined) delete globalThis.indexedDB
  else globalThis.indexedDB = originalIndexedDb
  if (originalTranslator === undefined) delete globalThis.Translator
  else globalThis.Translator = originalTranslator
})

test('a blocked glossary never turns Object prototype members into textbook translations', async () => {
  globalThis.indexedDB = { open() { throw new Error('blocked') } }
  globalThis.Translator = undefined
  // 词典读取失败时回退为空词典；constructor / __proto__ 不能命中原型属性，
  // 否则函数或对象会被当成“教材释义”渲染到阅读页。
  for (const word of ['constructor', '__proto__']) {
    const result = await automaticallyTranslate(word, 'blocked-book')
    assert.equal(result.text, undefined, `${word} 不应得到原型属性`)
    assert.equal(result.source, undefined)
    assert.match(result.message, /未匹配到教材释义/)
  }
})

test('the built-in glossary still translates when the local database is unavailable', async () => {
  globalThis.indexedDB = { open() { throw new Error('blocked') } }
  assert.deepEqual(await automaticallyTranslate('apple', 'blocked-book'), { text: '苹果', source: 'local' })
  assert.deepEqual(await automaticallyTranslate('   ', 'blocked-book'), {})
})

test('real textbook entries named after prototype members are kept as data', async () => {
  const rows = [
    null,
    { book: 'other-book', words: [{ english: 'apple', meaning: '别的教材' }] },
    {
      book: 'glossary-book',
      words: [
        null,
        { english: 7, meaning: '不是词条' },
        { english: 'constructor', meaning: '构造函数' },
        { english: '__proto__', meaning: '原型词' },
      ],
    },
  ]
  globalThis.indexedDB = {
    open() {
      const request = {}
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          close() {},
          transaction() {
            return {
              objectStore() {
                return {
                  getAll() {
                    const get = {}
                    queueMicrotask(() => { get.result = rows; get.onsuccess?.() })
                    return get
                  },
                }
              },
            }
          },
        }
        request.onsuccess?.()
      })
      return request
    },
  }
  assert.deepEqual(await automaticallyTranslate('Constructor', 'glossary-book'), { text: '构造函数', source: 'textbook' })
  assert.deepEqual(await automaticallyTranslate('__proto__', 'glossary-book'), { text: '原型词', source: 'textbook' })
  // 别的教材的释义不能串进来；内置词典仍按本地释义优先。
  assert.deepEqual(await automaticallyTranslate('apple', 'glossary-book'), { text: '苹果', source: 'local' })
})

console.log('Passed: automatic translation glossary fallback keeps prototype names as data; built-in glossary and textbook entries still translate')
