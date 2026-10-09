import { api, type Preset } from './api'

type BackupPreset = {
  game_title: string
  title_template: string
  text: string
  description: string
  category_id: string
  next_ep: number
  polls: { question: string; options: string[] }[]
  // ภาพปกฝังเป็น data URL เพื่อให้ทั้งหมดอยู่ในไฟล์เดียว
  thumbnail: string | null
}

type Backup = { app: 'yt-live-setup'; version: 1; exported_at: string; presets: BackupPreset[] }

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function exportBackup(presets: Preset[]): Promise<void> {
  const backup: Backup = {
    app: 'yt-live-setup',
    version: 1,
    exported_at: new Date().toISOString(),
    presets: await Promise.all(
      presets.map(async (p) => {
        let thumbnail: string | null = null
        if (p.thumbnail_url) {
          const res = await fetch(p.thumbnail_url)
          if (!res.ok) throw new Error(`โหลดภาพปกของ "${p.game_title}" ไม่สำเร็จ`)
          thumbnail = await toDataUrl(await res.blob())
        }
        return {
          game_title: p.game_title,
          title_template: p.title_template,
          text: p.text,
          description: p.description,
          category_id: p.category_id,
          next_ep: p.next_ep,
          polls: p.polls.map(({ question, options }) => ({ question, options })),
          thumbnail,
        }
      }),
    ),
  }

  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `yt-live-presets-${backup.exported_at.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export type ImportResult = { added: number; skipped: string[]; failed: string[] }

// เพิ่มเฉพาะ preset ที่ยังไม่มีชื่อเกมนั้นอยู่ จึงนำเข้าไฟล์เดิมซ้ำได้โดยไม่เกิดรายการซ้ำ
export async function importBackup(file: File, existing: Preset[]): Promise<ImportResult> {
  let backup: Backup
  try {
    backup = JSON.parse(await file.text())
  } catch {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองข้อมูล')
  }
  if (backup?.app !== 'yt-live-setup' || !Array.isArray(backup.presets)) {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองข้อมูล')
  }

  const names = new Set(existing.map((p) => p.game_title))
  const result: ImportResult = { added: 0, skipped: [], failed: [] }
  for (const { thumbnail, ...fields } of backup.presets) {
    const name = String(fields?.game_title ?? '')
    if (names.has(name)) {
      result.skipped.push(name)
      continue
    }
    try {
      const saved = await api<Preset>('/presets', { json: fields })
      names.add(name)
      result.added++
      if (thumbnail) {
        const blob = await (await fetch(thumbnail)).blob()
        const form = new FormData()
        form.append('file', new File([blob], 'thumbnail', { type: blob.type }))
        await api(`/presets/${saved.id}/thumbnail`, { form })
      }
    } catch (err) {
      result.failed.push(`${name || '(ไม่มีชื่อ)'}: ${(err as Error).message}`)
    }
  }
  return result
}
