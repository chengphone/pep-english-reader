import assert from 'node:assert/strict'
import {ONLINE_BOOKS,PENDING_ONLINE_BOOKS} from '../src/onlineCatalog.ts'
assert.equal(new Set(ONLINE_BOOKS.map(book=>book.id)).size,ONLINE_BOOKS.length)
assert.deepEqual(ONLINE_BOOKS.filter(book=>book.grade===3).map(book=>book.id),['tape3a_002013','tape3b_002013'])
assert.deepEqual(ONLINE_BOOKS.filter(book=>book.grade===6).map(book=>book.id),['tape6a_002015'])
assert.deepEqual(PENDING_ONLINE_BOOKS.map(book=>[book.grade,book.term]),[[6,'b']])
assert(!ONLINE_BOOKS.some(book=>['tape6a_002003','tape6b_002006','tape6a_038001'].includes(book.id)))
console.log('Passed: original grade-three IDs retained; only the requested new grade-six edition is playable; unavailable matching lower volume never substitutes the old book')
