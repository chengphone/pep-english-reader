import {test,expect} from '@playwright/test'

test('automatic translation falls back instead of hanging when the local database is absent',async({page})=>{
  await page.goto('./')
  const result=await page.evaluate(async()=>{
    // A fresh browser profile has no pep-reader-v1 database; opening it here used to
    // create one without the 'units' store and leave the translation pending forever.
    // Ignore any on-device translation model so the fallback path is deterministic.
    delete (window as any).Translator
    const module=await import('/pep-english-reader/src/automaticTranslation.ts')
    return Promise.race([
      module.automaticallyTranslate('A sentence outside the textbook glossary','未导入教材'),
      new Promise(resolve=>setTimeout(()=>resolve('timeout'),6000))
    ])
  })
  expect(result).not.toBe('timeout')
  expect(result).toEqual(expect.objectContaining({message:expect.any(String)}))
})
