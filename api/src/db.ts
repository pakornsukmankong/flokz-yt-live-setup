import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { config } from './config.js'

export const THUMBNAIL_DIR = join(config.dataDir, 'thumbnails')
mkdirSync(THUMBNAIL_DIR, { recursive: true })

export const db = new Database(join(config.dataDir, 'app.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  create table if not exists accounts (
    id text primary key,
    google_sub text not null unique,
    email text not null,
    channel_id text,
    channel_title text,
    refresh_token_enc text not null,
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  create table if not exists presets (
    id text primary key,
    account_id text not null references accounts(id) on delete cascade,
    game_title text not null,
    title_template text not null default '{game}',
    description text not null default '',
    category_id text not null default '20',
    next_ep integer not null default 1,
    thumbnail_path text,
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- options เก็บเป็น JSON array ของ string
  create table if not exists preset_polls (
    id text primary key,
    preset_id text not null references presets(id) on delete cascade,
    question text not null,
    options text not null,
    sort integer not null default 0
  );
`)

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
  }
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
