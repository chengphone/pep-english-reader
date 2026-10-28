export type OcrLine = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }
export type ExpressionCandidate = { unit: string; english: string; englishConfidence: number; meaningLines: OcrLine[] }
export function expressionHeading(text: string): string | undefined {
 const clean = text.trim().replace(/[\s.]+/g, '')
 const match = clean.match(/^unit(\d+|[lI|\]sSé])$/i)
 if (!match) return
 const digit = /^[lI|\]]$/.test(match[1]) ? '1' : /^[sS]$/.test(match[1]) ? '5' : match[1] === 'é' ? '6' : match[1]
 return 'Unit ' + Number(digit)
}
export function cleanExpression(text: string) {
 return text.normalize('NFKC').replace(/[’‘]/g, "'").replace(/\|/g, 'I').replace(/\s+/g, ' ').trim()
}
export function looksLikeExpression(line: OcrLine) {
 const text = cleanExpression(line.text)
 return line.confidence >= 75 && /[a-z]{2}/.test(text) && !/\p{Script=Han}/u.test(text) && !/^unit\b|useful|expressions|vocabulary|words in/i.test(text)
}
// Match both OCR passes by position: Chinese rows must delimit English paragraphs even
// when the English-only model turns those Chinese characters into Latin gibberish.
export function collectExpressions(english: OcrLine[], mixed: OcrLine[], initialUnit: string) {
 const rows: { english?: OcrLine; mixed?: OcrLine; y: number }[] = english.map(line => ({ english: line, y: (line.bbox.y0 + line.bbox.y1) / 2 }))
 for (const line of mixed) {
  const y = (line.bbox.y0 + line.bbox.y1) / 2
  const near = rows.filter(row => !row.mixed && Math.abs(row.y - y) < Math.max(8, line.bbox.y1 - line.bbox.y0) * .65).sort((a,b) => Math.abs(a.y-y)-Math.abs(b.y-y))[0]
  if (near) near.mixed = line
  else rows.push({ mixed: line, y })
 }
 rows.sort((a,b) => a.y-b.y)
 let unit = initialUnit, pending: ExpressionCandidate | undefined
 const candidates: ExpressionCandidate[] = []
 const flush = () => { if (pending && pending.unit) candidates.push(pending); pending = undefined }
 for (const row of rows) {
  const heading = expressionHeading(row.mixed?.text ?? '') ?? expressionHeading(row.english?.text ?? '')
  if (heading) { flush(); unit = heading; continue }
  const alternatives = [row.english, row.mixed].filter((line): line is OcrLine => !!line)
  const chinese = alternatives.find(line => /\p{Script=Han}/u.test(line.text))
  const observedEnglish = alternatives.find(looksLikeExpression)
  // Clear Han text in the bilingual pass takes precedence over hallucinated Latin.
  const line = chinese && (chinese.text.match(/\p{Script=Han}/gu)?.length ?? 0) >= 2 ? undefined : observedEnglish
  if (line && unit) {
   if (pending?.meaningLines.length) flush()
   if (!pending) pending = { unit, english: '', englishConfidence: 100, meaningLines: [] }
   pending.english += (pending.english ? ' ' + cleanExpression(line.text) : cleanExpression(line.text).replace(/^[a-z]/,letter=>letter.toUpperCase()))
   pending.englishConfidence = Math.min(pending.englishConfidence, line.confidence)
  } else if (pending) {
   const meaning = row.mixed ?? row.english
   if (meaning) pending.meaningLines.push(meaning)
  }
 }
 flush()
 return { candidates, lastUnit: unit }
}
