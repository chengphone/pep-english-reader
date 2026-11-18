export const HOTSPOT_VERSION=2
type Rect=[number,number,number,number]
export type GeneratedHotspot={id:string;text:string;order:number;rects:Rect[]}
type Fragment={text:string;rect:Rect;baseline:number;size:number;index:number}
const clean=(s:string)=>s.normalize('NFKC').replace(/\u00ad/g,'')
const terminal=(s:string)=>/[.!?。！？]["'’”)]*$/.test(s.trim())&&!/\b(?:Mr|Mrs|Ms|Dr|St)\.$/i.test(s.trim())
function build(fragments:Fragment[],pageNumber:number):GeneratedHotspot[]{
 const lines:Fragment[][]=[]
 for(const f of fragments.sort((a,b)=>a.baseline-b.baseline||a.rect[0]-b.rect[0])){const line=lines.find(l=>Math.abs(l[0].baseline-f.baseline)<=Math.min(l[0].size,f.size)*.3);if(line)line.push(f);else lines.push([f])}
 const runs:Fragment[]=[]
 for(const line of lines){let run:Fragment|undefined;for(const f of line.sort((a,b)=>a.rect[0]-b.rect[0])){if(run&&clean(run.text).trim()===clean(f.text).trim()&&Math.abs(run.rect[0]-f.rect[0])<f.size*.15)continue;const gap=run?f.rect[0]-run.rect[2]:Infinity;const sameFont=run&&Math.max(run.size,f.size)/Math.min(run.size,f.size)<1.6;if(run&&sameFont&&gap<=Math.min(run.size,f.size)*1.05&&gap>=-Math.min(run.size,f.size)*.3){const separator=/\s$/.test(run.text)||/^\s|^[.,!?;:)'’]/.test(f.text)?'':gap>Math.min(run.size,f.size)*.12?' ':'';run.text=run.text+separator+f.text;run.rect=[Math.min(run.rect[0],f.rect[0]),Math.min(run.rect[1],f.rect[1]),Math.max(run.rect[2],f.rect[2]),Math.max(run.rect[3],f.rect[3])]}else{run={...f,rect:[...f.rect]};runs.push(run)}}}
 const groups:{text:string;parts:Fragment[]}[]=[]
 for(const run of runs.sort((a,b)=>a.baseline-b.baseline||a.rect[0]-b.rect[0])){let candidate:typeof groups[number]|undefined;let nearest=Infinity;for(const g of groups){const last=g.parts[g.parts.length-1];const dy=run.baseline-last.baseline;const font=Math.min(run.size,last.size);const overlap=Math.min(run.rect[2],last.rect[2])-Math.max(run.rect[0],last.rect[0]);const narrow=Math.min(run.rect[2]-run.rect[0],last.rect[2]-last.rect[0]);if(!terminal(g.text)&&dy>font*.7&&dy<font*1.85&&Math.max(run.size,last.size)/font<1.35&&overlap>narrow*.45&&dy<nearest){candidate=g;nearest=dy}}
 if(candidate){candidate.text=candidate.text.trim()+' '+run.text.trim();candidate.parts.push(run)}else groups.push({text:run.text.trim(),parts:[run]})}
 return groups.filter(g=>/[A-Za-z]/.test(g.text)).map((g,i)=>({id:`p${pageNumber}_s${i+1}`,text:g.text.replace(/\s+/g,' ').trim(),order:i+1,rects:g.parts.map(p=>p.rect)}))
}
function validViewport(viewport:any):boolean{
 return !!viewport&&Number.isFinite(viewport.width)&&viewport.width>0&&Number.isFinite(viewport.height)&&viewport.height>0&&Number.isFinite(viewport.scale)&&viewport.scale>0&&typeof viewport.convertToViewportPoint==='function'
}
function validRect(rect:Rect):boolean{
 return rect.every(Number.isFinite)&&rect[0]>=0&&rect[1]>=0&&rect[2]<=1&&rect[3]<=1&&rect[2]>rect[0]&&rect[3]>rect[1]
}
export function buildTextHotspots(content:any,viewport:any,pageNumber:number):GeneratedHotspot[]{
 if(!Array.isArray(content?.items)||!validViewport(viewport))return []
 const displayViewport=viewport
 viewport=viewport.clone?viewport.clone({rotation:0}):viewport
 if(!validViewport(viewport))return []
 const fragments:Fragment[]=[]
 for(const [index,item] of content.items.entries()){
  if(!item||typeof item.str!=='string'||!item.str.trim())continue
  const text=clean(item.str)
  if(!/[A-Za-z.,!?;:'’()]/.test(text))continue
  const t=item.transform
  if(!Array.isArray(t)||t.length<6||!t.slice(0,6).every(Number.isFinite)||!Number.isFinite(item.width))continue
  const rawHeight=Math.abs(item.height)
  const height=Number.isFinite(rawHeight)&&rawHeight>0?rawHeight:Math.hypot(t[2],t[3])
  if(!Number.isFinite(height)||height<=0)continue
  if(height>viewport.height/viewport.scale*.09&&/^[A-Z]$/.test(text.trim()))continue
  const font=content.styles?.[item.fontName]
  const ascent=Number.isFinite(font?.ascent)?font.ascent:.9
  const descent=Number.isFinite(font?.descent)?font.descent:-.18
  const len=Math.hypot(t[0],t[1])||1,vertical=Math.hypot(t[2],t[3])||1
  const ux=t[0]/len,uy=t[1]/len,vx=t[2]/vertical,vy=t[3]/vertical
  const points:number[][]=[]
  for(const x of [0,item.width])for(const y of [descent*height,ascent*height])points.push(viewport.convertToViewportPoint(t[4]+ux*x+vx*y,t[5]+uy*x+vy*y))
  if(points.some(point=>!Array.isArray(point)||!Number.isFinite(point[0])||!Number.isFinite(point[1])))continue
  const left=Math.max(0,Math.min(...points.map(point=>point[0]))/viewport.width)
  const right=Math.min(1,Math.max(...points.map(point=>point[0]))/viewport.width)
  const top=Math.max(0,Math.min(...points.map(point=>point[1]))/viewport.height)
  const bottom=Math.min(1,Math.max(...points.map(point=>point[1]))/viewport.height)
  const baselinePoint=viewport.convertToViewportPoint(t[4],t[5])
  const baseline=baselinePoint?.[1]/viewport.width,size=height*viewport.scale/viewport.width
  const rect:Rect=[left,top,right,bottom]
  if(!validRect(rect)||!Number.isFinite(baseline)||!Number.isFinite(size)||size<=0)continue
  fragments.push({text,rect,baseline,size,index})
 }
 const result=build(fragments,pageNumber)
 if(displayViewport.rotation===viewport.rotation)return result
 if(!validViewport(displayViewport)||typeof viewport.convertToPdfPoint!=='function')return []
 return result.flatMap(item=>{
  const rects=item.rects.flatMap(rect=>{
   const points:number[][]=[]
   for(const x of [rect[0],rect[2]])for(const y of [rect[1],rect[3]]){
    const pdf=viewport.convertToPdfPoint(x*viewport.width,y*viewport.height)
    points.push(displayViewport.convertToViewportPoint(pdf[0],pdf[1]))
   }
   if(points.some(point=>!Array.isArray(point)||!Number.isFinite(point[0])||!Number.isFinite(point[1])))return []
   const converted:Rect=[
    Math.max(0,Math.min(...points.map(point=>point[0]))/displayViewport.width),
    Math.max(0,Math.min(...points.map(point=>point[1]))/displayViewport.height),
    Math.min(1,Math.max(...points.map(point=>point[0]))/displayViewport.width),
    Math.min(1,Math.max(...points.map(point=>point[1]))/displayViewport.height),
   ]
   return validRect(converted)?[converted]:[]
  })
  return rects.length?[{...item,rects}]:[]
 })
}
export function buildOcrHotspots(words:any[],width:number,height:number,pageNumber:number){
 if(!Array.isArray(words)||!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)return []
 const fragments:Fragment[]=[]
 for(const [index,word] of words.entries()){
  const box=word?.bbox
  if(typeof word?.text!=='string'||!word.text.trim()||!Number.isFinite(word.confidence)||word.confidence<35||!box)continue
  const {x0,y0,x1,y1}=box
  if(![x0,y0,x1,y1].every(Number.isFinite)||x1<=x0||y1<=y0)continue
  const rect:Rect=[Math.max(0,x0/width),Math.max(0,y0/height),Math.min(1,x1/width),Math.min(1,y1/height)]
  const baseline=y1/width,size=(y1-y0)/width
  if(!validRect(rect)||!Number.isFinite(baseline)||!Number.isFinite(size)||size<=0)continue
  fragments.push({text:clean(word.text),rect,baseline,size,index})
 }
 return build(fragments,pageNumber)
}
