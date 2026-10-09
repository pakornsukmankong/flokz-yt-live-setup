import { config } from './config.js'
import { decrypt } from './crypto.js'
import { HttpError, type Account } from './db.js'

const YT = 'https://www.googleapis.com/youtube/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'
const SCOPES = ['openid', 'email', YOUTUBE_SCOPE]

export const redirectUri = `${config.publicUrl}/api/auth/callback`

export function authUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      ...params,
    }),
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new HttpError(401, `Google login ล้มเหลว (${data.error ?? res.status}) กรุณา login ใหม่`)
  }
  return data as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; scope?: string }
}

export function exchangeCode(code: string) {
  return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri })
}

const tokenCache = new Map<string, { token: string; exp: number }>()

export function cacheAccessToken(accountId: string, token: string, expiresIn: number) {
  tokenCache.set(accountId, { token, exp: Date.now() + (expiresIn - 60) * 1000 })
}

async function accessToken(account: Account): Promise<string> {
  const hit = tokenCache.get(account.id)
  if (hit && hit.exp > Date.now()) return hit.token
  const t = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: decrypt(account.refresh_token_enc),
  })
  cacheAccessToken(account.id, t.access_token, t.expires_in)
  return t.access_token
}

async function parse(res: Response) {
  const data: any = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = data?.error?.message ?? res.statusText
    const reason = data?.error?.errors?.[0]?.reason
    throw new HttpError(502, `YouTube: ${msg}${reason ? ` (${reason})` : ''}`)
  }
  return data
}

export async function yt(
  account: Account,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  opts: { query?: Record<string, string>; body?: unknown } = {},
): Promise<any> {
  const res = await fetch(`${YT}${path}?${new URLSearchParams(opts.query)}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken(account)}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  return parse(res)
}

export async function setThumbnail(account: Account, videoId: string, bytes: Uint8Array<ArrayBuffer>, contentType: string) {
  const q = new URLSearchParams({ videoId, uploadType: 'media' })
  const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(account)}`, 'Content-Type': contentType },
    body: bytes,
  })
  return parse(res)
}
