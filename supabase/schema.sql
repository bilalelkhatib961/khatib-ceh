-- KHATIB CEH · Supabase schema
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.

-- 1) Completed assessments: one row per attempt, never overwritten ----------------------
create table if not exists public.attempts (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode         text not null,
  scope_key    text,
  completed_at timestamptz not null,
  score        numeric,
  data         jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists attempts_user_completed on public.attempts (user_id, completed_at);

alter table public.attempts enable row level security;
drop policy if exists "own attempts: read" on public.attempts;
drop policy if exists "own attempts: insert" on public.attempts;
create policy "own attempts: read"   on public.attempts for select to authenticated using (user_id = auth.uid());
create policy "own attempts: insert" on public.attempts for insert to authenticated with check (user_id = auth.uid());
-- no update/delete policies: completed attempts are immutable

-- 2) Small per-user records: settings, bookmarks, overrides, progress, active session ---
create table if not exists public.user_kv (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_kv enable row level security;
drop policy if exists "own kv" on public.user_kv;
create policy "own kv" on public.user_kv for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3) Question bank (private: only signed-in users can read it) --------------------------
create table if not exists public.bank_files (
  name       text primary key,       -- e.g. 'chapters', 'questions:003'
  version    text not null,
  content    jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.bank_files enable row level security;
drop policy if exists "bank: read" on public.bank_files;
drop policy if exists "bank: write" on public.bank_files;
create policy "bank: read"  on public.bank_files for select to authenticated using (true);
-- uploads come from scripts/upload-bank.mjs while signed in as you
create policy "bank: write" on public.bank_files for all to authenticated using (true) with check (true);

-- API access (needed if "Grant API access to new tables automatically" was off)
grant select, insert on public.attempts to authenticated;
grant select, insert, update, delete on public.user_kv to authenticated;
grant select, insert, update, delete on public.bank_files to authenticated;
revoke all on public.attempts, public.user_kv, public.bank_files from anon;
