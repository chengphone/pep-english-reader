import assert from 'node:assert/strict'
import { routeFromUrl, writeRouteUrl } from '../src/AppNavigation.ts'

globalThis.location={href:'https://example.test/'}
const route={kind:'followalong',bookId:'tape3a_002013',unitId:'hosted-default:units:7'}
const url=writeRouteUrl(route)
const parsed=routeFromUrl(new URL(url))
assert.deepEqual(parsed,route)
const legacy=routeFromUrl(new URL('https://example.test/?view=followalong&book=tape3a_002013'))
assert.deepEqual(legacy,{kind:'followalong',bookId:'tape3a_002013',unitId:''})
const chooser={kind:'followalong',bookId:'tape3a_002013',unitId:''}
const chooserUrl=writeRouteUrl(chooser)
assert.deepEqual(routeFromUrl(new URL(chooserUrl)),chooser)
assert.equal(new URL(chooserUrl).searchParams.has('unit'),false,'unit chooser must not write an empty unit parameter')
const shelf=routeFromUrl(new URL('https://example.test/?view=shelf&book=x&unit=y'))
assert.deepEqual(shelf,{kind:'shelf'})
