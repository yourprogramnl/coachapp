-- Berichten pakket 2 (19 nov 2026): antwoorden op één bericht, een eigen bericht
-- bewerken of verwijderen, en spraakberichten.
--
-- reply_to  = het bericht waarop dit een antwoord is (zelfde gesprek); wordt leeg
--             als dat bericht later verwijderd wordt.
-- edited_at = moment van de laatste tekstwijziging; de database zet dit zelf.
-- Oudere app-versies lezen deze kolommen niet en blijven gewoon werken.
alter table public.messages
  add column if not exists reply_to uuid references public.messages(id) on delete set null,
  add column if not exists edited_at timestamptz;
comment on column public.messages.reply_to is 'Bericht waarop dit een antwoord is (zelfde gesprek); null = gewoon bericht.';
comment on column public.messages.edited_at is 'Laatste tekstwijziging door de afzender; gezet door de trigger messages_bewaak.';
create index if not exists messages_reply_to_idx on public.messages(reply_to) where reply_to is not null;

-- Ingelogde gebruikers mochten alleen de kolom read_at wijzigen. Voor bewerken
-- komt daar de tekst bij; de rest (afzender, gesprek, bijlagen) blijft dicht.
grant update (body) on public.messages to authenticated;

-- De afzender mag zijn eigen bericht wijzigen en verwijderen. (De bestaande policy
-- messages_update_read blijft: het lid en zijn coach zetten daarmee read_at.)
create policy messages_update_own on public.messages for update to authenticated
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));
create policy messages_delete_own on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()));

-- Bewaker. Policies kunnen niet per kolom onderscheid maken, dus zonder deze
-- trigger zou wie read_at mag zetten ook de tekst van een ander kunnen aanpassen.
--  * tekst of bijlagen wijzigen: alleen de afzender; edited_at wordt dan nu
--  * afzender, gesprek, bedrijf, tijdstip en reply_to liggen vast (reply_to mag
--    wel leeg worden: dat doet de database als het oorspronkelijke bericht weg is)
--  * een antwoord moet op een bericht uit hetzelfde gesprek zijn
-- Serverwerk zonder ingelogde gebruiker (geplande berichten, import) gaat door.
create or replace function private.messages_bewaak()
returns trigger language plpgsql set search_path to '' as $function$
declare v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    new.edited_at := null;
    if new.reply_to is not null and not exists (
      select 1 from public.messages m where m.id = new.reply_to and m.athlete_id = new.athlete_id) then
      new.reply_to := null;
    end if;
    return new;
  end if;
  if v_uid is not null and (
       new.sender_id is distinct from old.sender_id
    or new.athlete_id is distinct from old.athlete_id
    or new.company_id is distinct from old.company_id
    or new.created_at is distinct from old.created_at
    or (new.reply_to is distinct from old.reply_to and new.reply_to is not null)) then
    raise exception 'Afzender, gesprek en tijdstip van een bericht liggen vast' using errcode = '42501';
  end if;
  if new.body is distinct from old.body or new.media is distinct from old.media then
    if v_uid is not null and v_uid <> old.sender_id then
      raise exception 'Alleen de afzender kan een bericht wijzigen' using errcode = '42501';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $function$;

drop trigger if exists messages_bewaak on public.messages;
create trigger messages_bewaak before insert or update on public.messages
  for each row execute function private.messages_bewaak();

-- Pushmelding bij een bericht zonder tekst: een spraakbericht heet ook zo.
create or replace function private.push_tekst(p_body text, p_media jsonb)
returns text language sql immutable set search_path to '' as $function$
  select case
    when coalesce(p_body,'') <> '' then p_body
    when jsonb_typeof(p_media) = 'array' and jsonb_array_length(p_media) > 0 then
      case when not exists (select 1 from jsonb_array_elements(p_media) e where coalesce(e->>'kind','') <> 'audio')
        then 'Spraakbericht' else 'Foto of video' end
    else '' end;
$function$;
