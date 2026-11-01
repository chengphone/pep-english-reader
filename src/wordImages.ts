import { wordImageFiles } from './wordImages.generated.ts'

export type WordIllustration={path:string;alt:string;provenance:string;license:string}
export type WordImage={src:string;alt:string}

// Generated files are named after the normalized word; only these three need an alias.
const aliases:Record<string,string>={nice:'greeting','o-clock':'oclock',animal:'zoo'}

export function normalizeWordImageKey(word:string){return word.trim().toLowerCase().replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'')}

export function generatedWordImage(word:string){
 const key=normalizeWordImageKey(word),file=aliases[key]??key
 return file&&wordImageFiles.has(file)?`assets/word-learning/generated/${file}.png`:undefined
}

export function wordImage(word:string,illustration?:WordIllustration):WordImage|undefined{
 const generated=generatedWordImage(word)
 if(generated)return {src:generated,alt:`${word} 插画`}
 if(illustration?.provenance==='original'&&illustration.license==='original')return {src:illustration.path,alt:illustration.alt}
 return undefined
}

// Expression pages show sentences, so they never carry a word illustration.
export function wordImageForSection(sectionId:string,word:string,illustration?:WordIllustration){return sectionId==='words'?wordImage(word,illustration):undefined}
