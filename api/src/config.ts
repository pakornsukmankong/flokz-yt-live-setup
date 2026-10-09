function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

// บน Railway ถ้าไม่ผูก Volume ไฟล์ฐานข้อมูลและภาพปกจะหายทุกครั้งที่ deploy
const dataDir = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || './data'
if (process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  throw new Error('ยังไม่ได้ผูก Volume ให้ service นี้บน Railway (ข้อมูลจะหายเมื่อ deploy ใหม่)')
}

// ไม่บังคับ: ถ้าไม่ใส่ ปุ่มโพสต์ลงเพจ Facebook จะถูกปิด
const facebook =
  process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN
    ? { pageId: process.env.FB_PAGE_ID, pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN }
    : null

export const config = {
  port: Number(process.env.PORT ?? 3001),
  publicUrl: req('PUBLIC_URL').replace(/\/$/, ''),
  googleClientId: req('GOOGLE_CLIENT_ID'),
  googleClientSecret: req('GOOGLE_CLIENT_SECRET'),
  allowedEmails: req('ALLOWED_EMAILS')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  dataDir,
  facebook,
  cookieSecret: req('COOKIE_SECRET'),
  tokenEncKey: req('TOKEN_ENC_KEY'),
  regionCode: process.env.REGION_CODE ?? 'TH',
}
