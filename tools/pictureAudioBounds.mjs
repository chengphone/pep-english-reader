// 逐句音频边界来自 whisper 词级时间，常常比真实语音早 0.3–0.6 秒开始、
// 晚 0.5–1.5 秒结束。这里在原文时间附近用音量包络找到真正的说话区间：
// 起点向前留 80 ms、终点向后留 160 ms，避免削掉首尾辅音。
// 个别系列（Tire Town School）的配乐比旁白轻 15–20 dB，whisper 偶尔把整句
// 落在配乐里；此时改用前后邻近语音的峰值作参照，并放宽回看和前探。
// 纯函数便于用合成包络测试；实际音频解码在 refine-picture-audio-bounds.mjs。

export const FRAME_SECONDS = 0.01
const PRE_ROLL = 0.08
const TAIL = 0.16
// 相对该句峰值低 11 dB 以下视为停顿/背景音乐；绘本旁白通常比配乐高 12 dB 以上。
const DROP_DB = 11
// 旧区间没有语音时改用更严格的阈值，避免把紧贴句子的配乐算进语音。
const EXPAND_DROP_DB = 8
// 峰值低于该值说明这一句没有可用语音，保留原时间。
const SILENT_PEAK = -45
// 旧区间峰值比附近峰值低 8 dB 以上，说明旧区间里只有配乐，真正的语音在别处。
const EXPAND_DB = 8
// 没有下一句时间戳时，向后搜索的最大秒数。
const MAX_AHEAD = 3.0

