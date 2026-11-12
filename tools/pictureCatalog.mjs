// 绘本目录只需要生词数量；完整生词表在单本 book.json 里。
// 构建包会把目录里的 vocabulary 数组压成数字，避免首屏多下载几百 KB。
export function slimPictureCatalogRows(rows) {
  return rows.map(row => {
    if (!row || typeof row !== 'object') return row
    const vocabulary = Array.isArray(row.vocabulary) ? row.vocabulary.length : Number(row.vocabulary)
    return { ...row, vocabulary: Number.isFinite(vocabulary) ? vocabulary : 0 }
  })
}
