export type Poll = { id?: string; question: string; options: string[] }

export type Preset = {
  id: string
  game_title: string
  title_template: string
  text: string
  description: string
  category_id: string
  next_ep: number
  thumbnail_url: string | null
  polls: Poll[]
}

export type Broadcast = { id: string; title: string; status: 'active' | 'upcoming'; thumbnail: string | null }
export type Category = { id: string; title: string }
export type Me = { email: string; channelTitle: string | null; facebook: boolean }

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, opts: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.json !== undefined || opts.form ? 'POST' : 'GET'),
    headers: opts.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.form,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.message ?? res.statusText)
  return data as T
}

export function renderTemplate(tpl: string, p: { game_title: string; next_ep: number; text: string }): string {
  return tpl.replaceAll('{game}', p.game_title).replaceAll('{ep}', String(p.next_ep)).replaceAll('{text}', p.text)
}
