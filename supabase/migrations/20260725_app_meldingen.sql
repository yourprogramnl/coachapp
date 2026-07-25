-- Meldingen van coaches over de app zelf (bug, idee of vraag).
-- De coach stuurt ze vanuit het vraagteken in de balk; Stefan/Michel
-- (platform_admin) lezen ze op #meldingen en krijgen er een mail van.
create table if not exists public.app_meldingen (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  soort text not null default 'idee' check (soort in ('bug','idee','vraag')),
  onderwerp text not null,
  bericht text not null,
  pagina text,                                 -- op welk scherm de melding is gemaakt
  context jsonb not null default '{}'::jsonb,  -- browser, schermbreedte
  status text not null default 'open' check (status in ('open','afgehandeld')),
  afgehandeld_op timestamptz,
  afgehandeld_door uuid references public.profiles(id) on delete set null,
  notitie text,
  created_at timestamptz not null default now()
);

create index if not exists app_meldingen_status_idx on public.app_meldingen (status, created_at desc);
create index if not exists app_meldingen_profile_idx on public.app_meldingen (profile_id);

alter table public.app_meldingen enable row level security;

-- Staf mag een melding maken, altijd als zichzelf.
create policy app_meldingen_staff_insert on public.app_meldingen
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and private.my_role() in ('coach','eigenaar','platform_admin')
  );

-- Je ziet je eigen meldingen; platform_admin ziet ze allemaal.
create policy app_meldingen_select on public.app_meldingen
  for select to authenticated
  using (profile_id = auth.uid() or private.my_role() = 'platform_admin');

-- Afhandelen (status/notitie) doet alleen platform_admin.
create policy app_meldingen_admin_update on public.app_meldingen
  for update to authenticated
  using (private.my_role() = 'platform_admin')
  with check (private.my_role() = 'platform_admin');

create policy app_meldingen_admin_delete on public.app_meldingen
  for delete to authenticated
  using (private.my_role() = 'platform_admin');

-- Zodra er een melding binnenkomt, gaat er een mail naar het meldingenadres.
-- De mailtekst wordt gemaakt in de Edge Function mail-send (event 'melding').
create or replace function private.melding_mail()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.mail_queue (company_id, event, recipient_email, payload)
  values (new.company_id, 'melding', 'crossfitcapelleaandenijssel@gmail.com',
          jsonb_build_object('melding_id', new.id));
  return new;
end;
$$;

drop trigger if exists app_meldingen_mail on public.app_meldingen;
create trigger app_meldingen_mail
  after insert on public.app_meldingen
  for each row execute function private.melding_mail();
