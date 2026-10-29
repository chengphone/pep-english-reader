import { test, expect, type Page } from '@playwright/test'
const errors=new WeakMap<Page,string[]>()
test.beforeEach(async({page})=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message))})
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);await expect(page.locator('vite-error-overlay')).toHaveCount(0)})
const repo='https://api.github.com/repos/chengphone/pep-english-reader'
const unit=(id='u1',title=id)=>({id,book:'同步测试教材',title,category:'units',words:[{id:id+'-word',english:'apple',meaning:'苹果'}]})
async function fixture(page:Page){
 let dataset:any={schemaVersion:1,revision:1,units:[unit('u1')]},audio:any={schemaVersion:1,items:[]},head='initial',entries:any[]=[],commits=0
 let release:undefined|(()=>void),holdCommits=false,waiting=false,failureStatus=0,loseRefResponse=false,malformed=false,largeSource=false
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,body=req.postData()?req.postDataJSON():undefined
  if(req.url().startsWith(repo)){
   if(failureStatus&&path.includes('/contents/')){const status=failureStatus;failureStatus=0;return route.fulfill({status,contentType:'text/html',body:'<h1>failure</h1>'})}
   let result:any
   if(req.url()===repo)result={permissions:{push:true}}
   else if(path.endsWith('/git/ref/heads/main'))result={object:{sha:head}}
   else if(path.includes('/git/commits/')&&req.method()==='GET'){
    if(holdCommits){waiting=true;await new Promise<void>(resolve=>{release=resolve})}
    result={tree:{sha:'base'}}
   }
   else if(path.includes('/contents/')&&largeSource&&path.includes('default-vocabulary'))result={encoding:'none',sha:'b'.repeat(40)}
   else if(path.includes('/git/blobs/')&&req.method()==='GET')result={encoding:'base64',content:Buffer.from(JSON.stringify(dataset)).toString('base64')}
   else if(path.includes('/contents/')&&malformed)result={encoding:'base64',content:Buffer.from('{broken-json').toString('base64')}
   else if(path.includes('/contents/'))result={encoding:'base64',content:Buffer.from(JSON.stringify(path.includes('default-vocabulary')?dataset:audio)).toString('base64')}
   else if(path.endsWith('/git/blobs'))result={sha:'blob-'+commits}
   else if(path.endsWith('/git/trees')){entries=body.tree;result={sha:'tree'}}
   else if(path.endsWith('/git/commits'))result={sha:'commit-'+(commits+1)}
   else if(path.endsWith('/git/refs/heads/main')){for(const entry of entries){if(entry.path.endsWith('default-vocabulary.json'))dataset=JSON.parse(entry.content);if(entry.path.endsWith('library-manifest.json'))audio=JSON.parse(entry.content)}head=body.sha;commits++;if(loseRefResponse){loseRefResponse=false;return route.abort('failed')}result={object:{sha:head}}}
   else throw new Error('Unexpected GitHub API call: '+path)
   return route.fulfill({json:result})
  }
  if(path.endsWith('/data/default-vocabulary.json'))return route.fulfill({json:dataset})
  if(path.endsWith('/audio/library-manifest.json'))return route.fulfill({json:audio})
  return route.continue()
 })
 await page.goto('./');await page.getByRole('button',{name:'单元默写',exact:true}).click()
 await expect(page.getByRole('button',{name:'u1',exact:true})).toBeVisible()
 await page.evaluate(async()=>{const path='/pep-english-reader/src/sharedLibrary.ts',m=await import(path);await m.connectShared('test-token');m.setAutomaticShared(false)})
 return {get dataset(){return dataset},get audio(){return audio},get commits(){return commits},fail(status:number){failureStatus=status},loseResponse(){loseRefResponse=true},invalidJson(){malformed=true},largeSource(){largeSource=true},hold(){holdCommits=true},get waiting(){return waiting},release(){holdCommits=false;release?.()}}
}
async function save(page:Page,u:any){await page.evaluate(async u=>{const path='/pep-english-reader/src/vocabularyStorage.ts',m=await import(path);await m.saveUnit(u)},u)}
async function publish(page:Page){return page.evaluate(async()=>{const path='/pep-english-reader/src/sharedLibrary.ts',m=await import(path);await m.publishShared()})}

