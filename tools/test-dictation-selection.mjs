import assert from 'node:assert/strict'
import { createDictationQueue } from '../src/dictationSelection.ts'
const words=[{id:'a',english:'apple',meaning:'苹果'},{id:'b',english:'banana',meaning:'香蕉'},{id:'c',english:'cake',meaning:'蛋糕'}]
const copy=JSON.stringify(words)
assert.deepEqual(createDictationQueue([words[0],words[2]],2,()=>0).map(word=>word.id).sort(),['a','c'])
assert.equal(createDictationQueue(words,50).length,3)
assert.equal(createDictationQueue(words,0).length,0)
assert.equal(createDictationQueue(words,-2).length,0)
assert.equal(createDictationQueue([...words,{id:'empty',english:' ',meaning:''}],9).length,3)
assert.equal(JSON.stringify(words),copy)
const snapshot=createDictationQueue(words,3);words[0].english='changed';assert.equal(snapshot.find(word=>word.id==='a').english,'apple')
console.log('Passed: selected subset only; count clamping; empty selection; ignores blank entries; no mutation; round content is a snapshot')
