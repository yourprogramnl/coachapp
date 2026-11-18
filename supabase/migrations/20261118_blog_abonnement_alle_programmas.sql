-- Eén abonnement geeft alle programma's (18 nov 2026, verzoek Stefan): "iemand schaft straks
-- een programma aan en kan dan alle programma's zien; starten we een nieuwe blog, dan krijgen
-- zij die erbij."
--
-- Werking: wie een betaald, niet herroepen abonnement heeft op een programma dat bij het
-- abonnement hoort (blog_programs.in_abonnement), wordt automatisch gekoppeld aan alle andere
-- programma's van hetzelfde bedrijf die bij het abonnement horen, ook aan programma's die later
-- worden aangemaakt. De database houdt dat zelf bij in blog_program_members (kolom via_order =
-- de bestelling waar de toegang uit komt). De app leest die koppelingen al, dus de app hoeft
-- niet te veranderen. Verborgen programma's (Mayhem) horen er nooit bij.
-- De koppeling met het gekochte programma zelf blijft zoals hij was: gemaakt bij de levering
-- (stripe-webhook / shop-bedankt), weggehaald door shop_afsluiten.

-- 1. Kolommen
alter table public.blog_programs
  add column if not exists in_abonnement boolean not null default true;
comment on column public.blog_programs.in_abonnement is
  'Hoort bij het abonnement: wie een betaald abonnement heeft op een programma met dit vinkje, ziet ook dit programma. Standaard aan; verborgen programma''s tellen nooit mee.';
update public.blog_programs set in_abonnement = false where hidden;

alter table public.blog_program_members
  add column if not exists via_order uuid references public.shop_orders(id) on delete cascade;
comment on column public.blog_program_members.via_order is
  'Gevuld = koppeling komt uit een lopend abonnement (alle programma''s) en wordt door de database bijgehouden. Leeg = met de hand, via de aanmeldlink of het gekochte programma zelf.';
create index if not exists blog_program_members_via_order_idx
  on public.blog_program_members (via_order) where via_order is not null;

-- Vanuit de app of het dashboard maakt niemand zelf een abonnementskoppeling; dat doet alleen
-- de database (de functies hieronder lopen met eigenaarsrechten).
alter policy bpm_insert on public.blog_program_members
  with check (
    via_order is null
    and ((private.my_role() = 'platform_admin'::public.user_role)
         or ((private.my_role() = any (array['coach'::public.user_role, 'eigenaar'::public.user_role]))
             and (company_id = private.my_company())))
  );

