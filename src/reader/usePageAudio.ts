import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReaderPage, ReaderResource } from './types'

// 页面级课堂音频的受控播放内核。它挂在 LocalReader 上而不是资源面板里：
// 翻到下一页时面板可能关闭，但正在播放的跨页音频和底部播放条仍要连续工作。
export type PageAudioController = {
  activeId: string | null
  activeResource: ReaderResource | null
  playing: boolean
  current: number
  duration: number
  error: string
  rate: number
  loop: boolean
  volume: number
  muted: boolean
  toggle: (resource: ReaderResource) => void
  stop: () => void
  seek: (value: number) => void
  skip: (direction: -1 | 1) => void
  setRate: (value: number) => void
  setLoop: (value: boolean) => void
  setVolume: (value: number) => void
  toggleMute: () => void
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

// 清单里的 startAt 可能来自旧版本或手工编辑；Infinity / NaN 会让播放条
// 显示 NaN，也不能直接赋给 currentTime。
function startOffset(resource: ReaderResource) {
  return Number.isFinite(resource.startAt) ? Math.max(0, resource.startAt!) : 0
}

// 页面打开后预取本页第一段音频的完整文件，让第一次点击播放直接命中
// Service Worker / 浏览器缓存；不预取视频，也不在省流模式或 2G 下预取。
const preloadedAudio = new Set<string>()
export function preloadAudio(url: string) {
  if (!url || preloadedAudio.has(url)) return
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') return
  preloadedAudio.add(url)
  void fetch(url, { cache: 'force-cache' })
    .then(response => {
      // 404/500 或断网重试时不要把 URL 永久标记为已预取，否则本会话再也不补。
      if (!response.ok) { preloadedAudio.delete(url); return undefined }
      return response.arrayBuffer()
    })
    .catch(() => { preloadedAudio.delete(url) })
}

// 翻页续播只适用于相邻页都标记 continuous 的同一段音频。仅 id/src 相同的
// 普通资源仍应在离开本页时停止，否则上一页的声音会跟到下一页。
export function continuesAcrossPage(current: ReaderResource, next: ReaderResource) {
  return current.kind === 'audio' && next.kind === 'audio' &&
    current.id === next.id && current.src === next.src &&
    current.continuous === true && next.continuous === true
}

export function usePageAudio(page: ReaderPage | undefined): PageAudioController {
  const resources = useMemo(
    () => (page?.resources ?? []).filter(resource => resource.kind === 'audio'),
    [page],
  )
  const [activeResource, setActiveResourceState] = useState<ReaderResource | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')
  const [rate, setRateState] = useState(1)
  const [loop, setLoopState] = useState(false)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMutedState] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const active = useRef<ReaderResource | null>(null)
  const startAt = useRef(0)
  const rateRef = useRef(1)
  const loopRef = useRef(false)
  const volumeRef = useRef(1)
  const mutedRef = useRef(false)
  const resourcesRef = useRef(resources)
  useEffect(() => { resourcesRef.current = resources }, [resources])

  const release = useCallback(() => {
    const player = audio.current
    audio.current = null
    active.current = null
    if (!player) return
    player.onended = null
    player.onerror = null
    player.ontimeupdate = null
    player.onloadedmetadata = null
    player.pause()
    player.removeAttribute('src')
    player.load()
  }, [])

  const stop = useCallback(() => {
    release()
    setActiveResourceState(null)
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    setError('')
  }, [release])

  const start = useCallback((resource: ReaderResource) => {
    release()
    const from = startOffset(resource)
    const player = new Audio(resource.src)
    player.preload = 'auto'
    player.volume = volumeRef.current
    player.muted = mutedRef.current
    player.playbackRate = rateRef.current
    audio.current = player
    active.current = resource
    startAt.current = from
    setActiveResourceState(resource)
    setPlaying(false)
    setCurrent(from)
    // 清单里的 duration 可能损坏；非有限值不能让播放条拿到 NaN 进度。
    setDuration(Number.isFinite(resource.duration) ? Math.max(0, resource.duration!) : 0)
    setError('')

    player.ontimeupdate = () => {
      if (audio.current !== player) return
      setCurrent(Number.isFinite(player.currentTime) ? player.currentTime : 0)
    }
    player.onloadedmetadata = () => {
      if (audio.current !== player) return
      if (Number.isFinite(player.duration) && player.duration > 0) setDuration(player.duration)
      // 有些浏览器在创建 Audio 后立刻设置 currentTime 会被忽略，元数据就绪后再补一次。
      if (from > 0 && player.currentTime + 0.25 < from) {
        try { player.currentTime = from } catch { /* 元数据未就绪时忽略 */ }
      }
    }
    player.onended = () => {
      if (audio.current !== player) return
      if (loopRef.current) {
        try { player.currentTime = startAt.current } catch { /* 忽略 */ }
        void player.play().catch(() => {
          if (audio.current === player) setError('这段音频无法继续播放，请再点一次。')
        })
        return
      }
      setPlaying(false)
      setCurrent(startAt.current)
      try { player.currentTime = startAt.current } catch { /* 某些浏览器结束后不允许 seek */ }
    }
    player.onerror = () => {
      if (audio.current !== player) return
      setPlaying(false)
      setError('这段音频无法加载，请检查网络后重试。')
    }

    if (from > 0) {
      try { player.currentTime = from } catch { /* 等 loadedmetadata */ }
    }
    void player.play().then(() => {
      if (audio.current === player) setPlaying(true)
    }).catch(() => {
      if (audio.current !== player) return
      setPlaying(false)
      setError('浏览器没有开始播放，请再点一次。')
    })
  }, [release])

  function toggle(resource: ReaderResource) {
    const player = audio.current
    if (player && active.current?.id === resource.id && active.current.src === resource.src) {
      if (player.paused) {
        if (player.ended) {
          try { player.currentTime = startOffset(resource) } catch { /* 忽略 */ }
        }
        void player.play().then(() => {
          if (audio.current === player) setPlaying(true)
        }).catch(() => {
          if (audio.current !== player) return
          setPlaying(false)
          setError('浏览器没有开始播放，请再点一次。')
        })
      } else {
        player.pause()
        setPlaying(false)
      }
      return
    }
    start(resource)
  }

  function seek(value: number) {
    const player = audio.current
    if (!player) return
    const maximum = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : duration
    const next = clamp(value, 0, maximum || 0)
    try {
      player.currentTime = next
      setCurrent(next)
    } catch { /* 元数据未就绪时忽略拖动 */ }
  }

  function skip(direction: -1 | 1) {
    const list = resourcesRef.current
    if (!list.length) return
    const index = list.findIndex(resource => resource.id === active.current?.id && resource.src === active.current?.src)
    const next = index < 0
      ? (direction > 0 ? 0 : list.length - 1)
      : clamp(index + direction, 0, list.length - 1)
    if (next === index) return
    start(list[next])
  }

  function setRate(value: number) {
    const next = clamp(value, 0.5, 2)
    rateRef.current = next
    setRateState(next)
    if (audio.current) audio.current.playbackRate = next
  }

  function setLoop(value: boolean) {
    loopRef.current = value
    setLoopState(value)
  }

  function setVolume(value: number) {
    const next = clamp(value, 0, 1)
    volumeRef.current = next
    setVolumeState(next)
    if (audio.current) audio.current.volume = next
  }

  function toggleMute() {
    const next = !mutedRef.current
    mutedRef.current = next
    setMutedState(next)
    if (audio.current) audio.current.muted = next
  }

  // 翻页时只有同一段连续音频（id 和 src 都相同）可以继续播放；
  // 普通资源在离开它所属的页面后停止，避免翻到下一页还在放上一页的声音。
  useEffect(() => {
    const currentResource = active.current
    if (!currentResource) return
    const match = (page?.resources ?? []).find(resource => continuesAcrossPage(currentResource, resource))
    if (!match) {
      stop()
      return
    }
    active.current = match
    setActiveResourceState(match)
    startAt.current = startOffset(match)
  }, [page, stop])

  useEffect(() => () => release(), [release])

  return {
    activeId: activeResource?.id ?? null,
    activeResource,
    playing,
    current,
    duration,
    error,
    rate,
    loop,
    volume,
    muted,
    toggle,
    stop,
    seek,
    skip,
    setRate,
    setLoop,
    setVolume,
    toggleMute,
  }
}
