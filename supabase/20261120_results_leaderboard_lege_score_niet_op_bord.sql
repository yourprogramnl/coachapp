-- Aanvulling op results_leaderboard_altijd_zichtbaar (20 nov 2026): een lege score hoort niet op het
-- bord. Aanleiding: een atleet deed een andere workout en vulde 0:00 in om het blok af te vinken;
-- dat stond bovenaan het leaderboard. Regel: op een leaderboard-workout is een voltooide score
-- zichtbaar als er echt iets is ingevuld (tijd, reps, rondes, gewicht, waarde, tekst of sets), en
-- anders niet. De sporter kiest dit niet zelf.
create or replace function private.results_leaderboard_zichtbaar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_leeg boolean;
begin
  if new.status = 'completed'
     and exists (select 1 from public.workouts w where w.id = new.workout_id and w.audience in ('blog', 'bord')) then
    v_leeg := coalesce(new.time_seconds, 0) = 0 and coalesce(new.reps, 0) = 0 and coalesce(new.rounds, 0) = 0
          and coalesce(new.load_kg, 0) = 0 and coalesce(new.score_value, 0) = 0
          and nullif(btrim(coalesce(new.score_text, '')), '') is null
          and (new.sets is null or jsonb_typeof(new.sets) <> 'array' or jsonb_array_length(new.sets) = 0);
    new.is_public := not v_leeg;
  end if;
  return new;
end
$function$;

revoke all on function private.results_leaderboard_zichtbaar() from public, anon, authenticated;
