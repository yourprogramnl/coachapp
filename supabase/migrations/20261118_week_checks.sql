-- Weekcheck (18 nov 2026): de coach loopt per trainingsdag de week van zijn
-- atleten na en vinkt af. Eén rij per atleet per periode; de notitie en een
-- korte samenvatting blijven in het dossier van de atleet staan. Alleen voor
-- coaches (zelfde opzet als consults); het lid ziet dit niet.
create table public.week_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  checked_by uuid references public.profiles(id) on delete set null,
  period_from date not null,
  period_to date not null,
  note text,
  summary jsonb,
  created_at timestamptz not null default now(),
  constraint week_checks_period_ok check (period_to >= period_from),
  constraint week_checks_athlete_period_key unique (athlete_id, period_to)
);
create index week_checks_company_idx on public.week_checks (company_id);
create index week_checks_checked_by_idx on public.week_checks (checked_by);

alter table public.week_checks enable row level security;

create policy week_checks_admin_all on public.week_checks for all
  using ((select private.my_role()) = 'platform_admin'::user_role)
  with check ((select private.my_role()) = 'platform_admin'::user_role);

create policy week_checks_owner_all on public.week_checks for all
  using ((select private.my_role()) = 'eigenaar'::user_role and company_id = (select private.my_company()))
  with check ((select private.my_role()) = 'eigenaar'::user_role and company_id = (select private.my_company()));

create policy week_checks_coach_all on public.week_checks for all
  using ((select private.my_role()) = 'coach'::user_role
    and exists (select 1 from public.profiles p where p.id = week_checks.athlete_id and p.coach_id = (select auth.uid())))
  with check ((select private.my_role()) = 'coach'::user_role
    and company_id = (select private.my_company())
    and exists (select 1 from public.profiles p where p.id = week_checks.athlete_id and p.coach_id = (select auth.uid())));

revoke all on public.week_checks from anon;