-- 2. Welke programma's horen via een lopend abonnement bij dit lid?
-- Lopend = betaald en niet herroepen, op een programma dat bij het abonnement hoort, en het
-- account hoort bij hetzelfde bedrijf als de bestelling. Bij twee lopende abonnementen telt het
-- oudste als bron.
create or replace function private.abonnement_gewenst(p_profile uuid)
returns table (prog uuid, bedrijf uuid, bestelling uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with actief as (
    select distinct on (o.company_id) o.id, o.company_id
      from public.shop_orders o
      join public.blog_programs bp on bp.id = o.blog_program_id
      join public.profiles pr on pr.id = o.profile_id
     where o.profile_id = p_profile
       and o.status = 'paid'
       and o.withdrawn_at is null
       and bp.in_abonnement and not bp.hidden
       and pr.company_id = o.company_id
     order by o.company_id, o.created_at, o.id
  )
  select p.id, p.company_id, a.id
    from actief a
    join public.blog_programs p on p.company_id = a.company_id
   where p.in_abonnement and not p.hidden
$$;

-- 3. De koppelingen van één lid gelijktrekken met zijn abonnementen.
create or replace function private.abonnement_sync(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_profile is null then
    return;
  end if;
  -- Abonnementskoppelingen die niet meer horen (abonnement gestopt of herroepen, programma uit
  -- het abonnement gehaald of verborgen): weg.
  delete from public.blog_program_members m
   where m.athlete_id = p_profile
     and m.via_order is not null
     and not exists (select 1 from private.abonnement_gewenst(p_profile) g where g.prog = m.blog_program_id);
  -- Nog nodig, maar via een ander lopend abonnement: daarnaar laten wijzen.
  update public.blog_program_members m
     set via_order = g.bestelling
    from private.abonnement_gewenst(p_profile) g
   where m.athlete_id = p_profile
     and m.via_order is not null
     and m.blog_program_id = g.prog
     and m.via_order is distinct from g.bestelling;
  -- Ontbrekende programma's erbij. Bestaat de koppeling al (met de hand, via de aanmeldlink of
  -- het gekochte programma zelf), dan blijft die zoals hij is.
  insert into public.blog_program_members (company_id, blog_program_id, athlete_id, via_order)
  select g.bedrijf, g.prog, p_profile, g.bestelling
    from private.abonnement_gewenst(p_profile) g
  on conflict (blog_program_id, athlete_id) do nothing;
end
$$;

-- 4a. Bestelling verandert (betaald, gestopt, herroepen, ander account): koppelingen bijwerken.
-- Plus een interne melding bij een dubbel abonnement: één abonnement geeft al alles.
create or replace function private.abonnement_na_bestelling()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.abonnement_sync(new.profile_id);
  if tg_op = 'UPDATE' and old.profile_id is distinct from new.profile_id then
    perform private.abonnement_sync(old.profile_id);
  end if;

  if new.status = 'paid'
     and (tg_op = 'INSERT' or old.status is distinct from 'paid')
     and new.profile_id is not null
     and new.withdrawn_at is null
     and exists (select 1 from public.blog_programs b
                  where b.id = new.blog_program_id and b.in_abonnement and not b.hidden)
     and exists (select 1 from public.shop_orders x
                   join public.blog_programs xb on xb.id = x.blog_program_id
                  where x.profile_id = new.profile_id and x.id <> new.id
                    and x.company_id = new.company_id
                    and x.status = 'paid' and x.withdrawn_at is null
                    and xb.in_abonnement and not xb.hidden) then
    insert into public.app_meldingen (company_id, profile_id, soort, onderwerp, bericht, pagina, context)
    values (new.company_id, new.profile_id, 'vraag', 'Winkel: dubbel abonnement',
            coalesce(new.email, 'Een klant')
              || ' heeft een tweede abonnement afgesloten terwijl het eerste nog loopt. Eén abonnement geeft al toegang tot alle programma''s, dus deze klant betaalt nu dubbel. Zeg er één op en betaal zo nodig terug (Blog > Klanten > ⋮).',
            'winkel', jsonb_build_object('order_id', new.id, 'profile_id', new.profile_id));
  end if;
  return null;
end
$$;

drop trigger if exists shop_orders_abonnement_toegang on public.shop_orders;
create trigger shop_orders_abonnement_toegang
  after insert or update of status, withdrawn_at, profile_id, company_id, blog_program_id
  on public.shop_orders
  for each row execute function private.abonnement_na_bestelling();

-- 4b. Programma erbij, vinkje aan/uit of verborgen: alle lopende abonnees van dat bedrijf bijwerken.
create or replace function private.abonnement_na_programma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_oud uuid;
begin
  if tg_op = 'UPDATE' then
    v_oud := old.company_id;
  end if;
  for r in
    select distinct o.profile_id
      from public.shop_orders o
     where o.profile_id is not null
       and o.status = 'paid'
       and o.withdrawn_at is null
       and (o.company_id = new.company_id or o.company_id = v_oud)
  loop
    perform private.abonnement_sync(r.profile_id);
  end loop;
  return null;
end
$$;

drop trigger if exists blog_programs_abonnement_toegang on public.blog_programs;
create trigger blog_programs_abonnement_toegang
  after insert or update of in_abonnement, hidden, company_id
  on public.blog_programs
  for each row execute function private.abonnement_na_programma();

-- 4c. Koppeling weggehaald (met de hand, of door shop_afsluiten bij een gestopt abonnement):
-- heeft dit lid nog een lopend abonnement, dan krijgt hij de programma's die daarbij horen
-- meteen terug. Weggehaald door de database zelf (deze functies, of mee verwijderd met een
-- programma of account): niets doen.
create or replace function private.abonnement_na_ontkoppelen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  perform private.abonnement_sync(old.athlete_id);
  return null;
end
$$;

drop trigger if exists blog_program_members_abonnement_herstel on public.blog_program_members;
create trigger blog_program_members_abonnement_herstel
  after delete on public.blog_program_members
  for each row execute function private.abonnement_na_ontkoppelen();

revoke all on function private.abonnement_gewenst(uuid) from public;
revoke all on function private.abonnement_sync(uuid) from public;
revoke all on function private.abonnement_na_bestelling() from public;
revoke all on function private.abonnement_na_programma() from public;
revoke all on function private.abonnement_na_ontkoppelen() from public;

-- 5. Bestaande lopende abonnementen meteen bijwerken (op 18 nov 2026 zijn dat er nul: Stripe
-- staat nog in testmodus).
do $$
declare r record;
begin
  for r in select distinct profile_id from public.shop_orders
            where profile_id is not null and status = 'paid' and withdrawn_at is null
  loop
    perform private.abonnement_sync(r.profile_id);
  end loop;
end
$$;
