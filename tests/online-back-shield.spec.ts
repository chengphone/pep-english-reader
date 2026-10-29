import {test,expect} from '@playwright/test'
test('the embedded back arrow is shielded on desktop, mobile, focus mode and fullscreen',async({page})=>{
 await page.route('https://dd.e63.cn/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>body{margin:0}.header{height:50px;background:#4aa3ff;display:flex;align-items:center;justify-content:space-between;padding:0 8px}.header button{width:36px;height:36px;border-radius:50%;border:0;background:#fff5;color:white}</style></head><body><div class="header"><button id="back" onclick="document.body.dataset.back='clicked'">←</button><span>人教PEP版</span><button id="share" onclick="document.body.dataset.share='clicked'">分享</button></div><p>课本内容</p></body></html>`}))
 await page.goto('./');await page.getByRole('button',{name:'三年级',exact:true}).click();await page.getByRole('button',{name:'打开 三年级上册 人教 PEP',exact:true}).click()
 const frame=page.frameLocator('iframe')
 async function check(){
  await frame.locator('#back').waitFor();const rect=await page.locator('iframe').boundingBox();if(!rect)throw new Error('Missing iframe')
  await page.mouse.click(rect.x+26,rect.y+25)
  await expect(frame.locator('body')).not.toHaveAttribute('data-back','clicked')
  await frame.locator('#share').click();await expect(frame.locator('body')).toHaveAttribute('data-share','clicked')
 }
 await check();await page.getByRole('button',{name:'专注阅读',exact:true}).click();await check()
 await page.getByRole('button',{name:'退出专注',exact:true}).click()
 await page.getByRole('button',{name:'更多阅读操作'}).click();await expect(page.getByRole('menu')).toBeVisible()
 await page.getByRole('menuitem',{name:'全屏阅读'}).click();await expect(page.locator('.online-reading')).toHaveClass(/reading-expanded/);await check()
 await page.getByRole('button',{name:'更多阅读操作'}).click();await page.getByRole('menuitem',{name:'退出全屏'}).click()
 await page.setViewportSize({width:390,height:844});await check()
 await page.getByRole('button',{name:'更多阅读操作'}).click();await page.locator('.online-reader-menu').dispatchEvent('keydown',{key:'Escape'});await expect(page.getByRole('menu')).toHaveCount(0);await expect(page.getByRole('button',{name:'更多阅读操作'})).toBeFocused()
 await page.screenshot({path:'/tmp/pep-audit-20261029/online-back-shield-mobile.png',fullPage:true})
})
