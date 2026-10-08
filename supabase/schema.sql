-- รันไฟล์นี้ใน Supabase > SQL Editor หนึ่งครั้ง

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null,
  channel_id text,
  channel_title text,
  refresh_token_enc text not null,
  created_at timestamptz not null default now()
);

create table if not exists presets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  game_title text not null,
  title_template text not null default '{game}',
  description text not null default '',
  category_id text not null default '20',
  next_ep int not null default 1,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists preset_polls (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references presets(id) on delete cascade,
  question text not null,
  options text[] not null,
  sort int not null default 0
);

-- เปิด RLS โดยไม่มี policy: มีแต่ backend (service role) ที่เข้าถึงได้
alter table accounts enable row level security;
alter table presets enable row level security;
alter table preset_polls enable row level security;

insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', false)
on conflict (id) do nothing;
