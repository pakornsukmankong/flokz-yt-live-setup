import { useCallback, useEffect, useState } from 'react'
import { api, renderTemplate, type Broadcast, type Preset } from './api'
import { toast } from './toast'

type ApplyResult = { title: string; warnings: string[]; gameTitle: string; studioUrl: string }
type ActivePoll = { messageId: string; question: string }

const POLL_KEY = 'activePoll'

function loadActivePoll(): ActivePoll | null {
  try {
    return JSON.parse(localStorage.getItem(POLL_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function Live({ presets, reloadPresets }: { presets: Preset[]; reloadPresets: () => Promise<void> }) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[] | null>(null)
  const [broadcastId, setBroadcastId] = useState('')
  const [presetId, setPresetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [activePoll, setActivePoll] = useState<ActivePoll | null>(loadActivePoll)

  const preset = presets.find((p) => p.id === presetId)
  const broadcast = broadcasts?.find((b) => b.id === broadcastId)

  const loadBroadcasts = useCallback(async () => {
    setLoadError('')
    try {
      const list = await api<Broadcast[]>('/live/broadcasts')
      setBroadcasts(list)
      // active มาก่อน upcoming จึงได้ไลฟ์ที่ออนอยู่เป็นค่าเริ่มต้น
      setBroadcastId((cur) => (list.some((b) => b.id === cur) ? cur : (list[0]?.id ?? '')))
    } catch (err) {
      setLoadError((err as Error).message)
      toast.error(`โหลดรายการไลฟ์ไม่สำเร็จ: ${(err as Error).message}`)
    }
  }, [])

  useEffect(() => {
    loadBroadcasts()
  }, [loadBroadcasts])

  const savePoll = (p: ActivePoll | null) => {
    setActivePoll(p)
    if (p) localStorage.setItem(POLL_KEY, JSON.stringify(p))
    else localStorage.removeItem(POLL_KEY)
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message)
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const apply = () =>
    run(async () => {
      setResult(null)
      const res = await api<ApplyResult>('/live/apply', { json: { presetId, broadcastId } })
      setResult(res)
      toast.success(`อัปเดตไลฟ์แล้ว: ${res.title}`)
      res.warnings.forEach(toast.error)
      await Promise.all([reloadPresets(), loadBroadcasts()])
    })

  const firePoll = (pollId: string) =>
    run(async () => {
      const poll = await api<ActivePoll>('/live/poll', { json: { presetId, pollId, broadcastId } })
      savePoll(poll)
      toast.success(`ยิง poll แล้ว: ${poll.question}`)
    })

  const closePoll = () =>
    run(async () => {
      await api('/live/poll/close', { json: { messageId: activePoll!.messageId } })
      savePoll(null)
      toast.success('ปิด poll แล้ว')
    })

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <h3>1. ไลฟ์เป้าหมาย</h3>
          <button className="btn" onClick={loadBroadcasts}>
            รีเฟรช
          </button>
        </div>
        {loadError && <p className="error">โหลดรายการไลฟ์ไม่สำเร็จ กดรีเฟรชเพื่อลองใหม่ ({loadError})</p>}
        {broadcasts === null && !loadError && <p className="muted">กำลังโหลด…</p>}
        {broadcasts?.length === 0 && (
          <p className="muted">ไม่พบไลฟ์ที่ออนอยู่หรือตั้งรอไว้ สร้างไลฟ์ใน YouTube Studio ก่อนแล้วกดรีเฟรช</p>
        )}
        {broadcasts?.map((b) => (
          <label key={b.id} className={b.id === broadcastId ? 'item on' : 'item'}>
            <input type="radio" checked={b.id === broadcastId} onChange={() => setBroadcastId(b.id)} />
            <span className={b.status === 'active' ? 'badge live' : 'badge'}>
              {b.status === 'active' ? 'LIVE' : 'รอเริ่ม'}
            </span>
            {b.title}
          </label>
        ))}
      </section>

      <section className="card">
        <h3>2. เลือก preset</h3>
        <div className="chips">
          {presets.map((p) => (
            <button key={p.id} className={p.id === presetId ? 'chip on' : 'chip'} onClick={() => setPresetId(p.id)}>
              {p.game_title}
            </button>
          ))}
          {!presets.length && <p className="muted">ยังไม่มี preset ไปสร้างที่แท็บ "Preset เกม"</p>}
        </div>
        {preset && (
          <>
            <div className="preview">
              {preset.thumbnail_url && <img className="thumb small" src={preset.thumbnail_url} alt="" />}
              <div>
                <strong>{renderTemplate(preset.title_template, preset)}</strong>
                <p className="muted pre">{renderTemplate(preset.description, preset)}</p>
              </div>
            </div>
            <div className="row actions">
              <button className="btn primary" disabled={busy || !broadcastId} onClick={apply}>
                {busy ? 'กำลังทำงาน…' : 'Apply ไปที่ YouTube'}
              </button>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
        {result && (
          <div className="success">
            <p>อัปเดตแล้ว: {result.title}</p>
            {result.warnings.map((w) => (
              <p key={w} className="error">
                {w}
              </p>
            ))}
            <p>
              ชื่อเกมต้องเลือกเองใน Studio:{' '}
              <button className="btn" onClick={() =>
                  navigator.clipboard.writeText(result.gameTitle).then(
                    () => toast.success(`copy "${result.gameTitle}" แล้ว`),
                    () => toast.error('copy ไม่สำเร็จ'),
                  )
                }
              >
                copy "{result.gameTitle}"
              </button>{' '}
              <a className="btn" href={result.studioUrl} target="_blank" rel="noreferrer">
                เปิดหน้า Studio
              </a>
            </p>
          </div>
        )}
      </section>

      {preset && preset.polls.length > 0 && (
        <section className="card">
          <h3>3. Poll</h3>
          {broadcast?.status !== 'active' && <p className="muted">ยิง poll ได้เมื่อไลฟ์ออนอยู่เท่านั้น</p>}
          {activePoll && (
            <div className="row between success">
              <span>กำลังเปิด: {activePoll.question}</span>
              <span className="row">
                <button className="btn danger" disabled={busy} onClick={closePoll}>
                  ปิด poll
                </button>
                <button className="btn" onClick={() => savePoll(null)} title="ใช้เมื่อ poll ถูกปิดจาก YouTube ไปแล้ว">
                  ล้าง
                </button>
              </span>
            </div>
          )}
          {preset.polls.map((p) => (
            <div key={p.id} className="row between poll">
              <div>
                <strong>{p.question}</strong>
                <p className="muted">{p.options.join(' / ')}</p>
              </div>
              <button
                className="btn primary"
                disabled={busy || !!activePoll || broadcast?.status !== 'active'}
                onClick={() => firePoll(p.id!)}
              >
                ยิง poll
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
