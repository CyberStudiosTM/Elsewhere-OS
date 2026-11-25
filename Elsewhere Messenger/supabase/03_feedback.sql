-- Beta feedback from Help -> Send Feedback. Signed-in people can add their own
-- feedback but can't read anyone's (read it in the Supabase Table Editor).
create table if not exists public.elsewhere_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'idea', 'other')),
  body text not null check (char_length(body) between 1 and 4000),
  app_version text check (char_length(app_version) <= 40),
  skin text check (char_length(skin) <= 40),
  created_at timestamptz not null default now()
);

alter table public.elsewhere_feedback enable row level security;

drop policy if exists "Add own feedback" on public.elsewhere_feedback;
create policy "Add own feedback" on public.elsewhere_feedback
  for insert to authenticated
  with check (user_id = auth.uid());

revoke all on public.elsewhere_feedback from anon, authenticated;
grant insert (category, body, app_version, skin) on public.elsewhere_feedback to authenticated;
