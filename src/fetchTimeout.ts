export function fetchWithTimeout(input:RequestInfo|URL,init:RequestInit={},ms=15000):Promise<Response>{
 const controller=new AbortController()
 const timer=setTimeout(()=>controller.abort(),ms)
 return fetch(input,{...init,signal:init.signal??controller.signal})
  .finally(()=>clearTimeout(timer))
  .catch(error=>{throw controller.signal.aborted?new Error('网络请求超时，请检查网络后重试。'):error})
}
