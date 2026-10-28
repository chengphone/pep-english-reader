import assert from 'node:assert/strict'
import { parseVocabularyAppendix } from '../src/vocabularyExtraction.ts'
import { localTranslation, vocabularySpellingHint } from '../src/translation.ts'
const raw="===SECTION vocabulary===\nA\nair\t空气\n===COLUMN===\nC\ncute\t可爱的\n===SECTION vocabulary===\nG\ngarden\t花园\nR\nred\t红色\n===SECTION vocabulary===\nred panda\t小熊猫\nS\nsea\t海洋\nair\t空气\n===SECTION units===\nUnit 1\nair\t空气"
const result=parseVocabularyAppendix(raw,'test')
assert.equal(result.length,2)
const whole=result.find(unit=>unit.category==='vocabulary')
assert.equal(whole.title,'词汇表（全部）')
assert.deepEqual(whole.words.map(word=>word.english),['air','cute','garden','red','red panda','sea'])
assert.equal(result.find(unit=>unit.category==='units').words.length,1)
assert.equal(vocabularySpellingHint('seq','海; 海洋'),'sea')
assert.equal(vocabularySpellingHint('seq','河'),undefined)
assert.equal(vocabularySpellingHint('zu','动物因'),'zoo')
assert.equal(localTranslation('red panda'),'小熊猫')
assert.equal(localTranslation("o'clock"),'……点钟')
assert.equal(localTranslation('eat'),'吃')
console.log('Passed: vocabulary without Unit headers; multi-page merge; alphabet headings excluded; duplicates; red vs red panda; separate unit words; conservative single-Han OCR repair; o’clock dictionary normalization')
