import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'public/data/word-learning/tape3a_002013/manifest.json');
const assetRoot = path.join(root, 'public/assets/word-learning/grade-3-upper-unit-1');
const audioRoot = path.join(root, 'public/audio/library');
const vocabulary = JSON.parse(fs.readFileSync(path.join(root, 'public/data/default-vocabulary.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const bookId = 'tape3a_002013';
const sourceBook = '3年级英语上册';

assert.equal(manifest.schemaVersion, 3);
assert.equal(manifest.bookId, bookId);
assert.equal(manifest.bookTitle, '三年级英语上册');
assert.match(manifest.phoneticSource, /Appendix 3.*83[–-]85/, 'phonetics must cite the textbook word list they were taken from');
assert.deepEqual(manifest.sections.map((section) => section.id), ['words', 'expressions']);
assert.deepEqual(manifest.sections.map((section) => section.title), ['单元词汇', '常用表达']);
const wordsSection = manifest.sections[0];
const expressionsSection = manifest.sections[1];

const textbookPhonetics = {
  'hosted-default:units:7': {
    name: '/neɪm/', nice: '/naɪs/', ear: '/ɪə(r)/', hand: '/hænd/', eye: '/aɪ/',
    mouth: '/maʊθ/', arm: '/ɑːm/', can: '/kən, kæn/', share: '/ʃeə(r)/', smile: '/smaɪl/',
    listen: '/ˈlɪsn/', help: '/help/', say: '/seɪ/', friend: '/frend/', good: '/ɡʊd/'
  },
  'hosted-default:units:8': {
    mum: '/mʌm/', dad: '/dæd/', grandma: '/ˈɡrænmɑː/', grandpa: '/ˈɡrænpɑː/',
    grandfather: '/ˈɡrænfɑːðə(r)/', grandmother: '/ˈɡrænmʌðə(r)/', mother: '/ˈmʌðə(r)/',
    father: '/ˈfɑːðə(r)/', me: '/miː/', sister: '/ˈsɪstə(r)/', family: '/ˈfæməli/',
    have: '/hæv/', big: '/bɪɡ/', cousin: '/ˈkʌzn/', brother: '/ˈbrʌðə(r)/', baby: '/ˈbeɪbi/',
    uncle: '/ˈʌŋkl/', aunt: '/ɑːnt/', small: '/smɔːl/'
  },
  'hosted-default:units:9': {
    like: '/laɪk/', dog: '/dɒɡ/', pet: '/pet/', cat: '/kæt/', fish: '/fɪʃ/', bird: '/bɜːd/',
    rabbit: '/ˈræbɪt/', go: '/ɡəʊ/', zoo: '/zuː/', fox: '/fɒks/', miss: '/mɪs/', panda: '/ˈpændə/',
    'red panda': '/red ˈpændə/', cute: '/kjuːt/', monkey: '/ˈmʌŋki/', tiger: '/ˈtaɪɡə(r)/',
    elephant: '/ˈelɪfənt/', lion: '/ˈlaɪən/', animal: '/ˈænɪml/', giraffe: '/dʒəˈrɑːf/',
    tall: '/tɔːl/', fast: '/fɑːst/'
  },
  'hosted-default:units:10': {
    apple: '/ˈæpl/', banana: '/bəˈnɑːnə/', farm: '/fɑːm/', air: '/eə(r)/', orange: '/ˈɒrɪndʒ/',
    grape: '/ɡreɪp/', school: '/skuːl/', garden: '/ˈɡɑːdn/', need: '/niːd/', water: '/ˈwɔːtə(r)/',
    flower: '/ˈflaʊə(r)/', grass: '/ɡrɑːs/', plant: '/plɑːnt/', new: '/njuː/', tree: '/triː/',
    sun: '/sʌn/', give: '/ɡɪv/', them: '/ðəm, ðem/'
  },
  'hosted-default:units:11': {
    colour: '/ˈkʌlə(r)/', orange: '/ˈɒrɪndʒ/', green: '/ɡriːn/', red: '/red/', blue: '/bluː/',
    make: '/meɪk/', purple: '/ˈpɜːpl/', brown: '/braʊn/', bear: '/beə(r)/', yellow: '/ˈjeləʊ/',
    duck: '/dʌk/', sea: '/siː/', some: '/səm, sʌm/', pink: '/pɪŋk/', draw: '/drɔː/',
    white: '/waɪt/', black: '/blæk/'
  },
  'hosted-default:units:12': {
    old: '/əʊld/', five: '/faɪv/', year: '/jɪə(r)/', one: '/wʌn/', two: '/tuː/', three: '/θriː/',
    four: '/fɔː(r)/', ten: '/ten/', six: '/sɪks/', seven: '/ˈsevn/', eight: '/eɪt/', nine: '/naɪn/',
    "o'clock": '/əˈklɒk/', cut: '/kʌt/', eat: '/iːt/', cake: '/keɪk/'
  }
};

const unitIds = Object.keys(textbookPhonetics);
assert.equal(wordsSection.units.length, unitIds.length, 'all six unit word lists must be present');
assert.deepEqual(wordsSection.units.map((unit) => unit.unitId), unitIds, 'unit order must follow the textbook');

const localAssets = new Set(fs.readdirSync(assetRoot));
const verifyAudio = (word, label) => {
  assert.ok(word.audio && typeof word.audio.file === 'string', `${label}: textbook audio binding required`);
  assert.equal(word.audio.text, word.english, `${label}: audio must be bound to the matching textbook word`);
  assert.equal(word.audio.bookId, bookId, `${label}: audio must come from the pilot textbook`);
  const audioFile = path.basename(word.audio.file);
  const audioPath = path.join(audioRoot, audioFile);
  assert.ok(fs.existsSync(audioPath), `${label}: textbook audio file missing`);
  const digest = createHash('sha256').update(fs.readFileSync(audioPath)).digest('hex');
  assert.ok(audioFile.includes(digest), `${label}: textbook audio hash must match its content`);
};

let wordCount = 0;
for (const unitEntry of wordsSection.units) {
  const unit = vocabulary.units.find((item) => item.id === unitEntry.unitId);
  assert.ok(unit, `${unitEntry.unitId}: vocabulary unit must exist`);
  assert.equal(unit.book, sourceBook, `${unitEntry.unitId}: must belong to the pilot textbook`);
  assert.equal(unitEntry.title, unit.title, `${unitEntry.unitId}: title must match the unit vocabulary`);
  assert.equal(unitEntry.words.length, unit.words.length, `${unitEntry.unitId}: word count must match the unit vocabulary`);
  assert.deepEqual(unitEntry.words.map((word) => word.id), unit.words.map((word) => word.id), `${unitEntry.unitId}: order must follow the unit vocabulary`);
  const ids = unitEntry.words.map((word) => word.id);
  assert.equal(new Set(ids).size, ids.length, `${unitEntry.unitId}: word identities must be unique`);

  const expected = textbookPhonetics[unitEntry.unitId];
  assert.equal(Object.keys(expected).length, unit.words.length, `${unitEntry.unitId}: expected phonetic coverage`);

  for (const word of unitEntry.words) {
    wordCount += 1;
    const source = unit.words.find((item) => item.id === word.id);
    const english = source.english.toLowerCase();
    const keys = ['id', 'phonetic', ...(word.illustration ? ['illustration'] : [])];
    assert.deepEqual(Object.keys(word).sort(), keys.sort(), `${word.id}: only identity, phonetic and optional illustration belong in the manifest`);
    assert.ok(expected[english], `${word.id}: unexpected phonetic entry`);
    assert.equal(word.phonetic, expected[english], `${word.id}: phonetic must match the textbook word list exactly`);
    assert.ok(word.phonetic.startsWith('/') && word.phonetic.endsWith('/'), `${word.id}: phonetic must be slash-delimited`);
    assert.doesNotMatch(word.phonetic, /\((英|美|UK|US)\)|British|American/i, `${word.id}: follow-along must not label UK or US pronunciation`);

    verifyAudio(source, word.id);

    if (word.illustration) {
      assert.ok(word.illustration.alt.trim().length > 0, `${word.id}: accessible description required`);
      assert.equal(word.illustration.provenance, 'original');
      assert.equal(word.illustration.license, 'original');
      assert.ok(word.illustration.path.startsWith('/assets/word-learning/grade-3-upper-unit-1/'));
      const file = path.basename(word.illustration.path);
      assert.ok(localAssets.has(file), `${word.id}: illustration file missing`);
      const svg = fs.readFileSync(path.join(assetRoot, file), 'utf8');
      assert.match(svg, /^<svg\b/);
      assert.match(svg, /<title>/, `${word.id}: SVG must have a title`);
    }
  }
}

assert.equal(wordCount, 107, 'the whole textbook word list must be covered');
const illustrated = wordsSection.units.flatMap((unit) => unit.words).filter((word) => word.illustration);
assert.equal(illustrated.length, 15, 'Unit 1 original illustrations must be retained');

const expressionTranslations = {
  1: ['你好！我是迈克·布莱克。', '嗨！我叫吴斌斌。', '见到你很高兴。', '见到你（我）也很高兴。', '噢，不！', '没关系，陈杰。', '嘿，萨拉！我们可以分享。', '谢谢，萨拉。/ 谢谢你，陈杰。', '我对我的朋友们很好。'],
  2: ['这是我的奶奶。', '看！这是我的家庭。', '那是你弟弟吗？', '对，是的。', '他们互相关爱。'],
  3: ['早上好，迈克！', '早上好！进来吧。', '你有宠物吗？', '不，我没有。', '是的，我有。我有一只猫。', '我们一起去动物园吧！', '太好了！', '这是什么？', '是只狐狸。', '怀特老师，那是什么？', '是一只小熊猫。'],
  4: ['迈克，你喜欢苹果吗？', '是的，我喜欢。你呢？', '不，我不喜欢。', '你们喜欢农场吗？', '我喜欢新鲜的空气。', '我们可以新种些树。', '植物可以给予我们很多东西。'],
  5: ['它是什么颜色？', '它是橙红色。', '红色加蓝色是紫色。', '你喜欢什么颜色？', '我喜欢红色和粉色。', '我们一起画一些紫色和棕色的鸟吧。', '再次利用！', '小心！'],
  6: ['你几岁了？', '我五岁了。', '我也是。', '几个苹果？', '两个。', '好极了！我们一起去商店吧！', '（共）十元，谢谢。', '给您。', '七点了。快点！', '生日快乐！', '噢，再切一块给小狗。']
};

assert.equal(expressionsSection.units.length, 6, 'all six expression lists must be present');
assert.deepEqual(expressionsSection.units.map((unit) => unit.title), ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5', 'Unit 6']);
let expressionCount = 0;
for (let n = 1; n <= 6; n += 1) {
  const unitEntry = expressionsSection.units[n - 1];
  assert.equal(unitEntry.unitId, `hosted-default:expressions:${n}`);
  assert.deepEqual(Object.keys(unitEntry).sort(), ['title', 'unitId'], `${unitEntry.unitId}: expression units need only identity and title`);
  const unit = vocabulary.units.find((item) => item.id === unitEntry.unitId);
  assert.ok(unit, `${unitEntry.unitId}: vocabulary unit must exist`);
  assert.equal(unit.book, sourceBook);
  assert.equal(unit.category, 'expressions');
  assert.equal(unit.title, `常用表达 · ${unitEntry.title}`);
  assert.equal(unit.words.length, expressionTranslations[n].length, `${unitEntry.unitId}: expression count must match the textbook page`);
  unit.words.forEach((word, index) => {
    expressionCount += 1;
    assert.equal(word.meaning, expressionTranslations[n][index], `${word.id}: Chinese must match the textbook expression page`);
    verifyAudio(word, word.id);
  });
}
assert.equal(expressionCount, 51, 'the whole textbook expression list must be covered');

for (const unit of vocabulary.units) {
  for (const word of unit.words) {
    let depth = 0;
    for (const char of word.meaning) {
      if (char === '(' || char === '（') depth += 1;
      else if (char === ')' || char === '）') depth -= 1;
      assert.ok(depth >= 0, `${word.id}: Chinese meaning closes a parenthesis it never opened: ${word.meaning}`);
    }
    assert.equal(depth, 0, `${word.id}: Chinese meaning has an unclosed parenthesis: ${word.meaning}`);
  }
}

console.log('Passed: 6 units / 107 words with exact textbook phonetics, plus 6 expression pages / 51 sentences with textbook translations and one-to-one textbook audio.');
