import { stable } from './sharedCanonical.ts'
import type { VocabularyUnit } from './vocabularyExtraction'

/** Three-way merge: a device only publishes changes it actually made. */
export function mergePublishedUnits(base:VocabularyUnit[],snapshot:VocabularyUnit[],remote:VocabularyUnit[]){
 const previous=new Map(base.map(unit=>[unit.id,unit]))
 const local=new Map(snapshot.map(unit=>[unit.id,unit]))
 const merged=new Map(remote.map(unit=>[unit.id,unit]))
 for(const id of new Set([...previous.keys(),...local.keys()])){
  const before=previous.get(id),next=local.get(id),current=merged.get(id)
  if(stable(before)===stable(next))continue
  if(stable(current)!==stable(before)&&stable(current)!==stable(next))throw new Error(`“${next?.title??before?.title??id}”在另一台设备也有修改，请校对后再发布。`)
  if(next)merged.set(id,next);else merged.delete(id)
 }
 return [...merged.values()]
}
/** Acknowledging a publish must not pretend unseen remote data existed locally. */
export function acknowledgePublishedUnits(base:VocabularyUnit[],snapshot:VocabularyUnit[],remote:VocabularyUnit[]){
 const result=new Map(base.map(unit=>[unit.id,unit]))
 const local=new Map(snapshot.map(unit=>[unit.id,unit]))
 const merged=new Map(remote.map(unit=>[unit.id,unit]))
 for(const id of new Set([...result.keys(),...local.keys()])){
  if(stable(result.get(id))===stable(local.get(id)))continue
  if(stable(local.get(id))!==stable(merged.get(id)))continue
  const next=local.get(id);if(next)result.set(id,next);else result.delete(id)
 }
 return [...result.values()]
}
