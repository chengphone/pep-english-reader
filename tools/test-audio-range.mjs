import assert from 'node:assert/strict'
import { resolveAudioRange, rangeProgress, prepareAudioRange, formatAudioTime } from '../src/reader/audioRange.ts'
import { normalizeReaderManifest } from '../src/libraryValidation.ts'

class FakePlayer {
 constructor(){this._time=0;this.seeking=false;this.readyState=0;this.duration=15;this.pauses=0;this.listeners=new Map()}
 get currentTime(){return this._time}
 set currentTime(value){this._time=value;this.seeking=true}
 addEventListener(type,fn){this.listeners.set(type,[...(this.listeners.get(type)??[]),fn])}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(item=>item!==fn))}
 emit(type){for(const fn of [...(this.listeners.get(type)??[])])fn()}
 pause(){this.pauses++}
 setTime(value){this._time=value;this.seeking=false}
 finishSeek(){this.seeking=false;this.emit('seeked')}
}

// 字段解析：只有终点大于起点才启用区间，老数据/残缺数据保持整段播放。
assert.deepEqual(resolveAudioRange({audioStart:3,audioEnd:5}),{start:3,end:5})
assert.deepEqual(resolveAudioRange({audioEnd:2}),{start:0,end:2})
assert.equal(resolveAudioRange({}),null)
assert.equal(resolveAudioRange({audioStart:3}),null)
assert.equal(resolveAudioRange({audioStart:3,audioEnd:3}),null)
assert.equal(resolveAudioRange({audioStart:3,audioEnd:2}),null)
assert.equal(resolveAudioRange({audioStart:Number.NaN,audioEnd:5}).start,0)
assert.equal(resolveAudioRange({audioEnd:Number.POSITIVE_INFINITY}),null)

// 有区间：元数据后跳到起点，seek 完成前不判结束；到达终点只回调一次并暂停。
{
 const player=new FakePlayer();player.readyState=1
 let ended=0
 const detach=prepareAudioRange(player,{audioStart:3,audioEnd:5},()=>ended++)
 assert.equal(player.currentTime,3)
 assert.equal(ended,0)
 player.emit('timeupdate');assert.equal(ended,0) // seek 尚未完成
 player.finishSeek()
 player.setTime(4.5);player.emit('timeupdate');assert.equal(ended,0)
 player.setTime(4.97);player.emit('timeupdate');assert.equal(ended,1)
 assert.equal(player.pauses,1)
 player.emit('timeupdate');assert.equal(ended,1)
 detach();detach()
}
// 首次播放：元数据还没到时先播放，loadedmetadata 后再跳起点，期间不误判为播完。
{
 const player=new FakePlayer();let ended=0
 prepareAudioRange(player,{audioStart:2,audioEnd:4},()=>ended++)
 player.emit('timeupdate');assert.equal(ended,0)
 player.readyState=1;player.emit('loadedmetadata')
 assert.equal(player.currentTime,2);assert.equal(ended,0)
 player.emit('timeupdate');assert.equal(ended,0)
 player.finishSeek()
 player.setTime(3.98);player.emit('timeupdate');assert.equal(ended,1)
}
// 无区间：回到开头且不挂任何区间监听，行为与旧版本一致。
{
 const player=new FakePlayer();player.setTime(9)
 let ended=0
 assert.equal(prepareAudioRange(player,{},()=>ended++),null)
 assert.equal(player.currentTime,0)
 assert.equal(player.pauses,0)
 assert.equal(player.listeners.get('timeupdate'),undefined)
 assert.equal(ended,0)
}
// 进度按片段计算：片段 3–5 秒，总长 2 秒；终点与越界位置夹在片段范围内。
assert.deepEqual(rangeProgress(4,{start:3,end:5},15),{current:1,total:2})
assert.deepEqual(rangeProgress(9,{start:3,end:5},15),{current:2,total:2})
assert.deepEqual(rangeProgress(2.5,{start:3,end:5},15),{current:0,total:2})
assert.deepEqual(rangeProgress(4,{start:3,end:5},4.5),{current:1,total:1.5})
assert.deepEqual(rangeProgress(4,{start:3,end:5},Number.NaN),{current:1,total:2})
assert.deepEqual(rangeProgress(10,null,15),{current:10,total:15})
assert.equal(formatAudioTime(2),'0:02')
assert.equal(formatAudioTime(65),'1:05')
assert.equal(formatAudioTime(Number.NaN),'0:00')

// 清单导入：没有区间字段的老清单原样保留；合法区间保留；无效区间退回整段播放。
const oldManifest={schemaVersion:1,bookId:'b',title:'t',publisherId:'pep',pages:[{page:1,image:'pages/1.svg',items:[{id:'i1',text:'Hello',order:1,rects:[[0,0,1,1]],audio:'audio/1.mp3'}]}]}
const legacy=normalizeReaderManifest(structuredClone(oldManifest))
assert.deepEqual(legacy,oldManifest)
assert.equal(resolveAudioRange(legacy.pages[0].items[0]),null)
const ranged=structuredClone(oldManifest);ranged.pages[0].items[0].audioStart=1.25;ranged.pages[0].items[0].audioEnd=2.75
assert.deepEqual(normalizeReaderManifest(ranged).pages[0].items[0],{...oldManifest.pages[0].items[0],audioStart:1.25,audioEnd:2.75})
const endOnly=structuredClone(oldManifest);endOnly.pages[0].items[0].audioEnd=2
assert.deepEqual(normalizeReaderManifest(endOnly).pages[0].items[0],{...oldManifest.pages[0].items[0],audioStart:0,audioEnd:2})
const startOnly=structuredClone(oldManifest);startOnly.pages[0].items[0].audioStart=2
assert.deepEqual(normalizeReaderManifest(startOnly).pages[0].items[0],oldManifest.pages[0].items[0])
const reversed=structuredClone(oldManifest);reversed.pages[0].items[0].audioStart=3;reversed.pages[0].items[0].audioEnd=2
assert.deepEqual(normalizeReaderManifest(reversed).pages[0].items[0],oldManifest.pages[0].items[0])
const invalid=structuredClone(oldManifest);invalid.pages[0].items[0].audioStart='1'
assert.throws(()=>normalizeReaderManifest(invalid))
assert.throws(()=>normalizeReaderManifest({...oldManifest,pages:[{...oldManifest.pages[0],items:[{...oldManifest.pages[0].items[0],audioEnd:-1}]}]}))
console.log('Passed: clip start/end parsing, seek gating, stop at segment end, legacy full-audio behavior, segment progress, old manifest compatibility')
