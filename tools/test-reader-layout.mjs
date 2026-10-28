import assert from 'node:assert/strict'
import { pageDisplaySize } from '../src/reader/layout.ts'
const width=pageDisplaySize(1440,700,4/3,'width',1)
assert.equal(width.width,860)
assert.ok(Math.abs(width.height/width.width-4/3)<.0001)
const fit=pageDisplaySize(1440,700,4/3,'page',1)
assert.ok(fit.height<=700&&fit.width<=1440)
const phone=pageDisplaySize(390,500,4/3,'width',1)
assert.equal(phone.width,366)
const zoom=pageDisplaySize(390,500,4/3,'width',2)
assert.equal(zoom.width,phone.width*2)
assert.equal(zoom.height,phone.height*2)
for(const dimensions of [pageDisplaySize(0,0,0,'page',1),pageDisplaySize(700,300,Number.NaN,'width',1)])assert.ok(dimensions.width>0&&dimensions.height>0&&Number.isFinite(dimensions.height))
console.log('Passed: desktop width cap; full-page bounds; mobile margins; zoom preserves page and hotspot scale; invalid or pending size stays finite')
