import {test,expect} from '@playwright/test'
const beginSession=async(page:any)=>{await expect(page.getByRole('heading',{name:'准备开始听写'})).toBeVisible({timeout:15000});await page.locator('.dictation-screen').getByRole('button',{name:'开始听写',exact:true}).click()}

test('custom question count keeps an editable numeric draft',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'听写练习',exact:true}).click();await page.getByRole('button',{name:'数量与播放设置'}).click()
 const all=page.getByRole('radio',{name:'全部',exact:true}),custom=page.getByRole('radio',{name:'自定义',exact:true}),input=page.getByRole('spinbutton',{name:'听写数量',exact:true})
 await custom.check();await input.fill('12');await expect(input).toHaveValue('12');await input.press('Backspace');await expect(input).toHaveValue('1');await input.press('Backspace');await expect(input).toHaveValue('');await input.fill('3');await expect(input).toHaveValue('3');await expect(all).not.toBeChecked()
 await input.fill('0');await expect(input).toHaveValue('1');await input.fill('-5');await expect(input).toHaveValue('1')
 const max=await input.getAttribute('max');await input.fill('99999');await expect(input).toHaveValue(max!)
 await input.fill('');await input.press('Tab');await expect(input).toHaveValue('1');await expect(all).not.toBeChecked()
})

test('retrying a missing original audio preflight checks again instead of starting',async({page})=>{
 let requests=0
 await page.route('**/audio/library/*.mp3',route=>{requests++;return route.abort()})
 await page.goto('./');await page.getByRole('button',{name:'听写练习',exact:true}).click()
 await page.getByRole('combobox',{name:'选择课本'}).selectOption('3年级英语上册')
 await page.getByRole('button',{name:'检查声音并开始',exact:true}).first().click()
 await expect(page.getByText('教材原音缺失或无法验证。原音题不会替换为其他声音。')).toBeVisible({timeout:30000})
 const previous=requests;expect(previous).toBeGreaterThan(0)
 await page.getByRole('button',{name:'重试检查'}).click()
 await expect.poll(()=>requests,{timeout:30000}).toBeGreaterThan(previous)
 await expect(page.getByRole('button',{name:'重试检查'})).toBeVisible({timeout:30000})
 await expect(page.getByRole('button',{name:'开始听写',exact:true}).first()).toBeDisabled()
})

test('marking answers and replay actions operate on the same round snapshot',async({page})=>{
 await page.route('**/audio/library-manifest.json*',route=>route.fulfill({json:{schemaVersion:1,items:[]}}))
 await page.addInitScript(()=>{const open=indexedDB.open.bind(indexedDB);indexedDB.open=function(name,...args){if(name==='pep-word-audio')throw new DOMException('blocked','SecurityError');return open(name,...args)}})
 await page.goto('./');await page.getByRole('button',{name:'听写练习',exact:true}).click()
 await page.getByRole('combobox',{name:'选择课本'}).selectOption('3年级英语上册');await page.getByRole('button',{name:/选择词句/}).click();await page.getByRole('button',{name:'全选本单元',exact:true}).click();await page.getByRole('button',{name:'清空本单元',exact:true}).click();await page.locator('.practice-word-row').nth(0).locator('input[type=checkbox]').check();await page.locator('.practice-word-row').nth(1).locator('input[type=checkbox]').check()
 await page.getByRole('button',{name:/选择词句/}).click();await page.getByRole('button',{name:'数量与播放设置'}).click();await page.getByRole('combobox',{name:'每题播放次数'}).selectOption('1');await page.getByRole('button',{name:/选择词句/}).click()
 await page.getByRole('button',{name:'检查声音并开始',exact:true}).click();await page.getByRole('button',{name:'开始听写',exact:true}).first().click();await beginSession(page)
 await expect(page.getByText(/已读 1 \/ 1 遍.*等待手动下一题/)).toBeVisible({timeout:15000});await page.getByRole('button',{name:'下一个',exact:true}).click();await expect(page.getByText(/已读 1 \/ 1 遍.*等待手动下一题/)).toBeVisible({timeout:15000});await page.getByRole('button',{name:'完成本轮',exact:true}).click();await expect(page.getByText(/本轮听写完成/)).toBeVisible()
 await page.getByRole('button',{name:'对答案'}).click();await expect(page.getByRole('button',{name:/只练标记项/})).toBeDisabled()
 await page.locator('.answer-key input[type=checkbox]').nth(0).check();await page.locator('.answer-key input[type=checkbox]').nth(1).check()
 await page.getByRole('button',{name:'只练标记项（2）',exact:true}).click();await beginSession(page);await expect(page.getByText('第 1 题 · 已读 0 / 1 遍 · 正在准备声音')).toBeVisible()
 await page.getByRole('button',{name:'下一个',exact:true}).click();await page.getByRole('button',{name:'完成本轮',exact:true}).click();await expect(page.getByText(/本轮听写完成/)).toBeVisible();await page.getByRole('button',{name:'对答案'}).click()
 await expect(page.locator('.answer-key input[type=checkbox]:checked')).toHaveCount(0)
 await page.getByRole('button',{name:'再练本轮',exact:true}).click();await beginSession(page);await expect(page.getByText('第 1 题 · 已读 0 / 1 遍 · 正在准备声音')).toBeVisible()
})
