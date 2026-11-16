// 牛津教材点读区间来自 whisper 对齐，部分单词的起点/终点落在语音中间，
// 点读时会削掉首尾辅音；另一些区间前后留着成片静音或配乐。
// 这里只做两件事：把切在语音里的边界补到完整音节，把首尾多余静音收掉。
// 区间内已经出现的朗读都保留（包括两遍重复、主题标题后的第二个词），
// 不跨到区间外主动取新内容；所有调整都基于真实音频包络，不合成声音。
// 纯函数，便于用合成音量包络测试；实际解码在 refine-textbook-audio-bounds.mjs。

export const FRAME_SECONDS = 0.01
// 起点前留 80 ms、终点后留 160 ms，和绘本逐句精修一致，避免削掉首尾辅音。
const PRE_ROLL = 0.08
const TAIL = 0.16
// 相对区间峰值低 18 dB 以下视为静音/配乐；教材朗读比配乐响得多。
const DROP_DB = 18
// 补边界时最多比峰值低 40 dB，但至少高于区间噪声底 8 dB。
// 这样能接上 /s/、/f/、/θ/ 这类轻声尾音，又不会把配乐铺底算成内容。
const EDGE_DROP_DB = 40
const NOISE_MARGIN_DB = 8
// 旧边界外 100/150 ms 内重新出现语音时，认为旧边界切在单词内部。
const START_GUARD = 0.10
const END_GUARD = 0.15
// 边界落在语音里时，最多向两侧补 2 秒，避免异常数据把整段前后文都拉进来。
const MAX_EXTEND = 2.0
// 峰值低于该值时没有可用朗读，保持原值。
const SILENT_PEAK = -45

/**
 * 在原始时间附近收紧或补齐一条点读区间。
 * levels 是每 10 ms 一帧的音量（dBFS）；返回秒数，保留两位小数。
 */
export function refineTextbookBounds(levels, {
  start,
  end,
  nextStart = Number.POSITIVE_INFINITY,
  prevEnd = 0,
  duration = Number.POSITIVE_INFINITY,
  dropDb = DROP_DB,
} = {}) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !levels.length) {
    return { start, end, changed: false, reason: 'invalid' }
  }
  const limit = Math.min(Number.isFinite(duration) ? duration : Number.POSITIVE_INFINITY, levels.length * FRAME_SECONDS)
  const at = time => Math.max(0, Math.min(levels.length - 1, Math.floor(time / FRAME_SECONDS)))
  const sf = at(start)
  const ef = Math.max(sf, at(end))

  // 区间加两侧 0.3 秒的 97 分位峰值，忽略孤立音效尖峰。
  const peakFrom = Math.max(0, sf - 30)
  const peakTo = Math.min(levels.length - 1, ef + 30)
  const peak = percentile(levels, peakFrom, peakTo, 0.97)
  if (!Number.isFinite(peak) || peak < SILENT_PEAK) return { start, end, changed: false, reason: 'silent' }
  const core = peak - dropDb

  // 核心阈值以下的帧用来估计本地噪声底；静音数字化后最低会到 -180 dB。
  const quiet = []
  for (let index = peakFrom; index <= peakTo; index++) if (levels[index] < core) quiet.push(levels[index])
  let noise = -90
  if (quiet.length >= 20) {
    quiet.sort((a, b) => a - b)
    noise = quiet[Math.floor(quiet.length * 0.2)]
  }
  // 边界补全阈值：至少比峰值低 25 dB；若本地有配乐，则保持在配乐之上 8 dB。
  const edgeThreshold = Math.min(peak - 25, Math.max(peak - EDGE_DROP_DB, noise + NOISE_MARGIN_DB))
  const speaking = index => levels[index] >= edgeThreshold
  // 至少和相邻一帧同时超过阈值，才算可靠语音，过滤单帧噪声。
  const solidAt = index => speaking(index) && (speaking(index - 1) || speaking(index + 1))

  const leftLimit = Math.max(0, prevEnd + 0.02, start - MAX_EXTEND)
  const rightLimit = Math.min(
    !Number.isFinite(nextStart) ? Math.min(limit, end + MAX_EXTEND) : Math.min(limit, nextStart - 0.02),
    levels.length - 1,
  )
  const leftLimitFrame = at(leftLimit)
  const rightLimitFrame = Math.min(at(rightLimit), levels.length - 2)
  const startGuardFrame = Math.max(0, sf - Math.round(START_GUARD / FRAME_SECONDS))
  const endGuardFrame = Math.min(levels.length - 2, ef + Math.round(END_GUARD / FRAME_SECONDS))

  // 旧起点前 100 ms 内还有语音：旧起点切在音节中间，向前接上整段。
  let scanFrom = sf
  for (let index = sf - 1; index >= startGuardFrame; index--) {
    if (solidAt(index)) { scanFrom = index; break }
  }
  let first = -1
  for (let index = scanFrom; index <= ef; index++) {
    if (solidAt(index)) { first = index; break }
  }
  if (first < 0) return { start, end, changed: false, reason: 'no-speech' }
  while (first > leftLimitFrame && speaking(first - 1)) first--

  // 旧终点后 150 ms 内还有语音：旧终点切在音节中间，向后接上整段。
  let scanTo = ef
  for (let index = ef + 1; index <= endGuardFrame; index++) {
    if (solidAt(index)) { scanTo = index; break }
  }
  let last = -1
  for (let index = scanTo; index >= sf; index--) {
    if (solidAt(index)) { last = index; break }
  }
  if (last < first) last = first
  while (last < rightLimitFrame && speaking(last + 1)) last++

  let newStart = Math.max(0, first * FRAME_SECONDS - PRE_ROLL)
  let newEnd = Math.min(limit, last * FRAME_SECONDS + TAIL)
  if (prevEnd > 0) newStart = Math.max(newStart, prevEnd + 0.02)
  if (Number.isFinite(nextStart)) newEnd = Math.min(newEnd, nextStart - 0.02)
  if (!(newEnd > newStart)) return { start, end, changed: false, reason: 'clamped' }
  newStart = Number(newStart.toFixed(2))
  newEnd = Number(newEnd.toFixed(2))
  return {
    start: newStart,
    end: newEnd,
    changed: Math.abs(newStart - start) >= 0.01 || Math.abs(newEnd - end) >= 0.01,
    reason: 'trim',
    firstSpeech: first * FRAME_SECONDS,
    lastSpeech: last * FRAME_SECONDS,
    extendedStart: first < sf,
    extendedEnd: last > ef,
    edgeThreshold,
  }
}

// 121 个 dB 分桶的直方图，比排序整段数组便宜。
function percentile(levels, from, to, p) {
  const bins = new Int32Array(121)
  for (let index = from; index <= to; index++) {
    bins[Math.max(0, Math.min(120, Math.round(-levels[index])))]++
  }
  let seen = 0
  const target = (to - from + 1) * p
  for (let bin = 120; bin >= 0; bin--) {
    seen += bins[bin]
    if (seen >= target) return -bin
  }
  return -120
}
