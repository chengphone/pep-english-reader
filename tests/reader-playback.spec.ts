import {test,expect,type Page} from '@playwright/test'
const failures=new WeakMap<Page,string[]>()
test.beforeEach(async({page})=>{const errors:string[]=[];failures.set(page,errors);page.on('pageerror',e=>errors.push(e.message));await page.goto('./tests/fixtures/playback.html');await expect(page.getByRole('heading')).toHaveText('Reader playback regression fixture')})
test.afterEach(async({page})=>{expect(failures.get(page)).toEqual([]);await expect(page.locator('vite-error-overlay')).toHaveCount(0)})
const status=(page:Page)=>page.getByLabel('playback status',{exact:true})
async function mediaEvent(page:Page,index:number,event:string){await page.evaluate(({index,event})=>{const m=(window as any).__media[index];m.element.dispatchEvent(new Event(event))},{index,event})}
async function settle(page:Page,index:number,attempt=0,reject=false){await page.evaluate(({index,attempt,reject})=>{const a=(window as any).__media[index].attempts[attempt];reject?a.reject(new Error('late failure')):a.resolve()},{index,attempt,reject})}
async function count(page:Page,n:number){await expect.poll(()=>page.evaluate(()=>(window as any).__media.length)).toBe(n)}
test('an old play promise cannot revive playback after an audio error',async({page})=>{
 await page.getByRole('button',{name:'Play A',exact:true}).click();await count(page,1);await mediaEvent(page,0,'error');await expect(status(page)).toHaveText('error')
 await settle(page,0);await expect(status(page)).toHaveText('error')
})
for(const reject of [false,true])test(`settling the previous sentence's play promise cannot change the next sentence (${reject?'reject':'resolve'})`,async({page})=>{
 await page.getByRole('button',{name:'Play queue',exact:true}).click();await count(page,1);await mediaEvent(page,0,'ended');await count(page,2)
 await expect(page.getByLabel('selected sentence')).toHaveText('B');await expect(status(page)).toHaveText('loading')
 await settle(page,0,0,reject);await expect(status(page)).toHaveText('loading')
 await settle(page,1);await expect(status(page)).toHaveText('playing')
})
test('pause during a pending play prevents its eventual resolve from restarting the UI',async({page})=>{
 await page.getByRole('button',{name:'Play A',exact:true}).click();await count(page,1)
 await page.getByRole('button',{name:'Pause or resume'}).click();await expect(status(page)).toHaveText('paused')
 await settle(page,0);await expect(status(page)).toHaveText('paused')
 await page.getByRole('button',{name:'Pause or resume'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__media[0].attempts.length)).toBe(2)
 await settle(page,0,1);await expect(status(page)).toHaveText('playing')
})
test('a late resume rejection cannot destroy a newer resume attempt',async({page})=>{
 await page.getByRole('button',{name:'Play A',exact:true}).click();await settle(page,0);await expect(status(page)).toHaveText('playing')
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'Pause or resume'}).click()
 await expect(status(page)).toHaveText('paused')
 await page.getByRole('button',{name:'Pause or resume'}).click()
 await settle(page,0,1,true);await expect(status(page)).toHaveText('loading')
 await settle(page,0,2);await expect(status(page)).toHaveText('playing')
})
test('stop and a different selected sentence invalidate all older events',async({page})=>{
 await page.getByRole('button',{name:'Play A',exact:true}).click();await page.getByRole('button',{name:'Stop',exact:true}).click()
 await settle(page,0);await expect(status(page)).toHaveText('idle')
 await page.getByRole('button',{name:'Play B',exact:true}).click();await settle(page,0,0,true);await expect(status(page)).toHaveText('loading')
 await settle(page,1);await expect(status(page)).toHaveText('playing')
})
test('an ended event during pause advances exactly once after resume',async({page})=>{
 await page.getByRole('button',{name:'Play queue',exact:true}).click();await settle(page,0);await expect(status(page)).toHaveText('playing')
 await page.getByRole('button',{name:'Pause or resume'}).click();await mediaEvent(page,0,'ended');await count(page,1);await expect(status(page)).toHaveText('paused')
 await page.getByRole('button',{name:'Pause or resume'}).click();await count(page,2);await expect(page.getByLabel('selected sentence')).toHaveText('B')
})
test('repeat, speed, and stopping an infinite loop release media resources',async({page})=>{
 await page.getByRole('button',{name:'Repeat three',exact:true}).click();await page.getByRole('button',{name:'Play A',exact:true}).click()
 for(let n=0;n<3;n++){await settle(page,0,n);await mediaEvent(page,0,'ended')}
 await expect(status(page)).toHaveText('idle')
 await page.getByRole('button',{name:'Repeat forever',exact:true}).click();await page.getByRole('button',{name:'Play A',exact:true}).click();await settle(page,1);await page.getByRole('button',{name:'Faster',exact:true}).click()
 expect(await page.evaluate(()=>(window as any).__media[1].element.playbackRate)).toBe(1.25)
 await mediaEvent(page,1,'ended');await page.getByRole('button',{name:'Stop',exact:true}).click();await settle(page,1,1);await expect(status(page)).toHaveText('idle')
 expect(await page.evaluate(()=>(window as any).__revoked.length)).toBe(2)
})


