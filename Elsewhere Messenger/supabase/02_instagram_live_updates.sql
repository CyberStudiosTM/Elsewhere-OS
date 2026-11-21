-- Elsewhere Messenger: instant Instagram updates | run once in the Supabase SQL Editor.
-- Meta's webhook tells Elsewhere *that* an Instagram account got a message. No message text is stored here;
-- the app fetches the conversation itself from Meta. Only the server functions (service key) can write.

-- Which Elsewhere account connected which Instagram account (written by elsewhere-instagram-auth).
create table if not exists public.elsewhere_instagram_links (
  ig_account_id text not null check (ig_account_id ~ '^[0-9]{6,30}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (ig_account_id, user_id)
);

-- Short-lived "something changed" signals (written by elsewhere-instagram-webhook, kept about a day).
create table if not exists public.elsewhere_instagram_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ig_account_id text not null,
  sender_id text,
  event_at timestamptz not null default now()
);
create index if not exists elsewhere_instagram_activity_user_idx on public.elsewhere_instagram_activity(user_id, event_at);

alter table public.elsewhere_instagram_links enable row level security;
alter table public.elsewhere_instagram_activity enable row level security;
revoke all on public.elsewhere_instagram_links from anon, authenticated;
revoke all on public.elsewhere_instagram_activity from anon, authenticated;
grant select on public.elsewhere_instagram_links to authenticated;
grant select on public.elsewhere_instagram_activity to authenticated;

drop policy if exists "instagram_links_read_own" on public.elsewhere_instagram_links;
create policy "instagram_links_read_own" on public.elsewhere_instagram_links
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "instagram_activity_read_own" on public.elsewhere_instagram_activity;
create policy "instagram_activity_read_own" on public.elsewhere_instagram_activity
  for select to authenticated using (user_id = (select auth.uid()));

-- Live delivery to the signed-in app (Postgres Changes respects the read policy above).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='elsewhere_instagram_activity') then
    alter publication supabase_realtime add table public.elsewhere_instagram_activity;
  end if;
end $$;
