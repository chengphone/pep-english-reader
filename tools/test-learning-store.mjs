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
