import { collectExpressions, type OcrLine as ExpressionLine } from './expressionExtraction'
import { localTranslation, vocabularySpellingHint } from './translation'
import workerPath from 'tesseract.js/dist/worker.min.js?url'
import corePath from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url'
export type ImageCategory='units'|'vocabulary'|'expressions'
export type ImageImportKind='auto'|ImageCategory
export type ImageOcrResult={category?:ImageCategory;raw:string;width:number;height:number;lowResolution:boolean;count:number;dictionaryCount:number;unresolved:number;lastUnit?:string;inheritedUnit?:string}
type OcrLine={text:string;bbox:{x0:number;y0:number;x1:number;y1:number};confidence:number;words?:{text:string;bbox:{x0:number;y0:number;x1:number;y1:number}}[]}
const lines=(data:any):OcrLine[] => (data.blocks??[]).flatMap((b:any)=>b.paragraphs.flatMap((p:any)=>p.lines))
export async function recognizeVocabularyImage(file:File,onProgress:(message:string)=>void,initialUnit='',kind:ImageImportKind='auto',previousCategory?:ImageCategory):Promise<ImageOcrResult>{
 const url=URL.createObjectURL(file);const image=new Image();try{image.src=url;await image.decode()}finally{URL.revokeObjectURL(url)}
 const width=image.naturalWidth,height=image.naturalHeight,top=0,bottom=height,profileTop=Math.floor(height*.16)
 const original=document.createElement('canvas');original.width=width;original.height=height;const ctx=original.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,width,height).data
 const ink=(x:number,y:number)=>{const i=(y*width+x)*4;return pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114<165}
 // Find the quiet gutter between columns instead of splitting through the page references.
 let bestStart=0,bestEnd=0,start=-1;for(let x=Math.floor(width*.43);x<width*.60;x++){let count=0;for(let y=profileTop;y<bottom;y++)if(ink(x,y))count++;if(count<(bottom-profileTop)*.012){if(start<0)start=x;if(x-start>bestEnd-bestStart){bestStart=start;bestEnd=x}}else start=-1}
 const split=bestEnd-bestStart>=width*.012?Math.round((bestStart+bestEnd)/2):null
 const regions=split?[[0,split],[split,width]]:[[0,width]]
 const {createWorker,PSM}=await import('tesseract.js');onProgress('正在准备中英文识别模型…')
 let englishWorker:any,mixedWorker:any,chineseWorker:any
 try{const options={workerPath,corePath,langPath:import.meta.env.BASE_URL+'ocr/tessdata'};englishWorker=await createWorker('eng',1,options);mixedWorker=await createWorker(['chi_sim','eng'],1,options);for(const worker of [englishWorker,mixedWorker])await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK,preserve_interword_spaces:'1',user_defined_dpi:'300'})
 let category:ImageCategory=kind==='auto'?(previousCategory??'units'):kind
 // Detect the title before splitting it across columns. Continuation pages inherit
 // their preceding section; an explicit title starts a new section.
 const titleCanvas=document.createElement('canvas');titleCanvas.width=width*4;titleCanvas.height=Math.ceil(height*.15)*4;const titleContext=titleCanvas.getContext('2d')!;titleContext.drawImage(image,0,0,width,titleCanvas.height/4,0,0,titleCanvas.width,titleCanvas.height)
 const titleResult=await englishWorker.recognize(titleCanvas,{}, {blocks:true});const titleText=titleResult.data.text.replace(/\s/g,'').toLowerCase();titleCanvas.width=0;titleCanvas.height=0
 const detected:ImageCategory|undefined=/usefulexpressions/.test(titleText)?'expressions':/wordsineachunit/.test(titleText)?'units':/vocabulary/.test(titleText)?'vocabulary':undefined
 let titleEnd=0
 if(detected==='expressions'){
  const titleRows=lines(titleResult.data);const index=titleRows.findIndex(l=>/usefulexpressions/i.test(l.text.replace(/\s/g,'')))
  if(index>=0){titleEnd=titleRows[index].bbox.y1/4;const following=titleRows[index+1];if(following&&following.confidence<75&&following.bbox.y0<titleRows[index].bbox.y1+(titleRows[index].bbox.y1-titleRows[index].bbox.y0)*2)titleEnd=following.bbox.y1/4;titleEnd+=3}
 }
 if(kind==='auto'&&detected)category=detected
 let unit=detected==='expressions'?'':initialUnit,raw='',count=0,dictionaryCount=0,unresolved=0;const seen=new Set<string>()
 let sectionWritten=false
 const writeSection=()=>{if(!sectionWritten){raw+='===SECTION '+category+'===\n'+(unit&&category!=='vocabulary'?unit+'\n':'');sectionWritten=true}}

 for(let col=0;col<regions.length;col++){onProgress(`正在识别第 ${col+1}/${regions.length} 栏…`);const [a,b]=regions[col];let left=b,right=a;for(let x=a;x<b;x++)for(let y=profileTop;y<bottom;y++)if(ink(x,y)){left=Math.min(left,x);right=Math.max(right,x)}if(right<=left)continue;left=Math.max(a,left-8);right=Math.min(b,right+9)
 const scale=Math.max(1,Math.min(4,2400/(bottom-top)));const canvas=document.createElement('canvas');canvas.width=Math.ceil((right-left)*scale)+32;canvas.height=Math.ceil((bottom-top)*scale)+32;const c=canvas.getContext('2d')!;c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.filter='grayscale(1) contrast(1.15)';c.drawImage(image,left,top,right-left,bottom-top,16,16,(right-left)*scale,(bottom-top)*scale)
 const eng=await englishWorker.recognize(canvas,{}, {blocks:true});const mixed=await mixedWorker.recognize(canvas,{}, {blocks:true});const chineseLines=lines(mixed.data)
 const ordered=lines(eng.data);const blueRows:{y0:number;y1:number;x0:number;x1:number}[]=[];for(let y=top;y<bottom;y++){let x0=right,x1=left;for(let x=left;x<right;x++){const i=(y*width+x)*4;const r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(b-r>20&&g-r>8&&b>95&&r<180){x0=Math.min(x0,x);x1=Math.max(x1,x)}}if(x1-x0<3)continue;const previous=blueRows[blueRows.length-1];if(previous&&y-previous.y1<=3){previous.y1=y;previous.x0=Math.min(previous.x0,x0);previous.x1=Math.max(previous.x1,x1)}else blueRows.push({y0:y,y1:y,x0,x1})}
 for(const region of blueRows){if(region.y0<profileTop||region.y1-region.y0<3||region.x1-region.x0<15||(region.x1-region.x0)/(region.y1-region.y0)>8)continue;const hc=document.createElement('canvas');hc.width=(region.x1-region.x0+8)*8;hc.height=(region.y1-region.y0+8)*8;const hctx=hc.getContext('2d')!;hctx.fillStyle='#fff';hctx.fillRect(0,0,hc.width,hc.height);hctx.imageSmoothingQuality='high';hctx.drawImage(image,region.x0-4,region.y0-4,region.x1-region.x0+8,region.y1-region.y0+8,0,0,hc.width,hc.height);await englishWorker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,tessedit_char_whitelist:'Unitunit0123456789 '});const hr=await englishWorker.recognize(hc);const headerCenter=((region.y0+region.y1)/2-top)*scale+16;const trusted=ordered.find(l=>/unit\s*\d+/i.test(l.text)&&Math.abs((l.bbox.y0+l.bbox.y1)/2-headerCenter)<Math.max(16,(region.y1-region.y0)*scale));const title=trusted?.text.match(/unit\s*(\d+)/i)??hr.data.text.match(/unit\s*(\d+)/i);if(title||/unit/i.test(hr.data.text)){const center=(region.y0+region.y1)/2;for(let i=ordered.length-1;i>=0;i--)if(/unit/i.test(ordered[i].text)&&Math.abs((ordered[i].bbox.y0+ordered[i].bbox.y1)/2-(center-top)*scale-16)<Math.max(16,(region.y1-region.y0)*scale))ordered.splice(i,1);ordered.push({text:'Unit '+(title?Number(title[1]):'?'),bbox:{x0:(region.x0-left)*scale+16,y0:(region.y0-top)*scale+16,x1:(region.x1-left)*scale+16,y1:(region.y1-top)*scale+16},confidence:hr.data.confidence})}hc.width=0;hc.height=0}
 await englishWorker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK,tessedit_char_whitelist:''});ordered.sort((a,b)=>a.bbox.y0-b.bbox.y0)
 if(kind==='auto'&&!detected&&col===0){const sentences=ordered.filter(l=>l.confidence>=75&&/[a-z]{2}.*[.!?]/.test(l.text)&&!/[/\[\]]/.test(l.text));const alphabetHeadings=new Set([...ordered,...chineseLines].flatMap(l=>{const letter=l.text.trim().match(/^([A-Za-z])\1?$/i);return letter?[letter[1].toUpperCase()]:[]}));const phoneticRows=ordered.filter(l=>/[A-Za-z]+.*[/\[]/.test(l.text));const unitHeadings=ordered.some(l=>/unit\s*[\dIil|\]]/i.test(l.text));if(sentences.length>=3)category='expressions';else if(!unitHeadings&&alphabetHeadings.size>=2&&phoneticRows.length>=3)category='vocabulary'}
 if(category==='vocabulary')unit='全部'
 writeSection()
 if(category==='expressions'){
  onProgress(`正在合并第 ${col+1} 栏完整句子及中文…`)
  const belowTitle=(line:OcrLine)=>line.bbox.y0>=titleEnd*scale+16
  const extracted=collectExpressions(ordered.filter(belowTitle),chineseLines.filter(belowTitle),unit)
  for(const candidate of extracted.candidates){
   const key=candidate.unit+':'+candidate.english.toLowerCase();if(seen.has(key))continue;seen.add(key)
   const chunks:string[]=[];let meaningConfidence=100
   for(const line of candidate.meaningLines){
    let best:ExpressionLine=line
    if(line.confidence<90||!/[\p{Script=Han}]/u.test(line.text)){
     chineseWorker??=await createWorker('chi_sim',1,options);await chineseWorker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,user_defined_dpi:'300'})
     const ox=left+(line.bbox.x0-16)/scale,oy=top+(line.bbox.y0-16)/scale,ow=(line.bbox.x1-line.bbox.x0)/scale,oh=(line.bbox.y1-line.bbox.y0)/scale
     const crop=document.createElement('canvas');crop.width=Math.ceil((ow+6)*8);crop.height=Math.ceil((oh+6)*8);const cc=crop.getContext('2d')!;cc.fillStyle='#fff';cc.fillRect(0,0,crop.width,crop.height);cc.imageSmoothingQuality='high';cc.filter='grayscale(1) contrast(1.1)';cc.drawImage(image,ox-3,oy-3,ow+6,oh+6,0,0,crop.width,crop.height)
     const result=await chineseWorker.recognize(crop);if((result.data.text.match(/\p{Script=Han}/gu)?.length??0)>=(line.text.match(/\p{Script=Han}/gu)?.length??0)||result.data.confidence>line.confidence)best={...line,text:result.data.text,confidence:result.data.confidence}
     crop.width=0;crop.height=0
    }
    const chinese=best.text.normalize('NFKC').replace(/[A-Za-z]/g,'').replace(/\s/g,'').replace(/^[^\p{Script=Han}（(]+/u,'').trim()
    if(/\p{Script=Han}/u.test(chinese))chunks.push(chinese)
    meaningConfidence=Math.min(meaningConfidence,best.confidence)
   }
   let meaning=chunks.join('');const dictionary=localTranslation(candidate.english)
   if(dictionary&&(!meaning||meaningConfidence<70)){meaning=dictionary;dictionaryCount++}else if(!meaning||meaningConfidence<85)unresolved++
   if(candidate.unit!==unit){unit=candidate.unit;raw+='\n'+unit+'\n'}
   raw+=candidate.english+'\n'+(meaning||'【待校对中文释义】')+'\n'
   count++
  }
  unit=extracted.lastUnit;canvas.width=0;canvas.height=0;continue
 }
 if(category!=='vocabulary'&&col===0){const first=ordered.findIndex(l=>/unit\s*\d+/i.test(l.text));const n=Number(ordered[first]?.text.match(/unit\s*(\d+)/i)?.[1]);if(first>0&&n>1&&(!unit||Number(unit.match(/\d+/)?.[0])>=n)&&ordered.slice(0,first).some(l=>/[A-Za-z]+.*[/\[]/.test(l.text))){unit='Unit '+(n-1);raw+=unit+'\n'}}

 for(const line of ordered){if(category==='vocabulary'&&/^[A-Z]$/.test(line.text.trim()))continue;if(/^Unit \?$/.test(line.text)&&unit){unit='Unit '+(Number(unit.match(/\d+/)?.[0]??0)+1);raw+='\n'+unit+'\n';continue}const heading=line.text.match(/\bunit\s*(\d+)\b/i);if(heading){unit='Unit '+Number(heading[1]);raw+='\n'+unit+'\n';continue}if(!unit)continue
 const cleaned=line.text.normalize('NFKC').replace(/^[^A-Za-z]+/,'').trim();const match=cleaned.match(/^([A-Za-z]+(?:[ '-][A-Za-z]+)*)/);if(!match)continue;let english=match[1].trim();
 // A headword can continue after its first word's IPA, e.g. red /red/ panda.
 const compound=cleaned.match(/^([A-Za-z]+)\s*\/[^/]+\/\s+([a-z]+)(?=\s|[\p{Script=Han}])/u)
 if(compound&&localTranslation(compound[1]+' '+compound[2])&&!/^(?:p|n|v|adj|adv|prep|pron|num|art|conj|int|pl|vt|vi)$/.test(compound[2]))english=compound[1]+' '+compound[2];
 // Prefer an observed dictionary word/phrase; never invent a missing word from the glossary.
 const tokens=english.split(/\s+/);for(let n=tokens.length;n>=1;n--){const phrase=tokens.slice(0,n).join(' ');if(localTranslation(phrase)){english=phrase;break}}
 const center=(line.bbox.y0+line.bbox.y1)/2;const paired=chineseLines.filter(l=>Math.abs((l.bbox.y0+l.bbox.y1)/2-center)<Math.max(20,line.bbox.y1-line.bbox.y0)*.9).sort((a,b)=>Math.abs((a.bbox.y0+a.bbox.y1)/2-center)-Math.abs((b.bbox.y0+b.bbox.y1)/2-center))[0];if(!localTranslation(english)&&paired){const alternative=paired.text.replace(/^[^A-Za-z]+/,'').match(/^([A-Za-z]+)/)?.[1];if(alternative&&localTranslation(alternative)&&alternative.length===english.length&&[...alternative.toLowerCase()].filter((c,i)=>c!==english.toLowerCase()[i]).length<=1)english=alternative;}
 if(!/[/\[\\]/.test(cleaned)&&!/\p{Script=Han}/u.test(line.text)&&!(localTranslation(english)&&(/p[.\s-]*\d/i.test(line.text)||/[/\[\\]/.test(paired?.text??''))))continue;
 if(!localTranslation(english)){const first=line.words?.find(w=>/[A-Za-z]/.test(w.text));if(first){const ox=left+(first.bbox.x0-16)/scale,oy=top+(first.bbox.y0-16)/scale,ow=(first.bbox.x1-first.bbox.x0)/scale,oh=(first.bbox.y1-first.bbox.y0)/scale;const wordCanvas=document.createElement('canvas');wordCanvas.width=Math.ceil((ow+4)*8);wordCanvas.height=Math.ceil((oh+4)*8);const wc=wordCanvas.getContext('2d')!;wc.fillStyle='#fff';wc.fillRect(0,0,wordCanvas.width,wordCanvas.height);wc.imageSmoothingQuality='high';wc.filter='grayscale(1)';wc.drawImage(image,ox-2,oy-2,ow+4,oh+4,0,0,wordCanvas.width,wordCanvas.height);await englishWorker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_WORD,tessedit_char_whitelist:'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'});const second=await englishWorker.recognize(wordCanvas);await englishWorker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK,tessedit_char_whitelist:''});const alternative=second.data.text.trim();if(localTranslation(alternative)&&alternative.length===english.length&&[...alternative.toLowerCase()].filter((c,i)=>c!==english.toLowerCase()[i]).length<=1)english=alternative;wordCanvas.width=0;wordCanvas.height=0}}
 if(!localTranslation(english)&&paired){const hint=vocabularySpellingHint(english,paired.text);if(hint)english=hint}
 if(english.length>45||/^(Unit|Appendix|Words|Vocabulary|p)$/i.test(english))continue
 const key=unit+':'+english.toLowerCase();if(seen.has(key))continue;seen.add(key)
 const dictionary=localTranslation(english);let meaning=dictionary??''
 if(dictionary)dictionaryCount++;else{const y=(line.bbox.y0+line.bbox.y1)/2;const closest=chineseLines.filter(l=>Math.abs((l.bbox.y0+l.bbox.y1)/2-y)<Math.max(20,line.bbox.y1-line.bbox.y0)*.9).sort((l,r)=>Math.abs((l.bbox.y0+l.bbox.y1)/2-y)-Math.abs((r.bbox.y0+r.bbox.y1)/2-y))[0];if(closest){const text=closest.text.replace(/\s*p\s*[.,-]?\s*\d+.*$/i,'');const han=text.search(/\p{Script=Han}/u);if(han>=0)meaning=text.slice(han).trim()}unresolved++}
 raw+=english+'\t'+(meaning||'【待校对中文释义】')+'\n';count++
 }canvas.width=0;canvas.height=0}
 return{raw,category,width,height,lowResolution:width<800||height<1000,count,dictionaryCount,unresolved,lastUnit:category==='vocabulary'?(initialUnit||undefined):unit,inheritedUnit:initialUnit||undefined}
 }finally{await englishWorker?.terminate();await mixedWorker?.terminate();await chineseWorker?.terminate();original.width=0;original.height=0}
}
