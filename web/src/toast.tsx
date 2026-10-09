import { useSyncExternalStore } from 'react'

type Toast = { id: number; kind: 'success' | 'error'; message: string }

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function update(next: Toast[]) {
  toasts = next
  listeners.forEach((fn) => fn())
}

function dismiss(id: number) {
  update(toasts.filter((t) => t.id !== id))
}

function show(kind: Toast['kind'], message: string) {
  if (toasts.some((t) => t.kind === kind && t.message === message)) return
  const id = nextId++
  update([...toasts, { id, kind, message }])
  // error อยู่นานกว่าเพราะข้อความจาก YouTube มักยาว
  setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000)
}

export const toast = {
  success: (message: string) => show('success', message),
  error: (message: string) => show('error', message),
}

export function Toasts() {
  const list = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => toasts,
  )
  return (
    <div className="toasts">
      {list.map((t) => (
        <button
          key={t.id}
          className={`toast ${t.kind}`}
          role={t.kind === 'error' ? 'alert' : 'status'}
          title="กดเพื่อปิด"
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
