-- Online status and typing indicators for Elsewhere friends.
-- Each pair of accepted friends shares one private Realtime channel named
-- dm:<smaller user id>:<larger user id>. Only those two people can join it.
create or replace function public.elsewhere_dm_topic_ok(channel_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  first_id text := split_part(channel_topic, ':', 2);
  second_id text := split_part(channel_topic, ':', 3);
  pattern text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if me is null or split_part(channel_topic, ':', 1) <> 'dm' or split_part(channel_topic, ':', 4) <> '' then
    return false;
  end if;
  if first_id !~ pattern or second_id !~ pattern or first_id >= second_id then
    return false;
  end if;
  if me::text not in (first_id, second_id) then
    return false;
  end if;
  return exists (
    select 1 from public.elsewhere_friendships f
    where f.accepted_at is not null
      and ((f.user_a = first_id::uuid and f.user_b = second_id::uuid)
        or (f.user_a = second_id::uuid and f.user_b = first_id::uuid))
  );
end;
$$;

revoke all on function public.elsewhere_dm_topic_ok(text) from public, anon;
grant execute on function public.elsewhere_dm_topic_ok(text) to authenticated;

drop policy if exists "Elsewhere friends read their shared channel" on realtime.messages;
create policy "Elsewhere friends read their shared channel" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension in ('presence', 'broadcast') and public.elsewhere_dm_topic_ok((select realtime.topic())));

drop policy if exists "Elsewhere friends write their shared channel" on realtime.messages;
create policy "Elsewhere friends write their shared channel" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension in ('presence', 'broadcast') and public.elsewhere_dm_topic_ok((select realtime.topic())));
