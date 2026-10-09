import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { db, HttpError, THUMBNAIL_DIR, type Account } from '../db.js'
import { postToPage } from '../facebook.js'
import { setThumbnail, yt } from '../google.js'
import { getPreset, type Preset } from './presets.js'

function render(tpl: string, preset: Preset, ep: number): string {
  return tpl.replaceAll('{game}', preset.game_title).replaceAll('{ep}', String(ep)).replaceAll('{text}', preset.text)
}

async function listBroadcasts(account: Account, broadcastStatus: 'active' | 'upcoming') {
  const res = await yt(account, 'GET', '/liveBroadcasts', {
    query: { part: 'id,snippet', broadcastStatus, broadcastType: 'all', maxResults: '25' },
  })
  return (res.items ?? []).map((b: any) => ({
    id: b.id as string,
    title: b.snippet.title as string,
    status: broadcastStatus,
    thumbnail: (b.snippet.thumbnails?.medium?.url ?? null) as string | null,
  }))
}

let categoryCache: { id: string; title: string }[] | null = null

export async function liveRoutes(app: FastifyInstance) {
  app.get('/api/live/broadcasts', async (req) => {
    const [active, upcoming] = await Promise.all([
      listBroadcasts(req.account, 'active'),
      listBroadcasts(req.account, 'upcoming'),
    ])
    return [...active, ...upcoming]
  })

  app.get('/api/live/categories', async (req) => {
    if (!categoryCache) {
      const res = await yt(req.account, 'GET', '/videoCategories', {
        query: { part: 'snippet', regionCode: config.regionCode },
      })
      categoryCache = (res.items ?? [])
        .filter((c: any) => c.snippet.assignable)
        .map((c: any) => ({ id: c.id, title: c.snippet.title }))
    }
    return categoryCache
  })

  app.post('/api/live/apply', async (req) => {
    const { presetId, broadcastId, ep: epIn } = req.body as { presetId: string; broadcastId: string; ep?: number }
    if (!presetId || !broadcastId) throw new HttpError(400, 'ต้องเลือก preset และไลฟ์')
    const preset = getPreset(req.account, presetId)
    const ep = Number.isInteger(epIn) && epIn! > 0 ? epIn! : preset.next_ep

    const title = render(preset.title_template, preset, ep)
    if (title.length > 100) throw new HttpError(400, `ชื่อคลิปยาว ${title.length} ตัวอักษร (YouTube จำกัด 100)`)
    if (/[<>]/.test(title)) throw new HttpError(400, 'ชื่อคลิปห้ามมี < หรือ >')

    await yt(req.account, 'PUT', '/videos', {
      query: { part: 'snippet' },
      body: {
        id: broadcastId,
        snippet: {
          title,
          description: render(preset.description, preset, ep),
          categoryId: preset.category_id,
          tags: [preset.game_title],
        },
      },
    })

    // ชื่อ/description อัปเดตไปแล้ว ถ้าภาพปกพลาดให้แจ้งเตือนแทนที่จะล้มทั้งคำสั่ง
    const warnings: string[] = []
    if (preset.thumbnail_path) {
      try {
        const bytes = await readFile(join(THUMBNAIL_DIR, preset.thumbnail_path))
        const type = preset.thumbnail_path.endsWith('.png') ? 'image/png' : 'image/jpeg'
        await setThumbnail(req.account, broadcastId, bytes, type)
      } catch (err) {
        warnings.push(`ตั้งภาพปกไม่สำเร็จ: ${(err as Error).message}`)
      }
    }

    if (preset.title_template.includes('{ep}')) {
      db.prepare('update presets set next_ep = ? where id = ?').run(ep + 1, preset.id)
    }

    return {
      title,
      warnings,
      gameTitle: preset.game_title,
      studioUrl: `https://studio.youtube.com/video/${broadcastId}/livestreaming`,
    }
  })

  app.post('/api/live/facebook', async (req) => {
    const { presetId, broadcastId } = req.body as { presetId: string; broadcastId: string }
    if (!presetId || !broadcastId) throw new HttpError(400, 'ต้องเลือก preset และไลฟ์')
    if (!config.facebook) throw new HttpError(400, 'ยังไม่ได้ตั้งค่า Facebook บน server')
    const preset = getPreset(req.account, presetId)

    // ใช้ชื่อคลิปที่อยู่บน YouTube จริง ณ ตอนนี้ จึงตรงกับไลฟ์เสมอแม้เลข EP ของ preset จะเดินไปแล้ว
    const b = await yt(req.account, 'GET', '/liveBroadcasts', { query: { part: 'snippet', id: broadcastId } })
    const title = b.items?.[0]?.snippet?.title as string | undefined
    if (!title) throw new HttpError(404, 'ไม่พบไลฟ์นี้บน YouTube')

    const image = preset.thumbnail_path
      ? {
          bytes: await readFile(join(THUMBNAIL_DIR, preset.thumbnail_path)),
          type: preset.thumbnail_path.endsWith('.png') ? 'image/png' : 'image/jpeg',
        }
      : null
    return postToPage({ message: title, image, comment: `https://youtu.be/${broadcastId}` })
  })

  app.post('/api/live/poll', async (req) => {
    const { presetId, pollId, broadcastId } = req.body as { presetId: string; pollId: string; broadcastId: string }
    const preset = getPreset(req.account, presetId)
    const poll = preset.preset_polls.find((p) => p.id === pollId)
    if (!poll) throw new HttpError(404, 'ไม่พบ poll นี้ใน preset')

    const b = await yt(req.account, 'GET', '/liveBroadcasts', { query: { part: 'snippet', id: broadcastId } })
    const liveChatId = b.items?.[0]?.snippet?.liveChatId
    if (!liveChatId) throw new HttpError(400, 'ไลฟ์นี้ไม่มีแชตที่เปิดอยู่ จึงสร้าง poll ไม่ได้')

    const msg = await yt(req.account, 'POST', '/liveChat/messages', {
      query: { part: 'snippet' },
      body: {
        snippet: {
          liveChatId,
          type: 'pollEvent',
          pollDetails: {
            metadata: {
              questionText: poll.question,
              options: poll.options.map((optionText) => ({ optionText })),
            },
          },
        },
      },
    })
    return { messageId: msg.id as string, question: poll.question }
  })

  app.post('/api/live/poll/close', async (req) => {
    const { messageId } = req.body as { messageId: string }
    if (!messageId) throw new HttpError(400, 'ไม่มี poll ที่จะปิด')
    await yt(req.account, 'POST', '/liveChat/messages/transition', {
      query: { id: messageId, status: 'closed', part: 'snippet' },
    })
    return { ok: true }
  })
}
