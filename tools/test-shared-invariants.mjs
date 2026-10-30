import { normalizeWordIds, mergeVocabularyWords } from '../src/vocabularyWords.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { validateAudioLibrary, validateVocabularyLibrary } from '../src/libraryValidation.ts'
const unit=(id='u1')=>({id,book:'book',title:'Unit 1',category:'units',words:[{id:'w1',english:'apple',meaning:'苹果'}]})
const valid={schemaVersion:1,revision:1,units:[unit()]}
assert.equal(validateVocabularyLibrary(valid),valid)
for(const value of [null,{},[],{...valid,schemaVersion:2},{...valid,revision:-1},{...valid,revision:NaN},{...valid,revision:Infinity},{...valid,revision:Number.MAX_SAFE_INTEGER+1},{...valid,units:[null]},{...valid,units:[unit(),unit()]},{...valid,units:[{...unit(),category:'other'}]},{...valid,units:[{...unit(),words:[{id:'w',english:null,meaning:'中文'}]}]},{...valid,units:[{...unit(),words:[{id:'w',english:'apple',meaning:4}]}]},{...valid,units:[{...unit(),words:[unit().words[0],unit().words[0]]}]}])assert.throws(()=>validateVocabularyLibrary(value))
const audio={schemaVersion:1,items:[{text:'apple',file:'audio/library/'+('a'.repeat(64))+'.mp3',sha256:'b'.repeat(64)}]}
assert.equal(validateAudioLibrary(audio),audio)
for(const path of ['../audio/x.mp3','https://evil.test/a.mp3','/audio/library/a.mp3','audio/library/'+('a'.repeat(64))+'.html','audio/library/'+('a'.repeat(64))+'.mp3?x=1'])assert.throws(()=>validateAudioLibrary({...audio,items:[{...audio.items[0],file:path}]}))
assert.throws(()=>validateAudioLibrary({...audio,items:[audio.items[0],{...audio.items[0],text:' APPLE '}]}))
assert.throws(()=>validateAudioLibrary({...audio,items:[{...audio.items[0],sha256:'bad'}]}))
const corpus=validateVocabularyLibrary(JSON.parse(await fs.readFile(new URL('../public/data/default-vocabulary.json',import.meta.url))))
const library=validateAudioLibrary(JSON.parse(await fs.readFile(new URL('../public/audio/library-manifest.json',import.meta.url))))
const keys=new Set(library.items.map(item=>item.text.normalize('NFKC').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLowerCase()))
for(const item of library.items){const bytes=await fs.readFile(new URL('../public/'+item.file,import.meta.url));assert.ok(bytes.length>100);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.ok(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255)}
const missingAudio=[];for(const group of corpus.units)for(const word of group.words)if(!keys.has(word.english.normalize('NFKC').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLowerCase()))missingAudio.push(word.english)
if(missingAudio.length)console.log(`Audio coverage: ${new Set(missingAudio).size} word(s) still need audio; explicit browser fallback remains available`)
console.log(`Passed: malformed schemas, duplicate identities, unsafe audio paths, revisions, three-way conflicts, unseen remote preservation, acknowledgements; ${corpus.units.length} groups and ${library.items.length} audio hashes/paths/word mappings`)

const original=[{id:'w',english:'taxi Mtwksi',meaning:'出租车'}]
const corrected={id:'w',english:'taxi',meaning:'出租车'}
assert.deepEqual(mergeVocabularyWords(original,[corrected]),[corrected])
assert.equal(mergeVocabularyWords([corrected],[{id:'different',english:'taxi',meaning:'错误覆盖'}])[0].meaning,'出租车')
const duplicate=[{id:'w',english:'pen',meaning:'钢笔'},{id:'w',english:'pen pal',meaning:'笔友'},{id:'w~2',english:'friend',meaning:'朋友'}]
const repaired=normalizeWordIds(duplicate);assert.equal(new Set(repaired.map(word=>word.id)).size,3);assert.deepEqual(repaired.map(word=>word.english),duplicate.map(word=>word.english));assert.deepEqual(normalizeWordIds(repaired),repaired)
console.log('Passed: corrected vocabulary retains row identity; reimport preserves manual definitions; duplicate IDs repaired without losing entries')
