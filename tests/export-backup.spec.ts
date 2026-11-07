import {test,expect} from '@playwright/test'
import fs from 'node:fs/promises'
import {unzipSync,strFromU8} from 'fflate'

test('audio generation request exports a zip with the request and generator',async({page})=>{
  test.setTimeout(60000)
  await page.goto('./')
  const downloadPromise=page.waitForEvent('download')
  await page.evaluate(async()=>{
    const module=await import('/pep-english-reader/src/wordAudio.ts')
    module.exportAudioRequest(['name','nice'],'en-US')
  })
  const download=await downloadPromise
  expect(download.suggestedFilename()).toBe('单词音频制作.zip')
  const path=await download.path()
  expect(path).toBeTruthy()
  const zip=unzipSync(new Uint8Array(await fs.readFile(path!)))
  expect(Object.keys(zip)).toEqual(expect.arrayContaining(['request.json','build_word_audio.py','使用说明.txt']))
  const request=JSON.parse(strFromU8(zip['request.json']))
  expect(request.items.map((item:{text:string})=>item.text)).toEqual(['name','nice'])
})
