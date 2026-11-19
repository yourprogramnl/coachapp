-- Push notifications after switching accounts on one phone (19 Nov 2026).
-- The app registers its device with an upsert on push_tokens.token. If that device was still
-- registered to another account (someone logged out and in again with a second account), the
-- upsert had to update a row the new user may not see, so RLS refused it (403) and the new
-- account never got push notifications. Michel's admin account and Stefan's test account had
-- no device at all because of this.
-- Fix on the database side, so it also works for the app versions already in the stores:
-- before the insert, remove the same device from any other account. The device then belongs
-- to whoever is logged in on it now, and the previous account stops receiving its pushes there.
-- Only for the logged-in user's own registration; registering under someone else's name is
-- still refused by the existing policy push_tokens_self_all.
create or replace function private.push_token_overnemen()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.profile_id is not distinct from (select auth.uid()) then
    delete from public.push_tokens where token = new.token and profile_id <> new.profile_id;
  end if;
  return new;
end
$function$;
revoke all on function private.push_token_overnemen() from public, anon, authenticated;

drop trigger if exists push_tokens_overnemen on public.push_tokens;
create trigger push_tokens_overnemen
  before insert on public.push_tokens
  for each row execute function private.push_token_overnemen();
