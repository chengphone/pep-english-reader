import {test,expect} from '@playwright/test'
const datong=[{grade:4,term:'a'},{grade:4,term:'b'},{grade:5,term:'a'}]
const grades:Record<number,string>={3:'三年级',4:'四年级',5:'五年级',6:'六年级'}
test('Datong books retain their edition on the shelf and in the reader',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://dd.e63.cn/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>E63 测试页</title><p>在线教材</p>'}))
 await page.goto('./');await expect(page).toHaveTitle(/英语/)
 for(const book of datong){
  await page.getByRole('button',{name:grades[book.grade],exact:true}).click()
  const term=book.term==='a'?'上册':'下册',id=`tape${book.grade}${book.term}_038001`
  const card=page.getByRole('button',{name:`打开 ${grades[book.grade]}${term} 人教大同版`,exact:true})
  await expect(card).toContainText('人教大同版');await expect(card).not.toContainText('PEP');await card.click()
  const reader=page.locator('iframe');await expect(reader).toHaveAttribute('src',`https://dd.e63.cn/reader.html?book=${id}`)
  await expect(reader).toHaveAttribute('title',`E63 人教大同版 · ${book.grade}年级${term}`)
  await expect(page.getByRole('combobox',{name:'选择在线教材'})).toHaveValue(id)
  await expect(page.getByRole('link',{name:'新窗口打开',exact:true}).first()).toHaveAttribute('href',`https://dd.e63.cn/reader.html?book=${id}`)
  await page.getByRole('button',{name:'返回书架',exact:true}).click()
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'四年级',exact:true}).click()
 await expect(page.getByRole('button',{name:'打开 四年级上册 人教大同版',exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
 await page.screenshot({path:'/tmp/pep-audit-20261029/datong-shelf-mobile.png',fullPage:true})
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/tmp/pep-audit-20261029/datong-shelf-desktop.png',fullPage:true})
 expect(errors).toEqual([]);await expect(page.locator('vite-error-overlay')).toHaveCount(0)
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
