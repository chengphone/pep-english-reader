import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { stripTypeScriptTypes } from 'node:module'

let stateCells = []
let stateIndex = 0
let players = []
let deferredResume
const hooks = {
  useCallback: fn => fn,
  useEffect: () => {},
  useMemo: fn => fn(),
  useRef: initial => ({ current: initial }),
  useState(initial) {
    const index = stateIndex++
    stateCells[index] ??= { value: initial }
    return [stateCells[index].value, value => {
      stateCells[index].value = typeof value === 'function' ? value(stateCells[index].value) : value
    }]
  },
}
globalThis.__pageAudioHooks = hooks

const source = stripTypeScriptTypes(
  (await readFile(new URL('../src/reader/usePageAudio.ts', import.meta.url), 'utf8'))
    .replace("import { useCallback, useEffect, useMemo, useRef, useState } from 'react'", 'const { useCallback, useEffect, useMemo, useRef, useState } = globalThis.__pageAudioHooks'),
  { mode: 'strip' },
)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const audioModule = await import(moduleUrl)

class FakeAudio {
  constructor(src) {
    this.src = src
    this.paused = true
    this.ended = false
    this.currentTime = 0
    this.duration = 10
    this.playCalls = 0
    players.push(this)
  }
  play() {
    this.playCalls++
    this.paused = false
    if (this.src === 'a.mp3' && this.playCalls === 2 && deferredResume) return deferredResume.promise
    return Promise.resolve()
  }
  pause() { this.paused = true }
  removeAttribute(name) { if (name === 'src') this.src = '' }
  load() {}
}
globalThis.Audio = FakeAudio

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function createController() {
  stateCells = []
  stateIndex = 0
  players = []
  const audioA = { id: 'a', kind: 'audio', title: 'A', src: 'a.mp3' }
  const audioB = { id: 'b', kind: 'audio', title: 'B', src: 'b.mp3' }
  return {
    controller: audioModule.usePageAudio({ resources: [audioA, audioB] }),
    audioA,
    audioB,
  }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('a stale rejected play promise cannot set an error on the newer audio', async () => {
  deferredResume = deferred()
  const { controller, audioA, audioB } = createController()
  controller.toggle(audioA)
  await flush()
  controller.toggle(audioA) // pause
  controller.toggle(audioA) // resume; this play promise stays pending
  controller.toggle(audioB)
  await flush()
  deferredResume.reject(new DOMException('play interrupted', 'AbortError'))
  await flush()
  assert.equal(stateCells[1].value, true, 'the current track should stay playing')
  assert.equal(stateCells[4].value, '', 'the old track must not report an error')
  deferredResume = undefined
})

test('a rejected play promise after stop cannot change the stopped state', async () => {
  deferredResume = deferred()
  const { controller, audioA } = createController()
  controller.toggle(audioA)
  await flush()
  controller.toggle(audioA) // pause
  controller.toggle(audioA) // pending resume
  controller.stop()
  deferredResume.reject(new DOMException('play interrupted', 'AbortError'))
  await flush()
  assert.equal(stateCells[1].value, false)
  assert.equal(stateCells[4].value, '')
  deferredResume = undefined
})

test('a non-finite duration in the manifest never reaches the player state', () => {
  stateCells = []
  stateIndex = 0
  players = []
  const resource = { id: 'bad-duration', kind: 'audio', title: 'Bad', src: 'bad.mp3', duration: Number.NaN }
  const controller = audioModule.usePageAudio({ resources: [resource] })
  controller.toggle(resource)
  // useState 顺序：activeResource, playing, current, duration, error...
  assert.equal(stateCells[3].value, 0)
})
