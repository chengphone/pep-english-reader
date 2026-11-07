import assert from 'node:assert/strict'
import { readAppHistory, routeFromUrl, routeKey, writeRouteUrl } from '../src/AppNavigation.ts'
const route=(query='')=>routeFromUrl(new URL('https://example.test/pep-english-reader/'+query))

assert.deepEqual(route(),{kind:'shelf'})
assert.deepEqual(route('?view=online&book=tape3a_002013'),{kind:'online',bookId:'tape3a_002013'})
assert.deepEqual(route('?view=online'),{kind:'shelf'})
assert.deepEqual(route('?view=followalong&book=tape3a_002013'),{kind:'followalong',bookId:'tape3a_002013',unitId:''})
assert.deepEqual(route('?view=followalong&book=tape3a_002013&unit=u1'),{kind:'followalong',bookId:'tape3a_002013',unitId:'u1'})
assert.deepEqual(route('?view=vocab'),{kind:'vocab'})
assert.deepEqual(route('?view=unknown'),{kind:'shelf'})

assert.deepEqual(route('?view=local&book=b1'),{kind:'local',bookId:'b1',page:0})
assert.deepEqual(route('?view=local&book=b1&page=2'),{kind:'local',bookId:'b1',page:2})
assert.deepEqual(route('?view=local&book=b1&page=2.9'),{kind:'local',bookId:'b1',page:2})
assert.deepEqual(route('?view=local&book=b1&page=-4'),{kind:'local',bookId:'b1',page:0})
assert.deepEqual(route('?view=local&book=b1&page=Infinity'),{kind:'local',bookId:'b1',page:0})
assert.deepEqual(route('?view=local&book=b1&page=1e309'),{kind:'local',bookId:'b1',page:0})
assert.deepEqual(route('?view=local&book=b1&page=abc'),{kind:'local',bookId:'b1',page:0})
assert.deepEqual(route('?view=local&book=b1&page='),{kind:'local',bookId:'b1',page:0})
assert.deepEqual(route('?view=local&book=b1&page=1e3'),{kind:'local',bookId:'b1',page:1000})

const valid={key:routeKey,idx:2,route:{kind:'vocab'}}
assert.deepEqual(readAppHistory(valid),valid)
for(const value of [null,undefined,'state',{},{key:'other',idx:0,route:{kind:'vocab'}},{key:routeKey,idx:-1,route:{kind:'vocab'}},{key:routeKey,idx:1.5,route:{kind:'vocab'}},{key:routeKey,idx:0}])assert.equal(readAppHistory(value),undefined)

globalThis.location={href:'https://example.test/pep-english-reader/?view=vocab&book=old&page=3&unit=u1&keep=1'}
const online=writeRouteUrl({kind:'online',bookId:'tape3a_002013'}),onlineUrl=new URL(online)
assert.equal(onlineUrl.searchParams.get('view'),'online');assert.equal(onlineUrl.searchParams.get('book'),'tape3a_002013')
assert.equal(onlineUrl.searchParams.get('page'),null);assert.equal(onlineUrl.searchParams.get('unit'),null);assert.equal(onlineUrl.searchParams.get('keep'),'1')
const local=writeRouteUrl({kind:'local',bookId:'b1',page:4}),localUrl=new URL(local)
assert.equal(localUrl.searchParams.get('view'),'local');assert.equal(localUrl.searchParams.get('book'),'b1');assert.equal(localUrl.searchParams.get('page'),'4');assert.equal(localUrl.searchParams.get('keep'),'1')
const shelf=new URL(writeRouteUrl({kind:'shelf'}))
assert.equal(shelf.searchParams.get('view'),null);assert.equal(shelf.searchParams.get('book'),null);assert.equal(shelf.searchParams.get('keep'),'1')
const special=writeRouteUrl({kind:'online',bookId:'a&b c/d?e'})
assert.equal(new URL(special).searchParams.get('book'),'a&b c/d?e')
console.log('Passed: route parsing, page normalization (fractions, negatives, Infinity, junk, scientific notation), history state validation, URL cleanup and special-character round-trip')
