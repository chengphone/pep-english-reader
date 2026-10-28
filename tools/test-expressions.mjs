import assert from 'node:assert/strict'
import { collectExpressions, expressionHeading, cleanExpression } from '../src/expressionExtraction.ts'
import { parseVocabularyAppendix } from '../src/vocabularyExtraction.ts'
const line = (text,y,confidence=95) => ({text,bbox:{x0:0,x1:180,y0:y,y1:y+12},confidence})
assert.equal(expressionHeading('Unit]'),'Unit 1')
assert.equal(expressionHeading('Units'),'Unit 5')
assert.equal(expressionHeading('Unit 6'),'Unit 6')
assert.equal(expressionHeading('We learn Unit 6.'),undefined)
assert.equal(cleanExpression("No, | don’t."),"No, I don't.")
const english=[line('Unit 1',0),line('Plants can give us many',25),line('things.',40),line('AA fi AO',55,15),line('Thanks, Sarah. / Thank you,',80),line('Chen Jie.',95),line('AB AFA',110,20)]
const mixed=[line('Unit 1',0),line('Plants can give us many',25),line('things.',40),line('植物能提供很多东西。',55),line('Thanks, Sarah. / Thank you,',80),line('Chen Jie.',95),line('谢谢，萨拉。/谢谢你，陈杰。',110)]
const result=collectExpressions(english,mixed,'')
assert.deepEqual(result.candidates.map(item=>item.english),['Plants can give us many things.','Thanks, Sarah. / Thank you, Chen Jie.'])
assert.equal(result.candidates[0].meaningLines.length,1)
const continuation=collectExpressions([line('Use again!',0),line('Baim',15,29),line('Unité',45),line('How old are you?',70),line('XYZ',90,10)],[line('Use again!',0),line('再次利用！',15),line('Unit 6',45),line('How old are you?',70),line('你几岁了？',90)],'Unit 5')
assert.deepEqual(continuation.candidates.map(item=>item.unit),['Unit 5','Unit 6'])
const parsed=parseVocabularyAppendix("===SECTION expressions===\nUnit 1\nPlants can give us many\nthings.\n植物能提供很多东西。\nHello!\t你好！\nUnit 2\nYes, it is.\n对，是的。\n===COLUMN===\nThey love each other.\n他们相互关爱。\n===SECTION units===\nUnit 1\napple\t苹果",'test')
assert.equal(parsed.length,3)
assert.equal(parsed[0].category,'expressions')
assert.deepEqual(parsed[0].words.map(word=>word.english),['Plants can give us many things.','Hello!'])
assert.equal(parsed[1].words.length,2)
assert.equal(parsed[2].category,'units')
console.log('Passed: heading OCR ambiguities; literal unit in sentences; punctuation; I vs pipe; wrapped English; bilingual row pairing; cross-column continuation; expression TXT inline rows; categories stay separate')
