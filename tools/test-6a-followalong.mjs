import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/word-learning/tape6a_002015/manifest.json'), 'utf8'));
const vocabulary = JSON.parse(fs.readFileSync(path.join(root, 'public/data/default-vocabulary.json'), 'utf8'));
const hosted = JSON.parse(fs.readFileSync(path.join(root, 'public/audio/library-manifest.json'), 'utf8'));
const books = JSON.parse(fs.readFileSync(path.join(root, 'public/data/word-learning/books.json'), 'utf8'));
const bookId = 'tape6a_002015';
const sourceBook = '六年级英语上册 · PEP新版（E63 002015）';
const audioKey = (text) => text.normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const hostedByText = new Map(hosted.items.map((item) => [audioKey(item.text), item]));
const digestCache = new Map();
const digestOf = (file, label) => {
  const audioFile = path.basename(file);
  if (!digestCache.has(audioFile)) {
    const audioPath = path.join(root, 'public/audio/library', audioFile);
    assert.ok(fs.existsSync(audioPath), `${label}: audio file missing`);
    digestCache.set(audioFile, createHash('sha256').update(fs.readFileSync(audioPath)).digest('hex'));
  }
  return digestCache.get(audioFile);
};
const verifyFile = (file, label) => {
  const audioFile = path.basename(file);
  assert.ok(audioFile.includes(digestOf(file, label)), `${label}: audio hash must match its filename`);
};
const verifyHosted = (item, label) => {
  assert.equal(digestOf(item.file, label), item.sha256, `${label}: hosted audio digest must match the library manifest`);
};

assert.equal(manifest.schemaVersion, 3);
assert.equal(manifest.bookId, bookId);
assert.equal(manifest.bookTitle, '六年级英语上册');
assert.match(manifest.phoneticSource, /Appendix 2.*81[–-]84/);
assert.deepEqual(manifest.sections.map((section) => section.id), ['words', 'expressions']);
assert.deepEqual(books.map((book) => book.bookId), ['tape3a_002013', bookId], 'the follow-along book index must list both supported textbooks');

const phonetics = {
  was: '/wəz/', climb: '/klaɪm/', kilometre: '/kɪˈlɒmɪtə(r)/', 'gingerbread house': '', send: '/send/', go: '/ɡəʊ/',
  thousand: '/ˈθaʊznd/', clay: '/kleɪ/', see: '/siː/', village: '/ˈvɪlɪdʒ/', eat: '/iːt/', dry: '/draɪ/',
  take: '/teɪk/', view: '/vjuː/', inspiring: '/ɪnˈspaɪərɪŋ/', bamboo: '/bæmˈbuː/', pumpkin: '/ˈpʌmpkɪn/',
  restaurant: '/ˈrestrɒnt/', airport: '/ˈeəpɔːt/', 'new zealand': '/ˌnjuː ˈziːlənd/',
  'hong kong-zhuhai-macao bridge': '', paris: '/ˈpærɪs/', 'eiffel tower': '',
  'terracotta warriors': '/ˌterəˈkɒtə ˈwɒriəz/', 'jinggangshan revolution museum': '', 'the red army': '',
  paste: '/peɪst/', dress: '/dres/', gala: '/ˈɡɑːlə/', 'count down': '/kaʊnt daʊn/', marathon: '/ˈmærəθən/',
  as: '/əz/', race: '/reɪs/', run: '/rʌn/', cheer: '/tʃɪə(r)/', 'book fair': '', writer: '/ˈraɪtə(r)/',
  read: '/riːd/', make: '/meɪk/', sing: '/sɪŋ/', wear: '/weə(r)/', yesterday: '/ˈjestədeɪ/', notice: '/ˈnəʊtɪs/',
  wake: '/weɪk/', later: '/ˈleɪtə(r)/', judge: '/dʒʌdʒ/', begin: '/bɪˈɡɪn/', win: '/wɪn/', winner: '/ˈwɪnə(r)/',
  ever: '/ˈevə(r)/', exciting: '/ɪkˈsaɪtɪŋ/',
  cold: '/kəʊld/', ill: '/ɪl/', head: '/hed/', 'runny nose': '', soon: '/suːn/', fever: '/ˈfiːvə(r)/',
  cough: '/kɒf/', discuss: '/dɪˈskʌs/', diet: '/ˈdaɪət/', 'stay up': '', cry: '/kraɪ/', another: '/əˈnʌðə(r)/',
  call: '/kɔːl/', email: '/ˈiːmeɪl/', unhappy: '/ʌnˈhæpi/', glass: '/ɡlɑːs/', may: '/meɪ/', add: '/æd/',
  video: '/ˈvɪdiəʊ/', better: '/ˈbetə(r)/',
  money: '/ˈmʌni/', 'pocket money': '/ˈpɒkɪt ˈmʌni/', schoolbag: '/ˈskuːlbæɡ/', goods: '/ɡʊdz/', drink: '/drɪŋk/',
  service: '/ˈsɜːvɪs/', haircut: '/ˈheəkʌt/', microscope: '/ˈmaɪkrəskəʊp/', lucky: '/ˈlʌki/', half: '/hɑːf/',
  'save up': '', sale: '/seɪl/', ticket: '/ˈtɪkɪt/', manage: '/ˈmænɪdʒ/', sell: '/sel/', jar: '/dʒɑː(r)/',
  'for example': '',
  planet: '/ˈplænɪt/', earth: '/ɜːθ/', sky: '/skaɪ/', daytime: '/ˈdeɪtaɪm/', cloud: '/klaʊd/', moon: '/muːn/',
  star: '/stɑː(r)/', space: '/speɪs/', 'outer space': '/ˈaʊtə(r) speɪs/', 'space station': '', ocean: '/ˈəʊʃn/',
  marble: '/ˈmɑːbl/', satellite: '/ˈsætəlaɪt/', soil: '/sɔɪl/', alien: '/ˈeɪliən/', sunrise: '/ˈsʌnraɪz/',
  rover: '/ˈrəʊvə(r)/', into: '/ˈɪntə/', telescope: '/ˈtelɪskəʊp/', astronaut: '/ˈæstrənɔːt/',
  spaceship: '/ˈspeɪsʃɪp/', month: '/mʌnθ/', taikonaut: '/ˈtaɪkənɔːt/', cloth: '/klɒθ/', toothpaste: '/ˈtuːθpeɪst/',
  question: '/ˈkwestʃən/', sunset: '/ˈsʌnset/', time: '/taɪm/', mars: '/mɑːz/',
  power: '/ˈpaʊə(r)/', electricity: '/ɪˌlekˈtrɪsəti/', solar: '/ˈsəʊlə(r)/', type: '/taɪp/', energy: '/ˈenədʒi/',
  light: '/laɪt/', heat: '/hiːt/', cool: '/kuːl/', resource: '/rɪˈsɔːs/', 'run out': '', change: '/tʃeɪndʒ/',
  quick: '/kwɪk/', shower: '/ˈʃaʊə(r)/', unplug: '/ʌnˈplʌɡ/', difference: '/ˈdɪfrəns/', reduce: '/rɪˈdjuːs/',
  'air conditioner': '/ˈeə kənˌdɪʃənə(r)/', drive: '/draɪv/', reuse: '/ˌriːˈjuːz/', own: '/əʊn/',
  market: '/ˈmɑːkɪt/', bottle: '/ˈbɒtl/', top: '/tɒp/', useful: '/ˈjuːsfl/', dirty: '/ˈdɜːti/', side: '/saɪd/'
};

