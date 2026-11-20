-- Leaderboard alsnog aanzetten op blokken die al in een klantkalender staan (20 nov 2026).
-- Aanleiding: de Amsterdam-simulaties stonden al bij de atleten voordat het leaderboard aan ging.
-- Een bestaand blok wordt aan een bestaande leaderboard-workout (audience 'bord') of aan de
-- YP Showdown (audience 'blog' zonder programma) gehangen. De score die de atleet al invulde
-- blijft op zijn eigen blok staan; het bord krijgt er een kopie van (zoals de telefoon-app dat
-- zelf doet bij opslaan). Een score die al op het bord staat wordt nooit overschreven.

create or replace function private.bord_koppel(p_bron uuid, p_blokken uuid[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_bron public.workouts%rowtype;
  v_bronblok uuid;
  v_rij record;
  v_reden text;
  v_gekoppeld int := 0;
  v_scores int := 0;
  v_n int;
  v_over jsonb := '[]'::jsonb;
  v_ok uuid[] := '{}'::uuid[];
begin
  select * into v_bron from public.workouts where id = p_bron;
  if not found or not (v_bron.audience = 'bord' or (v_bron.audience = 'blog' and v_bron.blog_program_id is null)) then
    return jsonb_build_object('fout', 'Geen leaderboard-workout of YP Showdown gevonden met dit id.');
  end if;
  select b.id into v_bronblok from public.blocks b where b.workout_id = p_bron order by b.sort, b.id limit 1;
  if v_bronblok is null then
    return jsonb_build_object('fout', 'Deze leaderboard-workout heeft geen blok.');
  end if;

  for v_rij in
    select b.id, b.linked, b.lift_id, b.score_type, b.kind, b.source_blog_workout_id as src,
           w.client_id, w.audience, w.company_id, w.source_blog_workout_id as wsrc,
           coalesce((select nb.linked from public.blocks nb
                      where nb.workout_id = b.workout_id and nb.sort > b.sort
                      order by nb.sort, nb.id limit 1), false) as volgende_linked
    from (select distinct u.id from unnest(p_blokken) as u(id)) x
    join public.blocks b on b.id = x.id
    join public.workouts w on w.id = b.workout_id
    order by w.workout_date, b.id
  loop
    v_reden := case
      when v_rij.audience <> 'client' or v_rij.client_id is null then 'geen blok uit een klantkalender'
      when v_rij.company_id is distinct from v_bron.company_id then 'ander bedrijf'
      when v_rij.src = p_bron then null
      when v_rij.src is not null or v_rij.wsrc is not null then 'hangt al aan een ander leaderboard of aan de Showdown'
      when v_rij.linked or v_rij.volgende_linked then 'blok zit in een superset'
      when v_rij.lift_id is not null then 'blok is aan een lift gekoppeld'
      when coalesce(v_rij.score_type, 'text') = 'none' then 'blok heeft geen score'
      when v_rij.kind = 'info' then 'tekstblok zonder score'
      when exists (select 1 from public.blocks b2 join public.workouts w2 on w2.id = b2.workout_id
                    where w2.client_id = v_rij.client_id and b2.source_blog_workout_id = p_bron and b2.id <> v_rij.id)
        or exists (select 1 from public.workouts w3
                    where w3.client_id = v_rij.client_id and w3.source_blog_workout_id = p_bron)
        then 'deze atleet heeft dit leaderboard al op een ander blok'
      else null
    end;
    if v_reden is not null then
      v_over := v_over || jsonb_build_object('blok', v_rij.id, 'reden', v_reden);
      continue;
    end if;

    if v_rij.src is distinct from p_bron then
      update public.blocks set source_blog_workout_id = p_bron where id = v_rij.id;
      v_gekoppeld := v_gekoppeld + 1;
    end if;
    v_ok := v_ok || v_rij.id;

    -- Kopie van de al ingevulde score naar het bord. Sets gaan niet mee (het bord toont alleen
    -- de einduitslag; load_kg en reps zijn op de eigen rij al uitgerekend).
    insert into public.results (block_id, workout_id, athlete_id, company_id, status, rx, is_public,
                                note, score_text, time_seconds, load_kg, reps, rounds, score_value, capped)
    select v_bronblok, p_bron, r.athlete_id, r.company_id, 'completed', coalesce(r.rx, 'rx'), true,
           r.note, r.score_text, r.time_seconds, r.load_kg, r.reps, r.rounds, r.score_value, coalesce(r.capped, false)
      from public.results r
     where r.block_id = v_rij.id and r.athlete_id = v_rij.client_id and r.status = 'completed'
    on conflict (block_id, athlete_id) do nothing;
    get diagnostics v_n = row_count;
    v_scores := v_scores + v_n;
  end loop;

  return jsonb_build_object('ok', true, 'leaderboard', p_bron, 'gekoppeld', v_gekoppeld,
                            'scores_op_bord_gezet', v_scores, 'blokken', to_jsonb(v_ok), 'overgeslagen', v_over);
end
$function$;

revoke all on function private.bord_koppel(uuid, uuid[]) from public, anon, authenticated;

-- Wat de coach-app aanroept. Rechten gelijk aan wat een coach zelf mag wijzigen: eigen
-- workouts (workouts.coach_id), en alles binnen het bedrijf voor eigenaar en platform_admin.
create or replace function public.bord_koppel_blokken(p_bron uuid, p_blokken uuid[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_rol public.user_role := private.my_role();
  v_bedrijf uuid := private.my_company();
  v_mag uuid[];
  v_vraag int;
  v_uit jsonb;
begin
  if v_uid is null or v_rol is null or v_rol not in ('coach', 'eigenaar', 'platform_admin') then
    raise exception 'Alleen een coach kan een leaderboard koppelen' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workouts w where w.id = p_bron and w.company_id = v_bedrijf) then
    return jsonb_build_object('fout', 'Geen leaderboard-workout of YP Showdown gevonden met dit id.');
  end if;
  select count(distinct u.id) into v_vraag from unnest(coalesce(p_blokken, '{}'::uuid[])) as u(id);
  if v_vraag = 0 then return jsonb_build_object('fout', 'Geen blokken opgegeven.'); end if;
  if v_vraag > 500 then return jsonb_build_object('fout', 'Te veel blokken in één keer (maximaal 500).'); end if;

  select coalesce(array_agg(distinct b.id), '{}'::uuid[]) into v_mag
    from public.blocks b join public.workouts w on w.id = b.workout_id
   where b.id = any (p_blokken) and w.company_id = v_bedrijf
     and (v_rol in ('eigenaar', 'platform_admin') or w.coach_id = v_uid);

  v_uit := private.bord_koppel(p_bron, v_mag);
  if v_uit ? 'fout' then return v_uit; end if;
  return v_uit || jsonb_build_object('geen_rechten_of_niet_gevonden', v_vraag - coalesce(array_length(v_mag, 1), 0));
end
$function$;

revoke all on function public.bord_koppel_blokken(uuid, uuid[]) from public, anon;
grant execute on function public.bord_koppel_blokken(uuid, uuid[]) to authenticated;
