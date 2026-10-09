import { randomUUID } from 'node:crypto'
import { copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { db, HttpError, THUMBNAIL_DIR, type Account } from '../db.js'

export type Preset = {
  id: string
  account_id: string
  game_title: string
  title_template: string
  text: string
  description: string
  category_id: string
  next_ep: number
  thumbnail_path: string | null
  updated_at: string
  preset_polls: { id: string; question: string; options: string[]; sort: number }[]
  preset_messages: { id: string; text: string; sort: number }[]
}

type PresetRow = Omit<Preset, 'preset_polls' | 'preset_messages'>

// YouTube จำกัดข้อความแชตไลฟ์ที่ 200 ตัวอักษร
const MAX_CHAT_LENGTH = 200

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' }

function parseBody(b: any) {
  const game_title = String(b?.game_title ?? '').trim()
  if (!game_title) throw new HttpError(400, 'ต้องใส่ชื่อเกม')
  const title_template = String(b.title_template ?? '').trim() || '{game}'
  const next_ep = Number.isInteger(b.next_ep) && b.next_ep > 0 ? b.next_ep : 1

  const polls = (Array.isArray(b.polls) ? b.polls : []).map((p: any) => ({
    question: String(p?.question ?? '').trim(),
    options: (Array.isArray(p?.options) ? p.options : []).map((o: any) => String(o).trim()).filter(Boolean),
  }))
  for (const p of polls) {
    if (!p.question) throw new HttpError(400, 'poll ต้องมีคำถาม')
    if (p.options.length < 2 || p.options.length > 4) {
      throw new HttpError(400, `poll "${p.question}" ต้องมี 2–4 ตัวเลือก`)
    }
  }

  const messages: string[] = (Array.isArray(b.messages) ? b.messages : [])
    .map((m: any) => String(m ?? '').trim())
    .filter(Boolean)
  for (const m of messages) {
    if (m.length > MAX_CHAT_LENGTH) {
      throw new HttpError(400, `ข้อความแชตยาว ${m.length} ตัวอักษร (YouTube จำกัด ${MAX_CHAT_LENGTH})`)
    }
  }

  return {
    fields: {
      game_title,
      title_template,
      text: String(b.text ?? '').trim(),
      description: String(b.description ?? ''),
      category_id: String(b.category_id ?? '20'),
      next_ep,
      updated_at: new Date().toISOString(),
    },
    polls,
    messages,
  }
}

function savePolls(presetId: string, polls: { question: string; options: string[] }[]) {
  db.prepare('delete from preset_polls where preset_id = ?').run(presetId)
  const insert = db.prepare('insert into preset_polls (id, preset_id, question, options, sort) values (?, ?, ?, ?, ?)')
  polls.forEach((p, sort) => insert.run(randomUUID(), presetId, p.question, JSON.stringify(p.options), sort))
}

function saveMessages(presetId: string, messages: string[]) {
  db.prepare('delete from preset_messages where preset_id = ?').run(presetId)
  const insert = db.prepare('insert into preset_messages (id, preset_id, text, sort) values (?, ?, ?, ?)')
  messages.forEach((text, sort) => insert.run(randomUUID(), presetId, text, sort))
}

function withChildren(row: PresetRow): Preset {
  const polls = db.prepare('select * from preset_polls where preset_id = ? order by sort').all(row.id) as {
    id: string
    question: string
    options: string
    sort: number
  }[]
  const preset_messages = db
    .prepare('select * from preset_messages where preset_id = ? order by sort')
    .all(row.id) as Preset['preset_messages']
  return {
    ...row,
    preset_polls: polls.map((p) => ({ ...p, options: JSON.parse(p.options) as string[] })),
    preset_messages,
  }
}

function toResponse(p: Preset) {
  const { preset_polls, preset_messages, account_id, thumbnail_path, ...rest } = p
  return {
    ...rest,
    // ?v= เปลี่ยนทุกครั้งที่อัปโหลดภาพใหม่ เบราว์เซอร์จึงไม่ใช้ภาพเก่าจาก cache
    thumbnail_url: thumbnail_path ? `/api/presets/${p.id}/thumbnail?v=${Date.parse(p.updated_at)}` : null,
    polls: preset_polls.map(({ id, question, options }) => ({ id, question, options })),
    messages: preset_messages.map(({ id, text }) => ({ id, text })),
  }
}

export function getPreset(account: Account, id: string): Preset {
  const row = db.prepare('select * from presets where id = ? and account_id = ?').get(id, account.id) as
    | PresetRow
    | undefined
  if (!row) throw new HttpError(404, 'ไม่พบ preset นี้')
  return withChildren(row)
}

export async function presetRoutes(app: FastifyInstance) {
  app.get('/api/presets', async (req) => {
    const rows = db
      .prepare('select * from presets where account_id = ? order by game_title collate nocase')
      .all(req.account.id) as PresetRow[]
    return rows.map((r) => toResponse(withChildren(r)))
  })

  app.post('/api/presets', async (req) => {
    const { fields, polls, messages } = parseBody(req.body)
    const id = randomUUID()
    db.transaction(() => {
      db.prepare(
        `insert into presets (id, account_id, game_title, title_template, text, description, category_id, next_ep, updated_at)
         values (@id, @account_id, @game_title, @title_template, @text, @description, @category_id, @next_ep, @updated_at)`,
      ).run({ ...fields, id, account_id: req.account.id })
      savePolls(id, polls)
      saveMessages(id, messages)
    })()
    return toResponse(getPreset(req.account, id))
  })

  app.put('/api/presets/:id', async (req) => {
    const { id } = req.params as { id: string }
    getPreset(req.account, id)
    const { fields, polls, messages } = parseBody(req.body)
    db.transaction(() => {
      db.prepare(
        `update presets set game_title = @game_title, title_template = @title_template, text = @text, description = @description,
         category_id = @category_id, next_ep = @next_ep, updated_at = @updated_at where id = @id`,
      ).run({ ...fields, id })
      savePolls(id, polls)
      saveMessages(id, messages)
    })()
    return toResponse(getPreset(req.account, id))
  })

  app.post('/api/presets/:id/duplicate', async (req) => {
    const { id } = req.params as { id: string }
    const src = getPreset(req.account, id)
    const copyId = randomUUID()

    let thumbnail_path: string | null = null
    if (src.thumbnail_path) {
      thumbnail_path = `${copyId}.${src.thumbnail_path.split('.').pop()}`
      await copyFile(join(THUMBNAIL_DIR, src.thumbnail_path), join(THUMBNAIL_DIR, thumbnail_path))
    }

    db.transaction(() => {
      db.prepare(
        `insert into presets (id, account_id, game_title, title_template, text, description, category_id, thumbnail_path)
         values (@id, @account_id, @game_title, @title_template, @text, @description, @category_id, @thumbnail_path)`,
      ).run({
        id: copyId,
        account_id: req.account.id,
        game_title: `${src.game_title} (สำเนา)`,
        title_template: src.title_template,
        text: src.text,
        description: src.description,
        category_id: src.category_id,
        thumbnail_path,
      })
      savePolls(copyId, src.preset_polls)
      saveMessages(
        copyId,
        src.preset_messages.map((m) => m.text),
      )
    })()
    return toResponse(getPreset(req.account, copyId))
  })

  app.delete('/api/presets/:id', async (req) => {
    const { id } = req.params as { id: string }
    const preset = getPreset(req.account, id)
    db.prepare('delete from presets where id = ?').run(id)
    if (preset.thumbnail_path) await rm(join(THUMBNAIL_DIR, preset.thumbnail_path), { force: true })
    return { ok: true }
  })

  app.get('/api/presets/:id/thumbnail', async (req, reply) => {
    const { id } = req.params as { id: string }
    const preset = getPreset(req.account, id)
    if (!preset.thumbnail_path) throw new HttpError(404, 'preset นี้ยังไม่มีภาพปก')
    const bytes = await readFile(join(THUMBNAIL_DIR, preset.thumbnail_path)).catch(() => null)
    if (!bytes) throw new HttpError(404, 'ไม่พบไฟล์ภาพปก')
    // ?download=1 ให้เบราว์เซอร์บันทึกเป็นไฟล์แทนที่จะเปิดแสดง ชื่อไฟล์ต่อท้ายด้วยเวลาที่กดเพื่อไม่ให้ซ้ำกัน
    if ((req.query as { download?: string }).download) {
      const ext = preset.thumbnail_path.split('.').pop()
      const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' })
        .format(new Date())
        .replace(' ', '_')
        .replaceAll(':', '')
      const name = `${preset.game_title.replace(/[\\/:*?"<>|]/g, '_')}_${stamp}.${ext}`
      return reply
        .type(preset.thumbnail_path.endsWith('.png') ? 'image/png' : 'image/jpeg')
        .header(
          'Content-Disposition',
          `attachment; filename="thumbnail_${stamp}.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        )
        .header('Cache-Control', 'no-store')
        .send(bytes)
    }
    return reply
      .type(preset.thumbnail_path.endsWith('.png') ? 'image/png' : 'image/jpeg')
      .header('Cache-Control', 'private, max-age=3600')
      .send(bytes)
  })

  app.post('/api/presets/:id/thumbnail', async (req) => {
    const { id } = req.params as { id: string }
    const preset = getPreset(req.account, id)
    const file = await req.file()
    if (!file) throw new HttpError(400, 'ไม่พบไฟล์ภาพ')
    const ext = IMAGE_EXT[file.mimetype]
    if (!ext) throw new HttpError(400, 'ภาพปกต้องเป็น JPG หรือ PNG')
    const buf = await file.toBuffer() // เกิน 2MB จะ throw 413 จาก limit ใน server.ts

    // เขียนไฟล์ชั่วคราวแล้ว rename ทับ ภาพเดิมจึงไม่เสียถ้าเขียนไม่สำเร็จ
    const path = `${id}.${ext}`
    const tmp = join(THUMBNAIL_DIR, `${id}.tmp`)
    await writeFile(tmp, buf)
    await rename(tmp, join(THUMBNAIL_DIR, path))
    if (preset.thumbnail_path && preset.thumbnail_path !== path) {
      await rm(join(THUMBNAIL_DIR, preset.thumbnail_path), { force: true })
    }
    db.prepare('update presets set thumbnail_path = ?, updated_at = ? where id = ?').run(
      path,
      new Date().toISOString(),
      id,
    )
    return toResponse(getPreset(req.account, id))
  })
}
