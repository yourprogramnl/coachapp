-- Een score op een leaderboard is altijd zichtbaar (besluit Stefan, 20 nov 2026; vervangt de regel
-- van 19 nov dat een sporter zichzelf van het bord kon halen). Wie niet op het bord wil staan logt
-- geen score. De regel staat in de database, zodat hij ook geldt voor telefoons met een oudere
-- app-versie waarin het vinkje "Openbaar op het leaderboard" nog staat.
-- Leaderboards zijn workouts met audience 'blog' (YP Showdown en blogprogramma's) en 'bord'
-- (leaderboard-workout voor 1-op-1). Een gemiste workout (status 'missed') komt nooit op het bord.
create or replace function private.results_leaderboard_zichtbaar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status = 'completed' and new.is_public is distinct from true
     and exists (select 1 from public.workouts w where w.id = new.workout_id and w.audience in ('blog', 'bord')) then
    new.is_public := true;
  end if;
  return new;
end
$function$;

revoke all on function private.results_leaderboard_zichtbaar() from public, anon, authenticated;

drop trigger if exists results_leaderboard_zichtbaar on public.results;
create trigger results_leaderboard_zichtbaar
  before insert or update on public.results
  for each row execute function private.results_leaderboard_zichtbaar();
