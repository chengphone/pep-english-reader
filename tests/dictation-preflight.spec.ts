import {test,expect} from '@playwright/test'

test('a stalled hosted audio list costs one timeout for the whole dictation round',async({page})=>{
 test.setTimeout(90000)
 await page.clock.install()
 await page.route('**/audio/library-manifest.json*',()=>new Promise(()=>{}))
 await page.goto('./?view=vocab')
 await page.getByRole('combobox',{name:'选择课本',exact:true}).selectOption('六年级英语上册 · PEP新版（E63 002015）')
 await page.getByRole('button',{name:'检查声音并开始',exact:true}).click()
 await expect(page.getByRole('button',{name:'正在准备声音…',exact:true})).toBeVisible()
 await page.clock.fastForward(16000)
 await expect(page.locator('.audio-preflight')).toContainText('本轮有 26 题未准备好声音',{timeout:10000})
})
