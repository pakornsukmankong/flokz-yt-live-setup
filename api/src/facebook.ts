import { config } from './config.js'
import { HttpError } from './db.js'

const GRAPH = 'https://graph.facebook.com/v25.0'

async function graph(path: string, body: FormData): Promise<any> {
  body.set('access_token', config.facebook!.pageAccessToken)
  const res = await fetch(`${GRAPH}${path}`, { method: 'POST', body })
  const data: any = await res.json().catch(() => null)
  if (!res.ok || data?.error) {
    throw new HttpError(502, `Facebook: ${data?.error?.message ?? res.statusText}`)
  }
  return data
}

// โพสต์ลงเพจ (เป็นรูปถ้ามีภาพปก) แล้วคอมเมนต์ลิงก์ใต้โพสต์ในชื่อเพจ
export async function postToPage(opts: {
  message: string
  image: { bytes: Uint8Array<ArrayBuffer>; type: string } | null
  comment: string
}) {
  const { pageId } = config.facebook!
  const form = new FormData()
  let postId: string
  if (opts.image) {
    form.set('caption', opts.message)
    form.set('source', new Blob([opts.image.bytes], { type: opts.image.type }), 'thumbnail')
    const photo = await graph(`/${pageId}/photos`, form)
    postId = photo.post_id ?? photo.id
  } else {
    form.set('message', opts.message)
    postId = (await graph(`/${pageId}/feed`, form)).id
  }

  // โพสต์ขึ้นไปแล้ว ถ้าคอมเมนต์พลาดให้แจ้งเตือนแทนที่จะล้มทั้งคำสั่ง
  const warnings: string[] = []
  try {
    const comment = new FormData()
    comment.set('message', opts.comment)
    await graph(`/${postId}/comments`, comment)
  } catch (err) {
    warnings.push(`โพสต์แล้ว แต่คอมเมนต์ลิงก์ไม่สำเร็จ: ${(err as Error).message}`)
  }
  return { postUrl: `https://www.facebook.com/${postId}`, warnings }
}
