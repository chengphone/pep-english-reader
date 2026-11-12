import { useSyncExternalStore } from 'react'

const MODE_KEY = 'pep:teacher-mode'
const PIN_KEY = 'pep:teacher-pin'
const listeners = new Set<() => void>()
let modeCache: boolean | null = null

function emit() {
  for (const listener of listeners) listener()
}

// 教师模式只保护本机的编辑入口，不是账号权限系统。
// 密码用轻量哈希保存，避免明文出现在 localStorage；忘记后清除站点数据即可重设。
function hashPin(pin: string) {
  let hash = 2166136261
  for (let index = 0; index < pin.length; index++) {
    hash ^= pin.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function readTeacherMode() {
  if (modeCache !== null) return modeCache
  try {
    modeCache = localStorage.getItem(MODE_KEY) === '1'
  } catch {
    modeCache = false
  }
  return modeCache
}

export function setTeacherMode(on: boolean) {
  modeCache = on
  try {
    if (on) localStorage.setItem(MODE_KEY, '1')
    else localStorage.removeItem(MODE_KEY)
  } catch {
    // 存储不可用时保留当前会话内的状态。
  }
  emit()
}

export function subscribeTeacherMode(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTeacherMode() {
  return useSyncExternalStore(subscribeTeacherMode, readTeacherMode, readTeacherMode)
}

export function hasTeacherPin() {
  try {
    return Boolean(localStorage.getItem(PIN_KEY))
  } catch {
    return false
  }
}

export function setTeacherPin(pin: string) {
  try {
    localStorage.setItem(PIN_KEY, hashPin(pin))
  } catch {
    // 无法保存密码时，本次解锁仍然可用，下次需要重新设置。
  }
}

export function verifyTeacherPin(pin: string) {
  try {
    return localStorage.getItem(PIN_KEY) === hashPin(pin)
  } catch {
    return false
  }
}
