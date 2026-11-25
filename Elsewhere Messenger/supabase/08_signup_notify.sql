-- Email the owner when someone finishes signing up (creates their Elsewhere handle).
-- The trigger calls the elsewhere-signup-notify function with a shared secret from the Vault.
-- A failed or slow email never blocks signup: pg_net sends in the background.
create extension if not exists pg_net with schema extensions;

create or replace function elsewhere_internal.notify_new_signup()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  hook_secret text;
  person_email text;
begin
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'elsewhere_hook_secret' limit 1;
  if hook_secret is null then return new; end if;
  select email into person_email from auth.users where id = new.id;
  perform net.http_post(
    url := 'https://mnyreqbdzgvrqlrhvxel.supabase.co/functions/v1/elsewhere-signup-notify',
    body := jsonb_build_object('handle', new.handle, 'display_name', new.display_name, 'email', person_email),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-elsewhere-hook', hook_secret),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists elsewhere_notify_new_signup on public.elsewhere_profiles;
create trigger elsewhere_notify_new_signup
  after insert on public.elsewhere_profiles
  for each row execute function elsewhere_internal.notify_new_signup();
