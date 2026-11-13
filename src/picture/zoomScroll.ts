// 绘本页面在手机上的“放大”把跨页画成两倍宽，需要横向滚动。
// 热区坐标是整张跨页的比例；选中句可能跨过中线，不能只按中心点判断
// 该滚到左页还是右页，否则句子的一半会被屏幕边缘裁掉。
export type PictureZoomRect = [number, number, number, number]

export function zoomScrollTarget(
  rects: readonly PictureZoomRect[],
  canvasWidth: number,
  canvasLeft: number,
  viewportWidth: number,
  maxScroll: number,
): number | undefined {
  if (!rects.length || !Number.isFinite(canvasWidth) || canvasWidth <= 0 || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return undefined
  let left = Infinity
  let right = -Infinity
  for (const rect of rects) {
    if (!Array.isArray(rect) || rect.length < 3) continue
    if (!Number.isFinite(rect[0]) || !Number.isFinite(rect[2]) || rect[2] < 0) continue
    left = Math.min(left, rect[0])
    right = Math.max(right, rect[0] + rect[2])
  }
  if (!Number.isFinite(left) || !Number.isFinite(right)) return undefined
  const start = canvasLeft + left * canvasWidth
  const width = (right - left) * canvasWidth
  // 比可见区域还宽的句子只能从开头显示；否则居中，让整句尽量完整可见。
  const target = width >= viewportWidth ? start : start - (viewportWidth - width) / 2
  return Math.max(0, Math.min(Math.max(0, maxScroll), target))
}
