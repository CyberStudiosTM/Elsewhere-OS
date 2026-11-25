-- Photos and GIFs in Elsewhere DMs.
-- Photos go to the private bucket elsewhere-dm-media at <sender id>/<recipient id>/<random id>.<ext>.
-- Only the sender (to accepted, unblocked friends) can upload, and only the two people in the
-- conversation can read. GIFs are GIPHY links and aren't uploaded.

alter table public.elsewhere_messages drop constraint if exists elsewhere_messages_kind_check;
alter table public.elsewhere_messages add constraint elsewhere_messages_kind_check
  check (kind = any (array['message', 'nudge', 'image', 'gif']));

create or replace function public.send_elsewhere_message(person uuid, body text, request_id uuid, message_kind text default 'message'::text)
 returns elsewhere_messages
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare me uuid := elsewhere_internal.valid_target(person); result public.elsewhere_messages;
begin
  if body is null or char_length(btrim(body)) not between 1 and 16000 or request_id is null then
    raise exception 'Enter a message between 1 and 16,000 characters.';
  end if;
  if message_kind is null or message_kind not in ('message', 'nudge', 'image', 'gif') then
    raise exception 'Invalid message kind.';
  end if;
  if message_kind = 'nudge' then body := 'Nudge'; end if;
  if message_kind = 'image' and btrim(body) !~ ('^' || me::text || '/' || person::text || '/[0-9a-f-]{36}\.(png|jpg|gif|webp)$') then
    raise exception 'Invalid photo.';
  end if;
  if message_kind = 'gif' and (char_length(btrim(body)) > 600 or btrim(body) !~ '^https://(media[0-9]?|i)\.giphy\.com/[A-Za-z0-9/._?=&%-]+$') then
    raise exception 'Invalid GIF.';
  end if;
  perform elsewhere_internal.guard_rate(me,'message',30,interval '1 minute');
  perform elsewhere_internal.lock_pair(me,person);
  if elsewhere_internal.blocked(me,person) or not exists (
    select 1 from public.elsewhere_friendships where user_a=least(me,person)
      and user_b=greatest(me,person) and accepted_at is not null
  ) then raise exception 'Only accepted friends can exchange messages.' using errcode='42501'; end if;
  select * into result from public.elsewhere_messages where sender_id=me and client_id=request_id;
  if found then
    if result.recipient_id <> person or result.text_body <> btrim(body) or result.kind <> message_kind then
      raise exception 'This message request was already used.';
    end if;
    return result;
  end if;
  if message_kind = 'nudge' then
    perform elsewhere_internal.guard_rate(me,'nudge',1,interval '10 seconds');
  end if;
  insert into public.elsewhere_messages(sender_id,recipient_id,client_id,text_body,kind)
    values(me,person,request_id,btrim(body),message_kind)
    on conflict(sender_id,client_id) do nothing returning * into result;
  if not found then
    select * into result from public.elsewhere_messages where sender_id=me and client_id=request_id
      and recipient_id=person and text_body=btrim(body) and kind=message_kind;
    if not found then raise exception 'This message request was already used.'; end if;
  end if;
  return result;
end;
$function$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('elsewhere-dm-media', 'elsewhere-dm-media', false, 8388608, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- True when the signed-in person may upload a photo for this recipient.
create or replace function public.elsewhere_can_send_media(recipient text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare me uuid := auth.uid(); person uuid;
begin
  if me is null or recipient !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  person := recipient::uuid;
  if person = me or elsewhere_internal.blocked(me, person) then return false; end if;
  return exists (select 1 from public.elsewhere_friendships where user_a = least(me, person)
    and user_b = greatest(me, person) and accepted_at is not null);
end;
$$;
revoke all on function public.elsewhere_can_send_media(text) from public, anon;
grant execute on function public.elsewhere_can_send_media(text) to authenticated;

drop policy if exists "Elsewhere DM photos upload" on storage.objects;
create policy "Elsewhere DM photos upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'elsewhere-dm-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
    and public.elsewhere_can_send_media((storage.foldername(name))[2])
  );

drop policy if exists "Elsewhere DM photos read" on storage.objects;
create policy "Elsewhere DM photos read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'elsewhere-dm-media'
    and (select auth.uid())::text in ((storage.foldername(name))[1], (storage.foldername(name))[2])
  );
