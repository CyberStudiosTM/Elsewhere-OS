-- Photos in Elsewhere group chats. Stored privately at <sender id>/group-<group id>/<random id>.<ext>
-- in the elsewhere-dm-media bucket. Only current members can upload to or read a group's photos.

alter table public.elsewhere_group_messages drop constraint if exists elsewhere_group_messages_kind_check;
alter table public.elsewhere_group_messages add constraint elsewhere_group_messages_kind_check
  check (kind in ('message', 'nudge', 'gif', 'image', 'system'));

create or replace function public.elsewhere_group_folder_member(folder text)
returns boolean language plpgsql stable security definer set search_path to '' as $$
declare group_text text := substring(folder from '^group-([0-9a-f-]{36})$');
begin
  if group_text is null then return false; end if;
  return exists (select 1 from public.elsewhere_group_members where group_id = group_text::uuid and user_id = auth.uid());
end;
$$;
revoke all on function public.elsewhere_group_folder_member(text) from public, anon;
grant execute on function public.elsewhere_group_folder_member(text) to authenticated;

drop policy if exists "Elsewhere group photos upload" on storage.objects;
create policy "Elsewhere group photos upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'elsewhere-dm-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
    and public.elsewhere_group_folder_member((storage.foldername(name))[2])
  );

drop policy if exists "Elsewhere group photos read" on storage.objects;
create policy "Elsewhere group photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'elsewhere-dm-media' and public.elsewhere_group_folder_member((storage.foldername(name))[2]));

create or replace function public.send_elsewhere_group_message(target uuid, body text, request_id uuid, message_kind text default 'message')
returns public.elsewhere_group_messages language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); result public.elsewhere_group_messages;
begin
  if not public.elsewhere_in_group(target) then raise exception 'You’re not in this group.' using errcode = '42501'; end if;
  if body is null or char_length(btrim(body)) not between 1 and 16000 or request_id is null then raise exception 'Enter a message between 1 and 16,000 characters.'; end if;
  if message_kind not in ('message', 'nudge', 'gif', 'image') then raise exception 'Invalid message kind.'; end if;
  if message_kind = 'nudge' then body := 'Nudge'; perform elsewhere_internal.guard_rate(me, 'nudge', 1, interval '10 seconds'); end if;
  if message_kind = 'gif' and (char_length(btrim(body)) > 600 or btrim(body) !~ '^https://(media[0-9]?|i)\.giphy\.com/[A-Za-z0-9/._?=&%-]+$') then raise exception 'Invalid GIF.'; end if;
  if message_kind = 'image' and btrim(body) !~ ('^' || me::text || '/group-' || target::text || '/[0-9a-f-]{36}\.(png|jpg|gif|webp)$') then raise exception 'Invalid photo.'; end if;
  perform elsewhere_internal.guard_rate(me, 'message', 30, interval '1 minute');
  insert into public.elsewhere_group_messages(group_id, sender_id, client_id, kind, text_body)
    values (target, me, request_id, message_kind, btrim(body))
    on conflict (sender_id, client_id) do nothing returning * into result;
  if not found then select * into result from public.elsewhere_group_messages where sender_id = me and client_id = request_id and group_id = target; end if;
  return result;
end;
$$;
