import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { test } from 'node:test'
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8')
const base='http://localhost/pep-english-reader/'
const json=body=>new Response(body,{headers:{'content-type':'application/json'}})
function harness(){
 const handlers={},stores=new Map(),pending=[],addAlls=[];let fetchImpl=async()=>new Response('online'),failWrites=false
 const cacheFor=name=>{if(!stores.has(name))stores.set(name,new Map());const values=stores.get(name);return {
  match:async request=>values.get(typeof request==='string'?request:request.url)?.clone(),
  put:async(request,response)=>{if(failWrites)throw new Error('QuotaExceededError');values.set(typeof request==='string'?request:request.url,response.clone())},addAll:async requests=>{addAlls.push(requests)},keys:async()=>[...values.keys()].map(url=>new Request(url))
 }}
 const caches={open:async name=>cacheFor(name),keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),match:async request=>{for(const name of stores.keys()){const found=await cacheFor(name).match(request);if(found)return found}}}
 const self={location:new URL(base+'sw.js'),addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting:()=>{},clients:{claim:async()=>{}}}
 // Service workers resolve relative precache URLs against their location; Node's
 // Request constructor requires absolute URLs, so mirror that behavior here.
 const ScopedRequest=class extends Request{constructor(input,init){super(typeof input==='string'?new URL(input,base).href:input,init)}}
 vm.runInNewContext(source,{self,caches,URL,Request:ScopedRequest,Response,AbortController,setTimeout,clearTimeout,fetch:(request,init)=>fetchImpl(request,init)})
 return {stores,cacheFor,addAlls,network(fn){fetchImpl=fn},quota(){failWrites=true},async install(){handlers.install({waitUntil:p=>pending.push(p)});await Promise.all(pending)},async activate(){handlers.activate({waitUntil:p=>pending.push(p)});await Promise.all(pending)},async request(path,navigation=false,headers){let response;const waits=[];const request=new Request(new URL(path,base),{headers});if(navigation)Object.defineProperty(request,'mode',{value:'navigate'});handlers.fetch({request,respondWith:p=>response=p,waitUntil:p=>waits.push(p)});if(!response)return undefined;const result=await response;await Promise.all(waits);return result}}
}
test('activation preserves caches belonging to other applications',async()=>{
 const h=harness();h.cacheFor('another-app-v1');h.cacheFor('pep-reader-shell-obsolete');await h.activate()
 assert(h.stores.has('another-app-v1'));assert(!h.stores.has('pep-reader-shell-obsolete'))
})
test('activation migrates data cached by the previous app version',async()=>{
 const h=harness()
 await h.cacheFor('pep-reader-shell-previous').put(base+'data/word-learning/books.json',json('old catalog'))
 await h.cacheFor('pep-reader-shell-previous').put(base+'assets/index-old.js',new Response('old asset'))
 await h.activate()
 assert(!h.stores.has('pep-reader-shell-previous'))
 h.network(async()=>{throw new Error('offline')})
 assert.equal(await (await h.request('data/word-learning/books.json')).text(),'old catalog')
})

test('worker ignores same-origin requests outside the application scope',async()=>{
 const h=harness();assert.equal(await h.request('/another-app/private.json'),undefined)
})
test('offline uncached assets and metadata fail rather than returning unrelated cached content',async()=>{
 const h=harness();await h.cacheFor('another-app').put(base+'missing.js',new Response('wrong'))
 h.network(async()=>{throw new Error('offline')})
 assert.equal((await h.request('missing.js')).type,'error')
 assert.equal((await h.request('data/default-vocabulary.json')).type,'error')
})
test('failed online metadata falls back to last successfully cached version',async()=>{
 const h=harness();h.network(async()=>json('valid'))
 await h.request('audio/library-manifest.json?v=1')
 h.network(async()=>new Response('server error',{status:503}))
 assert.equal(await (await h.request('audio/library-manifest.json?v=2')).text(),'valid')
})
test('cache quota failure does not discard an online metadata response',async()=>{
 const h=harness();h.quota();h.network(async()=>json('{"schemaVersion":1,"units":[]}'))
 const response=await h.request('data/default-vocabulary.json?v=1');assert.equal(response.status,200);assert.match(await response.text(),/schemaVersion/)
})
test('a different application cache cannot poison this app asset response',async()=>{
 const h=harness();await h.cacheFor('another-app').put(base+'icon.svg',new Response('wrong'))
 const response=await h.request('icon.svg');assert.equal(await response.text(),'online')
})
test('metadata uses a canonical cache key for offline requests with new query parameters',async()=>{
 const h=harness();h.network(async()=>json('online'));await h.request('data/default-vocabulary.json?v=1');h.network(async()=>{throw new Error('offline')})
 const response=await h.request('data/default-vocabulary.json?v=2');assert.equal(await response.text(),'online')
})

