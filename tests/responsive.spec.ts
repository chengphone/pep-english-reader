import {test,expect} from '@playwright/test'

const expectNoHorizontalOverflow=async(page:any)=>{
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
}

test('the shelf and follow-along stay usable in portrait and landscape',async({page})=>{
  test.setTimeout(90000)
  await page.setViewportSize({width:390,height:844})
  await page.goto('./')
  await expect(page.getByRole('heading',{name:'今天读哪一本？'})).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.setViewportSize({width:844,height:390})
  await expect(page.getByRole('heading',{name:'今天读哪一本？'})).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.goto('./?view=followalong&book=tape3a_002013')
  await expect(page.locator('.followalong-word-grid')).toBeVisible({timeout:25000})
  await expectNoHorizontalOverflow(page)
  await page.setViewportSize({width:390,height:844})
  await expect(page.locator('.followalong-card')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.setViewportSize({width:844,height:390})
  await expect(page.locator('.followalong-card')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('the dictation chooser stays usable after rotating',async({page})=>{
  test.setTimeout(60000)
  await page.setViewportSize({width:390,height:844})
  await page.goto('./?view=vocab')
  await expect(page.getByRole('heading',{name:'听写练习'})).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.setViewportSize({width:844,height:390})
  await expect(page.getByRole('button',{name:'检查声音并开始'}).first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
