import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export const THUMBNAIL_BUCKET = 'thumbnails'

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new HttpError(500, `Database: ${res.error.message}`)
  return res.data as T
}

export type Account = {
  id: string
  email: string
  channel_id: string | null
  channel_title: string | null
  refresh_token_enc: string
}

declare module 'fastify' {
  interface FastifyRequest {
    account: Account
  }
}
