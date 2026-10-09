import { useEffect, useState } from 'react'
import { api, renderTemplate, type Category, type Poll, type Preset } from './api'
import { fitThumbnail } from './image'

type Draft = {
  id?: string
  game_title: string
  title_template: string
  description: string
  category_id: string
  next_ep: number
  polls: Poll[]
}

const EMPTY: Draft = {
  game_title: '',
  title_template: '{game} EP.{ep}',
  description: '',
  category_id: '20',
  next_ep: 1,
  polls: [],
}

function toDraft(p: Preset): Draft {
  const { thumbnail_url, ...rest } = p
  return { ...rest, polls: p.polls.map((x) => ({ question: x.question, options: [...x.options] })) }
}

export function Presets({ presets, reloadPresets }: { presets: Preset[]; reloadPresets: () => Promise<void> }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Category[]>('/live/categories')
      .then(setCategories)
      .catch(() => setCategories([{ id: '20', title: 'Gaming' }]))
  }, [])

  const open = (d: Draft) => {
    setDraft(d)
    setFile(null)
    setError('')
  }
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const setPoll = (i: number, patch: Partial<Poll>) =>
    set({ polls: draft!.polls.map((p, j) => (j === i ? { ...p, ...patch } : p)) })

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      const saved = await api<Preset>(draft.id ? `/presets/${draft.id}` : '/presets', {
        method: draft.id ? 'PUT' : 'POST',
        json: draft,
      })
      if (file) {
        const form = new FormData()
        form.append('file', await fitThumbnail(file))
        await api(`/presets/${saved.id}/thumbnail`, { form })
      }
      await reloadPresets()
      open(toDraft(saved))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!draft?.id || !confirm(`ลบ preset "${draft.game_title}"?`)) return
    setBusy(true)
    try {
      await api(`/presets/${draft.id}`, { method: 'DELETE' })
      await reloadPresets()
      setDraft(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const current = presets.find((p) => p.id === draft?.id)
  const preview = file ? URL.createObjectURL(file) : current?.thumbnail_url

  return (
    <div className="split">
      <aside className="card">
        <button className="btn primary full" onClick={() => open(EMPTY)}>
          + สร้าง preset
        </button>
        {presets.map((p) => (
          <button key={p.id} className={p.id === draft?.id ? 'item on' : 'item'} onClick={() => open(toDraft(p))}>
            {p.game_title}
          </button>
        ))}
        {!presets.length && <p className="muted">ยังไม่มี preset</p>}
      </aside>

      {draft && (
        <section className="card form">
          <label>
            ชื่อเกม
            <input value={draft.game_title} onChange={(e) => set({ game_title: e.target.value })} />
          </label>
          <label>
            ชื่อคลิป <span className="muted">ใช้ {'{game}'} {'{ep}'} {'{date}'} ได้</span>
            <input value={draft.title_template} onChange={(e) => set({ title_template: e.target.value })} />
          </label>
          <p className="muted">ตัวอย่าง: {renderTemplate(draft.title_template, draft.game_title, draft.next_ep)}</p>
          <div className="row">
            <label>
              หมวดหมู่
              <select value={draft.category_id} onChange={(e) => set({ category_id: e.target.value })}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ตอนถัดไป (EP)
              <input
                type="number"
                min={1}
                value={draft.next_ep}
                onChange={(e) => set({ next_ep: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
          </div>
          <label>
            Description
            <textarea rows={6} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <label>
            ภาพปก <span className="muted">JPG/PNG ถ้าเกิน 2MB จะย่อให้อัตโนมัติ</span>
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {preview && <img className="thumb" src={preview} alt="ภาพปก" />}

          <h3>Poll</h3>
          {draft.polls.map((poll, i) => (
            <div key={i} className="poll">
              <div className="row">
                <input
                  placeholder="คำถาม"
                  value={poll.question}
                  onChange={(e) => setPoll(i, { question: e.target.value })}
                />
                <button className="btn" onClick={() => set({ polls: draft.polls.filter((_, j) => j !== i) })}>
                  ลบ poll
                </button>
              </div>
              {poll.options.map((opt, k) => (
                <div key={k} className="row">
                  <input
                    placeholder={`ตัวเลือก ${k + 1}`}
                    value={opt}
                    onChange={(e) => setPoll(i, { options: poll.options.map((o, m) => (m === k ? e.target.value : o)) })}
                  />
                  {poll.options.length > 2 && (
                    <button className="btn" onClick={() => setPoll(i, { options: poll.options.filter((_, m) => m !== k) })}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {poll.options.length < 4 && (
                <button className="btn" onClick={() => setPoll(i, { options: [...poll.options, ''] })}>
                  + ตัวเลือก
                </button>
              )}
            </div>
          ))}
          <button className="btn" onClick={() => set({ polls: [...draft.polls, { question: '', options: ['', ''] }] })}>
            + เพิ่ม poll
          </button>

          {error && <p className="error">{error}</p>}
          <div className="row actions">
            <button className="btn primary" disabled={busy} onClick={save}>
              {busy ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
            {draft.id && (
              <button className="btn danger" disabled={busy} onClick={remove}>
                ลบ preset
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
