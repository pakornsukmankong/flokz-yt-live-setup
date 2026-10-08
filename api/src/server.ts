import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { config } from './config.js'
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
