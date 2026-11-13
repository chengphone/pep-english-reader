// 绘本跨页图片通常带着大块白色页边距和一个小页码；裁剪到正文后，画面可以
// 在同样的白框里按比例放大。这里只做纯像素分析，便于在 Node 里测试。

export type CropBox = { x: number; y: number; w: number; h: number }

// 页面底色视为白色：低于该亮度的像素算作正文。JPEG 压缩会在白底上留下
// 少量噪点，取 240 可以避开它们，同时保留浅色插画和正文。
const DARK = 240
// 行/列至少要有最大行/列投影的这个比例，才算正文。页码这类小标记会被忽略。
const ROW_RATIO = 0.03
const COL_RATIO = 0.02
// 裁剪边缘留一点余量，避免削掉插画的圆角和抗锯齿。
const PAD_RATIO = 0.008
// 裁剪后至少保留 25% 的画面；否则视为识别失败，宁可不裁。
const MIN_AREA = 0.25

function isDark(data: Uint8ClampedArray, index: number): boolean {
  if (data[index + 3] < 16) return false
  return data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114 < DARK * 1000
}

/**
 * 根据 RGBA 像素计算正文包围盒，返回相对整张图片的归一化坐标。
 * 无法可靠判断（空白页、内容占满整页、数据不合法）时返回 undefined。
 */
export function contentBoxFromPixels(data: Uint8ClampedArray, width: number, height: number): CropBox | undefined {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 8 || height < 8) return undefined
  if (data.length < width * height * 4) return undefined

  const rows = new Uint32Array(height)
  let maxRow = 0
  for (let y = 0; y < height; y++) {
    const base = y * width * 4
    let count = 0
    for (let x = 0; x < width; x++) if (isDark(data, base + x * 4)) count++
    rows[y] = count
    if (count > maxRow) maxRow = count
  }
  if (maxRow === 0) return undefined

  const rowMin = Math.max(2, Math.round(maxRow * ROW_RATIO))
  let top = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    if (rows[y] < rowMin) continue
    if (top < 0) top = y
    bottom = y
  }
  if (top < 0) return undefined

  // 只在正文行范围内统计列投影，页码等在正文下方的标记不会把包围盒撑大。
  const cols = new Uint32Array(width)
  let maxCol = 0
  for (let y = top; y <= bottom; y++) {
    const base = y * width * 4
    for (let x = 0; x < width; x++) {
      if (!isDark(data, base + x * 4)) continue
      cols[x]++
      if (cols[x] > maxCol) maxCol = cols[x]
    }
  }
  if (maxCol === 0) return undefined

  const colMin = Math.max(2, Math.round(maxCol * COL_RATIO))
  let left = -1
  let right = -1
  for (let x = 0; x < width; x++) {
    if (cols[x] < colMin) continue
    if (left < 0) left = x
    right = x
  }
  if (left < 0) return undefined

  const padX = Math.max(1, Math.round(width * PAD_RATIO))
  const padY = Math.max(1, Math.round(height * PAD_RATIO))
  left = Math.max(0, left - padX)
  top = Math.max(0, top - padY)
  right = Math.min(width - 1, right + padX)
  bottom = Math.min(height - 1, bottom + padY)

  const box = {
    x: left / width,
    y: top / height,
    w: (right - left + 1) / width,
    h: (bottom - top + 1) / height,
  }
  if (box.w * box.h < MIN_AREA) return undefined
  // 内容本来就占满整页时不做任何缩放。
  if (box.x <= 0.005 && box.y <= 0.005 && box.x + box.w >= 0.995 && box.y + box.h >= 0.995) return undefined
  return box
}
