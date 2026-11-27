-- Elsewhere Creative Exchange + Community Showcase + Trust & moderation | run once after 11–14 (additive).
-- Free-first sharing. Resources (downloadable packages) and showcase posts (finished work to look at) are separate.
-- Every read/write goes through functions that check visibility, ownership, friendship and moderation status.

create table if not exists public.elsewhere_exchange_moderators (user_id uuid primary key references public.elsewhere_profiles(id) on delete cascade);

create table if not exists public.elsewhere_resources (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade,
  kind text not null check (kind in ('layout', 'widget', 'skin', 'decoration', 'style', 'code')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  tags text[] not null default '{}',
  license text not null default 'personal' check (license in ('personal', 'remix', 'share', 'cc-by')),
  remix boolean not null default false,
  visibility text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  status text not null default 'published' check (status in ('published', 'restricted', 'withdrawn')),
  version text not null default '1.0.0' check (char_length(version) <= 16),
  changelog text not null default '' check (char_length(changelog) <= 1000),
  package jsonb not null check (pg_column_size(package) < 650000),
  preview text not null default '' check (char_length(preview) <= 420000),
  has_code boolean not null default false,
  official boolean not null default false,
  parent uuid references public.elsewhere_resources(id) on delete set null,
  downloads bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists elsewhere_resources_list_idx on public.elsewhere_resources(kind, visibility, status, updated_at desc);
create table if not exists public.elsewhere_resource_favorites (
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade,
  resource uuid not null references public.elsewhere_resources(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (owner, resource)
);
create table if not exists public.elsewhere_showcase (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade,
  category text not null check (category in ('studio', 'skin', 'doll', 'profile', 'widget', 'wallpaper', 'treasure', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  tags text[] not null default '{}',
  image text not null check (char_length(image) between 10 and 700000),
  visibility text not null default 'public' check (visibility in ('private', 'friends', 'unlisted', 'public')),
  allow_comments boolean not null default true,
  resource uuid references public.elsewhere_resources(id) on delete set null,
  status text not null default 'published' check (status in ('published', 'restricted', 'withdrawn')),
  created_at timestamptz not null default now()
);
create index if not exists elsewhere_showcase_list_idx on public.elsewhere_showcase(category, visibility, status, created_at desc);
create table if not exists public.elsewhere_showcase_hearts (
  post uuid not null references public.elsewhere_showcase(id) on delete cascade,
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade, primary key (post, owner)
);
create table if not exists public.elsewhere_showcase_comments (
  id uuid primary key default gen_random_uuid(),
  post uuid not null references public.elsewhere_showcase(id) on delete cascade,
  author uuid not null references public.elsewhere_profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.elsewhere_exchange_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references public.elsewhere_profiles(id) on delete cascade,
  target_kind text not null check (target_kind in ('resource', 'showcase', 'comment', 'profile')),
  target_id text not null check (char_length(target_id) <= 64),
  category text not null check (category in ('malicious', 'stolen', 'impersonation', 'misleading', 'harassment', 'spam', 'privacy', 'prohibited', 'other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'received' check (status in ('received', 'under_review', 'action_taken', 'closed')),
  resolution text not null default '' check (char_length(resolution) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.elsewhere_exchange_moderators enable row level security;
alter table public.elsewhere_resources enable row level security;
alter table public.elsewhere_resource_favorites enable row level security;
alter table public.elsewhere_showcase enable row level security;
alter table public.elsewhere_showcase_hearts enable row level security;
alter table public.elsewhere_showcase_comments enable row level security;
alter table public.elsewhere_exchange_reports enable row level security;
revoke all on public.elsewhere_exchange_moderators, public.elsewhere_resources, public.elsewhere_resource_favorites, public.elsewhere_showcase,
  public.elsewhere_showcase_hearts, public.elsewhere_showcase_comments, public.elsewhere_exchange_reports from anon, authenticated;

create or replace function elsewhere_internal.moderator(person uuid)
returns boolean language sql stable security definer set search_path to '' as $$ select person is not null and exists (select 1 from public.elsewhere_exchange_moderators where user_id = person) $$;
create or replace function public.am_elsewhere_moderator()
returns boolean language sql stable security definer set search_path to '' as $$ select elsewhere_internal.moderator(auth.uid()) $$;

-- Resource card (no package), safe for lists.
create or replace function elsewhere_internal.resource_card(r public.elsewhere_resources)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', r.id, 'kind', r.kind, 'title', r.title, 'description', left(r.description, 300), 'tags', to_jsonb(r.tags), 'license', r.license,
    'remix', r.remix, 'visibility', r.visibility, 'status', r.status, 'version', r.version, 'preview', r.preview, 'has_code', r.has_code, 'official', r.official,
    'downloads', r.downloads, 'favorites', (select count(*) from public.elsewhere_resource_favorites f where f.resource = r.id), 'updated_at', r.updated_at,
    'creator', (select jsonb_build_object('handle', p.handle, 'display_name', p.display_name) from public.elsewhere_profiles p where p.id = r.owner),
    'parent', (select jsonb_build_object('id', x.id, 'title', x.title, 'creator', (select handle from public.elsewhere_profiles where id = x.owner)) from public.elsewhere_resources x where x.id = r.parent));
$$;
create or replace function elsewhere_internal.can_see_resource(r public.elsewhere_resources, me uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select r.owner = me or elsewhere_internal.moderator(me) or (r.status = 'published' and r.visibility in ('public', 'unlisted') and (me is null or not elsewhere_internal.blocked(me, r.owner)));
$$;

-- Publish or update my resource. Returns its id.
create or replace function public.save_elsewhere_resource(resource_id uuid, kind text, title text, description text, tags text[], license text, remix boolean,
  visibility text, version text, changelog text, package jsonb, preview text, parent uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); saved uuid; clean text[]; code boolean;
begin
  if me is null or not exists (select 1 from public.elsewhere_profiles where id = me) then raise exception 'Sign in to Elsewhere first.'; end if;
  select coalesce(array_agg(distinct left(lower(btrim(t)), 24)), '{}') into clean from unnest(coalesce(tags, '{}')) t where btrim(t) <> '';
  code := kind in ('widget', 'code') or package::text ~* '"(js|code)"\s*:';
  if save_elsewhere_resource.parent is not null and not exists (select 1 from public.elsewhere_resources x where x.id = save_elsewhere_resource.parent and x.remix and elsewhere_internal.can_see_resource(x, me)) then
    raise exception 'That original doesn''t allow remixes.'; end if;
  if resource_id is null then
    if (select count(*) from public.elsewhere_resources where owner = me and created_at > now() - interval '1 hour') >= 10 then raise exception 'Slow down a little: 10 new resources per hour.'; end if;
    insert into public.elsewhere_resources(owner, kind, title, description, tags, license, remix, visibility, version, changelog, package, preview, has_code, parent)
      values (me, kind, left(btrim(title), 80), left(coalesce(description, ''), 2000), clean[1:12], license, coalesce(remix, false), visibility, left(coalesce(version, '1.0.0'), 16),
        left(coalesce(changelog, ''), 1000), package, coalesce(preview, ''), code, parent) returning id into saved;
  else
    update public.elsewhere_resources set title = left(btrim(save_elsewhere_resource.title), 80), description = left(coalesce(save_elsewhere_resource.description, ''), 2000),
      tags = clean[1:12], license = save_elsewhere_resource.license, remix = coalesce(save_elsewhere_resource.remix, false), visibility = save_elsewhere_resource.visibility,
      version = left(coalesce(save_elsewhere_resource.version, '1.0.0'), 16), changelog = left(coalesce(save_elsewhere_resource.changelog, ''), 1000),
      package = save_elsewhere_resource.package, preview = coalesce(save_elsewhere_resource.preview, ''), has_code = code, updated_at = now()
      where id = resource_id and owner = me and status <> 'restricted' returning id into saved;
    if saved is null then raise exception 'You can''t change that resource.'; end if;
  end if;
  return saved;
end $$;

create or replace function public.withdraw_elsewhere_resource(resource_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin delete from public.elsewhere_resources where id = resource_id and owner = auth.uid(); end $$;

-- Browse (public only, newest/popular/favorites/alphabetical), with optional department, search and tag.
create or replace function public.list_elsewhere_resources(kind text default null, query text default null, tag text default null, sort text default 'newest', page int default 0)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(elsewhere_internal.resource_card(r) order by
      case when sort = 'downloads' then r.downloads end desc nulls last,
      case when sort = 'favorites' then (select count(*) from public.elsewhere_resource_favorites f where f.resource = r.id) end desc nulls last,
      case when sort = 'alpha' then lower(r.title) end asc nulls last,
      r.updated_at desc), '[]'::jsonb)
  from (select * from public.elsewhere_resources r
        where r.status = 'published' and r.visibility = 'public' and (list_elsewhere_resources.kind is null or r.kind = list_elsewhere_resources.kind)
          and (coalesce(btrim(query), '') = '' or r.title ilike '%' || btrim(query) || '%' or r.description ilike '%' || btrim(query) || '%')
          and (tag is null or lower(btrim(tag)) = any(r.tags))
          and (auth.uid() is null or not elsewhere_internal.blocked(auth.uid(), r.owner))
        order by r.updated_at desc limit 48 offset greatest(0, page) * 48) r;
$$;

-- One resource with its package (only if this viewer may see it).
create or replace function public.get_elsewhere_resource(resource_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r public.elsewhere_resources; me uuid := auth.uid();
begin
  select * into r from public.elsewhere_resources where id = resource_id;
  if r.id is null or not elsewhere_internal.can_see_resource(r, me) then return jsonb_build_object('missing', true); end if;
  return elsewhere_internal.resource_card(r) || jsonb_build_object('description', r.description, 'changelog', r.changelog, 'package', r.package,
    'mine', r.owner = me, 'favorite', exists (select 1 from public.elsewhere_resource_favorites f where f.resource = r.id and f.owner = me));
end $$;

-- Counts a download/install (once per call; numbers are aggregate only, never who downloaded).
create or replace function public.count_elsewhere_resource_download(resource_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin update public.elsewhere_resources set downloads = downloads + 1 where id = resource_id and status = 'published' and visibility in ('public', 'unlisted'); end $$;

create or replace function public.set_elsewhere_resource_favorite(resource_id uuid, keep boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); r public.elsewhere_resources;
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  select * into r from public.elsewhere_resources where id = resource_id;
  if r.id is null or not elsewhere_internal.can_see_resource(r, me) then raise exception 'That resource isn''t available.'; end if;
  if keep then insert into public.elsewhere_resource_favorites(owner, resource) values (me, resource_id) on conflict do nothing;
  else delete from public.elsewhere_resource_favorites where owner = me and resource = resource_id; end if;
end $$;

-- ---------- Community Showcase ----------
create or replace function elsewhere_internal.can_see_post(s public.elsewhere_showcase, me uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select s.owner = me or elsewhere_internal.moderator(me) or (s.status = 'published' and (me is null or not elsewhere_internal.blocked(me, s.owner)) and (
    s.visibility in ('public', 'unlisted') or (s.visibility = 'friends' and me is not null and elsewhere_internal.friends(me, s.owner))));
$$;
create or replace function elsewhere_internal.showcase_card(s public.elsewhere_showcase)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', s.id, 'category', s.category, 'title', s.title, 'description', s.description, 'tags', to_jsonb(s.tags), 'image', s.image,
    'visibility', s.visibility, 'allow_comments', s.allow_comments, 'status', s.status, 'created_at', s.created_at, 'resource', s.resource,
    'hearts', (select count(*) from public.elsewhere_showcase_hearts h where h.post = s.id),
    'hearted', exists (select 1 from public.elsewhere_showcase_hearts h where h.post = s.id and h.owner = auth.uid()),
    'creator', (select jsonb_build_object('handle', p.handle, 'display_name', p.display_name) from public.elsewhere_profiles p where p.id = s.owner));
$$;

create or replace function public.post_elsewhere_showcase(category text, title text, description text, tags text[], image text, visibility text, allow_comments boolean, resource uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); made uuid; clean text[];
begin
  if me is null or not exists (select 1 from public.elsewhere_profiles where id = me) then raise exception 'Sign in to Elsewhere first.'; end if;
  if (select count(*) from public.elsewhere_showcase where owner = me and created_at > now() - interval '1 hour') >= 15 then raise exception 'Slow down a little: 15 posts per hour.'; end if;
  if image !~ '^(data:image/(png|jpeg|gif|webp);base64,|https://)' then raise exception 'Showcase posts need a PNG, JPEG, GIF or WebP picture.'; end if;
  if resource is not null and not exists (select 1 from public.elsewhere_resources r where r.id = resource and r.owner = me) then raise exception 'You can only link your own resources.'; end if;
  select coalesce(array_agg(distinct left(lower(btrim(t)), 24)), '{}') into clean from unnest(coalesce(tags, '{}')) t where btrim(t) <> '';
  insert into public.elsewhere_showcase(owner, category, title, description, tags, image, visibility, allow_comments, resource)
    values (me, category, left(btrim(title), 80), left(coalesce(description, ''), 1000), clean[1:10], image, visibility, coalesce(allow_comments, true), resource) returning id into made;
  return made;
end $$;
create or replace function public.update_elsewhere_showcase(post_id uuid, visibility text, allow_comments boolean)
returns void language plpgsql security definer set search_path to '' as $$
begin update public.elsewhere_showcase set visibility = update_elsewhere_showcase.visibility, allow_comments = update_elsewhere_showcase.allow_comments where id = post_id and owner = auth.uid(); end $$;
create or replace function public.delete_elsewhere_showcase(post_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin delete from public.elsewhere_showcase where id = post_id and owner = auth.uid(); end $$;

create or replace function public.list_elsewhere_showcase(category text default null, query text default null, sort text default 'newest', page int default 0)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(elsewhere_internal.showcase_card(s) order by
      case when sort = 'hearts' then (select count(*) from public.elsewhere_showcase_hearts h where h.post = s.id) end desc nulls last,
      case when sort = 'random' then random() end, s.created_at desc), '[]'::jsonb)
  from (select * from public.elsewhere_showcase s where s.status = 'published' and s.visibility = 'public'
          and (list_elsewhere_showcase.category is null or s.category = list_elsewhere_showcase.category)
          and (coalesce(btrim(query), '') = '' or s.title ilike '%' || btrim(query) || '%' or lower(btrim(query)) = any(s.tags))
          and (auth.uid() is null or not elsewhere_internal.blocked(auth.uid(), s.owner))
        order by s.created_at desc limit 60 offset greatest(0, page) * 60) s;
$$;

create or replace function public.get_elsewhere_showcase(post_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s public.elsewhere_showcase; me uuid := auth.uid();
begin
  select * into s from public.elsewhere_showcase where id = post_id;
  if s.id is null or not elsewhere_internal.can_see_post(s, me) then return jsonb_build_object('missing', true); end if;
  return elsewhere_internal.showcase_card(s) || jsonb_build_object('mine', s.owner = me,
    'comments', case when s.allow_comments then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at, 'handle', p.handle, 'display_name', p.display_name, 'mine', c.author = me) order by c.created_at)
      from public.elsewhere_showcase_comments c join public.elsewhere_profiles p on p.id = c.author where c.post = s.id and not c.hidden), '[]'::jsonb) else '[]'::jsonb end);
end $$;

create or replace function public.set_elsewhere_showcase_heart(post_id uuid, keep boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); s public.elsewhere_showcase;
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  select * into s from public.elsewhere_showcase where id = post_id;
  if s.id is null or not elsewhere_internal.can_see_post(s, me) then raise exception 'That post isn''t available.'; end if;
  if keep then insert into public.elsewhere_showcase_hearts(post, owner) values (post_id, me) on conflict do nothing;
  else delete from public.elsewhere_showcase_hearts where post = post_id and owner = me; end if;
end $$;

create or replace function public.comment_elsewhere_showcase(post_id uuid, body text)
returns void language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); s public.elsewhere_showcase;
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  select * into s from public.elsewhere_showcase where id = post_id;
  if s.id is null or not elsewhere_internal.can_see_post(s, me) or not s.allow_comments then raise exception 'Comments are off for that post.'; end if;
  if (select count(*) from public.elsewhere_showcase_comments where author = me and created_at > now() - interval '10 minutes') >= 10 then raise exception 'Slow down a little.'; end if;
  insert into public.elsewhere_showcase_comments(post, author, body) values (post_id, me, left(btrim(body), 500));
end $$;
-- The comment's author or the post's owner can remove a comment.
create or replace function public.remove_elsewhere_showcase_comment(comment_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  update public.elsewhere_showcase_comments c set hidden = true where c.id = comment_id
    and (c.author = auth.uid() or exists (select 1 from public.elsewhere_showcase s where s.id = c.post and s.owner = auth.uid()));
end $$;

-- My Collection (favorites) and my own resources (any state) for the Creator Desk.
create or replace function public.my_elsewhere_collection()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'favorites', coalesce((select jsonb_agg(elsewhere_internal.resource_card(r) order by f.created_at desc) from public.elsewhere_resource_favorites f join public.elsewhere_resources r on r.id = f.resource
      where f.owner = auth.uid() and elsewhere_internal.can_see_resource(r, auth.uid())), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(elsewhere_internal.resource_card(r) order by r.updated_at desc) from public.elsewhere_resources r where r.owner = auth.uid()), '[]'::jsonb),
    'showcase', coalesce((select jsonb_agg(elsewhere_internal.showcase_card(s) order by s.created_at desc) from public.elsewhere_showcase s where s.owner = auth.uid()), '[]'::jsonb));
$$;

-- Creator page: a creator's public resources and showcase.
create or replace function public.get_elsewhere_creator(target_handle text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare person record; me uuid := auth.uid();
begin
  select id, handle, display_name into person from public.elsewhere_profiles where handle = lower(btrim(target_handle));
  if person.id is null or (me is not null and elsewhere_internal.blocked(me, person.id)) then return jsonb_build_object('status', 'missing'); end if;
  return jsonb_build_object('status', 'ok', 'handle', person.handle, 'display_name', person.display_name,
    'resources', coalesce((select jsonb_agg(elsewhere_internal.resource_card(r) order by r.updated_at desc) from public.elsewhere_resources r where r.owner = person.id and r.status = 'published' and r.visibility = 'public'), '[]'::jsonb),
    'showcase', coalesce((select jsonb_agg(elsewhere_internal.showcase_card(s) order by s.created_at desc) from public.elsewhere_showcase s where s.owner = person.id and elsewhere_internal.can_see_post(s, me) and s.visibility <> 'unlisted'), '[]'::jsonb));
end $$;

-- ---------- Trust: reports and moderation ----------
create or replace function public.report_elsewhere(target_kind text, target_id text, category text, details text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); made uuid;
begin
  if me is null then raise exception 'Sign in to Elsewhere to report.'; end if;
  if (select count(*) from public.elsewhere_exchange_reports where reporter = me and created_at > now() - interval '1 hour') >= 10 then raise exception 'You''ve sent a lot of reports. Try again later.'; end if;
  insert into public.elsewhere_exchange_reports(reporter, target_kind, target_id, category, details) values (me, target_kind, left(target_id, 64), category, left(coalesce(details, ''), 2000)) returning id into made;
  return made;
end $$;
-- Reporters see the status of their own reports (never who else reported).
create or replace function public.my_elsewhere_reports()
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'target_kind', target_kind, 'category', category, 'status', status, 'resolution', resolution, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
  from public.elsewhere_exchange_reports where reporter = auth.uid();
$$;
-- Moderators: the queue.
create or replace function public.list_elsewhere_reports(only_open boolean default true)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not elsewhere_internal.moderator(auth.uid()) then raise exception 'Moderators only.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'target_kind', r.target_kind, 'target_id', r.target_id, 'category', r.category, 'details', r.details, 'status', r.status,
    'resolution', r.resolution, 'created_at', r.created_at, 'reporter', (select handle from public.elsewhere_profiles where id = r.reporter)) order by r.created_at)
    from public.elsewhere_exchange_reports r where not only_open or r.status in ('received', 'under_review')), '[]'::jsonb);
end $$;
-- Moderators: act on a report. Actions: review, dismiss, restrict (hide from discovery/downloads), remove (withdraw / hide comment).
create or replace function public.act_elsewhere_report(report_id uuid, action text, note text)
returns void language plpgsql security definer set search_path to '' as $$
declare r public.elsewhere_exchange_reports;
begin
  if not elsewhere_internal.moderator(auth.uid()) then raise exception 'Moderators only.'; end if;
  select * into r from public.elsewhere_exchange_reports where id = report_id;
  if r.id is null then raise exception 'Report not found.'; end if;
  if action in ('restrict', 'remove') then
    if r.target_kind = 'resource' then update public.elsewhere_resources set status = case when action = 'remove' then 'withdrawn' else 'restricted' end where id::text = r.target_id;
    elsif r.target_kind = 'showcase' then update public.elsewhere_showcase set status = case when action = 'remove' then 'withdrawn' else 'restricted' end where id::text = r.target_id;
    elsif r.target_kind = 'comment' then update public.elsewhere_showcase_comments set hidden = true where id::text = r.target_id;
    end if;
  end if;
  update public.elsewhere_exchange_reports set status = case action when 'review' then 'under_review' when 'dismiss' then 'closed' else 'action_taken' end,
    resolution = left(coalesce(note, ''), 1000), updated_at = now() where id = report_id;
end $$;
-- Moderators: restore something after review or a successful appeal.
create or replace function public.restore_elsewhere_item(target_kind text, target_id text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not elsewhere_internal.moderator(auth.uid()) then raise exception 'Moderators only.'; end if;
  if target_kind = 'resource' then update public.elsewhere_resources set status = 'published' where id::text = target_id;
  elsif target_kind = 'showcase' then update public.elsewhere_showcase set status = 'published' where id::text = target_id;
  elsif target_kind = 'comment' then update public.elsewhere_showcase_comments set hidden = false where id::text = target_id; end if;
end $$;

revoke all on function elsewhere_internal.moderator(uuid), elsewhere_internal.resource_card(public.elsewhere_resources), elsewhere_internal.can_see_resource(public.elsewhere_resources, uuid),
  elsewhere_internal.can_see_post(public.elsewhere_showcase, uuid), elsewhere_internal.showcase_card(public.elsewhere_showcase) from public, anon, authenticated;
revoke all on function public.am_elsewhere_moderator(), public.save_elsewhere_resource(uuid, text, text, text, text[], text, boolean, text, text, text, jsonb, text, uuid),
  public.withdraw_elsewhere_resource(uuid), public.list_elsewhere_resources(text, text, text, text, int), public.get_elsewhere_resource(uuid), public.count_elsewhere_resource_download(uuid),
  public.set_elsewhere_resource_favorite(uuid, boolean), public.my_elsewhere_collection(), public.post_elsewhere_showcase(text, text, text, text[], text, text, boolean, uuid),
  public.update_elsewhere_showcase(uuid, text, boolean), public.delete_elsewhere_showcase(uuid), public.list_elsewhere_showcase(text, text, text, int), public.get_elsewhere_showcase(uuid),
  public.set_elsewhere_showcase_heart(uuid, boolean), public.comment_elsewhere_showcase(uuid, text), public.remove_elsewhere_showcase_comment(uuid), public.get_elsewhere_creator(text),
  public.report_elsewhere(text, text, text, text), public.my_elsewhere_reports(), public.list_elsewhere_reports(boolean), public.act_elsewhere_report(uuid, text, text),
  public.restore_elsewhere_item(text, text) from public;
grant execute on function public.list_elsewhere_resources(text, text, text, text, int), public.get_elsewhere_resource(uuid), public.count_elsewhere_resource_download(uuid),
  public.list_elsewhere_showcase(text, text, text, int), public.get_elsewhere_showcase(uuid), public.get_elsewhere_creator(text) to anon, authenticated;
grant execute on function public.am_elsewhere_moderator(), public.save_elsewhere_resource(uuid, text, text, text, text[], text, boolean, text, text, text, jsonb, text, uuid),
  public.withdraw_elsewhere_resource(uuid), public.set_elsewhere_resource_favorite(uuid, boolean), public.my_elsewhere_collection(),
  public.post_elsewhere_showcase(text, text, text, text[], text, text, boolean, uuid), public.update_elsewhere_showcase(uuid, text, boolean), public.delete_elsewhere_showcase(uuid),
  public.set_elsewhere_showcase_heart(uuid, boolean), public.comment_elsewhere_showcase(uuid, text), public.remove_elsewhere_showcase_comment(uuid),
  public.report_elsewhere(text, text, text, text), public.my_elsewhere_reports(), public.list_elsewhere_reports(boolean), public.act_elsewhere_report(uuid, text, text),
  public.restore_elsewhere_item(text, text) to authenticated;

-- Make Cyber (@cyberthreed) the first moderator.
insert into public.elsewhere_exchange_moderators(user_id) select id from public.elsewhere_profiles where handle = 'cyberthreed' on conflict do nothing;
