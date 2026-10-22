-- Programmadata, versie 3 (22 okt 2026, avond): als v2, plus per workout de naam van de
-- Showdown (bron) die erin zit, zodat de Leaderboards- en Data-lijsten die kunnen tonen.
create or replace function public.blog_program_data(p_program uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.blog_programs%rowtype;
  v_role public.user_role;
  v_week date := date_trunc('week', current_date)::date;
  v_out jsonb;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd';
  end if;
  v_role := private.my_role();
  if v_role not in ('coach', 'eigenaar', 'platform_admin') then
    raise exception 'geen toegang';
  end if;
  select * into v_prog from public.blog_programs where id = p_program;
  if not found then
    raise exception 'programma niet gevonden';
  end if;
  if v_role <> 'platform_admin' and v_prog.company_id is distinct from private.my_company() then
    raise exception 'geen toegang';
  end if;

  with
  -- Alle dagen van het programma. Scores komen via drie wegen binnen: direct op de
  -- workout, op het origineel van een gekopieerde weekworkout (workouts.source_blog_workout_id)
  -- of op het origineel van een Showdown-blok (blocks.source_blog_workout_id). UNION (niet
  -- UNION ALL) zodat een score die via twee wegen binnenkomt één keer telt.
  days as (
    select w.id, w.workout_date, w.title, w.source_blog_workout_id
    from public.workouts w
    where w.blog_program_id = p_program and w.audience = 'blog'
  ),
  res as (
    select r.id, r.athlete_id, coalesce(r.athlete_id::text, 'gast:' || coalesce(lower(r.guest_name), r.id::text)) as wie,
      r.status, r.rx, r.is_public, r.created_at, d.workout_date, d.id as workout_id
    from days d join public.results r on r.workout_id = d.id
    union
    select r.id, r.athlete_id, coalesce(r.athlete_id::text, 'gast:' || coalesce(lower(r.guest_name), r.id::text)),
      r.status, r.rx, r.is_public, r.created_at, d.workout_date, d.id
    from days d join public.results r on r.workout_id = d.source_blog_workout_id
    where d.source_blog_workout_id is not null
    union
    select r.id, r.athlete_id, coalesce(r.athlete_id::text, 'gast:' || coalesce(lower(r.guest_name), r.id::text)),
      r.status, r.rx, r.is_public, r.created_at, d.workout_date, d.id
    from days d
    join public.blocks b on b.workout_id = d.id and b.source_blog_workout_id is not null
    join public.results r on r.workout_id = b.source_blog_workout_id
  ),
  -- Per persoon (lid of gast) per dag: één regel (scores zijn per blok gelogd).
  dagen as (
    select athlete_id, wie, workout_date, workout_id,
      bool_or(status = 'completed') as voltooid,
      bool_or(status = 'missed') as gemist,
      max(created_at) as gelogd_op,
      bool_or(rx = 'rx') as rx, bool_or(rx = 'scaled') as scaled,
      bool_or(is_public) as openbaar
    from res group by 1, 2, 3, 4
  ),
  members as (
    select m.athlete_id, m.created_at as sinds, p.first_name, p.last_name, p.email,
      p.membership_type::text as membership_type, p.archived, p.avatar_url
    from public.blog_program_members m join public.profiles p on p.id = m.athlete_id
    where m.blog_program_id = p_program
  ),
  orders as (
    select o.id, o.profile_id, o.status, o.created_at, o.cancel_at,
      coalesce(o.cancel_at, case when o.status = 'canceled' then o.updated_at end) as stop_op
    from public.shop_orders o
    where o.blog_program_id = p_program and o.status in ('paid', 'canceled') and o.withdrawn_at is null
  ),
  lo as (
    select distinct on (profile_id) * from orders where profile_id is not null
    order by profile_id, (status = 'paid') desc, created_at desc
  ),
  betaalt as (
    select mb.athlete_id, (lo.status = 'paid' and (lo.cancel_at is null or lo.cancel_at > now())) is true as ja,
      case when lo.status = 'paid' then lo.cancel_at end as opgezegd_tot
    from members mb left join lo on lo.profile_id = mb.athlete_id
  ),
  wk as (
    select athlete_id, date_trunc('week', workout_date)::date as wk
    from dagen where voltooid and athlete_id is not null group by 1, 2
  ),
  wkr as (
    select athlete_id, wk,
      row_number() over (partition by athlete_id order by wk desc) as rn,
      max(wk) over (partition by athlete_id) as mx
    from wk
  ),
  streak as (
    select athlete_id,
      case when mx < v_week - 7 then 0 else count(*) filter (where wk = mx - ((rn - 1) * 7)::int) end as n
    from wkr group by athlete_id, mx
  ),
  maanden as (
    select (date_trunc('month', current_date) - (n * interval '1 month'))::date as m from generate_series(0, 11) n
  ),
  weken as (
    select (v_week - n * 7)::date as ws from generate_series(0, 7) n
  )
  select jsonb_build_object(
    'programma', jsonb_build_object('id', v_prog.id, 'naam', v_prog.name, 'price_cents', v_prog.price_cents, 'price_interval', v_prog.price_interval),
    'volgers', (
      select jsonb_build_object(
        'totaal', count(*),
        'betaald', count(*) filter (where b.ja),
        'opgezegd', count(*) filter (where b.ja and b.opgezegd_tot is not null),
        'een_op_een', count(*) filter (where not b.ja and mb.membership_type = 'one_on_one'),
        'gratis', count(*) filter (where not b.ja and coalesce(mb.membership_type, '') <> 'one_on_one'),
        'archief', count(*) filter (where mb.archived)
      )
      from members mb join betaalt b on b.athlete_id = mb.athlete_id
    ),
    'actief', (
      select jsonb_build_object(
        'd7', count(distinct wie) filter (where gelogd_op >= now() - interval '7 days'),
        'd30', count(distinct wie) filter (where gelogd_op >= now() - interval '30 days'),
        'sessies_30d', count(*) filter (where voltooid and workout_date >= current_date - 30),
        'sessies_totaal', count(*) filter (where voltooid),
        'gemist_30d', count(*) filter (where gemist and not voltooid and workout_date >= current_date - 30),
        'atleten_totaal', count(distinct wie),
        'gasten', count(distinct wie) filter (where athlete_id is null)
      )
      from dagen
    ),
    'rx_scaled', (
      select jsonb_build_object('rx', count(*) filter (where rx), 'scaled', count(*) filter (where scaled)) from dagen
    ),
    'per_maand', (
      select jsonb_agg(jsonb_build_object(
        'maand', to_char(m, 'YYYY-MM'),
        'nieuw', (select count(*) from members mb where mb.sinds >= m and mb.sinds < m + interval '1 month'),
        'betaald_nieuw', (select count(*) from orders o where o.created_at >= m and o.created_at < m + interval '1 month'),
        'betaald_gestopt', (select count(*) from orders o where o.stop_op >= m and o.stop_op < m + interval '1 month' and o.stop_op <= now()),
        'betaald_actief', (select count(*) from orders o where o.created_at < m + interval '1 month' and (o.stop_op is null or o.stop_op >= least((m + interval '1 month')::timestamptz, now()))),
        'sessies', (select count(*) from dagen g where g.voltooid and g.workout_date >= m and g.workout_date < m + interval '1 month'),
        'atleten', (select count(distinct g.wie) from dagen g where g.voltooid and g.workout_date >= m and g.workout_date < m + interval '1 month')
      ) order by m)
      from maanden
    ),
    'per_week', (
      select jsonb_agg(jsonb_build_object(
        'week', ws,
        'dagen', (select count(distinct d.workout_date) from days d where d.workout_date >= ws and d.workout_date < ws + 7 and d.workout_date <= current_date),
        'voltooid', (select count(*) from dagen g where g.voltooid and g.workout_date >= ws and g.workout_date < ws + 7),
        'gemist', (select count(*) from dagen g where g.gemist and not g.voltooid and g.workout_date >= ws and g.workout_date < ws + 7),
        'atleten', (select count(distinct g.wie) from dagen g where g.voltooid and g.workout_date >= ws and g.workout_date < ws + 7)
      ) order by ws)
      from weken
    ),
    'meest_gedaan', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select d.id as workout_id, d.workout_date, d.title,
          (select string_agg(x.t, ', ') from (select sw.title as t from public.blocks b join public.workouts sw on sw.id = b.source_blog_workout_id where b.workout_id = d.id union select sw2.title from public.workouts sw2 where sw2.id = d.source_blog_workout_id) x) as bron,
          (select count(*) from dagen g where g.workout_id = d.id and g.voltooid) as voltooid,
          (select count(*) from dagen g where g.workout_id = d.id and g.gemist and not g.voltooid) as gemist
        from days d
        where d.workout_date >= current_date - 56 and d.workout_date <= current_date
        order by 5 desc, 6 asc, d.workout_date desc limit 5
      ) x where x.voltooid > 0
    ),
    'meest_gemist', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select d.id as workout_id, d.workout_date, d.title,
          (select string_agg(x.t, ', ') from (select sw.title as t from public.blocks b join public.workouts sw on sw.id = b.source_blog_workout_id where b.workout_id = d.id union select sw2.title from public.workouts sw2 where sw2.id = d.source_blog_workout_id) x) as bron,
          (select count(*) from dagen g where g.workout_id = d.id and g.voltooid) as voltooid,
          (select count(*) from dagen g where g.workout_id = d.id and g.gemist and not g.voltooid) as gemist
        from days d
        where d.workout_date >= current_date - 56 and d.workout_date <= current_date
        order by 6 desc, 5 asc, d.workout_date desc limit 5
      ) x where x.gemist > 0
    ),
    'recente_workouts', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select d.id as workout_id, d.workout_date, d.title,
          (select string_agg(x.t, ', ') from (select sw.title as t from public.blocks b join public.workouts sw on sw.id = b.source_blog_workout_id where b.workout_id = d.id union select sw2.title from public.workouts sw2 where sw2.id = d.source_blog_workout_id) x) as bron,
          (select count(*) from dagen g where g.workout_id = d.id and g.voltooid) as voltooid,
          (select count(*) from dagen g where g.workout_id = d.id and g.openbaar) as openbaar
        from days d
        where d.workout_date <= current_date
        order by d.workout_date desc limit 12
      ) x
    ),
    'klanten', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'athlete_id', mb.athlete_id,
        'first_name', mb.first_name, 'last_name', mb.last_name, 'email', mb.email,
        'avatar_url', mb.avatar_url, 'membership_type', mb.membership_type, 'archived', mb.archived,
        'sinds', mb.sinds,
        'betaald', b.ja,
        'opgezegd_tot', b.opgezegd_tot,
        'laatste_training', (select max(g.workout_date) from dagen g where g.athlete_id = mb.athlete_id and g.voltooid),
        'laatst_gelogd', (select max(g.gelogd_op) from dagen g where g.athlete_id = mb.athlete_id),
        'sessies_totaal', (select count(*) from dagen g where g.athlete_id = mb.athlete_id and g.voltooid),
        'sessies_30d', (select count(*) from dagen g where g.athlete_id = mb.athlete_id and g.voltooid and g.workout_date >= current_date - 30),
        'gemist_30d', (select count(*) from dagen g where g.athlete_id = mb.athlete_id and g.gemist and not g.voltooid and g.workout_date >= current_date - 30),
        'openbaar', (select count(*) from dagen g where g.athlete_id = mb.athlete_id and g.openbaar),
        'rx', (select count(*) from dagen g where g.athlete_id = mb.athlete_id and g.rx),
        'scaled', (select count(*) from dagen g where g.athlete_id = mb.athlete_id and g.scaled),
        'streak_weken', coalesce((select s.n from streak s where s.athlete_id = mb.athlete_id), 0)
      ) order by mb.first_name, mb.last_name), '[]'::jsonb)
      from members mb join betaalt b on b.athlete_id = mb.athlete_id
    ),
    'programma_dagen', jsonb_build_object(
      'd30', (select count(distinct d.workout_date) from days d where d.workout_date > current_date - 30 and d.workout_date <= current_date),
      'totaal', (select count(distinct d.workout_date) from days d where d.workout_date <= current_date),
      'eerste', (select min(d.workout_date) from days d),
      'laatste', (select max(d.workout_date) from days d)
    ),
    'gemaakt_op', now()
  ) into v_out;
  return v_out;
end;
$$;
