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
  await expect(page.getByRole('navigation',{name:'学习导航'})).toBeVisible()
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
