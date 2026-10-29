import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {audioKey} from '../src/audioKey.ts'
const {units}=JSON.parse(await fs.readFile(new URL('../public/data/default-vocabulary.json',import.meta.url)))
const {items}=JSON.parse(await fs.readFile(new URL('../public/audio/library-manifest.json',import.meta.url)))
const groups=units.filter(u=>u.id.startsWith('e63-6a-002015-'))
assert.equal(groups.length,12)
assert(!units.some(u=>u.book==='6年级英语上册'),'The retired six-grade edition must not reappear')
const wordCounts=[26,25,20,17,29,27],expressionCounts=[9,10,9,6,9,11]
const audios=new Map(items.map(item=>[audioKey(item.text),item]))
for(const [category,counts] of [['units',wordCounts],['expressions',expressionCounts]]){
 for(let n=1;n<=6;n++){
  const group=groups.find(u=>u.id===`e63-6a-002015-${category}-u${n}`)
  assert(group,`${category} Unit ${n}`);assert.equal(group.category,category);assert.equal(group.words.length,counts[n-1])
  assert(group.book.includes('PEP新版'));assert(group.source.includes('tape6a_002015'))
  assert.equal(new Set(group.words.map(w=>w.id)).size,group.words.length)
  for(const word of group.words){
   assert(word.english.trim()&&word.meaning.trim());assert(!/单元|附录|\bp\.\s*\d|\/(?:[^/]+)\//.test(word.english))
   assert(audios.has(audioKey(word.english)),`Missing audio: ${word.english}`)
  }
 }
}
const group=id=>groups.find(g=>g.id.endsWith(id)).words
assert(group('units-u1').some(w=>w.english==='Hong Kong-Zhuhai-Macao Bridge'))
assert(group('units-u6').some(w=>w.english==='unplug'))
assert(group('units-u6').some(w=>w.english==='run'&&w.meaning==='（使）运转'))
assert(group('units-u2').some(w=>w.english==='run'&&w.meaning==='跑；奔跑'))
assert(group('expressions-u3').some(w=>w.english.startsWith("I'm sorry to hear that.")))
assert(group('expressions-u4').some(w=>w.english==='I also want to buy a microscope.'))
assert(group('expressions-u6').some(w=>w.english==='We should use air conditioners less.'))
console.log('Passed: new six-grade PEP 144 unit words + 54 expressions across 12 groups; cross-page continuation, meanings, unique identities, complete hosted audio coverage')
