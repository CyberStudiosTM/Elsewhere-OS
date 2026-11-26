-- Elsewhere Profiles · native widgets (polls + visitor counter) | run once after 11_profiles.sql (additive).
-- Shared widget state lives only here, behind narrow functions that use the same privacy rules as profiles
-- (elsewhere_internal.profile_access). Community/sandboxed widgets never get database access.

create table if not exists public.elsewhere_polls (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 200),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  created_at timestamptz not null default now()
);
create index if not exists elsewhere_polls_owner_idx on public.elsewhere_polls(owner, created_at desc);
create table if not exists public.elsewhere_poll_votes (
  poll uuid not null references public.elsewhere_polls(id) on delete cascade,
  voter uuid not null references public.elsewhere_profiles(id) on delete cascade,
  choice int not null check (choice between 0 and 7),
  voted_at timestamptz not null default now(),
  primary key (poll, voter)
);
create table if not exists public.elsewhere_profile_views (
  owner uuid primary key references public.elsewhere_profiles(id) on delete cascade,
  total bigint not null default 0,
  last_anon_at timestamptz
);
create table if not exists public.elsewhere_profile_viewers (
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade,
  viewer uuid not null references public.elsewhere_profiles(id) on delete cascade,
  day date not null default current_date,
  primary key (owner, viewer, day)
);
alter table public.elsewhere_polls enable row level security;
alter table public.elsewhere_poll_votes enable row level security;
alter table public.elsewhere_profile_views enable row level security;
alter table public.elsewhere_profile_viewers enable row level security;
revoke all on public.elsewhere_polls, public.elsewhere_poll_votes, public.elsewhere_profile_views, public.elsewhere_profile_viewers from anon, authenticated;

-- Owner: make a poll for their profile (up to 30 polls).
create or replace function public.create_elsewhere_poll(question text, options jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); clean jsonb; new_id uuid;
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  if not exists (select 1 from public.elsewhere_profiles where id = me) then raise exception 'Pick your @handle in Messenger first.'; end if;
  if (select count(*) from public.elsewhere_polls where owner = me) >= 30 then raise exception 'You have 30 polls already. Delete one first.'; end if;
  select coalesce(jsonb_agg(left(btrim(o), 60)), '[]'::jsonb) into clean
    from jsonb_array_elements_text(case when jsonb_typeof(options) = 'array' then options else '[]'::jsonb end) as t(o) where btrim(o) <> '';
  if jsonb_array_length(clean) < 2 or jsonb_array_length(clean) > 8 then raise exception 'A poll needs 2 to 8 answers.'; end if;
  insert into public.elsewhere_polls(owner, question, options) values (me, left(btrim(question), 200), clean) returning id into new_id;
  return new_id;
end $$;

-- Anyone allowed to see the owner's profile: the poll, its totals, and their own vote.
create or replace function public.get_elsewhere_poll(poll_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare me uuid := auth.uid(); p public.elsewhere_polls; access text; counts jsonb; mine int;
begin
  select * into p from public.elsewhere_polls where id = poll_id;
  if p.id is null then return jsonb_build_object('status', 'missing'); end if;
  access := elsewhere_internal.profile_access(me, p.owner);
  if access in ('none', 'locked') then return jsonb_build_object('status', 'missing'); end if;
  select coalesce(jsonb_object_agg(choice::text, n), '{}'::jsonb) into counts from (select choice, count(*) n from public.elsewhere_poll_votes where poll = p.id group by choice) c;
  if me is not null then select choice into mine from public.elsewhere_poll_votes where poll = p.id and voter = me; end if;
  return jsonb_build_object('status', 'ok', 'question', p.question, 'options', p.options, 'counts', counts, 'mine', mine, 'can_vote', me is not null);
end $$;

-- Signed-in visitors with access: vote once (changing your vote is allowed).
create or replace function public.vote_elsewhere_poll(poll_id uuid, choice int)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); p public.elsewhere_polls;
begin
  if me is null then raise exception 'Sign in to Elsewhere to vote.'; end if;
  select * into p from public.elsewhere_polls where id = poll_id;
  if p.id is null or elsewhere_internal.profile_access(me, p.owner) in ('none', 'locked') then raise exception 'That poll isn''t available.'; end if;
  if choice < 0 or choice >= jsonb_array_length(p.options) then raise exception 'Pick one of the answers.'; end if;
  insert into public.elsewhere_poll_votes(poll, voter, choice) values (p.id, me, choice)
    on conflict (poll, voter) do update set choice = excluded.choice, voted_at = now();
  return public.get_elsewhere_poll(p.id);
end $$;

create or replace function public.delete_elsewhere_poll(poll_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  delete from public.elsewhere_polls where id = poll_id and owner = auth.uid();
end $$;

-- Visitor counter: counts a view and returns the total. Signed-in viewers count once a day; signed-out
-- views count at most once every 5 seconds per profile so the number can't be spammed upward quickly.
create or replace function public.count_elsewhere_profile_view(target_handle text)
returns bigint language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); target uuid; access text; result bigint;
begin
  select id into target from public.elsewhere_profiles where handle = lower(btrim(target_handle));
  if target is null then return null; end if;
  access := elsewhere_internal.profile_access(me, target);
  if access in ('none', 'locked') then return null; end if;
  insert into public.elsewhere_profile_views(owner) values (target) on conflict (owner) do nothing;
  if me is not null and me <> target then
    insert into public.elsewhere_profile_viewers(owner, viewer) values (target, me) on conflict do nothing;
    if found then update public.elsewhere_profile_views set total = total + 1 where owner = target; end if;
  elsif me is null then
    update public.elsewhere_profile_views set total = total + 1, last_anon_at = now()
      where owner = target and (last_anon_at is null or last_anon_at < now() - interval '5 seconds');
  end if;
  select total into result from public.elsewhere_profile_views where owner = target;
  return result;
end $$;

revoke all on function public.create_elsewhere_poll(text, jsonb), public.get_elsewhere_poll(uuid), public.vote_elsewhere_poll(uuid, int),
  public.delete_elsewhere_poll(uuid), public.count_elsewhere_profile_view(text) from public;
grant execute on function public.create_elsewhere_poll(text, jsonb), public.vote_elsewhere_poll(uuid, int), public.delete_elsewhere_poll(uuid) to authenticated;
grant execute on function public.get_elsewhere_poll(uuid), public.count_elsewhere_profile_view(text) to anon, authenticated;
