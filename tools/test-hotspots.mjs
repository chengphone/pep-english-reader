import assert from 'node:assert/strict'
import { buildTextHotspots, buildOcrHotspots } from '../src/hotspotExtraction.ts'
const viewport={width:600,height:800,scale:1,rotation:0,convertToViewportPoint:(x,y)=>[x,800-y]}
const fragment=(str,x,y,width=30,height=14)=>({str,transform:[height,0,0,height,x,y],width,height,fontName:'F'})
const extract=items=>buildTextHotspots({items,styles:{F:{ascent:1,descent:0}}},viewport,1)
assert.equal(extract([fragment('Hel',20,700,20),fragment('lo!',40,700,20)])[0].text,'Hello!')
assert.equal(extract([fragment('Goodbye',20,700,60),fragment('!',80,700,5)])[0].text,'Goodbye!')
assert.equal(extract([fragment('Good',20,700,30),fragment('morning.',54,700,65)])[0].text,'Good morning.')
assert.equal(extract([fragment('Hello.',20,700,40),fragment('Hi.',300,700,20)]).length,2)
const multiline=extract([fragment('Mr Jones,',20,700,70),fragment('this is Miss Green.',10,682,130)])
assert.equal(multiline[0].text,'Mr Jones, this is Miss Green.');assert.equal(multiline[0].rects.length,2)
assert.equal(extract([fragment('Hello.',20,700,40),fragment('How are you?',20,682,95)]).length,2)
assert.equal(extract([fragment('hello',20,700),fragment('hello',20,700)]).length,1)
assert.equal(extract([fragment('A',20,700,80,120),fragment('I',20,500,8,14)])[0].text,'I')
const clipped=extract([fragment('hello',-5,799,30)]);assert.ok(clipped.every(i=>i.rects.every(r=>r.every(v=>v>=0&&v<=1)&&r[0]<r[2]&&r[1]<r[3])))
assert.equal(buildOcrHotspots([{text:'Hello',confidence:95,bbox:{x0:20,y0:20,x1:50,y1:35}},{text:'world!',confidence:96,bbox:{x0:54,y0:20,x1:100,y1:35}}],600,800,1)[0].text,'Hello world!')
console.log('Passed: split words, punctuation, spacing, adjacent bubbles, multiline sentences, sentence boundaries, duplicates, decorative letters, clipping, OCR grouping')