test('a remote-only unit survives consecutive publishes without first being downloaded',async({page})=>{
 const f=await fixture(page);f.dataset.units.push(unit('u2','另一台设备新增'))
 await save(page,unit('u1','本机第一次修改'));await publish(page)
 expect(f.dataset.units.map((u:any)=>u.id)).toContain('u2')
 await save(page,unit('u1','本机第二次修改'));await publish(page)
 expect(f.dataset.units.map((u:any)=>u.id)).toContain('u2')
})
test('an unchanged local unit cannot roll back a remote edit during later unrelated publishes',async({page})=>{
 const f=await fixture(page);f.dataset.units[0].title='远端最新标题'
 await save(page,unit('u3','本机新增'));await publish(page)
 await save(page,unit('u3','仅修改本机新增'));await publish(page)
 expect(f.dataset.units.find((u:any)=>u.id==='u1').title).toBe('远端最新标题')
})
test('an acknowledged local audio cannot overwrite a later remote replacement',async({page})=>{
 const f=await fixture(page)
 await page.evaluate(async()=>{const db:any=await new Promise(resolve=>{const r=indexedDB.open('pep-word-audio',1);r.onupgradeneeded=()=>r.result.createObjectStore('audio',{keyPath:'key'});r.onsuccess=()=>resolve(r.result)});await new Promise<void>(resolve=>{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put({key:'apple',text:'apple',voice:'导入音频',updatedAt:100,bytes:new TextEncoder().encode('ID3-local-audio').buffer,mime:'audio/mpeg'});tx.oncomplete=()=>resolve()});db.close()})
 await publish(page);f.audio.items[0].file='audio/library/'+('f'.repeat(64))+'.mp3'
 await save(page,unit('u1','无关的词表修改'));await publish(page)
 expect(f.audio.items[0].file).toBe('audio/library/'+('f'.repeat(64))+'.mp3')
})
test('switching automatic publication off cancels the already scheduled job',async({page})=>{
 const f=await fixture(page)
 await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/sharedLibrary.ts');m.setAutomaticShared(true)})
 await save(page,unit('u1','不应该发布'))
 await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/sharedLibrary.ts');m.setAutomaticShared(false)})
 await page.waitForTimeout(1800);expect(f.commits).toBe(0)
})
test('disconnecting and reconnecting does not authorize an older in-flight publication',async({page})=>{
 const f=await fixture(page);await save(page,unit('u1','旧会话修改'));f.hold()
 await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/sharedLibrary.ts');(window as any).__oldPublication=m.publishShared().catch(()=>{})})
 await expect.poll(()=>f.waiting).toBe(true)
 await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/sharedLibrary.ts');m.disconnectShared();await m.connectShared('different-test-token')})
 f.release();await page.evaluate(()=>(window as any).__oldPublication)
 expect(f.commits).toBe(0)
})

test('a manual publish queued during another publish runs even with automatic mode off',async({page})=>{
 const f=await fixture(page);await save(page,unit('u1','第一次保存'));f.hold()
 await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/sharedLibrary.ts');(window as any).__first=m.publishShared()})
 await expect.poll(()=>f.waiting).toBe(true);await save(page,unit('u1','第二次保存'))
 await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/sharedLibrary.ts');(window as any).__second=m.publishShared()})
 f.release();await page.evaluate(()=>(window as any).__second)
 expect(f.commits).toBe(2);expect(f.dataset.units[0].title).toBe('第二次保存')
})
test('malformed remote words neither replace local data nor get published',async({page})=>{
 const f=await fixture(page);f.dataset.units[0].words[0].english=null
 const local=await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/vocabularyStorage.ts');return await m.seedHostedVocabulary()})
 expect(local[0].words[0].english).toBe('apple')
 await expect(publish(page)).rejects.toThrow('无效词句');expect(f.commits).toBe(0)
})
test('corrupt legacy baseline metadata is repaired without losing the website vocabulary',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('pep-shared-vocabulary-baseline-v2','{"not":"an array"}'))
 const f=await fixture(page);await save(page,unit('u1','正常修改'));await publish(page)
 expect(f.dataset.units[0].title).toBe('正常修改')
})
test('blocked localStorage writes do not disable IndexedDB-backed publication',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('blocked','QuotaExceededError')}})
 const f=await fixture(page);await save(page,unit('u1','无需 localStorage 写入'));await publish(page)
 expect(f.commits).toBe(1);expect(f.dataset.units[0].title).toBe('无需 localStorage 写入')
})
test('legacy duplicate word IDs can be selected and edited independently',async({page})=>{
 await fixture(page)
 await save(page,{...unit(),words:[{id:'duplicate',english:'pen',meaning:'钢笔'},{id:'duplicate',english:'pen pal',meaning:'笔友'}]})
 await page.getByRole('button',{name:'课本点读',exact:true}).click();await page.getByRole('button',{name:'单元默写',exact:true}).click()
 await page.getByRole('checkbox',{name:'听写 pen',exact:true}).waitFor();await page.getByRole('button',{name:'清空',exact:true}).click();await page.getByRole('checkbox',{name:'听写 pen',exact:true}).check()
 await expect(page.getByRole('checkbox',{name:'听写 pen pal',exact:true})).not.toBeChecked()
 await page.getByRole('button',{name:'资料管理',exact:true}).click();await page.getByRole('tab',{name:'词表校对',exact:true}).click()
 await page.getByLabel('第 1 条中文',{exact:true}).fill('钢笔-新释义');await expect(page.getByLabel('第 2 条中文',{exact:true})).toHaveValue('笔友')
 await page.getByRole('button',{name:'保存本单元',exact:true}).click()
 const stored=await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/vocabularyStorage.ts');return (await m.loadUnits())[0].words})
 expect(new Set(stored.map(word=>word.id)).size).toBe(2);expect(stored[1].meaning).toBe('笔友')
})

