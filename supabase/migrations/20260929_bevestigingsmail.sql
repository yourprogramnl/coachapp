-- Bevestigingsmail na een bestelling in de winkel (29 september 2026).
-- Wettelijk: bij verkoop aan consumenten moet de klant een bevestiging van de overeenkomst
-- krijgen op een "duurzame drager" (een mail), met de bedrijfsgegevens, de voorwaarden en de
-- bedenktijd. Zodra een bestelling op 'paid' komt, zet de database die mail in de wachtrij;
-- mail-send (event 'bestelling') maakt en verstuurt hem. Eén keer per bestelling.

create or replace function private.queue_bestelling_mail()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status <> 'paid' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'paid' then return new; end if;  -- alleen de overgang naar betaald
  if new.email is null or new.blog_program_id is null then return new; end if;  -- zonder adres of programma: interne melding regelt het
  if exists (select 1 from public.mail_queue q
              where q.event = 'bestelling' and (q.payload->>'order_id')::uuid = new.id) then
    return new;
  end if;
  insert into public.mail_queue (company_id, recipient_email, event, payload)
  values (new.company_id, new.email, 'bestelling', jsonb_build_object('order_id', new.id));
  return new;
end;
$$;

revoke all on function private.queue_bestelling_mail() from public, anon, authenticated;

drop trigger if exists shop_orders_bestelling_mail on public.shop_orders;
create trigger shop_orders_bestelling_mail
  after insert or update of status on public.shop_orders
  for each row execute function private.queue_bestelling_mail();

-- De rem op mails aan geïmporteerde (nog niet uitgenodigde) SugarWOD-leden mag de wettelijke
-- bevestigingen van de winkel niet tegenhouden: wie zelf bestelt of opzegt, krijgt zijn mail.
create or replace function private.blokkeer_mail_import_leden()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.event in ('bestelling', 'opzegging') then return new; end if;
  if coalesce(new.recipient_email, '') ilike '%.invalid'
     or (new.recipient_id is not null and exists (select 1 from public.sugarwod_athletes s where s.profile_id = new.recipient_id and s.uitgenodigd_at is null))
     or (new.recipient_email is not null and exists (select 1 from public.sugarwod_athletes s where lower(s.email) = lower(new.recipient_email) and s.uitgenodigd_at is null)) then
    new.status := 'skipped';
    new.last_error := 'geblokkeerd: import-lid nog niet uitgenodigd';
  end if;
  return new;
end $$;
