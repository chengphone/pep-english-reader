export function fetchWithTimeout<T>(input:RequestInfo|URL,init:RequestInit,read:(response:Response)=>Promise<T>|T,ms=15000):Promise<T>{
 const controller=new AbortController()
 const timer=setTimeout(()=>controller.abort(),ms)
 return (async()=>{
  try{
   const response=await fetch(input,{...init,signal:init.signal??controller.signal})
   return await read(response)
  }catch(error){
   if(controller.signal.aborted)throw new Error('网络请求超时，请检查网络后重试。')
   // fetch rejects with TypeError when the network is unavailable; the browser's
   // message ("Failed to fetch" / "Load failed") is English and device-specific.
   if(error instanceof TypeError)throw new Error('网络请求失败，请检查网络后重试。')
   throw error
  }
  finally{clearTimeout(timer)}
 })()
}
