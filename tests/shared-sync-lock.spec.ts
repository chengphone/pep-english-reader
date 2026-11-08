import {test,expect} from '@playwright/test'

test('a tab skips a cross-tab sync lock that is never released instead of loading forever',async({page})=>{
 test.setTimeout(120000)
 await page.goto('./?view=vocab')
 const picker=page.getByRole('combobox',{name:'选择课本',exact:true})
 await expect(picker).toBeEnabled({timeout:30000})
 // Simulate a tab frozen mid-sync: it holds the shared lock and never releases it.
 await page.evaluate(()=>{
  ;(window as any).__lockHeld=false
  void navigator.locks.request('pep-shared-library',()=>{(window as any).__lockHeld=true;return new Promise(()=>{})})
 })
 await page.waitForFunction(()=>(window as any).__lockHeld)
 const second=await page.context().newPage()
 try{
  await second.goto('./?view=vocab')
  const secondPicker=second.getByRole('combobox',{name:'选择课本',exact:true})
  // The bounded lock wait falls back to the units already stored on this device.
  await expect(secondPicker).toBeEnabled({timeout:40000})
  await expect(secondPicker).not.toHaveValue('')
  await expect(second.locator('.material-notice')).toHaveCount(0)
 }finally{await second.close()}
})
