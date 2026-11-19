-- Leaderboard-workout voor 1-op-1 klanten (19 nov 2026, keuze Stefan).
-- De coach zet op een blok bij een klant "Leaderboard aan". Er komt dan een bron-workout met
-- audience 'bord'; blokken bij klanten wijzen ernaar via het bestaande source_blog_workout_id,
-- precies zoals bij een ingevoegde YP Showdown. De telefoon-app kijkt niet naar de audience van
-- de bron, dus de huidige app toont Rx/Scaled, het vinkje Openbaar en het leaderboard al.
-- Verschil met de Showdown: alleen wie de workout in zijn eigen kalender heeft (en de coaches)
-- ziet de workout en het bord. Blog-leden en gratis leden zien er niets van.
alter table public.workouts drop constraint workouts_audience_check;
alter table public.workouts add constraint workouts_audience_check
  check (audience = any (array['client'::text, 'company'::text, 'blog'::text, 'blog_concept'::text, 'bord'::text]));
comment on column public.workouts.audience is
  'client = 1-op-1, company = groep, blog = openbare weekworkout of blogprogramma, blog_concept = Showdown in de bouwer die nog niet live staat, bord = leaderboard-workout voor 1-op-1 klanten (alleen zichtbaar voor wie hem in zijn kalender heeft en voor coaches)';

create index if not exists blocks_source_blog_idx on public.blocks (source_blog_workout_id) where source_blog_workout_id is not null;

-- De bron-workouts waar de ingelogde sporter in zijn eigen (zichtbare) kalender naar verwijst:
-- via een blok, of via de workout zelf bij een hele kopie.
create or replace function private.mijn_bordworkouts()
 returns uuid[]
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) from (
    select b.source_blog_workout_id as id
      from public.blocks b join public.workouts w on w.id = b.workout_id
     where b.source_blog_workout_id is not null and w.client_id = auth.uid() and w.status = 'published'
    union all
    select w.source_blog_workout_id
      from public.workouts w
     where w.source_blog_workout_id is not null and w.client_id = auth.uid() and w.status = 'published'
  ) x
$function$;
revoke all on function private.mijn_bordworkouts() from public, anon;
grant execute on function private.mijn_bordworkouts() to authenticated;

-- Mag de ingelogde gebruiker het bord van deze leaderboard-workout zien? Coaches en beheerders
-- altijd (het bedrijf wordt door de aanroeper gecontroleerd), sporters alleen als deelnemer.
create or replace function private.bord_mag(p_workout uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((select private.my_role()) = any (array['coach','eigenaar','platform_admin']::public.user_role[]), false)
      or p_workout = any (private.mijn_bordworkouts())
$function$;
revoke all on function private.bord_mag(uuid) from public, anon;
grant execute on function private.bord_mag(uuid) to authenticated;

create policy workouts_bord_read on public.workouts for select using (
  audience = 'bord'
  and company_id = (select private.my_company())
  and ((select private.my_role()) = any (array['coach'::public.user_role, 'eigenaar'::public.user_role, 'platform_admin'::public.user_role])
       or id = any ((select private.mijn_bordworkouts())::uuid[]))
);

-- Blokken en openbare scores van een leaderboard-workout: de leesregel leunt op de leesregel
-- van workouts hierboven (de subquery ziet een 'bord'-workout alleen als je erbij mag).
alter policy blocks_member_audience_read on public.blocks using (
  exists (select 1 from public.workouts w
    where w.id = blocks.workout_id
      and w.company_id = (select private.my_company())
      and (w.audience = 'blog' or w.audience = 'bord'
        or (w.audience = 'company' and exists (select 1 from public.profiles p
              where p.id = (select auth.uid()) and p.membership_type = 'one_on_one'::public.membership_type))))
);
alter policy results_leaderboard_read on public.results using (
  is_public = true
  and company_id = (select private.my_company())
  and exists (select 1 from public.workouts w where w.id = results.workout_id and (w.audience = 'blog' or w.audience = 'bord'))
);

create or replace function public.blog_leaderboard(p_workout_id uuid)
 returns table(result_id uuid, athlete_id uuid, block_id uuid, score_text text, time_seconds integer, load_kg numeric, reps integer, rounds integer, rx text, note text, media_url text, created_at timestamp with time zone, first_name text, last_name text, avatar_url text, gender text, membership_type text, likes bigint, liked_by_me boolean, comments bigint, capped boolean, score_value numeric)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select r.id, coalesce(r.athlete_id, r.id), r.block_id,
    r.score_text, r.time_seconds, r.load_kg, r.reps, r.rounds,
    case when r.athlete_id is not null and exists (
        select 1 from blocks b join workouts cw on cw.id = b.workout_id
        where b.scaled_versie and cw.client_id = r.athlete_id
          and (b.source_blog_workout_id = r.workout_id or cw.source_blog_workout_id = r.workout_id)
      ) then 'scaled' else r.rx end,
    r.note, r.media_url, r.created_at,
    coalesce(p.first_name, split_part(r.guest_name, ' ', 1)),
    coalesce(p.last_name, nullif(trim(substr(r.guest_name, length(split_part(r.guest_name, ' ', 1)) + 1)), '')),
    p.avatar_url,
    coalesce(p.gender, r.guest_gender),
    coalesce(p.membership_type::text, 'free_blog'),
    (select count(*) from result_likes l where l.result_id = r.id),
    exists(select 1 from result_likes l where l.result_id = r.id and l.profile_id = auth.uid()),
    (select count(*) from result_comments c where c.result_id = r.id),
    r.capped,
    r.score_value
  from results r
  join workouts w on w.id = r.workout_id
  left join profiles p on p.id = r.athlete_id
  where r.workout_id = p_workout_id
    and (w.audience = 'blog' or (w.audience = 'bord' and private.bord_mag(w.id)))
    and r.is_public = true
    and r.status = 'completed'
    and w.company_id = private.my_company()
    and auth.uid() is not null;
$function$;

create or replace function public.blog_comments(p_result_id uuid)
 returns table(id uuid, author_id uuid, body text, created_at timestamp with time zone, first_name text, last_name text, avatar_url text)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select c.id, c.author_id, c.body, c.created_at,
    p.first_name, p.last_name, p.avatar_url
  from result_comments c
  join results r on r.id = c.result_id
  join workouts w on w.id = r.workout_id
  join profiles p on p.id = c.author_id
  where c.result_id = p_result_id
    and (w.audience = 'blog' or (w.audience = 'bord' and private.bord_mag(w.id)))
    and r.is_public = true
    and r.company_id = private.my_company()
    and auth.uid() is not null
  order by c.created_at;
$function$;

create or replace function public.blog_likes(p_result_id uuid)
 returns table(profile_id uuid, first_name text, last_name text, avatar_url text, created_at timestamp with time zone)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select l.profile_id, p.first_name, p.last_name, p.avatar_url, l.created_at
  from result_likes l
  join results r on r.id = l.result_id
  join workouts w on w.id = r.workout_id
  join profiles p on p.id = l.profile_id
  where l.result_id = p_result_id
    and (w.audience = 'blog' or (w.audience = 'bord' and private.bord_mag(w.id)))
    and r.is_public = true
    and r.company_id = private.my_company()
    and auth.uid() is not null
  order by l.created_at desc;
$function$;
