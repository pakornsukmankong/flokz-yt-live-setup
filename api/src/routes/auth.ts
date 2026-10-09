import { randomBytes, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { config } from '../config.js'
import { encrypt } from '../crypto.js'
import { db, HttpError, type Account } from '../db.js'
import { authUrl, cacheAccessToken, exchangeCode, yt } from '../google.js'

const cookieOpts = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.publicUrl.startsWith('https://'),
  signed: true,
}

export async function requireAccount(req: FastifyRequest) {
  const raw = req.cookies.sid
  const sid = raw ? req.unsignCookie(raw) : null
  if (!sid?.valid || !sid.value) throw new HttpError(401, 'ยังไม่ได้เข้าสู่ระบบ')
  const account = db.prepare('select * from accounts where id = ?').get(sid.value) as Account | undefined
  if (!account) throw new HttpError(401, 'ยังไม่ได้เข้าสู่ระบบ')
  req.account = account
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/auth/login', async (_req, reply) => {
    const state = randomBytes(16).toString('hex')
    reply.setCookie('oauth_state', state, { ...cookieOpts, maxAge: 600 })
    return reply.redirect(authUrl(state))
  })

  app.get('/api/auth/callback', async (req, reply) => {
    const { code, state, error } = req.query as Record<string, string | undefined>
    const raw = req.cookies.oauth_state
    const saved = raw ? req.unsignCookie(raw) : null
    reply.clearCookie('oauth_state', { path: '/' })

    if (error) return reply.redirect('/?login_error=cancelled')
    if (!code || !state || !saved?.valid || saved.value !== state) {
      throw new HttpError(400, 'OAuth state ไม่ถูกต้อง ลอง login ใหม่อีกครั้ง')
    }

    const t = await exchangeCode(code)
    if (!t.id_token || !t.refresh_token) throw new HttpError(400, 'Google ไม่ได้ส่ง token กลับมาครบ')
    const claims = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString())
    const email = String(claims.email ?? '').toLowerCase()
    if (!claims.email_verified || !config.allowedEmails.includes(email)) {
      return reply.redirect('/?login_error=not_allowed')
    }

    const account = db
      .prepare(
        `insert into accounts (id, google_sub, email, refresh_token_enc) values (?, ?, ?, ?)
         on conflict (google_sub) do update set email = excluded.email, refresh_token_enc = excluded.refresh_token_enc
         returning *`,
      )
      .get(randomUUID(), claims.sub, email, encrypt(t.refresh_token)) as Account
    cacheAccessToken(account.id, t.access_token, t.expires_in)

    try {
      const ch = await yt(account, 'GET', '/channels', { query: { part: 'snippet', mine: 'true' } })
      const item = ch.items?.[0]
      if (item) {
        db.prepare('update accounts set channel_id = ?, channel_title = ? where id = ?').run(
          item.id,
          item.snippet.title,
          account.id,
        )
      }
    } catch (err) {
      req.log.warn(err, 'could not load channel info')
    }

    reply.setCookie('sid', account.id, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 })
    return reply.redirect('/')
  })

  app.get('/api/auth/me', { preHandler: requireAccount }, async (req) => ({
    email: req.account.email,
    channelTitle: req.account.channel_title,
  }))

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie('sid', { path: '/' })
    return { ok: true }
  })
}
