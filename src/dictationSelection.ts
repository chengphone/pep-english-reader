import type { VocabularyWord } from './vocabularyExtraction'
export function createDictationQueue(words:VocabularyWord[], count:number, random:()=>number=Math.random) {
 const queue=words.filter(word=>word.english.trim()).map(word=>({...word}))
 for(let i=queue.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]]}
 return queue.slice(0,Math.max(0,Math.min(queue.length,Math.floor(count)||0)))
}
