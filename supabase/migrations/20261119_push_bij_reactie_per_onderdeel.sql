-- Feedback per onderdeel (19 nov 2026): de pushmelding zegt over welk onderdeel het gaat.
-- Alleen voor reacties met block_id; een reactie op de dag (block_id leeg) geeft
-- precies dezelfde melding als voorheen. De melding krijgt block_id mee, zodat de
-- app later naar het onderdeel kan doorlinken (oudere apps negeren dat veld).
create or replace function private.push_bij_reactie() returns trigger
language plpgsql security definer set search_path to '' as $function$
declare v_recipient uuid; v_datum date; v_titel text; v_tekst text; v_oef text; v_naam text; v_data jsonb;
begin
  select workout_date into v_datum from public.workouts where id = new.workout_id;
  v_tekst := private.push_tekst(new.body, new.media);
  v_data := jsonb_build_object('athlete_id', new.athlete_id, 'workout_id', new.workout_id, 'workout_date', v_datum);
  if new.block_id is not null then
    select nullif(btrim(exercise), '') into v_oef from public.blocks where id = new.block_id;
    v_data := v_data || jsonb_build_object('block_id', new.block_id);
  end if;
  if new.author_id = new.athlete_id then
    select coach_id into v_recipient from public.profiles where id = new.athlete_id;
    v_titel := coalesce(private.naam_van(new.athlete_id), 'Je klant') || ' reageerde op '
      || case when new.block_id is not null then coalesce(v_oef, 'een onderdeel') else 'een workout-dag' end;
  else
    v_recipient := new.athlete_id;
    if new.block_id is not null then
      v_naam := coalesce(private.naam_van(new.author_id), 'Je coach');
      v_titel := 'Feedback op ' || coalesce(v_oef, 'je onderdeel');
      if coalesce(new.body, '') <> '' then
        v_tekst := v_naam || ': ' || new.body;
      elsif jsonb_typeof(new.media) = 'array' and jsonb_array_length(new.media) > 0 then
        v_tekst := v_naam || ' stuurde een '
          || case when exists (select 1 from jsonb_array_elements(new.media) m where m->>'kind' = 'video') then 'video' else 'foto' end;
      end if;
    else
      v_titel := 'Reactie van ' || coalesce(private.naam_van(new.author_id), 'je coach');
    end if;
  end if;
  perform private.queue_push(new.company_id, v_recipient, 'reactie', v_titel, v_tekst, v_data);
  return new;
end $function$;
