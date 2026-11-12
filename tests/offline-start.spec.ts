import {test,expect} from '@playwright/test'

test.use({baseURL:'http://127.0.0.1:5181/pep-english-reader/'})

async function prepareOfflineShell(page:any){
  await page.goto('./',{waitUntil:'networkidle'})
  await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,{timeout:30000})
  await page.waitForFunction(async()=>{
    for(const key of await caches.keys()){
      const cache=await caches.open(key)
      const paths=(await cache.keys()).map(request=>new URL(request.url).pathname)
      if(paths.some(path=>path.endsWith('/index.html'))&&paths.some(path=>/\/assets\/index-[^/]+\.js$/.test(path)))return true
    }
    return false
  },{timeout:30000})
}

test('the app shell still starts from the service worker cache when offline',async({page,context})=>{
  test.setTimeout(90000)
  await prepareOfflineShell(page)
  await expect(page.getByRole('heading',{name:'今天读哪一本？'})).toBeVisible()
  await context.setOffline(true)
  await page.reload({waitUntil:'domcontentloaded',timeout:30000})
  await expect(page.getByRole('heading',{name:'今天读哪一本？'})).toBeVisible({timeout:20000})
  await expect(page.getByRole('navigation',{name:'主导航'})).toBeVisible()
  await context.setOffline(false)
})

test('an offline deep link still boots the app shell',async({page,context})=>{
  test.setTimeout(90000)
  await prepareOfflineShell(page)
  await context.setOffline(true)
  await page.goto('./?view=vocab',{waitUntil:'domcontentloaded',timeout:30000})
  await expect(page.getByRole('heading',{name:'听写练习'})).toBeVisible({timeout:20000})
  await expect(page.getByRole('navigation',{name:'学习导航'})).toBeVisible()
  await context.setOffline(false)
})

test('the dictation vocabulary survives an offline reload',async({page,context})=>{
  test.setTimeout(120000)
  await prepareOfflineShell(page)
  await page.goto('./?view=vocab',{waitUntil:'networkidle'})
  const count=page.getByRole('combobox',{name:'抽取数量'})
  await expect(count).toBeEnabled({timeout:30000})
  await context.setOffline(true)
  await page.reload({waitUntil:'domcontentloaded',timeout:30000})
  await expect(page.getByRole('heading',{name:'听写练习'})).toBeVisible({timeout:20000})
  await expect(count).toBeEnabled({timeout:30000})
  await expect(page.getByRole('combobox',{name:'选择课本'})).not.toHaveValue('')
  await context.setOffline(false)
})

test('updated book data replaces a stale service worker copy while online',async({page})=>{
  test.setTimeout(90000)
  await prepareOfflineShell(page)
  await page.evaluate(async()=>{
    const url=location.origin+'/pep-english-reader/data/word-learning/books.json'
    const cache=await caches.open('pep-reader-data-v1')
    await cache.put(url,new Response(JSON.stringify([{bookId:'stale-book',title:'缓存旧目录'}]),{headers:{'Content-Type':'application/json'}}))
  })
  await page.goto('./?view=followalong&book=tape3a_002013',{waitUntil:'networkidle'})
  await expect(page.getByLabel('选择跟读教材')).toHaveValue('tape3a_002013')
  const options=page.getByLabel('选择跟读教材').locator('option')
  await expect(options.filter({hasText:'三年级英语上册'})).toHaveCount(1)
  await expect(options.filter({hasText:'缓存旧目录'})).toHaveCount(0)
})

test('an arriving update waits for follow-along practice and applies on the shelf',async({page})=>{
  test.setTimeout(90000)
  await prepareOfflineShell(page)
  // Reload so the update listener sees an already-controlled page, as returning
  // users do; only then does a new worker count as an update.
  await page.reload({waitUntil:'networkidle'})
  await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,{timeout:30000})
  await page.goto('./?view=followalong&book=tape3a_002013',{waitUntil:'networkidle'})
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:30000})
  await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new Event('controllerchange')))
  await expect(page.getByRole('button',{name:'新版已就绪，点击刷新应用'})).toBeVisible()
  await page.waitForTimeout(800)
  expect(page.url()).not.toContain('app-update=')
  await expect(page.locator('.followalong-word-grid')).toBeVisible()
  await page.getByRole('button',{name:'书架',exact:true}).click()
  await page.waitForURL(/app-update=/,{timeout:15000})
})

test('the follow-along unit survives an offline reload',async({page,context})=>{
  test.setTimeout(120000)
  await prepareOfflineShell(page)
  await page.goto('./?view=followalong&book=tape3a_002013',{waitUntil:'networkidle'})
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:30000})
  await context.setOffline(true)
  await page.reload({waitUntil:'domcontentloaded',timeout:30000})
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:30000})
  await expect(page.locator('.followalong-card')).toBeVisible()
  await context.setOffline(false)
})
