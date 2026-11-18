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

globalThis.fetch=async(_input,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}))
const externalTimeout=new AbortController()
await assert.rejects(()=>fetchWithTimeout('https://example.test/slow-external', {signal:externalTimeout.signal}, response=>response.json(), 40),/网络请求超时/)
const externalCancel=new AbortController()
const cancelled=fetchWithTimeout('https://example.test/cancel', {signal:externalCancel.signal}, response=>response.json(), 10000)
externalCancel.abort()
await assert.rejects(cancelled,error=>error?.name==='AbortError')

globalThis.fetch=async()=>{throw new Error('offline')}
await assert.rejects(()=>fetchWithTimeout('https://example.test/fail',{},response=>response.json(),200),/offline/)

// Browsers reject unreachable requests with an English TypeError; surface it in Chinese.
globalThis.fetch=async()=>{throw new TypeError('Load failed')}
await assert.rejects(()=>fetchWithTimeout('https://example.test/offline',{},response=>response.json(),200),/网络请求失败，请检查网络后重试/)

globalThis.fetch=originalFetch
console.log('Passed: body-read timeout, successful JSON reads, Chinese network errors, and other errors propagate')
