import type { VocabularyUnit, VocabularyWord } from './vocabularyExtraction'
export function normalizeWordIds(words:VocabularyWord[]):VocabularyWord[]{
 const reserved=new Set(words.filter(Boolean).map(word=>word.id)),used=new Set<string>()
 return words.map(word=>{
  if(!word||typeof word.id!=='string')return word
  if(!used.has(word.id)){used.add(word.id);return word}
  let index=2,id:string
  do{id=`${word.id}~${index++}`}while(reserved.has(id)||used.has(id))
  used.add(id);return {...word,id}
 })
}
export function normalizeUnitWordIds(unit:VocabularyUnit):VocabularyUnit{
 if(!unit||!Array.isArray(unit.words))return unit
 return {...unit,words:normalizeWordIds(unit.words)}
}
const key=(text:string)=>text.normalize('NFKC').toLowerCase().trim()
export function mergeVocabularyWords(existing:VocabularyWord[],incoming:VocabularyWord[]):VocabularyWord[]{
 const result=[...normalizeWordIds(existing)]
 for(const word of incoming){
  const sameId=result.findIndex(old=>old.id===word.id)
  if(sameId>=0){if(key(result[sameId].english)!==key(word.english))result[sameId]={...word};continue}
  if(!result.some(old=>key(old.english)===key(word.english)))result.push({...word})
 }
 return normalizeWordIds(result)
}
