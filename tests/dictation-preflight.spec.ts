import {test,expect} from '@playwright/test'

test('a stalled hosted audio list costs one timeout for the whole dictation round',async({page})=>{
 test.setTimeout(90000)
 await page.clock.install()
 await page.route('**/audio/library-manifest.json*',()=>new Promise(()=>{}))
 await page.goto('./?view=vocab')
 await page.getByRole('combobox',{name:'选择课本',exact:true}).selectOption('六年级英语上册 · PEP新版（E63 002015）')
 await page.getByRole('button',{name:'检查声音并开始',exact:true}).click()
 await expect(page.getByRole('button',{name:'正在准备声音…',exact:true})).toBeVisible()
 await page.clock.fastForward(16000)
 await expect(page.locator('.audio-preflight')).toContainText('本轮有 26 题未准备好声音',{timeout:10000})
})

test('a stalled round of original recordings returns what is ready instead of waiting per batch',async({page})=>{
 test.setTimeout(90000)
 await page.clock.install()
 await page.route('**/audio/library/*.mp3',()=>new Promise(()=>{}))
 await page.goto('./')
 void page.evaluate(async()=>{
  const m=await import('/pep-english-reader/src/textbookAudio.ts')
  const file='audio/library/'+('a'.repeat(64))+'.mp3'
  const words=Array.from({length:40},(_,index)=>({english:'word'+index,meaning:'',audio:{text:'word'+index,bookId:'test',file}}))
  const records=await m.resolveDictationAudios(words)
  ;(window as any).__resolveResult=records.map(Boolean)
 })
 // Give the module import and storage lookup real time to start the round; the
 // page clock only advances when the test asks it to.
 await page.waitForTimeout(1500)
 await page.clock.runFor(61000)
 await expect.poll(()=>page.evaluate(()=>(window as any).__resolveResult?.length),{timeout:15000}).toBe(40)
 expect(await page.evaluate(()=>(window as any).__resolveResult.filter(Boolean).length)).toBe(0)
})
