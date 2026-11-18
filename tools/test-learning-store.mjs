import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { stripTypeScriptTypes } from 'node:module'

const originalWindow = globalThis.window
const originalLocalStorage = globalThis.localStorage
const values = new Map()
const listeners = []
const pendingEvents = []

globalThis.window = { addEventListener: (name, listener) => { if (name === 'storage') listeners.push(listener) } }
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => {
    const newValue = String(value)
    values.set(key, newValue)
    pendingEvents.push({ key, newValue })
  },
  removeItem: key => { values.delete(key) },
  clear: () => {
    values.clear()
    pendingEvents.push({ key: null, newValue: null })
  },
}

const coreUrl = new URL('../src/reader/learningCore.ts', import.meta.url).href
const source = stripTypeScriptTypes(
  (await readFile(new URL('../src/reader/learningStore.ts', import.meta.url), 'utf8'))
    .replace("import { useSyncExternalStore } from 'react'", 'const useSyncExternalStore = () => undefined')
    .replace("from './learningCore'", `from '${coreUrl}'`),
  { mode: 'strip' },
)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const firstTab = await import(`${moduleUrl}#first`)
const secondTab = await import(`${moduleUrl}#second`)
const STORAGE_KEY = 'pep:learning:v1'

function deliverStorageEvents() {
  for (const event of pendingEvents.splice(0)) {
    for (const listener of listeners) listener(event)
  }
}

after(() => {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
  if (originalLocalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalLocalStorage
})

test('separate tabs merge page visits and clear events invalidate stale state', () => {
  firstTab.getLearningState()
  secondTab.getLearningState()
  firstTab.recordPageVisit('bookA', 1)
  // Delay the storage event until after the second module has already written.
  secondTab.recordPageVisit('bookB', 2)
  let persisted = JSON.parse(values.get(STORAGE_KEY))
  assert.equal(persisted.lastPages.a.bookA, 1)
  assert.equal(persisted.lastPages.a.bookB, 2)

  deliverStorageEvents()
  globalThis.localStorage.clear()
  deliverStorageEvents()
  secondTab.renameProfile('a', '新档案')
  persisted = JSON.parse(values.get(STORAGE_KEY))
  assert.equal(persisted.profiles.a.name, '新档案')
  assert.deepEqual(persisted.lastPages.a, {})
})

test('corrupt last-chapter JSON is ignored while legacy plain text still reads', () => {
  // 合法 JSON 但不是章节记录：不能把原始 JSON 当章节名显示。
  values.set('pep:last-chapter:a:no-at', '{"label":"Unit 2"}')
  assert.equal(firstTab.readLastChapter('no-at', 'a'), undefined)
  values.set('pep:last-chapter:a:null', 'null')
  assert.equal(firstTab.readLastChapter('null', 'a'), undefined)
  values.set('pep:last-chapter:a:array', '["Unit 3"]')
  assert.equal(firstTab.readLastChapter('array', 'a'), undefined)
  // 早期版本直接存标题文本，解析失败时仍按纯文本读取。
  values.set('pep:last-chapter:a:legacy', 'Lesson 3 Aa')
  assert.deepEqual(firstTab.readLastChapter('legacy', 'a'), { label: 'Lesson 3 Aa', at: 0 })
  values.set('pep:last-chapter:a:good', JSON.stringify({ label: 'Unit 4', at: 42 }))
  assert.deepEqual(firstTab.readLastChapter('good', 'a'), { label: 'Unit 4', at: 42 })
})
