export type AppRoute={kind:'shelf'}|{kind:'local';bookId:string;page:number}|{kind:'online';bookId:string}|{kind:'vocab'}
export const routeKey='pep-english-reader'
type HistoryState={key?:string;idx?:number;route?:AppRoute}
export function readAppHistory(state:unknown):HistoryState|undefined {
 const value=state&&typeof state==='object'?state as HistoryState:{}
 return value.key===routeKey&&Number.isInteger(value.idx)&&value.idx!>=0&&value.route?value:undefined
}
export function routeFromUrl(url:URL):AppRoute {
 const app=url.searchParams.get('view'),id=url.searchParams.get('book')
 if(app==='online'&&id)return {kind:'online',bookId:id}
 if(app==='local'&&id)return {kind:'local',bookId:id,page:Math.max(0,Number(url.searchParams.get('page'))||0)}
 if(app==='vocab')return {kind:'vocab'}
 return {kind:'shelf'}
}
export function writeRouteUrl(route:AppRoute){
 const url=new URL(location.href)
 for(const key of ['view','book','page'])url.searchParams.delete(key)
 if(route.kind==='online'){url.searchParams.set('view','online');url.searchParams.set('book',route.bookId)}
 if(route.kind==='local'){url.searchParams.set('view','local');url.searchParams.set('book',route.bookId);url.searchParams.set('page',String(route.page))}
 if(route.kind==='vocab')url.searchParams.set('view','vocab')
 return url.href
}
export function navigationTarget(event:PopStateEvent){return readAppHistory(event.state)}
export function writeAppState(route:AppRoute,index:number){return {...(history.state&&typeof history.state==='object'?history.state:{}),key:routeKey,idx:index,route}}
