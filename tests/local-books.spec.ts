import {test,expect} from '@playwright/test'
import {LOCAL_BOOKS_ENABLED} from '../src/features'

test.describe('local textbook import and delete',()=>{
  test.skip(!LOCAL_BOOKS_ENABLED,'本地教材功能暂时屏蔽')

  test('a failed delete keeps the book and explains the failure',async({page})=>{
    test.setTimeout(120000)
    await page.addInitScript(()=>{
      const remove=IDBObjectStore.prototype.delete
      IDBObjectStore.prototype.delete=function(this:IDBObjectStore,key:IDBValidKey){
        if((window as any).__failBookDelete&&this.name==='books')throw new DOMException('delete blocked','UnknownError')
        return remove.call(this,key)
      }
    })
    await page.goto('./')
    await page.locator('input[aria-label="导入课本文件"]').setInputFiles('public/demo-pep-sample.zip')
    await expect(page.getByText('已导入教材，可离线点读')).toBeVisible({timeout:30000})
    await page.getByRole('button',{name:'返回书架',exact:true}).click()
    await page.getByRole('button',{name:'管理课本',exact:true}).click()
    await page.getByRole('button',{name:'删除课本 PEP 原创点读体验',exact:true}).click()
    await page.evaluate(()=>{window.__failBookDelete=true})
    await page.getByRole('button',{name:'确认删除',exact:true}).click()
    await expect(page.getByRole('alert').filter({hasText:'删除失败，请重试。'})).toBeVisible()
    await expect(page.getByRole('heading',{name:'PEP 原创点读体验'})).toBeVisible()
    await page.evaluate(()=>{window.__failBookDelete=false})
    await page.getByRole('button',{name:'确认删除',exact:true}).click()
    await expect(page.getByRole('heading',{name:'删除这本课本？'})).toHaveCount(0)
    await expect(page.getByRole('heading',{name:'PEP 原创点读体验'})).toHaveCount(0)
  })

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
