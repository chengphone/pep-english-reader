import {test,expect} from '@playwright/test'

async function seedAudio(page:any,record:{voice:string;hostedFile?:string}){
 await page.evaluate(async(record:{voice:string;hostedFile?:string})=>{
  const m=await import('/pep-english-reader/src/wordAudio.ts')
  // Creates the object store on the first visit, as a fresh browser would.
  await m.listLocalWordAudios()
  const db:any=await new Promise((resolve,reject)=>{const request=indexedDB.open('pep-word-audio',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
  const stored={key:'apple',text:'apple',voice:record.voice,...(record.hostedFile?{hostedFile:record.hostedFile}:{}),updatedAt:1,bytes:new TextEncoder().encode('ID3-local-audio').buffer,mime:'audio/mpeg'}
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put(stored);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})
  db.close()
 },record)
}

test('locally imported audio does not wait for a stalled hosted audio list',async({page})=>{
 await page.route('**/audio/library-manifest.json*',()=>new Promise(()=>{}))
 await page.goto('./')
 await seedAudio(page,{key:'apple',text:'apple',voice:'导入音频',updatedAt:1,bytes:new TextEncoder().encode('ID3-local-audio').buffer,mime:'audio/mpeg'})
 const result=await page.evaluate(async()=>{
  const m=await import('/pep-english-reader/src/wordAudio.ts')
  return Promise.race([
   m.readWordAudios(['apple']).then(map=>map.get('apple')?.voice??'missing'),
   new Promise(resolve=>setTimeout(()=>resolve('timeout'),4000)),
  ])
 })
 expect(result).toBe('导入音频')
})

test('a hosted recording replaced in the audio list is downloaded again',async({page})=>{
 const oldFile='audio/library/'+('a'.repeat(64))+'.mp3',newFile='audio/library/'+('b'.repeat(64))+'.mp3'
 await page.route('**/audio/library-manifest.json*',route=>route.fulfill({json:{schemaVersion:1,voice:'Aria',items:[{text:'apple',file:newFile}]}}))
 await page.route('**/audio/library/*.mp3',route=>route.fulfill({contentType:'audio/mpeg',body:Buffer.from('ID3-new-audio')}))
 await page.goto('./')
 await seedAudio(page,{key:'apple',text:'apple',voice:'网站音频 · Aria',hostedFile:oldFile,updatedAt:1,bytes:new TextEncoder().encode('ID3-old-audio').buffer,mime:'audio/mpeg'})
 const record=await page.evaluate(async()=>{
  const m=await import('/pep-english-reader/src/wordAudio.ts')
  const found=(await m.readWordAudios(['apple'])).get('apple')
  return found?{hostedFile:found.hostedFile,voice:found.voice,size:found.blob.size}:'missing'
 })
 expect(record).toMatchObject({hostedFile:newFile,voice:'网站音频 · Aria'})
 expect((record as any).size).toBeGreaterThan(3)
})
