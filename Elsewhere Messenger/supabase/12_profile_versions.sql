-- Elsewhere Profiles · version history | run once in the Supabase SQL Editor after 11_profiles.sql (additive).
-- Every time a profile is published, the published page is kept as a version (newest 30 per person).
-- Owners can list their versions and load one back into their DRAFT; restoring never changes the live page.

create table if not exists public.elsewhere_profile_versions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.elsewhere_profiles(id) on delete cascade,
  doc jsonb not null check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 700000),
  created_at timestamptz not null default now()
);
create index if not exists elsewhere_profile_versions_owner_idx on public.elsewhere_profile_versions(owner, created_at desc);
alter table public.elsewhere_profile_versions enable row level security;
revoke all on public.elsewhere_profile_versions from anon, authenticated;

-- Snapshot on publish (runs inside the existing save function's update).
create or replace function elsewhere_internal.snapshot_profile_version()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.published is not null and new.published is distinct from old.published then
    insert into public.elsewhere_profile_versions(owner, doc) values (new.owner, new.published);
    delete from public.elsewhere_profile_versions v
      where v.owner = new.owner
        and v.id not in (select id from public.elsewhere_profile_versions where owner = new.owner order by created_at desc limit 30);
  end if;
  return new;
end $$;
create or replace function elsewhere_internal.snapshot_profile_version_insert()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.elsewhere_profile_versions(owner, doc) values (new.owner, new.published);
  return new;
end $$;
drop trigger if exists elsewhere_profile_version_snapshot on public.elsewhere_profile_pages;
create trigger elsewhere_profile_version_snapshot after update of published on public.elsewhere_profile_pages
  for each row execute function elsewhere_internal.snapshot_profile_version();
drop trigger if exists elsewhere_profile_version_snapshot_insert on public.elsewhere_profile_pages;
create trigger elsewhere_profile_version_snapshot_insert after insert on public.elsewhere_profile_pages
  for each row when (new.published is not null) execute function elsewhere_internal.snapshot_profile_version_insert();


-- Owner only: the list of my versions (newest first), without the page contents.
create or replace function public.list_my_elsewhere_profile_versions()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'created_at', v.created_at, 'size', pg_column_size(v.doc)) order by v.created_at desc)
    from public.elsewhere_profile_versions v where v.owner = me), '[]'::jsonb);
end $$;

-- Owner only: one version's page, to load into the editor as a draft.
create or replace function public.get_my_elsewhere_profile_version(version_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare me uuid := auth.uid(); found jsonb;
begin
  if me is null then raise exception 'Sign in to Elsewhere first.'; end if;
  select v.doc into found from public.elsewhere_profile_versions v where v.id = version_id and v.owner = me;
  if found is null then raise exception 'That version isn''t available.'; end if;
  return found;
end $$;

revoke all on function public.list_my_elsewhere_profile_versions() from public, anon;
revoke all on function public.get_my_elsewhere_profile_version(uuid) from public, anon;
grant execute on function public.list_my_elsewhere_profile_versions() to authenticated;
grant execute on function public.get_my_elsewhere_profile_version(uuid) to authenticated;
revoke all on function elsewhere_internal.snapshot_profile_version() from public, anon, authenticated;
revoke all on function elsewhere_internal.snapshot_profile_version_insert() from public, anon, authenticated;

-- Keep the page that's live right now as the first version.
insert into public.elsewhere_profile_versions(owner, doc)
  select p.owner, p.published from public.elsewhere_profile_pages p
  where p.published is not null and not exists (select 1 from public.elsewhere_profile_versions v where v.owner = p.owner);
