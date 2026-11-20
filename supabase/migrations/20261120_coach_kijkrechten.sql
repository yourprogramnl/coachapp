-- Rechten coaches: meekijken bij de klanten van een andere coach (20 nov 2026).
-- Een beheerder bepaalt per coach bij welke andere coaches hij mag meekijken.
-- Meekijken = alleen het gepubliceerde programma lezen (workouts + blokken).
-- Scores, berichten, reacties, metingen, notities en klantgegevens blijven bij
-- de eigen coach.
--
-- Bewust GEEN nieuwe leesregels op profiles, workouts of blocks: veel andere
-- regels (results, messages, metrics, opslag) leunen op die tabellen, en de
-- lijsten in het dashboard en de telefoon-app zouden er ongemerkt klanten bij
-- krijgen. Het meekijken loopt daarom alleen via twee afgeschermde functies die
-- precies de programmavelden teruggeven en verder niets.

create table public.coach_kijkrechten (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint coach_kijkrechten_uniek unique (viewer_id, coach_id),
  constraint coach_kijkrechten_niet_zelf check (viewer_id <> coach_id)
);
comment on table public.coach_kijkrechten is
  'viewer_id mag meekijken bij de klanten van coach_id: alleen het gepubliceerde programma, via kijk_klanten() en kijk_programma(). Beheer in Instellingen > Rechten coaches.';

create index coach_kijkrechten_coach_idx on public.coach_kijkrechten (coach_id);
create index coach_kijkrechten_company_idx on public.coach_kijkrechten (company_id);
create index coach_kijkrechten_granted_by_idx on public.coach_kijkrechten (granted_by);

alter table public.coach_kijkrechten enable row level security;
revoke all on public.coach_kijkrechten from anon;

-- Lezen: beheerders alles van hun bedrijf, een coach alleen zijn eigen regels.
create policy coach_kijkrechten_lezen on public.coach_kijkrechten
  for select to authenticated
  using (
    viewer_id = (select auth.uid())
    or (select private.my_role()) = 'platform_admin'::public.user_role
    or ((select private.my_role()) = 'eigenaar'::public.user_role and company_id = (select private.my_company()))
  );

-- Uitdelen en intrekken: alleen beheerders.
create policy coach_kijkrechten_toevoegen on public.coach_kijkrechten
  for insert to authenticated
  with check (
    (select private.my_role()) = 'platform_admin'::public.user_role
    or ((select private.my_role()) = 'eigenaar'::public.user_role and company_id = (select private.my_company()))
  );

create policy coach_kijkrechten_intrekken on public.coach_kijkrechten
  for delete to authenticated
  using (
    (select private.my_role()) = 'platform_admin'::public.user_role
    or ((select private.my_role()) = 'eigenaar'::public.user_role and company_id = (select private.my_company()))
  );

-- Controle bij het uitdelen: beide personen horen bij dit bedrijf en zijn coach
-- of beheerder. Legt ook vast wie het recht heeft uitgedeeld.
create or replace function private.coach_kijkrechten_controle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  c record;
begin
  select company_id, role into v from public.profiles where id = new.viewer_id;
  select company_id, role into c from public.profiles where id = new.coach_id;
  if v.company_id is distinct from new.company_id or c.company_id is distinct from new.company_id then
    raise exception 'Beide coaches moeten bij hetzelfde bedrijf horen' using errcode = '23514';
  end if;
  if v.role not in ('coach', 'eigenaar', 'platform_admin') or c.role not in ('coach', 'eigenaar', 'platform_admin') then
    raise exception 'Kijkrechten kunnen alleen tussen coaches' using errcode = '23514';
  end if;
  if auth.uid() is not null then
    new.granted_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger coach_kijkrechten_controle
  before insert on public.coach_kijkrechten
  for each row execute function private.coach_kijkrechten_controle();

