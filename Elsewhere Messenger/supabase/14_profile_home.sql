-- Elsewhere Profiles · Home, discovery and webrings | run once after 11–13 (additive).
-- Home is private to its owner. Discovery only ever shows profiles that are public, published AND opted in.
-- Everything goes through narrow functions; tables stay closed to direct reads.

alter table public.elsewhere_profile_pages add column if not exists discoverable boolean not null default false;
alter table public.elsewhere_profile_pages add column if not exists tags text[] not null default '{}'::text[];

create table if not exists public.elsewhere_profile_saves (
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade,
  saved uuid not null references public.elsewhere_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, saved)
);
create table if not exists public.elsewhere_webrings (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  about text not null default '' check (char_length(about) <= 300),
  created_at timestamptz not null default now()
);
create table if not exists public.elsewhere_webring_members (
  ring uuid not null references public.elsewhere_webrings(id) on delete cascade,
  member uuid not null references public.elsewhere_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'member')),
  joined_at timestamptz not null default now(),
  primary key (ring, member)
);
alter table public.elsewhere_profile_saves enable row level security;
alter table public.elsewhere_webrings enable row level security;
alter table public.elsewhere_webring_members enable row level security;
revoke all on public.elsewhere_profile_saves, public.elsewhere_webrings, public.elsewhere_webring_members from anon, authenticated;

-- A profile visitors can find through discovery: public, published, opted in.
create or replace function elsewhere_internal.discoverable(person uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.elsewhere_profile_pages p where p.owner = person and p.visibility = 'public' and p.published is not null and p.discoverable);
$$;

-- Private Home: friends' bulletins (newest first, in pages), my new guestbook entries, saved profiles, requests, stats.
create or replace function public.get_elsewhere_home(before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare me uuid := auth.uid(); feed jsonb; book jsonb; saves jsonb; requests int; views bigint; mine record;
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) into feed from (
    select jsonb_build_object('id', b.id, 'body', b.body, 'created_at', b.created_at, 'handle', p.handle, 'display_name', p.display_name) x
    from public.elsewhere_bulletins b join public.elsewhere_profiles p on p.id = b.owner
    where b.owner <> me and elsewhere_internal.friends(me, b.owner) and elsewhere_internal.profile_access(me, b.owner) = 'friend'
      and (before is null or b.created_at < before)
    order by b.created_at desc limit 25) f;
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) into book from (
    select jsonb_build_object('id', g.id, 'body', g.body, 'created_at', g.created_at, 'handle', a.handle, 'display_name', a.display_name) x
    from public.elsewhere_guestbook g join public.elsewhere_profiles a on a.id = g.author
    where g.owner = me and not g.hidden order by g.created_at desc limit 10) gb;
  select coalesce(jsonb_agg(jsonb_build_object('handle', p.handle, 'display_name', p.display_name) order by s.created_at desc), '[]'::jsonb) into saves
    from public.elsewhere_profile_saves s join public.elsewhere_profiles p on p.id = s.saved
    where s.owner = me and elsewhere_internal.profile_access(me, s.saved) not in ('none');
  select count(*) into requests from public.elsewhere_friendships f
    where f.accepted_at is null and f.requested_by <> me and (f.user_a = me or f.user_b = me);
  select coalesce((select total from public.elsewhere_profile_views where owner = me), 0) into views;
  select p.discoverable, p.tags into mine from public.elsewhere_profile_pages p where p.owner = me;
  return jsonb_build_object('bulletins', feed, 'guestbook', book, 'saved', saves, 'requests', requests, 'views', views,
    'discoverable', coalesce(mine.discoverable, false), 'tags', to_jsonb(coalesce(mine.tags, '{}'::text[])), 'more', jsonb_array_length(feed) = 25);
end $$;

create or replace function public.set_elsewhere_profile_saved(target_handle text, keep boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  select id into target from public.elsewhere_profiles where handle = lower(btrim(target_handle));
  if target is null or target = me then return; end if;
  if keep then
    if (select count(*) from public.elsewhere_profile_saves where owner = me) >= 200 then raise exception 'You saved 200 profiles already.'; end if;
    insert into public.elsewhere_profile_saves(owner, saved) values (me, target) on conflict do nothing;
  else delete from public.elsewhere_profile_saves where owner = me and saved = target; end if;
end $$;

-- Opt in/out of discovery, with up to 8 aesthetic/interest tags.
create or replace function public.set_elsewhere_profile_discovery(discoverable boolean, tags text[])
returns void language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); clean text[];
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  select coalesce(array_agg(distinct left(lower(btrim(t)), 24)), '{}') into clean from unnest(coalesce(tags, '{}')) t where btrim(t) <> '';
  insert into public.elsewhere_profile_pages(owner, discoverable, tags) values (me, discoverable, clean[1:8])
    on conflict (owner) do update set discoverable = excluded.discoverable, tags = excluded.tags;
end $$;

-- Search only opted-in public profiles (handle, name or tag). Works signed out too.
create or replace function public.search_elsewhere_profiles(query text, tag text default null)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('handle', p.handle, 'display_name', p.display_name, 'tags', to_jsonb(pg.tags)) order by pg.published_at desc nulls last), '[]'::jsonb)
  from (select * from public.elsewhere_profiles p where elsewhere_internal.discoverable(p.id)
          and (coalesce(btrim(query), '') = '' or p.handle ilike '%' || btrim(query) || '%' or p.display_name ilike '%' || btrim(query) || '%')
        limit 40) p
  join public.elsewhere_profile_pages pg on pg.owner = p.id
  where tag is null or lower(btrim(tag)) = any(pg.tags);
