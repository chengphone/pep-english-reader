import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedWordImage, wordImage, wordImageForSection } from '../src/wordImages.ts';
import { wordImageFiles } from '../src/wordImages.generated.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imageRoot = path.join(root, 'public/assets/word-learning/generated');
const imageFiles = fs.readdirSync(imageRoot).filter((name) => name.endsWith('.webp')).map((name) => name.slice(0, -5));
const vocabulary = JSON.parse(fs.readFileSync(path.join(root, 'public/data/default-vocabulary.json'), 'utf8'));
const books = ['tape3a_002013', 'tape6a_002015'];

assert.deepEqual([...wordImageFiles].sort(), [...imageFiles].sort(), 'generated index must match the files on disk; run tools/build-word-image-index.mjs');

let wordCount = 0;
for (const bookId of books) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, `public/data/word-learning/${bookId}/manifest.json`), 'utf8'));
  const wordSection = manifest.sections.find((section) => section.id === 'words');
  assert.ok(wordSection, `${bookId}: word section required`);
  for (const unitEntry of wordSection.units) {
    const unit = vocabulary.units.find((item) => item.id === unitEntry.unitId);
    assert.ok(unit, `${bookId} ${unitEntry.unitId}: vocabulary unit must exist`);
    unit.words.forEach((word, index) => {
      wordCount += 1;
      const image = wordImageForSection('words', word.english, unitEntry.words?.[index]?.illustration);
      assert.ok(image, `${bookId} ${word.english}: an illustration must resolve`);
      assert.ok(image.src.startsWith('assets/word-learning/generated/'), `${bookId} ${word.english}: generated illustration must win`);
      assert.ok(imageFiles.includes(path.basename(image.src, '.webp')), `${bookId} ${word.english}: missing generated image ${image.src}`);
      assert.ok(image.alt.trim().length > 0, `${bookId} ${word.english}: accessible description required`);
    });
  }
}
assert.equal(wordCount, 251, 'both supported books must be fully illustrated');

const original = { path: '/assets/word-learning/grade-3-upper-unit-1/name.svg', alt: 'A child introduces themself with a name tag reading Alex.', provenance: 'original', license: 'original' };
assert.equal(generatedWordImage("o'clock"), 'assets/word-learning/generated/oclock.webp', "o'clock alias");
assert.equal(generatedWordImage('nice'), 'assets/word-learning/generated/greeting.webp', 'nice alias');
assert.equal(generatedWordImage('animal'), 'assets/word-learning/generated/zoo.webp', 'animal alias');
assert.deepEqual(wordImage('name', original), { src: 'assets/word-learning/generated/name.webp', alt: 'name 插画' }, 'generated images take priority');
assert.deepEqual(wordImage('not-in-the-catalog', original), { src: original.path, alt: original.alt }, 'original illustration is the fallback');
assert.equal(wordImage('not-in-the-catalog'), undefined, 'no illustration when neither source applies');
assert.equal(wordImageForSection('expressions', 'Two.'), undefined, 'expression pages never show word illustrations');
assert.deepEqual(wordImageForSection('words', 'Two.'), { src: 'assets/word-learning/generated/two.webp', alt: 'Two. 插画' }, 'word sections resolve images');

console.log(`Passed: ${wordCount} word entries across ${books.length} books resolve to generated illustrations, with aliases and original fallback verified.`);
