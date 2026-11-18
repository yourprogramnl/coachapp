-- Welkomstmail na een gratis aanmelding (18 nov 2026, Stefan: "Ja, allebei").
-- Wie zich gratis aanmeldt (via de aanmeldlink van de YP Showdown of de knop "Doe gratis mee"
-- in de app), krijgt één keer een welkomstmail met de app-links en daaronder het abonnement
-- met alle programma's. De mail zelf maakt mail-send (event 'welkom'); deze trigger zet hem
-- in de wachtrij. Alleen als:
--   * het programma open is: zichtbaar, niet in het abonnement en zonder prijs;
--   * het lid een gewoon lid is (rol lid, geen 1-op-1-klant) met een e-mailadres;
--   * het lid geen programma met een prijs volgt (anders is het geen gratis lid);
--   * er voor dit lid en dit programma nog nooit een welkomstmail in de wachtrij stond.

create or replace function private.welkom_na_aanmelding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.blog_programs p
                  where p.id = new.blog_program_id
                    and not p.hidden and not p.in_abonnement and coalesce(p.price_cents, 0) = 0) then
    return null;
  end if;
  if not exists (select 1 from public.profiles pr
                  where pr.id = new.athlete_id and pr.role = 'lid'
                    and pr.membership_type is distinct from 'one_on_one'
                    and coalesce(pr.email, '') <> '') then
    return null;
  end if;
  if exists (select 1 from public.blog_program_members m
               join public.blog_programs p on p.id = m.blog_program_id
              where m.athlete_id = new.athlete_id and coalesce(p.price_cents, 0) > 0) then
    return null;
  end if;
  if exists (select 1 from public.mail_queue q
              where q.recipient_id = new.athlete_id and q.event = 'welkom'
                and q.payload->>'blog_program_id' = new.blog_program_id::text) then
    return null;
  end if;
  insert into public.mail_queue (company_id, recipient_id, event, payload)
  values (new.company_id, new.athlete_id, 'welkom', jsonb_build_object('blog_program_id', new.blog_program_id));
  return null;
end
$$;

revoke all on function private.welkom_na_aanmelding() from public;

drop trigger if exists blog_program_members_welkom on public.blog_program_members;
create trigger blog_program_members_welkom
  after insert on public.blog_program_members
  for each row execute function private.welkom_na_aanmelding();
