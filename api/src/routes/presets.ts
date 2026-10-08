import type { FastifyInstance } from 'fastify'
import { HttpError, must, supabase, THUMBNAIL_BUCKET, type Account } from '../db.js'

export type Preset = {
  id: string
  account_id: string
  game_title: string
  title_template: string
  description: string
  category_id: string
  next_ep: number
  thumbnail_path: string | null
  preset_polls: { id: string; question: string; options: string[]; sort: number }[]
}

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

  return {
    fields: {
      game_title,
      title_template,
      description: String(b.description ?? ''),
      category_id: String(b.category_id ?? '20'),
      next_ep,
      updated_at: new Date().toISOString(),
    },
    polls,
  }
}

async function savePolls(presetId: string, polls: { question: string; options: string[] }[]) {
  must(await supabase.from('preset_polls').delete().eq('preset_id', presetId))
  if (polls.length) {
    must(await supabase.from('preset_polls').insert(polls.map((p, sort) => ({ ...p, preset_id: presetId, sort }))))
  }
}

async function toResponse(p: Preset) {
  let thumbnail_url: string | null = null
  if (p.thumbnail_path) {
    const { data } = await supabase.storage.from(THUMBNAIL_BUCKET).createSignedUrl(p.thumbnail_path, 3600)
    thumbnail_url = data?.signedUrl ?? null
  }
  const { preset_polls, account_id, thumbnail_path, ...rest } = p
  return {
    ...rest,
    thumbnail_url,
    polls: [...preset_polls].sort((a, b) => a.sort - b.sort).map(({ id, question, options }) => ({ id, question, options })),
  }
}

export async function getPreset(account: Account, id: string): Promise<Preset> {
  const preset = must(
    await supabase.from('presets').select('*, preset_polls(*)').eq('id', id).eq('account_id', account.id).maybeSingle(),
  )
  if (!preset) throw new HttpError(404, 'ไม่พบ preset นี้')
  return preset as Preset
}

export async function presetRoutes(app: FastifyInstance) {
  app.get('/api/presets', async (req) => {
    const rows = must(
      await supabase.from('presets').select('*, preset_polls(*)').eq('account_id', req.account.id).order('game_title'),
    ) as Preset[]
    return Promise.all(rows.map(toResponse))
  })

  app.post('/api/presets', async (req) => {
    const { fields, polls } = parseBody(req.body)
    const row = must(
      await supabase.from('presets').insert({ ...fields, account_id: req.account.id }).select('id').single(),
    ) as { id: string }
    await savePolls(row.id, polls)
    return toResponse(await getPreset(req.account, row.id))
  })

  app.put('/api/presets/:id', async (req) => {
    const { id } = req.params as { id: string }
    await getPreset(req.account, id)
    const { fields, polls } = parseBody(req.body)
    must(await supabase.from('presets').update(fields).eq('id', id))
    await savePolls(id, polls)
    return toResponse(await getPreset(req.account, id))
  })

  app.delete('/api/presets/:id', async (req) => {
    const { id } = req.params as { id: string }
    const preset = await getPreset(req.account, id)
    if (preset.thumbnail_path) await supabase.storage.from(THUMBNAIL_BUCKET).remove([preset.thumbnail_path])
    must(await supabase.from('presets').delete().eq('id', id))
    return { ok: true }
  })

  app.post('/api/presets/:id/thumbnail', async (req) => {
    const { id } = req.params as { id: string }
    const preset = await getPreset(req.account, id)
    const file = await req.file()
    if (!file) throw new HttpError(400, 'ไม่พบไฟล์ภาพ')
    const ext = IMAGE_EXT[file.mimetype]
    if (!ext) throw new HttpError(400, 'ภาพปกต้องเป็น JPG หรือ PNG')
    const buf = await file.toBuffer() // เกิน 2MB จะ throw 413 จาก limit ใน server.ts

    const path = `${req.account.id}/${id}.${ext}`
    const up = await supabase.storage
      .from(THUMBNAIL_BUCKET)
      .upload(path, buf, { contentType: file.mimetype, upsert: true })
    if (up.error) throw new HttpError(500, `Storage: ${up.error.message}`)
    if (preset.thumbnail_path && preset.thumbnail_path !== path) {
      await supabase.storage.from(THUMBNAIL_BUCKET).remove([preset.thumbnail_path])
    }
    must(await supabase.from('presets').update({ thumbnail_path: path }).eq('id', id))
    return toResponse(await getPreset(req.account, id))
  })
}
