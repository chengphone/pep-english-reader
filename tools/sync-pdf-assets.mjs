import { cpSync, mkdirSync } from 'node:fs'
const target = new URL('../public/pdfjs/wasm/', import.meta.url)
mkdirSync(target, { recursive: true })
cpSync(new URL('../node_modules/pdfjs-dist/wasm/', import.meta.url), target, { recursive: true })

for (const name of ["cmaps", "standard_fonts", "iccs"]) {
  cpSync(new URL(`../node_modules/pdfjs-dist/${name}/`, import.meta.url), new URL(`../public/pdfjs/${name}/`, import.meta.url), { recursive: true })
}
