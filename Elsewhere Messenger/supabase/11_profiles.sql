-- Elsewhere Profiles v1 | run once in the Supabase SQL Editor (additive: new tables + functions only).
-- One Elsewhere identity (elsewhere_profiles) gets one profile page: a draft the owner edits and a
-- published copy visitors see. Every read goes through get_elsewhere_profile(), which decides on the
-- SERVER what each viewer may see (owner / friend / visitor / signed-out / blocked); the tables
-- themselves are closed to direct reads.

create table if not exists public.elsewhere_profile_pages (
  owner uuid primary key references public.elsewhere_profiles(id) on delete cascade,
  visibility text not null default 'public' check (visibility in ('public', 'friends', 'private')),
  guestbook text not null default 'friends' check (guestbook in ('everyone', 'friends', 'off')),
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) < 700000),
  published jsonb check (published is null or (jsonb_typeof(published) = 'object' and pg_column_size(published) < 700000)),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.elsewhere_guestbook (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade,
  author uuid not null references public.elsewhere_profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists elsewhere_guestbook_owner_idx on public.elsewhere_guestbook(owner, created_at desc);
create index if not exists elsewhere_guestbook_author_idx on public.elsewhere_guestbook(author, created_at desc);
create table if not exists public.elsewhere_bulletins (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists elsewhere_bulletins_owner_idx on public.elsewhere_bulletins(owner, created_at desc);

alter table public.elsewhere_profile_pages enable row level security;
alter table public.elsewhere_guestbook enable row level security;
alter table public.elsewhere_bulletins enable row level security;
revoke all on public.elsewhere_profile_pages, public.elsewhere_guestbook, public.elsewhere_bulletins from anon, authenticated;

create schema if not exists elsewhere_internal;

-- What a viewer may see of an owner's profile: owner | friend | visitor | locked | none (blocked).
create or replace function elsewhere_internal.profile_access(viewer uuid, target uuid)
returns text language plpgsql stable security definer set search_path to '' as $$
declare page_visibility text;
begin
  if viewer is not null and viewer = target then return 'owner'; end if;
  if viewer is not null and elsewhere_internal.blocked(viewer, target) then return 'none'; end if;
  select visibility into page_visibility from public.elsewhere_profile_pages where owner = target;
  if page_visibility is null then page_visibility := 'public'; end if;
  if viewer is not null and elsewhere_internal.friends(viewer, target) then
    return case when page_visibility = 'private' then 'locked' else 'friend' end;
  end if;
  return case when page_visibility = 'public' then 'visitor' else 'locked' end;
end $$;

-- The one read path for profiles (app and web). Returns only what this viewer is allowed to see.
create or replace function public.get_elsewhere_profile(target_handle text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  me uuid := auth.uid();
  person public.elsewhere_profiles;
  page public.elsewhere_profile_pages;
  access text;
  doc jsonb;
  friends_json jsonb := '[]'::jsonb;
  book jsonb := '[]'::jsonb;
  posts jsonb := '[]'::jsonb;
  may_sign boolean := false;
begin
  select * into person from public.elsewhere_profiles where handle = lower(btrim(target_handle));
  if person.id is null then return jsonb_build_object('status', 'missing'); end if;
  access := elsewhere_internal.profile_access(me, person.id);
  if access = 'none' then return jsonb_build_object('status', 'missing'); end if;
  select * into page from public.elsewhere_profile_pages where owner = person.id;
  if access = 'locked' then
    return jsonb_build_object('status', 'locked', 'handle', person.handle, 'display_name', person.display_name,
      'card', coalesce(page.published -> 'privateCard', '{}'::jsonb), 'signed_in', me is not null);
  end if;
  doc := coalesce(page.published, '{}'::jsonb);

  -- Top Friends: only people who are still mutual friends, in the owner's chosen order (max 12).
  select coalesce(jsonb_agg(jsonb_build_object('handle', p.handle, 'display_name', p.display_name) order by t.ord), '[]'::jsonb)
    into friends_json
    from jsonb_array_elements_text(coalesce(doc -> 'topFriends', '[]'::jsonb)) with ordinality as t(id, ord)
    join public.elsewhere_profiles p on p.id::text = t.id
    where t.ord <= 12 and elsewhere_internal.friends(person.id, p.id)
      and (me is null or not elsewhere_internal.blocked(me, p.id));

  if coalesce(page.guestbook, 'friends') <> 'off' then
    select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'body', g.body, 'created_at', g.created_at,
        'handle', a.handle, 'display_name', a.display_name, 'mine', g.author = me) order by g.created_at desc), '[]'::jsonb)
      into book
      from (select * from public.elsewhere_guestbook where owner = person.id and not hidden order by created_at desc limit 50) g
      join public.elsewhere_profiles a on a.id = g.author
      where me is null or not elsewhere_internal.blocked(me, g.author);
    may_sign := me is not null and (access = 'owner' or coalesce(page.guestbook, 'friends') = 'everyone' or access = 'friend');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'body', b.body, 'created_at', b.created_at) order by b.created_at desc), '[]'::jsonb)
    into posts
    from (select * from public.elsewhere_bulletins where owner = person.id order by created_at desc limit 20) b;

  return jsonb_build_object('status', 'ok', 'access', access, 'id', case when me is null then null else person.id end,
    'handle', person.handle, 'display_name', person.display_name, 'doc', doc, 'published', page.published is not null,
    'published_at', page.published_at, 'top_friends', friends_json, 'guestbook', book,
    'guestbook_mode', coalesce(page.guestbook, 'friends'), 'can_sign', may_sign, 'bulletins', posts, 'signed_in', me is not null);
