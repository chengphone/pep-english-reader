// 生词表用的是词典原形（fold one's arms、untie、steep），
// 故事正文却常常是屈折形式（folded his arms、untying、steeper）。
// 定位时把原形展开成常见词形，并允许短语中间插入代词或宾语，
// 例如 chase away → chased the demon away。
const IRREGULAR: Record<string, string[]> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  bear: ['bore', 'borne', 'born'],
  beat: ['beaten'],
  become: ['became'],
  begin: ['began', 'begun'],
  bend: ['bent'],
  bind: ['bound'],
  bite: ['bit', 'bitten'],
  blow: ['blew', 'blown'],
  break: ['broke', 'broken'],
  bring: ['brought'],
  build: ['built'],
  burn: ['burnt'],
  buy: ['bought'],
  catch: ['caught'],
  choose: ['chose', 'chosen'],
  cling: ['clung'],
  come: ['came'],
  creep: ['crept'],
  cut: ['cut'],
  deal: ['dealt'],
  dig: ['dug'],
  do: ['does', 'did', 'done'],
  draw: ['drew', 'drawn'],
  drink: ['drank', 'drunk'],
  drive: ['drove', 'driven'],
  eat: ['ate', 'eaten'],
  fall: ['fell', 'fallen'],
  feed: ['fed'],
  feel: ['felt'],
  fight: ['fought'],
  find: ['found'],
  flee: ['fled'],
  fly: ['flew', 'flown'],
  forget: ['forgot', 'forgotten'],
  forgive: ['forgave', 'forgiven'],
  freeze: ['froze', 'frozen'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  go: ['went', 'gone'],
  good: ['better', 'best'],
  grow: ['grew', 'grown'],
  hang: ['hung'],
  have: ['has', 'had'],
  hear: ['heard'],
  hide: ['hid', 'hidden'],
  hold: ['held'],
  keep: ['kept'],
  kneel: ['knelt'],
  know: ['knew', 'known'],
  lay: ['laid'],
  lead: ['led'],
  leap: ['leapt'],
  leave: ['left'],
  lend: ['lent'],
  let: ['let'],
  lie: ['lay', 'lain'],
  light: ['lit'],
  lose: ['lost'],
  make: ['made'],
  mean: ['meant'],
  meet: ['met'],
  pay: ['paid'],
  ride: ['rode', 'ridden'],
  ring: ['rang', 'rung'],
  rise: ['rose', 'risen'],
  run: ['ran'],
  say: ['said'],
  see: ['saw', 'seen'],
  seek: ['sought'],
  sell: ['sold'],
  send: ['sent'],
  set: ['set'],
  shake: ['shook', 'shaken'],
  shine: ['shone'],
  shoot: ['shot'],
  show: ['shown'],
  sing: ['sang', 'sung'],
  sink: ['sank', 'sunk'],
  sit: ['sat'],
  slide: ['slid'],
  smell: ['smelt'],
  speak: ['spoke', 'spoken'],
  speed: ['sped'],
  spell: ['spelt'],
  spend: ['spent'],
  spin: ['spun'],
  spoil: ['spoilt'],
  spring: ['sprang', 'sprung'],
  stand: ['stood'],
  steal: ['stole', 'stolen'],
  stick: ['stuck'],
  sting: ['stung'],
  stink: ['stank', 'stunk'],
  stride: ['strode'],
  strike: ['struck'],
  strive: ['strove', 'striven'],
  swear: ['swore', 'sworn'],
  sweep: ['swept'],
  swell: ['swollen'],
  swim: ['swam', 'swum'],
  swing: ['swung'],
  take: ['took', 'taken'],
  teach: ['taught'],
  tear: ['tore', 'torn'],
  tell: ['told'],
  think: ['thought'],
  throw: ['threw', 'thrown'],
  tread: ['trod', 'trodden'],
  understand: ['understood'],
  wake: ['woke', 'woken'],
  wear: ['wore', 'worn'],
  weep: ['wept'],
  win: ['won'],
  wind: ['wound'],
  withdraw: ['withdrew', 'withdrawn'],
  write: ['wrote', 'written'],
}

const BASE_BY_FORM = new Map<string, string>()
for (const [base, forms] of Object.entries(IRREGULAR)) {
  for (const form of forms) if (form !== base) BASE_BY_FORM.set(form, base)
}

const PLACEHOLDERS: Record<string, 'pronoun' | 'any'> = {
  "one's": 'pronoun',
  oneself: 'pronoun',
  yourself: 'pronoun',
  yourselves: 'pronoun',
  myself: 'pronoun',
  himself: 'pronoun',
  herself: 'pronoun',
  itself: 'pronoun',
  ourselves: 'pronoun',
  themselves: 'pronoun',
  someone: 'any',
  somebody: 'any',
  something: 'any',
  sb: 'any',
  sth: 'any',
  '...': 'any',
}

const PRONOUNS = new Set([
  'one', 'oneself', 'myself', 'yourself', 'yourselves', 'himself', 'herself', 'itself',
  'ourselves', 'themselves', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'me', 'you', 'him', 'us', 'them',
])

const ARTICLES = new Set(['a', 'an', 'the'])
const MAX_GAP = 8

interface HeadPart {
  placeholder?: 'pronoun' | 'any'
  variants?: Set<string>
}

