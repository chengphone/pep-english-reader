import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { test } from 'node:test'
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8')
const base='http://localhost/pep-english-reader/'
function harness(){
 const handlers={},stores=new Map(),pending=[];let fetchImpl=async()=>new Response('online'),failWrites=false
 const cacheFor=name=>{if(!stores.has(name))stores.set(name,new Map());const values=stores.get(name);return {
  match:async request=>values.get(typeof request==='string'?request:request.url)?.clone(),
  put:async(request,response)=>{if(failWrites)throw new Error('QuotaExceededError');values.set(typeof request==='string'?request:request.url,response.clone())},addAll:async()=>{}
 }}
 const caches={open:async name=>cacheFor(name),keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),match:async request=>{for(const name of stores.keys()){const found=await cacheFor(name).match(request);if(found)return found}}}
 const self={location:new URL(base+'sw.js'),addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting:()=>{},clients:{claim:async()=>{}}}
 vm.runInNewContext(source,{self,caches,URL,Response,fetch:request=>fetchImpl(request)})
 return {stores,cacheFor,network(fn){fetchImpl=fn},quota(){failWrites=true},async activate(){handlers.activate({waitUntil:p=>pending.push(p)});await Promise.all(pending)},async request(path){let response;const waits=[];handlers.fetch({request:new Request(new URL(path,base)),respondWith:p=>response=p,waitUntil:p=>waits.push(p)});if(!response)return undefined;const result=await response;await Promise.all(waits);return result}}
}
test('activation preserves caches belonging to other applications',async()=>{
 const h=harness();h.cacheFor('another-app-v1');h.cacheFor('pep-reader-shell-obsolete');await h.activate()
 assert(h.stores.has('another-app-v1'));assert(!h.stores.has('pep-reader-shell-obsolete'))
})
test('worker ignores same-origin requests outside the application scope',async()=>{
 const h=harness();assert.equal(await h.request('/another-app/private.json'),undefined)
})
test('cache quota failure does not discard an online metadata response',async()=>{
 const h=harness();h.quota();h.network(async()=>new Response('{"schemaVersion":1,"units":[]}'))
 const response=await h.request('data/default-vocabulary.json?v=1');assert.equal(response.status,200);assert.match(await response.text(),/schemaVersion/)
})
test('a different application cache cannot poison this app asset response',async()=>{
 const h=harness();await h.cacheFor('another-app').put(base+'icon.svg',new Response('wrong'))
 const response=await h.request('icon.svg');assert.equal(await response.text(),'online')
})
test('metadata uses a canonical cache key for offline requests with new query parameters',async()=>{
 const h=harness();await h.request('data/default-vocabulary.json?v=1');h.network(async()=>{throw new Error('offline')})
 const response=await h.request('data/default-vocabulary.json?v=2');assert.equal(await response.text(),'online')
})
