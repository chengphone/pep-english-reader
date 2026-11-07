export function fetchWithTimeout<T>(input:RequestInfo|URL,init:RequestInit,read:(response:Response)=>Promise<T>|T,ms=15000):Promise<T>{
 const controller=new AbortController()
 const timer=setTimeout(()=>controller.abort(),ms)
 return (async()=>{
  try{
   const response=await fetch(input,{...init,signal:init.signal??controller.signal})
   return await read(response)
  }catch(error){throw controller.signal.aborted?new Error('网络请求超时，请检查网络后重试。'):error}
  finally{clearTimeout(timer)}
 })()
}
