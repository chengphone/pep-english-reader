import { strFromU8, unzipSync } from 'fflate'

// ZIP 读取入口（App.tsx）与解压共用同一份 fflate；应用其他位置已经静态引用
// fflate，再动态导入不会形成独立 chunk，只会带来构建警告。
export { strFromU8 }

export type BookArchiveLimits = {
  maxArchiveBytes: number
  maxEntryBytes: number
  maxTotalBytes: number
  maxEntries: number
}

// ZIP 输入来自用户设备。同步解压会同时占用压缩字节、解压字节和 Blob 内存，
// 因此导入前同时限制归档大小、文件数、单项和解压总量。
export const BOOK_ARCHIVE_LIMITS: BookArchiveLimits = {
  maxArchiveBytes: 64 * 1024 * 1024,
  maxEntryBytes: 32 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
  maxEntries: 5000,
}

function limitsFor(limits: BookArchiveLimits) {
  return { ...limits }
}

export function assertBookArchiveSize(size: number, limits = BOOK_ARCHIVE_LIMITS) {
  if (!Number.isFinite(size) || size < 0 || size > limits.maxArchiveBytes) {
    throw new Error(`教材 ZIP 文件不得超过 ${Math.floor(limits.maxArchiveBytes / 1024 / 1024)} MB。`)
  }
}

export async function unzipBookArchive(data: Uint8Array, configuredLimits = BOOK_ARCHIVE_LIMITS) {
  const limits = limitsFor(configuredLimits)
  assertBookArchiveSize(data.byteLength, limits)
  let entries = 0
  let totalBytes = 0
  return unzipSync(data, { filter: entry => {
    entries++
    if (entries > limits.maxEntries) throw new Error('教材 ZIP 包含过多文件。')
    if (entry.name === '__proto__') throw new Error('教材 ZIP 包含不支持的文件名。')
    const size = entry.originalSize
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('教材 ZIP 包含无效文件大小。')
    if (size > limits.maxEntryBytes) throw new Error(`教材 ZIP 单个文件不得超过 ${Math.floor(limits.maxEntryBytes / 1024 / 1024)} MB。`)
    totalBytes += size
    if (totalBytes > limits.maxTotalBytes) throw new Error(`教材 ZIP 解压后不得超过 ${Math.floor(limits.maxTotalBytes / 1024 / 1024)} MB。`)
    return true
  } })
}
