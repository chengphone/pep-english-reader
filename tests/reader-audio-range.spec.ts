import {test,expect,type Page} from '@playwright/test'
const failures=new WeakMap<Page,string[]>()
test.beforeEach(async({page})=>{const errors:string[]=[];failures.set(page,errors);page.on('pageerror',e=>errors.push(e.message));await page.goto('./tests/fixtures/audioRange.html');await expect(page.getByRole('heading')).toHaveText('Audio range regression fixture')})
test.afterEach(async({page})=>{expect(failures.get(page)).toEqual([]);await expect(page.locator('vite-error-overlay')).toHaveCount(0)})
const status=(page:Page)=>page.getByLabel('playback status',{exact:true})
const source=(page:Page)=>page.getByLabel('playback source',{exact:true})
async function count(page:Page,n:number){await expect.poll(()=>page.evaluate(()=>(window as any).__media.length)).toBe(n)}
async function media(page:Page,index=0){return page.evaluate(index=>{const element=(window as any).__media[index].element;return{time:element.currentTime,seeking:element.seeking,paused:element.paused,readyState:element.readyState,pauses:element.pauses,src:element.src}},index)}
async function metadata(page:Page,index=0){await page.evaluate(index=>(window as any).__media[index].element.metadata(),index)}
async function seeked(page:Page,index=0){await page.evaluate(index=>(window as any).__media[index].element.seeked(),index)}
async function tick(page:Page,time:number,index=0){await page.evaluate(({index,time})=>(window as any).__media[index].element.tick(time),{index,time})}
test('a range item seeks to its start and stops at the clip end',async({page})=>{
 await page.getByRole('button',{name:'Play range',exact:true}).click();await count(page,1)
 await expect(source(page)).toHaveText('教材音频 · 0:02–0:04')
 await metadata(page)
 expect((await media(page)).time).toBe(2)
 // seek 尚未完成时，即使 timeupdate 仍报告旧位置，也不能误判为播完。
 await tick(page,9);await expect(status(page)).toHaveText('playing');expect((await media(page)).pauses).toBe(0)
 await seeked(page)
 await tick(page,2.5);await expect(status(page)).toHaveText('playing')
 await tick(page,3.98);await expect(status(page)).toHaveText('idle')
 const final=await media(page)
 expect(final.paused).toBe(true);expect(final.pauses).toBeGreaterThanOrEqual(1)
})
test('an item without a range keeps playing past the former clip end',async({page})=>{
 await page.getByRole('button',{name:'Play full',exact:true}).click();await count(page,1)
 await expect(source(page)).toHaveText('教材音频')
 await metadata(page);expect((await media(page)).time).toBe(0)
 await tick(page,4.5);await expect(status(page)).toHaveText('playing');expect((await media(page)).paused).toBe(false)
 await page.evaluate(()=>(window as any).__media[0].element.finish())
 await expect(status(page)).toHaveText('idle')
})
test('repeat replays the same clip range without playing past its end',async({page})=>{
 await page.getByRole('button',{name:'Repeat twice'}).click()
 await page.getByRole('button',{name:'Play range',exact:true}).click();await count(page,1)
 await metadata(page);await seeked(page)
 await tick(page,3.98);await expect(status(page)).toHaveText('playing')
 const second=await media(page)
 expect(second.time).toBe(2);expect(second.seeking).toBe(true)
 await seeked(page);await tick(page,3.98);await expect(status(page)).toHaveText('idle')
})
