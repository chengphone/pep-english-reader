import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {validateVocabularyLibrary} from '../src/libraryValidation.ts'
const library=validateVocabularyLibrary(JSON.parse(await fs.readFile(new URL('../public/data/default-vocabulary.json',import.meta.url))))
const groups=library.units.filter(u=>u.book==='3年级英语上册')
assert.equal(groups.length,13)
const counts=[15,19,22,18,17,16],files=new Set()
for(let unit=1;unit<=6;unit++)assert.equal(groups.find(u=>u.category==='units'&&u.title===`Unit ${unit}`).words.length,counts[unit-1])
assert.equal(groups.filter(u=>u.category==='expressions').reduce((n,u)=>n+u.words.length,0),51)
assert.equal(groups.find(u=>u.category==='vocabulary').words.length,106)
assert(groups.find(u=>u.title==='Unit 3').words.some(w=>w.english==='red panda'&&w.meaning==='小熊猫'))
assert(groups.find(u=>u.title==='Unit 6').words.some(w=>w.english==='eat'))
for(const group of groups)for(const word of group.words){
 assert(word.audio,`Original audio missing: ${word.english}`)
 assert.equal(word.audio.bookId,'tape3a_002013');assert.equal(word.audio.text,word.english)
 const bytes=await fs.readFile(new URL('../public/'+word.audio.file,import.meta.url));assert.ok(bytes.length>100)
 assert.equal(createHash('sha256').update(bytes).digest('hex'),word.audio.file.match(/([a-f0-9]{64})\.mp3$/)[1])
 files.add(word.audio.file)
}
const sample=groups[0];assert.throws(()=>validateVocabularyLibrary({schemaVersion:1,units:[{...sample,words:[{...sample.words[0],audio:{file:'https://bad.test/a.mp3',text:'name',bookId:'book'}}]}]}))
console.log(`Passed: 107 unit-word entries, 51 expressions, 106-word alphabetical index; every item binds to verified original textbook audio (${files.size} unique audio files), isolated from imported TTS`)