-- Mag de ingelogde coach meekijken bij deze klant?
create or replace function private.mag_meekijken(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
      join public.coach_kijkrechten k on k.coach_id = p.coach_id
      join public.profiles ik on ik.id = k.viewer_id
     where p.id = p_client
       and k.viewer_id = auth.uid()
       and ik.role in ('coach', 'eigenaar', 'platform_admin')
       and ik.archived = false
       and p.company_id = ik.company_id
       and k.company_id = ik.company_id
       and p.archived = false
       and p.id <> ik.id
  );
$$;
revoke all on function private.mag_meekijken(uuid) from public, anon;

-- De klanten bij wie ik mag meekijken: alleen naam, foto en bij welke coach.
-- Geen e-mail, telefoon, adres of notities.
create or replace function public.kijk_klanten()
returns table (
  id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  coach_id uuid,
  coach_first_name text,
  coach_last_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.first_name, p.last_name, p.avatar_url, p.coach_id, c.first_name, c.last_name
    from public.coach_kijkrechten k
    join public.profiles ik on ik.id = k.viewer_id
    join public.profiles c on c.id = k.coach_id
    join public.profiles p on p.coach_id = k.coach_id
   where k.viewer_id = auth.uid()
     and ik.role in ('coach', 'eigenaar', 'platform_admin')
     and ik.archived = false
     and k.company_id = ik.company_id
     and p.company_id = ik.company_id
     and p.archived = false
     and p.id <> ik.id
   order by c.first_name, c.last_name, p.first_name, p.last_name;
$$;
revoke all on function public.kijk_klanten() from public, anon;
grant execute on function public.kijk_klanten() to authenticated;

-- Het gepubliceerde programma van één klant in een periode, als JSON.
-- Alleen wat de coach heeft geprogrammeerd; niets wat de sporter heeft gelogd
-- en ook niet de persoonlijke dagnotitie van de coach (workouts.coach_notes).
create or replace function public.kijk_programma(p_client uuid, p_van date, p_tot date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
declare
  uit jsonb;
begin
  if auth.uid() is null or not private.mag_meekijken(p_client) then
    raise exception 'Je mag bij deze klant niet meekijken' using errcode = '42501';
  end if;
  if p_van is null or p_tot is null or p_tot < p_van or p_tot - p_van > 200 then
    raise exception 'Ongeldige periode' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(x.w order by x.workout_date, x.day_sort nulls last, x.created_at), '[]'::jsonb)
    into uit
    from (
      select w.workout_date, w.day_sort, w.created_at,
             jsonb_build_object(
               'id', w.id,
               'workout_date', w.workout_date,
               'title', w.title,
               'warmup', w.warmup,
               'cooldown', w.cooldown,
               'warmup_oefening_id', w.warmup_oefening_id,
               'cooldown_oefening_id', w.cooldown_oefening_id,
               'warmup_media', w.warmup_media,
               'cooldown_media', w.cooldown_media,
               'blocks', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', b.id,
                          'sort', b.sort,
                          'label', b.label,
                          'exercise', b.exercise,
                          'prescription', b.prescription,
                          'notes', b.notes,
                          'kind', b.kind,
                          'sets', b.sets,
                          'reps', b.reps,
                          'tempo', b.tempo,
                          'rest', b.rest,
                          'linked', b.linked,
                          'score_type', b.score_type,
                          'color', b.color,
                          'oefening_id', b.oefening_id,
                          'media', b.media,
                          'timecap_seconds', b.timecap_seconds,
                          'group_title', b.group_title
                        ) order by b.sort, b.id)
                   from public.blocks b
                  where b.workout_id = w.id), '[]'::jsonb)
             ) as w
        from public.workouts w
       where w.client_id = p_client
         and w.audience = 'client'
         and w.status = 'published'
         and w.workout_date between p_van and p_tot
    ) x;
  return uit;
end;
$$;
revoke all on function public.kijk_programma(uuid, date, date) from public, anon;
grant execute on function public.kijk_programma(uuid, date, date) to authenticated;
