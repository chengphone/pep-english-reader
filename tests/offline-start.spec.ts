import {test,expect} from '@playwright/test'

test.use({baseURL:'http://127.0.0.1:5181/pep-english-reader/'})

test('the app shell still starts from the service worker cache when offline',async({page,context})=>{
  test.setTimeout(90000)
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
  await expect(page.getByRole('heading',{name:'今天读哪一本？'})).toBeVisible()

  await context.setOffline(true)
  await page.reload({waitUntil:'domcontentloaded',timeout:30000})
  await expect(page.getByRole('heading',{name:'今天读哪一本？'})).toBeVisible({timeout:20000})
  await expect(page.getByRole('navigation',{name:'学习导航'})).toBeVisible()
  await context.setOffline(false)
})
