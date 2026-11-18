-- Uitzetknop per atleet voor "Samenvatten met AI" in de Weekcheck (18 nov 2026).
-- Staat het veld aan, dan weigert de Edge Function weekcheck-samenvatting en
-- toont de app de knop niet. Bij het aanzetten ruimen we meteen op wat er al
-- door AI over deze atleet is geschreven: de bewaarde samenvattingen en de kopie
-- die bij het afvinken in het dossier is gezet.
alter table public.profiles add column ai_summary_optout boolean not null default false;

create function private.ai_optout_opruimen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.ai_summary_optout and not coalesce(old.ai_summary_optout, false) then
    delete from public.week_summaries where athlete_id = new.id;
    update public.week_checks set summary = summary - 'ai'
      where athlete_id = new.id and summary ? 'ai';
  end if;
  return null;
end $$;
revoke all on function private.ai_optout_opruimen() from public, anon, authenticated;

create trigger profiles_ai_optout after update of ai_summary_optout on public.profiles
  for each row execute function private.ai_optout_opruimen();