test('cached data survives an app update so follow-along still works offline',async()=>{
 const h=harness();h.network(async()=>json('catalog'));await h.request('data/word-learning/books.json')
 assert([...h.stores.keys()].some(name=>name.startsWith('pep-reader-data-')),'data must be stored outside the versioned shell cache')
 await h.activate()
 h.network(async()=>{throw new Error('offline')})
 assert.equal(await (await h.request('data/word-learning/books.json')).text(),'catalog')
})

test('online word-learning data refreshes a cached copy instead of serving it first',async()=>{
 const h=harness();h.network(async()=>json('old catalog'));await h.request('data/word-learning/books.json')
 let init
 h.network(async(request,options)=>{init=options;return json('new catalog')})
 assert.equal(await (await h.request('data/word-learning/books.json')).text(),'new catalog')
 assert.equal(init?.cache,'no-store')
 h.network(async()=>{throw new Error('offline')})
 assert.equal(await (await h.request('data/word-learning/books.json')).text(),'new catalog')
})

test('online textbook catalog refreshes instead of being served from the shell cache',async()=>{
 const h=harness();h.network(async()=>json('{"books":[]}'));await h.request('remote-books.json')
 let init;h.network(async(request,options)=>{init=options;return json('{"books":[{"id":"b"}]}')})
 assert.match(await (await h.request('remote-books.json')).text(),/"id":"b"/)
 assert.equal(init?.cache,'no-store')
 h.network(async()=>{throw new Error('offline')})
 assert.match(await (await h.request('remote-books.json')).text(),/"id":"b"/)
})

test('an error response for data falls back to the cached copy',async()=>{
 const h=harness();h.network(async()=>json('cached catalog'));await h.request('data/word-learning/books.json')
 h.network(async()=>new Response('missing',{status:404}))
 assert.equal(await (await h.request('data/word-learning/books.json')).text(),'cached catalog')
})

test('an uncached data error keeps its HTTP status instead of becoming a network failure',async()=>{
 const h=harness();h.network(async()=>new Response('missing',{status:404,headers:{'content-type':'text/html'}}))
 // The follow-along page tells a missing book apart from a broken network by the
 // status code; Response.error() would erase it and loop on "check your network".
 const response=await h.request('data/word-learning/removed-book/manifest.json')
 assert.equal(response.status,404)
})

test('hashed build assets are served from cache without a network request',async()=>{
 const h=harness();await h.cacheFor('pep-reader-shell-v3-word-audio').put(base+'assets/index-abc.js',new Response('cached-js'))
 h.network(async()=>{throw new Error('unexpected network')})
 assert.equal(await (await h.request('assets/index-abc.js')).text(),'cached-js')
})

test('cached book media revalidates in the background so replaced files become visible',async()=>{
 const h=harness()
 h.network(async()=>new Response('old-bytes',{status:200}))
 assert.equal(await (await h.request('/book-data/demo/pages/001.jpg')).text(),'old-bytes')
 h.network(async()=>new Response('new-bytes',{status:200}))
 // 当次仍返回旧缓存，后台刷新在 waitUntil 完成后写入新字节。
 assert.equal(await (await h.request('/book-data/demo/pages/001.jpg')).text(),'old-bytes')
 h.network(async()=>{throw new Error('offline')})
 assert.equal(await (await h.request('/book-data/demo/pages/001.jpg')).text(),'new-bytes')
})

test('stable audio-library files live in the data cache and survive an app update',async()=>{
 const h=harness()
 const file='audio/library/'+'a'.repeat(64)+'.mp3'
 h.network(async()=>new Response('audio-bytes',{status:200}))
 assert.equal(await (await h.request(file)).text(),'audio-bytes')
 assert([...h.stores.keys()].some(name=>name.startsWith('pep-reader-data-')),'stable audio must not live in the versioned shell cache')
 await h.activate()
 h.network(async()=>{throw new Error('offline')})
 assert.equal(await (await h.request(file)).text(),'audio-bytes')
})

test('activation carries stable audio forward from an older shell cache',async()=>{
 const h=harness()
 const file='audio/library/'+'b'.repeat(64)+'.mp3'
 await h.cacheFor('pep-reader-shell-previous').put(base+file,new Response('old-audio'))
 await h.activate()
 h.network(async()=>{throw new Error('offline')})
 assert.equal(await (await h.request(file)).text(),'old-audio')
})

