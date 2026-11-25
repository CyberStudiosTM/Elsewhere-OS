-- Instagram beta tester requests. Until Meta approves the app, only people with a role on
-- the Meta app (Tester) can connect Instagram. People ask here; the owner adds them in Meta.
create table if not exists public.elsewhere_tester_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  facebook_profile text not null check (char_length(facebook_profile) between 3 and 300),
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'added', 'declined')),
  created_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.elsewhere_tester_requests enable row level security;

drop policy if exists "See own tester request" on public.elsewhere_tester_requests;
create policy "See own tester request" on public.elsewhere_tester_requests
  for select to authenticated using (user_id = auth.uid());

revoke all on public.elsewhere_tester_requests from anon, authenticated;
grant select (id, facebook_profile, status, created_at) on public.elsewhere_tester_requests to authenticated;
-- Inserts go through the elsewhere-tester-request function, which also emails the owner.
