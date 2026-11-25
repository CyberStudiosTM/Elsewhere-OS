-- Elsewhere group chats (started from a conversation's Invite button).
-- Only members can see a group, its members and its messages. Everyone added must be an
-- accepted, unblocked friend of the person adding them. All writes go through functions.

create table if not exists public.elsewhere_groups (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or char_length(btrim(name)) between 1 and 60),
  created_by uuid references public.elsewhere_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.elsewhere_group_members (
  group_id uuid not null references public.elsewhere_groups(id) on delete cascade,
  user_id uuid not null references public.elsewhere_profiles(id) on delete cascade,
  added_by uuid references public.elsewhere_profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists elsewhere_group_members_user on public.elsewhere_group_members(user_id);

create table if not exists public.elsewhere_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.elsewhere_groups(id) on delete cascade,
  sender_id uuid references public.elsewhere_profiles(id) on delete cascade,
  client_id uuid not null,
  kind text not null default 'message' check (kind in ('message', 'nudge', 'gif', 'system')),
  text_body text not null check (char_length(btrim(text_body)) between 1 and 16000),
  created_at timestamptz not null default now(),
  unique (sender_id, client_id)
);
create index if not exists elsewhere_group_messages_group on public.elsewhere_group_messages(group_id, created_at);

alter table public.elsewhere_groups enable row level security;
alter table public.elsewhere_group_members enable row level security;
alter table public.elsewhere_group_messages enable row level security;

create or replace function public.elsewhere_in_group(target uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.elsewhere_group_members where group_id = target and user_id = auth.uid());
$$;
revoke all on function public.elsewhere_in_group(uuid) from public, anon;
grant execute on function public.elsewhere_in_group(uuid) to authenticated;

drop policy if exists "Members see their groups" on public.elsewhere_groups;
create policy "Members see their groups" on public.elsewhere_groups for select to authenticated using (public.elsewhere_in_group(id));
drop policy if exists "Members see group members" on public.elsewhere_group_members;
create policy "Members see group members" on public.elsewhere_group_members for select to authenticated using (public.elsewhere_in_group(group_id));
drop policy if exists "Members read group messages" on public.elsewhere_group_messages;
create policy "Members read group messages" on public.elsewhere_group_messages for select to authenticated using (public.elsewhere_in_group(group_id));

revoke all on public.elsewhere_groups, public.elsewhere_group_members, public.elsewhere_group_messages from anon, authenticated;
grant select on public.elsewhere_groups, public.elsewhere_group_members, public.elsewhere_group_messages to authenticated;

-- True when me and person are accepted friends and neither has blocked the other.
create or replace function elsewhere_internal.friends(me uuid, person uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select me <> person and not elsewhere_internal.blocked(me, person) and exists (
    select 1 from public.elsewhere_friendships where user_a = least(me, person) and user_b = greatest(me, person) and accepted_at is not null);
$$;

create or replace function public.create_elsewhere_group(people uuid[], group_name text default null)
returns public.elsewhere_groups language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); person uuid; made public.elsewhere_groups; picked uuid[];
begin
  if not elsewhere_internal.member() or not exists (select 1 from public.elsewhere_profiles where id = me) then
    raise exception 'Verify your email and finish setup first.' using errcode = '42501';
  end if;
  select array_agg(distinct p) into picked from unnest(people) as p where p is not null and p <> me;
  if picked is null or array_length(picked, 1) < 2 then raise exception 'Pick at least two friends for a group chat.'; end if;
  if array_length(picked, 1) > 19 then raise exception 'Group chats can have up to 20 people.'; end if;
  foreach person in array picked loop
    if not elsewhere_internal.friends(me, person) then raise exception 'You can only add accepted friends to a group.' using errcode = '42501'; end if;
  end loop;
  perform elsewhere_internal.guard_rate(me, 'group-create', 10, interval '1 hour');
  insert into public.elsewhere_groups(name, created_by) values (nullif(btrim(coalesce(group_name, '')), ''), me) returning * into made;
  insert into public.elsewhere_group_members(group_id, user_id, added_by) values (made.id, me, me);
  insert into public.elsewhere_group_members(group_id, user_id, added_by) select made.id, p, me from unnest(picked) as p;
  insert into public.elsewhere_group_messages(group_id, sender_id, client_id, kind, text_body)
    values (made.id, me, gen_random_uuid(), 'system', 'started the group chat');
  return made;
end;
$$;

create or replace function public.add_elsewhere_group_member(target uuid, person uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid();
begin
  if not public.elsewhere_in_group(target) then raise exception 'You’re not in this group.' using errcode = '42501'; end if;
  if not elsewhere_internal.friends(me, person) then raise exception 'You can only add accepted friends.' using errcode = '42501'; end if;
  if (select count(*) from public.elsewhere_group_members where group_id = target) >= 20 then raise exception 'Group chats can have up to 20 people.'; end if;
  perform elsewhere_internal.guard_rate(me, 'group-add', 30, interval '1 hour');
  insert into public.elsewhere_group_members(group_id, user_id, added_by) values (target, person, me) on conflict do nothing;
  if found then
    insert into public.elsewhere_group_messages(group_id, sender_id, client_id, kind, text_body)
      values (target, me, gen_random_uuid(), 'system', 'added @' || (select handle from public.elsewhere_profiles where id = person));
  end if;
end;
$$;

create or replace function public.leave_elsewhere_group(target uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid();
begin
  if not public.elsewhere_in_group(target) then return; end if;
  insert into public.elsewhere_group_messages(group_id, sender_id, client_id, kind, text_body)
    values (target, me, gen_random_uuid(), 'system', 'left the group chat');
  delete from public.elsewhere_group_members where group_id = target and user_id = me;
  if not exists (select 1 from public.elsewhere_group_members where group_id = target) then
    delete from public.elsewhere_groups where id = target;
  end if;
end;
$$;

create or replace function public.rename_elsewhere_group(target uuid, group_name text)
returns void language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); clean text := nullif(btrim(coalesce(group_name, '')), '');
begin
  if not public.elsewhere_in_group(target) then raise exception 'You’re not in this group.' using errcode = '42501'; end if;
  if clean is not null and char_length(clean) > 60 then raise exception 'Group names can be up to 60 characters.'; end if;
  perform elsewhere_internal.guard_rate(me, 'group-rename', 20, interval '1 hour');
  update public.elsewhere_groups set name = clean where id = target;
  insert into public.elsewhere_group_messages(group_id, sender_id, client_id, kind, text_body)
    values (target, me, gen_random_uuid(), 'system', coalesce('renamed the group to ' || clean, 'removed the group name'));
end;
$$;

create or replace function public.send_elsewhere_group_message(target uuid, body text, request_id uuid, message_kind text default 'message')
returns public.elsewhere_group_messages language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); result public.elsewhere_group_messages;
begin
  if not public.elsewhere_in_group(target) then raise exception 'You’re not in this group.' using errcode = '42501'; end if;
  if body is null or char_length(btrim(body)) not between 1 and 16000 or request_id is null then raise exception 'Enter a message between 1 and 16,000 characters.'; end if;
  if message_kind not in ('message', 'nudge', 'gif') then raise exception 'Invalid message kind.'; end if;
  if message_kind = 'nudge' then body := 'Nudge'; perform elsewhere_internal.guard_rate(me, 'nudge', 1, interval '10 seconds'); end if;
  if message_kind = 'gif' and (char_length(btrim(body)) > 600 or btrim(body) !~ '^https://(media[0-9]?|i)\.giphy\.com/[A-Za-z0-9/._?=&%-]+$') then raise exception 'Invalid GIF.'; end if;
  perform elsewhere_internal.guard_rate(me, 'message', 30, interval '1 minute');
  insert into public.elsewhere_group_messages(group_id, sender_id, client_id, kind, text_body)
    values (target, me, request_id, message_kind, btrim(body))
    on conflict (sender_id, client_id) do nothing returning * into result;
  if not found then select * into result from public.elsewhere_group_messages where sender_id = me and client_id = request_id and group_id = target; end if;
  return result;
end;
$$;

revoke all on function public.create_elsewhere_group(uuid[], text), public.add_elsewhere_group_member(uuid, uuid),
  public.leave_elsewhere_group(uuid), public.rename_elsewhere_group(uuid, text),
  public.send_elsewhere_group_message(uuid, text, uuid, text) from public, anon;
grant execute on function public.create_elsewhere_group(uuid[], text), public.add_elsewhere_group_member(uuid, uuid),
  public.leave_elsewhere_group(uuid), public.rename_elsewhere_group(uuid, text),
  public.send_elsewhere_group_message(uuid, text, uuid, text) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.elsewhere_group_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.elsewhere_group_members; exception when duplicate_object then null; end;
end $$;
