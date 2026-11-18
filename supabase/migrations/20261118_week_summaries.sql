-- Weekcheck: samenvatting van een trainingsweek in gewone zinnen (18 nov 2026).
-- De Edge Function weekcheck-samenvatting schrijft hier (met de service-rol, na
-- eigen controle van rol en klant); coaches lezen alleen. Eén samenvatting per
-- atleet per periode; opnieuw samenvatten overschrijft. Het lid ziet dit niet.
create table public.week_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  period_from date not null,
  period_to date not null,
  summary text not null,
  model text,
  tokens_in integer,
  tokens_out integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint week_summaries_period_ok check (period_to >= period_from),
  constraint week_summaries_athlete_period_key unique (athlete_id, period_to)
);
create index week_summaries_company_idx on public.week_summaries (company_id);
create index week_summaries_created_by_idx on public.week_summaries (created_by);

alter table public.week_summaries enable row level security;

create policy week_summaries_admin_all on public.week_summaries for all
  using ((select private.my_role()) = 'platform_admin'::user_role)
  with check ((select private.my_role()) = 'platform_admin'::user_role);

create policy week_summaries_owner_read on public.week_summaries for select
  using ((select private.my_role()) = 'eigenaar'::user_role and company_id = (select private.my_company()));

create policy week_summaries_coach_read on public.week_summaries for select
  using ((select private.my_role()) = 'coach'::user_role
    and exists (select 1 from public.profiles p where p.id = week_summaries.athlete_id and p.coach_id = (select auth.uid())));

revoke all on public.week_summaries from anon;
