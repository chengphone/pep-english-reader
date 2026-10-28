export type PageFit='width'|'page'
export function pageDisplaySize(width:number,height:number,ratio:number,fit:PageFit,zoom:number) {
 const aspect=Number.isFinite(ratio)&&ratio>0?ratio:Math.SQRT2
 const roomWidth=Math.max(120,width-(width<600?24:150)),roomHeight=Math.max(100,height-36)
 const base=fit==='page'?Math.min(roomWidth,roomHeight/aspect):Math.min(roomWidth,860)
 return {width:Math.max(1,base*zoom),height:Math.max(1,base*zoom*aspect)}
}
