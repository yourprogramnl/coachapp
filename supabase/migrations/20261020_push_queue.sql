-- Kopie van de migratie push_queue_en_push_triggers (toegepast op 20 okt 2026 via de Supabase MCP).
-- Feedbackronde 5, ronde D: pushmeldingen echt versturen.
-- Wachtrij (alleen de server leest hem, zoals mail_queue), hulpfuncties die de
-- ontvanger en de vinkjes bepalen, triggers op berichten/dagreacties/groepschat/
-- afgetekende workouts, en de bezorging: een trigger roept direct de Edge
-- Function push-send aan; pg_cron veegt elke minuut na.
-- Eerdere migratie dezelfde dag (dagreacties_media_en_emoji_reacties): kolom
-- workout_comments.media en tabel workout_comment_reactions met RLS.

create table if not exists public.push_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  soort text not null,
  titel text not null,
  body text not null,
  data jsonb,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  send_after timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists push_queue_pending_idx on public.push_queue(status, send_after) where status = 'pending';
create index if not exists push_queue_recipient_idx on public.push_queue(recipient_id, created_at);
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

create or replace function private.naam_van(p_id uuid) returns text
language sql security definer set search_path = '' stable as $$
  select nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
  from public.profiles p where p.id = p_id;
$$;

-- Staf volgt notify_prefs.app (Instellingen > Notificaties, standaard aan); een lid notify_prefs.push (standaard aan).
create or replace function private.push_prefs_aan(p_recipient uuid, p_soort text) returns boolean
language sql security definer set search_path = '' stable as $$
  select case
    when p.id is null then false
    when p.role in ('coach','eigenaar','platform_admin') then coalesce((p.notify_prefs->'app'->>p_soort)::boolean, true)
    else coalesce((p.notify_prefs->'push'->>p_soort)::boolean, true)
  end
  from public.profiles p where p.id = p_recipient;
$$;

