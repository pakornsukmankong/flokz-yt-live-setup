import { useSyncExternalStore } from 'react'
import { toast } from './toast'

// แจ้งเตือนตามเวลาจริงบนนาฬิกา: ทุกครึ่งชั่วโมงดังที่ xx:00 และ xx:30 ทุกชั่วโมงดังที่ xx:00
// ตัวจับเวลาอยู่นอก component จึงทำงานต่อแม้สลับเมนู และจำการตั้งค่าไว้ใน localStorage ข้ามการรีเฟรช
export type TimerState = {
  halfHour: boolean
  hourly: boolean
  volume: number
  now: number
}

const KEY = 'clockAlerts'
const HALF_HOUR = 30 * 60_000
const listeners = new Set<() => void>()

function load(): TimerState {
  const base: TimerState = { halfHour: false, hourly: false, volume: 0.6, now: Date.now() }
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? '{}'), now: Date.now() }
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

// จุดเริ่มของช่วงครึ่งชั่วโมงที่เวลา t อยู่ ตามเวลาท้องถิ่น
function slotStart(t: number): number {
  const d = new Date(t)
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0)
  return d.getTime()
}

let ctx: AudioContext | null = null

// รอบชั่วโมงเล่นทำนองสองรอบ รอบครึ่งชั่วโมงเล่นรอบเดียว จึงแยกได้ด้วยหู
export function playChime(long = true, volume = state.volume) {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  const notes = long ? [880, 1175, 1568, 880, 1175, 1568] : [880, 1175, 1568]
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
  setHalfHour(on: boolean) {
    if (on) playChime(false, 0) // ปลดล็อกเสียงของเบราว์เซอร์ระหว่างที่ผู้ใช้กด
    update({ halfHour: on })
  },
  setHourly(on: boolean) {
    if (on) playChime(false, 0)
    update({ hourly: on })
  },
  setVolume(volume: number) {
    update({ volume })
  },
}

export function nextAlertAt(s: TimerState): number | null {
  if (s.halfHour) return slotStart(s.now) + HALF_HOUR
  if (s.hourly) {
    const d = new Date(s.now)
    d.setHours(d.getHours() + 1, 0, 0, 0)
    return d.getTime()
  }
  return null
}

export function formatClock(t: number): string {
  return new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

// เปิดหน้าเว็บกลางช่วงไม่ต้องดังทันที นับจากช่วงปัจจุบัน
let lastSlot = slotStart(Date.now())

setInterval(() => {
  const now = Date.now()
  const slot = slotStart(now)
  if (slot > lastSlot) {
    lastSlot = slot
    const onHour = new Date(slot).getMinutes() === 0
    if ((onHour && (state.hourly || state.halfHour)) || (!onHour && state.halfHour)) {
      playChime(onHour)
      toast.success(`ตอนนี้ ${formatClock(slot)} น.`)
    }
  }
  update({ now }, false)
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
