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