$$;

create or replace function public.random_elsewhere_profile()
returns text language sql volatile security definer set search_path to '' as $$
  select p.handle from public.elsewhere_profiles p where elsewhere_internal.discoverable(p.id) order by random() limit 1;
$$;

-- Webrings: the owner approves members; navigation only lists approved members with discoverable profiles.
create or replace function public.create_elsewhere_webring(ring_name text, ring_about text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); made uuid;
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  if (select count(*) from public.elsewhere_webrings where owner = me) >= 10 then raise exception 'You can run up to 10 webrings.'; end if;
  insert into public.elsewhere_webrings(owner, name, about) values (me, left(btrim(ring_name), 60), left(coalesce(ring_about, ''), 300)) returning id into made;
  insert into public.elsewhere_webring_members(ring, member, status) values (made, me, 'member');
  return made;
end $$;

create or replace function public.join_elsewhere_webring(ring_id uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  if not exists (select 1 from public.elsewhere_webrings where id = ring_id) then raise exception 'That webring doesn''t exist.'; end if;
  insert into public.elsewhere_webring_members(ring, member) values (ring_id, me) on conflict do nothing;
  return (select status from public.elsewhere_webring_members where ring = ring_id and member = me);
end $$;

create or replace function public.leave_elsewhere_webring(ring_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  delete from public.elsewhere_webring_members m where m.ring = ring_id and m.member = auth.uid()
    and not exists (select 1 from public.elsewhere_webrings w where w.id = ring_id and w.owner = auth.uid());
end $$;

-- Owner: approve or remove a member.
create or replace function public.manage_elsewhere_webring(ring_id uuid, member_handle text, approve boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare person uuid;
begin
  if not exists (select 1 from public.elsewhere_webrings where id = ring_id and owner = auth.uid()) then raise exception 'Only the webring''s owner can do that.'; end if;
  select id into person from public.elsewhere_profiles where handle = lower(btrim(member_handle));
  if person is null or person = auth.uid() then return; end if;
  if approve then update public.elsewhere_webring_members set status = 'member' where ring = ring_id and member = person;
  else delete from public.elsewhere_webring_members where ring = ring_id and member = person; end if;
end $$;

-- My webrings (owned or joined), with pending requests for rings I own.
create or replace function public.my_elsewhere_webrings()
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'about', w.about, 'mine', w.owner = auth.uid(), 'status', m.status,
    'members', (select count(*) from public.elsewhere_webring_members x where x.ring = w.id and x.status = 'member'),
    'pending', case when w.owner = auth.uid() then (select coalesce(jsonb_agg(p.handle), '[]'::jsonb) from public.elsewhere_webring_members x join public.elsewhere_profiles p on p.id = x.member where x.ring = w.id and x.status = 'pending') else '[]'::jsonb end)
    order by w.created_at), '[]'::jsonb)
  from public.elsewhere_webrings w join public.elsewhere_webring_members m on m.ring = w.id and m.member = auth.uid();
$$;

-- Previous / Random / Next for a profile inside a ring (public: used by the webring piece on profiles).
create or replace function public.elsewhere_webring_nav(ring_id uuid, from_handle text)
returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare ring record; handles text[]; i int; n int;
begin
  select id, name into ring from public.elsewhere_webrings where id = ring_id;
  if ring.id is null then return jsonb_build_object('status', 'missing'); end if;
  select array_agg(p.handle order by m.joined_at) into handles from public.elsewhere_webring_members m join public.elsewhere_profiles p on p.id = m.member
    where m.ring = ring_id and m.status = 'member' and elsewhere_internal.discoverable(p.id);
  n := coalesce(array_length(handles, 1), 0);
  if n = 0 then return jsonb_build_object('status', 'ok', 'name', ring.name, 'members', 0); end if;
  i := coalesce(array_position(handles, lower(btrim(from_handle))), 1);
  return jsonb_build_object('status', 'ok', 'name', ring.name, 'members', n,
    'prev', handles[((i - 2 + n) % n) + 1], 'next', handles[(i % n) + 1], 'random', handles[1 + floor(random() * n)::int]);
end $$;

revoke all on function public.get_elsewhere_home(timestamptz), public.set_elsewhere_profile_saved(text, boolean), public.set_elsewhere_profile_discovery(boolean, text[]),
  public.search_elsewhere_profiles(text, text), public.random_elsewhere_profile(), public.create_elsewhere_webring(text, text), public.join_elsewhere_webring(uuid),
  public.leave_elsewhere_webring(uuid), public.manage_elsewhere_webring(uuid, text, boolean), public.my_elsewhere_webrings(), public.elsewhere_webring_nav(uuid, text) from public;
grant execute on function public.get_elsewhere_home(timestamptz), public.set_elsewhere_profile_saved(text, boolean), public.set_elsewhere_profile_discovery(boolean, text[]),
  public.create_elsewhere_webring(text, text), public.join_elsewhere_webring(uuid), public.leave_elsewhere_webring(uuid), public.manage_elsewhere_webring(uuid, text, boolean),
  public.my_elsewhere_webrings() to authenticated;
grant execute on function public.search_elsewhere_profiles(text, text), public.random_elsewhere_profile(), public.elsewhere_webring_nav(uuid, text) to anon, authenticated;
revoke all on function elsewhere_internal.discoverable(uuid) from public, anon, authenticated;
