import {test,expect} from '@playwright/test'
test('Datong books stay hidden on mobile and desktop',async({page})=>{
 await page.route('https://dd.e63.cn/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>E63 测试页</title><p>在线教材</p>'}))
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
  await page.setViewportSize(viewport);await page.goto('./')
  for(const grade of ['四年级','五年级']){
   await page.getByRole('button',{name:grade,exact:true}).click()
   await expect(page.getByText('人教大同版')).toHaveCount(0)
  }
  await page.getByRole('button',{name:'四年级',exact:true}).click()
  await page.getByRole('button',{name:'打开 四年级上册 人教 PEP',exact:true}).click()
  await expect(page.locator('iframe')).toHaveAttribute('src','https://dd.e63.cn/reader.html?book=tape4a_002013')
  const options=await page.getByRole('combobox',{name:'选择在线教材'}).locator('option').evaluateAll(items=>items.map(item=>(item as HTMLOptionElement).value))
  for(const id of ['tape4a_038001','tape4b_038001','tape5a_038001'])expect(options).not.toContain(id)
 }
})


test('the supplied six-grade PEP version opens its exact E63 book ID',async({page})=>{
 await page.route('https://dd.e63.cn/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>E63 测试页</title><p>在线教材</p>'}))
 await page.goto('./');await page.getByRole('button',{name:'六年级',exact:true}).click()
 await page.getByRole('button',{name:'打开 六年级上册 人教PEP新版',exact:true}).click()
 await expect(page.locator('iframe')).toHaveAttribute('src','https://dd.e63.cn/reader.html?book=tape6a_002015')
 await expect(page.getByRole('combobox',{name:'选择在线教材'})).toHaveValue('tape6a_002015')
 await expect(page.locator('iframe')).toHaveAttribute('title','E63 人教PEP新版 · 6年级上册')
})


test('third-grade books keep their previous IDs and sixth-grade old editions stay hidden',async({page})=>{
 await page.route('https://dd.e63.cn/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>E63 测试页</title><p>在线教材</p>'}))
 await page.goto('./');await page.getByRole('button',{name:'三年级',exact:true}).click()
 await expect(page.locator('.kids-online-book')).toHaveCount(2)
 for(const [term,id] of [['上册','tape3a_002013'],['下册','tape3b_002013']]){
  await page.getByRole('button',{name:`打开 三年级${term} 人教 PEP`,exact:true}).click()
  await expect(page.locator('iframe')).toHaveAttribute('src',`https://dd.e63.cn/reader.html?book=${id}`)
  await page.getByRole('button',{name:'返回书架',exact:true}).click()
 }
 await page.getByRole('button',{name:'六年级',exact:true}).click();await expect(page.locator('.kids-online-book')).toHaveCount(2)
 await expect(page.getByRole('button',{name:'六年级下册 人教PEP新版 同版资源待上线',exact:true})).toBeDisabled()
 await page.screenshot({path:'/tmp/pep-audit-20261029/catalog-sixth-final.png',fullPage:true})
 await page.getByRole('button',{name:'打开 六年级上册 人教PEP新版',exact:true}).click()
 const options=await page.getByRole('combobox',{name:'选择在线教材'}).locator('option').evaluateAll(items=>items.map(item=>(item as HTMLOptionElement).value))
 expect(options).toContain('tape6a_002015')
 for(const old of ['tape3a_038001','tape3b_038001','tape6a_002003','tape6b_002006','tape6a_038001'])expect(options).not.toContain(old)
})
