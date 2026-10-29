let ready=false,reloading=false,started=false
const listeners=new Set<()=>void>()
export const appUpdateReady=()=>ready
export function subscribeAppUpdates(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function reloadUpdatedApp(){
 if(reloading)return
 reloading=true
 // A new query also bypasses a cache-first navigation in an older installed worker.
 const url=new URL(location.href);url.searchParams.set('app-update',String(Date.now()));location.replace(url.href)
}
export function registerAppUpdates(){
 if(started||!('serviceWorker'in navigator))return
 started=true
 const previouslyControlled=!!navigator.serviceWorker.controller
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(!previouslyControlled||ready)return
  ready=true;for(const listener of listeners)listener()
 })
 // Register immediately. Waiting for window.load can defer an update behind a blocked external font.
 void navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js',{updateViaCache:'none'}).then(registration=>registration.update()).catch(error=>console.warn('App update unavailable; keeping the installed offline version',error))
}