test('corrupt stored units stay in storage and cannot be published as deletions',async({page})=>{
 const f=await fixture(page)
 await page.evaluate(async()=>{const db:any=await new Promise(resolve=>{const r=indexedDB.open('pep-reader-v1',2);r.onsuccess=()=>resolve(r.result)});await new Promise<void>(resolve=>{const tx=db.transaction('units','readwrite');tx.objectStore('units').put({id:'u1',book:'同步测试教材',title:null,words:[]});tx.oncomplete=()=>resolve()});db.close()})
 await expect(publish(page)).rejects.toThrow('本机存在无法读取的词表')
 expect(f.commits).toBe(0);expect(f.dataset.units).toHaveLength(1)
 const stored=await page.evaluate(async()=>{const db:any=await new Promise(resolve=>{const r=indexedDB.open('pep-reader-v1',2);r.onsuccess=()=>resolve(r.result)});const value=await new Promise(resolve=>{const r=db.transaction('units').objectStore('units').get('u1');r.onsuccess=()=>resolve(r.result)});db.close();return value})
 expect(stored).toMatchObject({id:'u1',title:null})
})

function wavBuffer(frequency=440){
 const wav=Buffer.alloc(44+6400);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(6400,40)
 for(let i=0;i<3200;i++)wav.writeInt16LE(Math.round(Math.sin(2*Math.PI*frequency*i/16000)*4000),44+i*2)
 return wav
}
async function importWav(page:Page,frequency=440){
 const wav=wavBuffer(frequency)
 await page.evaluate(async bytes=>{const m=await import('/pep-english-reader/src/wordAudio.ts');await m.importWordAudio([new File([new Uint8Array(bytes)],'apple.wav',{type:'audio/wav'})],['apple'])},[...wav])
}

test('a genuinely new imported audio publishes when the observed remote file was absent',async({page})=>{
 const f=await fixture(page)
 await importWav(page)
 await publish(page)
 expect(f.commits).toBe(1);expect(f.audio.items[0]).toMatchObject({text:'apple',voice:'导入音频'});expect(f.audio.items[0].file).toMatch(/\.wav$/)
})

test('expired authorization disconnects the publisher without changing the repository',async({page})=>{
 const f=await fixture(page);await save(page,unit('u1','待发布'));f.fail(401)
 await expect(publish(page)).rejects.toThrow('授权已失效')
 const state=await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/sharedLibrary.ts');return m.sharedState()})
 expect(state.connected).toBe(false);expect(state.automatic).toBe(false);expect(f.commits).toBe(0)
})
test('an HTML server error reports its status and leaves local changes available for retry',async({page})=>{
 const f=await fixture(page);await save(page,unit('u1','待发布'));f.fail(503)
 await expect(publish(page)).rejects.toThrow('503');expect(f.commits).toBe(0)
 await publish(page);expect(f.commits).toBe(1);expect(f.dataset.units[0].title).toBe('待发布')
})
test('a lost successful commit response can be retried without publishing the same change twice',async({page})=>{
 const f=await fixture(page);await save(page,unit('u1','只发布一次'));f.loseResponse()
 await expect(publish(page)).rejects.toThrow('无法连接 GitHub');expect(f.commits).toBe(1)
 await publish(page);expect(f.commits).toBe(1)
})
test('malformed source JSON is rejected before uploading any changes',async({page})=>{
 const f=await fixture(page);await save(page,unit('u1','待发布'));f.invalidJson()
 await expect(publish(page)).rejects.toThrow('不是有效 JSON');expect(f.commits).toBe(0)
})