export function frameLevels(samples, sampleRate = 16000, windowSeconds = 0.025) {
  const window = Math.max(1, Math.round(sampleRate * windowSeconds))
  const hop = Math.max(1, Math.round(sampleRate * FRAME_SECONDS))
  const prefix = new Float64Array(samples.length + 1)
  for (let index = 0; index < samples.length; index++) prefix[index + 1] = prefix[index] + samples[index] * samples[index]
  const count = samples.length > window ? Math.floor((samples.length - window) / hop) + 1 : 0
  const levels = new Float64Array(count)
  for (let frame = 0; frame < count; frame++) {
    const from = frame * hop
    const rms = Math.sqrt((prefix[from + window] - prefix[from]) / window) / 32768
    levels[frame] = 20 * Math.log10(rms + 1e-9)
  }
  return levels
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * 在原始时间戳附近收窄一句的起止点。
 * levels 是每 10 ms 一帧的音量（dBFS）；返回秒数，保留两位小数。
 * wordCount 可选：配乐较响、whisper 时间整体偏到音乐里时，用词数估计
 * 这句应有的时长，触发一次基于严格阈值的语音段恢复。
 */
export function refineSentenceBounds(levels, { start, end, nextStart = Number.POSITIVE_INFINITY, prevEnd = 0, duration = Number.POSITIVE_INFINITY, wordCount = Number.NaN }) {
  const old = { start, end }
  if (!Number.isFinite(start) || !Number.isFinite(end) || !levels.length) return { ...old, changed: false }
  const limit = Math.min(Number.isFinite(duration) ? duration : Number.POSITIVE_INFINITY, levels.length * FRAME_SECONDS)
  const at = time => clamp(Math.floor(time / FRAME_SECONDS), 0, levels.length - 1)

  const spanFrom = at(Math.max(0, start))
  const spanTo = Math.max(spanFrom, at(Math.min(end, limit)))
  let spanPeak = Number.NEGATIVE_INFINITY
  for (let index = spanFrom; index <= spanTo; index++) spanPeak = Math.max(spanPeak, levels[index])

  // 本句自己的语音通常就在旧区间里；若旧区间只有配乐，附近会有比它响得多的语音。
  // 连续两句短感叹（Honk! Honk!）可能拿到相同的起点，这时不能把下一句起点当成本句上限。
  const forwardEnd = !Number.isFinite(nextStart)
    ? Math.min(limit, end + MAX_AHEAD)
    : nextStart > start + 0.15
      ? Math.min(limit, nextStart - 0.02)
      : Math.min(limit, Math.max(end + 1.5, start + 2.0))
  const wideFrom = at(Math.max(0, prevEnd + 0.02, start - 0.2))
  const wideTo = Math.max(spanTo, at(forwardEnd))
  let widePeak = spanPeak
  for (let index = wideFrom; index <= wideTo; index++) widePeak = Math.max(widePeak, levels[index])

  let base = null
  if (Number.isFinite(widePeak) && widePeak >= SILENT_PEAK) {
    const expanded = spanPeak < widePeak - EXPAND_DB
    const peak = expanded ? widePeak : spanPeak
    const threshold = peak - DROP_DB
    const speaking = index => levels[index] >= threshold
    const strictThreshold = peak - EXPAND_DROP_DB
    const strictSpeaking = index => levels[index] >= strictThreshold

    // 只回看 0.2 秒：whisper 的起点通常偏早，真正的语音在 start 之后；
    // 回看过多会把前一句尾音或句间配乐当成句首。
    const scanFrom = at(Math.max(0, prevEnd + 0.02, start - 0.2))
    // 旧区间没有语音时前探到下一句；正常句子最多前探 2.5 秒，够覆盖 whisper 偏早的情况。
    const scanTo = Math.min(at(expanded ? forwardEnd : Math.min(forwardEnd, start + 2.5)), levels.length - 2)
    const onsetSpeaking = expanded ? strictSpeaking : speaking
    let next = start
    let onset = -1
    for (let index = scanFrom; index <= scanTo; index++) {
      if (onsetSpeaking(index) && onsetSpeaking(index + 1)) {
        onset = index
        next = Math.max(prevEnd + 0.02, index * FRAME_SECONDS - PRE_ROLL)
        break
      }
    }

    if (onset >= 0) {
      let finish = end
      if (expanded) {
        // 语音整段在旧区间之外：从起点向后连续跟踪，遇到 0.8 秒以上停顿即收尾。
        // 旁白句内偶尔有 0.5 秒左右的换气停顿，阈值太短会把后半句切掉；
        // 句间配乐通常低于严格阈值，搜索上限又停在下一句之前，0.8 秒足够区分。
        let last = onset
        let silent = 0
        const searchTo = Math.min(at(forwardEnd), levels.length - 2)
        for (let index = onset + 1; index <= searchTo; index++) {
          if (strictSpeaking(index) || strictSpeaking(index - 1)) {
            last = index
            silent = 0
          } else if (++silent >= 80) break
        }
        finish = Math.min(forwardEnd, last * FRAME_SECONDS + TAIL)
      } else {
        // 原区间已包含语音，先在原 end 附近收尾，避免越过句间配乐。
        const searchEnd = Math.min(
          end + (end > start ? 0.25 : 1.5),
          Number.isFinite(nextStart) && nextStart > start + 0.15 ? nextStart - 0.02 : limit,
          limit,
        )
        const searchFrom = Math.max(at(next + 0.1), at(end - 2.0), 1)
        const searchTo = Math.min(at(searchEnd), levels.length - 2)
        let foundOffset = false
        for (let index = searchTo; index >= searchFrom; index--) {
          if (speaking(index) && speaking(index - 1)) {
            finish = Math.min(searchEnd, index * FRAME_SECONDS + TAIL)
            foundOffset = true
            break
          }
        }
        // 句末附近没有语音（whisper 的 end 偏晚、句间是配乐）时，从起点向后
        // 连续跟踪真正的说话区间，至少要有 0.25 秒语音才采用，避免把配乐当句子。
        if (!foundOffset) {
          let last = onset
          let silent = 0
          const tailTo = Math.min(at(forwardEnd), levels.length - 2)
          for (let index = onset + 1; index <= tailTo; index++) {
            if (strictSpeaking(index) || strictSpeaking(index - 1)) {
              last = index
              silent = 0
            } else if (++silent >= 80) break
          }
          if (last - onset >= 25) finish = Math.min(forwardEnd, last * FRAME_SECONDS + TAIL)
        }
      }
      if (finish > next + 0.15) base = { start: Math.max(0, next), end: Math.min(duration, finish) }
    }
  }

  // whisper 在配乐段落里可能整体偏移十几秒，靠原来的窄窗完全找不到语音。
  // 用词数估算时长，发现区间明显异常时，改在更宽的窗口里按严格阈值找语音段。
  const expected = Number.isFinite(wordCount) && wordCount > 0 ? wordCount * 0.42 + 0.4 : Number.NaN
  let chosen = base
  if (Number.isFinite(expected)) {
    const seconds = base ? base.end - base.start : Number.NaN
    const suspicious = !base || seconds < 0.25 || seconds > Math.max(expected * 1.7, expected + 1.2)
    if (suspicious) {
      const recovered = recoverSpeechSpan(levels, { start, end, prevEnd, nextStart, duration, expected, at })
      if (recovered) chosen = recovered
    }
  }
  if (!chosen) return { ...old, changed: false }
  const refined = {
    start: Number(Math.max(0, chosen.start).toFixed(2)),
    end: Number(Math.min(duration, chosen.end).toFixed(2)),
    changed: false,
  }
  refined.changed = Math.abs(refined.start - start) >= 0.01 || Math.abs(refined.end - end) >= 0.01
  return refined
}

// 窗口里的一声转场音效可能比旁白响十几 dB，用最大值会把阈值抬到
// 只有音效才算“语音”。这里取 97 分位，忽略不到 3% 的孤立尖峰。
function percentilePeak(levels, from, to) {
  const bins = new Int32Array(121)
  for (let index = from; index <= to; index++) {
    const bin = Math.max(0, Math.min(120, Math.round(-levels[index])))
    bins[bin]++
  }
  const target = (to - from + 1) * 0.97
  let seen = 0
  for (let bin = 120; bin >= 0; bin--) {
    seen += bins[bin]
    if (seen >= target) return -bin
  }
  return -120
}

// 在旧时间附近按更严格的阈值找连续语音段。whisper 的起点/终点只要有一个
// 落在真实语音里，就以对应的语音段为准；两个都落在语音里则保留中间整段
// （有些句子在音频里确实被一段音乐隔开）。
function recoverSpeechSpan(levels, { start, end, prevEnd, nextStart, duration, expected, at }) {
  const windowFrom = at(Math.max(0, prevEnd + 0.02, start - 3))
  const windowTo = Math.min(
    at(!Number.isFinite(nextStart) || nextStart <= start + 0.15 ? Math.max(end + 6, start + 2) : nextStart - 0.02),
    levels.length - 2,
  )
  if (windowTo - windowFrom < 10) return null
  const peak = percentilePeak(levels, windowFrom, windowTo)
  if (!Number.isFinite(peak) || peak < SILENT_PEAK) return null
  const threshold = peak - EXPAND_DROP_DB
  const runs = []
  let from = -1
  let last = -1
  let silent = 0
  for (let index = windowFrom; index <= windowTo; index++) {
    if (levels[index] >= threshold) {
      if (from < 0) from = index
      last = index
      silent = 0
    } else if (from >= 0 && ++silent >= 80) {
      runs.push({ from, to: last })
      from = -1
      silent = 0
    }
  }
  if (from >= 0) runs.push({ from, to: last })
  if (!runs.length) return null
  const startFrame = at(start)
  const endFrame = at(end)
  const startRun = runs.findIndex(run => startFrame >= run.from && startFrame <= run.to)
  const endRun = runs.findIndex(run => endFrame >= run.from && endFrame <= run.to)
  let first
  let lastRun
  if (startRun >= 0 && endRun >= 0) {
    first = Math.min(startRun, endRun)
    lastRun = Math.max(startRun, endRun)
  } else if (startRun >= 0) {
    first = lastRun = startRun
  } else if (endRun >= 0) {
    first = lastRun = endRun
  } else {
    // 两个旧端点都在音乐里。只有区间长得离谱时才尝试兜底：取起伏最明显、
    // 时长和词数相称的单个语音段；否则宁可保留原值，避免切到邻近句子的语音。
    if (end - start <= expected * 4 + 3) return null
    let best = -1
    let bestDeviation = 0
    for (const [index, run] of runs.entries()) {
      const seconds = (run.to - run.from) * FRAME_SECONDS
      if (seconds < 0.25 || seconds > expected * 2 + 1.5) continue
      let mean = 0
      for (let frame = run.from; frame <= run.to; frame++) mean += levels[frame]
      mean /= run.to - run.from + 1
      let variance = 0
      for (let frame = run.from; frame <= run.to; frame++) variance += (levels[frame] - mean) ** 2
      const deviation = Math.sqrt(variance / (run.to - run.from + 1))
      if (deviation > bestDeviation) {
        bestDeviation = deviation
        best = index
      }
    }
    if (best < 0 || bestDeviation < 8) return null
    first = lastRun = best
  }
  const seconds = (runs[lastRun].to - runs[first].from) * FRAME_SECONDS
  if (seconds < 0.15) return null
  // 严格阈值也可能把很响的配乐当成语音。跨度远超词数预期时，
  // 只保留音量起伏明显（音节感）的语音段；平稳的配乐段直接剔除。
  if (seconds > expected * 3 + 2.5) {
    const candidateRuns = []
    for (let index = first; index <= lastRun; index++) {
      const run = runs[index]
      let mean = 0
      for (let frame = run.from; frame <= run.to; frame++) mean += levels[frame]
      mean /= run.to - run.from + 1
      let variance = 0
      for (let frame = run.from; frame <= run.to; frame++) variance += (levels[frame] - mean) ** 2
      variance /= run.to - run.from + 1
      if (Math.sqrt(variance) >= 5.5) candidateRuns.push(index)
    }
    if (candidateRuns.length !== 1) return null
    first = lastRun = candidateRuns[0]
  }
  return {
    start: Math.max(prevEnd + 0.02, runs[first].from * FRAME_SECONDS - PRE_ROLL),
    end: Math.min(duration, runs[lastRun].to * FRAME_SECONDS + TAIL),
  }
}
