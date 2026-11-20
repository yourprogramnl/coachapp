-- Melding op de telefoon bij een reactie of fist bump op je leaderboard-score (20 nov 2026).
-- Aanleiding: Michel reageerde op Toby's Showdown-score en Toby kreeg niets; voor result_comments
-- en result_likes bestond nog geen melding. De eigenaar van de score krijgt een push, van wie de
-- reactie ook komt (coach of mede-atleet), niet van zichzelf. Meerdere fist bumps op dezelfde score
-- binnen 30 minuten geven één melding. Wie meldingen voor reacties uit heeft staan krijgt niets.
-- soort 'leaderboard': de huidige app opent bij tikken gewoon de app (geen eigen bestemming).
-- Een fout in deze functie mag het reageren zelf nooit tegenhouden.
create or replace function private.push_bij_leaderboard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rij jsonb := to_jsonb(new);
  v_fist boolean := (tg_table_name = 'result_likes');
  v_wie uuid;
  v_ontvanger uuid; v_company uuid; v_workout uuid; v_wtitel text;
  v_en boolean; v_naam text; v_titel text; v_tekst text;
begin
  begin
    v_wie := coalesce(v_rij->>'author_id', v_rij->>'profile_id')::uuid;
    select r.athlete_id, r.company_id, r.workout_id, w.title
      into v_ontvanger, v_company, v_workout, v_wtitel
      from public.results r join public.workouts w on w.id = r.workout_id
     where r.id = new.result_id;
    if v_ontvanger is null or v_ontvanger = v_wie then return new; end if;
    if not private.push_prefs_aan(v_ontvanger, 'reactie') then return new; end if;
    if v_fist and exists (select 1 from public.push_queue q
                           where q.recipient_id = v_ontvanger and q.soort = 'leaderboard'
                             and q.data->>'wat' = 'fistbump' and q.data->>'result_id' = new.result_id::text
                             and q.created_at > now() - interval '30 minutes') then
      return new;
    end if;
    select coalesce(p.lang, 'nl') = 'en' into v_en from public.profiles p where p.id = v_ontvanger;
    v_naam := coalesce(private.naam_van(v_wie), case when v_en then 'Someone' else 'Iemand' end);
    if v_fist then
      v_titel := v_naam || case when v_en then ' gave you a fist bump' else ' gaf je een fist bump' end;
      v_tekst := coalesce(nullif(btrim(v_wtitel), ''), 'Leaderboard');
    else
      v_titel := v_naam || case when v_en then ' commented on your score' else ' reageerde op je score' end;
      v_tekst := coalesce(nullif(btrim(v_rij->>'body'), ''), nullif(btrim(v_wtitel), ''), 'Leaderboard');
    end if;
    perform private.queue_push(v_company, v_ontvanger, 'leaderboard', v_titel, v_tekst,
      jsonb_build_object('wat', case when v_fist then 'fistbump' else 'reactie' end,
                         'result_id', new.result_id, 'leaderboard_workout_id', v_workout));
  exception when others then
    null;
  end;
  return new;
end
$function$;

revoke all on function private.push_bij_leaderboard() from public, anon, authenticated;

drop trigger if exists result_comments_queue_push on public.result_comments;
create trigger result_comments_queue_push after insert on public.result_comments
  for each row execute function private.push_bij_leaderboard();

drop trigger if exists result_likes_queue_push on public.result_likes;
create trigger result_likes_queue_push after insert on public.result_likes
  for each row execute function private.push_bij_leaderboard();
