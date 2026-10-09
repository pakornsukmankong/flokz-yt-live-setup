import { useEffect, useRef, useState } from 'react'
import { api, renderTemplate, type Category, type Poll, type Preset } from './api'
import { exportBackup, importBackup } from './backup'
import { fitThumbnail } from './image'
import { toast } from './toast'

type Draft = {
  id?: string
  game_title: string
  title_template: string
  text: string
  description: string
  category_id: string
  next_ep: number
  polls: Poll[]
}

const EMPTY: Draft = {
  game_title: '',
  title_template: '{game} EP.{ep}',
  text: '',
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
      // ผูกฟอร์มกับ preset ที่บันทึกแล้วทันที ถ้าขั้นภาพปกพลาด การกดบันทึกซ้ำจะไม่สร้าง preset ซ้ำ
      setDraft((d) => (d ? { ...d, id: saved.id } : d))
      let thumbError = ''
      if (file) {
        try {
          const form = new FormData()
          form.append('file', await fitThumbnail(file))
          await api(`/presets/${saved.id}/thumbnail`, { form })
        } catch (err) {
          thumbError = (err as Error).message
        }
      }
      await reloadPresets()
      if (thumbError) {
        setError(`บันทึก preset แล้ว แต่อัปโหลดภาพปกไม่สำเร็จ: ${thumbError}`)
        toast.error(`บันทึก preset แล้ว แต่อัปโหลดภาพปกไม่สำเร็จ: ${thumbError}`)
      } else {
        open(toDraft(saved))
        toast.success(`บันทึก preset "${saved.game_title}" แล้ว`)
      }
    } catch (err) {
      setError((err as Error).message)
      toast.error(`บันทึกไม่สำเร็จ: ${(err as Error).message}`)
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
      toast.success(`ลบ preset "${draft.game_title}" แล้ว`)
    } catch (err) {
      setError((err as Error).message)
      toast.error(`ลบไม่สำเร็จ: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // เติมฟอร์ม preset ใหม่จาก preset เดิม ชื่อเกมกับเลข EP ไม่ถูกแตะ
  const copyFrom = async (id: string) => {
    const src = presets.find((p) => p.id === id)
    if (!src) return
    set({
      title_template: src.title_template,
      text: src.text,
      description: src.description,
      category_id: src.category_id,
      polls: src.polls.map((x) => ({ question: x.question, options: [...x.options] })),
    })
    setFile(null)
    if (src.thumbnail_url) {
      try {
        const res = await fetch(src.thumbnail_url)
        if (!res.ok) throw new Error(res.statusText)
        const blob = await res.blob()
        setFile(new File([blob], 'thumbnail', { type: blob.type }))
      } catch {
        toast.error(`คัดลอกภาพปกจาก "${src.game_title}" ไม่สำเร็จ`)
      }
    }
    toast.success(`ใช้ข้อมูลจาก "${src.game_title}" แล้ว`)
  }

  const duplicate = async () => {
    if (!draft?.id) return
    setBusy(true)
    try {
      const copy = await api<Preset>(`/presets/${draft.id}/duplicate`, { method: 'POST' })
      await reloadPresets()
      open(toDraft(copy))
      toast.success(`ทำสำเนาเป็น "${copy.game_title}" แล้ว`)
    } catch (err) {
      setError((err as Error).message)
      toast.error(`ทำสำเนาไม่สำเร็จ: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const importInput = useRef<HTMLInputElement>(null)

  const backup = async () => {
    setBusy(true)
    try {
      await exportBackup(presets)
      toast.success(`สำรอง ${presets.length} preset ลงไฟล์แล้ว`)
    } catch (err) {
      toast.error(`สำรองข้อมูลไม่สำเร็จ: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const restore = async (backupFile: File) => {
    setBusy(true)
    try {
      const res = await importBackup(backupFile, presets)
      await reloadPresets()
      toast.success(
        `นำเข้า ${res.added} preset` + (res.skipped.length ? ` ข้าม ${res.skipped.length} รายการที่มีชื่อเกมนี้อยู่แล้ว` : ''),
      )
      res.failed.forEach((f) => toast.error(`นำเข้าไม่สำเร็จ: ${f}`))
    } catch (err) {
      toast.error(`นำเข้าไม่สำเร็จ: ${(err as Error).message}`)
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
        <div className="row backup">
          <button className="btn" disabled={busy || !presets.length} onClick={backup}>
            สำรองข้อมูล
          </button>
          <button className="btn" disabled={busy} onClick={() => importInput.current?.click()}>
            นำเข้า
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) restore(f)
            }}
          />
        </div>
      </aside>

      {draft && (
        <section className="card form">
          {!draft.id && presets.length > 0 && (
            <label>
              ใช้ข้อมูลจาก preset เดิม <span className="muted">คัดลอกทุกอย่างยกเว้นชื่อเกมและ EP</span>
              <select value="" onChange={(e) => copyFrom(e.target.value)}>
                <option value="" disabled>
                  เลือก preset…
                </option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.game_title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            ชื่อเกม
            <input value={draft.game_title} onChange={(e) => set({ game_title: e.target.value })} />
          </label>
          <label>
            ข้อความ <span className="muted">แทนที่ {'{text}'} ในชื่อคลิปและ description</span>
            <input value={draft.text} onChange={(e) => set({ text: e.target.value })} />
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
          <label>
            ชื่อคลิป <span className="muted">ใช้ {'{game}'} {'{ep}'} {'{text}'} ได้</span>
            <input value={draft.title_template} onChange={(e) => set({ title_template: e.target.value })} />
          </label>
          <p className="muted">ตัวอย่าง: {renderTemplate(draft.title_template, draft)}</p>
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
              <>
                <button className="btn" disabled={busy} onClick={duplicate}>
                  ทำสำเนา
                </button>
                <button className="btn danger" disabled={busy} onClick={remove}>
                  ลบ preset
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
