-- Elsewhere Messenger: Connected Mode MVP | run once in the Supabase SQL Editor.
-- This creates database objects and RLS rules; it does not touch local IndexedDB.
create extension if not exists pgcrypto;
create table if not exists public.elsewhere_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check(handle ~ '^[a-z0-9_.]{3,30}$'),
  display_name text not null check(char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);
create table if not exists public.elsewhere_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.elsewhere_profiles(id) on delete cascade,
  recipient_id uuid not null references public.elsewhere_profiles(id) on delete cascade,
  client_id uuid not null unique,
  text_body text not null check(char_length(btrim(text_body)) between 1 and 16000),
  created_at timestamptz not null default now(),
  constraint no_self_messages check (sender_id <> recipient_id)
);
create index if not exists elsewhere_messages_sender_idx on public.elsewhere_messages(sender_id,created_at);
create index if not exists elsewhere_messages_recipient_idx on public.elsewhere_messages(recipient_id,created_at);
alter table public.elsewhere_profiles enable row level security;
alter table public.elsewhere_messages enable row level security;
-- Authenticated people can discover handles and display names, not email addresses.
revoke all on public.elsewhere_profiles from anon;
revoke all on public.elsewhere_messages from anon;
grant select, insert, update on public.elsewhere_profiles to authenticated;
grant select on public.elsewhere_messages to authenticated;
grant insert (sender_id, recipient_id, client_id, text_body) on public.elsewhere_messages to authenticated;
revoke update, delete on public.elsewhere_messages from authenticated;
drop policy if exists "profiles_discover" on public.elsewhere_profiles;
create policy "profiles_discover" on public.elsewhere_profiles for select to authenticated using(true);
drop policy if exists "profiles_insert_self" on public.elsewhere_profiles;
create policy "profiles_insert_self" on public.elsewhere_profiles for insert to authenticated with check(id = (select auth.uid()));
drop policy if exists "profiles_update_self" on public.elsewhere_profiles;
create policy "profiles_update_self" on public.elsewhere_profiles for update to authenticated using(id = (select auth.uid())) with check(id = (select auth.uid()));
drop policy if exists "messages_read_participant" on public.elsewhere_messages;
create policy "messages_read_participant" on public.elsewhere_messages for select to authenticated using(sender_id=(select auth.uid()) or recipient_id=(select auth.uid()));
drop policy if exists "messages_send_as_self" on public.elsewhere_messages;
create policy "messages_send_as_self" on public.elsewhere_messages for insert to authenticated with check(sender_id=(select auth.uid()) and recipient_id<>(select auth.uid()));
-- Supabase Postgres Changes for receiving newly saved messages.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='elsewhere_messages') then
    alter publication supabase_realtime add table public.elsewhere_messages;
  end if;
end $$;
-- Before public launch: add anti-spam / rate limits, reporting, blocking and account deletion.
-- Messages are TLS-protected in transit, but this is NOT end-to-end encryption.
