import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { config } from './config.js'
import { db } from './db.js'
import { authRoutes, requireAccount } from './routes/auth.js'
import { liveRoutes } from './routes/live.js'
import { presetRoutes } from './routes/presets.js'

const app = Fastify({ logger: true, trustProxy: true })

await app.register(cookie, { secret: config.cookieSecret })
// YouTube รับภาพปกไม่เกิน 2MB
await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } })

app.get('/api/health', async () => ({ ok: true }))
await app.register(authRoutes)
await app.register(async (scope) => {
  scope.addHook('preHandler', requireAccount)
  await scope.register(presetRoutes)
  await scope.register(liveRoutes)
})

await app.listen({ port: config.port, host: '0.0.0.0' })

// Railway ส่ง SIGTERM ให้ deployment เก่าทุกครั้งที่ deploy ใหม่ ถ้า process ออกด้วยโค้ดที่ไม่ใช่ 0
// จะถูกนับว่า crash และส่งอีเมลแจ้ง จึงปิดเซิร์ฟเวอร์และฐานข้อมูลให้เรียบร้อยแล้วออกด้วย 0
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`)
    setTimeout(() => process.exit(0), 5000).unref()
    await app.close().catch((err) => app.log.error(err))
    db.close()
    process.exit(0)
  })
}
