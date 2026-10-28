import { writeFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'

const scenes = [
  { unit: 'UNIT 1 · OUR SCHOOL', title: 'A new school day', a: 'Good morning, Mia!', b: 'Good morning, Leo!', c: 'What do we have today?', d: 'We have English and art.' },
  { unit: 'UNIT 2 · MY FRIENDS', title: 'Meet my friend', a: 'This is my friend, Sam.', b: 'Hello, Sam. Nice to meet you!', c: 'Nice to meet you, too.', d: 'Let’s play after class!' },
  { unit: 'UNIT 3 · AFTER SCHOOL', title: 'What can you do?', a: 'What can you do, Lily?', b: 'I can sing and dance.', c: 'Can you play football?', d: 'Yes, I can. Let’s go!' },
]
const manifest = { schemaVersion: 1, bookId: 'pep-original-demo-v1', title: 'PEP 原创点读体验', publisherId: 'pep', grade: 5, term: 'a', edition: '原创演示', pages: [] }
const entries = { 'book.json': strToU8(JSON.stringify(manifest)) }
for (let i = 0; i < scenes.length; i++) {
  const n = i + 1, scene = scenes[i], path = `pages/${String(n).padStart(3, '0')}.svg`
  const lines = [scene.a, scene.b, scene.c, scene.d]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100"><rect width="800" height="1100" fill="#fffdf7"/><rect x="35" y="35" width="730" height="1030" rx="18" fill="none" stroke="#e6e0d3" stroke-width="2"/><text x="75" y="105" fill="#4a9770" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="3">${scene.unit}</text><text x="75" y="175" fill="#263b31" font-family="Arial,sans-serif" font-size="39" font-weight="700">${scene.title}</text><rect x="72" y="225" width="656" height="220" rx="20" fill="#edf6ee"/><circle cx="198" cy="332" r="57" fill="#f6c377"/><circle cx="198" cy="323" r="24" fill="#614735"/><circle cx="180" cy="332" r="4" fill="#263b31"/><circle cx="215" cy="332" r="4" fill="#263b31"/><path d="M184 351q14 12 28 0" fill="none" stroke="#263b31" stroke-width="3"/><rect x="151" y="379" width="94" height="55" rx="24" fill="#68a8ce"/><circle cx="604" cy="332" r="57" fill="#e7a28b"/><path d="M551 322q5-50 53-48t53 48" fill="#6b4939"/><circle cx="586" cy="332" r="4" fill="#263b31"/><circle cx="621" cy="332" r="4" fill="#263b31"/><path d="M590 351q14 12 28 0" fill="none" stroke="#263b31" stroke-width="3"/><rect x="557" y="379" width="94" height="55" rx="24" fill="#79b68c"/><path d="M246 280h278q21 0 21 20v47q0 20-21 20H344l-27 24 6-24h-77q-21 0-21-20v-47q0-20 21-20" fill="#fff" stroke="#ceddcf" stroke-width="2"/><text x="270" y="318" fill="#334a3c" font-family="Arial,sans-serif" font-size="20">${lines[0]}</text><text x="270" y="347" fill="#334a3c" font-family="Arial,sans-serif" font-size="20">${lines[1]}</text><rect x="72" y="495" width="656" height="393" rx="20" fill="#fff" stroke="#e6ece6" stroke-width="2"/><text x="104" y="546" fill="#91a397" font-family="Arial,sans-serif" font-size="16" letter-spacing="2">LISTEN AND SAY</text><rect x="105" y="583" width="560" height="101" rx="15" fill="#f4f7f2"/><circle cx="144" cy="633" r="20" fill="#dcefe1"/><text x="136" y="640" fill="#39815a" font-family="Arial,sans-serif" font-size="18">1</text><text x="182" y="641" fill="#31463a" font-family="Arial,sans-serif" font-size="24">${lines[2]}</text><rect x="105" y="710" width="560" height="101" rx="15" fill="#f4f7f2"/><circle cx="144" cy="760" r="20" fill="#dcefe1"/><text x="136" y="767" fill="#39815a" font-family="Arial,sans-serif" font-size="18">2</text><text x="182" y="768" fill="#31463a" font-family="Arial,sans-serif" font-size="24">${lines[3]}</text><text x="702" y="1018" fill="#92a097" font-family="Arial,sans-serif" font-size="18">${n}</text></svg>`
  entries[path] = strToU8(svg)
  manifest.pages.push({ page: n, printedPage: n, image: path, items: [
    { id: `p${n}01`, text: lines[0], order: 1, rects: [[.26,.245,.71,.345]] },
    { id: `p${n}02`, text: lines[1], order: 2, rects: [[.26,.275,.71,.37]] },
    { id: `p${n}03`, text: lines[2], order: 3, rects: [[.21,.53,.86,.63]] },
    { id: `p${n}04`, text: lines[3], order: 4, rects: [[.21,.65,.86,.75]] },
  ] })
}
entries['book.json'] = strToU8(JSON.stringify(manifest, null, 2))
writeFileSync(new URL('../public/demo-pep-sample.zip', import.meta.url), zipSync(entries, { level: 6 }))
console.log('Wrote public/demo-pep-sample.zip')
