import assert from 'node:assert/strict'
import { fetchWithTimeout } from '../src/fetchTimeout.ts'

const originalFetch=globalThis.fetch

// Headers can arrive while the body stalls; the timeout must cover reading it.
globalThis.fetch=async (_input,init)=>({
 ok:true,
 json:()=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}))
})
await assert.rejects(()=>fetchWithTimeout('https://example.test/slow',{},response=>response.json(),40),/网络请求超时/)

globalThis.fetch=async()=>({ok:true,json:async()=>({value:42})})
assert.deepEqual(await fetchWithTimeout('https://example.test/ok',{},response=>response.json(),200),{value:42})

globalThis.fetch=async()=>{throw new Error('offline')}
await assert.rejects(()=>fetchWithTimeout('https://example.test/fail',{},response=>response.json(),200),/offline/)

globalThis.fetch=originalFetch
console.log('Passed: body-read timeout, successful JSON reads, and non-timeout errors propagate')
