import {test,expect} from '@playwright/test'
const book='3年级英语上册'

async function openDictation(page:any){
  await page.goto('./')
  await page.getByRole('button',{name:'听写练习',exact:true}).click()
  await page.getByRole('combobox',{name:'选择课本',exact:true}).selectOption(book)
  await page.getByRole('button',{name:/选择词句/}).click()
  await page.getByRole('button',{name:'Unit 1',exact:true}).click()
  await page.getByRole('button',{name:'清空本单元',exact:true}).click()
}

async function beginRound(page:any,words=['name','nice']){
  for(const word of words)await page.getByRole('checkbox',{name:`听写 ${word}`,exact:true}).check()
  await page.getByRole('combobox',{name:'每题播放次数'}).selectOption('1')
  await page.getByRole('button',{name:'检查声音并开始',exact:true}).click()
  await expect(page.getByRole('heading',{name:'准备开始听写'})).toBeVisible({timeout:15000})
  await page.locator('.dictation-screen').getByRole('button',{name:'开始听写',exact:true}).click()
}

async function enableAuto(page:any,seconds='2'){
  await page.getByRole('button',{name:'本轮设置'}).click()
  await page.getByRole('switch',{name:'自动下一词'}).check()
  await page.getByLabel('书写间隔').selectOption(seconds)
}

test('auto-next advances through the round and finishes on the last question',async({page})=>{
  test.setTimeout(120000)
  await openDictation(page);await beginRound(page)
  await enableAuto(page,'2')
  await expect(page.locator('.session-progress')).toHaveText('1 / 2',{timeout:20000})
  await expect(page.locator('.session-progress')).toHaveText('2 / 2',{timeout:40000})
  await expect(page.getByRole('heading',{name:'本轮听写完成'})).toBeVisible({timeout:40000})
  await expect(page.getByRole('button',{name:'对答案',exact:true})).toBeVisible()
})

test('pausing during the countdown cancels auto-next',async({page})=>{
  test.setTimeout(120000)
  await openDictation(page);await beginRound(page)
  await enableAuto(page,'5')
  await expect(page.getByText(/秒后自动下一题/)).toBeVisible({timeout:40000})
  await page.getByRole('button',{name:'暂停',exact:true}).click()
  await expect(page.getByText(/已暂停/)).toBeVisible()
  await page.waitForTimeout(7000)
  await expect(page.locator('.session-progress')).toHaveText('1 / 2')
})

test('replaying during the countdown keeps the current question',async({page})=>{
  test.setTimeout(120000)
  await openDictation(page);await beginRound(page)
  await enableAuto(page,'5')
  await expect(page.getByText(/秒后自动下一题/)).toBeVisible({timeout:40000})
  await page.getByRole('button',{name:/重听 1 遍/}).click()
  await expect(page.getByText(/正在准备声音|正在朗读/)).toBeVisible({timeout:15000})
  await page.waitForTimeout(4000)
  await expect(page.locator('.session-progress')).toHaveText('1 / 2')
})

test('turning auto-next off during the countdown cancels the jump',async({page})=>{
  test.setTimeout(120000)
  await openDictation(page);await beginRound(page)
  await enableAuto(page,'5')
  await expect(page.getByText(/秒后自动下一题/)).toBeVisible({timeout:40000})
  await page.getByRole('switch',{name:'自动下一词'}).uncheck()
  await page.waitForTimeout(7000)
  await expect(page.locator('.session-progress')).toHaveText('1 / 2')
  await expect(page.getByText(/等待手动下一题/)).toBeVisible()
})

test('auto-next works with a single-question round',async({page})=>{
  test.setTimeout(120000)
  await openDictation(page);await beginRound(page,['name'])
  await enableAuto(page,'2')
  await expect(page.locator('.session-progress')).toHaveText('1 / 1',{timeout:20000})
  await expect(page.getByRole('heading',{name:'本轮听写完成'})).toBeVisible({timeout:40000})
})
