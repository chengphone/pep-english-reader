import {test,expect} from '@playwright/test'

test('application history returns to the shelf and forward restores a reader',async({page})=>{
 await page.route('https://dd.e63.cn/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>E63</title><p>课本</p>'}))
 await page.goto('./')
 await page.getByRole('button',{name:'四年级',exact:true}).click()
 await page.getByRole('button',{name:'打开 四年级上册 人教 PEP',exact:true}).click()
 await expect(page.locator('iframe')).toHaveAttribute('src','https://dd.e63.cn/reader.html?book=tape4a_002013')
 await page.goBack();await expect(page.getByRole('heading',{name:'今天读哪一本？'})).toBeVisible()
 await page.goForward();await expect(page.locator('iframe')).toHaveAttribute('src','https://dd.e63.cn/reader.html?book=tape4a_002013')
})

test('vocabulary deep links restore the vocabulary workspace',async({page})=>{
 await page.goto('./?view=vocab')
 await expect(page.getByRole('heading',{name:'听写练习'})).toBeVisible()
 await expect(page.getByRole('navigation',{name:'学习导航'}).getByRole('button',{name:'听写练习'})).toHaveAttribute('aria-current','page')
 await expect(page).toHaveURL(/view=vocab/)
})

test('dictation page top navigation returns to the shelf and opens follow-along',async({page})=>{
 await page.goto('./?view=vocab')
 await expect(page.getByRole('heading',{name:'听写练习'})).toBeVisible()
 const nav=page.getByRole('navigation',{name:'学习导航'})
 await nav.getByRole('button',{name:'课本点读',exact:true}).click();await expect(page.getByRole('heading',{name:'今天读哪一本？'})).toBeVisible()
 await page.getByRole('button',{name:'听写练习',exact:true}).click();await expect(page.getByRole('heading',{name:'听写练习'})).toBeVisible()
 await nav.getByRole('button',{name:'跟读学习',exact:true}).click();await expect(page.getByLabel('选择跟读教材')).toHaveValue('tape3a_002013')
 await page.goBack();await expect(page.getByRole('heading',{name:'听写练习'})).toBeVisible()
})

test('local-book deep links restore the requested stored reader page',async({page})=>{
 await page.goto('./')
 await page.evaluate(async()=>{const req=indexedDB.open('pep-reader-v1',2);const db:any=await new Promise(resolve=>{req.onsuccess=()=>resolve(req.result);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('books'))req.result.createObjectStore('books',{keyPath:'id'});if(!req.result.objectStoreNames.contains('units'))req.result.createObjectStore('units',{keyPath:'id'})}});await new Promise<void>(resolve=>{const tx=db.transaction('books','readwrite');tx.objectStore('books').put({id:'deep-book',manifest:{schemaVersion:1,bookId:'deep-book',title:'深链测试教材',publisherId:'pep',pages:[{page:1,image:'page.png',items:[]},{page:2,image:'page.png',items:[]}]},assets:{}});tx.oncomplete=()=>resolve()});db.close()})
 await page.goto('./?view=local&book=deep-book&page=1')
 await expect(page.getByRole('heading',{name:'深链测试教材'})).toBeVisible()
 await expect(page.getByRole('button',{name:'课本下一页',exact:true})).toBeDisabled()
 await expect(page).toHaveURL(/view=local.*book=deep-book.*page=1/)
})
