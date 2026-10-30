import {test,expect} from '@playwright/test'
import fs from 'node:fs/promises'
const book='六年级英语上册 · PEP新版（E63 002015）'
const beginSession=async(page:any)=>{await expect(page.getByRole('heading',{name:'准备开始听写'})).toBeVisible({timeout:15000});await page.locator('.dictation-screen').getByRole('button',{name:'开始听写',exact:true}).click()}
test('new PEP vocabulary and expressions are selectable and play hosted audio without an upload',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('./');await page.getByRole('button',{name:'听写练习',exact:true}).click()
 await page.getByRole('combobox',{name:'选择课本',exact:true}).selectOption(book)
 await page.getByRole('button',{name:/选择词句/}).click()
 await page.getByRole('button',{name:'Unit 1',exact:true}).click()
 await expect(page.locator('.practice-word-row')).toHaveCount(26)
 await page.getByRole('button',{name:'清空本单元',exact:true}).click();await page.getByRole('checkbox',{name:'听写 kilometre',exact:true}).check()
 await page.getByRole('combobox',{name:'每题播放次数'}).selectOption('1');await page.getByRole('button',{name:'检查声音并开始',exact:true}).click();await beginSession(page)
 await expect(page.getByText(/已读 1 \/ 1 遍.*等待手动下一题/)).toBeVisible({timeout:15000})
 await expect(page.locator('.dictation-audio-source')).toContainText('网站音频');await expect(page.locator('.dictation-screen')).not.toContainText('kilometre')
 await page.getByRole('button',{name:'返回词表',exact:true}).click()
 await context.setOffline(true)
 await page.getByRole('button',{name:'检查声音并开始',exact:true}).click();await beginSession(page)
 await expect(page.getByText(/已读 1 \/ 1 遍.*等待手动下一题/)).toBeVisible({timeout:15000})
 await page.getByRole('button',{name:'完成本轮',exact:true}).click();await page.getByRole('button',{name:'对答案',exact:true}).click();await expect(page.locator('.answer-key')).toContainText('kilometre')
 await context.setOffline(false);await page.getByRole('button',{name:'返回词表',exact:true}).click()
 await page.getByRole('button',{name:'常用表达',exact:true}).click();await page.getByRole('button',{name:'Unit 3',exact:true}).click()
 await expect(page.locator('.practice-word-row')).toHaveCount(9)
 await expect(page.locator('.practice-word-row')).toContainText(["I'm sorry to hear that. Maybe you should see a doctor."])
 await page.getByRole('button',{name:'清空本单元',exact:true}).click({force:true});await page.getByRole('checkbox',{name:"听写 Don't stay up late.",exact:true}).check()
 await page.getByRole('button',{name:'检查声音并开始',exact:true}).click();await beginSession(page)
 await expect(page.getByText(/已读 1 \/ 1 遍.*等待手动下一题/)).toBeVisible({timeout:15000})
 await expect(page.locator('.dictation-audio-source')).toContainText('网站音频')
 expect(errors).toEqual([])
})


test('a website update removes cached old-sixth-grade defaults while retaining the new edition',async({page})=>{
 const data=JSON.parse(await fs.readFile(new URL('../public/data/default-vocabulary.json',import.meta.url),'utf8'))
 const old={id:'retired-sixth-unit',book:'6年级英语上册',title:'Unit 1',category:'units',words:[{id:'old-museum',english:'museum',meaning:'博物馆'}]}
 let retired=false
 await page.route('**/data/default-vocabulary.json*',route=>route.fulfill({json:{...data,revision:data.revision+(retired?1:0),units:retired?data.units:[...data.units,old]}}))
 await page.goto('./');await page.getByRole('button',{name:'听写练习',exact:true}).click()
 await page.getByRole('combobox',{name:'选择课本',exact:true}).selectOption(old.book)
 await page.getByRole('button',{name:/选择词句/}).click()
 await expect(page.getByRole('checkbox',{name:'听写 museum',exact:true})).toBeVisible()
 retired=true
 await page.reload();await page.getByRole('button',{name:'听写练习',exact:true}).click()
 await expect.poll(()=>page.getByRole('combobox',{name:'选择课本',exact:true}).locator('option').allTextContents()).toContain(book)
 const options=await page.getByRole('combobox',{name:'选择课本',exact:true}).locator('option').allTextContents()
 expect(options).not.toContain(old.book);expect(options).toContain(book)
 await page.getByRole('combobox',{name:'选择课本',exact:true}).selectOption(book)
 await page.getByRole('button',{name:'Unit 1',exact:true}).click();await page.getByRole('button',{name:/选择词句/}).click();await expect(page.locator('.practice-word-row')).toHaveCount(26)
})
