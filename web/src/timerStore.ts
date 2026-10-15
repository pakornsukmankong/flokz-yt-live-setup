import { useSyncExternalStore } from 'react'
import { toast } from './toast'

// แจ้งเตือนตามเวลาจริงบนนาฬิกา: ทุกครึ่งชั่วโมงดังที่ xx:00 และ xx:30 ทุกชั่วโมงดังที่ xx:00
// ตัวจับเวลาอยู่นอก component จึงทำงานต่อแม้สลับเมนู และจำการตั้งค่าไว้ใน localStorage ข้ามการรีเฟรช
export type TimerState = {
  halfHour: boolean
  hourly: boolean
  volume: number
  now: number
  // เบราว์เซอร์ไม่ให้เว็บเล่นเสียงจนกว่าผู้ใช้จะคลิกหรือกดปุ่มบนหน้าอย่างน้อยหนึ่งครั้งหลังเปิดหน้า
  audioReady: boolean
}

const KEY = 'clockAlerts'
const HALF_HOUR = 30 * 60_000
const listeners = new Set<() => void>()

function load(): TimerState {
  const base: TimerState = { halfHour: false, hourly: false, volume: 0.6, now: Date.now(), audioReady: false }
  try {
    const { halfHour, hourly, volume } = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { ...base, ...(halfHour !== undefined && { halfHour, hourly, volume }) }
  } catch {
    return base
  }
}

let state = load()

function update(patch: Partial<TimerState>, persist = true) {
  state = { ...state, ...patch }
  if (persist) {
    try {
      const { halfHour, hourly, volume } = state
      localStorage.setItem(KEY, JSON.stringify({ halfHour, hourly, volume }))
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

function isOnHour(t: number): boolean {
  return new Date(t).getMinutes() === 0
}

function alertsAt(slot: number, s: TimerState): boolean {
  return isOnHour(slot) ? s.hourly || s.halfHour : s.halfHour
}

export function nextAlertAt(s: TimerState): number | null {
  if (!s.halfHour && !s.hourly) return null
  let slot = slotStart(s.now) + HALF_HOUR
  while (!alertsAt(slot, s)) slot += HALF_HOUR
  return slot
}

// ---- เสียง ----

let ctx: AudioContext | null = null

function unlockAudio() {
  ctx ??= new AudioContext()
  ctx.onstatechange = () => {
    update({ audioReady: ctx!.state === 'running' }, false)
    reschedule()
  }
  if (ctx.state !== 'running') void ctx.resume()
}

// ทุกครั้งที่ผู้ใช้คลิกหรือกดคีย์บนหน้า ให้ปลดล็อกเสียงไว้ล่วงหน้า
for (const event of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(event, unlockAudio, { capture: true })
}

// รอบชั่วโมงเล่นทำนองสองรอบ รอบครึ่งชั่วโมงเล่นรอบเดียว จึงแยกได้ด้วยหู
function chimeNodes(at: number, long: boolean, volume: number): OscillatorNode[] {
  const notes = long ? [880, 1175, 1568, 880, 1175, 1568] : [880, 1175, 1568]
  return notes.map((freq, i) => {
    const t = at + i * 0.22 + (i >= 3 ? 0.35 : 0)
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
    return osc
  })
}

export function playChime(long = true) {
  unlockAudio()
  chimeNodes(ctx!.currentTime, long, state.volume)
}

// จองเสียงครั้งถัดไปไว้บนนาฬิกาของระบบเสียงล่วงหน้า เบราว์เซอร์ไม่ชะลอนาฬิกานี้ในแท็บเบื้องหลัง
// (ต่างจาก setInterval ที่ถูกชะลอได้ถึงนาทีละครั้ง) เสียงจึงดังตรงเวลาแม้ไม่ได้เปิดแท็บนี้อยู่
let scheduled: { slot: number; nodes: OscillatorNode[] } | null = null

function reschedule() {
  if (scheduled && ctx) {
    for (const osc of scheduled.nodes) {
      try {
        osc.stop(0)
      } catch {
        // เล่นจบไปแล้ว
      }
    }
  }
  scheduled = null
  const next = nextAlertAt({ ...state, now: Date.now() })
  if (!next || !ctx || ctx.state !== 'running') return
  const at = ctx.currentTime + (next - Date.now()) / 1000
  scheduled = { slot: next, nodes: chimeNodes(at, isOnHour(next), state.volume) }
}

export const timer = {
  setHalfHour(on: boolean) {
    update({ halfHour: on })
    reschedule()
  },
  setHourly(on: boolean) {
    update({ hourly: on })
    reschedule()
  },
  setVolume(volume: number) {
    update({ volume })
    reschedule()
  },
}

export function formatClock(t: number): string {
  return new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

// เปิดหน้าเว็บกลางช่วงไม่ต้องดังทันที นับจากช่วงปัจจุบัน
let lastSlot = slotStart(Date.now())
let lastResync = Date.now()

setInterval(() => {
  const now = Date.now()
  const slot = slotStart(now)
  if (slot > lastSlot) {
    lastSlot = slot
    if (alertsAt(slot, state)) {
      // เสียงถูกจองไว้แล้ว ถ้าไม่ได้จอง (เช่น เพิ่งปลดล็อกเสียง) และยังไม่สายเกินไปให้เล่นตอนนี้แทน
      if (scheduled?.slot !== slot && ctx?.state === 'running' && now - slot < 60_000) playChime(isOnHour(slot))
      toast.success(`ตอนนี้ ${formatClock(slot)} น.`)
    }
    reschedule()
  } else if (now - lastResync > 60_000) {
    // จองใหม่ทุกนาทีเพื่อแก้เวลาที่เลื่อน เช่น หลังเครื่องหลับแล้วตื่น
    lastResync = now
    if (!scheduled || scheduled.slot - now > 5_000) reschedule()
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