create or replace function private.queue_push(p_company uuid, p_recipient uuid, p_soort text, p_titel text, p_body text, p_data jsonb default '{}'::jsonb, p_send_after timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null then return; end if;
  if not private.push_prefs_aan(p_recipient, p_soort) then return; end if;
  if not exists (select 1 from public.push_tokens t where t.profile_id = p_recipient) then return; end if;
  insert into public.push_queue (company_id, recipient_id, soort, titel, body, data, send_after)
  values (p_company, p_recipient, p_soort, left(coalesce(p_titel,'Melding'),80), left(coalesce(p_body,''),180), coalesce(p_data,'{}'::jsonb), coalesce(p_send_after, now()));
end $$;

create or replace function private.push_tekst(p_body text, p_media jsonb) returns text
language sql immutable set search_path = '' as $
  select case
    when coalesce(p_body,'') <> '' then p_body
    when jsonb_typeof(p_media) = 'array' and jsonb_array_length(p_media) > 0 then 'Foto of video'
    else '' end;
$$;

-- Chatbericht: lid -> coach, coach -> lid.
create or replace function private.push_bij_bericht() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_coach uuid;
begin
  if new.sender_id = new.athlete_id then
    select coach_id into v_coach from public.profiles where id = new.athlete_id;
    perform private.queue_push(new.company_id, v_coach, 'bericht', private.naam_van(new.athlete_id), private.push_tekst(new.body, new.media), jsonb_build_object('athlete_id', new.athlete_id));
  else
    perform private.queue_push(new.company_id, new.athlete_id, 'bericht', coalesce(private.naam_van(new.sender_id), 'Je coach'), private.push_tekst(new.body, new.media), jsonb_build_object('athlete_id', new.athlete_id));
  end if;
  return new;
end $$;
drop trigger if exists messages_queue_push on public.messages;
create trigger messages_queue_push after insert on public.messages for each row execute function private.push_bij_bericht();

-- Dagreactie: lid -> coach, coach -> lid; de melding linkt naar de dag.
create or replace function private.push_bij_reactie() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_recipient uuid; v_datum date; v_titel text;
begin
  select workout_date into v_datum from public.workouts where id = new.workout_id;
  if new.author_id = new.athlete_id then
    select coach_id into v_recipient from public.profiles where id = new.athlete_id;
    v_titel := coalesce(private.naam_van(new.athlete_id), 'Je klant') || ' reageerde op een workout-dag';
  else
    v_recipient := new.athlete_id;
    v_titel := 'Reactie van ' || coalesce(private.naam_van(new.author_id), 'je coach');
  end if;
  perform private.queue_push(new.company_id, v_recipient, 'reactie', v_titel, private.push_tekst(new.body, new.media),
    jsonb_build_object('athlete_id', new.athlete_id, 'workout_id', new.workout_id, 'workout_date', v_datum));
  return new;
end $$;
drop trigger if exists workout_comments_queue_push on public.workout_comments;
create trigger workout_comments_queue_push after insert on public.workout_comments for each row execute function private.push_bij_reactie();

-- Groepschat: alle leden van de groep behalve de afzender.
create or replace function private.push_bij_groepsbericht() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_groep text; v_naam text; r record;
begin
  select name into v_groep from public.chat_groups where id = new.group_id;
  v_naam := coalesce(private.naam_van(new.sender_id), 'Iemand');
  for r in select profile_id from public.chat_group_members where group_id = new.group_id and profile_id <> new.sender_id loop
    perform private.queue_push(new.company_id, r.profile_id, 'bericht', coalesce(v_groep, 'Groepschat'), v_naam || ': ' || coalesce(new.body,''), jsonb_build_object('group_id', new.group_id));
  end loop;
  return new;
end $$;
drop trigger if exists chat_group_messages_queue_push on public.chat_group_messages;
create trigger chat_group_messages_queue_push after insert on public.chat_group_messages for each row execute function private.push_bij_groepsbericht();

-- Workout afgetekend door het lid zelf -> coach, één melding per sessie (10 min na het eerste blok).
create or replace function private.push_bij_result() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_coach uuid; v_titel text; v_datum date;
begin
  if new.status <> 'completed' then return new; end if;
  if (select auth.uid()) is distinct from new.athlete_id then return new; end if;
  select coach_id into v_coach from public.profiles where id = new.athlete_id;
  if v_coach is null then return new; end if;
  if exists (select 1 from public.push_queue q where q.recipient_id = v_coach and q.soort = 'workout'
             and (q.data->>'workout_id')::uuid = new.workout_id and q.created_at > now() - interval '12 hours') then
    return new;
  end if;
  select title, workout_date into v_titel, v_datum from public.workouts where id = new.workout_id;
  perform private.queue_push(new.company_id, v_coach, 'workout', coalesce(private.naam_van(new.athlete_id), 'Je klant') || ' heeft getraind',
    coalesce(nullif(v_titel,''), 'Workout afgetekend'), jsonb_build_object('athlete_id', new.athlete_id, 'workout_id', new.workout_id, 'workout_date', v_datum),
    now() + interval '10 minutes');
  return new;
end $$;
drop trigger if exists results_queue_push on public.results;
create trigger results_queue_push after insert or update on public.results for each row execute function private.push_bij_result();

-- Bezorging: direct de Edge Function aanroepen zodra een rij meteen mag (anders doet de cron het).
-- (Authorization-header = de publieke anon key van het project, zoals bij mail-queue-verwerken.)
create or replace function private.push_queue_verstuur() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.send_after <= now() then
    perform net.http_post(
      url := 'https://ujuvbxqgnxkyjcmcrqpw.supabase.co/functions/v1/push-send',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
      body := '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists push_queue_na_insert on public.push_queue;
create trigger push_queue_na_insert after insert on public.push_queue for each row execute function private.push_queue_verstuur();

-- Vangnet: elke minuut de wachtrij nalopen (uitgestelde en mislukte meldingen).
-- select cron.schedule('push-queue-verwerken', '* * * * *', $$select net.http_post(url:='https://ujuvbxqgnxkyjcmcrqpw.supabase.co/functions/v1/push-send', headers:='{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb, body:='{}'::jsonb);$$);
