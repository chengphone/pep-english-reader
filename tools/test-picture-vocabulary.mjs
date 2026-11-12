import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseVocabulary } from './build-picture-books.mjs'
import { locateWord, sentenceMatchesWord } from '../src/picture/wordLocator.ts'

const layout = `
Journey to the West 6: Test Story
1. fold one's   双臂交叉
    arms         The Dragon King folded his arms.
2. let ...      放走
   go            Please let us go.
3. Congratulations.   恭喜！
4. steep        陡峭的
                 They climbed a steep hill.
5. Good         祝好运！
    luck!
6. Coming right   马上就来！
    up!            "Coming right up!" said the monster.
`

test('wrapped headwords are merged with their continuation line', () => {
  const episode = parseVocabulary(layout).get(6)
  assert.deepEqual(episode.words.map(row => row.word), ["fold one's arms", 'let ... go', 'Congratulations.', 'steep', 'Good luck!', 'Coming right up!'])
  assert.equal(episode.words[0].definition, '双臂交叉')
  assert.equal(episode.words[0].example, 'The Dragon King folded his arms.')
  assert.equal(episode.words[1].example, 'Please let us go.')
  assert.equal(episode.words[2].example, '')
  assert.equal(episode.words[3].example, 'They climbed a steep hill.')
  assert.equal(episode.words[4].example, '')
  assert.equal(episode.words[5].example, '"Coming right up!" said the monster.')
})

test('inflected story forms still locate the dictionary headword', () => {
  assert.equal(sentenceMatchesWord('The road got steeper and steeper.', 'steep'), true)
  assert.equal(sentenceMatchesWord('This monkey is much heavier than he looks.', 'heavy'), true)
  assert.equal(sentenceMatchesWord('He is untying the Tang Monk.', 'untie'), true)
  assert.equal(sentenceMatchesWord('You shall receive your rewards.', 'reward'), true)
})

test('phrases match pronouns, inserted objects and contractions', () => {
  assert.equal(sentenceMatchesWord('The Dragon King folded his arms.', "fold one's arms"), true)
  assert.equal(sentenceMatchesWord('Wukong chased the demon away.', 'chase away'), true)
  assert.equal(sentenceMatchesWord("I couldn't tell them apart.", 'tell apart'), true)
  assert.equal(sentenceMatchesWord('The travelers took baths.', 'take a bath'), true)
  assert.equal(sentenceMatchesWord("It doesn't matter who I am!", 'do not matter'), true)
  assert.equal(sentenceMatchesWord('I will teach the Tiger Immortal a lesson.', 'teach someone a lesson'), true)
  assert.equal(sentenceMatchesWord('Very well, Wukong. Good luck!', 'Good luck.'), true)
  assert.equal(sentenceMatchesWord('The monk must make the journey by himself.', 'by oneself'), true)
})

test('words that never appear in the story are reported as missing', () => {
  assert.equal(sentenceMatchesWord('The rock split open.', 'journey'), false)
  assert.equal(sentenceMatchesWord('The sheep ran across the field.', 'ship'), false)
})

test('locateWord returns the first matching sentence in reading order', () => {
  const pages = [
    { sentences: [{ id: 'a', text: 'The rock split open.' }] },
    { sentences: [{ id: 'b', text: 'The road got steeper.' }, { id: 'c', text: 'It got steeper again.' }] },
  ]
  assert.deepEqual(locateWord(pages, 'steep'), { pageIndex: 1, sentenceId: 'b', text: 'The road got steeper.' })
  assert.equal(locateWord(pages, 'journey'), null)
})
