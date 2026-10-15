import { useSyncExternalStore } from 'react'
import { toast } from './toast'

// ตัวจับเวลาอยู่นอก component จึงนับต่อได้แม้สลับไปแท็บอื่นในแอป และจำค่าไว้ใน localStorage ข้ามการรีเฟรช
export type TimerState = {
  minutes: 30 | 60
  volume: number
  startedAt: number | null
  alerts: number
  now: number
}

const KEY = 'timer'
const listeners = new Set<() => void>()

function load(): TimerState {
  const now = Date.now()
  const base: TimerState = { minutes: 30, volume: 0.6, startedAt: null, alerts: 0, now }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!saved) return base
    const s = { ...base, ...saved, now }
    // รอบที่เลยไปตอนปิดหน้าเว็บไม่ต้องดังย้อนหลัง
    if (s.startedAt) s.alerts = Math.floor((now - s.startedAt) / (s.minutes * 60_000))
    return s
  } catch {
    return base
  }
}

let state = load()

function update(patch: Partial<TimerState>, persist = true) {
  state = { ...state, ...patch }
  if (persist) {
    try {
      const { now, ...saved } = state
      localStorage.setItem(KEY, JSON.stringify(saved))
    } catch {
      // ใช้ต่อได้แม้เบราว์เซอร์ไม่ให้เก็บข้อมูล
    }
  }
  listeners.forEach((fn) => fn())
}

let ctx: AudioContext | null = null

export function playChime(volume = state.volume) {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  const notes = [880, 1175, 1568, 880, 1175, 1568]
  notes.forEach((freq, i) => {
    const t = ctx!.currentTime + i * 0.22 + (i >= 3 ? 0.35 : 0)
    const osc = ctx!.createOscillator()
    const gain = ctx!.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(volume, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    osc.connect(gain).connect(ctx!.destination)
    osc.start(t)
    osc.stop(t + 0.5)
  })
}

export const timer = {
  start() {
    playChime(0) // ปลดล็อกเสียงของเบราว์เซอร์ระหว่างที่ผู้ใช้กดปุ่ม
    update({ startedAt: Date.now(), alerts: 0, now: Date.now() })
  },
  stop() {
    update({ startedAt: null, alerts: 0 })
  },
  setMinutes(minutes: 30 | 60) {
    update({ minutes, ...(state.startedAt ? { startedAt: Date.now(), alerts: 0 } : {}) })
  },
  setVolume(volume: number) {
    update({ volume })
  },
}

// คำนวณจากเวลาจริงทุกวินาที แม้เบราว์เซอร์จะชะลอแท็บเบื้องหลัง เวลาเตือนก็ไม่เลื่อนสะสม
setInterval(() => {
  if (!state.startedAt) return
  const now = Date.now()
  const round = Math.floor((now - state.startedAt) / (state.minutes * 60_000))
  if (round > state.alerts) {
    playChime()
    const total = round * state.minutes
    toast.success(`ครบ ${total >= 60 ? `${Math.floor(total / 60)} ชั่วโมง${total % 60 ? ` ${total % 60} นาที` : ''}` : `${total} นาที`} แล้ว`)
    update({ alerts: round, now })
  } else {
    update({ now }, false)
  }
}, 1000)

export function useTimer(): TimerState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
  )
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function nextAlertIn(s: TimerState): number {
  if (!s.startedAt) return 0
  const period = s.minutes * 60_000
  return s.startedAt + (s.alerts + 1) * period - s.now
}