test('a stalled data request falls back to the cached copy instead of waiting for the network',async()=>{
 const h=harness();h.network(async()=>json('cached catalog'));await h.request('data/word-learning/books.json')
 let aborted=false
 h.network((request,init)=>new Promise((resolve,reject)=>{
  init?.signal?.addEventListener('abort',()=>{aborted=true;reject(Object.assign(new Error('aborted'),{name:'AbortError'}))},{once:true})
 }))
 const started=Date.now()
 assert.equal(await (await h.request('data/word-learning/books.json')).text(),'cached catalog')
 assert.equal(aborted,true)
 assert.ok(Date.now()-started<8000)
})

test('an HTML captive-portal answer does not replace cached data for offline use',async()=>{
 const h=harness();h.network(async()=>json('cached catalog'));await h.request('data/word-learning/books.json')
 h.network(async()=>new Response('<html>portal</html>',{status:200,headers:{'content-type':'text/html'}}))
 assert.equal(await (await h.request('data/word-learning/books.json')).text(),'<html>portal</html>')
 h.network(async()=>{throw new Error('offline')})
 assert.equal(await (await h.request('data/word-learning/books.json')).text(),'cached catalog')
})

test('online navigation bypasses an old cached homepage and saves the new shell for offline use',async()=>{
 const h=harness();await h.cacheFor('pep-reader-shell-v3-word-audio').put(base+'index.html',new Response('old catalog'))
 h.network(async()=>new Response('new catalog'))
 assert.equal(await (await h.request('index.html',true)).text(),'new catalog')
 h.network(async()=>{throw new Error('offline')})
 assert.equal(await (await h.request('./?fresh=1',true)).text(),'new catalog')
})

test('installation precaches the shell straight from the network',async()=>{
 const h=harness();await h.install()
 const requests=h.addAlls[0]
 assert(Array.isArray(requests)&&requests.length>=2,'the install must precache the shell synchronously')
 assert(requests.every(request=>request instanceof Request&&request.cache==='reload'),'precaching must not reuse a previous release from the HTTP cache')
})

test('online navigation bypasses the HTTP cache so an old shell cannot outlive its assets',async()=>{
 const h=harness();let init
 h.network(async(request,options)=>{init=options;return new Response('new shell')})
 await h.request('index.html',true)
 assert.equal(init?.cache,'no-store')
})

test('book-data is cached for offline textbook pages and media',async()=>{
 const h=harness()
 h.network(async()=>new Response('page-bytes',{status:200}))
 const first=await h.request('/book-data/demo/pages/001.jpg')
 assert.equal(await first.text(),'page-bytes')
 assert(h.stores.has('pep-reader-books-v1'))
 h.network(async()=>{throw new Error('offline')})
 const second=await h.request('/book-data/demo/audio/track.mp3')
 assert.equal(second.type,'error')
 const cached=await h.request('/book-data/demo/pages/001.jpg')
 assert.equal(await cached.text(),'page-bytes')
})

test('picture-data is cached for offline picture books and is not treated as the app shell',async()=>{
 const h=harness()
 h.network(async()=>new Response('page-image',{status:200}))
 const first=await h.request('/picture-data/books/jtw-001/pages/001.jpg')
 assert.equal(await first.text(),'page-image')
 assert(h.stores.has('pep-reader-books-v1'))
 h.network(async()=>{throw new Error('offline')})
 const cached=await h.request('/picture-data/books/jtw-001/pages/001.jpg')
 assert.equal(await cached.text(),'page-image')
 const catalog=await h.request('/picture-data/picture-books.json')
 assert.equal(catalog.type,'error')
})

test('offline range requests fall back to the cached full media file',async()=>{
 const h=harness()
 h.network(async()=>new Response('full-audio',{status:200}))
 await h.request('/book-data/demo/audio/1.mp3')
 h.network(async()=>{throw new Error('offline')})
 // 播放器定位时会发 Range；缓存里只有完整文件，返回 200 让浏览器自己读全量。
 const response=await h.request('/book-data/demo/audio/1.mp3',false,{Range:'bytes=0-3'})
 assert.equal(response.status,200)
 assert.equal(await response.text(),'full-audio')
})

test('a partial range response is never stored as a complete cached file',async()=>{
 const h=harness()
 h.network(async()=>new Response('part',{status:206,headers:{'Content-Range':'bytes 0-3/100'}}))
 const response=await h.request('/book-data/demo/audio/1.mp3',false,{Range:'bytes=0-3'})
 assert.equal(response.status,206)
 assert(!h.stores.has('pep-reader-books-v1')||!h.stores.get('pep-reader-books-v1').size,'206 must not be cached')
})
