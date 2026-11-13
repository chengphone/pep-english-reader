import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldReloadForUpdate } from '../src/reloadPolicy.ts'

const idle = {
  updateReady: true,
  mode: 'shelf',
  hasActiveBook: false,
  online: false,
  helpOpen: false,
  routeKind: 'shelf',
  messageKind: 'success',
}

test('idle shelf reloads when an update is ready', () => {
  assert.equal(shouldReloadForUpdate(idle), true)
  assert.equal(shouldReloadForUpdate({ ...idle, routeKind: 'textbooks' }), true)
  assert.equal(shouldReloadForUpdate({ ...idle, routeKind: 'library' }), true)
  assert.equal(shouldReloadForUpdate({ ...idle, routeKind: 'practice' }), true)
})

test('picture reading and quizzes never auto-reload', () => {
  for (const routeKind of ['picture', 'quiz', 'followalong']) {
    assert.equal(shouldReloadForUpdate({ ...idle, routeKind }), false, routeKind)
  }
})

test('active readers, online mode, help and progress work block reloads', () => {
  assert.equal(shouldReloadForUpdate({ ...idle, hasActiveBook: true, routeKind: 'local' }), false)
  assert.equal(shouldReloadForUpdate({ ...idle, hasActiveBook: true, routeKind: 'remote' }), false)
  assert.equal(shouldReloadForUpdate({ ...idle, online: true, routeKind: 'online' }), false)
  assert.equal(shouldReloadForUpdate({ ...idle, helpOpen: true }), false)
  assert.equal(shouldReloadForUpdate({ ...idle, messageKind: 'progress' }), false)
  assert.equal(shouldReloadForUpdate({ ...idle, mode: 'vocab' }), false)
  assert.equal(shouldReloadForUpdate({ ...idle, updateReady: false }), false)
})