function isVowel(value: string) {
  return 'aeiou'.includes(value)
}

function endsConsonantVowelConsonant(word: string) {
  if (word.length < 3) return false
  const last = word[word.length - 1]
  if ('wxy'.includes(last)) return false
  return !isVowel(word[word.length - 3]) && isVowel(word[word.length - 2]) && !isVowel(last)
}

function addRegularForms(target: Set<string>, word: string) {
  if (!word) return
  const add = (value: string) => target.add(value)
  if (/(s|x|z|ch|sh|o)$/.test(word)) add(`${word}es`)
  else if (/[^aeiou]y$/.test(word)) add(`${word.slice(0, -1)}ies`)
  else add(`${word}s`)
  if (/[^aeiou]y$/.test(word)) add(`${word.slice(0, -1)}ied`)
  else if (/e$/.test(word)) add(`${word}d`)
  else add(`${word}ed`)
  if (endsConsonantVowelConsonant(word)) add(`${word}${word[word.length - 1]}ed`)
  if (/ie$/.test(word)) add(`${word.slice(0, -2)}ying`)
  else if (/e$/.test(word) && !/ee$/.test(word)) add(`${word.slice(0, -1)}ing`)
  else add(`${word}ing`)
  if (endsConsonantVowelConsonant(word)) add(`${word}${word[word.length - 1]}ing`)
  if (/[^aeiou]y$/.test(word)) {
    add(`${word.slice(0, -1)}ier`)
    add(`${word.slice(0, -1)}iest`)
    add(`${word.slice(0, -1)}ily`)
  } else if (/e$/.test(word)) {
    add(`${word}r`)
    add(`${word}st`)
  } else {
    add(`${word}er`)
    add(`${word}est`)
  }
  if (endsConsonantVowelConsonant(word)) {
    add(`${word}${word[word.length - 1]}er`)
    add(`${word}${word[word.length - 1]}est`)
  }
  add(`${word}ly`)
}

export function wordForms(word: string): Set<string> {
  const result = new Set<string>()
  const seen = new Set<string>()
  const visit = (token: string) => {
    if (!token || seen.has(token)) return
    seen.add(token)
    result.add(token)
    for (const form of IRREGULAR[token] ?? []) result.add(form)
    const base = BASE_BY_FORM.get(token)
    if (base) visit(base)
    addRegularForms(result, token)
  }
  visit(word.toLowerCase().replace(/[’‘]/g, "'"))
  return result
}

function tokenize(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bcan't\b/g, 'can not')
    .replace(/\b(\p{L}+)n't\b/gu, '$1 not')
    .replace(/'s\b/g, '')
    .split(/[^\p{L}\p{N}']+/u)
    .flatMap(token => token.split("'"))
    .filter(Boolean)
}

function parseHeadword(word: string): HeadPart[] {
  let cleaned = word.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").trim()
  if (!/\.\.\.$/.test(cleaned)) cleaned = cleaned.replace(/[.!?;:,]+$/g, '')
  cleaned = cleaned.replace(/^[^\p{L}\p{N}]+/u, '')
  const parts: HeadPart[] = []
  for (const raw of cleaned.split(/[\s\-–—]+/)) {
    const token = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, '')
    if (!token) continue
    const placeholder = PLACEHOLDERS[token]
    if (placeholder) parts.push({ placeholder })
    else if (!ARTICLES.has(token)) parts.push({ variants: wordForms(token) })
  }
  return parts
}

function matchFrom(tokens: string[], index: number, parts: HeadPart[], partIndex: number, first: boolean): boolean {
  if (partIndex === parts.length) return true
  const part = parts[partIndex]
  const gap = first ? 0 : MAX_GAP
  if (part.placeholder === 'pronoun') {
    for (let offset = 0; offset <= gap && index + offset < tokens.length; offset++) {
      if (PRONOUNS.has(tokens[index + offset]) && matchFrom(tokens, index + offset + 1, parts, partIndex + 1, false)) return true
    }
    return false
  }
  if (part.placeholder === 'any') {
    for (let skip = 0; skip <= 2 && index + skip <= tokens.length; skip++) {
      if (matchFrom(tokens, index + skip, parts, partIndex + 1, false)) return true
    }
    return false
  }
  for (let offset = 0; offset <= gap && index + offset < tokens.length; offset++) {
    if (part.variants?.has(tokens[index + offset]) && matchFrom(tokens, index + offset + 1, parts, partIndex + 1, false)) return true
  }
  return false
}

export function sentenceMatchesWord(text: string, word: string): boolean {
  const parts = parseHeadword(word)
  if (!parts.length) return false
  const tokens = tokenize(text)
  for (let start = 0; start < tokens.length; start++) {
    if (matchFrom(tokens, start, parts, 0, true)) return true
  }
  return false
}

export interface WordLocation {
  pageIndex: number
  sentenceId: string
  text: string
}

export function locateWord(pages: { sentences: { id: string; text: string }[] }[], word: string): WordLocation | null {
  for (const [pageIndex, page] of pages.entries()) {
    for (const sentence of page.sentences) {
      if (sentenceMatchesWord(sentence.text, word)) return { pageIndex, sentenceId: sentence.id, text: sentence.text }
    }
  }
  return null
}
