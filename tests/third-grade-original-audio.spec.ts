import {test,expect,type Page} from '@playwright/test'
import fs from 'node:fs/promises'
const corpus=JSON.parse(await fs.readFile(new URL('../public/data/default-vocabulary.json',import.meta.url),'utf8'))
const original=corpus.units.find((u:any)=>u.book==='3年级英语上册'&&u.title==='Unit 1').words.find((w:any)=>w.english==='name')
const errors=new WeakMap<Page,string[]>()
test.beforeEach(async({page})=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));await page.goto('./')})
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]))
async function choose(page:Page){
 await page.getByRole('button',{name:'单元默写',exact:true}).click();await page.getByRole('combobox',{name:'选择课本',exact:true}).selectOption('3年级英语上册')
 await page.getByRole('button',{name:'Unit 1',exact:true}).click();await page.getByRole('button',{name:'清空',exact:true}).click();await page.getByRole('checkbox',{name:'听写 name',exact:true}).check()
 await page.getByRole('combobox',{name:'每题播放次数'}).selectOption('1')
}
async function start(page:Page){await page.getByRole('button',{name:'开始听写',exact:true}).first().click()}
test('textbook recordings override old imported TTS, cache offline, and never synthesize missing originals',async({page,context})=>{
 test.setTimeout(60000)
 await page.evaluate(async()=>{
  const m=await import('/pep-english-reader/src/wordAudio.ts');await m.listLocalWordAudios()
  const db:any=await new Promise(resolve=>{const r=indexedDB.open('pep-word-audio',1);r.onsuccess=()=>resolve(r.result)})
  await new Promise<void>(resolve=>{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put({key:'name',text:'name',voice:'Aria TTS previously imported',updatedAt:1,bytes:new TextEncoder().encode('ID3-old-TTS').buffer,mime:'audio/mpeg'});tx.oncomplete=()=>resolve()});db.close()
  const speak=speechSynthesis.speak.bind(speechSynthesis);(window as any).__ttsCalls=0;speechSynthesis.speak=u=>{(window as any).__ttsCalls++;speak(u)}
 })
 await choose(page);await start(page)
 await expect(page.getByText(/已读 1 \/ 1 遍.*等待手动下一题/)).toBeVisible({timeout:15000})
 await expect(page.locator('.dictation-audio-source')).toHaveText('网站音频 · 教材原音')
 await expect(page.getByRole('checkbox',{name:'缺少音频时允许浏览器备用朗读'})).toBeDisabled()
 await page.getByRole('button',{name:'返回词表',exact:true}).click();await context.setOffline(true);await start(page)
 await expect(page.getByText(/已读 1 \/ 1 遍.*等待手动下一题/)).toBeVisible({timeout:15000})
 await page.getByRole('button',{name:'返回词表',exact:true}).click()
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const r=indexedDB.deleteDatabase('pep-textbook-audio');r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)}))
 await start(page);await expect(page.getByText(/本题教材原音未能加载/)).toBeVisible()
 expect(await page.evaluate(()=>(window as any).__ttsCalls)).toBe(0)
 const stillImported=await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/wordAudio.ts');return (await m.listLocalWordAudios()).find((a:any)=>a.key==='name')?.voice})
 expect(stillImported).toBe('Aria TTS previously imported')
})
test('original audio is still available online when local storage is blocked',async({page})=>{
 const size=await page.evaluate(async word=>{
  const open=indexedDB.open.bind(indexedDB);indexedDB.open=function(name,...args){if(name==='pep-textbook-audio')throw new DOMException('blocked','SecurityError');return open(name,...args)}
  const m=await import('/pep-english-reader/src/textbookAudio.ts');return (await m.readMaterialAudios([word])).get('name')?.blob.size
 },original)
 expect(size).toBeGreaterThan(100)
})
test('invalid or mismatched original audio never falls back to a generic TTS recording',async({page})=>{
 await page.route('**/'+original.audio.file,route=>route.fulfill({contentType:'text/html',body:'not an audio file'}))
 const sizes=await page.evaluate(async word=>{
  const m=await import('/pep-english-reader/src/textbookAudio.ts')
  return [(await m.readMaterialAudios([word])).size,(await m.readMaterialAudios([{...word,english:'changed text'}])).size]
 },original)
 expect(sizes).toEqual([0,0])
})
