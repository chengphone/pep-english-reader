import {test,expect} from '@playwright/test'
import fs from 'node:fs/promises'

test('follow-along still loads when IndexedDB is unavailable',async({page})=>{
  test.setTimeout(60000)
  await page.addInitScript(()=>{
    Object.defineProperty(window,'indexedDB',{get(){throw new Error('IndexedDB blocked')}})
  })
  await page.goto('./?view=followalong&book=tape3a_002013')
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:25000})
  await expect(page.locator('.followalong-card')).toBeVisible()
  await expect(page.locator('.followalong-error')).toHaveCount(0)
})

test('follow-along recovers when the vocabulary database never responds',async({page})=>{
  test.setTimeout(60000)
  await page.addInitScript(()=>{
    const hanging={open(){return {onupgradeneeded:null,onsuccess:null,onerror:null}}}
    Object.defineProperty(window,'indexedDB',{get(){return hanging}})
  })
  await page.goto('./?view=followalong&book=tape3a_002013')
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:30000})
  await expect(page.locator('.followalong-error')).toHaveCount(0)
})

test('a failed follow-along manifest shows an error and retry recovers',async({page})=>{
  test.setTimeout(60000)
  let fail=true
  await page.route('**/data/word-learning/tape3a_002013/manifest.json',route=>fail?route.fulfill({status:500,body:'unavailable'}):route.continue())
  await page.goto('./?view=followalong&book=tape3a_002013')
  await expect(page.locator('.followalong-error')).toContainText('跟读资料暂时无法加载',{timeout:25000})
  fail=false
  await page.getByRole('button',{name:'重试',exact:true}).click()
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:25000})
})

test('a slow follow-along manifest shows a slow-network notice with retry',async({page})=>{
  test.setTimeout(60000)
  await page.route('**/data/word-learning/tape3a_002013/manifest.json',async route=>{
    await new Promise(resolve=>setTimeout(resolve,11000))
    await route.continue()
  })
  await page.goto('./?view=followalong&book=tape3a_002013')
  await expect(page.getByText('网络较慢，正在继续加载…')).toBeVisible({timeout:15000})
  await expect(page.getByRole('button',{name:'重试',exact:true})).toBeVisible()
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:25000})
})

test('a stalled follow-along manifest fails instead of loading forever',async({page})=>{
  test.setTimeout(60000)
  await page.clock.install()
  await page.route('**/data/word-learning/tape3a_002013/manifest.json',()=>new Promise(()=>{}))
  await page.goto('./?view=followalong&book=tape3a_002013')
  await expect(page.locator('.followalong-status')).toBeVisible()
  await page.clock.fastForward(16000)
  await expect(page.locator('.followalong-error')).toContainText('网络请求超时',{timeout:10000})
})

test('an unknown follow-along unit recovers to the first available unit',async({page})=>{
  test.setTimeout(60000)
  await page.goto('./?view=followalong&book=tape3a_002013&unit=not-a-real-unit')
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:25000})
  await expect(page.locator('.followalong-error')).toHaveCount(0)
  await expect.poll(()=>new URL(page.url()).searchParams.get('unit')).toBeTruthy()
  expect(new URL(page.url()).searchParams.get('unit')).not.toBe('not-a-real-unit')
})

test('an empty follow-along unit reports an error instead of loading forever',async({page})=>{
  test.setTimeout(60000)
  const corpus=JSON.parse(await fs.readFile(new URL('../public/data/default-vocabulary.json',import.meta.url),'utf8'))
  const manifest=JSON.parse(await fs.readFile(new URL('../public/data/word-learning/tape3a_002013/manifest.json',import.meta.url),'utf8'))
  const unitId=manifest.sections[0].units[0].unitId
  const editedCorpus={...corpus,units:corpus.units.map((unit:any)=>unit.id===unitId?{...unit,words:[]}:unit)}
  const editedManifest={...manifest,sections:manifest.sections.map((section:any,index:number)=>index?section:{...section,units:section.units.map((unit:any,index:number)=>index?unit:{...unit,words:[]})})}
  await page.route('**/data/default-vocabulary.json*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(editedCorpus)}))
  await page.route('**/data/word-learning/tape3a_002013/manifest.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(editedManifest)}))
  await page.goto('./?view=followalong&book=tape3a_002013&unit='+encodeURIComponent(unitId))
  await expect(page.locator('.followalong-error')).toContainText('暂无可跟读的词句',{timeout:25000})
})

test('a failed follow-along playback reports an error and is not cached',async({page})=>{
  test.setTimeout(60000)
  await page.route('**/audio/library/*.mp3',route=>route.fulfill({contentType:'text/html',body:'not an audio file'}))
  await page.goto('./?view=followalong&book=tape6a_002015')
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:25000})
  await page.getByRole('button',{name:'播放单词'}).click()
  await expect(page.locator('.followalong-error')).toContainText('教材原音暂时无法播放',{timeout:20000})
  const stored=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('pep-word-audio',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
    const count=await new Promise<number>(resolve=>{const request=db.transaction('audio').objectStore('audio').count();request.onsuccess=()=>resolve(request.result)})
    db.close();return count
  })
  expect(stored).toBe(0)
})

test('a stalled hosted audio download fails instead of hanging forever',async({page})=>{
  test.setTimeout(60000)
  await page.clock.install()
  await page.route('**/audio/library/*.mp3',()=>new Promise(()=>{}))
  await page.goto('./?view=followalong&book=tape6a_002015')
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:25000})
  await page.getByRole('button',{name:'播放单词'}).click()
  await expect(page.locator('.play-state')).toHaveText('正在播放教材原音')
  await page.clock.fastForward(20000)
  await expect(page.locator('.followalong-error')).toContainText('教材原音暂时无法播放',{timeout:10000})
})

test('follow-along still works when the book catalog fails',async({page})=>{
  test.setTimeout(60000)
  await page.route('**/data/word-learning/books.json',route=>route.fulfill({status:500,body:''}))
  await page.goto('./?view=followalong&book=tape3a_002013')
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:25000})
  await expect(page.getByLabel('选择跟读教材')).toHaveValue('tape3a_002013')
  await expect(page.getByLabel('选择跟读教材').locator('option')).toHaveCount(1)
})