end $$;

-- The owner's own editing data: draft, settings and their friends (for picking Top Friends).
create or replace function public.get_my_elsewhere_profile()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare me uuid := auth.uid(); person public.elsewhere_profiles; page public.elsewhere_profile_pages; pals jsonb;
begin
  if me is null then raise exception 'Sign in to edit your profile.'; end if;
  select * into person from public.elsewhere_profiles where id = me;
  if person.id is null then raise exception 'Pick your @handle in Messenger first.'; end if;
  select * into page from public.elsewhere_profile_pages where owner = me;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle, 'display_name', p.display_name) order by p.display_name), '[]'::jsonb)
    into pals from public.elsewhere_profiles p where elsewhere_internal.friends(me, p.id);
  return jsonb_build_object('handle', person.handle, 'display_name', person.display_name,
    'visibility', coalesce(page.visibility, 'public'), 'guestbook', coalesce(page.guestbook, 'friends'),
    'draft', coalesce(page.draft, '{}'::jsonb), 'published', page.published, 'published_at', page.published_at, 'friends', pals);
end $$;

-- Saves the draft (and settings). Publishing copies the draft to the live page; drafts never go live by themselves.
create or replace function public.save_elsewhere_profile(doc jsonb, page_visibility text, guestbook_mode text, publish boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in to save your profile.'; end if;
  if not exists (select 1 from public.elsewhere_profiles where id = me) then raise exception 'Pick your @handle in Messenger first.'; end if;
  if doc is null or jsonb_typeof(doc) <> 'object' then raise exception 'Profile data is not valid.'; end if;
  insert into public.elsewhere_profile_pages as p (owner, visibility, guestbook, draft, published, published_at, updated_at)
    values (me, page_visibility, guestbook_mode, doc, case when publish then doc end, case when publish then now() end, now())
  on conflict (owner) do update set visibility = excluded.visibility, guestbook = excluded.guestbook, draft = excluded.draft,
    published = case when publish then excluded.draft else p.published end,
    published_at = case when publish then now() else p.published_at end, updated_at = now();
  return jsonb_build_object('saved', true, 'published', publish);
end $$;

create or replace function public.unpublish_elsewhere_profile()
returns void language sql security definer set search_path to '' as $$
  update public.elsewhere_profile_pages set published = null, published_at = null where owner = auth.uid();
$$;

create or replace function public.sign_elsewhere_guestbook(target_handle text, body text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); target uuid; access text; mode text; new_id uuid;
begin
  if me is null then raise exception 'Sign in to sign a guestbook.'; end if;
  select id into target from public.elsewhere_profiles where handle = lower(btrim(target_handle));
  if target is null then raise exception 'That profile isn''t available.'; end if;
  access := elsewhere_internal.profile_access(me, target);
  select coalesce(guestbook, 'friends') into mode from public.elsewhere_profile_pages where owner = target;
  mode := coalesce(mode, 'friends');
  if access not in ('owner', 'friend', 'visitor') or mode = 'off' or (mode = 'friends' and access not in ('owner', 'friend')) then
    raise exception 'This guestbook isn''t open to you.';
  end if;
  if (select count(*) from public.elsewhere_guestbook where author = me and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'You''re signing guestbooks a little fast. Try again in a few minutes.';
  end if;
  insert into public.elsewhere_guestbook(owner, author, body) values (target, me, left(btrim(body), 1000)) returning id into new_id;
  return new_id;
end $$;

-- The profile owner or the entry's author can remove a guestbook entry.
create or replace function public.remove_elsewhere_guestbook_entry(entry uuid)
returns void language sql security definer set search_path to '' as $$
  update public.elsewhere_guestbook set hidden = true where id = entry and (owner = auth.uid() or author = auth.uid());
$$;

create or replace function public.post_elsewhere_bulletin(body text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then raise exception 'Sign in to post a bulletin.'; end if;
  if (select count(*) from public.elsewhere_bulletins where owner = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'That''s a lot of bulletins! Try again a little later.';
  end if;
  insert into public.elsewhere_bulletins(owner, body) values (me, left(btrim(body), 2000)) returning id into new_id;
  return new_id;
end $$;

create or replace function public.delete_elsewhere_bulletin(entry uuid)
returns void language sql security definer set search_path to '' as $$
  delete from public.elsewhere_bulletins where id = entry and owner = auth.uid();
$$;

revoke all on function elsewhere_internal.profile_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_elsewhere_profile(text), public.get_my_elsewhere_profile(), public.save_elsewhere_profile(jsonb, text, text, boolean),
  public.unpublish_elsewhere_profile(), public.sign_elsewhere_guestbook(text, text), public.remove_elsewhere_guestbook_entry(uuid),
  public.post_elsewhere_bulletin(text), public.delete_elsewhere_bulletin(uuid) from public;
grant execute on function public.get_elsewhere_profile(text) to anon, authenticated;
grant execute on function public.get_my_elsewhere_profile(), public.save_elsewhere_profile(jsonb, text, text, boolean), public.unpublish_elsewhere_profile(),
  public.sign_elsewhere_guestbook(text, text), public.remove_elsewhere_guestbook_entry(uuid),
  public.post_elsewhere_bulletin(text), public.delete_elsewhere_bulletin(uuid) to authenticated;
