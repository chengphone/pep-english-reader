import {test,expect} from '@playwright/test'

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
