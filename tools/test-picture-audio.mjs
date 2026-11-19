import assert from 'node:assert/strict'
import { test } from 'node:test'
import { releasePictureAudio } from '../src/picture/audioPlayback.ts'

test('releasing a picture episode pauses playback, clears its source, and reloads the media element', () => {
  const calls = []
  releasePictureAudio({
    pause: () => calls.push('pause'),
    removeAttribute: name => calls.push(`remove:${name}`),
    load: () => calls.push('load'),
  })
  assert.deepEqual(calls, ['pause', 'remove:src', 'load'])
})

test('releasing a missing picture audio element is safe', () => {
  assert.doesNotThrow(() => releasePictureAudio(null))
})
