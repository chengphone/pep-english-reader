import {test,expect} from '@playwright/test'
import {LOCAL_BOOKS_ENABLED} from '../src/features'

test.describe('local textbook import and delete',()=>{
  test.skip(!LOCAL_BOOKS_ENABLED,'本地教材功能暂时屏蔽')

  test('imports the demo package, returns to the shelf, and deletes it',async({page})=>{
    test.setTimeout(120000)
    await page.goto('./')
    await page.locator('input[aria-label="导入课本文件"]').setInputFiles('public/demo-pep-sample.zip')
    await expect(page.getByText('已导入教材，可离线点读')).toBeVisible({timeout:30000})
    await page.getByRole('button',{name:'返回书架',exact:true}).click()
    await expect(page.getByRole('heading',{name:'PEP 原创点读体验'})).toBeVisible()

    await page.getByRole('button',{name:'管理课本',exact:true}).click()
    await page.getByRole('button',{name:'删除课本 PEP 原创点读体验',exact:true}).click()
    await expect(page.getByRole('heading',{name:'删除这本课本？'})).toBeVisible()
    await page.getByRole('button',{name:'确认删除',exact:true}).click()
    await expect(page.getByRole('heading',{name:'PEP 原创点读体验'})).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading',{name:'PEP 原创点读体验'})).toHaveCount(0)
  })
})
