-- Feedbackronde 6 punt 5 (12 nov 2026): eigen metrics per bedrijf.
-- Een coach voegt een eigen metric toe bij één klant; via deze lijst staat de
-- naam daarna bij alle klanten van het bedrijf onder "Eigen metrics".
-- Toegepast op het project via de Supabase MCP (migratie company_metrics_eigen_metrics).
create table public.company_metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  unit text check (unit is null or length(unit) <= 20),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.company_metrics is 'Eigen metrics per bedrijf: namen (met standaardeenheid) die bij elke klant onder Eigen metrics staan. De metingen zelf staan in metrics.';

create unique index company_metrics_naam_uniek on public.company_metrics (company_id, lower(btrim(name)));
create index company_metrics_created_by_idx on public.company_metrics (created_by);

alter table public.company_metrics enable row level security;

-- Coaches en eigenaren binnen hun eigen bedrijf; platform_admin overal. Leden hebben geen toegang.
create policy company_metrics_staff_all on public.company_metrics
  for all to authenticated
  using (
    (select private.my_role()) = 'platform_admin'::user_role
    or ((select private.my_role()) = any (array['eigenaar'::user_role, 'coach'::user_role])
        and company_id = (select private.my_company()))
  )
  with check (
    (select private.my_role()) = 'platform_admin'::user_role
    or ((select private.my_role()) = any (array['eigenaar'::user_role, 'coach'::user_role])
        and company_id = (select private.my_company()))
  );

revoke all on public.company_metrics from anon;

-- Eerste rij (los uitgevoerd): '20 min. FTP Test' met eenheid watt voor YourProgram,
-- de eigen metric uit de feedback.
