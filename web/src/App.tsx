import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type Me, type Preset } from './api'
import { Live } from './Live'
import { Presets } from './Presets'
import { Timer } from './Timer'
import { formatDuration, nextAlertIn, useTimer } from './timerStore'
import { Toasts } from './toast'

const LOGIN_ERRORS: Record<string, string> = {
  not_allowed: 'อีเมลนี้ไม่ได้รับอนุญาตให้ใช้งาน',
  cancelled: 'ยกเลิกการ login',
  missing_scope: 'ยังไม่ได้อนุญาตสิทธิ์จัดการ YouTube กรุณา login ใหม่แล้วติ๊กช่องสิทธิ์ YouTube ในหน้าของ Google',
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [presets, setPresets] = useState<Preset[]>([])
  const [tab, setTab] = useState<'live' | 'presets' | 'timer'>('live')
  const timerState = useTimer()
  const [error, setError] = useState('')

  const reloadPresets = useCallback(async () => {
    setPresets(await api<Preset[]>('/presets'))
  }, [])

  useEffect(() => {
    api<Me>('/auth/me')
      .then(async (m) => {
        setMe(m)
        await reloadPresets()
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setMe(null)
        else setError(err.message)
      })
  }, [reloadPresets])

  if (error) return <div className="center error">{error}</div>
  if (me === undefined) return <div className="center">กำลังโหลด…</div>

  if (me === null) {
    const code = new URLSearchParams(location.search).get('login_error')
    return (
      <div className="center">
        <h1>YT Live Setup</h1>
        {code && <p className="error">{LOGIN_ERRORS[code] ?? 'login ไม่สำเร็จ'}</p>}
        <a className="btn primary" href="/api/auth/login">
          เข้าสู่ระบบด้วย Google
        </a>
      </div>
    )
  }

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' })
    setMe(null)
  }

  return (
    <div className="app">
      <header>
        <strong className="brand">YT Live Setup</strong>
        <nav>
          <button className={tab === 'live' ? 'tab on' : 'tab'} onClick={() => setTab('live')}>
            ไลฟ์
          </button>
          <button className={tab === 'presets' ? 'tab on' : 'tab'} onClick={() => setTab('presets')}>
            Preset เกม
          </button>
          <button className={tab === 'timer' ? 'tab on' : 'tab'} onClick={() => setTab('timer')}>
            ตัวจับเวลา
            {timerState.startedAt !== null && <span className="tab-badge">{formatDuration(nextAlertIn(timerState))}</span>}
          </button>
        </nav>
        <span className="muted">{me.channelTitle ?? me.email}</span>
        <button className="btn" onClick={logout}>
          ออกจากระบบ
        </button>
      </header>
      <main>
        {tab === 'live' && <Live presets={presets} reloadPresets={reloadPresets} />}
        {tab === 'presets' && <Presets presets={presets} reloadPresets={reloadPresets} />}
        {tab === 'timer' && <Timer />}
      </main>
      <Toasts />
    </div>
  )
}
