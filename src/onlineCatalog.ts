import type { OnlineBook } from './reader/types'

export const ONLINE_BOOKS: OnlineBook[] = [
  {id:'tape3a_002013',grade:3,term:'a'},{id:'tape3b_002013',grade:3,term:'b'},
  {id:'tape4a_002013',grade:4,term:'a'},{id:'tape4b_002013',grade:4,term:'b'},
  {id:'tape5a_002003',grade:5,term:'a',edition:'人教PEP版'}, {id:'tape5a_002113',grade:5,term:'a',edition:'新课标版'},
  {id:'tape5b_002006',grade:5,term:'b',edition:'人教PEP版'}, {id:'tape5b_002113',grade:5,term:'b',edition:'新课标版'},
  {id:'tape7a_002021',grade:7,term:'a',edition:'人教版初中'},{id:'284',grade:7,term:'a',edition:'人教老版'},
  {id:'tape7b_002021',grade:7,term:'b',edition:'人教版初中'},{id:'285',grade:7,term:'b',edition:'人教老版'},
  {id:'tape8a_002021',grade:8,term:'a',edition:'人教版初中'},{id:'286',grade:8,term:'a',edition:'人教老版'},
  {id:'tape8b_002021',grade:8,term:'b',edition:'人教版初中'},{id:'287',grade:8,term:'b',edition:'人教老版'},
  {id:'tape9a_002020',grade:9,term:'a',edition:'人教版初中'},
  {id:'tape6a_002015',grade:6,term:'a',edition:'人教PEP新版'},
]

export const onlineBookEdition=(book:OnlineBook)=>book.edition??(book.grade<=6?'人教 PEP':'人教英语')
export const onlineBookLabel=(book:OnlineBook)=>`${onlineBookEdition(book)} · ${book.grade}年级${book.term==='a'?'上':'下'}册`


export type PendingOnlineBook={grade:number;term:'a'|'b';edition:string;message:string}
// E63 currently returns “该书籍数据不存在” for the matching new lower-volume IDs.
// Do not silently substitute the old tape6b_002006 edition.
export const PENDING_ONLINE_BOOKS:PendingOnlineBook[]=[{grade:6,term:'b',edition:'人教PEP新版',message:'同版资源待上线'}]
