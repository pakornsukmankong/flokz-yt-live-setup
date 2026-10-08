function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  publicUrl: req('PUBLIC_URL').replace(/\/$/, ''),
  googleClientId: req('GOOGLE_CLIENT_ID'),
  googleClientSecret: req('GOOGLE_CLIENT_SECRET'),
  allowedEmails: req('ALLOWED_EMAILS')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  supabaseUrl: req('SUPABASE_URL'),
  supabaseServiceKey: req('SUPABASE_SERVICE_ROLE_KEY'),
  cookieSecret: req('COOKIE_SECRET'),
  tokenEncKey: req('TOKEN_ENC_KEY'),
  regionCode: process.env.REGION_CODE ?? 'TH',
}