test('a download finishing while paused waits for resume without downloading again',async({page})=>{
 let release:()=>void=()=>{},requested=false,downloads=0
 await page.route('**/audio/library-manifest.json*',async route=>{requested=true;await new Promise<void>(resolve=>release=resolve);await route.fulfill({json:{schemaVersion:1,items:[{text:'hosted-test',file:'audio/library/'+('a'.repeat(64))+'.mp3'}]}})})
 await page.route('**/audio/library/*.mp3',route=>{downloads++;return route.fulfill({contentType:'audio/mpeg',body:Buffer.from('ID3-fixture-audio')})})
 await page.getByRole('button',{name:'Play hosted',exact:true}).click();await expect.poll(()=>requested).toBe(true)
 await page.getByRole('button',{name:'Pause or resume'}).click();await expect(status(page)).toHaveText('paused');release()
 await expect.poll(()=>downloads).toBe(1)
 // The source appears only after readWordAudios and its save transaction have finished.
 await expect(page.getByLabel('playback source')).toContainText('网站音频')
 await count(page,0);await expect(status(page)).toHaveText('paused')
 await page.getByRole('button',{name:'Pause or resume'}).click();await count(page,1);await settle(page,0);await expect(status(page)).toHaveText('playing');expect(downloads).toBe(1)
})
test('stopping while a download is pending prevents late playback and releases resources on unmount',async({page})=>{
 let release:()=>void=()=>{},requested=false
 await page.route('**/audio/library-manifest.json*',async route=>{requested=true;await new Promise<void>(resolve=>release=resolve);await route.fulfill({json:{schemaVersion:1,items:[]}})})
 await page.getByRole('button',{name:'Play hosted',exact:true}).click();await expect.poll(()=>requested).toBe(true)
 await page.getByRole('button',{name:'Play B',exact:true}).click();await settle(page,0);await expect(status(page)).toHaveText('playing');release()
 await expect(page.getByLabel('selected sentence')).toHaveText('B')
 await page.evaluate(()=>(window as any).__unmount())
 expect(await page.evaluate(()=>(window as any).__revoked.length)).toBe(1)
 expect(await page.evaluate(()=>(window as any).__media[0].element.onended)).toBe(null)
})


test('the visible local reader can pause loading audio and clears it on page navigation',async({page})=>{
 await page.goto('./tests/fixtures/playback.html?ui=1')
 await page.getByRole('button',{name:'播放 A',exact:true}).click()
 const pause=page.getByRole('button',{name:'暂停朗读',exact:true});await expect(pause).toBeEnabled();await pause.click()
 await settle(page,0);await expect(page.getByRole('button',{name:'继续朗读',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'课本下一页',exact:true}).click();await expect(page.getByRole('button',{name:'播放选中句子',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'播放 B',exact:true}).click();await settle(page,1);await expect(page.getByRole('button',{name:'暂停朗读',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'停止朗读',exact:true}).click()
 await expect(page.getByRole('button',{name:'播放选中句子',exact:true})).toBeEnabled()
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'播放 B',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'阅读设置'})).toBeVisible();await expect(page.getByLabel('页面适应方式')).toBeHidden()
 await page.getByRole('button',{name:'阅读设置'}).click();await page.getByRole('button',{name:'点读区域'}).click();await page.getByRole('button',{name:'收起阅读设置'}).click();await expect(page.getByRole('button',{name:'点读区域'})).toBeHidden()
 await page.getByRole('button',{name:'音频设置'}).click();await expect(page.getByLabel('语速')).toBeVisible();await page.getByLabel('语速').selectOption('1.25');await page.getByRole('button',{name:'收起音频设置'}).click()
 await page.screenshot({path:'/tmp/pep-audit-20261029/playback-reader-mobile.png',fullPage:true})
 await page.setViewportSize({width:1440,height:1000});await expect(page.getByLabel('页面适应方式')).toBeVisible();await expect(page.getByLabel('语速')).toBeVisible();await page.screenshot({path:'/tmp/pep-audit-20261029/playback-reader-desktop.png',fullPage:true})
})
test('speech fallback remains paused when its start event arrives late',async({page})=>{
 await page.route('**/audio/library-manifest.json*',route=>route.fulfill({json:{schemaVersion:1,items:[]}}))
 await page.evaluate(()=>{
  const utterances:any[]=[];Object.assign(window,{__utterances:utterances})
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},resume(){},pause(){},getVoices(){return []},speak(u:any){utterances.push(u)}}})
 })
 await page.getByRole('button',{name:'Play hosted',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>(window as any).__utterances.length)).toBe(1)
 await page.getByRole('button',{name:'Pause or resume'}).click()
 await page.evaluate(()=>(window as any).__utterances[0].onstart())
 await expect(status(page)).toHaveText('paused')
 await page.getByRole('button',{name:'Pause or resume'}).click();await expect(status(page)).toHaveText('playing')
 await page.evaluate(()=>(window as any).__utterances[0].onend());await expect(status(page)).toHaveText('idle')
})