const wordsSection = manifest.sections.find((section) => section.id === 'words');
const expressionsSection = manifest.sections.find((section) => section.id === 'expressions');
const expectedCounts = { 1: 26, 2: 25, 3: 20, 4: 17, 5: 29, 6: 27 };
let wordCount = 0;
for (let n = 1; n <= 6; n += 1) {
  const unitEntry = wordsSection.units[n - 1];
  const unit = vocabulary.units.find((item) => item.id === unitEntry.unitId);
  assert.ok(unit, `${unitEntry.unitId}: vocabulary unit must exist`);
  assert.equal(unit.book, sourceBook);
  assert.equal(unit.category, 'units');
  assert.equal(unitEntry.title, unit.title);
  assert.equal(unitEntry.words.length, expectedCounts[n], `${unitEntry.unitId}: word count must match the textbook page`);
  assert.deepEqual(unitEntry.words.map((word) => word.id), unit.words.map((word) => word.id), `${unitEntry.unitId}: order must follow the vocabulary`);
  for (const word of unitEntry.words) {
    wordCount += 1;
    const source = unit.words.find((item) => item.id === word.id);
    const english = source.english.toLowerCase();
    assert.ok(english in phonetics, `${word.id}: unexpected phonetic entry`);
    assert.equal(word.phonetic, phonetics[english], `${word.id}: phonetic must match the textbook word list`);
    assert.doesNotMatch(word.phonetic, /\((英|美|UK|US)\)|British|American/i);
    if (source.audio) {
      assert.equal(source.audio.bookId, bookId, `${word.id}: bound audio must come from this textbook`);
      verifyFile(source.audio.file, word.id);
    } else {
      const item = hostedByText.get(audioKey(source.english));
      assert.ok(item, `${word.id}: hosted textbook audio required`);
      verifyHosted(item, word.id);
    }
  }
}
assert.equal(wordCount, 144, 'all sixth-grade unit words must be covered');

const expressionCounts = [9, 10, 9, 6, 9, 11];
let expressionCount = 0;
for (let n = 1; n <= 6; n += 1) {
  const unitEntry = expressionsSection.units[n - 1];
  assert.equal(unitEntry.unitId, `e63-6a-002015-expressions-u${n}`);
  assert.equal(unitEntry.title, `Unit ${n}`);
  const unit = vocabulary.units.find((item) => item.id === unitEntry.unitId);
  assert.ok(unit, `${unitEntry.unitId}: vocabulary unit must exist`);
  assert.equal(unit.category, 'expressions');
  assert.equal(unit.words.length, expressionCounts[n - 1]);
  for (const word of unit.words) {
    expressionCount += 1;
    const item = hostedByText.get(audioKey(word.english));
    assert.ok(item, `${word.id}: hosted textbook audio required`);
    verifyHosted(item, word.id);
  }
}
assert.equal(expressionCount, 54, 'all sixth-grade expressions must be covered');

console.log('Passed: sixth-grade follow-along covers 6 units / 144 words with textbook phonetics and 6 expression pages / 54 sentences, all backed by hosted textbook audio.');
