-- Scaled-versie van een ingevoegde Showdown (19 nov 2026, keuze Stefan).
-- De coach zet de YP Showdown bij een 1-op-1 klant in en past hem aan (pull-ups worden
-- ring rows). Met scaled_versie = true staat die klant op het gedeelde leaderboard altijd
-- onder Scaled, wat hij in de app ook aantikt. Het leaderboard leest dit; de opgeslagen
-- score zelf verandert niet, dus loggen blijft precies zoals het was.
alter table public.blocks add column scaled_versie boolean not null default false;
comment on column public.blocks.scaled_versie is
  'true = de coach heeft deze ingevoegde weekworkout (source_blog_workout_id op het blok of op de workout) voor deze klant geschaald; blog_leaderboard toont de klant dan onder Scaled';
create index blocks_scaled_versie_idx on public.blocks (workout_id) where scaled_versie;

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
    and w.audience = 'blog'
    and r.is_public = true
    and r.status = 'completed'
    and w.company_id = private.my_company()
    and auth.uid() is not null;
$function$;