test('large source files use the authenticated Git blob API when Contents omits their body',async({page})=>{
 const f=await fixture(page);await save(page,unit('u1','大清单仍可更新'));f.largeSource();await publish(page)
 expect(f.commits).toBe(1);expect(f.dataset.units[0].title).toBe('大清单仍可更新')
})

test('publication revisions remain increasing across publisher clock skew',async({page})=>{
 const f=await fixture(page),future=Date.now()+1000000000;f.dataset.revision=future
 await save(page,unit('u1','慢时钟设备更新'));await publish(page)
 expect(f.dataset.revision).toBeGreaterThan(future)
})
test('revision overflow is rejected rather than creating unreadable shared metadata',async({page})=>{
 const f=await fixture(page);f.dataset.revision=Number.MAX_SAFE_INTEGER
 await save(page,unit('u1','不发布溢出版本'));await expect(publish(page)).rejects.toThrow('版本号已达上限');expect(f.commits).toBe(0)
})
test('administrator credentials are never persisted with the vocabulary or synchronization metadata',async({page})=>{
 await fixture(page);await save(page,unit('u1','可发布'));await publish(page)
 const saved=await page.evaluate(async()=>{
  const records:any[]=[JSON.stringify(localStorage),JSON.stringify(sessionStorage)]
  for(const name of ['pep-shared-sync','pep-reader-v1','pep-word-audio']){
   const db:any=await new Promise(resolve=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result)})
   for(const store of db.objectStoreNames){const value=await new Promise(resolve=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result)});records.push(value)}db.close()
  }
  return JSON.stringify(records)
 })
 expect(saved).not.toContain('test-token')
})


test('checking updates allows an intentional new audio import after a remote replacement',async({page})=>{
 const f=await fixture(page)
 await importWav(page);await publish(page)
 const replaced='audio/library/'+('f'.repeat(64))+'.wav'
 f.audio.items[0]={text:'apple',file:replaced,voice:'另一位管理员'}
 await page.getByRole('button',{name:'资料管理',exact:true}).click()
 await page.getByRole('button',{name:'检查网站更新',exact:true}).click()
 await expect(page.getByText('已检查网站词表和音频更新；离线时使用本机资料。',{exact:true})).toBeVisible()
 await importWav(page,660);await publish(page)
 expect(f.commits).toBe(2);expect(f.audio.items[0].file).not.toBe(replaced)
})


test('online audio remains readable when this browser blocks audio storage',async({page})=>{
 const f=await fixture(page);f.audio.items.push({text:'apple',file:'audio/library/'+('a'.repeat(64))+'.mp3'})
 await page.route('**/audio/library/*.mp3',route=>route.fulfill({contentType:'audio/wav',body:wavBuffer()}))
 const result=await page.evaluate(async()=>{
  const original=indexedDB.open.bind(indexedDB)
  indexedDB.open=function(name,...args){if(name==='pep-word-audio')throw new DOMException('blocked','SecurityError');return original(name,...args)}
  const m=await import('/pep-english-reader/src/wordAudio.ts');const result=await m.readWordAudios(['apple']);return result.get('apple')?.blob.size
 })
 expect(result).toBe(wavBuffer().length)
})

test('relisten retries audio that was missing earlier in the same round',async({page})=>{
 const f=await fixture(page)
 await page.getByRole('button',{name:'开始听写',exact:true}).first().click()
 await expect(page.getByText(/本题缺少本地音频/)).toBeVisible()
 f.audio.items.push({text:'apple',file:'audio/library/'+('a'.repeat(64))+'.mp3'})
 await page.route('**/audio/library/*.mp3',route=>route.fulfill({contentType:'audio/wav',body:wavBuffer()}))
 await page.evaluate(async()=>{const m=await import('/pep-english-reader/src/wordAudio.ts');m.invalidateHostedAudioManifest()})
 await page.getByRole('button',{name:'重听 3 遍',exact:true}).click()
 await expect(page.getByText('网站音频 · Aria',{exact:true})).toBeVisible()
 await expect(page.getByText(/已读 3 \/ 3 遍.*等待手动下一题/)).toBeVisible({timeout:15000})
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','100')
 await expect(page.getByRole('switch',{name:'自动下一词'})).not.toBeChecked()
 await expect(page.locator('.dictation-screen')).not.toContainText('apple')
 await page.getByRole('button',{name:'完成本轮',exact:true}).click()
 await expect(page.locator('.dictation-screen')).not.toContainText('apple')
 await page.getByRole('button',{name:'对答案',exact:true}).click()
 await expect(page.locator('.answer-key')).toContainText('apple')
})
